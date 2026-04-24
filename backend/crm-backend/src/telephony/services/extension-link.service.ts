import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AmiClientService } from '../ami/ami-client.service';

/**
 * Orchestrates the "link an employee to a pre-provisioned extension" and
 * "unlink" flows for the pool model (PR #294).
 *
 * At link time: look up the employee's Position, consult `PositionQueueRule`
 * for the set of queues they should join, emit `QueueAdd` per queue, and
 * set `TelephonyExtension.crmUserId`. At unlink time: emit `QueueRemove` for
 * each queue derived from the CURRENTLY-linked user's Position BEFORE
 * nulling `crmUserId` (order is load-bearing — once the FK is nulled we
 * lose the ability to derive the Position).
 *
 * **Feature flag `TELEPHONY_AUTO_QUEUE_SYNC`** — when `false`, the DB write
 * still happens but all AMI calls are skipped and a warning is logged.
 * Kill-switch for incidents: flip the env var, restart backend, CRM still
 * manages links while AMI stays untouched. Admin can then use FreePBX GUI
 * to manage queue membership manually until the issue is resolved.
 *
 * **Interface format** (Silent Override Risk #26) — FreePBX queue members
 * are `Local/<ext>@from-queue/n`, not `PJSIP/<ext>`. Mirrors operator-dnd.
 *
 * **Idempotency** — `QueueAdd` for an already-member extension returns
 * "Unable to add interface: Already there" and is treated as success.
 * `QueueRemove` for a non-member returns "Unable to remove interface from
 * queue: Not there" and is also treated as success. This lets `resyncQueues`
 * be safely re-run without bookkeeping.
 */
