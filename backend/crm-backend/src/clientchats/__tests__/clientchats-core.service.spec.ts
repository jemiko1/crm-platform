import { Test, TestingModule } from '@nestjs/testing';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { ClientChatsMatchingService } from '../services/clientchats-matching.service';
import { ClientChatsEventService } from '../services/clientchats-event.service';
import { AdapterRegistryService } from '../adapters/adapter-registry.service';
import { AssignmentService } from '../services/assignment.service';
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
        findFirst: jest.fn().mockResolvedValue(null),
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
      // upsertConversation now wraps its findUnique+update+create flow in a
      // Serializable transaction (P1-5 archival race fix). Run the callback
      // against the same prisma mock so existing assertions on create/update
      // call counts still work.
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === 'function') return arg(prisma);
        return arg;
      }),
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

    const events = {
      emitConversationNew: jest.fn(),
      emitConversationUpdated: jest.fn(),
      emitNewMessage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsCoreService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdapterRegistryService, useValue: adapterRegistry },
        { provide: ClientChatsMatchingService, useValue: matching },
        { provide: ClientChatsEventService, useValue: events },
        { provide: AssignmentService, useValue: { autoAssign: jest.fn().mockResolvedValue(null) } },
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
    it('should send through adapter and save outbound message with deliveryStatus=SENT', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        channelType: ClientChatChannelType.WEB,
        externalConversationId: 'web_visitor1',
        channelAccount: { id: 'acc-1', metadata: {}, status: 'ACTIVE' },
      });

      const result = await service.sendReply('conv-1', 'user-1', 'Reply text');

      expect(adapterRegistry.getOrThrow).toHaveBeenCalledWith(ClientChatChannelType.WEB);
      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: ClientChatDirection.OUT,
            senderUserId: 'user-1',
            text: 'Reply text',
            deliveryStatus: 'SENT',
            deliveryError: null,
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

    // ── Regression for P1-6: WhatsApp 24h window + adapter failure surfacing ──

    it('WhatsApp: rejects with FAILED_OUT_OF_WINDOW when last inbound > 24h ago', async () => {
      // Conversation is WhatsApp; the last IN message is 25 hours old. We must
      // NOT call adapter.sendMessage (the Cloud API would 400) and we MUST
      // persist the attempt so the operator sees a failed bubble.
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-wa-1',
        channelType: ClientChatChannelType.WHATSAPP,
        externalConversationId: 'wa_995555123456',
        channelAccount: { id: 'acc-wa', metadata: {}, status: 'ACTIVE' },
        assignedUserId: 'user-1',
      });
      const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.clientChatMessage.findFirst = jest.fn().mockResolvedValue({
        id: 'last-in',
        direction: 'IN',
        sentAt: twentyFiveHoursAgo,
      });
      const adapterSpy = jest.fn();
      adapterRegistry.getOrThrow.mockReturnValue({
        channelType: ClientChatChannelType.WHATSAPP,
        sendMessage: adapterSpy,
      });

      const result = await service.sendReply('conv-wa-1', 'user-1', 'Hi late');

      expect(adapterSpy).not.toHaveBeenCalled();
      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            direction: ClientChatDirection.OUT,
            deliveryStatus: 'FAILED_OUT_OF_WINDOW',
            deliveryError: expect.stringContaining('24-hour window'),
          }),
        }),
      );
      expect(result.sendResult.success).toBe(false);
      expect(result.sendResult.error).toContain('24-hour window');
    });

    it('WhatsApp: within 24h window, adapter throws → persists FAILED + error', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-wa-2',
        channelType: ClientChatChannelType.WHATSAPP,
        externalConversationId: 'wa_995555123457',
        channelAccount: { id: 'acc-wa', metadata: {}, status: 'ACTIVE' },
        assignedUserId: 'user-1',
      });
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      prisma.clientChatMessage.findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'last-in', direction: 'IN', sentAt: oneHourAgo });
      const adapterErr = new Error('ECONNRESET');
      adapterRegistry.getOrThrow.mockReturnValue({
        channelType: ClientChatChannelType.WHATSAPP,
        sendMessage: jest.fn().mockRejectedValue(adapterErr),
      });

      const result = await service.sendReply('conv-wa-2', 'user-1', 'Hello');

      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: 'FAILED',
            deliveryError: 'ECONNRESET',
          }),
        }),
      );
      // Conversation timestamps must NOT be bumped on failure (would skew SLA).
      expect(prisma.clientChatConversation.update).not.toHaveBeenCalled();
      expect(result.sendResult.success).toBe(false);
    });

    it('WhatsApp: within 24h window, adapter returns success → persists SENT', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-wa-3',
        channelType: ClientChatChannelType.WHATSAPP,
        externalConversationId: 'wa_995555123458',
        channelAccount: { id: 'acc-wa', metadata: {}, status: 'ACTIVE' },
        assignedUserId: 'user-1',
        firstResponseAt: null,
      });
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      prisma.clientChatMessage.findFirst = jest.fn().mockResolvedValue({
        id: 'last-in',
        direction: 'IN',
        sentAt: fiveMinutesAgo,
      });
      adapterRegistry.getOrThrow.mockReturnValue({
        channelType: ClientChatChannelType.WHATSAPP,
        sendMessage: jest.fn().mockResolvedValue({
          externalMessageId: 'wamid.ABC',
          success: true,
        }),
      });

      const result = await service.sendReply('conv-wa-3', 'user-1', 'Hello');

      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalMessageId: 'wamid.ABC',
            deliveryStatus: 'SENT',
            deliveryError: null,
          }),
        }),
      );
      expect(result.sendResult.success).toBe(true);
      // Successful send bumps lastMessageAt + firstResponseAt.
      expect(prisma.clientChatConversation.update).toHaveBeenCalled();
    });

    it('Telegram: no 24h window — adapter is always called regardless of last inbound', async () => {
      // Telegram has no session-window constraint; the 24h gate only applies
      // to WHATSAPP. Even if the last inbound is ancient, we still call the
      // adapter so the operator can reply.
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-tg-1',
        channelType: ClientChatChannelType.TELEGRAM,
        externalConversationId: 'tg_123',
        channelAccount: { id: 'acc-tg', metadata: {}, status: 'ACTIVE' },
        assignedUserId: 'user-1',
      });
      const adapterSpy = jest.fn().mockResolvedValue({
        externalMessageId: 'tg-out-1',
        success: true,
      });
      adapterRegistry.getOrThrow.mockReturnValue({
        channelType: ClientChatChannelType.TELEGRAM,
        sendMessage: adapterSpy,
      });

      await service.sendReply('conv-tg-1', 'user-1', 'Hello telegram');

      expect(adapterSpy).toHaveBeenCalledTimes(1);
      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: 'SENT',
          }),
        }),
      );
    });

    it('non-WhatsApp channel: adapter returns success:false → persists FAILED with error', async () => {
      // Facebook/Viber/Telegram can still fail (network, permission, token
      // expired, etc.). sendReply must surface that to the UI.
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: 'conv-fb-1',
        channelType: ClientChatChannelType.FACEBOOK,
        externalConversationId: 'fb_999',
        channelAccount: { id: 'acc-fb', metadata: {}, status: 'ACTIVE' },
        assignedUserId: 'user-1',
      });
      adapterRegistry.getOrThrow.mockReturnValue({
        channelType: ClientChatChannelType.FACEBOOK,
        sendMessage: jest.fn().mockResolvedValue({
          externalMessageId: '',
          success: false,
          error: 'Page access token expired',
        }),
      });

      const result = await service.sendReply('conv-fb-1', 'user-1', 'Ping');

      expect(prisma.clientChatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deliveryStatus: 'FAILED',
            deliveryError: 'Page access token expired',
          }),
        }),
      );
      expect(result.sendResult.success).toBe(false);
    });
  });

  describe('assignConversation', () => {
    it('should update assignedUserId', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({ id: 'conv-1' });

      await service.assignConversation('conv-1', 'user-2');

      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'conv-1' },
          data: { assignedUserId: 'user-2', lastOperatorActivityAt: null },
        }),
      );
    });
  });

  describe('changeStatus', () => {
    it('should update status', async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({ id: 'conv-1', status: 'LIVE' });

      await service.changeStatus('conv-1', 'CLOSED' as any);

      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CLOSED', resolvedAt: expect.any(Date), pausedOperatorId: null, pausedAt: null }),
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
