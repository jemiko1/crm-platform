import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';

@Injectable()
export class AsteriskSyncService implements OnModuleInit {
  private readonly logger = new Logger(AsteriskSyncService.name);
  private readonly enabled: boolean;
  private readonly afterHoursQueues: Set<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly amiClient: AmiClientService,
    private readonly stateManager: TelephonyStateManager,
  ) {
    this.enabled = process.env.AMI_ENABLED === 'true';
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

  async syncExtensions(): Promise<void> {
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
        return;
      }
    }

    const endpoints = this.parseEndpoints(response);
    let synced = 0;
    const extensionData: Array<{
      extension: string;
      crmUserId: string;
      displayName: string;
    }> = [];

    for (const ep of endpoints) {
      const existing = await this.prisma.telephonyExtension.findUnique({
        where: { extension: ep.extension },
      });

      if (existing) {
        extensionData.push({
          extension: ep.extension,
          crmUserId: existing.crmUserId,
          displayName: existing.displayName,
        });
        synced++;
      }
    }

    this.stateManager.refreshExtensionMap(extensionData);
    this.logger.log(
      `Extension sync complete: ${endpoints.length} endpoints, ${synced} linked to CRM`,
    );
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
