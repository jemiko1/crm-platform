import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';

export interface ExtensionSyncResult {
  total: number;
  linked: number;
  autoLinked: number;
  statuses: Record<string, string>;
}

@Injectable()
export class AsteriskSyncService implements OnModuleInit {
  private readonly logger = new Logger(AsteriskSyncService.name);
  private readonly enabled: boolean;
  private readonly afterHoursQueues: Set<string>;
  private readonly sipServer: string;
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly amiClient: AmiClientService,
    private readonly stateManager: TelephonyStateManager,
  ) {
    this.enabled = process.env.AMI_ENABLED === 'true';
    this.sipServer = process.env.ASTERISK_SIP_SERVER ?? '5.10.34.153';
    this.afterHoursQueues = new Set(
      (process.env.AFTER_HOURS_QUEUES ?? 'nowork')
        .split(',')
        .map((q) => q.trim())
        .filter(Boolean),
    );
  }

  async onModuleInit() {
    if (!this.enabled) return;
    this.amiClient.on('ami:connected', () => {
      setTimeout(() => this.syncAll(), 3000);
    });
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncAll(): Promise<void> {
    if (!this.enabled || !this.amiClient.connected) return;

    try {
      await Promise.all([this.syncQueues(), this.syncExtensions()]);
    } catch (err: any) {
      this.logger.error(`Sync failed: ${err.message}`);
    }
  }

  async syncQueues(): Promise<void> {
    let queues: Array<{ name: string; strategy: string }> = [];
    try {
      queues = await this.fetchQueuesViaCli();
    } catch (err: any) {
      this.logger.warn(`Queue sync failed: ${err.message}`);
      return;
    }

    let upserted = 0;

    for (const q of queues) {
      // `isAfterHoursQueue` is ONLY set on CREATE, never on UPDATE. This
      // makes the flag sticky — admins can toggle it in the DB (or via a
      // future admin UI) without the next sync cycle reverting their
      // change based on the env var. The env var is only the BOOTSTRAP
      // default for newly-discovered queues. (April 2026 audit — was
      // previously reset every 5 min, making queue 40's after-hours flag
      // impossible to set without also updating the env var.)
      await this.prisma.telephonyQueue.upsert({
        where: { name: q.name },
        create: {
          name: q.name,
          strategy: this.mapStrategy(q.strategy),
          isAfterHoursQueue: this.afterHoursQueues.has(q.name),
          isActive: true,
        },
        update: {
          strategy: this.mapStrategy(q.strategy),
          isActive: true,
          // Deliberately do NOT write isAfterHoursQueue here.
        },
      });
      upserted++;
    }

    this.logger.log(`Queue sync complete: ${upserted} queues`);
  }

  async syncExtensions(): Promise<ExtensionSyncResult> {
    if (this.syncing) {
      this.logger.warn('Extension sync already in progress, skipping');
      return { total: 0, linked: 0, autoLinked: 0, statuses: {} };
    }
    this.syncing = true;

    let endpoints: Array<{ extension: string; status: string }> = [];
    try {
      endpoints = await this.fetchEndpointsViaCli();
    } catch (err: any) {
      this.logger.warn(`Extension sync: failed to fetch endpoints: ${err.message}`);
      this.syncing = false;
      return { total: 0, linked: 0, autoLinked: 0, statuses: {} };
    }

    try {
      let linked = 0;
      let autoLinked = 0;
      const statuses: Record<string, string> = {};
      const extensionData: Array<{
        extension: string;
        crmUserId: string | null;
        displayName: string;
      }> = [];

      for (const ep of endpoints) {
        statuses[ep.extension] = ep.status;

        // ORDER IS LOAD-BEARING: the `if (existing)` early-return below is
        // what prevents the auto-link create path from ever hitting P2002
        // on the `extension` unique index. Do NOT reorder: if you move the
        // create path above this lookup, or remove the `continue`, you'll
        // hit a silent duplicate-extension failure the next time the cron
        // runs against an already-synced extension.
        const existing = await this.prisma.telephonyExtension.findUnique({
          where: { extension: ep.extension },
        });

        if (existing) {
          // Backfill sipPassword if missing (e.g. manually-created extensions)
          if (!existing.sipPassword) {
            try {
              const pwd = await this.readAuthPassword(ep.extension);
              if (pwd) {
                await this.prisma.telephonyExtension.update({
                  where: { id: existing.id },
                  data: {
                    sipPassword: pwd,
                    sipServer: existing.sipServer || this.sipServer,
                  },
                });
                this.logger.log(`Backfilled sipPassword for ext ${ep.extension}`);
              }
            } catch (err: any) {
              this.logger.warn(`Backfill sipPassword(${ep.extension}) failed: ${err.message}`);
            }
          }

          extensionData.push({
            extension: ep.extension,
            crmUserId: existing.crmUserId,
            displayName: existing.displayName,
          });
          linked++;
          continue;
        }

        // New extension discovered in FreePBX. The pool model (PR #294) says:
        // every FreePBX extension should have a corresponding CRM
        // TelephonyExtension row, regardless of whether it's linked yet.
        // Admin then links employees from the Telephony Extensions admin
        // page. Two paths into this branch:
        //
        //   (a) Legacy auto-link: extension's `accountcode` matches an
        //       active CRM user's email. Create with that user linked.
        //       (Operators 200-214 were originally onboarded this way.)
        //
        //   (b) Pool row: no accountcode, or accountcode doesn't match any
        //       CRM user. Create with `crmUserId = null` so the extension
        //       appears in the Telephony Extensions admin UI as
        //       "— available —" and admin can link an employee.
        //
        // BEFORE this fix (April 2026): branch (b) didn't exist — the
        // service `continue`d on missing accountcode and unmatched email,
        // so newly-created FreePBX extensions never showed up in CRM. The
        // pool model promised "create extension in FreePBX → admin sees it
        // in CRM" — that promise was broken until this commit.
        try {
          const sipPassword = await this.readAuthPassword(ep.extension);

          let linkedUser: {
            id: string;
            email: string;
            employee: { firstName: string; lastName: string } | null;
          } | null = null;
          const accountcode = await this.readAccountCode(ep.extension);
          if (accountcode) {
            const user = await this.prisma.user.findFirst({
              where: { email: accountcode, isActive: true },
              select: {
                id: true,
                email: true,
                employee: { select: { firstName: true, lastName: true } },
              },
            });
            if (user) {
              // The user must not already be linked to a different extension —
              // skip auto-link if they are. Pool row will still be created.
              const alreadyHasExt =
                await this.prisma.telephonyExtension.findUnique({
                  where: { crmUserId: user.id },
                });
              if (!alreadyHasExt) {
                linkedUser = user;
              }
            }
          }

          const displayName = linkedUser?.employee
            ? `${linkedUser.employee.firstName} ${linkedUser.employee.lastName}`.trim() ||
              linkedUser.email
            : linkedUser?.email ?? `Ext ${ep.extension}`;

          await this.prisma.telephonyExtension.create({
            data: {
              crmUserId: linkedUser?.id ?? null,
              extension: ep.extension,
              displayName,
              sipServer: this.sipServer,
              sipPassword: sipPassword || null,
              isOperator: true,
              isActive: true,
            },
          });

          extensionData.push({
            extension: ep.extension,
            crmUserId: linkedUser?.id ?? null,
            displayName,
          });

          if (linkedUser) {
            this.logger.log(
              `Auto-linked ext ${ep.extension} → ${linkedUser.email} (${displayName})`,
            );
            autoLinked++;
            linked++;
          } else {
            this.logger.log(
              `Pool row created for ext ${ep.extension} (unlinked — admin can link via Telephony Extensions)`,
            );
          }
        } catch (err: any) {
          // P2002 on `crmUserId @unique` happens when an admin linked
          // this user to a different extension via the UI between our
          // findFirst (line ~200) and create (line ~218). Recoverable:
          // fall back to creating a pool row (crmUserId=null) so the
          // extension still appears in CRM. The admin's UI link wins;
          // sync's auto-link loses the race silently.
          if (err?.code === 'P2002') {
            try {
              await this.prisma.telephonyExtension.create({
                data: {
                  crmUserId: null,
                  extension: ep.extension,
                  displayName: `Ext ${ep.extension}`,
                  sipServer: this.sipServer,
                  sipPassword: null,
                  isOperator: true,
                  isActive: true,
                },
              });
              extensionData.push({
                extension: ep.extension,
                crmUserId: null,
                displayName: `Ext ${ep.extension}`,
              });
              this.logger.log(
                `Pool row for ext ${ep.extension} (admin won link race during sync)`,
              );
            } catch (fallbackErr: any) {
              this.logger.warn(
                `Pool fallback failed for ext ${ep.extension}: ${fallbackErr.message}`,
              );
            }
          } else {
            this.logger.warn(
              `Failed to create CRM row for ext ${ep.extension}: ${err.message}`,
            );
          }
        }
      }

      this.stateManager.refreshExtensionMap(extensionData);
      this.logger.log(
        `Extension sync: ${endpoints.length} endpoints, ${linked} linked, ${autoLinked} auto-linked`,
      );

      return { total: endpoints.length, linked, autoLinked, statuses };
    } finally {
      this.syncing = false;
    }
  }

  /** Trigger sync on demand (for admin refresh button). */
  async syncNow(): Promise<ExtensionSyncResult> {
    if (!this.enabled || !this.amiClient.connected) {
      return { total: 0, linked: 0, autoLinked: 0, statuses: {} };
    }
    await this.syncQueues();
    return this.syncExtensions();
  }

  /** Read the SIP registration status for all endpoints. */
  async getEndpointStatuses(): Promise<Record<string, string>> {
    if (!this.enabled || !this.amiClient.connected) return {};

    try {
      const endpoints = await this.fetchEndpointsViaCli();
      const statuses: Record<string, string> = {};
      for (const ep of endpoints) {
        statuses[ep.extension] = ep.status;
      }
      return statuses;
    } catch {
      return {};
    }
  }

  private async readAccountCode(ext: string): Promise<string | null> {
    try {
      const res = await this.amiClient.sendAction({
        Action: 'Command',
        Command: `pjsip show endpoint ${ext}`,
      });
      const output = this.extractCommandOutput(res);
      const match = output.match(/accountcode\s*:\s*([\w.@+-]+)/i);
      return match?.[1]?.trim() || null;
    } catch (err: any) {
      this.logger.warn(`readAccountCode(${ext}) error: ${err.message}`);
      return null;
    }
  }

  private async readAuthPassword(ext: string): Promise<string | null> {
    // AMI `Command` returns the raw `pjsip show auth <ext>-auth` text. The
    // payload looks like:
    //
    //   ParameterName  : ParameterValue
    //   ===========================================
    //   auth_type      : userpass
    //   md5_cred       :
    //   nonce_lifetime : 32
    //   password       : <secret>
    //   realm          :
    //   username       : <ext>
    //
    // The previous regex matched on `(\S+?)\s*(?:,|$)` without the `m` flag,
    // so `$` meant end-of-string. With many lines after the password line,
    // it never matched → password silently came back as null. Field-found
    // when a newly-discovered extension's softphone could not register.
    //
    // The line we want is anchored to its own start: `^\s*password\s*:\s*(\S+)`
    // with the `m` flag so `^` matches each line. We also exclude the
    // empty-password case (password line with no value, e.g. `md5_cred :`
    // would never match because of the literal "password" prefix anyway,
    // but guard against an empty-value password line just in case).
    try {
      const res = await this.amiClient.sendAction({
        Action: 'Command',
        Command: `pjsip show auth ${ext}-auth`,
      });
      const output = this.extractCommandOutput(res);
      const match = output.match(/^\s*password\s*:\s*(\S+)\s*$/im);
      return match?.[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch queues via AMI Command action (CLI text output).
   * Parses `queue show` output lines like:
   *   "100 has 0 calls ... in 'rrmemory' strategy ..."
   */
  private async fetchQueuesViaCli(): Promise<
    Array<{ name: string; strategy: string }>
  > {
    const res = await this.amiClient.sendAction({
      Action: 'Command',
      Command: 'queue show',
    });

    const output = this.extractCommandOutput(res);

    const queues: Array<{ name: string; strategy: string }> = [];
    // Match lines like: "100 has 0 calls (max unlimited) in 'rrmemory' strategy"
    const regex = /^(\S+)\s+has\s+\d+\s+calls?\s+.*?in\s+'(\w+)'\s+strategy/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(output)) !== null) {
      queues.push({ name: match[1], strategy: match[2] });
    }

    return queues;
  }

  /**
   * Fetch PJSIP endpoints via AMI Command action (CLI text output).
   * The asterisk-manager library doesn't collect multi-event responses from
   * PJSIPShowEndpoints, so we use the CLI command instead.
   */
  private async fetchEndpointsViaCli(): Promise<
    Array<{ extension: string; status: string }>
  > {
    const res = await this.amiClient.sendAction({
      Action: 'Command',
      Command: 'pjsip show endpoints',
    });

    const output = this.extractCommandOutput(res);

    const endpoints: Array<{ extension: string; status: string }> = [];
    // Match lines like: " Endpoint:  200/200    Not in use    0 of inf"
    // or " Endpoint:  201        Unavailable   0 of inf"
    const regex = /Endpoint:\s+(\d+)(?:\/\S+)?\s+(Not in use|Unavailable|In use|Busy|Ringing|On Hold|Ring, In Use|Unknown)/gi;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(output)) !== null) {
      endpoints.push({
        extension: match[1],
        status: match[2].toLowerCase().trim(),
      });
    }

    return endpoints;
  }

  private extractCommandOutput(res: any): string {
    const raw = res?.output ?? res?.content ?? res;
    if (typeof raw === 'string') return raw;
    if (Array.isArray(raw)) return raw.join('\n');
    return JSON.stringify(raw);
  }

  private mapStrategy(raw: string): any {
    const map: Record<string, string> = {
      rrmemory: 'RRMEMORY',
      fewestcalls: 'FEWESTCALLS',
      random: 'RANDOM',
      ringall: 'RINGALL',
      linear: 'LINEAR',
      wrandom: 'WRANDOM',
    };
    return map[(raw ?? '').toLowerCase()] ?? 'RRMEMORY';
  }
}
