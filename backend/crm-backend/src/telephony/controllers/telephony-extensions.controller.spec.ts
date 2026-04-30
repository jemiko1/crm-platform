import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyExtensionsController } from './telephony-extensions.controller';
import { PrismaService } from '../../prisma/prisma.service';
import { AsteriskSyncService } from '../sync/asterisk-sync.service';
import { ExtensionLinkService } from '../services/extension-link.service';
import { TelephonyGateway } from '../realtime/telephony.gateway';

/**
 * Auto-rebind contract for admin-driven `update` and `remove` paths.
 *
 * `link` and `unlink` are tested in `extension-link.service.spec.ts`.
 * Here we cover the controller-level emit logic specifically:
 *   - update() emits ONLY when credential-affecting fields touched
 *     (extension / sipServer / sipPassword / isActive). Cosmetic edits
 *     (displayName, isOperator) must NOT trigger a SIP rebind because
 *     it would cause a needless ~1-2s window during which the operator
 *     can't take calls.
 *   - remove() must capture crmUserId BEFORE delete and notify after.
 *     If we delete first then read, the row is gone and we can't notify.
 */
describe('TelephonyExtensionsController — auto-rebind emit', () => {
  let controller: TelephonyExtensionsController;
  let prisma: {
    telephonyExtension: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };
  let gateway: { notifyExtensionChanged: jest.Mock };

  beforeEach(async () => {
    prisma = {
      telephonyExtension: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    gateway = { notifyExtensionChanged: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelephonyExtensionsController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: AsteriskSyncService, useValue: {} },
        { provide: ExtensionLinkService, useValue: {} },
        { provide: TelephonyGateway, useValue: gateway },
      ],
    }).compile();

    controller = module.get(TelephonyExtensionsController);
  });

  describe('update (PATCH)', () => {
    it('emits when sipPassword changed on a linked extension', async () => {
      prisma.telephonyExtension.update.mockResolvedValue({
        id: 'ext-1',
        crmUserId: 'user-1',
      });

      await controller.update('ext-1', { sipPassword: 'new-secret' });

      expect(gateway.notifyExtensionChanged).toHaveBeenCalledWith(
        'user-1',
        'admin-edit',
      );
    });

    it('emits when extension number changed on a linked extension', async () => {
      prisma.telephonyExtension.update.mockResolvedValue({
        id: 'ext-1',
        crmUserId: 'user-1',
      });

      await controller.update('ext-1', { extension: '216' });

      expect(gateway.notifyExtensionChanged).toHaveBeenCalledWith(
        'user-1',
        'admin-edit',
      );
    });

    it('emits when isActive changed (so softphone unregisters cleanly)', async () => {
      prisma.telephonyExtension.update.mockResolvedValue({
        id: 'ext-1',
        crmUserId: 'user-1',
      });

      await controller.update('ext-1', { isActive: false });

      expect(gateway.notifyExtensionChanged).toHaveBeenCalledWith(
        'user-1',
        'admin-edit',
      );
    });

    it('does NOT emit when only displayName changed (cosmetic)', async () => {
      prisma.telephonyExtension.update.mockResolvedValue({
        id: 'ext-1',
        crmUserId: 'user-1',
      });

      await controller.update('ext-1', { displayName: 'New Name' });

      // Cosmetic edits must not trigger a SIP rebind — the brief 1-2s
      // SIP transition would block calls for no reason.
      expect(gateway.notifyExtensionChanged).not.toHaveBeenCalled();
    });

    it('does NOT emit when only isOperator changed (cosmetic)', async () => {
      prisma.telephonyExtension.update.mockResolvedValue({
        id: 'ext-1',
        crmUserId: 'user-1',
      });

      await controller.update('ext-1', { isOperator: false });

      expect(gateway.notifyExtensionChanged).not.toHaveBeenCalled();
    });

    it('does NOT emit on credential change to an UNLINKED extension', async () => {
      prisma.telephonyExtension.update.mockResolvedValue({
        id: 'ext-1',
        crmUserId: null,
      });

      await controller.update('ext-1', { sipPassword: 'new' });

      // No operator linked → no one to notify.
      expect(gateway.notifyExtensionChanged).not.toHaveBeenCalled();
    });
  });

  describe('remove (DELETE)', () => {
    it('captures crmUserId BEFORE delete and notifies after', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        crmUserId: 'user-1',
      });

      await controller.remove('ext-1');

      // findUnique must run BEFORE delete — otherwise the row is gone
      // and we can't know who was linked.
      const findCall = prisma.telephonyExtension.findUnique.mock
        .invocationCallOrder[0];
      const deleteCall = prisma.telephonyExtension.delete.mock
        .invocationCallOrder[0];
      expect(findCall).toBeLessThan(deleteCall);

      expect(gateway.notifyExtensionChanged).toHaveBeenCalledWith(
        'user-1',
        'admin-delete',
      );
    });

    it('does NOT notify when deleting an unlinked extension', async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        crmUserId: null,
      });

      await controller.remove('ext-1');

      expect(prisma.telephonyExtension.delete).toHaveBeenCalled();
      expect(gateway.notifyExtensionChanged).not.toHaveBeenCalled();
    });
  });
});
