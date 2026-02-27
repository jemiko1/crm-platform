import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType } from '@prisma/client';

const TELEGRAM_API = 'https://api.telegram.org/bot';

@Injectable()
export class TelegramWebhookService {
  private readonly logger = new Logger(TelegramWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getWebhookBaseUrl(): string {
    const url =
      process.env.CLIENTCHATS_WEBHOOK_BASE_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL;
    if (!url) {
      this.logger.warn(
        'CLIENTCHATS_WEBHOOK_BASE_URL not set — webhook registration will fail',
      );
      return '';
    }
    return url.replace(/\/$/, '');
  }

  async getToken(): Promise<string> {
    const account = await this.prisma.clientChatChannelAccount.findFirst({
      where: { type: ClientChatChannelType.TELEGRAM, status: 'ACTIVE' },
    });
    const token =
      (account?.metadata as Record<string, unknown>)?.telegramBotToken as
        | string
        | undefined;
    return token || process.env.TELEGRAM_BOT_TOKEN || '';
  }

  async getWebhookInfo(): Promise<{
    ok: boolean;
    url?: string;
    hasCustomCertificate?: boolean;
    pendingUpdateCount?: number;
    error?: string;
  }> {
    const token = await this.getToken();
    if (!token) {
      return { ok: false, error: 'Telegram bot token not configured' };
    }

    try {
      const res = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`);
      const data = (await res.json()) as Record<string, unknown>;
      const result = data.result as Record<string, unknown> | undefined;

      return {
        ok: data.ok === true,
        url: result?.url as string | undefined,
        hasCustomCertificate: result?.has_custom_certificate as boolean | undefined,
        pendingUpdateCount: result?.pending_update_count as number | undefined,
        error: data.ok === false ? (data.description as string) : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Telegram getWebhookInfo failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  async registerWebhook(): Promise<{
    ok: boolean;
    url?: string;
    error?: string;
  }> {
    const token = await this.getToken();
    if (!token) {
      return { ok: false, error: 'Telegram bot token not configured. Save the token first.' };
    }

    const base = this.getWebhookBaseUrl();
    if (!base) {
      return {
        ok: false,
        error:
          'CLIENTCHATS_WEBHOOK_BASE_URL not set. Set it to your backend URL (e.g. https://api.example.com).',
      };
    }

    const webhookUrl = `${base}/public/clientchats/webhook/telegram`;

    try {
      const res = await fetch(
        `${TELEGRAM_API}${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`,
      );
      const data = (await res.json()) as Record<string, unknown>;

      if (data.ok !== true) {
        const errMsg = (data.description as string) || 'Unknown Telegram error';
        this.logger.error(`Telegram setWebhook failed: ${errMsg}`);
        return { ok: false, error: errMsg };
      }

      this.logger.log(`Telegram webhook registered: ${webhookUrl}`);
      return { ok: true, url: webhookUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Telegram setWebhook failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  async deleteWebhook(): Promise<{ ok: boolean; error?: string }> {
    const token = await this.getToken();
    if (!token) {
      return { ok: false, error: 'Telegram bot token not configured' };
    }

    try {
      const res = await fetch(`${TELEGRAM_API}${token}/deleteWebhook`);
      const data = (await res.json()) as Record<string, unknown>;
      return {
        ok: data.ok === true,
        error: data.ok === false ? (data.description as string) : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
