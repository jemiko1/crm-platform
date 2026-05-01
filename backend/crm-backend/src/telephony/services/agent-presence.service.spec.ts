import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentPresenceService } from './agent-presence.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AsteriskSyncService } from '../sync/asterisk-sync.service';

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
  let asteriskSync: { getEndpointStatuses: jest.Mock };

  beforeEach(async () => {
    prisma = {
      telephonyExtension: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    asteriskSync = {
      getEndpointStatuses: jest.fn().mockResolvedValue({}),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentPresenceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AsteriskSyncService, useValue: asteriskSync },
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

  describe('reconcileFromAsterisk', () => {
    const now = new Date('2026-05-01T12:00:00.000Z');

    function setupLinkedExtensions(
      rows: Array<{
        id: string;
        crmUserId: string | null;
        extension: string;
        sipRegistered: boolean;
      }>,
    ) {
      prisma.telephonyExtension.findMany.mockResolvedValue(rows);
    }

    it('flips DB→registered when Asterisk says reachable but DB says not', async () => {
      // Real scenario from the field: operator using MicroSIP from another
      // office. Asterisk knows they're registered (`Not in use`); the CRM
      // softphone's heartbeat path never fires. Reconciliation surfaces
      // them on the live page.
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: false },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const changed = await service.reconcileFromAsterisk(
        { '101': 'Not in use' },
        now,
      );

      expect(changed).toEqual([
        { crmUserId: 'user-1', extension: '101', sipRegistered: true },
      ]);
      // Two updates fire — registered flip + (no refreshOnly + no unregistered).
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ext-1'] } },
        data: { sipRegistered: true, sipLastSeenAt: now },
      });
    });

    it('flips DB→unregistered when Asterisk no longer reports the contact', async () => {
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: true },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const changed = await service.reconcileFromAsterisk(
        { '101': 'Unavailable' },
        now,
      );

      expect(changed).toEqual([
        { crmUserId: 'user-1', extension: '101', sipRegistered: false },
      ]);
      // Critically: sipLastSeenAt is NOT refreshed when going to unregistered
      // — leaving the timestamp alone preserves the freshness logic in the
      // live page (PR #334).
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ext-1'] } },
        data: { sipRegistered: false },
      });
    });

    it('refreshes sipLastSeenAt when Asterisk and DB agree on registered', async () => {
      // Healthy operator already shown as registered. Reconciliation
      // refreshes sipLastSeenAt so the 90s stale sweep doesn't trip them.
      // No `agent:status` emit because state didn't change.
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: true },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const changed = await service.reconcileFromAsterisk(
        { '101': 'In use' },
        now,
      );

      expect(changed).toEqual([]);
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['ext-1'] } },
        data: { sipLastSeenAt: now },
      });
    });

    it('is a no-op when Asterisk and DB agree on unregistered', async () => {
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: false },
      ]);

      const changed = await service.reconcileFromAsterisk(
        { '101': 'Unavailable' },
        now,
      );

      expect(changed).toEqual([]);
      expect(prisma.telephonyExtension.updateMany).not.toHaveBeenCalled();
    });

    it('skips reconciliation entirely when Asterisk status map is empty (AMI down / sync disabled)', async () => {
      // Critical reliability rule: do NOT pessimistically flip everyone to
      // unregistered when AMI is down. The stale-heartbeat sweep is the
      // safety net for that case.
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: true },
      ]);

      const changed = await service.reconcileFromAsterisk({}, now);

      expect(changed).toEqual([]);
      // Don't even read the DB if there's nothing to reconcile against.
      expect(prisma.telephonyExtension.findMany).not.toHaveBeenCalled();
      expect(prisma.telephonyExtension.updateMany).not.toHaveBeenCalled();
    });

    it('treats an extension entirely absent from the Asterisk map as unregistered', async () => {
      // Possible causes of absence: regex parser missed a future Asterisk
      // status string, endpoint disappeared from FreePBX between sync and
      // reconciliation, AMI returned a partial response. In all cases we
      // treat absence as unregistered — Asterisk doesn't know about the
      // contact, so neither should we. Behavior is internally consistent
      // and self-corrects on the next AMI cycle once the regex/sync
      // catches up.
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: true },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const changed = await service.reconcileFromAsterisk(
        { '999': 'Not in use' }, // ext '101' not in map at all
        now,
      );

      expect(changed).toEqual([
        { crmUserId: 'user-1', extension: '101', sipRegistered: false },
      ]);
    });

    it('treats every non-registered status string as unregistered', async () => {
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: true },
        { id: 'ext-2', crmUserId: 'user-2', extension: '102', sipRegistered: true },
        { id: 'ext-3', crmUserId: 'user-3', extension: '103', sipRegistered: true },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 3 });

      const changed = await service.reconcileFromAsterisk(
        {
          '101': 'Unavailable',
          '102': 'Unknown',
          '103': 'something completely unexpected',
        },
        now,
      );

      expect(changed).toHaveLength(3);
      expect(changed.every((c) => c.sipRegistered === false)).toBe(true);
    });

    it('treats all registered status variants as registered (case-insensitive)', async () => {
      // pjsip show endpoints output is parsed by asterisk-sync.service.ts
      // and lower-cased there, but defend against a future regex change
      // by being case-insensitive here too.
      setupLinkedExtensions([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: false },
        { id: 'ext-2', crmUserId: 'user-2', extension: '102', sipRegistered: false },
        { id: 'ext-3', crmUserId: 'user-3', extension: '103', sipRegistered: false },
        { id: 'ext-4', crmUserId: 'user-4', extension: '104', sipRegistered: false },
        { id: 'ext-5', crmUserId: 'user-5', extension: '105', sipRegistered: false },
        { id: 'ext-6', crmUserId: 'user-6', extension: '106', sipRegistered: false },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 6 });

      const changed = await service.reconcileFromAsterisk(
        {
          '101': 'Not in use',
          '102': 'In use',
          '103': 'Busy',
          '104': 'Ringing',
          '105': 'On Hold',
          '106': 'RING, IN USE',
        },
        now,
      );

      expect(changed).toHaveLength(6);
      expect(changed.every((c) => c.sipRegistered === true)).toBe(true);
    });

    it('queries only active, linked extensions (excludes pool rows)', async () => {
      setupLinkedExtensions([]);

      await service.reconcileFromAsterisk({ '101': 'Not in use' }, now);

      expect(prisma.telephonyExtension.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, crmUserId: { not: null } },
        }),
      );
    });

    it('ignores rows with null crmUserId even if returned by Prisma', async () => {
      // Defence-in-depth — the where clause already excludes these, but if
      // somehow a pool row leaks through it must not be reported as a flip.
      setupLinkedExtensions([
        { id: 'pool-1', crmUserId: null, extension: '999', sipRegistered: false },
      ]);

      const changed = await service.reconcileFromAsterisk(
        { '999': 'Not in use' },
        now,
      );

      expect(changed).toEqual([]);
      expect(prisma.telephonyExtension.updateMany).not.toHaveBeenCalled();
    });

    it('handles a mixed batch in three grouped updates', async () => {
      setupLinkedExtensions([
        // newly registered (DB false → Asterisk reachable)
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: false },
        // newly unregistered (DB true → Asterisk unavailable)
        { id: 'ext-2', crmUserId: 'user-2', extension: '102', sipRegistered: true },
        // already registered, refresh only
        { id: 'ext-3', crmUserId: 'user-3', extension: '103', sipRegistered: true },
        // already unregistered, no-op
        { id: 'ext-4', crmUserId: 'user-4', extension: '104', sipRegistered: false },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const changed = await service.reconcileFromAsterisk(
        {
          '101': 'Not in use',
          '102': 'Unavailable',
          '103': 'In use',
          '104': 'Unavailable',
        },
        now,
      );

      expect(changed).toEqual([
        { crmUserId: 'user-1', extension: '101', sipRegistered: true },
        { crmUserId: 'user-2', extension: '102', sipRegistered: false },
      ]);
      // 3 grouped updateMany calls, not 4 individual updates.
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledTimes(3);
    });
  });

  describe('runAsteriskReconciliation', () => {
    it('calls AsteriskSyncService.getEndpointStatuses + fires onAsteriskFlip for each delta', async () => {
      asteriskSync.getEndpointStatuses.mockResolvedValue({
        '101': 'Not in use',
      });
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { id: 'ext-1', crmUserId: 'user-1', extension: '101', sipRegistered: false },
      ]);
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 1 });

      const flips: Array<[string, string, boolean]> = [];
      service.onAsteriskFlip = (u, e, r) => flips.push([u, e, r]);

      await service.runAsteriskReconciliation();

      expect(asteriskSync.getEndpointStatuses).toHaveBeenCalledTimes(1);
      expect(flips).toEqual([['user-1', '101', true]]);
    });

    it('skips when a previous reconciliation is still in flight', async () => {
      // Overlap guard: Postgres slowness or Asterisk slowness shouldn't
      // produce concurrent reconciliations that race on the same rows.
      let release: () => void = () => {};
      asteriskSync.getEndpointStatuses.mockReturnValue(
        new Promise<Record<string, string>>((resolve) => {
          release = () => resolve({});
        }),
      );

      const first = service.runAsteriskReconciliation();
      const second = service.runAsteriskReconciliation();

      await second; // returns immediately due to overlap guard
      expect(asteriskSync.getEndpointStatuses).toHaveBeenCalledTimes(1);

      release();
      await first;
      // Second tick (not blocked) should now succeed.
      await service.runAsteriskReconciliation();
      expect(asteriskSync.getEndpointStatuses).toHaveBeenCalledTimes(2);
    });

    it('logs and recovers from a thrown error inside the reconcile loop', async () => {
      asteriskSync.getEndpointStatuses.mockRejectedValue(new Error('AMI exploded'));

      // Must not throw — cron failures should not crash the scheduler.
      await expect(service.runAsteriskReconciliation()).resolves.toBeUndefined();
    });
  });
});
