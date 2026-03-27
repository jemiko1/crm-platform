import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AssignmentService } from "./assignment.service";
import { PrismaService } from "../../prisma/prisma.service";
import { QueueScheduleService } from "./queue-schedule.service";
import { ClientChatsEventService } from "./clientchats-event.service";

describe("AssignmentService", () => {
  let service: AssignmentService;
  let prisma: { clientChatConversation: { findUnique: jest.Mock } };
  let queueSchedule: { getActiveOperatorsToday: jest.Mock };
  let events: { emitConversationUpdated: jest.Mock };

  beforeEach(async () => {
    prisma = { clientChatConversation: { findUnique: jest.fn() } };
    queueSchedule = { getActiveOperatorsToday: jest.fn().mockResolvedValue([]) };
    events = { emitConversationUpdated: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssignmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueScheduleService, useValue: queueSchedule },
        { provide: ClientChatsEventService, useValue: events },
      ],
    }).compile();
    service = module.get(AssignmentService);
  });

  describe("joinConversation", () => {
    it("should throw NotFoundException when conversation does not exist", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);
      await expect(service.joinConversation("c-bad", "u1")).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe("getActiveOperatorsToday", () => {
    it("should delegate to queue schedule", async () => {
      queueSchedule.getActiveOperatorsToday.mockResolvedValue(["a", "b"]);
      await expect(service.getActiveOperatorsToday()).resolves.toEqual(["a", "b"]);
    });
  });
});
