import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ClientChatsAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDateRange(from?: string, to?: string) {
    const now = new Date();
    const toDate = to ? new Date(to) : now;
    const fromDate = from
      ? new Date(from)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { fromDate, toDate };
  }

  async getOverview(from?: string, to?: string) {
    const { fromDate, toDate } = this.parseDateRange(from, to);

    const [
      totalConversations,
      totalMessages,
      statusCounts,
      responseTimeData,
      resolutionTimeData,
    ] = await Promise.all([
      this.prisma.clientChatConversation.count({
        where: { createdAt: { gte: fromDate, lte: toDate } },
      }),

      this.prisma.clientChatMessage.count({
        where: { sentAt: { gte: fromDate, lte: toDate } },
      }),

      this.prisma.clientChatConversation.groupBy({
        by: ['status'],
        where: { createdAt: { gte: fromDate, lte: toDate } },
        _count: true,
      }),

      this.prisma.clientChatConversation.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          firstResponseAt: { not: null },
        },
        select: { createdAt: true, firstResponseAt: true },
      }),

      this.prisma.clientChatConversation.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          resolvedAt: { not: null },
        },
        select: { createdAt: true, resolvedAt: true },
      }),
    ]);

    let avgFirstResponseMinutes: number | null = null;
    if (responseTimeData.length > 0) {
      const totalMs = responseTimeData.reduce((sum, c) => {
        return sum + (c.firstResponseAt!.getTime() - c.createdAt.getTime());
      }, 0);
      avgFirstResponseMinutes = Math.round(totalMs / responseTimeData.length / 60000);
    }

    let avgResolutionMinutes: number | null = null;
    if (resolutionTimeData.length > 0) {
      const totalMs = resolutionTimeData.reduce((sum, c) => {
        return sum + (c.resolvedAt!.getTime() - c.createdAt.getTime());
      }, 0);
      avgResolutionMinutes = Math.round(totalMs / resolutionTimeData.length / 60000);
    }

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row._count;
    }

    return {
      totalConversations,
      totalMessages,
      avgFirstResponseMinutes,
      avgResolutionMinutes,
      byStatus,
    };
  }

  async getByChannel(from?: string, to?: string) {
    const { fromDate, toDate } = this.parseDateRange(from, to);

    const conversationsByChannel = await this.prisma.clientChatConversation.groupBy({
      by: ['channelType'],
      where: { createdAt: { gte: fromDate, lte: toDate } },
      _count: true,
    });

    const convMap: Record<string, number> = {};
    for (const row of conversationsByChannel) {
      convMap[row.channelType] = row._count;
    }

    const msgByChannel = await this.prisma.$queryRaw<
      { channelType: string; count: bigint }[]
    >`
      SELECT c."channelType", COUNT(m.id)::bigint as count
      FROM "ClientChatMessage" m
      JOIN "ClientChatConversation" c ON c.id = m."conversationId"
      WHERE m."sentAt" >= ${fromDate} AND m."sentAt" <= ${toDate}
      GROUP BY c."channelType"
    `;

    const msgMap: Record<string, number> = {};
    for (const row of msgByChannel) {
      msgMap[row.channelType] = Number(row.count);
    }

    const channels = [
      ...new Set([...Object.keys(convMap), ...Object.keys(msgMap)]),
    ];

    return channels.map((ch) => ({
      channelType: ch,
      conversations: convMap[ch] || 0,
      messages: msgMap[ch] || 0,
    }));
  }

  async getByAgent(from?: string, to?: string) {
    const { fromDate, toDate } = this.parseDateRange(from, to);

    const agentConversations = await this.prisma.clientChatConversation.groupBy({
      by: ['assignedUserId'],
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        assignedUserId: { not: null },
      },
      _count: true,
    });

    const agentMessages = await this.prisma.clientChatMessage.groupBy({
      by: ['senderUserId'],
      where: {
        sentAt: { gte: fromDate, lte: toDate },
        direction: 'OUT',
        senderUserId: { not: null },
      },
      _count: true,
    });

    const responseTimeByAgent = await this.prisma.$queryRaw<
      { assignedUserId: string; avgMs: number }[]
    >`
      SELECT "assignedUserId",
             AVG(EXTRACT(EPOCH FROM ("firstResponseAt" - "createdAt")) * 1000)::float as "avgMs"
      FROM "ClientChatConversation"
      WHERE "createdAt" >= ${fromDate}
        AND "createdAt" <= ${toDate}
        AND "assignedUserId" IS NOT NULL
        AND "firstResponseAt" IS NOT NULL
      GROUP BY "assignedUserId"
    `;

    const allUserIds = new Set<string>();
    const convMap: Record<string, number> = {};
    const msgMap: Record<string, number> = {};
    const respMap: Record<string, number> = {};

    for (const row of agentConversations) {
      if (row.assignedUserId) {
        allUserIds.add(row.assignedUserId);
        convMap[row.assignedUserId] = row._count;
      }
    }
    for (const row of agentMessages) {
      if (row.senderUserId) {
        allUserIds.add(row.senderUserId);
        msgMap[row.senderUserId] = row._count;
      }
    }
    for (const row of responseTimeByAgent) {
      respMap[row.assignedUserId] = Math.round(row.avgMs / 60000);
    }

    const userIds = [...allUserIds];
    if (userIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    return userIds.map((uid) => {
      const user = userMap.get(uid);
      const name = user?.employee
        ? [user.employee.firstName, user.employee.lastName]
            .filter(Boolean)
            .join(' ')
        : user?.email || uid;

      return {
        userId: uid,
        agentName: name,
        email: user?.email || '',
        conversationsHandled: convMap[uid] || 0,
        messagesSent: msgMap[uid] || 0,
        avgFirstResponseMinutes: respMap[uid] ?? null,
      };
    });
  }
}
