import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TelephonyGateway } from '../realtime/telephony.gateway';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyCallsService } from '../services/telephony-calls.service';
import { AgentPresenceService } from '../services/agent-presence.service';
import { OperatorBreakService } from '../services/operator-break.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelephonyGateway', () => {
  let gateway: TelephonyGateway;
  let mockJwt: Record<string, any>;
  let mockStateManager: Record<string, any>;

  beforeEach(async () => {
    mockJwt = { verify: jest.fn() };
    mockStateManager = {
      getActiveCalls: jest.fn().mockReturnValue([]),
      getAgentStates: jest.fn().mockReturnValue([]),
      getQueueSnapshots: jest.fn().mockReturnValue([]),
      getActiveCall: jest.fn().mockReturnValue(undefined),
    };
    const mockAmi = { on: jest.fn(), emit: jest.fn() };
    const mockCalls = {
      lookupPhone: jest.fn().mockResolvedValue({}),
    };

    const mockPresence = { onStaleFlipped: undefined };
    // OperatorBreakService hooks are set by gateway.onModuleInit (not
    // exercised here since we test it post-bootstrap). Mutable object
    // so the gateway can write the callback back onto it.
    const mockBreak: {
      onBreakStarted?: unknown;
      onBreakEnded?: unknown;
    } = { onBreakStarted: undefined, onBreakEnded: undefined };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyGateway,
        { provide: JwtService, useValue: mockJwt },
        { provide: TelephonyStateManager, useValue: mockStateManager },
        { provide: AmiClientService, useValue: mockAmi },
        { provide: TelephonyCallsService, useValue: mockCalls },
        { provide: PrismaService, useValue: { telephonyExtension: { findFirst: jest.fn() }, callSession: { findUnique: jest.fn() }, client: { findFirst: jest.fn() } } },
        { provide: AgentPresenceService, useValue: mockPresence },
        { provide: OperatorBreakService, useValue: mockBreak },
      ],
    }).compile();

    gateway = module.get<TelephonyGateway>(TelephonyGateway);
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  it('should authenticate client via Bearer token using JWT sub claim', () => {
    // AuthService signs { sub, email, role } — gateway must read `sub`, not `id`.
    mockJwt.verify.mockReturnValue({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'USER',
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer token123' } },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      id: 'socket-1',
    } as any;

    gateway.handleConnection(mockClient);
    expect(mockJwt.verify).toHaveBeenCalledWith('token123');
    expect(mockClient.userId).toBe('user-1');
    expect(mockClient.disconnect).not.toHaveBeenCalled();
  });

  it('authenticateSocket should map JWT sub claim to user.id (regression for P0-E)', () => {
    mockJwt.verify.mockReturnValue({
      sub: 'user-42',
      email: 'agent@crm.com',
      role: 'AGENT',
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer signed-token' } },
    } as any;

    const user = (gateway as any).authenticateSocket(mockClient);
    expect(user).toEqual({
      id: 'user-42',
      email: 'agent@crm.com',
      role: 'AGENT',
    });
  });

  it('authenticateSocket should return null for a payload that lacks sub', () => {
    // Legacy shape { id } must NOT be accepted — AuthService never issues it.
    mockJwt.verify.mockReturnValue({ id: 'user-1', email: 'a@b.com' });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer legacy-token' } },
    } as any;

    const user = (gateway as any).authenticateSocket(mockClient);
    expect(user).toBeNull();
  });

  it('should disconnect when token is malformed (verify throws)', () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid');
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer bad' } },
      disconnect: jest.fn(),
      id: 'socket-2',
    } as any;

    gateway.handleConnection(mockClient);
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('should disconnect when no token is present (null token)', () => {
    const mockClient = {
      handshake: { headers: {} },
      disconnect: jest.fn(),
      id: 'socket-3',
    } as any;

    gateway.handleConnection(mockClient);
    expect(mockClient.disconnect).toHaveBeenCalled();
    expect(mockJwt.verify).not.toHaveBeenCalled();
  });

  it('should authenticate via cookie when present', () => {
    mockJwt.verify.mockReturnValue({
      sub: 'user-9',
      email: 'cookie@crm.com',
      role: 'USER',
    });
    const mockClient = {
      handshake: {
        headers: { cookie: 'access_token=cookie-jwt' },
      },
      join: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      id: 'socket-4',
    } as any;

    gateway.handleConnection(mockClient);
    expect(mockJwt.verify).toHaveBeenCalledWith('cookie-jwt');
    expect(mockClient.userId).toBe('user-9');
    expect(mockClient.disconnect).not.toHaveBeenCalled();
  });

  it('should handle queue subscribe', () => {
    const mockClient = { join: jest.fn() } as any;
    const result = gateway.handleQueueSubscribe(mockClient, {
      queueId: 'q1',
    });
    expect(mockClient.join).toHaveBeenCalledWith('queue:q1');
    expect(result).toEqual({ subscribed: 'q1' });
  });

  it('should handle queue unsubscribe', () => {
    const mockClient = { leave: jest.fn() } as any;
    const result = gateway.handleQueueUnsubscribe(mockClient, {
      queueId: 'q1',
    });
    expect(mockClient.leave).toHaveBeenCalledWith('queue:q1');
    expect(result).toEqual({ unsubscribed: 'q1' });
  });

  it('should handle disconnect cleanly', () => {
    const mockClient = { userId: 'user-1', id: 'socket-1' } as any;
    expect(() => gateway.handleDisconnect(mockClient)).not.toThrow();
  });

  describe('JWT contract integration with JwtService', () => {
    it('should authenticate a real JWT issued with { sub, email, role }', async () => {
      // Use the real JwtService to sign + verify a token, proving the gateway
      // correctly consumes AuthService's exact payload shape.
      const jwtService = new JwtService({ secret: 'test-secret' });
      const token = await jwtService.signAsync({
        sub: 'user-1',
        email: 'x@y',
        role: 'USER',
      });

      const realModule: TestingModule = await Test.createTestingModule({
        providers: [
          TelephonyGateway,
          { provide: JwtService, useValue: jwtService },
          { provide: TelephonyStateManager, useValue: mockStateManager },
          { provide: AmiClientService, useValue: { on: jest.fn(), emit: jest.fn() } },
          { provide: TelephonyCallsService, useValue: { lookupPhone: jest.fn() } },
          { provide: PrismaService, useValue: { telephonyExtension: { findFirst: jest.fn() }, callSession: { findUnique: jest.fn() }, client: { findFirst: jest.fn() } } },
          { provide: AgentPresenceService, useValue: { onStaleFlipped: undefined } },
          { provide: OperatorBreakService, useValue: { onBreakStarted: undefined, onBreakEnded: undefined } },
        ],
      }).compile();
      const realGateway = realModule.get<TelephonyGateway>(TelephonyGateway);
      (realGateway as any).server = {
        to: jest.fn().mockReturnThis(),
        emit: jest.fn(),
      };

      const mockClient = {
        handshake: { headers: { authorization: `Bearer ${token}` } },
      } as any;
      const user = (realGateway as any).authenticateSocket(mockClient);
      expect(user).not.toBeNull();
      expect(user.id).toBe('user-1');
      expect(user.email).toBe('x@y');
      expect(user.role).toBe('USER');
    });
  });

  // ---------------------------------------------------------------------
  // P1-9 regression tests: diff-then-emit queue:updated + throttle agent:status
  // ---------------------------------------------------------------------

  describe('P1-9 queue:updated diffing', () => {
    /** Captures every emit('queue:updated', ...) that reaches `dashboard`. */
    function wireEmitCapture(g: TelephonyGateway): jest.Mock {
      const emit = jest.fn();
      const to = jest.fn((room: string) => ({
        emit: (event: string, payload: any) => {
          if (room === 'dashboard' && event === 'queue:updated') emit(payload);
          return undefined;
        },
      }));
      (g as any).server = { to };
      return emit;
    }

    it('emits only once when the same snapshot is observed twice', () => {
      const snapshot = {
        queueId: 'q1',
        queueName: 'Support',
        activeCalls: 1,
        waitingCallers: 0,
        longestWaitSec: null,
        availableAgents: 2,
      };
      mockStateManager.getQueueSnapshots.mockReturnValue([snapshot]);
      const emit = wireEmitCapture(gateway);

      (gateway as any).emitQueueUpdated();
      (gateway as any).emitQueueUpdated();

      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('emits again when the snapshot fields change', () => {
      const first = {
        queueId: 'q1',
        queueName: 'Support',
        activeCalls: 1,
        waitingCallers: 0,
        longestWaitSec: null,
        availableAgents: 2,
      };
      const second = { ...first, activeCalls: 2 };
      const emit = wireEmitCapture(gateway);

      mockStateManager.getQueueSnapshots.mockReturnValueOnce([first]);
      (gateway as any).emitQueueUpdated();
      mockStateManager.getQueueSnapshots.mockReturnValueOnce([second]);
      (gateway as any).emitQueueUpdated();

      expect(emit).toHaveBeenCalledTimes(2);
      expect(emit.mock.calls[1][0]).toMatchObject({ queueId: 'q1', activeCalls: 2 });
    });

    it('does not re-emit when fields the hash ignores (queueName) change', () => {
      const first = {
        queueId: 'q1',
        queueName: 'Support',
        activeCalls: 1,
        waitingCallers: 0,
        longestWaitSec: null,
        availableAgents: 2,
      };
      const second = { ...first, queueName: 'Support Tier 1' };
      const emit = wireEmitCapture(gateway);

      mockStateManager.getQueueSnapshots.mockReturnValueOnce([first]);
      (gateway as any).emitQueueUpdated();
      mockStateManager.getQueueSnapshots.mockReturnValueOnce([second]);
      (gateway as any).emitQueueUpdated();

      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('tracks per-queue snapshots independently', () => {
      const q1 = {
        queueId: 'q1',
        queueName: 'Support',
        activeCalls: 1,
        waitingCallers: 0,
        longestWaitSec: null,
        availableAgents: 2,
      };
      const q2 = { ...q1, queueId: 'q2', queueName: 'Sales' };
      const emit = wireEmitCapture(gateway);

      mockStateManager.getQueueSnapshots.mockReturnValueOnce([q1, q2]);
      (gateway as any).emitQueueUpdated();
      // q1 unchanged, q2 changes — only q2 should emit on the second pass.
      mockStateManager.getQueueSnapshots.mockReturnValueOnce([
        q1,
        { ...q2, waitingCallers: 3 },
      ]);
      (gateway as any).emitQueueUpdated();

      expect(emit).toHaveBeenCalledTimes(3);
      expect(emit.mock.calls[2][0]).toMatchObject({ queueId: 'q2', waitingCallers: 3 });
    });
  });

  describe('P1-9 agent:status throttling', () => {
    /** Captures every emit('agent:status', ...) that reaches `dashboard`. */
    function wireAgentEmitCapture(g: TelephonyGateway): jest.Mock {
      const emit = jest.fn();
      const to = jest.fn((room: string) => ({
        emit: (event: string, payload: any) => {
          if (room === 'dashboard' && event === 'agent:status') {
            emit({ ...payload });
          }
          return undefined;
        },
      }));
      (g as any).server = { to };
      return emit;
    }

    function makeAgentState(userId: string, presence: string): any {
      return {
        userId,
        displayName: null,
        extension: null,
        presence,
        currentLinkedId: null,
        callStartedAt: null,
        callsHandledToday: 0,
        pausedReason: null,
      };
    }

    it('coalesces 20 burst emits for one user to at most 2 emissions with the final state', () => {
      jest.useFakeTimers();
      try {
        const emit = wireAgentEmitCapture(gateway);
        const states = Array.from({ length: 20 }, (_, i) =>
          makeAgentState('user-1', i === 19 ? 'ON_CALL' : 'IDLE'),
        );

        // Burst: all 20 fire within the same tick (< 100 ms < throttle window).
        for (const s of states) {
          (gateway as any).emitAgentStatus('user-1', s);
        }

        // Between 1 and 2 emissions so far (one leading, others queued as trailing).
        expect(emit.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(emit.mock.calls.length).toBeLessThanOrEqual(2);

        // Advance past the throttle window so the trailing emit fires.
        jest.advanceTimersByTime(1500);

        expect(emit.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(emit.mock.calls.length).toBeLessThanOrEqual(2);
        // Final delivered state must reflect the last observed state (ON_CALL).
        expect(emit.mock.calls[emit.mock.calls.length - 1][0]).toMatchObject({
          userId: 'user-1',
          presence: 'ON_CALL',
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('emits for all 10 distinct users within the same burst window', () => {
      jest.useFakeTimers();
      try {
        const emit = wireAgentEmitCapture(gateway);
        for (let i = 0; i < 10; i++) {
          (gateway as any).emitAgentStatus(
            `user-${i}`,
            makeAgentState(`user-${i}`, 'IDLE'),
          );
        }
        expect(emit).toHaveBeenCalledTimes(10);
      } finally {
        jest.useRealTimers();
      }
    });

    it('fires a trailing emit after the throttle window with the latest state', () => {
      jest.useFakeTimers();
      try {
        const emit = wireAgentEmitCapture(gateway);

        // Leading emit goes through immediately.
        (gateway as any).emitAgentStatus('user-1', makeAgentState('user-1', 'IDLE'));
        expect(emit).toHaveBeenCalledTimes(1);

        // Second + third emit arrive inside the throttle window.
        jest.advanceTimersByTime(200);
        (gateway as any).emitAgentStatus('user-1', makeAgentState('user-1', 'RINGING'));
        jest.advanceTimersByTime(200);
        (gateway as any).emitAgentStatus('user-1', makeAgentState('user-1', 'ON_CALL'));

        // Still only the leading emit delivered.
        expect(emit).toHaveBeenCalledTimes(1);

        // Advance past the throttle window: trailing emit fires with latest state.
        jest.advanceTimersByTime(1000);
        expect(emit).toHaveBeenCalledTimes(2);
        expect(emit.mock.calls[1][0]).toMatchObject({ userId: 'user-1', presence: 'ON_CALL' });
      } finally {
        jest.useRealTimers();
      }
    });

    it('disconnecting the last socket clears the pending throttled timer', () => {
      jest.useFakeTimers();
      try {
        const emit = wireAgentEmitCapture(gateway);

        // Prime: connect a socket so connectedUsers has user-1.
        (gateway as any).connectedUsers.set('user-1', new Set(['socket-1']));

        // Leading emit.
        (gateway as any).emitAgentStatus('user-1', makeAgentState('user-1', 'IDLE'));
        // Schedule a trailing emit.
        (gateway as any).emitAgentStatus('user-1', makeAgentState('user-1', 'RINGING'));
        expect((gateway as any).pendingAgentEmit.has('user-1')).toBe(true);

        gateway.handleDisconnect({ userId: 'user-1', id: 'socket-1' } as any);

        expect((gateway as any).pendingAgentEmit.has('user-1')).toBe(false);
        expect((gateway as any).pendingAgentState.has('user-1')).toBe(false);
        expect((gateway as any).lastAgentEmitAt.has('user-1')).toBe(false);

        // No trailing emit should fire now.
        jest.advanceTimersByTime(2000);
        expect(emit).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
