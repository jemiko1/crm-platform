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
      this.logger.warn('WhatsApp/FB app secret not configured – skipping signature check');
      return true;
    }

    const signature = req.headers['x-hub-signature-256'] as string;
    if (!signature) {
      this.logger.warn('Missing x-hub-signature-256 header');
      return false;
    }

    const rawBody = (req as any).rawBody as Buffer | undefined;
    const body = rawBody
      ? rawBody
      : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', appSecret).update(body).digest('hex');

    try {
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length) {
        this.logger.warn('WhatsApp signature length mismatch');
        return false;
      }
      return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      this.logger.warn('WhatsApp signature verification error');
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
    const attachments: Record<string, unknown>[] = [];

    if (type === 'text') {
      const textObj = msg.text as Record<string, string> | undefined;
      text = textObj?.body ?? '';
    } else if (
      type === 'image' ||
      type === 'video' ||
      type === 'audio' ||
      type === 'document' ||
      type === 'sticker'
    ) {
      const media = msg[type] as Record<string, unknown> | undefined;
      if (media) {
        attachments.push({
          type,
          mediaId: media.id as string,
          mimeType: media.mime_type as string,
          sha256: media.sha256 as string | undefined,
          filename: media.filename as string | undefined,
        });
        const caption = media.caption as string | undefined;
        if (caption) text = caption;
        if (!text) text = `[${type}]`;
      }
    } else if (type === 'location') {
      const loc = msg.location as Record<string, unknown> | undefined;
      if (loc) {
        text = `[Location: ${loc.latitude}, ${loc.longitude}${loc.name ? ` - ${loc.name}` : ''}]`;
        attachments.push({ type: 'location', ...loc });
      }
    } else if (type === 'contacts') {
      text = '[Contact card]';
    } else if (type === 'reaction') {
      return null;
    } else {
      text = text || `[${type ?? 'unknown'}]`;
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
      phone: from,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      rawPayload: body,
    };
  }

  async sendMessage(
    externalConversationId: string,
    text: string,
    channelAccountMetadata: Record<string, unknown>,
    media?: { buffer: Buffer; mimeType: string; filename: string },
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

    const to = externalConversationId.replace('wa_', '').replace(/\D/g, '');

    try {
      if (media) {
        return this.sendMediaMessage(phoneNumberId, token, to, text, media);
      }
      return this.sendTextMessage(phoneNumberId, token, to, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp send error: ${msg}`);
      return { externalMessageId: '', success: false, error: msg };
    }
  }

  private async sendTextMessage(
    phoneNumberId: string,
    token: string,
    to: string,
    text: string,
  ): Promise<SendResult> {
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
          to,
          type: 'text',
          text: { body: text },
        }),
      },
    );
    return this.parseWaResponse(res);
  }

  private async sendMediaMessage(
    phoneNumberId: string,
    token: string,
    to: string,
    text: string,
    media: { buffer: Buffer; mimeType: string; filename: string },
  ): Promise<SendResult> {
    const mediaId = await this.uploadMedia(phoneNumberId, token, media);
    if (!mediaId) {
      return { externalMessageId: '', success: false, error: 'Media upload failed' };
    }

    const mediaType = media.mimeType.startsWith('image/') ? 'image' : 'document';
    const mediaPayload: Record<string, unknown> = { id: mediaId };
    if (text) {
      if (mediaType === 'image') {
        mediaPayload.caption = text;
      }
    }
    if (mediaType === 'document') {
      mediaPayload.filename = media.filename;
    }

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
          to,
          type: mediaType,
          [mediaType]: mediaPayload,
        }),
      },
    );

    const result = await this.parseWaResponse(res);

    if (result.success && text && mediaType === 'document') {
      await this.sendTextMessage(phoneNumberId, token, to, text).catch((err) =>
        this.logger.warn(`Follow-up text after document failed: ${err}`),
      );
    }

    return result;
  }

  private async uploadMedia(
    phoneNumberId: string,
    token: string,
    media: { buffer: Buffer; mimeType: string; filename: string },
  ): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([new Uint8Array(media.buffer)], { type: media.mimeType }),
        media.filename,
      );
      formData.append('type', media.mimeType);
      formData.append('messaging_product', 'whatsapp');

      const res = await fetch(
        `https://graph.facebook.com/v21.0/${phoneNumberId}/media`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );

      const data = (await res.json()) as Record<string, unknown>;
      if (data.error) {
        const errObj = data.error as Record<string, unknown>;
        this.logger.error(`WhatsApp media upload failed: ${errObj.message}`);
        return null;
      }
      return (data.id as string) ?? null;
    } catch (err) {
      this.logger.error(`WhatsApp media upload error: ${err}`);
      return null;
    }
  }

  private async parseWaResponse(res: Response): Promise<SendResult> {
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
  }
}
