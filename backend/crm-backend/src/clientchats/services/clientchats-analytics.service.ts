import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Text marker inserted by ClientChatsPublicController.startChat when a
 * customer opens the web-chat widget (before typing anything). Excluded from
 * first-response-time analytics because it's system-generated — counting it
 * as the clock-start inflates response time by however long the customer
 * spent typing their first real message (bug A1 from the April 2026 audit).
 *
 * If additional synthetic inbound markers are added (e.g. for other channels),
 * extend this list and they'll be automatically excluded from clock-start
 * selection.
 */
const SYSTEM_INBOUND_TEXT_MARKERS = ['[Chat started]'] as const;

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
      responseTimeRows,
      pickupTimeRows,
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

      // Bug A1 fix: response time measured from the first NON-SYSTEM inbound
      // message's sentAt, not from the conversation's createdAt. The web-
      // widget's "[Chat started]" marker is a system-generated inbound
      // created when the visitor OPENS the widget; counting it would inflate
      // response time by however long the customer spent typing.
      //
      // Fallback: COALESCE to createdAt if the conversation has ZERO
      // non-system inbound messages (edge case — an empty widget session
      // the operator replied to pre-emptively, or a conversation created
      // by assignment without any inbound).
      this.prisma.$queryRaw<{ clockStart: Date; firstResponseAt: Date }[]>`
        SELECT COALESCE(
                 (SELECT MIN(m."sentAt")
                  FROM "ClientChatMessage" m
                  WHERE m."conversationId" = c.id
                    AND m."direction" = 'IN'
                    AND m."text" NOT IN (${SYSTEM_INBOUND_TEXT_MARKERS[0]})),
                 c."createdAt"
               ) AS "clockStart",
               c."firstResponseAt" AS "firstResponseAt"
        FROM "ClientChatConversation" c
        WHERE c."createdAt" >= ${fromDate}
          AND c."createdAt" <= ${toDate}
          AND c."firstResponseAt" IS NOT NULL
      `,

      // Pickup time: joinedAt - first non-system inbound sentAt (same
      // clock-start logic).
      this.prisma.$queryRaw<{ clockStart: Date; joinedAt: Date }[]>`
        SELECT COALESCE(
                 (SELECT MIN(m."sentAt")
                  FROM "ClientChatMessage" m
                  WHERE m."conversationId" = c.id
                    AND m."direction" = 'IN'
                    AND m."text" NOT IN (${SYSTEM_INBOUND_TEXT_MARKERS[0]})),
                 c."createdAt"
               ) AS "clockStart",
               c."joinedAt" AS "joinedAt"
        FROM "ClientChatConversation" c
        WHERE c."createdAt" >= ${fromDate}
          AND c."createdAt" <= ${toDate}
          AND c."joinedAt" IS NOT NULL
      `,

      this.prisma.clientChatConversation.findMany({
        where: {
          createdAt: { gte: fromDate, lte: toDate },
          resolvedAt: { not: null },
          joinedAt: { not: null },
        },
        select: { joinedAt: true, resolvedAt: true },
      }),
    ]);

    let avgFirstResponseMinutes: number | null = null;
    if (responseTimeRows.length > 0) {
      const totalMs = responseTimeRows.reduce((sum, c) => {
        const firstResponseAt = new Date(c.firstResponseAt).getTime();
        const clockStart = new Date(c.clockStart).getTime();
        // Guard against clock-skew anomalies: if firstResponseAt < clockStart
        // (shouldn't happen but defensive), treat as zero rather than negative.
        return sum + Math.max(0, firstResponseAt - clockStart);
      }, 0);
      avgFirstResponseMinutes = Math.round(totalMs / responseTimeRows.length / 60000);
    }

    let avgPickupTimeMinutes: number | null = null;
    if (pickupTimeRows.length > 0) {
      const totalMs = pickupTimeRows.reduce((sum, c) => {
        const joinedAt = new Date(c.joinedAt).getTime();
        const clockStart = new Date(c.clockStart).getTime();
        return sum + Math.max(0, joinedAt - clockStart);
      }, 0);
      avgPickupTimeMinutes = +(totalMs / pickupTimeRows.length / 60000).toFixed(1);
    }

    let avgResolutionMinutes: number | null = null;
    if (resolutionTimeData.length > 0) {
      const totalMs = resolutionTimeData.reduce((sum, c) => {
        return sum + (c.resolvedAt!.getTime() - c.joinedAt!.getTime());
      }, 0);
      avgResolutionMinutes = Math.round(totalMs / resolutionTimeData.length / 60000);
    }

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      byStatus[row.status] = row._count;
    }

    const unassignedCount = await this.prisma.clientChatConversation.count({
      where: {
        createdAt: { gte: fromDate, lte: toDate },
        assignedUserId: null,
        status: 'LIVE',
      },
    });

    return {
      totalConversations,
      totalMessages,
      avgFirstResponseMinutes,
      avgPickupTimeMinutes,
      avgResolutionMinutes,
      byStatus,
      unassignedCount,
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

    // Bug A1 fix (also applied at per-agent level): clock-start is the first
    // non-system inbound message, falling back to createdAt only when the
    // conversation has zero real inbound messages.
    const responseTimeByAgent = await this.prisma.$queryRaw<
      { assignedUserId: string; avgMs: number }[]
    >`
      SELECT c."assignedUserId",
             AVG(
               GREATEST(
                 EXTRACT(EPOCH FROM (
                   c."firstResponseAt" - COALESCE(
                     (SELECT MIN(m."sentAt")
                      FROM "ClientChatMessage" m
                      WHERE m."conversationId" = c.id
                        AND m."direction" = 'IN'
                        AND m."text" NOT IN (${SYSTEM_INBOUND_TEXT_MARKERS[0]})),
                     c."createdAt"
                   )
                 )) * 1000,
                 0
               )
             )::float as "avgMs"
      FROM "ClientChatConversation" c
      WHERE c."createdAt" >= ${fromDate}
        AND c."createdAt" <= ${toDate}
        AND c."assignedUserId" IS NOT NULL
        AND c."firstResponseAt" IS NOT NULL
      GROUP BY c."assignedUserId"
    `;

    const pickupTimeByAgent = await this.prisma.$queryRaw<
      { assignedUserId: string; avgMs: number }[]
    >`
      SELECT c."assignedUserId",
             AVG(
               GREATEST(
                 EXTRACT(EPOCH FROM (
                   c."joinedAt" - COALESCE(
                     (SELECT MIN(m."sentAt")
                      FROM "ClientChatMessage" m
                      WHERE m."conversationId" = c.id
                        AND m."direction" = 'IN'
                        AND m."text" NOT IN (${SYSTEM_INBOUND_TEXT_MARKERS[0]})),
                     c."createdAt"
                   )
                 )) * 1000,
                 0
               )
             )::float as "avgMs"
      FROM "ClientChatConversation" c
      WHERE c."createdAt" >= ${fromDate}
        AND c."createdAt" <= ${toDate}
        AND c."assignedUserId" IS NOT NULL
        AND c."joinedAt" IS NOT NULL
      GROUP BY c."assignedUserId"
    `;

    const resolutionTimeByAgent = await this.prisma.$queryRaw<
      { assignedUserId: string; avgMs: number }[]
    >`
      SELECT "assignedUserId",
             AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "joinedAt")) * 1000)::float as "avgMs"
      FROM "ClientChatConversation"
      WHERE "createdAt" >= ${fromDate}
        AND "createdAt" <= ${toDate}
        AND "assignedUserId" IS NOT NULL
        AND "joinedAt" IS NOT NULL
        AND "resolvedAt" IS NOT NULL
      GROUP BY "assignedUserId"
    `;

    const allUserIds = new Set<string>();
    const convMap: Record<string, number> = {};
    const msgMap: Record<string, number> = {};
    const respMap: Record<string, number> = {};
    const pickupMap: Record<string, number> = {};
    const resolMap: Record<string, number> = {};

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
    for (const row of pickupTimeByAgent) {
      pickupMap[row.assignedUserId] = +(row.avgMs / 60000).toFixed(1);
    }
    for (const row of resolutionTimeByAgent) {
      resolMap[row.assignedUserId] = Math.round(row.avgMs / 60000);
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
        avgPickupTimeMinutes: pickupMap[uid] ?? null,
        avgResolutionMinutes: resolMap[uid] ?? null,
      };
    });
  }
}
