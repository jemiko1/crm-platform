import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ClientChatChannelType,
  ClientChatDirection,
  ClientChatStatus,
} from '@prisma/client';
import { Readable } from 'stream';
import { AdapterRegistryService } from '../adapters/adapter-registry.service';
import { ParsedInboundMessage } from '../interfaces/channel-adapter.interface';
import { TelegramAdapter } from '../adapters/telegram.adapter';
import { ClientChatsMatchingService } from './clientchats-matching.service';
import { ClientChatsEventService } from './clientchats-event.service';
import { AssignmentService } from './assignment.service';
import { ConversationQueryDto } from '../dto/conversation-query.dto';

@Injectable()
export class ClientChatsCoreService {
  private readonly logger = new Logger(ClientChatsCoreService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AdapterRegistryService,
    private readonly matching: ClientChatsMatchingService,
    private readonly events: ClientChatsEventService,
    private readonly assignment: AssignmentService,
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

    let participant = await this.upsertParticipant(
      channelType,
      channelAccountId,
      parsed,
    );

    const { conversation: upsertedConv, isNew: isNewConversation } =
      await this.upsertConversation(
        channelType,
        channelAccountId,
        parsed.externalConversationId,
        participant.id,
      );

    let conversation = upsertedConv;

    if (isNewConversation || !conversation.assignedUserId) {
      const assignedUserId = await this.assignment.autoAssign(channelType);
      if (assignedUserId) {
        conversation = await this.prisma.clientChatConversation.update({
          where: { id: conversation.id },
          data: { assignedUserId, lastOperatorActivityAt: null },
        });
      }
    }

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

    if (isNewConversation) {
      this.events.emitConversationNew(conversation as any);
    }

    this.events.emitNewMessage(
      conversation.id,
      message as any,
      conversation.assignedUserId,
    );

    if (
      channelType === ClientChatChannelType.TELEGRAM &&
      !participant.phone &&
      !participant.mappedClientId
    ) {
      this.tryFetchTelegramPhone(participant, channelAccountId)
        .then((updated) => {
          if (updated.phone) {
            this.matching.autoMatch(updated, conversation).catch(() => {});
          }
        })
        .catch(() => {});
    }

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

  private async tryFetchTelegramPhone(
    participant: Awaited<ReturnType<typeof this.upsertParticipant>>,
    channelAccountId: string,
  ) {
    try {
      const account = await this.prisma.clientChatChannelAccount.findUnique({
        where: { id: channelAccountId },
      });
      const adapter = this.adapterRegistry.get(
        ClientChatChannelType.TELEGRAM,
      ) as TelegramAdapter;
      const phone = await adapter.fetchUserPhone(
        participant.externalUserId,
        (account?.metadata as Record<string, unknown>) ?? {},
      );
      if (phone) {
        this.logger.log(
          `Fetched Telegram phone for participant ${participant.id}: ${phone}`,
        );
        return this.prisma.clientChatParticipant.update({
          where: { id: participant.id },
          data: { phone },
        });
      }
    } catch (err) {
      this.logger.debug(`tryFetchTelegramPhone failed: ${err}`);
    }
    return participant;
  }

  async upsertConversation(
    channelType: ClientChatChannelType,
    channelAccountId: string,
    externalConversationId: string,
    _participantId: string,
  ): Promise<{ conversation: any; isNew: boolean }> {
    const existing = await this.prisma.clientChatConversation.findUnique({
      where: { externalConversationId },
    });

    if (existing) {
      if (existing.status === ClientChatStatus.CLOSED) {
        await this.prisma.clientChatConversation.update({
          where: { id: existing.id },
          data: { externalConversationId: `${externalConversationId}__archived_${Date.now()}` },
        });

        const created = await this.prisma.clientChatConversation.create({
          data: {
            channelType,
            channelAccountId,
            externalConversationId,
            lastMessageAt: new Date(),
            clientId: existing.clientId,
            previousConversationId: existing.id,
          },
        });
        return { conversation: created, isNew: true };
      }

      const updated = await this.prisma.clientChatConversation.update({
        where: { id: existing.id },
        data: { lastMessageAt: new Date() },
      });
      this.events.emitConversationUpdated(updated as any);
      return { conversation: updated, isNew: false };
    }

    const created = await this.prisma.clientChatConversation.create({
      data: {
        channelType,
        channelAccountId,
        externalConversationId,
        lastMessageAt: new Date(),
      },
    });
    return { conversation: created, isNew: true };
  }

  /**
   * Create a test WhatsApp conversation (for App Review or testing).
   * Use when app is unpublished and real inbound webhooks are not delivered.
   * Phone must be added to Meta's "To" list (5 recipients for test number).
   */
  async createTestWhatsAppConversation(phoneNumber: string) {
    const phone = String(phoneNumber).replace(/\D/g, '');
    if (!phone.length) {
      throw new ConflictException('Phone number is required');
    }
    const account = await this.getOrCreateDefaultAccount(
      ClientChatChannelType.WHATSAPP,
    );
    const externalConversationId = `wa_${phone}`;
    const externalUserId = phone;

    let participant = await this.prisma.clientChatParticipant.findUnique({
      where: { externalUserId },
    });
    if (!participant) {
      participant = await this.prisma.clientChatParticipant.create({
        data: {
          channelType: ClientChatChannelType.WHATSAPP,
          channelAccountId: account.id,
          externalUserId,
          displayName: `Test (${phone})`,
          phone: phone,
        },
      });
    }

    let conversation = await this.prisma.clientChatConversation.findUnique({
      where: { externalConversationId },
    });
    if (!conversation) {
      conversation = await this.prisma.clientChatConversation.create({
        data: {
          channelType: ClientChatChannelType.WHATSAPP,
          channelAccountId: account.id,
          externalConversationId,
        },
      });
    }

    const existingMsg = await this.prisma.clientChatMessage.findUnique({
      where: { externalMessageId: `test_in_${conversation.id}` },
    });
    if (!existingMsg) {
      await this.saveMessage({
        conversationId: conversation.id,
        participantId: participant.id,
        senderUserId: null,
        direction: ClientChatDirection.IN,
        externalMessageId: `test_in_${conversation.id}`,
        text: 'Test conversation – reply from CRM to verify integration.',
      });
    }

    return { conversationId: conversation.id, externalConversationId };
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

  async sendReply(
    conversationId: string,
    userId: string,
    text: string,
    media?: { buffer: Buffer; mimeType: string; filename: string },
  ) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      include: { channelAccount: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.pausedOperatorId === userId) {
      throw new ForbiddenException(
        'You are paused by manager. You can view but not send messages.',
      );
    }

    if (!this.isChannelActive(conversation.channelAccount)) {
      throw new BadRequestException(
        `${conversation.channelType} channel is currently disabled`,
      );
    }

    const adapter = this.adapterRegistry.getOrThrow(conversation.channelType);
    const metadata = (conversation.channelAccount.metadata ?? {}) as Record<
      string,
      unknown
    >;

    const result = await adapter.sendMessage(
      conversation.externalConversationId,
      text,
      metadata,
      media,
    );

    const attachments = media
      ? [{ filename: media.filename, mimeType: media.mimeType }]
      : undefined;

    const message = await this.saveMessage({
      conversationId,
      participantId: null,
      senderUserId: userId,
      direction: ClientChatDirection.OUT,
      externalMessageId:
        result.externalMessageId ||
        `out_${conversationId}_${Date.now()}`,
      text: text || (media ? `[${media.filename}]` : ''),
      attachments,
    });

    const updateData: Record<string, unknown> = {
      lastMessageAt: new Date(),
      lastOperatorActivityAt: new Date(),
    };
    if (!conversation.firstResponseAt) {
      updateData.firstResponseAt = new Date();
    }

    const updatedConv = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: updateData,
    });

