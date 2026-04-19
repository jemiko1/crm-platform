import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MessengerGateway } from './messenger.gateway';
import { MessengerService } from './messenger.service';

describe('MessengerGateway', () => {
  let gateway: MessengerGateway;
  let mockJwt: { verify: jest.Mock };
  let mockMessengerService: Record<string, jest.Mock>;
  const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;

  beforeAll(() => {
    // authenticateSocket() passes JWT_SECRET to jwtService.verify(), so the
    // env var must be set to avoid a "secret required" throw inside catch.
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    if (ORIGINAL_JWT_SECRET === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    }
  });

  beforeEach(async () => {
    mockJwt = { verify: jest.fn() };
    mockMessengerService = {
      getEmployeeIdByUserId: jest.fn().mockResolvedValue('employee-1'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessengerGateway,
        { provide: JwtService, useValue: mockJwt },
        { provide: MessengerService, useValue: mockMessengerService },
      ],
    }).compile();

    gateway = module.get<MessengerGateway>(MessengerGateway);
    (gateway as any).server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  it('authenticateSocket should map JWT sub claim to user.id (regression for P0-E)', () => {
    // AuthService signs { sub, email, role } — gateway must read `sub`, not `id`.
    mockJwt.verify.mockReturnValue({
      sub: 'user-1',
      email: 'a@b.com',
      role: 'USER',
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer signed-token' } },
    } as any;

    const user = (gateway as any).authenticateSocket(mockClient);
    expect(user).toEqual({
      id: 'user-1',
      email: 'a@b.com',
      role: 'USER',
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

  it('authenticateSocket should return null when no token is present', () => {
    const mockClient = {
      handshake: { headers: {} },
    } as any;

    const user = (gateway as any).authenticateSocket(mockClient);
    expect(user).toBeNull();
    expect(mockJwt.verify).not.toHaveBeenCalled();
  });

  it('authenticateSocket should return null when verify throws (malformed token)', () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer garbage' } },
    } as any;

    const user = (gateway as any).authenticateSocket(mockClient);
    expect(user).toBeNull();
  });

  it('authenticateSocket should read token from cookie header when present', () => {
    mockJwt.verify.mockReturnValue({
      sub: 'user-9',
      email: 'cookie@crm.com',
      role: 'USER',
    });
    const mockClient = {
      handshake: { headers: { cookie: 'access_token=cookie-jwt' } },
    } as any;

    const user = (gateway as any).authenticateSocket(mockClient);
    expect(mockJwt.verify).toHaveBeenCalledWith('cookie-jwt', {
      secret: 'test-secret',
    });
    expect(user).toEqual({
      id: 'user-9',
      email: 'cookie@crm.com',
      role: 'USER',
    });
  });

  it('handleConnection should disconnect when token is null', async () => {
    const mockClient = {
      handshake: { headers: {} },
      disconnect: jest.fn(),
      id: 'socket-1',
      join: jest.fn(),
    } as any;

    await gateway.handleConnection(mockClient);
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('handleConnection should disconnect when JWT verify throws (malformed)', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer rubbish' } },
      disconnect: jest.fn(),
      id: 'socket-2',
      join: jest.fn(),
    } as any;

    await gateway.handleConnection(mockClient);
    expect(mockClient.disconnect).toHaveBeenCalled();
  });

  it('handleConnection should set userId from payload.sub and join employee room', async () => {
    mockJwt.verify.mockReturnValue({
      sub: 'user-1',
      email: 'x@y',
      role: 'USER',
    });
    const mockClient = {
      handshake: { headers: { authorization: 'Bearer good-token' } },
      disconnect: jest.fn(),
      id: 'socket-3',
      join: jest.fn(),
    } as any;

    await gateway.handleConnection(mockClient);
    expect(mockClient.disconnect).not.toHaveBeenCalled();
    expect(mockClient.userId).toBe('user-1');
    expect(mockMessengerService.getEmployeeIdByUserId).toHaveBeenCalledWith(
      'user-1',
    );
    expect(mockClient.join).toHaveBeenCalledWith('employee:employee-1');
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
          MessengerGateway,
          { provide: JwtService, useValue: jwtService },
          { provide: MessengerService, useValue: mockMessengerService },
        ],
      }).compile();
      const realGateway =
        realModule.get<MessengerGateway>(MessengerGateway);
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
