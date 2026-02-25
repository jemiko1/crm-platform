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
   * Called when a call ends with a non-ANSWERED disposition.
   * Classifies the reason using the queue's isAfterHoursQueue flag
   * (Asterisk routes out-of-hours calls to a dedicated "nowork" queue).
   */
  async handleNonAnsweredCall(sessionId: string): Promise<void> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { queue: { select: { id: true, isAfterHoursQueue: true } } },
    });
    if (!session || session.disposition === CallDisposition.ANSWERED) return;

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
    const pageSize = params.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where = params.status ? { status: params.status } : {};

    const [data, total] = await Promise.all([
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

    return { data, total, page, pageSize };
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