    this.events.emitNewMessage(
      conversationId,
      message as any,
      conversation.assignedUserId,
    );
    this.events.emitConversationUpdated(updatedConv as any);

    return { message, sendResult: result };
  }

  // ── Conversation management ────────────────────────────

  async assignConversation(conversationId: string, userId: string | null) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const previousAssignedUserId = conversation.assignedUserId;

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { assignedUserId: userId, lastOperatorActivityAt: null },
    });
    this.events.emitConversationUpdated(updated as any, previousAssignedUserId);
    return updated;
  }

  async changeStatus(conversationId: string, status: ClientChatStatus) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const data: Record<string, unknown> = { status };
    if (status === ClientChatStatus.CLOSED) {
      data.resolvedAt = new Date();
      data.pausedOperatorId = null;
      data.pausedAt = null;
    } else if (conversation.status === ClientChatStatus.CLOSED) {
      data.resolvedAt = null;
    }

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data,
    });
    this.events.emitConversationUpdated(updated as any);
    return updated;
  }

  async deleteConversation(conversationId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // Collect the full chain of linked previous conversations
    const idsToDelete = [conversationId];
    let prevId = conversation.previousConversationId;
    while (prevId) {
      idsToDelete.push(prevId);
      const prev = await this.prisma.clientChatConversation.findUnique({
        where: { id: prevId },
        select: { previousConversationId: true },
      });
      prevId = prev?.previousConversationId ?? null;
    }

    // Also find any conversations that reference these as previousConversationId
    const forward = await this.prisma.clientChatConversation.findMany({
      where: { previousConversationId: { in: idsToDelete } },
      select: { id: true },
    });
    for (const f of forward) {
      if (!idsToDelete.includes(f.id)) idsToDelete.push(f.id);
    }

    // Nullify self-references so FK constraints don't block deletion
    await this.prisma.clientChatConversation.updateMany({
      where: { id: { in: idsToDelete } },
      data: { previousConversationId: null },
    });

    // Messages and escalation events cascade-delete with the conversation
    await this.prisma.clientChatConversation.deleteMany({
      where: { id: { in: idsToDelete } },
    });

    this.logger.log(
      `Deleted ${idsToDelete.length} conversation(s) in chain starting from ${conversationId}`,
    );

    return { deleted: idsToDelete.length, ids: idsToDelete };
  }

  async pauseOperator(conversationId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (!conversation.assignedUserId) {
      throw new BadRequestException('No operator assigned to pause');
    }

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: {
        pausedOperatorId: conversation.assignedUserId,
        pausedAt: new Date(),
      },
    });
    this.events.emitToAgent(conversation.assignedUserId, 'operator:paused', {
      conversationId,
    });
    this.events.emitConversationUpdated(updated as any);
    return updated;
  }

  async unpauseOperator(conversationId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const pausedId = conversation.pausedOperatorId;
    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { pausedOperatorId: null, pausedAt: null },
    });
    if (pausedId) {
      this.events.emitToAgent(pausedId, 'operator:unpaused', {
        conversationId,
      });
    }
    this.events.emitConversationUpdated(updated as any);
    return updated;
  }

  async requestReopen(conversationId: string, userId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.status !== ClientChatStatus.CLOSED) {
      throw new BadRequestException('Only closed conversations can be reopened');
    }

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: {
        reopenRequestedBy: userId,
        reopenRequestedAt: new Date(),
      },
    });
    this.events.emitToManagers('reopen:requested', {
      conversationId,
      requestedBy: userId,
    });
    return updated;
  }

  async approveReopen(
    conversationId: string,
    keepOperator: boolean,
  ) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const data: Record<string, unknown> = {
      status: ClientChatStatus.LIVE,
      resolvedAt: null,
      reopenRequestedBy: null,
      reopenRequestedAt: null,
    };

    if (!keepOperator) {
      data.assignedUserId = null;
    }

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data,
    });

    if (conversation.reopenRequestedBy) {
      this.events.emitToAgent(
        conversation.reopenRequestedBy,
        'reopen:approved',
        { conversationId },
      );
    }
    this.events.emitConversationUpdated(updated as any);

    if (!keepOperator) {
      const assignedUserId = await this.assignment.autoAssign(
        conversation.channelType,
      );
      if (assignedUserId) {
        const reassigned = await this.prisma.clientChatConversation.update({
          where: { id: conversationId },
          data: { assignedUserId, lastOperatorActivityAt: null },
        });
        this.events.emitConversationUpdated(reassigned as any);
        return reassigned;
      }
    }

    return updated;
  }

  async getConversationHistory(
    conversationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      select: { previousConversationId: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (!conversation.previousConversationId) {
      return { data: [], meta: { hasMore: false, previousConversationId: null } };
    }

    const prevConv = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversation.previousConversationId },
      select: { id: true, previousConversationId: true, createdAt: true, resolvedAt: true },
    });
    if (!prevConv) {
      return { data: [], meta: { hasMore: false, previousConversationId: null } };
    }

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      this.prisma.clientChatMessage.findMany({
        where: { conversationId: prevConv.id },
        include: {
          participant: {
            select: { id: true, displayName: true, externalUserId: true },
          },
          senderUser: { select: { id: true, email: true } },
        },
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.clientChatMessage.count({
        where: { conversationId: prevConv.id },
      }),
    ]);

    return {
      data: messages.reverse(),
      meta: {
        total,
        page,
        limit,
        hasMore: skip + messages.length < total || !!prevConv.previousConversationId,
        previousConversationId: prevConv.previousConversationId,
        closedAt: prevConv.resolvedAt ?? prevConv.createdAt,
      },
    };
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

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { clientId },
    });
    this.events.emitConversationUpdated(updated as any);
    return updated;
  }

  async unlinkClient(conversationId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    const updated = await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { clientId: null },
    });
    this.events.emitConversationUpdated(updated as any);
    return updated;
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
          assignedUser: {
            select: {
              id: true,
              email: true,
              employee: { select: { firstName: true, lastName: true } },
            },
          },
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
            select: {
              text: true,
              sentAt: true,
              direction: true,
              participant: { select: { displayName: true, phone: true } },
            },
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
        assignedUser: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        client: {
          select: {
            id: true,
            coreId: true,
            firstName: true,
            lastName: true,
            primaryPhone: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { sentAt: 'desc' },
          select: {
            participant: { select: { displayName: true, phone: true } },
          },
        },
      },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    let whatsappWindowOpen: boolean | undefined;
    if (conversation.channelType === ClientChatChannelType.WHATSAPP) {
      whatsappWindowOpen = await this.isWhatsAppWindowOpen(id);
    }

    return { ...conversation, whatsappWindowOpen };
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
      where: { type: channelType },
      orderBy: { createdAt: 'asc' },
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

  isChannelActive(account: { status: string }): boolean {
    return account.status === 'ACTIVE';
  }

  // ── Admin config (channel accounts) ────────────────────────

  async getChannelAccountsConfig() {
    const types: ClientChatChannelType[] = [
      ClientChatChannelType.VIBER,
      ClientChatChannelType.FACEBOOK,
      ClientChatChannelType.TELEGRAM,
      ClientChatChannelType.WHATSAPP,
    ];

    const accounts = await this.prisma.clientChatChannelAccount.findMany({
      where: { type: { in: types } },
      orderBy: { type: 'asc' },
    });

    const byType: Record<string, typeof accounts[0]> = {};
    for (const t of types) {
      const found = accounts.find((a) => a.type === t);
      byType[t] =
        found ??
        (await this.prisma.clientChatChannelAccount.create({
          data: {
            type: t,
            name: `Default ${t}`,
            status: 'ACTIVE',
          },
        }));
    }

    return byType;
  }

  async updateChannelAccountConfig(
    channelType: ClientChatChannelType,
    data: {
      name?: string;
      metadata?: Record<string, unknown>;
      status?: 'ACTIVE' | 'INACTIVE';
    },
  ) {
    const account = await this.getOrCreateDefaultAccount(channelType);
    return this.prisma.clientChatChannelAccount.update({
      where: { id: account.id },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.metadata != null && { metadata: data.metadata as object }),
        ...(data.status != null && { status: data.status }),
      },
    });
  }

  // ── WhatsApp 24-hour window & templates ──────────────────

  private templateCache: { data: any[]; fetchedAt: number } | null = null;

  async isWhatsAppWindowOpen(conversationId: string): Promise<boolean> {
    const lastInbound = await this.prisma.clientChatMessage.findFirst({
      where: {
        conversationId,
        direction: 'IN',
      },
      orderBy: { sentAt: 'desc' },
    });

    if (lastInbound) {
      const hoursSince =
        (Date.now() - new Date(lastInbound.sentAt).getTime()) / (1000 * 60 * 60);
      return hoursSince < 24;
    }

    // New conversation created from a closed one may not have messages yet
    // (race between upsertConversation and saveMessage). Check the conversation's
    // creation time -- if it was just created, the customer just texted us.
    const conv = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      select: { createdAt: true, previousConversationId: true },
    });
    if (conv?.previousConversationId) {
      const minutesSinceCreation =
        (Date.now() - new Date(conv.createdAt).getTime()) / (1000 * 60);
      if (minutesSinceCreation < 5) return true;
    }

    return false;
  }

  async getWhatsAppTemplates(): Promise<any[]> {
    if (
      this.templateCache &&
      Date.now() - this.templateCache.fetchedAt < 5 * 60 * 1000
    ) {
      return this.templateCache.data;
    }

    const account = await this.getOrCreateDefaultAccount(
      ClientChatChannelType.WHATSAPP,
    );
    const meta = account.metadata as Record<string, unknown> | null;
    const token = (meta?.waAccessToken as string) || '';
    const wabaId = (meta?.waBusinessAccountId as string) || '';

    if (!token || !wabaId) return [];

    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,language,status,components&limit=100&access_token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as Record<string, unknown>;
      const templates = ((data.data as any[]) || []).filter(
        (t: any) => t.status === 'APPROVED',
      );
      this.templateCache = { data: templates, fetchedAt: Date.now() };
      return templates;
    } catch (err) {
      this.logger.error(`Failed to fetch WhatsApp templates: ${err}`);
      return [];
    }
  }

  async sendWhatsAppTemplate(
    conversationId: string,
    userId: string,
    templateName: string,
    language: string,
    components?: any[],
  ): Promise<any> {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      include: { channelAccount: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.channelType !== ClientChatChannelType.WHATSAPP) {
      throw new BadRequestException('Templates are only for WhatsApp');
    }

    const meta = (conversation.channelAccount.metadata ?? {}) as Record<
      string,
      unknown
    >;
    const token = (meta.waAccessToken as string) || '';
    const phoneNumberId = (meta.waPhoneNumberId as string) || '';

    if (!token || !phoneNumberId) {
      throw new BadRequestException('WhatsApp not configured');
    }

    const recipientPhone =
      conversation.externalConversationId.replace('wa_', '');

    const body: Record<string, unknown> = {
      messaging_product: 'whatsapp',
      to: recipientPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components?.length ? { components } : {}),
      },
    };

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      },
    );

    const data = (await res.json()) as Record<string, unknown>;

    if (data.error) {
      const errObj = data.error as Record<string, unknown>;
      throw new BadRequestException(
        (errObj.message as string) || 'Template send failed',
      );
    }

    const messages = data.messages as any[];
    const externalId = messages?.[0]?.id || `wa_tmpl_${Date.now()}`;

    const message = await this.saveMessage({
      conversationId,
      participantId: null,
      senderUserId: userId,
      direction: ClientChatDirection.OUT,
      externalMessageId: externalId,
      text: `[Template: ${templateName}]`,
    });

    await this.prisma.clientChatConversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    this.events.emitNewMessage(
      conversationId,
      message as any,
      conversation.assignedUserId,
    );

    return { message, templateName };
  }

  // ── WhatsApp media proxy ─────────────────────────────────

  async downloadWhatsAppMedia(
    mediaId: string,
  ): Promise<{ stream: Readable; contentType: string } | null> {
    const account = await this.getOrCreateDefaultAccount(
      ClientChatChannelType.WHATSAPP,
    );
    const meta = account.metadata as Record<string, unknown> | null;
    const token =
      (meta?.waAccessToken as string) || process.env.WA_ACCESS_TOKEN || '';
    if (!token) {
      this.logger.warn('No WhatsApp access token for media download');
      return null;
    }

    try {
      const infoRes = await fetch(
        `https://graph.facebook.com/v21.0/${mediaId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!infoRes.ok) {
        this.logger.warn(`WhatsApp media info failed: ${infoRes.status}`);
        return null;
      }
      const info = (await infoRes.json()) as Record<string, unknown>;
      const url = info.url as string | undefined;
      if (!url) return null;

      const mediaRes = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!mediaRes.ok || !mediaRes.body) {
        this.logger.warn(`WhatsApp media download failed: ${mediaRes.status}`);
        return null;
      }

      const contentType =
        (info.mime_type as string) ||
        mediaRes.headers.get('content-type') ||
        'application/octet-stream';

      return {
        stream: Readable.fromWeb(mediaRes.body as any),
        contentType,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WhatsApp media proxy error: ${msg}`);
      return null;
    }
  }
}
