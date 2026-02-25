import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ClientChatChannelType,
  ClientChatDirection,
  ClientChatStatus,
} from '@prisma/client';
import { AdapterRegistryService } from '../adapters/adapter-registry.service';
import { ParsedInboundMessage } from '../interfaces/channel-adapter.interface';
import { ClientChatsMatchingService } from './clientchats-matching.service';
import { ConversationQueryDto } from '../dto/conversation-query.dto';

@Injectable()
export class ClientChatsCoreService {
  private readonly logger = new Logger(ClientChatsCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AdapterRegistryService,
    private readonly matching: ClientChatsMatchingService,
  ) {}

  // ── Inbound pipeline ──────────────────────────────────

  async processInbound(
    channelType: ClientChatChannelType,
    channelAccountId: string,
    parsed: ParsedInboundMessage,
  ) {
    const existing = await this.prisma.clientChatMessage.findUnique({
      where: { externalMessageId: parsed.externalMessageId },
    });
    if (existing) {
      this.logger.debug(
        `Duplicate message ignored: ${parsed.externalMessageId}`,
      );
      return existing;
    }

    const participant = await this.upsertParticipant(
      channelType,
      channelAccountId,
      parsed,
    );

    const conversation = await this.upsertConversation(
      channelType,
      channelAccountId,
      parsed.externalConversationId,
      participant.id,
    );

    const message = await this.saveMessage({
      conversationId: conversation.id,
      participantId: participant.id,
      senderUserId: null,
      direction: ClientChatDirection.IN,
      externalMessageId: parsed.externalMessageId,
      text: parsed.text,
      attachments: parsed.attachments ?? null,
      rawPayload: parsed.rawPayload ?? null,
    });

    await this.matching.autoMatch(participant, conversation);

    return message;
  }

  async upsertParticipant(
    channelType: ClientChatChannelType,
    channelAccountId: string,
    parsed: ParsedInboundMessage,
  ) {
    const existing = await this.prisma.clientChatParticipant.findUnique({
      where: { externalUserId: parsed.externalUserId },
    });

    if (existing) {
      return this.prisma.clientChatParticipant.update({
        where: { id: existing.id },
        data: {
          displayName: parsed.displayName || existing.displayName,
          phone: parsed.phone || existing.phone,
          email: parsed.email || existing.email,
        },
      });
    }

    return this.prisma.clientChatParticipant.create({
      data: {
        channelType,
        channelAccountId,
        externalUserId: parsed.externalUserId,
        displayName: parsed.displayName || 'Unknown',
        phone: parsed.phone,
        email: parsed.email,
      },
    });
  }

  async upsertConversation(
    channelType: ClientChatChannelType,
    channelAccountId: string,
    externalConversationId: string,
    _participantId: string,
  ) {
    const existing = await this.prisma.clientChatConversation.findUnique({
      where: { externalConversationId },
    });

    if (existing) {
      return this.prisma.clientChatConversation.update({
        where: { id: existing.id },
        data: {
          lastMessageAt: new Date(),
          status:
            existing.status === ClientChatStatus.CLOSED
              ? ClientChatStatus.OPEN
              : existing.status,
        },
      });
    }

    return this.prisma.clientChatConversation.create({
      data: {
        channelType,
        channelAccountId,
        externalConversationId,
        lastMessageAt: new Date(),
      },
    });
  }

  async saveMessage(data: {
    conversationId: string;
    participantId: string | null;
    senderUserId: string | null;
    direction: ClientChatDirection;
    externalMessageId: string;
    text: string;
    attachments?: unknown;
    rawPayload?: unknown;
  }) {
    return this.prisma.clientChatMessage.create({
      data: {
        conversationId: data.conversationId,
        participantId: data.participantId,
        senderUserId: data.senderUserId,
        direction: data.direction,
        externalMessageId: data.externalMessageId,
        text: data.text,
        attachments: data.attachments as any,
        sentAt: new Date(),
        rawPayload: data.rawPayload as any,
      },
    });
  }

  // ── Agent reply ────────────────────────────────────────

  async sendReply(conversationId: string, userId: string, text: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      include: { channelAccount: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const adapter = this.adapterRegistry.getOrThrow(conversation.channelType);
    const metadata = (conversation.channelAccount.metadata ?? {}) as Record<
      string,
      unknown
    >;

    const result = await adapter.sendMessage(
      conversation.externalConversationId,
      text,
      metadata,
    );

    const message = await this.saveMessage({
      conversationId,
      participantId: null,
      senderUserId: userId,
      direction: ClientChatDirection.OUT,
      externalMessageId:
        result.externalMessageId ||
        `out_${conversationId}_${Date.now()}`,
      text,
    });

    await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    return { message, sendResult: result };
  }

  // ── Conversation management ────────────────────────────

  async assignConversation(conversationId: string, userId: string | null) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    return this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { assignedUserId: userId },
    });
  }

  async changeStatus(conversationId: string, status: ClientChatStatus) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    return this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { status },
    });
  }

  async linkClient(conversationId: string, clientId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) throw new NotFoundException('Client not found');

    if (conversation.clientId) {
      throw new ConflictException('Conversation already linked to a client');
    }

    return this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { clientId },
    });
  }

  async unlinkClient(conversationId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    return this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { clientId: null },
    });
  }

  // ── Queries ────────────────────────────────────────────

  async listConversations(query: ConversationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.channelType) where.channelType = query.channelType;
    if (query.status) where.status = query.status;
    if (query.assignedUserId) where.assignedUserId = query.assignedUserId;
    if (query.search) {
      where.OR = [
        {
          messages: {
            some: { text: { contains: query.search, mode: 'insensitive' } },
          },
        },
        { externalConversationId: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.clientChatConversation.findMany({
        where,
        include: {
          assignedUser: { select: { id: true, email: true } },
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              primaryPhone: true,
            },
          },
          messages: {
            take: 1,
            orderBy: { sentAt: 'desc' },
            select: { text: true, sentAt: true, direction: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.clientChatConversation.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getConversation(id: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id },
      include: {
        channelAccount: true,
        assignedUser: { select: { id: true, email: true } },
        client: {
          select: {
            id: true,
            coreId: true,
            firstName: true,
            lastName: true,
            primaryPhone: true,
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation;
  }

  async getMessages(
    conversationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.clientChatMessage.findMany({
        where: { conversationId },
        include: {
          participant: {
            select: { id: true, displayName: true, externalUserId: true },
          },
          senderUser: { select: { id: true, email: true } },
        },
        orderBy: { sentAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.clientChatMessage.count({ where: { conversationId } }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ── Channel account helpers ────────────────────────────

  async getOrCreateDefaultAccount(channelType: ClientChatChannelType) {
    const existing = await this.prisma.clientChatChannelAccount.findFirst({
      where: { type: channelType, status: 'ACTIVE' },
    });
    if (existing) return existing;

    return this.prisma.clientChatChannelAccount.create({
      data: {
        type: channelType,
        name: `Default ${channelType}`,
        status: 'ACTIVE',
      },
    });
  }
}
