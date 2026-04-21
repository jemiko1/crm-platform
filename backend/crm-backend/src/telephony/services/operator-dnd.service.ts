import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';

/**
 * Operator Do-Not-Disturb (DND) state.
 *
 * Semantics (business decision, April 2026):
 *  - Operator-toggled. Keeps softphone REGISTERED (unlike Break, which
 *    fully unregisters). Queue dispatch skips the extension via AMI
 *    `QueuePause`; direct extension-to-extension calls still ring.
 *  - Outbound dialing is NOT blocked — "today I'm only making outbound
 *    calls" is the canonical use case.
 *  - State is managed by Asterisk (QueuePause in all queues the
 *    extension is a member of). We don't store it in our DB. The
 *    `TelephonyStateManager` maintains an in-memory cache keyed by
 *    userId, populated from AMI events, that we read for fast UI
 *    queries.
 *  - Auto-disabled on logout (best effort — see auth.controller).
 *
 * Why no DB row:
 *  - Asterisk is the source of truth. If our DB drifted from Asterisk
 *    (e.g. someone used `asterisk -rx "queue pause"` directly), the DB
 *    row would lie. Keeping state solely in Asterisk + the in-memory
 *    AMI-driven cache avoids that whole failure mode.
 *  - For manager live-monitor, the AgentState presence `PAUSED` already
 *    exists in `TelephonyStateManager` — no new plumbing needed.
 */
@Injectable()
export class OperatorDndService {
  private readonly logger = new Logger(OperatorDndService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ami: AmiClientService,
    private readonly stateManager: TelephonyStateManager,
  ) {}

  /**
   * Enable DND for the user. Pauses their extension in ALL queues so
   * queue dispatch skips them. Does NOT affect direct extension calls
   * or outbound dialing.
   *
   * @throws BadRequestException if the user has no active TelephonyExtension
   */
  async enable(userId: string): Promise<{ enabled: true; extension: string }> {
    const ext = await this.resolveExtension(userId);
    await this.sendQueuePause(ext, true, 'Operator DND');
    this.logger.log(`DND enabled: user=${userId} ext=${ext}`);
    return { enabled: true, extension: ext };
  }

  /**
   * Disable DND for the user. Re-joins all queues as an available
   * member. Idempotent — safe to call when not currently on DND.
   *
   * @throws BadRequestException if the user has no active TelephonyExtension
   */
  async disable(userId: string): Promise<{ enabled: false; extension: string }> {
    const ext = await this.resolveExtension(userId);
    await this.sendQueuePause(ext, false);
    this.logger.log(`DND disabled: user=${userId} ext=${ext}`);
    return { enabled: false, extension: ext };
  }

  /**
   * Best-effort DND disable for logout hook. Never throws; logs silently.
   * If the user has no extension or AMI is down, we just skip — the
   * next operator with this extension will overwrite the state anyway.
   */
  async disableSilently(userId: string): Promise<void> {
    try {
      await this.disable(userId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Silent DND disable skipped for user=${userId}: ${msg}`);
    }
  }

  /**
   * Read the operator's current DND state from the in-memory state
   * manager cache (updated by AMI QueuePause events). Returns false if
   * the agent has no cached state yet.
   */
  getMyState(userId: string): { enabled: boolean; extension: string | null } {
    const agent = this.stateManager.getAgentState(userId);
    return {
      enabled: agent?.presence === 'PAUSED',
      extension: agent?.extension ?? null,
    };
  }

  // ── Internal helpers ──────────────────────────────────────

  private async resolveExtension(userId: string): Promise<string> {
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: userId },
      select: { extension: true, isActive: true },
    });
    if (!ext || !ext.isActive) {
      throw new BadRequestException(
        'No active telephony extension linked to this user',
      );
    }
    return ext.extension;
  }

  /**
   * Send AMI `QueuePause` for the extension. Omitting the `Queue` field
   * pauses/unpauses across every queue the extension is a member of,
   * which is exactly what "DND" means semantically.
   */
  private async sendQueuePause(
    extension: string,
    paused: boolean,
    reason?: string,
  ): Promise<void> {
    const action: Record<string, string> = {
      Action: 'QueuePause',
      Interface: `PJSIP/${extension}`,
      Paused: paused ? 'true' : 'false',
    };
    if (reason) action.Reason = reason;
    await this.ami.sendAction(action);
  }
}
