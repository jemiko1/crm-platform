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
   *
   * **Interface format** — FreePBX registers queue members as
   * `Local/<ext>@from-queue/n` channels, NOT as `PJSIP/<ext>` endpoints.
   * (The `n` suffix prevents further dialplan processing when the
   * Local channel answers.) AMI matches the Interface string verbatim
   * against queue member records; sending `PJSIP/200` returns "Interface
   * not found" even though the extension exists as a device. Verified
   * via `QueueStatus` on production — every member shows as
   * `Local/<ext>@from-queue/n`.
   *
   * If your PBX uses a different convention (e.g. hosted SIP trunks
   * registered directly as PJSIP endpoints in queues), plumb the
   * format through an env var or per-queue setting rather than
   * editing this string — the Silent Override Risk writeup will
   * save the next person 45 minutes of AMI debugging.
   */
  private async sendQueuePause(
    extension: string,
    paused: boolean,
    reason?: string,
  ): Promise<void> {
    const action: Record<string, string> = {
      Action: 'QueuePause',
      Interface: `Local/${extension}@from-queue/n`,
      Paused: paused ? 'true' : 'false',
    };
    if (reason) action.Reason = reason;
    try {
      await this.ami.sendAction(action);
    } catch (err) {
      // `asterisk-manager` (npm) rejects two different shapes:
      //
      //  A. Pre-send, before a TCP connection exists, our own wrapper
      //     throws `new Error('AMI not connected')` from
      //     `AmiClientService.sendAction`.
      //  B. Post-send, Asterisk returns `Response: Error` and the
      //     library forwards the parsed event **as a plain object**
      //     (keys lowercased by the library's parser):
      //         { response: 'error', message: 'Interface not found',
      //           actionid: '...' }
      //
      // We have to extract `.message` as a property read rather than
      // relying on `String(err)` — a plain object stringifies to
      // "[object Object]" which defeats the whole error-translation
      // table. First code-reviewer pass on this fix shipped with that
      // bug and would have left the symptom in place in production.
      const rawMessage = ((): string => {
        if (err && typeof err === 'object') {
          const m = (err as { message?: unknown }).message;
          if (typeof m === 'string' && m.length > 0) return m;
        }
        if (err instanceof Error) return err.message;
        return String(err);
      })();

      // AMI returns "Interface not found" when the extension isn't a
      // member of ANY queue. Legit 400-class case (user config issue,
      // not a server fault) — surface it cleanly instead of 500.
      if (/interface not found/i.test(rawMessage)) {
        throw new BadRequestException(
          `Extension ${extension} is not a member of any queue — DND has no effect. Ask your admin to add you to a queue.`,
        );
      }
      // AMI disconnected between sendAction and action resolution —
      // common during a backend redeploy or bridge restart. Retry-
      // soon message, still a 400 because the operator can just try
      // again rather than seeing a scary "Internal server error".
      if (/not connected/i.test(rawMessage)) {
        throw new BadRequestException(
          'Phone system is currently unreachable. Try again in a moment.',
        );
      }
      // Anything else — rethrow as a proper Error so the
      // HttpExceptionFilter has something with a stack to log. If the
      // caught value was already an Error we preserve it; if it was
      // a plain object we lift the message into a new Error so the
      // log isn't the useless "[object Object]".
      if (err instanceof Error) throw err;
      throw new Error(`AMI QueuePause failed: ${rawMessage}`);
    }
  }
}
