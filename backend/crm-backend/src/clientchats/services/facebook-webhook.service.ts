import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType } from '@prisma/client';

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';

@Injectable()
export class FacebookWebhookService {
  private readonly logger = new Logger(FacebookWebhookService.name);

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
      where: { type: ClientChatChannelType.FACEBOOK, status: 'ACTIVE' },
    });
    const token =
      (account?.metadata as Record<string, unknown>)?.fbPageAccessToken as
        | string
        | undefined;
    return token || process.env.FB_PAGE_ACCESS_TOKEN || '';
  }

  /**
   * Validates the page access token by calling Graph API.
   * Facebook webhook URL is configured in the Developer Console, not via API.
   */
  async getWebhookStatus(): Promise<{
    ok: boolean;
    pageName?: string;
    pageId?: string;
    webhookUrl?: string;
    error?: string;
  }> {
    const token = await this.getToken();
    if (!token) {
      return { ok: false, error: 'Facebook page access token not configured' };
    }

    try {
      const res = await fetch(
        `${FB_GRAPH_URL}/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as Record<string, unknown>;

      if (data.error) {
        const errObj = data.error as Record<string, unknown>;
        const errMsg = (errObj.message as string) || 'Invalid token';
        return { ok: false, error: errMsg };
      }

      const base = this.getWebhookBaseUrl();
      const webhookUrl = base
        ? `${base}/public/clientchats/webhook/facebook`
        : undefined;

      return {
        ok: true,
        pageName: data.name as string | undefined,
        pageId: data.id as string | undefined,
        webhookUrl,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Facebook token validation failed: ${msg}`);
      return { ok: false, error: msg };
    }
  }
}
