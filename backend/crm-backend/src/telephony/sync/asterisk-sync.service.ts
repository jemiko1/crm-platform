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
    const response = await this.amiClient.sendAction({
      Action: 'QueueStatus',
    });

    const queues = this.parseQueueStatus(response);
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

    let response: any;
    try {
      response = await this.amiClient.sendAction({
        Action: 'PJSIPShowEndpoints',
      });
    } catch {
      try {
        response = await this.amiClient.sendAction({ Action: 'SIPpeers' });
      } catch (err: any) {
        this.logger.warn(`Extension sync: neither PJSIP nor SIP available: ${err.message}`);
        this.syncing = false;
        return { total: 0, linked: 0, autoLinked: 0, statuses: {} };
      }
    }

    try {
      const endpoints = this.parseEndpoints(response);
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

    let response: any;
    try {
      response = await this.amiClient.sendAction({
        Action: 'PJSIPShowEndpoints',
      });
    } catch {
      return {};
    }

    const endpoints = this.parseEndpoints(response);
    const statuses: Record<string, string> = {};
    for (const ep of endpoints) {
      statuses[ep.extension] = ep.status;
    }
    return statuses;
  }

  private async readAccountCode(ext: string): Promise<string | null> {
    try {
      const res = await this.amiClient.sendAction({
        Action: 'Command',
        Command: `pjsip show endpoint ${ext}`,
      });
      const output: string =
        typeof res === 'string'
          ? res
          : res?.output ?? res?.content ?? JSON.stringify(res);
      const match = output.match(/accountcode\s*:\s*(.+)/i);
      return match?.[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  private async readAuthPassword(ext: string): Promise<string | null> {
    try {
      const res = await this.amiClient.sendAction({
        Action: 'Command',
        Command: `pjsip show auth ${ext}-auth`,
      });
      const output: string =
        typeof res === 'string'
          ? res
          : res?.output ?? res?.content ?? JSON.stringify(res);
      const match = output.match(/password\s*:\s*(\S+)/i);
      return match?.[1]?.trim() || null;
    } catch {
      return null;
    }
  }

  private parseQueueStatus(
    response: any,
  ): Array<{ name: string; strategy: string }> {
    if (!response) return [];
    const events: any[] = Array.isArray(response) ? response : [response];
    const queues: Array<{ name: string; strategy: string }> = [];
    const seen = new Set<string>();

    for (const evt of events) {
      if (evt.event === 'QueueParams' && evt.queue && !seen.has(evt.queue)) {
        seen.add(evt.queue);
        queues.push({
          name: evt.queue,
          strategy: evt.strategy ?? 'rrmemory',
        });
      }
    }
    return queues;
  }

  private parseEndpoints(
    response: any,
  ): Array<{ extension: string; status: string }> {
    if (!response) return [];
    const events: any[] = Array.isArray(response) ? response : [response];
    const endpoints: Array<{ extension: string; status: string }> = [];

    for (const evt of events) {
      const ext =
        evt.objectname ??
        evt.objectName ??
        evt.peer?.replace(/^SIP\//, '');
      if (ext && /^\d+$/.test(ext)) {
        endpoints.push({
          extension: ext,
          status: evt.devicestate ?? evt.status ?? 'unknown',
        });
      }
    }
    return endpoints;
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
