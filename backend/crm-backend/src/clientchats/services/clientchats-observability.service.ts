import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType } from '@prisma/client';
import { AdapterRegistryService } from '../adapters/adapter-registry.service';

@Injectable()
export class ClientChatsObservabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adapterRegistry: AdapterRegistryService,
  ) {}

  async getStatus() {
    const channels = this.adapterRegistry.listChannelTypes();
    const accounts = await this.prisma.clientChatChannelAccount.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, type: true, name: true },
    });

    const counts = await this.prisma.clientChatConversation.groupBy({
      by: ['status'],
      _count: true,
    });

    return {
      registeredAdapters: channels,
      activeAccounts: accounts,
      conversationCounts: counts.reduce(
        (acc, c) => ({ ...acc, [c.status]: c._count }),
        {},
      ),
    };
  }

  async getWebhookFailures(limit = 50, channelType?: ClientChatChannelType) {
    const where: Record<string, unknown> = {};
    if (channelType) where.channelType = channelType;

    return this.prisma.clientChatWebhookFailure.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async logWebhookFailure(
    channelType: ClientChatChannelType,
    error: string,
    payloadMeta: Record<string, unknown> = {},
  ) {
    return this.prisma.clientChatWebhookFailure.create({
      data: { channelType, error, payloadMeta: payloadMeta as any },
    });
  }
}
