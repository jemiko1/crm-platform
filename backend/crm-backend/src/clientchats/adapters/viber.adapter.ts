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
export class ViberAdapter implements ChannelAdapter {
  private readonly logger = new Logger(ViberAdapter.name);
  readonly channelType = ClientChatChannelType.VIBER;

  private get token(): string {
    return process.env.VIBER_BOT_TOKEN || '';
  }

  verifyWebhook(req: Request, tokenOverride?: string): boolean {
    const token = tokenOverride ?? this.token;
    if (!token) {
      this.logger.error('Viber token not configured (env or channel account)');
      return false;
    }

    const signature = req.headers['x-viber-content-signature'] as string;
    if (!signature) return false;

    const body =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const expected = crypto
      .createHmac('sha256', token)
      .update(body)
      .digest('hex');

    return signature === expected;
  }

  parseInbound(body: unknown): ParsedInboundMessage | null {
    const b = body as Record<string, unknown>;
    const event = b.event as string | undefined;

    if (event !== 'message') {
      this.logger.debug(`Viber non-message event: ${event}`);
      return null;
    }

    const sender = b.sender as Record<string, unknown> | undefined;
    const message = b.message as Record<string, unknown> | undefined;
    const messageToken = b.message_token;

    if (!sender || !message || !messageToken) {
      this.logger.warn('Viber message missing sender/message/token');
      return null;
    }

    const senderId = sender.id as string;
    const senderName = (sender.name as string) || 'Viber User';

    return {
      externalConversationId: `viber_${senderId}`,
      externalUserId: senderId,
      externalMessageId: String(messageToken),
      displayName: senderName,
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
      (channelAccountMetadata.viberBotToken as string) || this.token;
    if (!token) {
      return { externalMessageId: '', success: false, error: 'No Viber token' };
    }

    const receiverId = externalConversationId.replace('viber_', '');
    const senderName =
      (channelAccountMetadata.senderName as string) || 'Support';

    try {
      const res = await fetch('https://chatapi.viber.com/pa/send_message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Viber-Auth-Token': token,
        },
        body: JSON.stringify({
          receiver: receiverId,
          min_api_version: 1,
          sender: { name: senderName },
          type: 'text',
          text,
        }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (data.status !== 0) {
        const errMsg = (data.status_message as string) || 'Unknown Viber error';
        this.logger.error(`Viber send failed: ${errMsg}`);
        return { externalMessageId: '', success: false, error: errMsg };
      }

      return {
        externalMessageId: String(
          data.message_token || `viber_out_${Date.now()}`,
        ),
        success: true,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Viber send error: ${msg}`);
      return { externalMessageId: '', success: false, error: msg };
    }
  }
}
