import { Test, TestingModule } from "@nestjs/testing";
import { ClientChatsMatchingService } from "./clientchats-matching.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PhoneResolverService } from "../../common/phone-resolver/phone-resolver.service";

describe("ClientChatsMatchingService", () => {
  let service: ClientChatsMatchingService;
  let prisma: {
    client: { findFirst: jest.Mock };
    $transaction: jest.Mock;
    clientChatParticipant: { update: jest.Mock };
    clientChatConversation: { update: jest.Mock };
  };
  let phoneResolver: { normalize: jest.Mock; localDigits: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findFirst: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
      clientChatParticipant: { update: jest.fn() },
      clientChatConversation: { update: jest.fn() },
    };
    phoneResolver = {
      normalize: jest.fn((p: string) => p),
      localDigits: jest.fn((p: string) => p.replace(/\D/g, "").slice(-9)),
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

  describe("autoMatch", () => {
    it("should no-op when participant already mapped", async () => {
      const participant = { id: "p1", mappedClientId: "c1", phone: null, email: null };
      const conversation = { id: "cv1", clientId: null };
      await service.autoMatch(participant as any, conversation as any);
      expect(prisma.client.findFirst).not.toHaveBeenCalled();
    });
  });
});
