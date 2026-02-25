import { Test, TestingModule } from '@nestjs/testing';
import { ClientChatsMatchingService } from '../services/clientchats-matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PhoneResolverService } from '../../common/phone-resolver/phone-resolver.service';

describe('ClientChatsMatchingService', () => {
  let service: ClientChatsMatchingService;
  let prisma: Record<string, any>;
  let phoneResolver: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      client: {
        findFirst: jest.fn(),
      },
      clientChatParticipant: {
        update: jest.fn().mockResolvedValue({}),
      },
      clientChatConversation: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
    };

    phoneResolver = {
      resolveClient: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsMatchingService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhoneResolverService, useValue: phoneResolver },
      ],
    }).compile();

    service = module.get(ClientChatsMatchingService);
  });

  describe('autoMatch', () => {
    const participant = {
      id: 'part-1',
      phone: '+995555123456',
      email: null,
      mappedClientId: null,
    } as any;

    const conversation = {
      id: 'conv-1',
      clientId: null,
    } as any;

    it('should match by phone and update both participant and conversation', async () => {
      phoneResolver.resolveClient.mockResolvedValue({
        id: 'client-1',
        primaryPhone: '+995555123456',
      });

      await service.autoMatch(participant, conversation);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.clientChatParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mappedClientId: 'client-1' },
        }),
      );
      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { clientId: 'client-1' },
        }),
      );
    });

    it('should skip if participant already has mappedClientId', async () => {
      await service.autoMatch(
        { ...participant, mappedClientId: 'already' },
        conversation,
      );

      expect(phoneResolver.resolveClient).not.toHaveBeenCalled();
    });

    it('should skip if conversation already has clientId', async () => {
      await service.autoMatch(participant, {
        ...conversation,
        clientId: 'already',
      });

      expect(phoneResolver.resolveClient).not.toHaveBeenCalled();
    });

    it('should do nothing if no client found by phone', async () => {
      phoneResolver.resolveClient.mockResolvedValue(null);

      await service.autoMatch(participant, conversation);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should do nothing if participant has no phone or email', async () => {
      await service.autoMatch(
        { ...participant, phone: null } as any,
        conversation,
      );

      expect(phoneResolver.resolveClient).not.toHaveBeenCalled();
    });
  });

  describe('findClientByContact', () => {
    it('should return client matched by phone via PhoneResolverService', async () => {
      phoneResolver.resolveClient.mockResolvedValue({ id: 'client-1' });

      const result = await service.findClientByContact('+995555123456');

      expect(result).toEqual({ id: 'client-1' });
      expect(phoneResolver.resolveClient).toHaveBeenCalledWith('+995555123456');
    });

    it('should return null when no phone or email provided', async () => {
      const result = await service.findClientByContact(null, null);
      expect(result).toBeNull();
    });
  });
});
