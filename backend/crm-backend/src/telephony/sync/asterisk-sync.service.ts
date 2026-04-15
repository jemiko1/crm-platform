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
          isAfterHoursQueue: this.afterHoursQueues.has(q.name),
          isActive: true,
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
        crmUserId: string;
        displayName: string;
      }> = [];

      for (const ep of endpoints) {
        statuses[ep.extension] = ep.status;

        const existing = await this.prisma.telephonyExtension.findUnique({
          where: { extension: ep.extension },
        });

        if (existing) {
          extensionData.push({
            extension: ep.extension,
            crmUserId: existing.crmUserId,
            displayName: existing.displayName,
          });
          linked++;
          continue;
        }

        // Auto-link: read accountcode from Asterisk, match to CRM user email
        try {
          const accountcode = await this.readAccountCode(ep.extension);
          if (!accountcode) continue;

          const user = await this.prisma.user.findFirst({
            where: { email: accountcode, isActive: true },
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          });
          if (!user) continue;

          // Check user doesn't already have an extension
          const alreadyHasExt = await this.prisma.telephonyExtension.findUnique({
            where: { crmUserId: user.id },
          });
          if (alreadyHasExt) continue;

          const sipPassword = await this.readAuthPassword(ep.extension);
          const displayName = user.employee
            ? `${user.employee.firstName} ${user.employee.lastName}`
            : user.email;

          await this.prisma.telephonyExtension.create({
            data: {
              crmUserId: user.id,
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
            crmUserId: user.id,
            displayName,
          });

          this.logger.log(
            `Auto-linked ext ${ep.extension} → ${user.email} (${displayName})`,
          );
          autoLinked++;
          linked++;
        } catch (err: any) {
          this.logger.warn(
            `Auto-link failed for ext ${ep.extension}: ${err.message}`,
          );
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
      const match = output.match(/accountcode\s*:\s*([\w.@+\-]+)/i);
      return match?.[1]?.trim() || null;
    } catch (err: any) {
      this.logger.warn(`readAccountCode(${ext}) error: ${err.message}`);
      return null;
    }
  }

  private async readAuthPassword(ext: string): Promise<string | null> {
    try {
      const res = await this.amiClient.sendAction({
        Action: 'Command',
        Command: `pjsip show auth ${ext}-auth`,
      });
      const output = this.extractCommandOutput(res);
      const match = output.match(/password\s*:\s*(\S+?)\s*(?:,|$)/i);
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
