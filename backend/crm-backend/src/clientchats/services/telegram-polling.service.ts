import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { ClientChatsCoreService } from './clientchats-core.service';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { TelegramWebhookService } from './telegram-webhook.service';

const TELEGRAM_API = 'https://api.telegram.org/bot';

/**
 * Fetches pending Telegram updates when webhook fails to deliver.
 * When pending_update_count > 0, we delete webhook, get updates via getUpdates,
 * process them, then re-register webhook. Works without any tunnel.
 */
@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollingService.name);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly core: ClientChatsCoreService,
    private readonly telegram: TelegramAdapter,
    private readonly webhookService: TelegramWebhookService,
  ) {}

  async onModuleInit() {
    const token = await this.webhookService.getToken();
    if (!token) return;

    this.poll().catch(() => {});
    this.intervalId = setInterval(() => this.poll(), 10_000);
    this.logger.log('Telegram polling fallback started (every 10s)');
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async poll() {
    try {
      const info = await this.webhookService.getWebhookInfo();
      if (!info.ok || (info.pendingUpdateCount ?? 0) === 0) return;

      this.logger.log(
        `Recovering ${info.pendingUpdateCount} pending Telegram update(s) via getUpdates`,
      );

      const token = await this.webhookService.getToken();
      if (!token) return;

      await this.webhookService.deleteWebhook();

      let offset = 0;
      let processed = 0;

      while (true) {
        const res = await fetch(
          `${TELEGRAM_API}${token}/getUpdates?offset=${offset}&timeout=2`,
        );
        const data = (await res.json()) as Record<string, unknown>;
        const updates = (data.result as unknown[]) ?? [];

        if (updates.length === 0) break;

        const account = await this.core.getOrCreateDefaultAccount(
          ClientChatChannelType.TELEGRAM,
        );

        for (const update of updates) {
          const u = update as Record<string, unknown>;
          const nextId = (u.update_id as number) ?? 0;
          if (nextId >= offset) offset = nextId + 1;

          const parsed = this.telegram.parseInbound(update);
          if (!parsed) continue;

          try {
            await this.core.processInbound(
              ClientChatChannelType.TELEGRAM,
              account.id,
              parsed,
            );
            processed++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to process Telegram update: ${msg}`);
          }
        }
      }

      if (processed > 0) {
        this.logger.log(`Processed ${processed} Telegram message(s) via polling`);
      }

      const base =
        process.env.CLIENTCHATS_WEBHOOK_BASE_URL ||
        process.env.PUBLIC_API_URL ||
        process.env.API_PUBLIC_URL;
      if (base) {
        await this.webhookService.registerWebhook();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Telegram polling: ${msg}`);
    }
  }
}
