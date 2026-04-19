import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TelephonyPresenceController } from './telephony-presence.controller';
import { AgentPresenceService } from '../services/agent-presence.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';

/**
 * These tests cover only the controller wiring. Guard-level tests (JWT auth
 * + PositionPermissionGuard/softphone.handshake) live in the guard specs /
 * e2e tests; the controller spec asserts that (a) the service gets called
 * with the request user's id and body values, and (b) service errors
 * propagate out as the expected HTTP shape (NotFoundException for 404, DTO
 * validation rejects invalid bodies at framework level).
 */
describe('TelephonyPresenceController', () => {
  let controller: TelephonyPresenceController;
  let presenceService: { reportState: jest.Mock };

  beforeEach(async () => {
    presenceService = { reportState: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TelephonyPresenceController],
      providers: [
        { provide: AgentPresenceService, useValue: presenceService },
      ],
    })
      // Guards are integration-tested elsewhere; at the unit level we only
      // exercise the controller glue. Overriding them avoids pulling
      // PrismaService + JwtService + Reflector into this unit test.
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PositionPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(TelephonyPresenceController);
  });

  it('passes through the request user id and body to the service', async () => {
    const lastSeen = new Date('2026-04-19T10:00:00.000Z');
    presenceService.reportState.mockResolvedValue({
      sipRegistered: true,
      sipLastSeenAt: lastSeen,
      extension: '1001',
      stateChanged: true,
    });

    const result = await controller.reportPresence(
      { user: { id: 'user-1' } },
      {
        state: 'registered',
        extension: '1001',
        ts: '2026-04-19T09:59:30.000Z',
      },
    );

    expect(presenceService.reportState).toHaveBeenCalledWith(
      'user-1',
      'registered',
      '1001',
    );
    expect(result).toEqual({
      ok: true,
      sipRegistered: true,
      sipLastSeenAt: lastSeen.toISOString(),
      extension: '1001',
      stateChanged: true,
    });
  });

  it('propagates NotFoundException when the user has no extension', async () => {
    presenceService.reportState.mockRejectedValue(
      new NotFoundException('No telephony extension linked to your account'),
    );
    await expect(
      controller.reportPresence(
        { user: { id: 'user-1' } },
        {
          state: 'registered',
          extension: '1001',
          ts: '2026-04-19T09:59:30.000Z',
        },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('passes through unregistered state', async () => {
    const lastSeen = new Date();
    presenceService.reportState.mockResolvedValue({
      sipRegistered: false,
      sipLastSeenAt: lastSeen,
      extension: '1001',
      stateChanged: true,
    });

    const result = await controller.reportPresence(
      { user: { id: 'user-1' } },
      {
        state: 'unregistered',
        extension: '1001',
        ts: '2026-04-19T09:59:30.000Z',
      },
    );

    expect(presenceService.reportState).toHaveBeenCalledWith(
      'user-1',
      'unregistered',
      '1001',
    );
    expect(result.sipRegistered).toBe(false);
  });
});
