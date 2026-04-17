import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CallbackRequestStatus,
  CallDisposition,
  MissedCallReason,
  MissedCallStatus,
} from '@prisma/client';

@Injectable()
export class TelephonyCallbackService {
  private readonly logger = new Logger(TelephonyCallbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called when an INBOUND call ends with a non-ANSWERED disposition.
   * Classifies the reason using the queue's isAfterHoursQueue flag
   * (Asterisk routes out-of-hours calls to a dedicated "nowork" queue).
   *
   * Outbound calls that fail must NOT flow through here — they'd create
   * spurious MissedCall rows polluting the worklist. The caller in
   * telephony-ingestion.service.ts routes OUT calls to
   * MissedCallsService.recordOutboundAttempt instead. We also guard here
   * as defense in depth.
   */
  async handleNonAnsweredCall(sessionId: string): Promise<void> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { queue: { select: { id: true, isAfterHoursQueue: true } } },
    });
    if (!session || session.disposition === CallDisposition.ANSWERED) return;
    // Defense in depth — do not create MissedCall rows for outbound calls.
    if (session.direction !== 'IN') return;

    const reason = this.classifyMissedReason(session);

    const missedCall = await this.prisma.missedCall.upsert({
      where: { callSessionId: sessionId },
      create: {
        callSessionId: sessionId,
        reason,
        queueId: session.queueId,
        userId: session.assignedUserId,
        callerNumber: session.callerNumber,
      },
      update: {},
    });

    const shouldCreateCallback =
      reason === MissedCallReason.OUT_OF_HOURS ||
      reason === MissedCallReason.ABANDONED;

    if (shouldCreateCallback) {
      await this.prisma.callbackRequest.upsert({
        where: { missedCallId: missedCall.id },
        create: {
          missedCallId: missedCall.id,
          status: CallbackRequestStatus.PENDING,
        },
        update: {},
      });

      this.logger.log(
        `Callback created for missed call ${missedCall.id}, reason=${reason}`,
      );
    }
  }

  async handleCallback(
    callbackId: string,
    outcome: string,
  ): Promise<void> {
    const callback = await this.prisma.callbackRequest.findUnique({
      where: { id: callbackId },
    });
    if (!callback) throw new NotFoundException('Callback not found');

    const isDone = outcome === 'completed' || outcome === 'resolved';

    await this.prisma.callbackRequest.update({
      where: { id: callbackId },
      data: {
        status: isDone ? CallbackRequestStatus.DONE : CallbackRequestStatus.ATTEMPTING,
        attemptsCount: { increment: 1 },
        lastAttemptAt: new Date(),
        outcome,
      },
    });

    if (isDone) {
      await this.prisma.missedCall.update({
        where: { id: callback.missedCallId },
        data: { status: MissedCallStatus.HANDLED },
      });
    }
  }

  async getCallbackQueue(params: {
    status?: CallbackRequestStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 25, 100);
    const skip = (page - 1) * pageSize;

    const where = params.status ? { status: params.status } : {};

    const [rawData, total] = await Promise.all([
      this.prisma.callbackRequest.findMany({
        where,
        include: {
          missedCall: {
            include: {
              callSession: {
                select: {
                  id: true,
                  callerNumber: true,
                  startAt: true,
                  direction: true,
                },
              },
              queue: { select: { id: true, name: true } },
            },
          },
          assignedTo: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
        orderBy: [
          { scheduledAt: 'asc' },
          { createdAt: 'asc' },
        ],
        skip,
        take: pageSize,
      }),
      this.prisma.callbackRequest.count({ where }),
    ]);

    // Resolve client names
    const callerNumbers = [
      ...new Set(
        rawData
          .map((r) => r.missedCall?.callSession?.callerNumber)
          .filter((n): n is string => !!n),
      ),
    ];
    const clientNameMap = new Map<string, string>();
    if (callerNumbers.length > 0) {
      const clients = await this.prisma.client.findMany({
        where: {
          OR: [
            { primaryPhone: { in: callerNumbers } },
            { secondaryPhone: { in: callerNumbers } },
          ],
        },
        select: { firstName: true, lastName: true, primaryPhone: true, secondaryPhone: true },
      });
      for (const c of clients) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
        if (name) {
          if (c.primaryPhone) clientNameMap.set(c.primaryPhone, name);
          if (c.secondaryPhone) clientNameMap.set(c.secondaryPhone, name);
        }
      }
    }

    const totalPages = Math.ceil(total / pageSize);

    const data = rawData.map((r) => {
      const callerNumber = r.missedCall?.callSession?.callerNumber ?? null;
      const assignedName = r.assignedTo?.employee
        ? [r.assignedTo.employee.firstName, r.assignedTo.employee.lastName]
            .filter(Boolean)
            .join(' ')
        : r.assignedTo?.email ?? null;

      return {
        id: r.id,
        callerNumber,
        clientName: callerNumber ? clientNameMap.get(callerNumber) ?? null : null,
        queueId: r.missedCall?.queue?.id ?? null,
        queueName: r.missedCall?.queue?.name ?? null,
        status: r.status,
        reason: r.missedCall?.reason ?? null,
        createdAt: r.createdAt.toISOString(),
        scheduledAt: r.scheduledAt?.toISOString() ?? null,
        completedAt: r.status === CallbackRequestStatus.DONE ? r.updatedAt.toISOString() : null,
        attemptsCount: r.attemptsCount,
        lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
        assignedToName: assignedName,
        missedCallId: r.missedCallId,
        callSessionId: r.missedCall?.callSession?.id ?? null,
        missedAt: r.missedCall?.callSession?.startAt?.toISOString() ?? null,
      };
    });

    return {
      data,
      meta: { page, pageSize, total, totalPages },
    };
  }

  private classifyMissedReason(session: {
    disposition: CallDisposition | null;
    queue: { isAfterHoursQueue: boolean } | null;
  }): MissedCallReason {
    if (session.disposition === CallDisposition.ABANDONED) {
      return MissedCallReason.ABANDONED;
    }

    if (session.queue?.isAfterHoursQueue) {
      return MissedCallReason.OUT_OF_HOURS;
    }

    return MissedCallReason.NO_ANSWER;
  }
}
