import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType } from '@prisma/client';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getConfig(channelType: ClientChatChannelType) {
    const specific = await this.prisma.clientChatAssignmentConfig.findUnique({
      where: { channelType },
    });
    if (specific) return specific;

    return this.prisma.clientChatAssignmentConfig.findUnique({
      where: { channelType: undefined },
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
    if (!config || config.strategy !== 'round_robin' || config.assignableUsers.length === 0) {
      return null;
    }

    const users = config.assignableUsers;
    let nextIdx = 0;

    if (config.lastAssignedTo) {
      const lastIdx = users.indexOf(config.lastAssignedTo);
      nextIdx = lastIdx >= 0 ? (lastIdx + 1) % users.length : 0;
    }

    const nextUserId = users[nextIdx];

    await this.prisma.clientChatAssignmentConfig.update({
      where: { id: config.id },
      data: { lastAssignedTo: nextUserId },
    });

    this.logger.log(`Auto-assigned to ${nextUserId} (round-robin index ${nextIdx})`);
    return nextUserId;
  }
}
