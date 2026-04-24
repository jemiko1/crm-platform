import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ExtensionLinkService } from './extension-link.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PbxQueueMemberClient } from '../pbx/pbx-queue-member.client';

describe('ExtensionLinkService', () => {
  let service: ExtensionLinkService;
  let prisma: {
    telephonyExtension: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    positionQueueRule: { findMany: jest.Mock };
  };
  let pbx: { addMember: jest.Mock; removeMember: jest.Mock; listMembers: jest.Mock };
  const ORIG_ENV = process.env.TELEPHONY_AUTO_QUEUE_SYNC;

  async function build(envOverride?: string) {
    if (envOverride === undefined) delete process.env.TELEPHONY_AUTO_QUEUE_SYNC;
    else process.env.TELEPHONY_AUTO_QUEUE_SYNC = envOverride;

    prisma = {
      telephonyExtension: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findUnique: jest.fn() },
      positionQueueRule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    pbx = {
      addMember: jest.fn().mockResolvedValue(undefined),
      removeMember: jest.fn().mockResolvedValue(undefined),
      listMembers: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtensionLinkService,
        { provide: PrismaService, useValue: prisma },
        { provide: PbxQueueMemberClient, useValue: pbx },
      ],
    }).compile();
    service = module.get(ExtensionLinkService);
  }

  afterAll(() => {
    if (ORIG_ENV === undefined) delete process.env.TELEPHONY_AUTO_QUEUE_SYNC;
    else process.env.TELEPHONY_AUTO_QUEUE_SYNC = ORIG_ENV;
  });

  describe('link', () => {
    beforeEach(async () => {
      await build();
    });

    it('throws NotFound if extension does not exist', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      await expect(service.link('ext-missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequest if extension is disabled', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: false, displayName: 'X',
      });
      await expect(service.link('ext-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws Conflict if extension already linked to a different user', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: 'user-other', isActive: true, displayName: 'X',
      });
      await expect(service.link('ext-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('throws Conflict if user already linked to a different extension', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'X',
      });
      prisma.telephonyExtension.findFirst.mockResolvedValue({ extension: '216' });
      await expect(service.link('ext-1', 'user-1')).rejects.toThrow(/already linked to extension 216/);
    });

    it('calls pbx.addMember for every active rule on the user Position', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'mariam@asg.ge', isActive: true,
        employee: { firstName: 'Mariam', lastName: 'Malichava', positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
        { queue: { name: '800', isActive: true } },
        { queue: { name: '901', isActive: false } }, // inactive — must be skipped
      ]);

      await service.link('ext-1', 'user-1');

      // DB write via race-guarded updateMany
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: 'ext-1', crmUserId: null },
        data: { crmUserId: 'user-1', displayName: 'Mariam Malichava' },
      });
      // PBX: 2 calls (inactive queue skipped). Interface format is handled
      // inside the SSH helper — ExtensionLinkService only passes queue
      // name + extension number.
      expect(pbx.addMember).toHaveBeenCalledTimes(2);
      expect(pbx.addMember).toHaveBeenCalledWith('30', '215');
      expect(pbx.addMember).toHaveBeenCalledWith('800', '215');
      // Must NOT have called removeMember during a link
      expect(pbx.removeMember).not.toHaveBeenCalled();
    });

    it('skips PBX calls entirely when TELEPHONY_AUTO_QUEUE_SYNC=false (kill switch)', async () => {
      await build('false');
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'x@y.z', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
      ]);

      await service.link('ext-1', 'user-1');

      // DB write STILL happened — kill-switch only disables PBX path,
      // not CRM state
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalled();
      // PBX must NOT have been called at all
      expect(pbx.addMember).not.toHaveBeenCalled();
      expect(pbx.removeMember).not.toHaveBeenCalled();
    });

    it('throws Conflict if the row state changed mid-request (updateMany count=0)', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'x@y.z', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: 'pos-1' },
      });
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.link('ext-1', 'user-1')).rejects.toThrow(ConflictException);
      expect(pbx.addMember).not.toHaveBeenCalled();
    });

    it('succeeds with no queues when employee has no Position', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'x@y.z', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: null },
      });

      await service.link('ext-1', 'user-1');

      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalled();
      expect(prisma.positionQueueRule.findMany).not.toHaveBeenCalled();
      expect(pbx.addMember).not.toHaveBeenCalled();
    });

    it('reports skipped queues when pbx.addMember fails for a subset', async () => {
      // Partial-failure path: one queue's fwconsole reload fails, the
      // other succeeds. The service must not throw — the admin can retry
      // via Resync — but the failure must be logged.
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', email: 'x@y.z', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
        { queue: { name: '800', isActive: true } },
      ]);
      pbx.addMember
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('fwconsole reload timed out'));

      // link() itself returns void; partial PBX failures are absorbed
      await expect(service.link('ext-1', 'user-1')).resolves.toBeUndefined();
      expect(pbx.addMember).toHaveBeenCalledTimes(2);
    });
  });

  describe('unlink', () => {
    beforeEach(async () => {
      await build();
    });

    it('is a no-op if already unlinked', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, displayName: 'pool',
      });
      await service.unlink('ext-1');
      expect(prisma.telephonyExtension.updateMany).not.toHaveBeenCalled();
      expect(pbx.removeMember).not.toHaveBeenCalled();
    });

    it('derives Position BEFORE nulling crmUserId (ORDER is load-bearing)', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: 'user-1', displayName: 'Mariam',
      });
      prisma.user.findUnique.mockResolvedValue({
        employee: { positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
      ]);

      await service.unlink('ext-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { employee: { select: { positionId: true } } },
      });
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: 'ext-1', crmUserId: 'user-1' },
        data: { crmUserId: null },
      });
      expect(pbx.removeMember).toHaveBeenCalledWith('30', '215');
      expect(pbx.addMember).not.toHaveBeenCalled();
    });

    it('absorbs PBX removeMember errors — CRM state is already consistent', async () => {
      // The SSH helper is naturally idempotent, so any error is a real
      // failure (SSH down, fwconsole timeout). unlink must not throw —
      // the CRM row is already nulled and admin can reconcile via Resync
      // on a future link.
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: 'user-1', displayName: 'X',
      });
      prisma.user.findUnique.mockResolvedValue({ employee: { positionId: 'pos-1' } });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
      ]);
      pbx.removeMember.mockRejectedValueOnce(new Error('SSH connect failed'));

      await expect(service.unlink('ext-1')).resolves.toBeUndefined();
    });
  });

  describe('resyncQueues', () => {
    beforeEach(async () => {
      await build();
    });

    it('throws BadRequest if the extension is not linked', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, displayName: 'pool',
      });
      await expect(service.resyncQueues('ext-1')).rejects.toThrow(BadRequestException);
    });

    it('re-applies addMember per current CRM state', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: 'user-1', displayName: 'Mariam',
      });
      prisma.user.findUnique.mockResolvedValue({ employee: { positionId: 'pos-1' } });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
        { queue: { name: '800', isActive: true } },
      ]);

      const result = await service.resyncQueues('ext-1');

      expect(result.applied).toBe(2);
      expect(pbx.addMember).toHaveBeenCalledTimes(2);
    });
  });
});
