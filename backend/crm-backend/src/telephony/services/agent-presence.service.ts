import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { AgentPresenceState } from '../dto/agent-presence.dto';
import { AsteriskSyncService } from '../sync/asterisk-sync.service';

/**
 * Tracks whether each operator is currently SIP-registered with Asterisk.
 *
 * Two complementary write sources keep the `TelephonyExtension.sipRegistered`
 * flag honest, with **Asterisk as the authoritative source of truth**:
 *
 * 1. **CRM softphone heartbeat** (`POST /v1/telephony/agents/presence`) —
 *    every 30s while logged in, plus immediately on register/unregister.
 *    Drives the per-user-keyed `reportState()` path. Useful as a faster
 *    signal when the operator uses our Electron softphone, but DOES NOT
 *    cover MicroSIP, Zoiper, hardware desk phones, or any non-CRM SIP
 *    client — those clients just SIP-register and don't talk to our
 *    backend at all.
 *
 * 2. **Asterisk reconciliation poll** (`runAsteriskReconciliation` cron) —
 *    every 60s, asks Asterisk via AMI `pjsip show endpoints` for the
 *    registration status of every linked extension and reconciles the DB
 *    to match Asterisk's view. This is the authoritative path: if Asterisk
 *    sees the contact, the operator IS registered, regardless of which SIP
 *    client they use. Self-heals after AMI bridge restarts, missed events,
 *    or any drift between DB and reality.
 *
 * 3. **Stale-heartbeat sweep** (`runStaleRegistrationSweep`) — every 30s,
 *    flips registered → unregistered if no signal in 90s. Belt-and-braces
 *    safety net for the "everything broken" case where reconciliation also
 *    fails.
 *
 * Conflict rules:
 * - Reconciliation refreshes `sipLastSeenAt` whenever Asterisk says
 *   registered (so the stale sweep doesn't trip a healthy operator).
 * - Reconciliation flips registered → unregistered immediately when
 *   Asterisk disagrees with the DB — Asterisk is the truth for SIP.
 * - The softphone heartbeat continues to update both fields as before; if
 *   it disagrees with Asterisk, the next reconciliation cycle wins.
 *
 * See CLAUDE.md Silent Override Risks for the dual-writer documentation.
 */
@Injectable()
export class AgentPresenceService {
  private readonly logger = new Logger(AgentPresenceService.name);
  /** How long silence is tolerated before we assume the softphone is dead. */
  static readonly STALE_AFTER_MS = 90_000;

