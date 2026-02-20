import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CallbackRequestStatus,
  CallDisposition,
  MissedCallReason,
  MissedCallStatus,
} from '@prisma/client';
import { TelephonyWorktimeService } from './telephony-worktime.service';

@Injectable()
export class TelephonyCallbackService {
  private readonly logger = new Logger(TelephonyCallbackService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly worktimeService: TelephonyWorktimeService,
  ) {}

  async handleNonAnsweredCall(sessionId: string): Promise<void> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { queue: true },
    });
    if (!session || session.disposition === CallDisposition.ANSWERED) return;

    const reason = this.classifyMissedReason(session);
    const isOutOfHours = reason === MissedCallReason.OUT_OF_HOURS;

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

    // Create callback request based on the reason
    const shouldCreateCallback =
      reason === MissedCallReason.OUT_OF_HOURS ||
      reason === MissedCallReason.ABANDONED;

    if (shouldCreateCallback) {
      let scheduledAt: Date | null = null;

      if (isOutOfHours && session.queueId) {
        scheduledAt = await this.worktimeService.nextWorktimeStart(
          session.queueId,
          new Date(),
        );
      }

      await this.prisma.callbackRequest.upsert({
        where: { missedCallId: missedCall.id },
        create: {
          missedCallId: missedCall.id,
          status: scheduledAt
            ? CallbackRequestStatus.SCHEDULED
            : CallbackRequestStatus.PENDING,
          scheduledAt,
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
    queueId: string | null;
    queue: { worktimeConfig: unknown } | null;
  }): MissedCallReason {
    if (session.disposition === CallDisposition.ABANDONED) {
      return MissedCallReason.ABANDONED;
    }

    // If queue has worktime config, check if call was out of hours
    if (session.queue?.worktimeConfig) {
      const config = session.queue.worktimeConfig as { timezone?: string; windows?: unknown[] };
      if (config.timezone && Array.isArray(config.windows) && config.windows.length > 0) {
        return MissedCallReason.OUT_OF_HOURS;
      }
    }

    return MissedCallReason.NO_ANSWER;
  }
}
