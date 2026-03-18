import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatStatus } from '@prisma/client';
import { AssignmentService } from './assignment.service';
import { ClientChatsEventService } from './clientchats-event.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignment: AssignmentService,
    private readonly events: ClientChatsEventService,
  ) {}

  async getConfig() {
    let config = await this.prisma.clientChatEscalationConfig.findFirst();
    if (!config) {
      config = await this.prisma.clientChatEscalationConfig.create({
        data: {},
      });
    }
    return config;
  }

  async updateConfig(data: {
    firstResponseTimeoutMins?: number;
    reassignAfterMins?: number;
    notifyManagerOnEscalation?: boolean;
  }) {
    const config = await this.getConfig();
    return this.prisma.clientChatEscalationConfig.update({
      where: { id: config.id },
      data,
    });
  }

  async getRecentEvents(limit = 50) {
    return this.prisma.clientChatEscalationEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        conversation: {
          select: {
            id: true,
            channelType: true,
            externalConversationId: true,
            assignedUserId: true,
          },
        },
      },
    });
  }

  @Cron('*/1 * * * *')
  async checkEscalations() {
    const config = await this.prisma.clientChatEscalationConfig.findFirst();
    if (!config) return;

    const now = new Date();
    const warningThreshold = new Date(
      now.getTime() - config.firstResponseTimeoutMins * 60_000,
    );
    const reassignThreshold = new Date(
      now.getTime() - config.reassignAfterMins * 60_000,
    );

    const staleConversations = await this.prisma.clientChatConversation.findMany(
      {
        where: {
          status: ClientChatStatus.LIVE,
          assignedUserId: { not: null },
          firstResponseAt: null,
          lastMessageAt: { lt: warningThreshold },
        },
        include: {
          messages: {
            where: { direction: 'IN' },
            orderBy: { sentAt: 'desc' },
            take: 1,
          },
        },
      },
    );

    for (const conv of staleConversations) {
      const lastInbound = conv.messages[0];
      if (!lastInbound) continue;

      const elapsedMs = now.getTime() - new Date(lastInbound.sentAt).getTime();
      const elapsedMins = elapsedMs / 60_000;

      if (elapsedMins >= config.reassignAfterMins) {
        await this.handleReassign(conv, config);
      } else if (elapsedMins >= config.firstResponseTimeoutMins) {
        await this.handleWarning(conv, config);
      }
    }
  }

  private async handleWarning(
    conv: { id: string; assignedUserId: string | null },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: 'TIMEOUT_WARNING',
        createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (existing) return;

    const event = await this.prisma.clientChatEscalationEvent.create({
      data: {
        conversationId: conv.id,
        type: 'TIMEOUT_WARNING',
        fromUserId: conv.assignedUserId,
        metadata: { reason: 'First response timeout' },
      },
    });

    this.logger.warn(
      `SLA warning: conversation ${conv.id} (assigned to ${conv.assignedUserId})`,
    );

    if (config.notifyManagerOnEscalation) {
      this.events.emitToManagers('escalation:warning', {
        conversationId: conv.id,
        assignedUserId: conv.assignedUserId,
        type: 'TIMEOUT_WARNING',
        event,
      });
    }
  }

  private async handleReassign(
    conv: {
      id: string;
      assignedUserId: string | null;
      channelType: string;
    },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: 'AUTO_REASSIGN',
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (existing) return;

    const previousUserId = conv.assignedUserId;
    const nextUserId = await this.assignment.autoAssign(
      conv.channelType as any,
    );

    if (!nextUserId || nextUserId === previousUserId) return;

    await this.prisma.clientChatConversation.update({
      where: { id: conv.id },
      data: {
        assignedUserId: nextUserId,
        lastOperatorActivityAt: null,
      },
    });

    const event = await this.prisma.clientChatEscalationEvent.create({
      data: {
        conversationId: conv.id,
        type: 'AUTO_REASSIGN',
        fromUserId: previousUserId,
        toUserId: nextUserId,
        metadata: { reason: 'Reassign after timeout' },
      },
    });

    this.logger.warn(
      `Auto-reassigned conversation ${conv.id}: ${previousUserId} → ${nextUserId}`,
    );

    const updated = await this.prisma.clientChatConversation.findUnique({
      where: { id: conv.id },
    });
    if (updated) {
      this.events.emitConversationUpdated(
        updated as any,
        previousUserId,
      );
    }

    if (config.notifyManagerOnEscalation) {
      this.events.emitToManagers('escalation:reassign', {
        conversationId: conv.id,
        fromUserId: previousUserId,
        toUserId: nextUserId,
        type: 'AUTO_REASSIGN',
        event,
      });

      await this.prisma.clientChatEscalationEvent.create({
        data: {
          conversationId: conv.id,
          type: 'MANAGER_NOTIFIED',
          metadata: {
            reason: 'Auto-reassignment notification',
            fromUserId: previousUserId,
            toUserId: nextUserId,
          },
        },
      });
    }
  }
}
