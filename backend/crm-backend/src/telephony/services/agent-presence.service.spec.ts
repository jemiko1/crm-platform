import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentPresenceService } from './agent-presence.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AgentPresenceService', () => {
  let service: AgentPresenceService;
  let prisma: {
    telephonyExtension: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      telephonyExtension: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentPresenceService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AgentPresenceService);
  });

  describe('reportState', () => {
    it('flips sipRegistered to true and updates lastSeen', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1',
        extension: '1001',
        isActive: true,
        sipRegistered: false,
      });
      prisma.telephonyExtension.update.mockImplementation(
        async ({ data }: any) => ({
          sipRegistered: data.sipRegistered,
          sipLastSeenAt: data.sipLastSeenAt,
          extension: '1001',
        }),
      );

      const result = await service.reportState('user-1', 'registered', '1001');

      expect(result.sipRegistered).toBe(true);
      expect(result.stateChanged).toBe(true);
      expect(result.extension).toBe('1001');
      expect(prisma.telephonyExtension.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'ext-1' },
          data: expect.objectContaining({ sipRegistered: true }),
        }),
      );
    });

    it('records stateChanged=false on repeated registered heartbeats', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1',
        extension: '1001',
        isActive: true,
        sipRegistered: true,
      });
      prisma.telephonyExtension.update.mockImplementation(
        async ({ data }: any) => ({
          sipRegistered: data.sipRegistered,
          sipLastSeenAt: data.sipLastSeenAt,
          extension: '1001',
        }),
      );

      const result = await service.reportState('user-1', 'registered', '1001');
      expect(result.stateChanged).toBe(false);
    });

    it('throws NotFoundException when user has no extension', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      await expect(
        service.reportState('user-1', 'registered', '1001'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.telephonyExtension.update).not.toHaveBeenCalled();
    });

    it('rejects heartbeat reporting for a different extension', async () => {
      // Defence against cross-user spoofing: user A's softphone cannot flip
      // user B's extension.
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1',
        extension: '1001',
        isActive: true,
        sipRegistered: false,
      });
      await expect(
        service.reportState('user-1', 'registered', '9999'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.telephonyExtension.update).not.toHaveBeenCalled();
    });

    it('flips sipRegistered to false on unregistered state', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1',
        extension: '1001',
        isActive: true,
        sipRegistered: true,
      });
      prisma.telephonyExtension.update.mockImplementation(
        async ({ data }: any) => ({
          sipRegistered: data.sipRegistered,
          sipLastSeenAt: data.sipLastSeenAt,
          extension: '1001',
        }),
      );

      const result = await service.reportState(
        'user-1',
        'unregistered',
        '1001',
      );
      expect(result.sipRegistered).toBe(false);
      expect(result.stateChanged).toBe(true);
    });
  });

  describe('sweepStaleRegistrations', () => {
    it('flips extensions that have not heartbeated in >90s to offline', async () => {
      const now = new Date('2026-04-19T10:00:00.000Z');
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { id: 'ext-1', crmUserId: 'user-1', extension: '1001' },
        { id: 'ext-2', crmUserId: 'user-2', extension: '1002' },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.sweepStaleRegistrations(now);

      expect(result).toEqual([
        { crmUserId: 'user-1', extension: '1001' },
        { crmUserId: 'user-2', extension: '1002' },
      ]);
      expect(prisma.telephonyExtension.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sipRegistered: true,
          }),
        }),
      );
      // Threshold must be now - 90s
      const findCall = prisma.telephonyExtension.findMany.mock.calls[0][0];
      const ltThreshold = findCall.where.OR[0].sipLastSeenAt.lt as Date;
      expect(now.getTime() - ltThreshold.getTime()).toBe(90_000);

      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ext-1', 'ext-2'] } },
        data: { sipRegistered: false },
      });
    });

    it('is a no-op when no extensions are stale', async () => {
      prisma.telephonyExtension.findMany.mockResolvedValue([]);
      const result = await service.sweepStaleRegistrations();
      expect(result).toEqual([]);
      expect(prisma.telephonyExtension.updateMany).not.toHaveBeenCalled();
    });

    it('runStaleRegistrationSweep notifies onStaleFlipped hook for each flipped user', async () => {
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { id: 'ext-1', crmUserId: 'user-1', extension: '1001' },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const flipped: Array<[string, string]> = [];
      service.onStaleFlipped = (u, e) => flipped.push([u, e]);

      await service.runStaleRegistrationSweep();

      expect(flipped).toEqual([['user-1', '1001']]);
    });
  });
});
