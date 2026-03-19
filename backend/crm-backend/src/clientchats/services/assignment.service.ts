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

    try {
      const updated = await this.prisma.$queryRawUnsafe<any[]>(
        `UPDATE "ClientChatConversation"
         SET "assignedUserId" = $1, "lastOperatorActivityAt" = NULL
         WHERE "id" = $2 AND "assignedUserId" IS NULL
         RETURNING *`,
        userId,
        conversationId,
      );

      if (!updated || updated.length === 0) {
        throw new ConflictException('Conversation was already taken by another operator');
      }

      const result = updated[0];
      this.events.emitConversationUpdated(result);
      this.logger.log(`Operator ${userId} joined conversation ${conversationId}`);
      return result;
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw new ConflictException('Conversation was already taken by another operator');
    }
  }
}
