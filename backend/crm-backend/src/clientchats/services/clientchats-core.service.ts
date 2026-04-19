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
  Prisma,
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

  /**
   * Data-scope guard for per-conversation handlers. Operators may only touch
   * conversations they own, or (if they're in today's queue) unassigned LIVE
   * conversations that are still up for grabs. Managers and superadmins
   * bypass the check.
   *
   * @throws NotFoundException if the id doesn't resolve — deliberately kept
   *   separate from ForbiddenException so a probe can't distinguish "exists
   *   but not yours" from "doesn't exist".
   * @throws ForbiddenException if the caller has no claim on the conversation.
   */
  async assertCanAccessConversation(
    conversationId: string,
    userId: string,
    isManager: boolean,
  ): Promise<void> {
    if (isManager) return;
    const conv = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      select: {
        assignedUserId: true,
        status: true,
      },
    });
    if (!conv) throw new NotFoundException('Conversation not found');

    if (conv.assignedUserId === userId) return;
    const inQueue = await this.assignment.isInTodayQueue(userId);
    if (inQueue && conv.status === ClientChatStatus.LIVE && !conv.assignedUserId) {
      return;
    }
    throw new ForbiddenException('You do not have access to this conversation');
  }

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

    const { conversation: upsertedConv, isNew: isNewConversation } =
      await this.upsertConversation(
        channelType,
        channelAccountId,
        parsed.externalConversationId,
        participant.id,
      );

    const conversation = upsertedConv;

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

  private isBetterName(newName: string | undefined, existing: string): boolean {
    if (!newName) return false;
    if (newName === existing) return false;
    const genericPattern = /^(Unknown|TG User|FB User|Viber User|\+\d|tg_|viber_|wa_|fb_)/i;
    if (genericPattern.test(newName) && !genericPattern.test(existing)) return false;
    return true;
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
      const newDisplayName = this.isBetterName(parsed.displayName, existing.displayName)
        ? parsed.displayName!
        : existing.displayName;
      return this.prisma.clientChatParticipant.update({
        where: { id: existing.id },
        data: {
          displayName: newDisplayName,
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

  /**
   * Upsert the conversation for an inbound message.
   *
   * When the matched conversation is CLOSED we archive it (rename its
   * externalConversationId to `__archived_<ts>_<id>`) and create a fresh
   * thread that inherits the original externalConversationId. That flow is
   * UPDATE + CREATE on a unique-constrained column, and under concurrent
   * inbound messages on the same closed thread it used to race: two callers
   * could both see the old conversation, both attempt to rename, one would
   * succeed, and the second would hit P2002 when its CREATE collided with
   * the winner's — dropping the customer's message.
   *
   * Fix (P1-5): run the whole read-update-create (or read-update) flow
   * inside a single Serializable transaction. Serializable gives PostgreSQL
   * licence to abort one of two racing transactions with a P2034
   * serialization failure; we retry up to 3 times with 10/50/250ms
   * exponential backoff. P2002 retries are also tolerated as a safety net
   * for any rename collision that slips through (e.g. extremely fast
   * consecutive inbound messages that both hit the same `Date.now()` tick).
   *
   * The outbound `emitConversationUpdated` for the LIVE update path is
   * deferred until after the transaction commits so subscribers never see
   * rolled-back state.
   */
  async upsertConversation(
    channelType: ClientChatChannelType,
    channelAccountId: string,
    externalConversationId: string,
    participantId: string,
  ): Promise<{ conversation: any; isNew: boolean }> {
    const MAX_ATTEMPTS = 3;
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await this.prisma.$transaction(
          async (tx) => {
            const existing = await tx.clientChatConversation.findUnique({
              where: { externalConversationId },
            });

            if (existing) {
              if (existing.status === ClientChatStatus.CLOSED) {
                // Archive + create new thread atomically. Including existing.id
                // in the archived suffix guards against Date.now() collisions
                // (two fast retries in the same millisecond).
                const archivedId = `${externalConversationId}__archived_${Date.now()}_${existing.id}`;
                await tx.clientChatConversation.update({
                  where: { id: existing.id },
                  data: { externalConversationId: archivedId },
                });

                const created = await tx.clientChatConversation.create({
                  data: {
                    channelType,
                    channelAccountId,
                    externalConversationId,
                    lastMessageAt: new Date(),
                    clientId: existing.clientId,
                    participantId,
                    previousConversationId: existing.id,
                  },
                });
                return { conversation: created, isNew: true, emitUpdated: false as const };
              }

              const data: Record<string, unknown> = { lastMessageAt: new Date() };
              if (!existing.participantId) {
                data.participantId = participantId;
              }
              const updated = await tx.clientChatConversation.update({
                where: { id: existing.id },
                data,
              });
              return { conversation: updated, isNew: false, emitUpdated: true as const };
            }

            const created = await tx.clientChatConversation.create({
              data: {
                channelType,
                channelAccountId,
                externalConversationId,
                lastMessageAt: new Date(),
                participantId,
              },
            });
            return { conversation: created, isNew: true, emitUpdated: false as const };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );

        if (result.emitUpdated) {
          this.events.emitConversationUpdated(result.conversation as any);
        }
        return { conversation: result.conversation, isNew: result.isNew };
      } catch (err: any) {
        // P2034 = serialization failure under Serializable isolation.
        // P2002 = unique constraint violation (externalConversationId race).
        // Either one means "concurrent writer beat us" — retry and we'll
        // observe the winner's state on the next attempt.
        if (err?.code === 'P2034' || err?.code === 'P2002') {
          lastError = err;
          const delayMs = 10 * Math.pow(5, attempt); // 10ms, 50ms, 250ms
          this.logger.debug(
            `upsertConversation retry ${attempt + 1}/${MAX_ATTEMPTS} after ${err.code} (backoff ${delayMs}ms)`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        throw err;
      }
    }

    throw lastError;
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
    deliveryStatus?: string | null;
    deliveryError?: string | null;
  }) {
    const include = {
      participant: {
        select: { id: true, displayName: true, externalUserId: true },
      },
      senderUser: { select: { id: true, email: true } },
    };

    try {
      return await this.prisma.clientChatMessage.create({
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
          deliveryStatus: data.deliveryStatus ?? null,
          deliveryError: data.deliveryError ?? null,
        },
        include,
      });
    } catch (err: any) {
      if (err.code === 'P2002' && err.meta?.target?.includes('externalMessageId')) {
        this.logger.debug(`Duplicate insert caught: ${data.externalMessageId}`);
        const existing = await this.prisma.clientChatMessage.findUnique({
          where: { externalMessageId: data.externalMessageId },
          include,
        });
        if (existing) return existing;
      }
      throw err;
    }
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

    const attachments = media
      ? [{ filename: media.filename, mimeType: media.mimeType }]
      : undefined;
    const messageText = text || (media ? `[${media.filename}]` : '');

    // ── WhatsApp 24-hour window gate ──
    // The Cloud API rejects free-form messages outside the 24h window since
    // the last inbound. Previously sendReply fired the request anyway and
    // saved the outbound message as if it succeeded — the 400 from WA was
    // swallowed and the UI showed "sent". Now we check first and persist
    // the attempt with FAILED_OUT_OF_WINDOW so the operator can see the
    // attempt and (via the template-send flow) use an approved template.
    if (conversation.channelType === ClientChatChannelType.WHATSAPP) {
      const windowOpen = await this.isWhatsAppWindowOpen(conversationId);
      if (!windowOpen) {
        const failedMessage = await this.saveMessage({
          conversationId,
          participantId: null,
          senderUserId: userId,
          direction: ClientChatDirection.OUT,
          externalMessageId: `out_failed_window_${conversationId}_${Date.now()}`,
          text: messageText,
          attachments,
          deliveryStatus: 'FAILED_OUT_OF_WINDOW',
          deliveryError:
            'WhatsApp 24-hour window closed. Use a template message.',
        });

        // Still emit so the operator sees the failed bubble appear in the
        // conversation; the frontend renders a red "failed to deliver" badge.
        this.events.emitNewMessage(
          conversationId,
          failedMessage as any,
          conversation.assignedUserId,
        );

        return {
          message: failedMessage,
          sendResult: {
            externalMessageId: '',
            success: false,
            error:
              'WhatsApp 24-hour window closed. Use a template message.',
          },
        };
      }
    }

    const adapter = this.adapterRegistry.getOrThrow(conversation.channelType);
    const metadata = (conversation.channelAccount.metadata ?? {}) as Record<
      string,
      unknown
    >;

    // Wrap adapter.sendMessage so a thrown exception doesn't lose the
    // operator's draft. Adapters are expected to return
    // { success, externalMessageId, error } but some transport-level
    // failures (network, DNS) surface as throws.
    let result: { externalMessageId: string; success: boolean; error?: string };
    try {
      result = await adapter.sendMessage(
        conversation.externalConversationId,
        text,
        metadata,
        media,
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Adapter threw on send (${conversation.channelType}, conv=${conversationId}): ${errMsg}`,
      );
      result = { externalMessageId: '', success: false, error: errMsg };
    }

    const deliveryStatus = result.success ? 'SENT' : 'FAILED';
    const deliveryError = result.success ? null : result.error || 'Unknown error';

    const message = await this.saveMessage({
      conversationId,
      participantId: null,
      senderUserId: userId,
      direction: ClientChatDirection.OUT,
      externalMessageId:
        result.externalMessageId ||
        `out_${conversationId}_${Date.now()}`,
      text: messageText,
      attachments,
      deliveryStatus,
      deliveryError,
    });

    // Only bump conversation timestamps on successful delivery. A failed
    // send shouldn't count as an operator response (keeps firstResponseAt
    // honest for SLA accounting).
    if (result.success) {
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
      this.events.emitConversationUpdated(updatedConv as any);
    }

    this.events.emitNewMessage(
      conversationId,
      message as any,
      conversation.assignedUserId,
    );

    // TODO(frontend follow-up, audit/frontend-followup-P1-6.md): response
    // returns { message, sendResult }. The message object now carries
    // deliveryStatus ('SENT' | 'FAILED' | 'FAILED_OUT_OF_WINDOW') and
    // deliveryError (string | null). The chat bubble should render a red
    // "failed to deliver" badge below messages where deliveryStatus !==
    // 'SENT', with the deliveryError as the tooltip/explanation. For
    // FAILED_OUT_OF_WINDOW also surface a "Send template" button.
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
      pausedOperatorId: updated.pausedOperatorId,
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
        pausedOperatorId: null,
      });
    }
    this.events.emitConversationUpdated(updated as any);
    return updated;
  }

  /**
   * LIVE conversations assigned to this user where the latest customer (IN) message
   * is newer than the latest agent (OUT) reply — operator has not yet answered back.
   */
  async getUnreadCount(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(DISTINCT c.id)::bigint AS cnt
      FROM "ClientChatConversation" c
      WHERE c."assignedUserId" = ${userId}
        AND c.status = 'LIVE'
        AND EXISTS (
          SELECT 1 FROM "ClientChatMessage" m
          WHERE m."conversationId" = c.id
            AND m.direction = 'IN'
            AND m."createdAt" > COALESCE(
              (SELECT MAX(m2."createdAt") FROM "ClientChatMessage" m2
               WHERE m2."conversationId" = c.id AND m2.direction = 'OUT'),
              '1970-01-01'::timestamp
            )
        )
    `;
    return { count: Number(result[0]?.cnt ?? 0) };
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

    return updated;
  }

  async getConversationHistory(
    conversationId: string,
    page: number = 1,
    limit: number = 50,
  ) {
    limit = Math.min(limit, 100);
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
    if (query.channelType) {
      const channels = query.channelType.split(',').filter(Boolean);
      if (channels.length === 1) {
        where.channelType = channels[0];
      } else if (channels.length > 1) {
        where.channelType = { in: channels };
      }
    }
    if (query.status) where.status = query.status;
    if (query.assignedUserIdOrUnassigned) {
      where.OR = [
        { assignedUserId: query.assignedUserIdOrUnassigned },
        { assignedUserId: null },
      ];
    } else if (query.assignedUserId) {
      where.assignedUserId = query.assignedUserId;
    }
    if (query.filterAssignedTo) {
      if (query.filterAssignedTo === '__unassigned__') {
        where.assignedUserId = null;
      } else {
        where.assignedUserId = query.filterAssignedTo;
      }
    }
    if (query.search) {
      const searchCondition = {
        OR: [
          {
            messages: {
              some: { text: { contains: query.search, mode: 'insensitive' } },
            },
          },
          { externalConversationId: { contains: query.search, mode: 'insensitive' } },
        ],
      };
      if (where.OR) {
        where.AND = [{ OR: where.OR as any }, searchCondition];
        delete where.OR;
      } else {
        where.OR = searchCondition.OR;
      }
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
          participant: {
            select: {
              id: true,
              displayName: true,
              phone: true,
              externalUserId: true,
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
        participant: {
          select: {
            id: true,
            displayName: true,
            phone: true,
            externalUserId: true,
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
    limit = Math.min(limit, 100);
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
