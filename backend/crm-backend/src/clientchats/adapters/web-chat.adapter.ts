import { Injectable, Logger } from '@nestjs/common';
import { ClientChatChannelType } from '@prisma/client';
import { Request } from 'express';
import {
  ChannelAdapter,
  ParsedInboundMessage,
  SendResult,
} from '../interfaces/channel-adapter.interface';

@Injectable()
export class WebChatAdapter implements ChannelAdapter {
  private readonly logger = new Logger(WebChatAdapter.name);
  readonly channelType = ClientChatChannelType.WEB;

  verifyWebhook(_req: Request): boolean {
    return true;
  }

  parseInbound(body: unknown): ParsedInboundMessage | null {
    const b = body as Record<string, unknown>;
    const visitorId = b.visitorId as string | undefined;
    const text = b.text as string | undefined;
    const messageId = b.messageId as string | undefined;

    if (!visitorId || !text) {
      this.logger.warn('Web chat message missing visitorId or text');
      return null;
    }

    return {
      externalConversationId: `web_${visitorId}`,
      externalUserId: visitorId,
      externalMessageId: messageId || this.fallbackId(visitorId, text),
      displayName: (b.name as string) || 'Visitor',
      phone: b.phone as string | undefined,
      email: b.email as string | undefined,
      text,
      rawPayload: body,
    };
  }

  async sendMessage(
    _externalConversationId: string,
    _text: string,
    _channelAccountMetadata: Record<string, unknown>,
  ): Promise<SendResult> {
    // Web chat does not push messages back — the frontend polls or uses WebSocket.
    return {
      externalMessageId: `web_out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      success: true,
    };
  }

  private fallbackId(visitorId: string, text: string): string {
    const ts = Date.now();
    return `web_${visitorId}_${ts}_${this.simpleHash(text)}`;
  }

  private simpleHash(input: string): string {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }
}