  /**
   * `pjsip show endpoints` reports a status string per endpoint. These are
   * the values that mean "Asterisk has at least one Reachable contact for
   * this endpoint" — i.e. the operator IS registered. "Unavailable",
   * "Unknown", and any other unexpected value mean unregistered.
   */
  private static readonly REGISTERED_STATUSES = new Set<string>([
    'not in use',
    'in use',
    'busy',
    'ringing',
    'on hold',
    'ring, in use',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asteriskSync: AsteriskSyncService,
  ) {}

  /**
   * Record a presence heartbeat from a softphone.
   *
   * Returns the updated extension row (or throws if the user has no extension
   * or if the extension number does not match the user's own extension — this
   * guards against one user's softphone reporting for a different extension).
   */
  async reportState(
    userId: string,
    state: AgentPresenceState,
    extension: string,
  ): Promise<{
    sipRegistered: boolean;
    sipLastSeenAt: Date;
    extension: string;
    stateChanged: boolean;
  }> {
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: userId },
      select: {
        id: true,
        extension: true,
        isActive: true,
        sipRegistered: true,
      },
    });

    if (!ext) {
      throw new NotFoundException(
        'No telephony extension linked to your account',
      );
    }

    // Guard: the softphone must report for its own user's extension. Otherwise
    // any authenticated user could flip someone else's sipRegistered flag.
    if (ext.extension !== extension) {
      throw new NotFoundException(
        'Extension does not match the user\'s assigned extension',
      );
    }

    const registered = state === 'registered';
    const stateChanged = ext.sipRegistered !== registered;
    const now = new Date();

    const updated = await this.prisma.telephonyExtension.update({
      where: { id: ext.id },
      data: {
        sipRegistered: registered,
        sipLastSeenAt: now,
      },
      select: {
        sipRegistered: true,
        sipLastSeenAt: true,
        extension: true,
      },
    });

    return {
      sipRegistered: updated.sipRegistered,
      sipLastSeenAt: updated.sipLastSeenAt ?? now,
      extension: updated.extension,
      stateChanged,
    };
  }

  /**
   * Find extensions whose softphone stopped heartbeating. Returns the
   * extensions that had to be flipped so the caller (gateway) can emit
   * `agent:status` updates for them.
   *
   * Runs every 30 seconds. Threshold is 90s — enough to tolerate one missed
   * 30s heartbeat + transient network delay.
   */
  async sweepStaleRegistrations(now: Date = new Date()): Promise<
    Array<{ crmUserId: string; extension: string }>
  > {
    const threshold = new Date(
      now.getTime() - AgentPresenceService.STALE_AFTER_MS,
    );

    // Find the rows we will flip so we can notify the gateway per-user. We
    // could use `updateMany` + return count, but then the gateway wouldn't
    // know which users to emit for.
    const stale = await this.prisma.telephonyExtension.findMany({
      where: {
        sipRegistered: true,
        // Pool rows can't be "stale" — they have no operator to notify.
        crmUserId: { not: null },
        // Treat null lastSeenAt as stale if the row claims registered — this
        // can only happen if the column was populated out-of-band.
        OR: [
          { sipLastSeenAt: { lt: threshold } },
          { sipLastSeenAt: null },
        ],
      },
      select: {
        id: true,
        crmUserId: true,
        extension: true,
      },
    });

    if (stale.length === 0) return [];

    await this.prisma.telephonyExtension.updateMany({
      where: {
        id: { in: stale.map((s) => s.id) },
      },
      data: {
        sipRegistered: false,
      },
    });

    this.logger.warn(
      `SIP presence sweep: flipped ${stale.length} extension(s) to offline (no heartbeat in ${AgentPresenceService.STALE_AFTER_MS / 1000}s)`,
    );

    return stale
      .filter((s): s is typeof s & { crmUserId: string } => s.crmUserId !== null)
      .map((s) => ({
        crmUserId: s.crmUserId,
        extension: s.extension,
      }));
  }

  /**
   * Cron entry point. Runs every 30 seconds. The gateway depends on this to
   * notify managers when an operator's softphone silently died. Thin wrapper
   * so the sweep logic stays easy to unit-test without timers.
   *
   * Overlap-guarded: if the previous run is still in flight, skip. A sweep
   * that finds nothing is O(1) against the sipRegistered+sipLastSeenAt index
   * so overlap is very unlikely unless Postgres itself is stalled.
   */
  @Cron('*/30 * * * * *')
  async runStaleRegistrationSweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const flipped = await this.sweepStaleRegistrations();
      // Emit agent:status for each flipped user via an event bus-free hook.
      // The controller/module wires in the gateway listener via EventEmitter2
      // or a direct injection — see agent-presence.events.ts.
      for (const user of flipped) {
        this.onStaleFlipped?.(user.crmUserId, user.extension);
      }
    } catch (err: any) {
      this.logger.error(`Stale SIP presence sweep failed: ${err.message}`);
    } finally {
      this.sweeping = false;
    }
  }

  private sweeping = false;

  /**
   * Hook invoked for each extension that the sweep flipped. Set by the
   * telephony gateway in `onModuleInit` so the gateway can emit
   * `agent:status` without creating a circular import.
   */
  onStaleFlipped?: (userId: string, extension: string) => void;

  /**
   * Reconcile the DB's view of `sipRegistered` against Asterisk's view for
   * every linked extension. Asterisk is authoritative — if its view differs
   * from the DB the DB is updated to match.
   *
   * Returns the set of extensions whose registered state actually changed,
   * so the caller can emit `agent:status` only for the deltas.
   *
   * Behavior:
   * - Endpoint registered in Asterisk, DB says false → flip to true,
   *   refresh `sipLastSeenAt`.
   * - Endpoint registered in Asterisk, DB also true → only refresh
   *   `sipLastSeenAt` (no agent:status emit; prevents the stale sweep from
   *   tripping a healthy operator).
   * - Endpoint not registered in Asterisk, DB says true → flip to false.
   *   `sipLastSeenAt` is left alone so the existing freshness logic in the
   *   live page (PR #334) still snaps the operator to OFFLINE.
   * - Endpoint not registered in Asterisk, DB also false → no-op.
   * - Pool extensions (`crmUserId IS NULL`) are excluded — they have no
   *   operator to report for.
   *
   * If Asterisk's status map is empty (AMI down, sync disabled, command
   * failed), this is a NO-OP. We do NOT pessimistically flip everyone to
   * unregistered — that would create a presence outage every time AMI
   * blips. The stale-heartbeat sweep is the safety net for that case.
   */
  async reconcileFromAsterisk(
    asteriskStatuses: Record<string, string>,
    now: Date = new Date(),
  ): Promise<
    Array<{ crmUserId: string; extension: string; sipRegistered: boolean }>
  > {
    if (Object.keys(asteriskStatuses).length === 0) return [];

    const linked = await this.prisma.telephonyExtension.findMany({
      where: { isActive: true, crmUserId: { not: null } },
      select: {
        id: true,
        crmUserId: true,
        extension: true,
        sipRegistered: true,
      },
    });

    const flipsToRegistered: string[] = []; // ext.id values
    const flipsToUnregistered: string[] = []; // ext.id values
    const refreshOnly: string[] = []; // ext.id values — already true, just refresh sipLastSeenAt

    const changed: Array<{
      crmUserId: string;
      extension: string;
      sipRegistered: boolean;
    }> = [];

    for (const ext of linked) {
      if (!ext.crmUserId) continue;
      const status = asteriskStatuses[ext.extension];
      const registeredInAsterisk =
        typeof status === 'string' &&
        AgentPresenceService.REGISTERED_STATUSES.has(status.toLowerCase());

      if (registeredInAsterisk) {
        if (!ext.sipRegistered) {
          flipsToRegistered.push(ext.id);
          changed.push({
            crmUserId: ext.crmUserId,
            extension: ext.extension,
            sipRegistered: true,
          });
        } else {
          refreshOnly.push(ext.id);
        }
      } else {
        if (ext.sipRegistered) {
          flipsToUnregistered.push(ext.id);
          changed.push({
            crmUserId: ext.crmUserId,
            extension: ext.extension,
            sipRegistered: false,
          });
        }
      }
    }

    // Three batched updates instead of N round-trips. With 100+ operators
    // each cron tick would otherwise issue 100+ updates against the same
    // table. Grouping by target state lets Postgres handle them in three
    // statements regardless of operator count.
    if (flipsToRegistered.length > 0) {
      await this.prisma.telephonyExtension.updateMany({
        where: { id: { in: flipsToRegistered } },
        data: { sipRegistered: true, sipLastSeenAt: now },
      });
    }
    if (flipsToUnregistered.length > 0) {
      await this.prisma.telephonyExtension.updateMany({
        where: { id: { in: flipsToUnregistered } },
        data: { sipRegistered: false },
      });
    }
    if (refreshOnly.length > 0) {
      await this.prisma.telephonyExtension.updateMany({
        where: { id: { in: refreshOnly } },
        data: { sipLastSeenAt: now },
      });
    }

    if (changed.length > 0) {
      this.logger.log(
        `Asterisk reconciliation: ${flipsToRegistered.length} → registered, ${flipsToUnregistered.length} → unregistered (${refreshOnly.length} refreshed)`,
      );
    }

    return changed;
  }

  /**
   * Cron entry point for Asterisk reconciliation. Runs every 60 seconds.
   *
   * 60s is the right cadence because:
   * - It's faster than the existing 5-minute `asterisk-sync` cron (which
   *   runs heavier work like queue + endpoint config sync).
   * - It's slow enough to not hammer Asterisk under high registration churn.
   * - Operators expect dashboard updates within ~1 minute when they
   *   register, which matches.
   *
   * Overlap-guarded: skips if a previous run is still in flight. AMI down
   * is a graceful skip — the next call event or heartbeat will keep the
   * dashboard moving until AMI comes back.
   */
  @Cron('0 * * * * *')
  async runAsteriskReconciliation(): Promise<void> {
    if (this.reconciling) return;
    this.reconciling = true;
    try {
      const statuses = await this.asteriskSync.getEndpointStatuses();
      const changed = await this.reconcileFromAsterisk(statuses);
      for (const flip of changed) {
        this.onAsteriskFlip?.(flip.crmUserId, flip.extension, flip.sipRegistered);
      }
    } catch (err: any) {
      this.logger.error(`Asterisk reconciliation failed: ${err.message}`);
    } finally {
      this.reconciling = false;
    }
  }

  private reconciling = false;

  /**
   * Hook invoked for each extension whose registered state was flipped by
   * the Asterisk reconciliation cron. Set by the telephony gateway in
   * `onModuleInit` so the gateway can emit `agent:status` without creating
   * a circular import. Mirrors the `onStaleFlipped` pattern.
   */
  onAsteriskFlip?: (
    userId: string,
    extension: string,
    sipRegistered: boolean,
  ) => void;
}
