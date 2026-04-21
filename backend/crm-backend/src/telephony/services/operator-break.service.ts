import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';

/**
 * Operator break sessions — start, end, history, and automatic-close.
 *
 * Business rules (decided April 2026, see audit/CURRENT_WORKSTREAM.md):
 *  - Only the owning operator can start/end their break. No manager
 *    force-end. "Correct logging is the control mechanism."
 *  - Cannot start a break while on an active call.
 *  - One active break per user at a time.
 *  - Auto-close at COMPANY_WORK_END_HOUR (default 19) for operators who
 *    forget — marks the session as system-ended so reports distinguish
 *    operator-initiated closes from forgotten ones.
 *  - Defensive 12h hard cap in case the company-hours cron misses a
 *    window (operator started a break at 19:30, for example).
 *
 * Softphone behavior (handled client-side, not here): during an active
 * break the softphone fully unregisters from SIP, so queue dispatch and
 * direct calls both fail "unreachable". End re-registers. See
 * docs/TELEPHONY_INTEGRATION.md.
 */
@Injectable()
export class OperatorBreakService {
  private readonly logger = new Logger(OperatorBreakService.name);
  private readonly companyWorkEndHour: number;
  private readonly hardCapHours = 12;
  // Cron overlap guard — prevents a long-running autoCloseStaleBreaks
  // from overlapping with itself if a future DB grows candidate count
  // past the 30-min tick budget. Mirrors the pattern in
  // escalation.service and quality-pipeline.service (see CLAUDE.md
  // cron-jobs table — "Overlap-guarded").
  private autoCloseRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateManager: TelephonyStateManager,
  ) {
    const parsed = parseInt(process.env.COMPANY_WORK_END_HOUR ?? '19', 10);
    this.companyWorkEndHour =
      Number.isInteger(parsed) && parsed >= 0 && parsed < 24 ? parsed : 19;
  }

  /**
   * Start a break for the given user. The caller is responsible for
   * verifying authorization (the controller should use the user from the
   * JWT as the target — operators can't start breaks for others).
   *
   * @throws ConflictException if the user already has an active break
   * @throws BadRequestException if the user has no extension, or is on
   *         an active call
   */
  async start(userId: string): Promise<{
    id: string;
    startedAt: Date;
    extension: string;
  }> {
    // Resolve extension snapshot (audit field on the break row). If the
    // user has no extension, break makes no sense.
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: userId },
      select: { extension: true, isActive: true },
    });
    if (!ext || !ext.isActive) {
      throw new BadRequestException(
        'No active telephony extension linked to this user',
      );
    }

    // Block start during active call. The TelephonyStateManager tracks
    // presence per user from AMI events; ON_CALL and RINGING both imply
    // the operator is engaged on a call.
    const agentState = this.stateManager.getAgentState(userId);
    if (
      agentState &&
      (agentState.presence === 'ON_CALL' || agentState.presence === 'RINGING')
    ) {
      throw new BadRequestException(
        'Cannot start a break during an active call. End the call first.',
      );
    }

    // Enforce one-active-break-per-user. First line of defense: check
    // then create. Second line: partial unique index on
    // `(userId) WHERE endedAt IS NULL` (see migration). The index
    // catches the TOCTOU race where two concurrent start() calls both
    // pass the check — one succeeds, the other gets P2002. We translate
    // to the same ConflictException the pre-check throws.
    const existing = await this.prisma.operatorBreakSession.findFirst({
      where: { userId, endedAt: null },
    });
    if (existing) {
      throw new ConflictException(
        'This user already has an active break session',
      );
    }

    try {
      const session = await this.prisma.operatorBreakSession.create({
        data: {
          userId,
          extension: ext.extension,
        },
        select: { id: true, startedAt: true, extension: true },
      });

      this.logger.log(
        `Break started: user=${userId} ext=${ext.extension} session=${session.id}`,
      );

      return session;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        // Partial unique index fired — another request won the race.
        throw new ConflictException(
          'This user already has an active break session',
        );
      }
      throw err;
    }
  }

  /**
   * End the user's active break. Idempotent — if no active break exists,
   * returns null without error. Prevents accidental double-close from
   * the softphone UI clicking twice.
   *
   * Race-safe: uses `updateMany WHERE endedAt IS NULL` so if the cron
   * (or a concurrent click) ended the session between our findFirst and
   * the update, we return null rather than overwriting the existing
   * close metadata (`isAutoEnded`, `autoEndReason`, `durationSec`).
   * Mirrors the symmetric guard in `autoCloseStaleBreaks`.
   */
  async endForUser(userId: string): Promise<{
    id: string;
    startedAt: Date;
    endedAt: Date;
    durationSec: number;
  } | null> {
    const active = await this.prisma.operatorBreakSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
    if (!active) return null;

    const endedAt = new Date();
    const durationSec = Math.floor(
      (endedAt.getTime() - active.startedAt.getTime()) / 1000,
    );

    // Stale-guarded update — only write if endedAt is still null. If
    // the cron auto-closed it between our findFirst and here, count=0
    // and we treat that as "already closed, no-op" (idempotent).
    const result = await this.prisma.operatorBreakSession.updateMany({
      where: { id: active.id, endedAt: null },
      data: { endedAt, durationSec },
    });

    if (result.count === 0) {
      this.logger.debug(
        `Break end skipped for user=${userId} session=${active.id}: already closed (likely by cron)`,
      );
      return null;
    }

    this.logger.log(
      `Break ended: user=${userId} session=${active.id} duration=${durationSec}s`,
    );

    return {
      id: active.id,
      startedAt: active.startedAt,
      endedAt,
      durationSec,
    };
  }

  /**
   * Get the caller's own active break session (or null). Used by the
   * softphone to restore the countdown after a reload.
   */
  async getMyActive(userId: string) {
    return this.prisma.operatorBreakSession.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Manager view: all currently-active break sessions across all
   * operators. Returns enriched data (user name + extension) for direct
   * rendering in the "Breaks" tab.
   */
  async getAllActive() {
    const rows = await this.prisma.operatorBreakSession.findMany({
      where: { endedAt: null },
      orderBy: { startedAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.employee
        ? [r.user.employee.firstName, r.user.employee.lastName]
            .filter(Boolean)
            .join(' ')
        : r.user.email,
      email: r.user.email,
      extension: r.extension,
      startedAt: r.startedAt,
      elapsedSec: Math.floor((Date.now() - r.startedAt.getTime()) / 1000),
    }));
  }

  /**
   * Paginated history with optional filters. Managers use this for the
   * historical table under the Breaks tab.
   */
  async getHistory(params: {
    userId?: string;
    from?: Date;
    to?: Date;
    includeAutoEnded?: boolean;
    page?: number;
    pageSize?: number;
  }) {
    const page = params.page ?? 1;
    const pageSize = Math.min(Math.max(params.pageSize ?? 50, 1), 200);
    const skip = (page - 1) * pageSize;

    // Only return finished rows (endedAt IS NOT NULL). Active rows belong
    // in getAllActive().
    const where: Record<string, unknown> = { endedAt: { not: null } };
    if (params.userId) where.userId = params.userId;
    if (params.from) where.startedAt = { gte: params.from };
    if (params.to) {
      where.startedAt = {
        ...((where.startedAt as Record<string, unknown>) ?? {}),
        lte: params.to,
      };
    }
    if (params.includeAutoEnded === false) where.isAutoEnded = false;

    const [rows, total] = await Promise.all([
      this.prisma.operatorBreakSession.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
        },
      }),
      this.prisma.operatorBreakSession.count({ where }),
    ]);

    const data = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.employee
        ? [r.user.employee.firstName, r.user.employee.lastName]
            .filter(Boolean)
            .join(' ')
        : r.user.email,
      email: r.user.email,
      extension: r.extension,
      startedAt: r.startedAt,
      endedAt: r.endedAt,
      durationSec: r.durationSec,
      isAutoEnded: r.isAutoEnded,
      autoEndReason: r.autoEndReason,
    }));

    return {
      data,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * Cron: auto-close active breaks that should have ended by now.
   *
   * Runs every 30 minutes. Two conditions trigger a close:
   *  1. Current time is past today's COMPANY_WORK_END_HOUR AND the
   *     session started earlier today (the "forgot to end break at
   *     end of shift" case). autoEndReason = 'company_hours_end'.
   *  2. Session started > 12 hours ago (defensive cap for any break
   *     that escaped the company-hours check, e.g. started after
   *     19:00). autoEndReason = 'max_duration_exceeded'.
   *
   * Race-safe: each candidate is closed via `updateMany` with a
   * `endedAt: null` predicate, so a concurrent operator-initiated
   * end doesn't double-close.
   */
  @Cron('*/30 * * * *')
  async autoCloseStaleBreaks(): Promise<void> {
    // Overlap guard — if a prior tick is still running (large active
    // break count, slow DB), skip this one rather than stacking.
    if (this.autoCloseRunning) {
      this.logger.warn(
        'autoCloseStaleBreaks skipped: previous tick still in progress',
      );
      return;
    }
    this.autoCloseRunning = true;

    try {
      await this.runAutoCloseSweep();
    } finally {
      this.autoCloseRunning = false;
    }
  }

  private async runAutoCloseSweep(): Promise<void> {
    const now = new Date();
    const todayEndOfWork = new Date(now);
    todayEndOfWork.setHours(this.companyWorkEndHour, 0, 0, 0);
    const hardCapCutoff = new Date(
      now.getTime() - this.hardCapHours * 60 * 60 * 1000,
    );

    const candidates = await this.prisma.operatorBreakSession.findMany({
      where: { endedAt: null },
      select: { id: true, userId: true, startedAt: true },
    });

    if (candidates.length === 0) return;

    let closedCompanyHours = 0;
    let closedHardCap = 0;
    for (const candidate of candidates) {
      // Company-hours check: only fires once now has crossed today's
      // end hour AND the break started before that same instant.
      const pastEndOfWorkToday =
        now >= todayEndOfWork && candidate.startedAt < todayEndOfWork;
      // Hard cap: older than 12h regardless of clock time.
      const overHardCap = candidate.startedAt < hardCapCutoff;

      if (!pastEndOfWorkToday && !overHardCap) continue;

      const reason = pastEndOfWorkToday
        ? 'company_hours_end'
        : 'max_duration_exceeded';
      const endedAt = pastEndOfWorkToday ? todayEndOfWork : now;
      const durationSec = Math.floor(
        (endedAt.getTime() - candidate.startedAt.getTime()) / 1000,
      );

      // Stale-guarded conditional close. If operator ended it
      // themselves between our findMany and this updateMany, count=0
      // and we skip. Prevents overwriting a real close.
      const res = await this.prisma.operatorBreakSession.updateMany({
        where: { id: candidate.id, endedAt: null },
        data: {
          endedAt,
          durationSec,
          isAutoEnded: true,
          autoEndReason: reason,
        },
      });

      if (res.count > 0) {
        if (reason === 'company_hours_end') closedCompanyHours++;
        else closedHardCap++;
        this.logger.warn(
          `Auto-closed break ${candidate.id} (user=${candidate.userId}): reason=${reason} duration=${durationSec}s`,
        );
      }
    }

    if (closedCompanyHours > 0 || closedHardCap > 0) {
      this.logger.log(
        `Break auto-close swept: companyHoursEnd=${closedCompanyHours} hardCap=${closedHardCap}`,
      );
    }
  }
}
