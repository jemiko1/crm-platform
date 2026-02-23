import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientMetrics } from '../interfaces/intelligence.types';

const DEFAULT_PERIOD_DAYS = 180;

@Injectable()
export class ClientMetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async computeMetrics(
    clientCoreId: number,
    periodDays = DEFAULT_PERIOD_DAYS,
  ): Promise<ClientMetrics> {
    const client = await this.prisma.client.findUnique({
      where: { coreId: clientCoreId },
    });
    if (!client) throw new NotFoundException(`Client #${clientCoreId} not found`);

    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    const phones = [client.primaryPhone, client.secondaryPhone].filter(
      Boolean,
    ) as string[];

    const [callMetrics, chatMetrics, incidentMetrics] = await Promise.all([
      this.computeCallMetrics(phones, since),
      this.computeChatMetrics(client.id, since),
      this.computeIncidentMetrics(client.id, since),
    ]);

    const lastContactDates = [
      callMetrics.lastCallAt,
      chatMetrics.lastChatAt,
      incidentMetrics.lastIncidentAt,
    ]
      .filter(Boolean)
      .map((d) => new Date(d!).getTime());

    const lastContactAt = lastContactDates.length
      ? new Date(Math.max(...lastContactDates))
      : null;

    const totalContacts =
      callMetrics.total + chatMetrics.total + incidentMetrics.total;
    const months = Math.max(periodDays / 30, 1);

    return {
      clientId: client.id,
      clientCoreId: client.coreId,
      periodDays,
      calls: callMetrics,
      chats: chatMetrics,
      incidents: incidentMetrics,
      contactFrequency: {
        totalContacts,
        avgContactsPerMonth: Math.round((totalContacts / months) * 10) / 10,
        daysSinceLastContact: lastContactAt
          ? Math.floor(
              (Date.now() - lastContactAt.getTime()) / (1000 * 60 * 60 * 24),
            )
          : null,
      },
    };
  }

  private async computeCallMetrics(
    phones: string[],
    since: Date,
  ): Promise<ClientMetrics['calls']> {
    if (!phones.length) {
      return {
        total: 0,
        answered: 0,
        missed: 0,
        avgDurationSeconds: 0,
        totalDurationSeconds: 0,
        lastCallAt: null,
      };
    }

    const sessions = await this.prisma.callSession.findMany({
      where: {
        startAt: { gte: since },
        OR: phones.flatMap((p) => {
          const norm = p.replace(/[\s\-()]/g, '');
          return [
            { callerNumber: { contains: norm } },
            { calleeNumber: { contains: norm } },
          ];
        }),
      },
      include: { callMetrics: true },
      orderBy: { startAt: 'desc' },
    });

    const answered = sessions.filter((s) => s.disposition === 'ANSWERED');
    const totalDuration = answered.reduce(
      (sum, s) => sum + (s.callMetrics?.talkSeconds ?? 0),
      0,
    );

    return {
      total: sessions.length,
      answered: answered.length,
      missed: sessions.length - answered.length,
      avgDurationSeconds: answered.length
        ? Math.round(totalDuration / answered.length)
        : 0,
      totalDurationSeconds: Math.round(totalDuration),
      lastCallAt: sessions[0]?.startAt.toISOString() ?? null,
    };
  }

  private async computeChatMetrics(
    clientId: string,
    since: Date,
  ): Promise<ClientMetrics['chats']> {
    const conversations = await this.prisma.clientChatConversation.findMany({
      where: { clientId, createdAt: { gte: since } },
      include: {
        _count: { select: { messages: true } },
      },
    });

    const channels: Record<string, number> = {};
    let totalMessages = 0;
    let openCount = 0;
    let closedCount = 0;
    let lastChatAt: Date | null = null;

    for (const c of conversations) {
      channels[c.channelType] = (channels[c.channelType] ?? 0) + 1;
      totalMessages += c._count.messages;
      if (c.status === 'OPEN' || c.status === 'PENDING') openCount++;
      if (c.status === 'CLOSED') closedCount++;

      const ts = c.lastMessageAt ?? c.createdAt;
      if (!lastChatAt || ts > lastChatAt) lastChatAt = ts;
    }

    return {
      total: conversations.length,
      open: openCount,
      closed: closedCount,
      totalMessages,
      avgMessagesPerConversation: conversations.length
        ? Math.round((totalMessages / conversations.length) * 10) / 10
        : 0,
      channels,
      lastChatAt: lastChatAt?.toISOString() ?? null,
    };
  }

  private async computeIncidentMetrics(
    clientId: string,
    since: Date,
  ): Promise<ClientMetrics['incidents']> {
    const incidents = await this.prisma.incident.findMany({
      where: { clientId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    });

    const types: Record<string, number> = {};
    let openCount = 0;
    let completedCount = 0;
    let criticalCount = 0;
    let highCount = 0;

    for (const i of incidents) {
      types[i.incidentType] = (types[i.incidentType] ?? 0) + 1;
      if (i.status === 'CREATED' || i.status === 'IN_PROGRESS') openCount++;
      if (i.status === 'COMPLETED') completedCount++;
      if (i.priority === 'CRITICAL') criticalCount++;
      if (i.priority === 'HIGH') highCount++;
    }

    return {
      total: incidents.length,
      open: openCount,
      completed: completedCount,
      critical: criticalCount,
      highPriority: highCount,
      types,
      lastIncidentAt: incidents[0]?.createdAt.toISOString() ?? null,
    };
  }
}
