import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { TelephonyGateway } from '../realtime/telephony.gateway';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyCallsService } from '../services/telephony-calls.service';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyGateway,
        { provide: JwtService, useValue: mockJwt },
        { provide: TelephonyStateManager, useValue: mockStateManager },
        { provide: AmiClientService, useValue: mockAmi },
        { provide: TelephonyCallsService, useValue: mockCalls },
        { provide: PrismaService, useValue: { telephonyExtension: { findFirst: jest.fn() }, callSession: { findUnique: jest.fn() }, client: { findFirst: jest.fn() } } },
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
});
