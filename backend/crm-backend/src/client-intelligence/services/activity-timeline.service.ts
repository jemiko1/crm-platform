import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneResolverService } from '../../common/phone-resolver/phone-resolver.service';
import { TimelineEntry } from '../interfaces/intelligence.types';

@Injectable()
export class ActivityTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneResolver: PhoneResolverService,
  ) {}

  async getTimeline(
    clientCoreId: number,
    limit = 50,
    offset = 0,
  ): Promise<{ entries: TimelineEntry[]; total: number }> {
    const client = await this.prisma.client.findUnique({
      where: { coreId: clientCoreId },
    });
    if (!client) throw new NotFoundException(`Client #${clientCoreId} not found`);

    const phones = [client.primaryPhone, client.secondaryPhone].filter(
      Boolean,
    ) as string[];

    const [calls, chats, incidents] = await Promise.all([
      this.fetchCalls(phones),
      this.fetchChats(client.id),
      this.fetchIncidents(client.id),
    ]);

    const all = [...calls, ...chats, ...incidents].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return {
      entries: all.slice(offset, offset + limit),
      total: all.length,
    };
  }

  private async fetchCalls(phones: string[]): Promise<TimelineEntry[]> {
    if (!phones.length) return [];

    const sessions = await this.prisma.callSession.findMany({
      where: {
        OR: this.phoneResolver.buildCallSessionFilter(phones),
      },
      include: {
        callMetrics: true,
        assignedUser: { select: { email: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 200,
    });

    return sessions.map((s) => {
      const duration = s.callMetrics?.talkSeconds
        ? `${Math.round(s.callMetrics.talkSeconds)}s`
        : 'N/A';
      const agent = s.assignedUser?.email ?? 'unassigned';

      return {
        id: s.id,
        type: 'call' as const,
        timestamp: s.startAt.toISOString(),
        summary: `${s.direction} call — ${s.disposition ?? 'unknown'} — ${duration} — Agent: ${agent}`,
        metadata: {
          direction: s.direction,
          disposition: s.disposition,
          callerNumber: s.callerNumber,
          calleeNumber: s.calleeNumber,
          durationSeconds: s.callMetrics?.talkSeconds ?? 0,
          agent,
        },
      };
    });
  }

  private async fetchChats(clientId: string): Promise<TimelineEntry[]> {
    const conversations = await this.prisma.clientChatConversation.findMany({
      where: { clientId },
      include: {
        messages: {
          take: 1,
          orderBy: { sentAt: 'desc' },
          select: { text: true, direction: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });

    return conversations.map((c) => {
      const lastMsg = c.messages[0];
      const preview = lastMsg
        ? `${lastMsg.direction === 'OUT' ? 'Agent' : 'Client'}: ${lastMsg.text.slice(0, 80)}`
        : 'No messages';

      return {
        id: c.id,
        type: 'chat' as const,
        timestamp: (c.lastMessageAt ?? c.createdAt).toISOString(),
        summary: `${c.channelType} chat — ${c.status} — ${preview}`,
        metadata: {
          channelType: c.channelType,
          status: c.status,
          externalConversationId: c.externalConversationId,
        },
      };
    });
  }

  private async fetchIncidents(clientId: string): Promise<TimelineEntry[]> {
    const incidents = await this.prisma.incident.findMany({
      where: { clientId },
      include: {
        building: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return incidents.map((i) => ({
      id: i.id,
      type: 'incident' as const,
      timestamp: i.createdAt.toISOString(),
      summary: `${i.priority} ${i.incidentType} — ${i.status} — ${i.building?.name ?? 'Unknown building'}`,
      metadata: {
        incidentNumber: i.incidentNumber,
        status: i.status,
        priority: i.priority,
        incidentType: i.incidentType,
        buildingName: i.building?.name,
        description: i.description?.slice(0, 120),
      },
    }));
  }

}
