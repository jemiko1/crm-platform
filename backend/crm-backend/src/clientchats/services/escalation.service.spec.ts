import { Test, TestingModule } from "@nestjs/testing";
import { EscalationService } from "./escalation.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ClientChatsEventService } from "./clientchats-event.service";

describe("EscalationService", () => {
  let service: EscalationService;
  let prisma: {
    clientChatEscalationConfig: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    clientChatEscalationEvent: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clientChatEscalationConfig: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      clientChatEscalationEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClientChatsEventService, useValue: {} },
      ],
    }).compile();
    service = module.get(EscalationService);
  });

  describe("getConfig", () => {
    it("should create default config when none exists", async () => {
      const cfg = { id: "ec1" };
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue(null);
      prisma.clientChatEscalationConfig.create.mockResolvedValue(cfg);
      await expect(service.getConfig()).resolves.toEqual(cfg);
    });
  });

  describe("getRecentEvents", () => {
    it("should return events from prisma", async () => {
      await expect(service.getRecentEvents(10)).resolves.toEqual([]);
    });
  });
});
