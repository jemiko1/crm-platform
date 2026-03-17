import { Injectable, Logger } from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { Request } from 'express';
import {
  ChannelAdapter,
  ParsedInboundMessage,
  SendResult,
} from '../interfaces/channel-adapter.interface';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

@Injectable()
export class TelegramAdapter implements ChannelAdapter {
  private readonly logger = new Logger(TelegramAdapter.name);
  readonly channelType = ClientChatChannelType.TELEGRAM;

  private get token(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
  }

  verifyWebhook(req: Request, tokenOverride?: string): boolean {
    const token = tokenOverride ?? this.token;
    if (!token) {
      this.logger.error('Telegram token not configured (env or channel account)');
      return false;
    }

    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const headerToken = req.headers['x-telegram-bot-api-secret-token'] as string;
      if (headerToken !== secretToken) {
        this.logger.warn('Telegram webhook secret token mismatch');
        return false;
      }
    }

    return true;
  }

  parseInbound(body: unknown): ParsedInboundMessage | null {
    const b = body as Record<string, unknown>;
    const message = (b.message ?? b.edited_message) as Record<string, unknown> | undefined;

    if (!message) {
      this.logger.debug('Telegram update without message or edited_message');
      return null;
    }

    const from = message.from as Record<string, unknown> | undefined;
    const chat = message.chat as Record<string, unknown> | undefined;
    const messageId = message.message_id;
    const text = (message.text as string) || '';

    if (!from?.id || !chat?.id || !messageId) {
      this.logger.warn('Telegram message missing from/chat/message_id');
      return null;
    }

    const firstName = (from.first_name as string) || '';
    const lastName = (from.last_name as string) || '';
    const username = (from.username as string) || '';
    const displayName =
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      username ||
      `TG User ${String(from.id).slice(-4)}`;

    let phone: string | undefined;

    const contact = message.contact as Record<string, unknown> | undefined;
    if (contact?.phone_number) {
      phone = String(contact.phone_number).replace(/[^\d+]/g, '');
    }

    return {
      externalConversationId: `tg_${chat.id}`,
      externalUserId: String(from.id),
      externalMessageId: String(messageId),
      displayName,
      phone,
      text: contact && !text ? `Shared contact: ${contact.phone_number}` : text,
      rawPayload: body,
    };
  }

  /**
   * Fetch a Telegram user's profile via getChat. Returns their phone if available.
   */
  async fetchUserPhone(
    userId: string,
    channelAccountMetadata?: Record<string, unknown>,
  ): Promise<string | null> {
    const token =
      (channelAccountMetadata?.telegramBotToken as string) || this.token;
    if (!token) return null;

    try {
      const res = await fetch(`${TELEGRAM_API_BASE}${token}/getChat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: userId }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!data.ok) return null;

      const result = data.result as Record<string, unknown> | undefined;
      if (result?.phone_number) {
        return String(result.phone_number).replace(/[^\d+]/g, '');
      }
      return null;
    } catch (err) {
      this.logger.debug(`Failed to fetch Telegram user phone: ${err}`);
      return null;
    }
  }

  async sendMessage(
    externalConversationId: string,
    text: string,
    channelAccountMetadata: Record<string, unknown>,
    media?: { buffer: Buffer; mimeType: string; filename: string },
  ): Promise<SendResult> {
    const token =
      (channelAccountMetadata.telegramBotToken as string) || this.token;
    if (!token) {
      return { externalMessageId: '', success: false, error: 'No Telegram token' };
    }

    const chatId = externalConversationId.replace('tg_', '');

    try {
      if (media) {
        return this.sendMediaMessage(token, chatId, text, media);
      }
      return this.sendTextMessage(token, chatId, text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Telegram send error: ${msg}`);
      return { externalMessageId: '', success: false, error: msg };
    }
  }

  private async sendTextMessage(
    token: string,
    chatId: string,
    text: string,
  ): Promise<SendResult> {
    const res = await fetch(`${TELEGRAM_API_BASE}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    return this.parseTgResponse(res);
  }

  private async sendMediaMessage(
    token: string,
    chatId: string,
    text: string,
    media: { buffer: Buffer; mimeType: string; filename: string },
  ): Promise<SendResult> {
    const isImage = media.mimeType.startsWith('image/');
    const method = isImage ? 'sendPhoto' : 'sendDocument';
    const fieldName = isImage ? 'photo' : 'document';

    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append(
      fieldName,
      new Blob([new Uint8Array(media.buffer)], { type: media.mimeType }),
      media.filename,
    );
    if (text) {
      formData.append('caption', text);
    }

    const res = await fetch(`${TELEGRAM_API_BASE}${token}/${method}`, {
      method: 'POST',
      body: formData,
    });
    return this.parseTgResponse(res);
  }

  private async parseTgResponse(res: Response): Promise<SendResult> {
    const data = (await res.json()) as Record<string, unknown>;
    if (!data.ok) {
      const errMsg = (data.description as string) || 'Unknown Telegram error';
      this.logger.error(`Telegram send failed: ${errMsg}`);
      return { externalMessageId: '', success: false, error: errMsg };
    }

    const result = data.result as Record<string, unknown> | undefined;
    const messageId = result?.message_id;
    return {
      externalMessageId: messageId ? String(messageId) : `tg_out_${Date.now()}`,
      success: true,
    };
  }
}
