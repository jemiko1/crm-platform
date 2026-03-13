import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyGateway } from '../realtime/telephony.gateway';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';
import { AmiClientService } from '../ami/ami-client.service';
import { TelephonyCallsService } from '../services/telephony-calls.service';
import { JwtService } from '@nestjs/jwt';

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
      ],
    }).compile();

    gateway = module.get<TelephonyGateway>(TelephonyGateway);
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  it('should authenticate client via Bearer token', () => {
    mockJwt.verify.mockReturnValue({ id: 'user-1', email: 'a@b.com' });
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
  });

  it('should disconnect unauthenticated client', () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid');
    });
    const mockClient = {
      handshake: { headers: {} },
      disconnect: jest.fn(),
      id: 'socket-2',
    } as any;

    gateway.handleConnection(mockClient);
    expect(mockClient.disconnect).toHaveBeenCalled();
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
});