@Injectable()
export class ExtensionLinkService {
  private readonly logger = new Logger(ExtensionLinkService.name);
  private readonly autoQueueSync: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ami: AmiClientService,
  ) {
    // Default: on. Admin must explicitly set to 'false' to disable. Matches
    // the "default-on, explicit kill-switch" pattern the user asked for —
    // no surprise off-state after a deploy.
    this.autoQueueSync = process.env.TELEPHONY_AUTO_QUEUE_SYNC !== 'false';
    if (!this.autoQueueSync) {
      this.logger.warn(
        'TELEPHONY_AUTO_QUEUE_SYNC=false — link/unlink will NOT emit AMI QueueAdd/QueueRemove. Queue membership must be managed manually via FreePBX GUI until this flag is re-enabled.',
      );
    }
  }

  async link(extensionId: string, userId: string): Promise<void> {
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { id: extensionId },
      select: { id: true, extension: true, crmUserId: true, isActive: true, displayName: true },
    });
    if (!ext) throw new NotFoundException(`Extension ${extensionId} not found`);
    if (!ext.isActive) throw new BadRequestException(`Extension ${ext.extension} is disabled`);
    if (ext.crmUserId && ext.crmUserId !== userId) {
      throw new ConflictException(
        `Extension ${ext.extension} is already linked to another user. Unlink first.`,
      );
    }

    // Guard: user already linked to a different extension? Enforced by the
    // DB @unique on crmUserId but we want a clean 409 rather than P2002.
    const existing = await this.prisma.telephonyExtension.findFirst({
      where: { crmUserId: userId, NOT: { id: extensionId } },
      select: { extension: true },
    });
    if (existing) {
      throw new ConflictException(
        `User is already linked to extension ${existing.extension}. Unlink that first.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
            positionId: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (!user.isActive) throw new BadRequestException('User is inactive');

    // Fallback chain: employee full name → user email → existing extension
    // display name. Covers the edge case where core sync created a User
    // row with empty first/last name (AMI MemberName would otherwise be
    // blank, making live-monitor unreadable).
    const empFullName = user.employee
      ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
      : '';
    const displayName = empFullName || user.email || ext.displayName;

    // DB commit FIRST — if AMI fails, we retry via resyncQueues; if DB fails,
    // we abort before touching AMI. This preserves "CRM Postgres is the
    // source of truth for link state" (docs/TELEPHONY_EXTENSION_MANAGEMENT.md).
    //
    // Race guard: use updateMany with a predicate on the current crmUserId
    // so a concurrent link/unlink against the same row is caught as a
    // count=0 update rather than both succeeding. If count !== 1, another
    // admin beat us — refuse rather than applying AMI with stale assumptions.
    const result = await this.prisma.telephonyExtension.updateMany({
      where: { id: extensionId, crmUserId: ext.crmUserId },
      data: { crmUserId: userId, displayName },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        `Extension ${ext.extension} state changed during the request. Reload and try again.`,
      );
    }

    const positionId = user.employee?.positionId ?? null;
    if (!positionId) {
      this.logger.log(
        `Linked user ${userId} to ext ${ext.extension} but employee has no Position — no queues to add.`,
      );
      return;
    }

    await this.applyQueueRulesToExtension(
      ext.extension,
      displayName,
      positionId,
      'QueueAdd',
    );
  }

  async unlink(extensionId: string): Promise<void> {
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { id: extensionId },
      select: { id: true, extension: true, crmUserId: true, displayName: true },
    });
    if (!ext) throw new NotFoundException(`Extension ${extensionId} not found`);
    if (!ext.crmUserId) {
      // Already unlinked — no-op. Keep idempotent for the admin UI.
      return;
    }

    // CRITICAL ORDER: derive the Position BEFORE nulling crmUserId. Once we
    // null the FK, the user→position path is still derivable (the User row
    // still exists), but future refactors might rely on the extension's
    // currently-linked user — keeping the lookup explicit here guards
    // against that.
    const linkedUser = await this.prisma.user.findUnique({
      where: { id: ext.crmUserId },
      select: { employee: { select: { positionId: true } } },
    });
    const positionId = linkedUser?.employee?.positionId ?? null;

    // DB write first for the same reason as link(). If AMI is down the row
    // is still unlinked in CRM; a later resyncQueues on a NEW link will
    // re-apply rules cleanly. The only "cost" of an AMI failure here is
    // the ex-operator continues receiving queue calls until admin fixes
    // it — which is exactly why we want the kill-switch flag.
    //
    // Race guard (same pattern as link): updateMany scoped to the currently
    // linked crmUserId, confirm count === 1. Protects against another admin
    // unlinking or re-linking mid-request.
    const result = await this.prisma.telephonyExtension.updateMany({
      where: { id: extensionId, crmUserId: ext.crmUserId },
      data: { crmUserId: null },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        `Extension ${ext.extension} state changed during the request. Reload and try again.`,
      );
    }

    if (positionId) {
      await this.applyQueueRulesToExtension(
        ext.extension,
        ext.displayName,
        positionId,
        'QueueRemove',
      );
    }
  }

  /**
   * Re-apply queue membership from current CRM state. For a linked extension,
   * emits `QueueAdd` for every queue its Position maps to. Idempotent
   * "Already there" responses are swallowed. Useful when AMI was down
   * during the original link and admin wants to reconcile without unlink/
   * relink cycling.
   */
  async resyncQueues(extensionId: string): Promise<{
    applied: number;
    skipped: string[];
    reason?: 'no-position' | 'auto-queue-sync-disabled';
  }> {
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { id: extensionId },
      select: {
        id: true,
        extension: true,
        crmUserId: true,
        displayName: true,
      },
    });
    if (!ext) throw new NotFoundException(`Extension ${extensionId} not found`);
    if (!ext.crmUserId) {
      throw new BadRequestException(
        `Extension ${ext.extension} is not linked — nothing to resync. Link an employee first.`,
      );
    }

    const linkedUser = await this.prisma.user.findUnique({
      where: { id: ext.crmUserId },
      select: { employee: { select: { positionId: true } } },
    });
    const positionId = linkedUser?.employee?.positionId;
    if (!positionId) {
      return { applied: 0, skipped: [], reason: 'no-position' };
    }

    const result = await this.applyQueueRulesToExtension(
      ext.extension,
      ext.displayName,
      positionId,
      'QueueAdd',
    );
    // Surface the kill-switch case to the caller so the UI can say
    // "AMI sync is disabled" instead of "skipped: 30, 800".
    if (!this.autoQueueSync) {
      return { ...result, reason: 'auto-queue-sync-disabled' };
    }
    return result;
  }

  private async applyQueueRulesToExtension(
    extension: string,
    displayName: string,
    positionId: string,
    action: 'QueueAdd' | 'QueueRemove',
  ): Promise<{ applied: number; skipped: string[] }> {
    const rules = await this.prisma.positionQueueRule.findMany({
      where: { positionId },
      include: { queue: { select: { name: true, isActive: true } } },
    });

    const activeRules = rules.filter((r) => r.queue.isActive);
    if (activeRules.length === 0) {
      this.logger.log(
        `${action} for ext ${extension}: no active queue rules for position ${positionId}`,
      );
      return { applied: 0, skipped: [] };
    }

    if (!this.autoQueueSync) {
      this.logger.warn(
        `AUTO_QUEUE_SYNC=false — skipping ${action} for ext ${extension} across ${activeRules.length} queue(s). Admin must reconcile via FreePBX GUI.`,
      );
      return { applied: 0, skipped: activeRules.map((r) => r.queue.name) };
    }

    let applied = 0;
    const skipped: string[] = [];

    for (const rule of activeRules) {
      const baseAction: Record<string, string> = {
        Action: action,
        Queue: rule.queue.name,
        Interface: `Local/${extension}@from-queue/n`,
      };
      if (action === 'QueueAdd') {
        baseAction.Paused = 'false';
        baseAction.MemberName = displayName;
        baseAction.StateInterface = `hint:${extension}@ext-local`;
      }

      try {
        await this.ami.sendAction(baseAction);
        applied++;
      } catch (err) {
        const rawMessage = ((): string => {
          if (err && typeof err === 'object') {
            const m = (err as { message?: unknown }).message;
            if (typeof m === 'string' && m.length > 0) return m;
          }
          if (err instanceof Error) return err.message;
          return String(err);
        })();

        // Idempotent success paths — treat as applied. Regex is tight to
        // Asterisk's exact phrasing; anything else (queue deleted, AMI
        // down, ACL refusal) must surface as `skipped` for admin action.
        //   QueueAdd to an already-member:
        //     "Unable to add interface: Already there"
        //   QueueRemove from non-member:
        //     "Unable to remove interface from queue: Not there"
        //   QueueRemove: "Interface not found"  (member absent entirely)
        if (
          /^Unable to add interface: Already there$/i.test(rawMessage) ||
          /^Unable to remove interface from queue: Not there$/i.test(rawMessage) ||
          /^Interface not found$/i.test(rawMessage)
        ) {
          applied++;
          continue;
        }

        this.logger.warn(
          `${action} failed for ext=${extension} queue=${rule.queue.name}: ${rawMessage}`,
        );
        skipped.push(rule.queue.name);
      }
    }

    this.logger.log(
      `${action} ext=${extension} applied=${applied}/${activeRules.length}${
        skipped.length ? ` skipped=[${skipped.join(',')}]` : ''
      }`,
    );
    return { applied, skipped };
  }
}
