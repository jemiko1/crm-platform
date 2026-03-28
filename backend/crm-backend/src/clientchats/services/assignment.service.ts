import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueueScheduleService } from './queue-schedule.service';
import { ClientChatsEventService } from './clientchats-event.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueSchedule: QueueScheduleService,
    private readonly events: ClientChatsEventService,
  ) {}

  async getActiveOperatorsToday(): Promise<string[]> {
    return this.queueSchedule.getActiveOperatorsToday();
  }

  async isInTodayQueue(userId: string): Promise<boolean> {
    const pool = await this.queueSchedule.getActiveOperatorsToday();
    return pool.includes(userId);
  }

  /**
   * Operator explicitly joins an unassigned conversation.
   * Uses optimistic locking: the UPDATE only succeeds if assignedUserId is still null.
   */
  async joinConversation(conversationId: string, userId: string) {
    const conversation = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    if (conversation.assignedUserId) {
      throw new ConflictException('Conversation already assigned to another operator');
    }

    const lockResult = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "ClientChatConversation"
       SET "assignedUserId" = ${userId}, "lastOperatorActivityAt" = NULL, "joinedAt" = NOW()
       WHERE "id" = ${conversationId} AND "assignedUserId" IS NULL
       RETURNING "id"`;

    if (!lockResult || lockResult.length === 0) {
      throw new ConflictException('Conversation was already taken by another operator');
    }

    const updated = await this.prisma.clientChatConversation.findUnique({
      where: { id: conversationId },
      include: {
        assignedUser: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
        client: {
          select: { id: true, firstName: true, lastName: true, primaryPhone: true },
        },
      },
    });

    this.events.emitConversationUpdated(updated as any);
    this.logger.log(`Operator ${userId} joined conversation ${conversationId}`);
    return updated;
  }
}
