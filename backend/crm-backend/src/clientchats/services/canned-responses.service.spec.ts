import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { CannedResponsesService } from "./canned-responses.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("CannedResponsesService", () => {
  let service: CannedResponsesService;
  let prisma: {
    clientChatCannedResponse: { findMany: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clientChatCannedResponse: { findMany: jest.fn(), findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [CannedResponsesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(CannedResponsesService);
  });

  describe("findAll", () => {
    it("should return list for user", async () => {
      prisma.clientChatCannedResponse.findMany.mockResolvedValue([]);
      await expect(service.findAll("u1", {})).resolves.toEqual([]);
    });
  });

  describe("update", () => {
    it("should throw NotFoundException when id does not exist", async () => {
      prisma.clientChatCannedResponse.findUnique.mockResolvedValue(null);
      await expect(service.update("bad", "u1", false, { title: "x" })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
