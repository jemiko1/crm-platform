import { Test, TestingModule } from '@nestjs/testing';
import { ActivityTimelineService } from '../services/activity-timeline.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneResolverService } from '../../common/phone-resolver/phone-resolver.service';
import { NotFoundException } from '@nestjs/common';

describe('ActivityTimelineService', () => {
  let service: ActivityTimelineService;
  let prisma: Record<string, any>;

  const mockClient = {
    id: 'uuid-1',
    coreId: 100,
    primaryPhone: '+995555123456',
    secondaryPhone: '+995555654321',
  };

  const mockPhoneResolver = {
    buildCallSessionFilter: jest.fn((phones: string[]) =>
      phones.flatMap((p) => {
        const digits = p.replace(/[^\d]/g, '').slice(-9);
        return [
          { callerNumber: { contains: digits } },
          { calleeNumber: { contains: digits } },
        ];
      }),
    ),
    localDigits: jest.fn((p: string) => p.replace(/[^\d]/g, '').slice(-9)),
  };

  beforeEach(async () => {
    prisma = {
      client: {
        findUnique: jest.fn(),
      },
      callSession: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      clientChatConversation: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      incident: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityTimelineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhoneResolverService, useValue: mockPhoneResolver },
      ],
    }).compile();

    service = module.get(ActivityTimelineService);
  });

  it('should throw NotFoundException for missing client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(service.getTimeline(999)).rejects.toThrow(NotFoundException);
  });

  it('should return empty timeline for client with no activity', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const result = await service.getTimeline(100);

    expect(result.entries).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('should merge and sort entries from calls, chats, incidents', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const t1 = new Date('2026-02-21T10:00:00Z');
    const t2 = new Date('2026-02-21T11:00:00Z');
    const t3 = new Date('2026-02-21T12:00:00Z');

    prisma.callSession.findMany.mockResolvedValue([
      {
        id: 'call-1',
        startAt: t1,
        direction: 'INBOUND',
        disposition: 'ANSWERED',
        callerNumber: '+995555123456',
        calleeNumber: '+995591234567',
        callMetrics: { talkSeconds: 120 },
        assignedUser: { email: 'agent@test.com' },
      },
    ]);

    prisma.clientChatConversation.findMany.mockResolvedValue([
      {
        id: 'chat-1',
        channelType: 'WEB',
        status: 'OPEN',
        externalConversationId: 'ext-1',
        lastMessageAt: t3,
        createdAt: t3,
        messages: [{ text: 'Hello, I need help', direction: 'IN' }],
      },
    ]);

    prisma.incident.findMany.mockResolvedValue([
      {
        id: 'inc-1',
        createdAt: t2,
        incidentNumber: 'INC-001',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        incidentType: 'PLUMBING',
        description: 'Leaking pipe in bathroom',
        building: { name: 'Building A' },
      },
    ]);

    const result = await service.getTimeline(100);

    expect(result.total).toBe(3);
    expect(result.entries[0].type).toBe('chat');
    expect(result.entries[1].type).toBe('incident');
    expect(result.entries[2].type).toBe('call');
  });

  it('should respect limit and offset', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const calls = Array.from({ length: 5 }, (_, i) => ({
      id: `call-${i}`,
      startAt: new Date(Date.now() - i * 3600000),
      direction: 'INBOUND',
      disposition: 'ANSWERED',
      callerNumber: '+995555123456',
      calleeNumber: '+995590000000',
      callMetrics: { talkSeconds: 60 },
      assignedUser: null,
    }));
    prisma.callSession.findMany.mockResolvedValue(calls);

    const result = await service.getTimeline(100, 2, 1);

    expect(result.entries.length).toBe(2);
    expect(result.total).toBe(5);
    expect(result.entries[0].id).toBe('call-1');
  });

  it('should handle client with no phones gracefully (no call entries)', async () => {
    prisma.client.findUnique.mockResolvedValue({
      ...mockClient,
      primaryPhone: null,
      secondaryPhone: null,
    });

    const result = await service.getTimeline(100);

    expect(result.entries).toEqual([]);
    expect(prisma.callSession.findMany).not.toHaveBeenCalled();
  });

  it('should include metadata in timeline entries', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    prisma.incident.findMany.mockResolvedValue([
      {
        id: 'inc-1',
        createdAt: new Date(),
        incidentNumber: 'INC-100',
        status: 'CREATED',
        priority: 'CRITICAL',
        incidentType: 'FIRE',
        description: 'Fire alarm triggered',
        building: { name: 'Tower B' },
      },
    ]);

    const result = await service.getTimeline(100);

    expect(result.entries[0].metadata).toMatchObject({
      incidentNumber: 'INC-100',
      status: 'CREATED',
      priority: 'CRITICAL',
      incidentType: 'FIRE',
      buildingName: 'Tower B',
    });
  });
});
