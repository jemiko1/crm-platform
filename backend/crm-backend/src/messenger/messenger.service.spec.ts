import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { MessengerService } from "./messenger.service";
import { PrismaService } from "../prisma/prisma.service";

describe("MessengerService", () => {
  let service: MessengerService;
  let prisma: {
    employee: { findUnique: jest.Mock };
    conversationParticipant: { findMany: jest.Mock };
    conversation: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      employee: { findUnique: jest.fn() },
      conversationParticipant: { findMany: jest.fn() },
      conversation: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MessengerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MessengerService);
  });

  describe("getEmployeeByUserId", () => {
    it("should return employee when user is linked", async () => {
      const emp = { id: "e1", firstName: "A", lastName: "B", avatar: null };
      prisma.employee.findUnique.mockResolvedValue(emp);
      await expect(service.getEmployeeByUserId("u1")).resolves.toEqual(emp);
    });

    it("should throw ForbiddenException when no employee profile exists", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.getEmployeeByUserId("u-bad")).rejects.toThrow(ForbiddenException);
    });
  });

  describe("getConversation", () => {
    it("should throw NotFoundException when conversation id does not exist", async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: "e1" });
      prisma.conversation.findUnique.mockResolvedValue(null);
      await expect(service.getConversation("u1", "conv-bad")).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
