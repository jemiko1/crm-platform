import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneResolverService } from '../../common/phone-resolver/phone-resolver.service';
import { Cron } from '@nestjs/schedule';
import {
  CallbackRequestStatus,
  CallDirection,
  CallDisposition,
  MissedCallStatus,
  Prisma,
} from '@prisma/client';

const MAX_ATTEMPTS = 3;
const EXPIRY_HOURS = 48;
/**
 * Minimum seconds an outbound call must ring before it counts as a real attempt.
 * Prevents button-click-cancel, immediate-hangup, and congestion errors from
 * inflating the attempt counter.
 */
const MIN_ATTEMPT_RING_SECONDS = 10;
/**
 * How far back to look for pending missed calls when matching outbound attempts.
 * Keeps the scan bounded; missed calls older than this will have expired anyway.
 */
const ATTEMPT_MATCH_WINDOW_HOURS = 48;

@Injectable()
export class MissedCallsService {
  private readonly logger = new Logger(MissedCallsService.name);
  private isExpiring = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneResolver: PhoneResolverService,
  ) {}

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

    // Step 1: Get the IDs of the most recent MissedCall per callerNumber
    // (deduplication). Using DISTINCT ON, which is PostgreSQL-specific. We
    // query IDs first, then fetch full records with includes for proper types.
    //
    // We can't build DISTINCT ON via Prisma's findMany because its `distinct`
    // option locks the outer ORDER BY to the distinct column — breaks the
    // "most recent first" sort across numbers. Raw SQL lets us do both:
    // pick the freshest row per number, then sort globally by that row's
    // detectedAt.
    const statusFilter: MissedCallStatus[] = params.status
      ? [params.status as MissedCallStatus]
      : [MissedCallStatus.NEW, MissedCallStatus.CLAIMED, MissedCallStatus.ATTEMPTED];

    const queueCondition = params.queueId
      ? Prisma.sql`AND mc."queueId" = ${params.queueId}`
      : Prisma.empty;

    const claimedByCondition = params.claimedByMe
      ? Prisma.sql`AND mc."claimedByUserId" = ${params.claimedByMe}`
      : Prisma.empty;

    // Get distinct caller numbers' latest MissedCall IDs, ordered newest first,
    // paginated. The inner query picks one row per number (the most recent).
    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM (
        SELECT DISTINCT ON (mc."callerNumber")
          mc.id, mc."detectedAt"
        FROM "MissedCall" mc
        JOIN "CallSession" cs ON cs.id = mc."callSessionId"
        WHERE mc.status = ANY(${statusFilter}::"MissedCallStatus"[])
          AND cs.direction = 'IN'
          ${queueCondition}
          ${claimedByCondition}
        ORDER BY mc."callerNumber", mc."detectedAt" DESC
      ) dedup
      ORDER BY dedup."detectedAt" DESC
      LIMIT ${pageSize} OFFSET ${skip}
    `);

    // Total = count of DISTINCT callerNumbers matching the filter
    const totalRows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT COUNT(DISTINCT mc."callerNumber") as count
      FROM "MissedCall" mc
      JOIN "CallSession" cs ON cs.id = mc."callSessionId"
      WHERE mc.status = ANY(${statusFilter}::"MissedCallStatus"[])
        AND cs.direction = 'IN'
        ${queueCondition}
        ${claimedByCondition}
    `);
    const total = Number(totalRows[0]?.count ?? 0);

    const ids = idRows.map((r) => r.id);
    const rawDataUnsorted = ids.length
      ? await this.prisma.missedCall.findMany({
          where: { id: { in: ids } },
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
        })
      : [];

    // Preserve the ordering from the raw query (newest detectedAt first)
    const byId = new Map(rawDataUnsorted.map((r) => [r.id, r]));
    const rawData = ids.map((id) => byId.get(id)).filter((r): r is NonNullable<typeof r> => !!r);

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
   * Mark a missed call as "being attempted" by an operator. Called from the
   * frontend when the operator clicks the Call button — BEFORE any actual
   * phone call has been placed. This claims the row so other operators don't
   * also try to call the same customer, and puts the CallbackRequest into
   * ATTEMPTING state. It does NOT increment the attempt counter — that
   * happens later via recordOutboundAttempt() when a real outbound
   * CallSession for this phone number ends.
   */
  async markAttempting(missedCallId: string, userId: string, note?: string) {
    const mc = await this.prisma.missedCall.findUnique({
      where: { id: missedCallId },
      include: { callbackRequest: true },
    });
    if (!mc) throw new NotFoundException('Missed call not found');

    // Upsert CallbackRequest into ATTEMPTING state — NO counter bump here
    await this.prisma.callbackRequest.upsert({
      where: { missedCallId },
      create: {
        missedCallId,
        status: CallbackRequestStatus.ATTEMPTING,
        attemptsCount: 0,
        outcome: note ?? null,
      },
      update: {
        status: CallbackRequestStatus.ATTEMPTING,
        outcome: note ?? mc.callbackRequest?.outcome ?? null,
      },
    });

    // Claim the missed call for this user if unclaimed or already theirs
    if (!mc.claimedByUserId || mc.claimedByUserId === userId) {
      await this.prisma.missedCall.update({
        where: { id: missedCallId },
        data: {
          claimedByUserId: userId,
          claimedAt: new Date(),
          status: MissedCallStatus.ATTEMPTED,
          notes: note
            ? `${mc.notes ? mc.notes + '\n' : ''}${note}`
            : mc.notes,
        },
      });
    } else {
      // Someone else has claimed it — just update status + notes, preserve claim
      await this.prisma.missedCall.update({
        where: { id: missedCallId },
        data: {
          status: MissedCallStatus.ATTEMPTED,
          notes: note
            ? `${mc.notes ? mc.notes + '\n' : ''}${note}`
            : mc.notes,
        },
      });
    }

    return {
      status: 'ATTEMPTING',
      attempts: mc.callbackRequest?.attemptsCount ?? 0,
    };
  }

  /**
   * Record a REAL outbound-call attempt, driven by the ingestion pipeline
   * when an outbound CallSession ends. Only counts the attempt if:
   *   - The call's direction is OUT
   *   - It rang for at least MIN_ATTEMPT_RING_SECONDS (so button-click-cancel
   *     and immediate hangups don't inflate the counter)
   *   - It was not ANSWERED (answered calls auto-resolve via autoResolveByPhone)
   *   - It was not FAILED (network/congestion error, not operator action)
   *
   * Matches the callee number against pending MissedCalls from the last
   * ATTEMPT_MATCH_WINDOW_HOURS hours and increments attemptsCount for each
   * match. After MAX_ATTEMPTS real attempts, flips the CallbackRequest to
   * FAILED but keeps the MissedCall visible in the worklist.
   *
   * Idempotency: ingestion pipeline prevents double-firing by only calling
   * this on the first call_end event per session (guarded via endAt check
   * in TelephonyIngestionService.handleCallEnd).
   */
  async recordOutboundAttempt(sessionId: string): Promise<void> {
    const session = await this.prisma.callSession.findUnique({
      where: { id: sessionId },
      include: { callMetrics: true },
    });
    if (!session) return;
    if (session.direction !== CallDirection.OUT) return;
    if (!session.calleeNumber) return;
    // ANSWERED is handled by autoResolveByPhone — not an attempt
    if (session.disposition === CallDisposition.ANSWERED) return;
    // FAILED = network/congestion, not a real operator attempt
    if (session.disposition === CallDisposition.FAILED) return;

    const ringSeconds = session.callMetrics?.ringSeconds ?? 0;
    if (ringSeconds < MIN_ATTEMPT_RING_SECONDS) {
      this.logger.debug(
        `Skipping attempt count for session ${sessionId}: ring=${ringSeconds}s < ${MIN_ATTEMPT_RING_SECONDS}s threshold`,
      );
      return;
    }

    const windowStart = new Date(
      Date.now() - ATTEMPT_MATCH_WINDOW_HOURS * 3600 * 1000,
    );

    // Phone numbers can have different formats between the stored missed call
    // (typically "599732352" from Asterisk's Caller-ID) and the outbound
    // dialed number (may be "599732352", "995599732352", "+995599732352",
    // or carry a trunk prefix like "9599732352"). Match on the last 9 digits
    // (PhoneResolverService.localDigits) which normalizes all Georgian forms.
    const dialedLocal = this.phoneResolver.localDigits(session.calleeNumber);
    if (!dialedLocal || dialedLocal.length < 9) {
      this.logger.debug(
        `Skipping attempt count for session ${sessionId}: calleeNumber ${session.calleeNumber} is too short to match`,
      );
      return;
    }

    // Use the trailing 9 digits as the matching suffix. contains query
    // on callerNumber matches both "599732352" and "995599732352" etc.
    const missedCalls = await this.prisma.missedCall.findMany({
      where: {
        callerNumber: { endsWith: dialedLocal },
        status: { in: [MissedCallStatus.NEW, MissedCallStatus.CLAIMED, MissedCallStatus.ATTEMPTED] },
        callSession: { direction: CallDirection.IN },
        detectedAt: { gte: windowStart },
      },
      include: { callbackRequest: true },
    });

    if (missedCalls.length === 0) {
      this.logger.debug(
        `No pending missed calls match outbound to ${session.calleeNumber} (local=${dialedLocal}) for session ${sessionId}`,
      );
      return;
    }

    this.logger.log(
      `Found ${missedCalls.length} pending missed call(s) matching outbound to ${session.calleeNumber} (local=${dialedLocal}); ring=${ringSeconds}s`,
    );

    const lastAttemptAt = session.endAt ?? new Date();
    const attempter = session.assignedUserId;

    for (const mc of missedCalls) {
      const currentAttempts = mc.callbackRequest?.attemptsCount ?? 0;
      const newAttempts = currentAttempts + 1;

      await this.prisma.callbackRequest.upsert({
        where: { missedCallId: mc.id },
        create: {
          missedCallId: mc.id,
          status:
            newAttempts >= MAX_ATTEMPTS
              ? CallbackRequestStatus.FAILED
              : CallbackRequestStatus.ATTEMPTING,
          attemptsCount: 1,
          lastAttemptAt,
          outcome: `Ring ${Math.round(ringSeconds)}s, disposition ${session.disposition ?? 'unknown'}`,
        },
        update: {
          attemptsCount: { increment: 1 },
          lastAttemptAt,
          status:
            newAttempts >= MAX_ATTEMPTS
              ? CallbackRequestStatus.FAILED
              : CallbackRequestStatus.ATTEMPTING,
          outcome: `Ring ${Math.round(ringSeconds)}s, disposition ${session.disposition ?? 'unknown'}`,
        },
      });

      // Update MissedCall: status ATTEMPTED, claim by operator if unclaimed
      const shouldClaim = !mc.claimedByUserId && attempter;
      await this.prisma.missedCall.update({
        where: { id: mc.id },
        data: {
          status: MissedCallStatus.ATTEMPTED,
          ...(shouldClaim
            ? { claimedByUserId: attempter, claimedAt: new Date() }
            : {}),
        },
      });

      this.logger.log(
        `Counted outbound attempt for missed call ${mc.id}: ${newAttempts}/${MAX_ATTEMPTS} (session ${sessionId}, ring ${ringSeconds}s)`,
      );
    }
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
