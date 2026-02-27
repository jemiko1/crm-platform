import { Injectable, Logger } from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { Request } from 'express';
import * as crypto from 'crypto';
import {
  ChannelAdapter,
  ParsedInboundMessage,
  SendResult,
} from '../interfaces/channel-adapter.interface';

@Injectable()
export class WhatsAppAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);
  readonly channelType = ClientChatChannelType.WHATSAPP;

  verifyWebhook(
    req: Request,
    overrides?: { appSecret?: string; verifyToken?: string },
  ): boolean {
    if (req.method === 'GET') {
      return this.verifySubscription(req, overrides?.verifyToken);
    }
    return this.verifySignature(req, overrides?.appSecret);
  }

  getVerificationChallenge(req: Request): string | null {
    const challenge = req.query['hub.challenge'] as string | undefined;
    return challenge ?? null;
  }

  private verifySubscription(req: Request, tokenOverride?: string): boolean {
    const mode = req.query['hub.mode'] as string;
    const token = req.query['hub.verify_token'] as string;
    const verifyToken =
      tokenOverride ??
      process.env.WA_VERIFY_TOKEN ??
      process.env.FB_VERIFY_TOKEN ??
      '';

    if (mode !== 'subscribe' || !verifyToken) return false;
    return token === verifyToken;
  }

  private verifySignature(req: Request, secretOverride?: string): boolean {
    const appSecret =
      secretOverride ??
      process.env.WA_APP_SECRET ??
      process.env.FB_APP_SECRET ??
      '';

    if (!appSecret) {
      this.logger.warn('WhatsApp/FB app secret not configured for signature verification');
      return true;
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) return false;

    const body =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(body).digest('hex');

    try {
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length) return false;
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  parseInbound(body: unknown): ParsedInboundMessage | null {
    const b = body as Record<string, unknown>;
    if (b.object !== 'whatsapp_business_account') return null;

    const entry = b.entry as Record<string, unknown>[] | undefined;
    if (!entry?.length) return null;

    const changes = (entry[0].changes as Record<string, unknown>[]) ?? [];
    const value = changes[0]?.value as Record<string, unknown> | undefined;
    if (!value) return null;

    const messages = (value.messages as Record<string, unknown>[]) ?? [];
    if (!messages.length) return null;

    const msg = messages[0];
    const from = msg.from as string | undefined;
    const msgId = msg.id as string | undefined;
    const type = msg.type as string | undefined;

    if (!from || !msgId) {
      this.logger.debug('WhatsApp message missing from or id');
      return null;
    }

    let text = '';
    if (type === 'text') {
      const textObj = msg.text as Record<string, string> | undefined;
      text = textObj?.body ?? '';
    }

    const contacts = (value.contacts as Record<string, unknown>[]) ?? [];
    const contact = contacts[0] as Record<string, unknown> | undefined;
    const profile = contact?.profile as Record<string, string> | undefined;
    const displayName =
      profile?.name ?? `+${from}`;

    return {
      externalConversationId: `wa_${from}`,
      externalUserId: from,
      externalMessageId: msgId,
      displayName,
      text,
      rawPayload: body,
    };
  }

  async sendMessage(
    externalConversationId: string,
    text: string,
    channelAccountMetadata: Record<string, unknown>,
  ): Promise<SendResult> {
    const token =
      (channelAccountMetadata.waAccessToken as string) ||
      process.env.WA_ACCESS_TOKEN ||
      '';
    const phoneNumberId =
      (channelAccountMetadata.waPhoneNumberId as string) ||
      process.env.WA_PHONE_NUMBER_ID ||
      '';

    if (!token || !phoneNumberId) {
      return {
        externalMessageId: '',
        success: false,
        error: 'WhatsApp access token or phone number ID not configured',
      };
    }

    const to = externalConversationId.replace('wa_', '');

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to.replace(/\D/g, ''),
            type: 'text',
            text: { body: text },
          }),
        },
      );

      const data = (await res.json()) as Record<string, unknown>;
      if (data.error) {
        const errObj = data.error as Record<string, unknown>;
        const errMsg = (errObj.message as string) || 'Unknown WhatsApp error';
        this.logger.error(`WhatsApp send failed: ${errMsg}`);
        return { externalMessageId: '', success: false, error: errMsg };
      }

      const messages = data.messages as Record<string, unknown>[] | undefined;
      const msgId = messages?.[0]?.id as string | undefined;

      return {
        externalMessageId: msgId ?? `wa_out_${Date.now()}`,
        success: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp send error: ${msg}`);
      return { externalMessageId: '', success: false, error: msg };
    }
  }
}
