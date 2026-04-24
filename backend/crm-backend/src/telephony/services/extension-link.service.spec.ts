import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ExtensionLinkService } from './extension-link.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AmiClientService } from '../ami/ami-client.service';

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
  let ami: { sendAction: jest.Mock };
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
    ami = { sendAction: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtensionLinkService,
        { provide: PrismaService, useValue: prisma },
        { provide: AmiClientService, useValue: ami },
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

    it('emits QueueAdd for every active rule on the user Position', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', isActive: true,
        employee: { firstName: 'Mariam', lastName: 'Malichava', positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
        { queue: { name: '800', isActive: true } },
        { queue: { name: '901', isActive: false } }, // inactive — must be skipped
      ]);

      await service.link('ext-1', 'user-1');

      // DB write happened via race-guarded updateMany
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalledWith({
        where: { id: 'ext-1', crmUserId: null },
        data: { crmUserId: 'user-1', displayName: 'Mariam Malichava' },
      });
      // AMI emitted 2 QueueAdd actions (inactive queue skipped)
      expect(ami.sendAction).toHaveBeenCalledTimes(2);
      const interfaces = ami.sendAction.mock.calls.map((c) => c[0].Interface);
      expect(interfaces.every((i) => i === 'Local/215@from-queue/n')).toBe(true);
      // Uses the correct FreePBX format, NOT PJSIP (Silent Override Risk #26)
      expect(interfaces.some((i) => /PJSIP/.test(i))).toBe(false);
    });

    it('skips AMI entirely when TELEPHONY_AUTO_QUEUE_SYNC=false (kill switch)', async () => {
      await build('false');
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
      ]);

      await service.link('ext-1', 'user-1');

      // DB write STILL happened — kill-switch only disables AMI, not CRM state
      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalled();
      // AMI must NOT have been called at all
      expect(ami.sendAction).not.toHaveBeenCalled();
    });

    it('treats "Already there" as success (idempotent QueueAdd)', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: 'pos-1' },
      });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
      ]);
      // asterisk-manager plain-object reject shape (Silent Override Risk #26)
      ami.sendAction.mockRejectedValueOnce({
        response: 'error',
        message: 'Unable to add interface: Already there',
      });

      await expect(service.link('ext-1', 'user-1')).resolves.toBeUndefined();
    });

    it('throws Conflict if the row state changed mid-request (updateMany count=0)', async () => {
      // Regression guard for the race where another admin linked/unlinked
      // the same row between our findUnique and update. Without the
      // count-check we would have silently applied AMI with stale
      // assumptions about the current link state.
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: 'pos-1' },
      });
      prisma.telephonyExtension.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.link('ext-1', 'user-1')).rejects.toThrow(ConflictException);
      // Critically: AMI must NOT have been called when the DB write was
      // a no-op, otherwise we'd spuriously add someone to queues.
      expect(ami.sendAction).not.toHaveBeenCalled();
    });

    it('succeeds with no queues when employee has no Position', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: null, isActive: true, displayName: 'pool',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1', isActive: true,
        employee: { firstName: 'X', lastName: 'Y', positionId: null },
      });

      await service.link('ext-1', 'user-1');

      expect(prisma.telephonyExtension.updateMany).toHaveBeenCalled();
      expect(prisma.positionQueueRule.findMany).not.toHaveBeenCalled();
      expect(ami.sendAction).not.toHaveBeenCalled();
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
      expect(ami.sendAction).not.toHaveBeenCalled();
    });

    it('derives Position BEFORE nulling crmUserId (ORDER is load-bearing)', async () => {
      // Regression guard: the service must look up the linked user's
      // Position before it writes crmUserId=null. This test verifies the
      // lookup is issued, the update fires, and QueueRemove is emitted.
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
      expect(ami.sendAction).toHaveBeenCalledTimes(1);
      expect(ami.sendAction.mock.calls[0][0].Action).toBe('QueueRemove');
    });

    it('treats "Not there" as success on QueueRemove', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        id: 'ext-1', extension: '215', crmUserId: 'user-1', displayName: 'X',
      });
      prisma.user.findUnique.mockResolvedValue({ employee: { positionId: 'pos-1' } });
      prisma.positionQueueRule.findMany.mockResolvedValue([
        { queue: { name: '30', isActive: true } },
      ]);
      ami.sendAction.mockRejectedValueOnce({
        response: 'error',
        message: 'Unable to remove interface from queue: Not there',
      });

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

    it('re-applies QueueAdd per current CRM state', async () => {
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
      expect(ami.sendAction.mock.calls.every((c) => c[0].Action === 'QueueAdd')).toBe(true);
    });
  });
});
