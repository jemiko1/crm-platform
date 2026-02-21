import { Test, TestingModule } from '@nestjs/testing';
import { ClientChatsMatchingService } from '../services/clientchats-matching.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ClientChatsMatchingService', () => {
  let service: ClientChatsMatchingService;
  let prisma: Record<string, any>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsMatchingService,
        { provide: PrismaService, useValue: prisma },
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
      prisma.client.findFirst.mockResolvedValue({
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

      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });

    it('should skip if conversation already has clientId', async () => {
      await service.autoMatch(participant, {
        ...conversation,
        clientId: 'already',
      });

      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });

    it('should do nothing if no client found by phone', async () => {
      prisma.client.findFirst.mockResolvedValue(null);

      await service.autoMatch(participant, conversation);

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('should do nothing if participant has no phone or email', async () => {
      await service.autoMatch(
        { ...participant, phone: null } as any,
        conversation,
      );

      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findClientByContact', () => {
    it('should return client matched by phone', async () => {
      prisma.client.findFirst.mockResolvedValue({ id: 'client-1' });

      const result = await service.findClientByContact('+995555123456');

      expect(result).toEqual({ id: 'client-1' });
      expect(prisma.client.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        }),
      );
    });

    it('should return null when no phone or email provided', async () => {
      const result = await service.findClientByContact(null, null);
      expect(result).toBeNull();
    });
  });
});
