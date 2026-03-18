import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType, ClientChatStatus } from '@prisma/client';
import { QueueScheduleService } from './queue-schedule.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueSchedule: QueueScheduleService,
  ) {}

  async getConfig(channelType: ClientChatChannelType) {
    const specific = await this.prisma.clientChatAssignmentConfig.findUnique({
      where: { channelType },
    });
    if (specific) return specific;

    return this.prisma.clientChatAssignmentConfig.findFirst({
      where: { channelType: null },
    });
  }

  async getAllConfigs() {
    return this.prisma.clientChatAssignmentConfig.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async upsertConfig(data: {
    channelType: ClientChatChannelType | null;
    strategy: string;
    assignableUsers: string[];
  }) {
    return this.prisma.clientChatAssignmentConfig.upsert({
      where: { channelType: data.channelType ?? undefined },
      create: {
        channelType: data.channelType,
        strategy: data.strategy,
        assignableUsers: data.assignableUsers,
      },
      update: {
        strategy: data.strategy,
        assignableUsers: data.assignableUsers,
      },
    });
  }

  async autoAssign(channelType: ClientChatChannelType): Promise<string | null> {
    const config = await this.getConfig(channelType);
    if (
      !config ||
      config.strategy !== 'round_robin' ||
      config.assignableUsers.length === 0
    ) {
      return null;
    }

    const todayPool = await this.queueSchedule.getActiveOperatorsToday();

    let effectivePool: string[];
    if (todayPool.length > 0) {
      effectivePool = config.assignableUsers.filter((u) =>
        todayPool.includes(u),
      );
      if (effectivePool.length === 0) {
        effectivePool = todayPool;
      }
    } else {
      effectivePool = config.assignableUsers;
    }

    if (effectivePool.length === 0) return null;

    const workloads = await this.prisma.clientChatConversation.groupBy({
      by: ['assignedUserId'],
      where: {
        assignedUserId: { in: effectivePool },
        status: ClientChatStatus.LIVE,
      },
      _count: true,
    });
    const loadMap = new Map(
      workloads.map((w) => [w.assignedUserId, w._count]),
    );

    let minLoad = Infinity;
    for (const uid of effectivePool) {
      const load = loadMap.get(uid) ?? 0;
      if (load < minLoad) minLoad = load;
    }

    const candidates = effectivePool.filter(
      (uid) => (loadMap.get(uid) ?? 0) === minLoad,
    );

    let nextUserId: string;
    if (candidates.length === 1) {
      nextUserId = candidates[0];
    } else {
      const lastIdx = config.lastAssignedTo
        ? candidates.indexOf(config.lastAssignedTo)
        : -1;
      const nextIdx = (lastIdx + 1) % candidates.length;
      nextUserId = candidates[nextIdx];
    }

    await this.prisma.clientChatAssignmentConfig.update({
      where: { id: config.id },
      data: { lastAssignedTo: nextUserId },
    });

    this.logger.log(
      `Auto-assigned to ${nextUserId} (pool=${effectivePool.length}, load=${loadMap.get(nextUserId) ?? 0})`,
    );
    return nextUserId;
  }
}
