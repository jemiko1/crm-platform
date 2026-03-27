import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ActivityTimelineService } from "./activity-timeline.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PhoneResolverService } from "../../common/phone-resolver/phone-resolver.service";

describe("ActivityTimelineService", () => {
  let service: ActivityTimelineService;
  let prisma: {
    client: { findUnique: jest.Mock };
    callSession: { findMany: jest.Mock };
    clientChatConversation: { findMany: jest.Mock };
    incident: { findMany: jest.Mock };
  };
  let phoneResolver: { buildCallSessionFilter: jest.Mock; localDigits: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findUnique: jest.fn() },
      callSession: { findMany: jest.fn().mockResolvedValue([]) },
      clientChatConversation: { findMany: jest.fn().mockResolvedValue([]) },
      incident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    phoneResolver = {
      buildCallSessionFilter: jest.fn().mockReturnValue([]),
      localDigits: jest.fn((p: string) => p.replace(/\D/g, "").slice(-9)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityTimelineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhoneResolverService, useValue: phoneResolver },
      ],
    }).compile();
    service = module.get(ActivityTimelineService);
  });

  describe("getTimeline", () => {
    it("should throw NotFoundException when client coreId does not exist", async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(service.getTimeline(999)).rejects.toThrow(NotFoundException);
    });

    it("should return entries when client exists", async () => {
      prisma.client.findUnique.mockResolvedValue({
        id: "cid",
        coreId: 1,
        primaryPhone: null,
        secondaryPhone: null,
      });
      const res = await service.getTimeline(1);
      expect(res.entries).toEqual([]);
      expect(res.total).toBe(0);
    });
  });
});
