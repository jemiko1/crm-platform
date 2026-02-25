import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';
import { ConversationQueryDto } from './dto/conversation-query.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { ConversationType } from '@prisma/client';

@Injectable()
export class MessengerService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get the employee record for a given userId.
   * Throws if no employee profile is linked.
   */
  async getEmployeeByUserId(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, firstName: true, lastName: true, avatar: true },
    });
    if (!employee) {
      throw new ForbiddenException('No employee profile found');
    }
    return employee;
  }

  // ── Conversations ─────────────────────────────────────

  async getConversations(userId: string, query: ConversationQueryDto) {
    const employee = await this.getEmployeeByUserId(userId);
    const limit = query.limit ?? 20;

    const isArchived = query.filter === 'archived';
    const isUnread = query.filter === 'unread';
    const isGroups = query.filter === 'groups';

    // Build where clause for ConversationParticipant
    const participantWhere: any = {
      employeeId: employee.id,
      isArchived,
    };

    // Cursor-based pagination: conversations ordered by lastMessageAt DESC
    const cursorFilter: any = {};
    if (query.cursor) {
      cursorFilter.lastMessageAt = { lt: new Date(query.cursor) };
    }

    const typeFilter: any = {};
    if (isGroups) {
      typeFilter.type = ConversationType.GROUP;
    } else if (query.type) {
      typeFilter.type = query.type;
    }

    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: { some: participantWhere },
        ...cursorFilter,
        ...typeFilter,
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                {
                  participants: {
                    some: {
                      employee: {
                        OR: [
                          { firstName: { contains: query.search, mode: 'insensitive' } },
                          { lastName: { contains: query.search, mode: 'insensitive' } },
                        ],
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { lastMessageAt: { sort: 'desc', nulls: 'last' } },
      take: limit + 1,
      include: {
        participants: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;

    // If unread filter, filter in application layer (more flexible)
    let filteredItems = items;
    if (isUnread) {
      filteredItems = items.filter((conv) => {
        const myParticipant = conv.participants.find(
          (p) => p.employeeId === employee.id,
        );
        if (!myParticipant?.lastReadAt) return conv.lastMessageAt != null;
        return (
          conv.lastMessageAt != null &&
          conv.lastMessageAt > myParticipant.lastReadAt
        );
      });
    }

    // Enrich with unread counts
    const enriched = await Promise.all(
      filteredItems.map(async (conv) => {
        const myParticipant = conv.participants.find(
          (p) => p.employeeId === employee.id,
        );
        const lastReadAt = myParticipant?.lastReadAt;

        const unreadCount = lastReadAt
          ? await this.prisma.message.count({
              where: {
                conversationId: conv.id,
                createdAt: { gt: lastReadAt },
                senderId: { not: employee.id },
                isDeleted: false,
              },
            })
          : await this.prisma.message.count({
              where: {
                conversationId: conv.id,
                senderId: { not: employee.id },
                isDeleted: false,
              },
            });

        return {
          ...conv,
          unreadCount,
          myParticipant,
        };
      }),
    );

    return {
      items: enriched,
      hasMore,
      nextCursor: hasMore
        ? items[items.length - 1]?.lastMessageAt?.toISOString()
        : null,
    };
  }

  async getConversation(userId: string, conversationId: string) {
    const employee = await this.getEmployeeByUserId(userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                email: true,
                phone: true,
                status: true,
                jobTitle: true,
                position: { select: { name: true, code: true } },
                department: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const isParticipant = conversation.participants.some(
      (p) => p.employeeId === employee.id,
    );
    if (!isParticipant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }

    return conversation;
  }

  async createConversation(userId: string, dto: CreateConversationDto) {
    const employee = await this.getEmployeeByUserId(userId);

    // For GROUP type, check permission
    if (dto.type === ConversationType.GROUP) {
      const hasPermission = await this.checkPermission(userId, 'messenger', 'create_group');
      if (!hasPermission) {
        throw new ForbiddenException('You do not have permission to create group conversations');
      }
    }

    // Ensure creator is in participants
    const allParticipantIds = Array.from(
      new Set([employee.id, ...dto.participantIds]),
    );

    // For DIRECT conversations, check if one already exists between these two
    if (dto.type === ConversationType.DIRECT) {
      if (allParticipantIds.length !== 2) {
        throw new BadRequestException(
          'Direct conversations must have exactly 2 participants',
        );
      }

      const existing = await this.prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          AND: allParticipantIds.map((id) => ({
            participants: { some: { employeeId: id } },
          })),
        },
        include: {
          participants: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  status: true,
                },
              },
            },
          },
        },
      });

      if (existing) {
        return existing;
      }
    }

    // Validate that all participant IDs exist
    const employeeCount = await this.prisma.employee.count({
      where: { id: { in: allParticipantIds } },
    });
    if (employeeCount !== allParticipantIds.length) {
      throw new BadRequestException('One or more participant IDs are invalid');
    }

    return this.prisma.conversation.create({
      data: {
        type: dto.type,
        name: dto.name,
        createdById: employee.id,
        participants: {
          create: allParticipantIds.map((id) => ({
            employeeId: id,
            role: id === employee.id ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      include: {
        participants: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });
  }

  async updateConversation(
    userId: string,
    conversationId: string,
    data: { name?: string; avatarUrl?: string },
  ) {
    const employee = await this.getEmployeeByUserId(userId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true },
    });

    if (!conversation) throw new NotFoundException('Conversation not found');
    if (conversation.type !== ConversationType.GROUP) {
      throw new BadRequestException('Can only update group conversations');
    }

    const myParticipant = conversation.participants.find(
      (p) => p.employeeId === employee.id,
    );
    if (!myParticipant) {
      throw new ForbiddenException('Not a participant');
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        name: data.name,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async addParticipants(
    userId: string,
    conversationId: string,
    employeeIds: string[],
  ) {
    const employee = await this.getEmployeeByUserId(userId);
    await this.assertParticipant(conversationId, employee.id);

    const existing = await this.prisma.conversationParticipant.findMany({
      where: { conversationId, employeeId: { in: employeeIds } },
    });
    const existingIds = new Set(existing.map((p) => p.employeeId));
    const newIds = employeeIds.filter((id) => !existingIds.has(id));

    if (newIds.length > 0) {
      await this.prisma.conversationParticipant.createMany({
        data: newIds.map((id) => ({
          conversationId,
          employeeId: id,
        })),
      });
    }

    return this.getConversation(userId, conversationId);
  }

  async removeParticipant(
    userId: string,
    conversationId: string,
    targetEmployeeId: string,
  ) {
    const employee = await this.getEmployeeByUserId(userId);
    await this.assertParticipant(conversationId, employee.id);

    await this.prisma.conversationParticipant.deleteMany({
      where: { conversationId, employeeId: targetEmployeeId },
    });
  }

  async markAsRead(userId: string, conversationId: string) {
    const employee = await this.getEmployeeByUserId(userId);

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, employeeId: employee.id },
      data: { lastReadAt: new Date() },
    });
  }

  async muteConversation(
    userId: string,
    conversationId: string,
    mutedUntil: Date | null,
  ) {
    const employee = await this.getEmployeeByUserId(userId);

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, employeeId: employee.id },
      data: { mutedUntil },
    });
  }

  async archiveConversation(
    userId: string,
    conversationId: string,
    archive: boolean,
  ) {
    const employee = await this.getEmployeeByUserId(userId);

    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId, employeeId: employee.id },
      data: { isArchived: archive },
    });
  }

  // ── Messages ──────────────────────────────────────────

  async getMessages(
    userId: string,
    conversationId: string,
    query: MessageQueryDto,
  ) {
    const employee = await this.getEmployeeByUserId(userId);
    await this.assertParticipant(conversationId, employee.id);

    const limit = query.limit ?? 50;
    const dateFilter: any = {};
    if (query.cursor) {
      dateFilter.createdAt = { lt: new Date(query.cursor) };
    } else if (query.after) {
      dateFilter.createdAt = { gt: new Date(query.after) };
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...dateFilter,
      },
      orderBy: { createdAt: query.after ? 'asc' : 'desc' },
      take: limit + 1,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        attachments: true,
        reactions: {
          select: {
            emoji: true,
            employeeId: true,
            employee: { select: { firstName: true } },
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    return {
      items,
      hasMore,
      nextCursor: hasMore
        ? items[items.length - 1]?.createdAt.toISOString()
        : null,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    dto: SendMessageDto,
  ) {
    const employee = await this.getEmployeeByUserId(userId);
    await this.assertParticipant(conversationId, employee.id);

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId,
          senderId: employee.id,
          content: dto.content,
          type: dto.type ?? 'TEXT',
          replyToId: dto.replyToId,
        },
        include: {
          sender: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              sender: {
                select: { id: true, firstName: true, lastName: true },
              },
            },
          },
          attachments: true,
          reactions: {
            select: {
              emoji: true,
              employeeId: true,
              employee: { select: { firstName: true } },
            },
          },
        },
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: msg.createdAt,
          lastMessageText: dto.content.substring(0, 200),
        },
      });

      await tx.conversationParticipant.updateMany({
        where: { conversationId, employeeId: employee.id },
        data: { lastReadAt: msg.createdAt },
      });

      return msg;
    });

    return message;
  }

  async editMessage(userId: string, messageId: string, dto: UpdateMessageDto) {
    const employee = await this.getEmployeeByUserId(userId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== employee.id) {
      throw new ForbiddenException('Can only edit own messages');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: {
        content: dto.content,
        isEdited: true,
      },
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        attachments: true,
      },
    });
  }

  async deleteMessage(userId: string, messageId: string) {
    const employee = await this.getEmployeeByUserId(userId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== employee.id) {
      throw new ForbiddenException('Can only delete own messages');
    }

    return this.prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true, content: '' },
    });
  }

  // ── Search ────────────────────────────────────────────

  async searchEmployees(userId: string, searchQuery: string) {
    await this.getEmployeeByUserId(userId);

    return this.prisma.employee.findMany({
      where: {
        status: 'ACTIVE',
        userId: { not: null },
        OR: [
          { firstName: { contains: searchQuery, mode: 'insensitive' } },
          { lastName: { contains: searchQuery, mode: 'insensitive' } },
          { email: { contains: searchQuery, mode: 'insensitive' } },
          { employeeId: { contains: searchQuery, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatar: true,
        email: true,
        jobTitle: true,
        status: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
      take: 20,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async searchMessages(userId: string, conversationId: string, q: string) {
    const employee = await this.getEmployeeByUserId(userId);
    await this.assertParticipant(conversationId, employee.id);

    return this.prisma.message.findMany({
      where: {
        conversationId,
        content: { contains: q, mode: 'insensitive' },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        sender: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    });
  }

  // ── Unread Count ──────────────────────────────────────

  async getUnreadCount(userId: string) {
    const employee = await this.getEmployeeByUserId(userId);

    const participants = await this.prisma.conversationParticipant.findMany({
      where: { employeeId: employee.id, isArchived: false },
      select: { conversationId: true, lastReadAt: true },
    });

    let total = 0;
    for (const p of participants) {
      const count = p.lastReadAt
        ? await this.prisma.message.count({
            where: {
              conversationId: p.conversationId,
              createdAt: { gt: p.lastReadAt },
              senderId: { not: employee.id },
              isDeleted: false,
            },
          })
        : await this.prisma.message.count({
            where: {
              conversationId: p.conversationId,
              senderId: { not: employee.id },
              isDeleted: false,
            },
          });
      total += count;
    }

    return { unreadCount: total };
  }

  // ── Reactions ──────────────────────────────────────────

  async toggleReaction(userId: string, messageId: string, emoji: string) {
    const employee = await this.getEmployeeByUserId(userId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    await this.assertParticipant(message.conversationId, employee.id);

    const existing = await this.prisma.messageReaction.findUnique({
      where: {
        messageId_employeeId_emoji: {
          messageId,
          employeeId: employee.id,
          emoji,
        },
      },
    });

    if (existing) {
      await this.prisma.messageReaction.delete({
        where: { id: existing.id },
      });
      return { added: false, conversationId: message.conversationId };
    }

    await this.prisma.messageReaction.create({
      data: {
        messageId,
        employeeId: employee.id,
        emoji,
      },
    });

    return { added: true, conversationId: message.conversationId };
  }

  async getMessageReactions(userId: string, messageId: string) {
    const employee = await this.getEmployeeByUserId(userId);

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    if (!message) throw new NotFoundException('Message not found');

    await this.assertParticipant(message.conversationId, employee.id);

    return this.prisma.messageReaction.findMany({
      where: { messageId },
      select: {
        emoji: true,
        employeeId: true,
        employee: { select: { firstName: true } },
      },
    });
  }

  // ── Read Status (for delivered/seen) ──────────────────

  async getMessageReadStatus(userId: string, conversationId: string) {
    const employee = await this.getEmployeeByUserId(userId);
    await this.assertParticipant(conversationId, employee.id);

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        employeeId: { not: employee.id },
      },
      select: {
        employeeId: true,
        lastReadAt: true,
      },
    });

    return participants;
  }

  // ── Helpers ───────────────────────────────────────────

  private async assertParticipant(
    conversationId: string,
    employeeId: string,
  ) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_employeeId: { conversationId, employeeId },
      },
    });
    if (!participant) {
      throw new ForbiddenException('Not a participant of this conversation');
    }
    return participant;
  }

  /**
   * Get participant IDs for a conversation (used by gateway to broadcast)
   */
  async getConversationParticipantIds(conversationId: string): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { employeeId: true },
    });
    return participants.map((p) => p.employeeId);
  }

  /**
   * Check if a user has a specific permission (resource.action).
   */
  private async checkPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, employee: { select: { positionId: true } } },
    });
    if (!user) return false;
    if (user.isSuperAdmin) return true;

    const positionId = user.employee?.positionId;
    if (!positionId) return false;

    const count = await this.prisma.roleGroupPermission.count({
      where: {
        permission: { resource, action },
        roleGroup: { positions: { some: { id: positionId } } },
      },
    });
    return count > 0;
  }

  /**
   * Check if user can create groups (used by frontend to show/hide button)
   */
  async canCreateGroup(userId: string): Promise<boolean> {
    return this.checkPermission(userId, 'messenger', 'create_group');
  }

  /**
   * Find the employeeId for a given userId (used by gateway)
   */
  async getEmployeeIdByUserId(userId: string): Promise<string | null> {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });
    return employee?.id ?? null;
  }
}
