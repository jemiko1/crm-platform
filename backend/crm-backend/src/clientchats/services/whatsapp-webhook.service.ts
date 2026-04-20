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
   * Most recent inbound message timestamp across all WHATSAPP conversations.
   * Used by the admin panel to detect "webhook subscription silently broke"
   * — the canonical failure mode when a host/domain migration happens and
   * Meta's webhook callback URL isn't updated. Meta stops delivering but
   * reports no error, and our token-validation check still returns OK.
   *
   * Returns null if no inbound WhatsApp message has ever been received.
   */
  async getLastInboundAt(): Promise<Date | null> {
    const latest = await this.prisma.clientChatMessage.findFirst({
      where: {
        direction: 'IN',
        conversation: {
          channelAccount: { type: ClientChatChannelType.WHATSAPP },
        },
      },
      orderBy: { sentAt: 'desc' },
      select: { sentAt: true },
    });
    return latest?.sentAt ?? null;
  }

  /**
   * Validates WhatsApp credentials by fetching business account info AND
   * reports on actual message flow (last inbound timestamp, health verdict).
   *
   * Token validation alone gives FALSE CONFIDENCE — a valid token with a
   * misconfigured Meta webhook subscription produces "connected" without
   * any actual message delivery. Including `lastInboundAt` + a health
   * verdict lets the admin panel surface "webhook likely broken" even
   * when the token is fine (audit follow-up to April 2026 outage).
   *
   * Webhook URL is configured in Meta Developer Console (same app as WhatsApp).
   */
  async getWebhookStatus(): Promise<{
    ok: boolean;
    phoneNumber?: string;
    webhookUrl?: string;
    error?: string;
    lastInboundAt?: string | null;
    inboundHealth?: 'ok' | 'stale' | 'never';
    inboundStaleHours?: number | null;
  }> {
    const token = await this.getToken();
    const phoneNumberId = await this.getPhoneNumberId();

    if (!token) {
      return { ok: false, error: 'WhatsApp access token not configured' };
    }
    if (!phoneNumberId) {
      return { ok: false, error: 'WhatsApp phone number ID not configured' };
    }

    // Fetch inbound freshness in parallel with the Meta token validation.
    // Never blocks the status response — if the DB query fails, we still
    // return the Meta-token verdict.
    const lastInboundPromise = this.getLastInboundAt().catch(() => null);

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

      // Compute freshness verdict. > 24h of silence on a channel that has
      // ever received messages is the heuristic for "Meta's webhook likely
      // isn't reaching us anymore". Under 24h = "ok". Never received = "never".
      const lastInbound = await lastInboundPromise;
      let inboundHealth: 'ok' | 'stale' | 'never';
      let inboundStaleHours: number | null = null;
      if (!lastInbound) {
        inboundHealth = 'never';
      } else {
        const ageMs = Date.now() - lastInbound.getTime();
        inboundStaleHours = Math.floor(ageMs / (1000 * 60 * 60));
        inboundHealth = inboundStaleHours > 24 ? 'stale' : 'ok';
      }

      return {
        ok: true,
        phoneNumber: data.display_phone_number as string | undefined,
        webhookUrl,
        lastInboundAt: lastInbound ? lastInbound.toISOString() : null,
        inboundHealth,
        inboundStaleHours,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp token validation failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
