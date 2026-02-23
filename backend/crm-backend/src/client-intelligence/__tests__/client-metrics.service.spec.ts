import { Test, TestingModule } from '@nestjs/testing';
import { ClientMetricsService } from '../services/client-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('ClientMetricsService', () => {
  let service: ClientMetricsService;
  let prisma: Record<string, any>;

  const mockClient = {
    id: 'uuid-1',
    coreId: 100,
    primaryPhone: '+995555123456',
    secondaryPhone: null,
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
        ClientMetricsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ClientMetricsService);
  });

  it('should throw NotFoundException for missing client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(service.computeMetrics(999)).rejects.toThrow(NotFoundException);
  });

  it('should compute empty metrics for a client with no activity', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const result = await service.computeMetrics(100);

    expect(result.clientId).toBe('uuid-1');
    expect(result.clientCoreId).toBe(100);
    expect(result.calls.total).toBe(0);
    expect(result.chats.total).toBe(0);
    expect(result.incidents.total).toBe(0);
    expect(result.contactFrequency.totalContacts).toBe(0);
    expect(result.contactFrequency.daysSinceLastContact).toBeNull();
  });

  it('should aggregate call metrics correctly', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const now = new Date();
    prisma.callSession.findMany.mockResolvedValue([
      {
        id: 'call-1',
        startAt: now,
        direction: 'INBOUND',
        disposition: 'ANSWERED',
        callMetrics: { talkSeconds: 120 },
      },
      {
        id: 'call-2',
        startAt: now,
        direction: 'INBOUND',
        disposition: 'ANSWERED',
        callMetrics: { talkSeconds: 180 },
      },
      {
        id: 'call-3',
        startAt: now,
        direction: 'INBOUND',
        disposition: 'MISSED',
        callMetrics: null,
      },
    ]);

    const result = await service.computeMetrics(100);

    expect(result.calls.total).toBe(3);
    expect(result.calls.answered).toBe(2);
    expect(result.calls.missed).toBe(1);
    expect(result.calls.avgDurationSeconds).toBe(150);
    expect(result.calls.totalDurationSeconds).toBe(300);
  });

  it('should aggregate chat metrics correctly', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const now = new Date();
    prisma.clientChatConversation.findMany.mockResolvedValue([
      {
        id: 'conv-1',
        channelType: 'WEB',
        status: 'OPEN',
        lastMessageAt: now,
        createdAt: now,
        _count: { messages: 10 },
      },
      {
        id: 'conv-2',
        channelType: 'VIBER',
        status: 'CLOSED',
        lastMessageAt: now,
        createdAt: now,
        _count: { messages: 5 },
      },
    ]);

    const result = await service.computeMetrics(100);

    expect(result.chats.total).toBe(2);
    expect(result.chats.open).toBe(1);
    expect(result.chats.closed).toBe(1);
    expect(result.chats.totalMessages).toBe(15);
    expect(result.chats.channels).toEqual({ WEB: 1, VIBER: 1 });
  });

  it('should aggregate incident metrics correctly', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const now = new Date();
    prisma.incident.findMany.mockResolvedValue([
      { id: 'inc-1', createdAt: now, incidentType: 'PLUMBING', status: 'IN_PROGRESS', priority: 'CRITICAL' },
      { id: 'inc-2', createdAt: now, incidentType: 'ELECTRICAL', status: 'COMPLETED', priority: 'HIGH' },
      { id: 'inc-3', createdAt: now, incidentType: 'PLUMBING', status: 'CREATED', priority: 'LOW' },
    ]);

    const result = await service.computeMetrics(100);

    expect(result.incidents.total).toBe(3);
    expect(result.incidents.open).toBe(2);
    expect(result.incidents.completed).toBe(1);
    expect(result.incidents.critical).toBe(1);
    expect(result.incidents.highPriority).toBe(1);
    expect(result.incidents.types).toEqual({ PLUMBING: 2, ELECTRICAL: 1 });
  });

  it('should compute contact frequency correctly', async () => {
    prisma.client.findUnique.mockResolvedValue(mockClient);

    const now = new Date();
    prisma.callSession.findMany.mockResolvedValue([
      { id: 'call-1', startAt: now, disposition: 'ANSWERED', callMetrics: { talkSeconds: 60 } },
    ]);
    prisma.clientChatConversation.findMany.mockResolvedValue([
      { id: 'conv-1', channelType: 'WEB', status: 'CLOSED', lastMessageAt: now, createdAt: now, _count: { messages: 3 } },
    ]);
    prisma.incident.findMany.mockResolvedValue([
      { id: 'inc-1', createdAt: now, incidentType: 'GENERAL', status: 'COMPLETED', priority: 'LOW' },
    ]);

    const result = await service.computeMetrics(100, 180);

    expect(result.contactFrequency.totalContacts).toBe(3);
    expect(result.contactFrequency.avgContactsPerMonth).toBe(0.5);
    expect(result.contactFrequency.daysSinceLastContact).toBe(0);
  });
});
