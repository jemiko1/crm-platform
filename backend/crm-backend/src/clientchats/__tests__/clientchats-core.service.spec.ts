import { Test, TestingModule } from '@nestjs/testing';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { ClientChatsMatchingService } from '../services/clientchats-matching.service';
import { AdapterRegistryService } from '../adapters/adapter-registry.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatChannelType, ClientChatDirection } from '@prisma/client';

describe('ClientChatsCoreService', () => {
  let service: ClientChatsCoreService;
  let prisma: Record<string, any>;
  let adapterRegistry: Record<string, any>;
  let matching: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      clientChatMessage: {
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation((args) => ({
          id: 'msg-1',
          ...args.data,
        })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      clientChatConversation: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation((args) => ({
          id: 'conv-1',
          ...args.data,
        })),
        update: jest.fn().mockImplementation((args) => ({
          id: args.where.id,
          ...args.data,
        })),
      },
      clientChatParticipant: {
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation((args) => ({
          id: 'part-1',
          ...args.data,
        })),
        update: jest.fn().mockImplementation((args) => ({
          id: args.where.id,
          ...args.data,
        })),
      },
      clientChatChannelAccount: {
        findFirst: jest.fn(),
        create: jest.fn().mockImplementation((args) => ({
          id: 'acc-1',
          ...args.data,
        })),
      },
      client: { findUnique: jest.fn() },
    };

    adapterRegistry = {
      getOrThrow: jest.fn().mockReturnValue({
        channelType: ClientChatChannelType.WEB,
        sendMessage: jest.fn().mockResolvedValue({
          externalMessageId: 'ext-out-1',
          success: true,
        }),
      }),
    };

    matching = {
      autoMatch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsCoreService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdapterRegistryService, useValue: adapterRegistry },
        { provide: ClientChatsMatchingService, useValue: matching },
      ],
    }).compile();

    service = module.get(ClientChatsCoreService);
  });

  describe('processInbound', () => {
    const parsed = {
      externalConversationId: 'web_visitor1',
      externalUserId: 'visitor1',
      externalMessageId: 'ext-msg-1',
      displayName: 'John',
      phone: '+1234',
      text: 'Hello',
      rawPayload: {},
    };

    it('should create participant, conversation, and message for new inbound', async () => {
      prisma.clientChatMessage.findUnique.mockResolvedValue(null);
      prisma.clientChatParticipant.findUnique.mockResolvedValue(null);
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);

      const result = await service.processInbound(
        ClientChatChannelType.WEB,
        'acc-1',
        parsed,
      );

      expect(prisma.clientChatParticipant.create).toHaveBeenCalledTimes(1);
      expect(prisma.clientChatConversation.create).toHaveBeenCalledTimes(1);
      expect(prisma.clientChatMessage.create).toHaveBeenCalledTimes(1);
      expect(matching.autoMatch).toHaveBeenCalledTimes(1);
      expect(result.direction).toBe(ClientChatDirection.IN);
    });

    it('should ignore duplicate messages by externalMessageId', async () => {
      prisma.clientChatMessage.findUnique.mockResolvedValue({
        id: 'existing-msg',
        externalMessageId: 'ext-msg-1',
      });

      const result = await service.processInbound(
        ClientChatChannelType.WEB,
        'acc-1',
        parsed,
      );

      expect(result.id).toBe('existing-msg');
      expect(prisma.clientChatMessage.create).not.toHaveBeenCalled();
    });

    it('should update existing participant with new display name', async () => {
      prisma.clientChatMessage.findUnique.mockResolvedValue(null);
      prisma.clientChatParticipant.findUnique.mockResolvedValue({
        id: 'part-existing',
        displayName: 'Old Name',
        phone: null,
        email: null,
      });
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);

      await service.processInbound(ClientChatChannelType.WEB, 'acc-1', parsed);

      expect(prisma.clientChatParticipant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'part-existing' },
          data: expect.objectContaining({ displayName: 'John' }),
        }),
      );
    });
  });

  describe('sendReply', () => {
    it('should send through adapter and save outbound message', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        channelType: ClientChatChannelType.WEB,
        externalConversationId: 'web_visitor1',
        channelAccount: { id: 'acc-1', metadata: {} },
      });

      const result = await service.sendReply('conv-1', 'user-1', 'Reply text');

      expect(adapterRegistry.getOrThrow).toHaveBeenCalledWith(ClientChatChannelType.WEB);
      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: ClientChatDirection.OUT,
            senderUserId: 'user-1',
            text: 'Reply text',
          }),
        }),
      );
      expect(result.sendResult.success).toBe(true);
    });

    it('should throw NotFoundException for unknown conversation', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);

      await expect(service.sendReply('nope', 'user-1', 'text')).rejects.toThrow(
        'Conversation not found',
      );
    });
  });

  describe('assignConversation', () => {
    it('should update assignedUserId', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({ id: 'conv-1' });

      await service.assignConversation('conv-1', 'user-2');

      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: { assignedUserId: 'user-2' },
        }),
      );
    });
  });

  describe('changeStatus', () => {
    it('should update status', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({ id: 'conv-1' });

      await service.changeStatus('conv-1', 'CLOSED' as any);

      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'CLOSED' },
        }),
      );
    });
  });

  describe('linkClient / unlinkClient', () => {
    it('should set clientId when linking', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        clientId: null,
      });
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1' });

      await service.linkClient('conv-1', 'client-1');

      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { clientId: 'client-1' },
        }),
      );
    });

    it('should clear clientId when unlinking', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        clientId: 'client-1',
      });

      await service.unlinkClient('conv-1');

      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { clientId: null },
        }),
      );
    });
  });
});
