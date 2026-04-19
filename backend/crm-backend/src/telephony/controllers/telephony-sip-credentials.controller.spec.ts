import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TelephonySipCredentialsController } from './telephony-sip-credentials.controller';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * audit/P0-B regression tests.
 *
 * GET /v1/telephony/sip-credentials is the canonical softphone credential
 * fetch. Covers:
 *   1. Happy path — operator with active extension gets credentials
 *   2. No-extension — returns 404 cleanly
 *   3. Inactive extension — returns 404 (won't leak creds for disabled lines)
 *   4. Response shape — includes sipPassword, sipServer, displayName, etc.
 *
 * Guard behaviour (403 when missing softphone.handshake) is exercised by
 * the PositionPermissionGuard tests and not repeated here.
 */
describe('TelephonySipCredentialsController (audit/P0-B)', () => {
  let controller: TelephonySipCredentialsController;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      telephonyExtension: {
        findUnique: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TelephonySipCredentialsController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    controller = moduleRef.get(TelephonySipCredentialsController);
  });

  const baseReq = {
    user: { id: 'user-1' },
    ip: '10.0.0.1',
    headers: { 'user-agent': 'crm-phone/1.0' },
  } as any;

  it('returns full SIP credentials for active extension', async () => {
    prisma.telephonyExtension.findUnique.mockResolvedValue({
      extension: '101',
      displayName: 'Operator 101',
      sipServer: '5.10.34.153',
      sipPassword: 'super-secret-sip-pw',
      isActive: true,
    });

    const result = await controller.getCredentials(baseReq);

    expect(result).toEqual({
      extension: '101',
      sipUsername: '101',
      sipPassword: 'super-secret-sip-pw',
      sipServer: '5.10.34.153',
      displayName: 'Operator 101',
    });
  });

  it('throws NotFoundException when user has no extension', async () => {
    prisma.telephonyExtension.findUnique.mockResolvedValue(null);

    await expect(controller.getCredentials(baseReq)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when extension is inactive', async () => {
    prisma.telephonyExtension.findUnique.mockResolvedValue({
      extension: '101',
      displayName: 'Operator 101',
      sipServer: '5.10.34.153',
      sipPassword: 'super-secret-sip-pw',
      isActive: false,
    });

    await expect(controller.getCredentials(baseReq)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('scopes lookup by req.user.id (cannot fetch other users)', async () => {
    prisma.telephonyExtension.findUnique.mockResolvedValue({
      extension: '101',
      displayName: 'Operator 101',
      sipServer: '5.10.34.153',
      sipPassword: 'super-secret-sip-pw',
      isActive: true,
    });

    await controller.getCredentials(baseReq);

    const call = prisma.telephonyExtension.findUnique.mock.calls[0][0];
    expect(call.where).toEqual({ crmUserId: 'user-1' });
  });

  it('handles missing req.ip and req.headers without crashing', async () => {
    prisma.telephonyExtension.findUnique.mockResolvedValue({
      extension: '101',
      displayName: 'Op',
      sipServer: '5.10.34.153',
      sipPassword: 'pw',
      isActive: true,
    });

    const bareReq: any = { user: { id: 'user-1' }, socket: {} };
    const result = await controller.getCredentials(bareReq);

    expect(result.sipPassword).toBe('pw');
  });
});
