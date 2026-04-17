import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron } from '@nestjs/schedule';
import { MissedCallStatus, Prisma } from '@prisma/client';

const MAX_ATTEMPTS = 3;
const EXPIRY_HOURS = 48;

@Injectable()
export class MissedCallsService {
  private readonly logger = new Logger(MissedCallsService.name);
  private isExpiring = false;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List missed calls with smart filtering:
   * - Deduplicates by callerNumber (most recent per number shown, with count)
   * - Excludes auto-resolved and expired
   * - Enriches with client name, queue name, claim info
   */
  async findAll(params: {
    status?: string;
    queueId?: string;
    claimedByMe?: string; // userId to filter "my claims"
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(params.pageSize ?? 25, 100);
    const skip = (page - 1) * pageSize;

    const where: Prisma.MissedCallWhereInput = {};

    if (params.status) {
      where.status = params.status as MissedCallStatus;
    } else {
      // Default: show actionable missed calls (not yet resolved/expired)
      where.status = { in: ['NEW', 'CLAIMED', 'ATTEMPTED'] };
    }

    if (params.queueId) {
      where.queueId = params.queueId;
    }

    if (params.claimedByMe) {
      where.claimedByUserId = params.claimedByMe;
    }

    // Filter out internal extension-to-extension calls — only show external inbound missed calls
    where.callSession = {
      direction: 'IN',
    };

    const [rawData, total] = await Promise.all([
      this.prisma.missedCall.findMany({
        where,
        include: {
          callSession: {
            select: {
              id: true,
              callerNumber: true,
              calleeNumber: true,
              direction: true,
              startAt: true,
              disposition: true,
            },
          },
          queue: { select: { id: true, name: true } },
          claimedBy: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
          callbackRequest: {
            select: { id: true, attemptsCount: true, lastAttemptAt: true, status: true },
          },
        },
        orderBy: [{ detectedAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.missedCall.count({ where }),
    ]);

    // Resolve client names
    const callerNumbers = [
      ...new Set(rawData.map((m) => m.callerNumber).filter(Boolean)),
    ];
    const clientNameMap = new Map<string, { name: string; id: string }>();
    if (callerNumbers.length > 0) {
      const clients = await this.prisma.client.findMany({
        where: {
          OR: [
            { primaryPhone: { in: callerNumbers } },
            { secondaryPhone: { in: callerNumbers } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          primaryPhone: true,
          secondaryPhone: true,
        },
      });
      for (const c of clients) {
        const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
        if (name) {
          if (c.primaryPhone) clientNameMap.set(c.primaryPhone, { name, id: c.id });
          if (c.secondaryPhone) clientNameMap.set(c.secondaryPhone, { name, id: c.id });
        }
      }
    }

    // Count duplicate missed calls per callerNumber in the actionable window
    const duplicateCounts = new Map<string, number>();
    if (callerNumbers.length > 0) {
      const counts = await this.prisma.missedCall.groupBy({
        by: ['callerNumber'],
        where: {
          callerNumber: { in: callerNumbers },
          status: { in: ['NEW', 'CLAIMED', 'ATTEMPTED'] },
        },
        _count: { id: true },
      });
      for (const c of counts) {
        duplicateCounts.set(c.callerNumber, c._count.id);
      }
    }

    const totalPages = Math.ceil(total / pageSize);

    const data = rawData.map((m) => {
      const claimedByName = m.claimedBy?.employee
        ? [m.claimedBy.employee.firstName, m.claimedBy.employee.lastName]
            .filter(Boolean)
            .join(' ')
        : m.claimedBy?.email ?? null;

      const clientInfo = clientNameMap.get(m.callerNumber);

      return {
        id: m.id,
        callSessionId: m.callSession?.id ?? null,
        callerNumber: m.callerNumber,
        clientName: clientInfo?.name ?? null,
        clientId: clientInfo?.id ?? null,
        queueId: m.queue?.id ?? null,
        queueName: m.queue?.name ?? null,
        reason: m.reason,
        status: m.status,
        detectedAt: m.detectedAt.toISOString(),
        direction: m.callSession?.direction ?? null,
        disposition: m.callSession?.disposition ?? null,
        claimedByUserId: m.claimedByUserId,
        claimedByName,
        claimedAt: m.claimedAt?.toISOString() ?? null,
        attemptsCount: m.callbackRequest?.attemptsCount ?? 0,
        lastAttemptAt: m.callbackRequest?.lastAttemptAt?.toISOString() ?? null,
        resolvedAt: m.resolvedAt?.toISOString() ?? null,
        notes: m.notes,
        missedCallCount: duplicateCounts.get(m.callerNumber) ?? 1,
      };
    });

    return {
      data,
      meta: { page, pageSize, total, totalPages },
    };
  }

  /**
   * Claim a missed call — locks it to the operator.
   * Uses atomic updateMany with WHERE guard to prevent race conditions.
   */
  async claim(missedCallId: string, userId: string) {
    const mc = await this.prisma.missedCall.findUnique({
      where: { id: missedCallId },
    });
    if (!mc) throw new NotFoundException('Missed call not found');

    // Atomic: only succeeds if unclaimed or already claimed by same user
    const result = await this.prisma.missedCall.updateMany({
      where: {
        id: missedCallId,
        OR: [
          { claimedByUserId: null },
          { claimedByUserId: userId },
        ],
        status: { in: [MissedCallStatus.NEW, MissedCallStatus.CLAIMED, MissedCallStatus.ATTEMPTED] },
      },
      data: {
        claimedByUserId: userId,
        claimedAt: new Date(),
        status: MissedCallStatus.CLAIMED,
      },
    });

    if (result.count === 0) {
      throw new ConflictException('Already claimed by another operator');
    }

    return { id: missedCallId, status: 'CLAIMED', claimedByUserId: userId };
  }

  /**
   * Record a callback attempt
   */
  async recordAttempt(missedCallId: string, userId: string, note?: string) {
    const mc = await this.prisma.missedCall.findUnique({
      where: { id: missedCallId },
      include: { callbackRequest: true },
    });
    if (!mc) throw new NotFoundException('Missed call not found');

    const newAttempts = (mc.callbackRequest?.attemptsCount ?? 0) + 1;
    const now = new Date();

    // Update or create callback request to track attempts
    await this.prisma.callbackRequest.upsert({
      where: { missedCallId },
      create: {
        missedCallId,
        status: 'ATTEMPTING',
        attemptsCount: 1,
        lastAttemptAt: now,
        outcome: note ?? null,
      },
      update: {
        attemptsCount: { increment: 1 },
        lastAttemptAt: now,
        status: 'ATTEMPTING',
        outcome: note ?? null,
      },
    });

    // Auto-claim for the user who is attempting (tracks "Last Attempted By")
    // Only auto-claim if unclaimed or already claimed by the same user — respects existing claims
    if (!mc.claimedByUserId || mc.claimedByUserId === userId) {
      await this.prisma.missedCall.update({
        where: { id: missedCallId },
        data: {
          claimedByUserId: userId,
          claimedAt: new Date(),
        },
      });
    }

    // Keep status as ATTEMPTED regardless of attempt count.
    // HANDLED is reserved for calls that were actually answered (via autoResolveByPhone)
    // or manually resolved. Reaching MAX_ATTEMPTS no longer auto-resolves — the 48h
    // expiry cron will move unresolved rows to EXPIRED.
    await this.prisma.missedCall.update({
      where: { id: missedCallId },
      data: {
        status: MissedCallStatus.ATTEMPTED,
        notes: note
          ? `${mc.notes ? mc.notes + '\n' : ''}${note}`
          : mc.notes,
      },
    });

    // If max attempts reached, mark the callback as FAILED but keep the missed call
    // visible in the worklist. Operators can still resolve it manually if they reach
    // the customer, or it will expire after 48h.
    if (newAttempts >= MAX_ATTEMPTS) {
      await this.prisma.callbackRequest.update({
        where: { missedCallId },
        data: { status: 'FAILED' },
      });
      return { status: 'MAX_ATTEMPTS_REACHED', attempts: newAttempts };
    }

    return { status: 'ATTEMPTED', attempts: newAttempts };
  }

  /**
   * Manually resolve a missed call
   */
  async resolve(missedCallId: string, note?: string) {
    const mc = await this.prisma.missedCall.findUnique({
      where: { id: missedCallId },
    });
    if (!mc) throw new NotFoundException('Missed call not found');

    await this.prisma.missedCall.update({
      where: { id: missedCallId },
      data: {
        status: MissedCallStatus.HANDLED,
        resolvedAt: new Date(),
        notes: note
          ? `${mc.notes ? mc.notes + '\n' : ''}${note}`
          : mc.notes,
      },
    });

    // Also update callback request if exists
    await this.prisma.callbackRequest.updateMany({
      where: { missedCallId, status: { not: 'DONE' } },
      data: { status: 'DONE' },
    });

    return { status: 'RESOLVED' };
  }

  /**
   * Ignore a missed call with reason
   */
  async ignore(missedCallId: string, reason: string) {
    const mc = await this.prisma.missedCall.findUnique({
      where: { id: missedCallId },
    });
    if (!mc) throw new NotFoundException('Missed call not found');

    await this.prisma.missedCall.update({
      where: { id: missedCallId },
      data: {
        status: MissedCallStatus.IGNORED,
        notes: reason,
      },
    });

    await this.prisma.callbackRequest.updateMany({
      where: { missedCallId, status: { not: 'DONE' } },
      data: { status: 'CANCELED' },
    });

    return { status: 'IGNORED' };
  }

  /**
   * Auto-resolve missed calls when a successful call occurs with the same number.
   * Called from the ingestion pipeline on ANSWERED call_end.
   */
  async autoResolveByPhone(
    callerNumber: string,
    resolvingCallSessionId: string,
  ): Promise<number> {
    const pendingMissedCalls = await this.prisma.missedCall.findMany({
      where: {
        callerNumber,
        status: { in: ['NEW', 'CLAIMED', 'ATTEMPTED'] },
      },
      select: { id: true },
    });

    if (pendingMissedCalls.length === 0) return 0;

    const ids = pendingMissedCalls.map((m) => m.id);
    const now = new Date();

    await this.prisma.missedCall.updateMany({
      where: { id: { in: ids } },
      data: {
        status: MissedCallStatus.HANDLED,
        resolvedByCallSessionId: resolvingCallSessionId,
        resolvedAt: now,
      },
    });

    // Also close any open callback requests
    await this.prisma.callbackRequest.updateMany({
      where: {
        missedCallId: { in: ids },
        status: { notIn: ['DONE', 'CANCELED'] },
      },
      data: { status: 'DONE' },
    });

    this.logger.log(
      `Auto-resolved ${ids.length} missed calls for ${callerNumber} via session ${resolvingCallSessionId}`,
    );

    return ids.length;
  }

  /**
   * Expire missed calls older than 48 hours that are still actionable.
   * Runs every 30 minutes.
   */
  @Cron('0 */30 * * * *')
  async expireOldMissedCalls(): Promise<void> {
    if (this.isExpiring) return;
    this.isExpiring = true;

    try {
      const cutoff = new Date(Date.now() - EXPIRY_HOURS * 60 * 60 * 1000);

      // Find IDs first, then update — avoids race with the callback cancellation
      const toExpire = await this.prisma.missedCall.findMany({
        where: {
          status: { in: ['NEW', 'ATTEMPTED'] },
          detectedAt: { lt: cutoff },
        },
        select: { id: true },
      });

      if (toExpire.length === 0) return;

      const ids = toExpire.map((m) => m.id);

      await this.prisma.missedCall.updateMany({
        where: { id: { in: ids } },
        data: { status: MissedCallStatus.EXPIRED },
      });

      // Also cancel their open callback requests
      await this.prisma.callbackRequest.updateMany({
        where: {
          missedCallId: { in: ids },
          status: { notIn: ['DONE', 'CANCELED'] },
        },
        data: { status: 'CANCELED' },
      });

      this.logger.log(`Expired ${ids.length} missed calls older than ${EXPIRY_HOURS}h`);
    } catch (err: any) {
      this.logger.error(`Expiry cron failed: ${err.message}`);
    } finally {
      this.isExpiring = false;
    }
  }
}
