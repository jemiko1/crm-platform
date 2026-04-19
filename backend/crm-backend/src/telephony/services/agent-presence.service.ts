import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import type { AgentPresenceState } from '../dto/agent-presence.dto';

/**
 * Tracks whether each operator's softphone is actually SIP-registered with
 * Asterisk. Without this, an operator who clicks "available" in CRM can
 * silently have their SIP registration expire (e.g. after a network blip);
 * Asterisk routes their inbound call to voicemail while the manager board
 * still shows them as available.
 *
 * The softphone calls `POST /v1/telephony/agents/presence` every 30s while
 * logged in, and immediately on registration state changes. Stale heartbeats
 * (>90s silence) are swept to `sipRegistered=false` by the cron below, so
 * the state reflects reality even when the softphone crashes without sending
 * an unregister.
 */
@Injectable()
export class AgentPresenceService {
  private readonly logger = new Logger(AgentPresenceService.name);
  /** How long silence is tolerated before we assume the softphone is dead. */
  static readonly STALE_AFTER_MS = 90_000;

  constructor(private readonly prisma: PrismaService) {}

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

    return stale.map((s) => ({
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
}
