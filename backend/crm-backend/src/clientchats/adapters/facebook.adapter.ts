import { Injectable, Logger } from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { Request } from 'express';
import * as crypto from 'crypto';
import {
  ChannelAdapter,
  ParsedInboundMessage,
  SendResult,
} from '../interfaces/channel-adapter.interface';

const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0/me/messages';

@Injectable()
export class FacebookAdapter implements ChannelAdapter {
  private readonly logger = new Logger(FacebookAdapter.name);
  readonly channelType = ClientChatChannelType.FACEBOOK;

  private get pageToken(): string {
    return process.env.FB_PAGE_ACCESS_TOKEN || '';
  }

  private get appSecret(): string {
    return process.env.FB_APP_SECRET || '';
  }

  private get verifyToken(): string {
    return process.env.FB_VERIFY_TOKEN || '';
  }

  /** Validate GET subscription verification or POST signature. */
  verifyWebhook(req: Request): boolean {
    if (req.method === 'GET') {
      return this.verifySubscription(req);
    }
    return this.verifySignature(req);
  }

  private verifySubscription(req: Request): boolean {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;

    if (mode !== 'subscribe' || !this.verifyToken) return false;
    return token === this.verifyToken;
  }

  private verifySignature(req: Request): boolean {
    if (!this.appSecret) {
      this.logger.error('FB_APP_SECRET is not configured');
      return false;
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) return false;

    const body =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', this.appSecret).update(body).digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }

  parseInbound(body: unknown): ParsedInboundMessage | null {
    const b = body as Record<string, unknown>;
    const entry = b.entry as Record<string, unknown>[] | undefined;
    if (!entry?.length) return null;

    const messaging = (entry[0].messaging as Record<string, unknown>[]) ?? [];
    if (!messaging.length) return null;

    const event = messaging[0];
    const sender = event.sender as Record<string, string> | undefined;
    const message = event.message as Record<string, unknown> | undefined;

    if (!sender?.id || !message) {
      this.logger.debug('Facebook event without sender or message — skipping');
      return null;
    }

    return {
      externalConversationId: `fb_${sender.id}`,
      externalUserId: sender.id,
      externalMessageId: (message.mid as string) || `fb_${Date.now()}`,
      displayName: `FB User ${sender.id.slice(-4)}`,
      text: (message.text as string) || '',
      rawPayload: body,
    };
  }

  async sendMessage(
    externalConversationId: string,
    text: string,
    channelAccountMetadata: Record<string, unknown>,
  ): Promise<SendResult> {
    const token =
      (channelAccountMetadata.fbPageAccessToken as string) || this.pageToken;
    if (!token) {
      return {
        externalMessageId: '',
        success: false,
        error: 'No Facebook page token',
      };
    }

    const recipientId = externalConversationId.replace('fb_', '');

    try {
      const res = await fetch(`${FB_GRAPH_URL}?access_token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
          messaging_type: 'RESPONSE',
        }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (data.error) {
        const errObj = data.error as Record<string, unknown>;
        const errMsg = (errObj.message as string) || 'Unknown Facebook error';
        this.logger.error(`Facebook send failed: ${errMsg}`);
        return { externalMessageId: '', success: false, error: errMsg };
      }

      return {
        externalMessageId:
          (data.message_id as string) || `fb_out_${Date.now()}`,
        success: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Facebook send error: ${msg}`);
      return { externalMessageId: '', success: false, error: msg };
    }
  }

  /** Return the hub.challenge for Facebook webhook verification GET. */
  getVerificationChallenge(req: Request): string | null {
    const challenge = req.query['hub.challenge'] as string | undefined;
    return challenge ?? null;
  }
}
