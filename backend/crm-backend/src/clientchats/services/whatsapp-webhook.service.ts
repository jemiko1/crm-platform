import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType } from '@prisma/client';

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  private getWebhookBaseUrl(): string {
    const url =
      process.env.CLIENTCHATS_WEBHOOK_BASE_URL ||
      process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL;
    return url ? url.replace(/\/$/, '') : '';
  }

  async getToken(): Promise<string> {
    const account = await this.prisma.clientChatChannelAccount.findFirst({
      where: { type: ClientChatChannelType.WHATSAPP, status: 'ACTIVE' },
    });
    const token =
      (account?.metadata as Record<string, unknown>)?.waAccessToken as
        | string
        | undefined;
    return token || process.env.WA_ACCESS_TOKEN || '';
  }

  async getPhoneNumberId(): Promise<string> {
    const account = await this.prisma.clientChatChannelAccount.findFirst({
      where: { type: ClientChatChannelType.WHATSAPP, status: 'ACTIVE' },
    });
    const id =
      (account?.metadata as Record<string, unknown>)?.waPhoneNumberId as
        | string
        | undefined;
    return id || process.env.WA_PHONE_NUMBER_ID || '';
  }

  /**
   * Validates WhatsApp credentials by fetching business account info.
   * Webhook URL is configured in Meta Developer Console (same app as WhatsApp).
   */
  async getWebhookStatus(): Promise<{
    ok: boolean;
    phoneNumber?: string;
    webhookUrl?: string;
    error?: string;
  }> {
    const token = await this.getToken();
    const phoneNumberId = await this.getPhoneNumberId();

    if (!token) {
      return { ok: false, error: 'WhatsApp access token not configured' };
    }
    if (!phoneNumberId) {
      return { ok: false, error: 'WhatsApp phone number ID not configured' };
    }

    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/${phoneNumberId}?fields=verified_name,display_phone_number&access_token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as Record<string, unknown>;

      if (data.error) {
        const errObj = data.error as Record<string, unknown>;
        const errMsg = (errObj.message as string) || 'Invalid token';
        return { ok: false, error: errMsg };
      }

      const base = this.getWebhookBaseUrl();
      const webhookUrl = base
        ? `${base}/public/clientchats/webhook/whatsapp`
        : undefined;

      return {
        ok: true,
        phoneNumber: data.display_phone_number as string | undefined,
        webhookUrl,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp token validation failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
