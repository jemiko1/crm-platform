import { ClientChatChannelType } from '@prisma/client';
import { Request } from 'express';

export interface ParsedInboundMessage {
  externalConversationId: string;
  externalUserId: string;
  externalMessageId: string;
  displayName?: string;
  phone?: string;
  email?: string;
  text: string;
  attachments?: Record<string, unknown>[];
  rawPayload: unknown;
}

export interface SendResult {
  externalMessageId: string;
  success: boolean;
  error?: string;
}

export interface ChannelAdapter {
  readonly channelType: ClientChatChannelType;

  /** Validate an inbound webhook request (signature, token, etc.). */
  verifyWebhook(req: Request): boolean;

  /** Parse the raw webhook / POST body into a normalised message. */
  parseInbound(body: unknown): ParsedInboundMessage | null;

  /** Deliver an outbound message through the channel. */
  sendMessage(
    externalConversationId: string,
    text: string,
    channelAccountMetadata: Record<string, unknown>,
    attachments?: Record<string, unknown>[],
  ): Promise<SendResult>;
}
