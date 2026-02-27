import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType } from '@prisma/client';

const VIBER_API = 'https://chatapi.viber.com/pa';

@Injectable()
export class ViberWebhookService {
  private readonly logger = new Logger(ViberWebhookService.name);

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
      where: { type: ClientChatChannelType.VIBER, status: 'ACTIVE' },
    });
    const token =
      (account?.metadata as Record<string, unknown>)?.viberBotToken as
        | string
        | undefined;
    return token || process.env.VIBER_BOT_TOKEN || '';
  }

  async getWebhookInfo(): Promise<{
    ok: boolean;
    url?: string;
    accountName?: string;
    subscribersCount?: number;
    error?: string;
  }> {
    const token = await this.getToken();
    if (!token) {
      return { ok: false, error: 'Viber bot token not configured' };
    }

    try {
      const res = await fetch(`${VIBER_API}/get_account_info`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Viber-Auth-Token': token,
        },
        body: JSON.stringify({}),
      });

      const data = (await res.json()) as Record<string, unknown>;
      const status = data.status as number | undefined;

      if (status !== 0) {
        const errMsg =
          (data.status_message as string) || 'Unknown Viber error';
        return { ok: false, error: errMsg };
      }

      return {
        ok: true,
        url: data.webhook as string | undefined,
        accountName: data.name as string | undefined,
        subscribersCount: data.subscribers_count as number | undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Viber get_account_info failed: ${msg}`);
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
      return { ok: false, error: 'Viber bot token not configured. Save the token first.' };
    }

    const base = this.getWebhookBaseUrl();
    if (!base) {
      return {
        ok: false,
        error:
          'CLIENTCHATS_WEBHOOK_BASE_URL not set. Set it to your backend URL (e.g. https://api.example.com).',
      };
    }

    const webhookUrl = `${base}/public/clientchats/webhook/viber`;

    try {
      const res = await fetch(`${VIBER_API}/set_webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Viber-Auth-Token': token,
        },
        body: JSON.stringify({
          url: webhookUrl,
          event_types: [
            'delivered',
            'seen',
            'failed',
            'subscribed',
            'unsubscribed',
            'conversation_started',
            'message',
          ],
          send_name: true,
          send_photo: false,
        }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      const status = data.status as number | undefined;

      if (status !== 0) {
        const errMsg =
          (data.status_message as string) || 'Unknown Viber error';
        this.logger.error(`Viber set_webhook failed: ${errMsg}`);
        return { ok: false, error: errMsg };
      }

      this.logger.log(`Viber webhook registered: ${webhookUrl}`);
      return { ok: true, url: webhookUrl };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Viber set_webhook failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }

  async deleteWebhook(): Promise<{ ok: boolean; error?: string }> {
    const token = await this.getToken();
    if (!token) {
      return { ok: false, error: 'Viber bot token not configured' };
    }

    try {
      const res = await fetch(`${VIBER_API}/set_webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Viber-Auth-Token': token,
        },
        body: JSON.stringify({ url: '' }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      const status = data.status as number | undefined;

      return {
        ok: status === 0,
        error:
          status !== 0 ? (data.status_message as string) : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }
}
