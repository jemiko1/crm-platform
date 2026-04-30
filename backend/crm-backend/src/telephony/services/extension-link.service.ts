import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PbxQueueMemberClient } from '../pbx/pbx-queue-member.client';
import { TelephonyGateway } from '../realtime/telephony.gateway';

/**
 * Orchestrates the "link an employee to a pre-provisioned extension" and
 * "unlink" flows for the pool model (PR #294).
 *
 * At link time: update `crmUserId`, look up the employee's Position, consult
 * `PositionQueueRule` for the set of queues they should join, and INSERT
 * queue membership rows directly into FreePBX's `queues_details` MariaDB
 * table (via `PbxQueueMemberClient` → SSH → `/usr/local/sbin/crm-queue-member`).
 * At unlink time: DELETE those rows, then null `crmUserId`. Order is
 * load-bearing for unlink — see comment on `unlink`.
 *
 * **Why MariaDB and not AMI** (corrected approach — PRs #296-#297 used AMI):
 * FreePBX GUI reads queue members from `queues_details`. Any "Apply Config"
 * click regenerates `queues.conf` from that table, wiping runtime-only
 * (AMI-added) members. By writing to MariaDB we become the same-path source
 * as the GUI, so CRM-added members:
 *   1. Show up in the FreePBX GUI Queues page (admin can see CRM's state).
 *   2. Survive Apply Config (they ARE the config).
 *   3. Coexist with hand-added rows — CRM only DELETEs the specific row
 *      it would have inserted (`Local/EXT@from-queue/n,0`). If an admin
 *      customizes penalty to a different value, that row is invisible to
 *      CRM and survives unlink.
 *
 * **Feature flag `TELEPHONY_AUTO_QUEUE_SYNC`** — when `false`, the DB write
 * to CRM Postgres still happens but NO SSH calls to the PBX are made.
 * Kill-switch for incidents: flip the env var, restart backend, CRM still
 * manages links while the PBX stays untouched. Admin can then use FreePBX
 * GUI to manage queue membership manually until the issue is resolved.
 *
 * **Interface format** (Silent Override Risk #26) — FreePBX queue members
 * are `Local/<ext>@from-queue/n`, not `PJSIP/<ext>`. The SSH helper builds
 * the full `data` string; CRM only passes extension number + queue name.
 *
 * **Idempotency** — the SSH helper uses `INSERT IGNORE` (add) and a
 * full-match `DELETE` (remove), so both operations are naturally idempotent
 * against `queues_details`. Replaying a link or unlink multiple times is
 * safe; `resyncQueues` exploits this to reconcile drift without bookkeeping.
 */
@Injectable()
export class ExtensionLinkService {
  private readonly logger = new Logger(ExtensionLinkService.name);
  private readonly autoQueueSync: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pbx: PbxQueueMemberClient,
    // forwardRef because TelephonyGateway lives in the same module and
    // its dependency graph (state-manager, calls-service, etc.) could
    // transitively touch this service in future refactors. The forwardRef
    // is defensive — there's no current cycle.
    @Inject(forwardRef(() => TelephonyGateway))
    private readonly gateway: TelephonyGateway,
  ) {
    // Default: on. Admin must explicitly set to 'false' to disable. Matches
    // the "default-on, explicit kill-switch" pattern the user asked for —
    // no surprise off-state after a deploy.
    this.autoQueueSync = process.env.TELEPHONY_AUTO_QUEUE_SYNC !== 'false';
    if (!this.autoQueueSync) {
      this.logger.warn(
        'TELEPHONY_AUTO_QUEUE_SYNC=false — link/unlink will NOT write to FreePBX queues_details. Queue membership must be managed manually via FreePBX GUI until this flag is re-enabled.',
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

    // Notify the affected operator(s) so their softphones rebind.
    // - The newly-linked user picks up new SIP credentials.
    // - If we're moving the extension off a previously-linked user
    //   (rare — caught by the conflict check above unless same user),
    //   that user's softphone unregisters.
    // The softphone soft-defers if on an active call — NEVER drops it.
    if (ext.crmUserId && ext.crmUserId !== userId) {
      this.gateway.notifyExtensionChanged(ext.crmUserId, 'admin-link');
    }
    this.gateway.notifyExtensionChanged(userId, 'admin-link');

    const positionId = user.employee?.positionId ?? null;
    if (!positionId) {
      this.logger.log(
        `Linked user ${userId} to ext ${ext.extension} but employee has no Position — no queues to add.`,
      );
      return;
    }

    await this.applyQueueRulesToExtension(ext.extension, positionId, 'add');
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

    // DB write first for the same reason as link(). If the PBX SSH path
    // is unreachable, the row is still unlinked in CRM; admin can use the
    // Resync button on a future link to reconcile. Worst case: the
    // ex-operator continues receiving queue calls until admin intervenes
    // — which is exactly why TELEPHONY_AUTO_QUEUE_SYNC exists.
    //
    // Race guard (same pattern as link): updateMany scoped to the currently
    // linked crmUserId, confirm count === 1. Protects against another admin
    // unlinking or re-linking mid-request.
    const previouslyLinkedUserId = ext.crmUserId;
    const result = await this.prisma.telephonyExtension.updateMany({
      where: { id: extensionId, crmUserId: ext.crmUserId },
      data: { crmUserId: null },
    });
    if (result.count !== 1) {
      throw new ConflictException(
        `Extension ${ext.extension} state changed during the request. Reload and try again.`,
      );
    }

    // Notify the previously-linked operator so their softphone unregisters.
    // Soft-defer if on an active call — never dropped.
    this.gateway.notifyExtensionChanged(previouslyLinkedUserId, 'admin-unlink');

    if (positionId) {
      await this.applyQueueRulesToExtension(ext.extension, positionId, 'remove');
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
      positionId,
      'add',
    );
    // Surface the kill-switch case to the caller so the UI can say
    // "queue sync is disabled" instead of "skipped: 30, 800".
    if (!this.autoQueueSync) {
      return { ...result, reason: 'auto-queue-sync-disabled' };
    }
    return result;
  }

  private async applyQueueRulesToExtension(
    extension: string,
    positionId: string,
    action: 'add' | 'remove',
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
      try {
        if (action === 'add') {
          await this.pbx.addMember(rule.queue.name, extension);
        } else {
          await this.pbx.removeMember(rule.queue.name, extension);
        }
        applied++;
      } catch (err: any) {
        // The SSH helper is naturally idempotent (INSERT IGNORE + exact-
        // match DELETE), so any error here is a real failure — SSH down,
        // fwconsole reload timeout, MariaDB unreachable, schema drift. No
        // regex-matching needed; surface the queue name to the admin.
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `PBX ${action} failed for ext=${extension} queue=${rule.queue.name}: ${msg}`,
        );
        skipped.push(rule.queue.name);
      }
    }

    this.logger.log(
      `PBX ${action} ext=${extension} applied=${applied}/${activeRules.length}${
        skipped.length ? ` skipped=[${skipped.join(',')}]` : ''
      }`,
    );
    return { applied, skipped };
  }
}
