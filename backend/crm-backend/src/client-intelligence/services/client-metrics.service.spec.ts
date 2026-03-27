import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ClientMetricsService } from "./client-metrics.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PhoneResolverService } from "../../common/phone-resolver/phone-resolver.service";

describe("ClientMetricsService", () => {
  let service: ClientMetricsService;
  let prisma: {
    client: { findUnique: jest.Mock };
    callSession: { findMany: jest.Mock };
    clientChatConversation: { findMany: jest.Mock };
    incident: { findMany: jest.Mock };
  };
  let phoneResolver: { localDigits: jest.Mock; buildCallSessionFilter: jest.Mock };

  beforeEach(async () => {
    prisma = {
      client: { findUnique: jest.fn() },
      callSession: { findMany: jest.fn().mockResolvedValue([]) },
      clientChatConversation: { findMany: jest.fn().mockResolvedValue([]) },
      incident: { findMany: jest.fn().mockResolvedValue([]) },
    };
    phoneResolver = {
      localDigits: jest.fn((p: string) => p.replace(/\D/g, "").slice(-9)),
      buildCallSessionFilter: jest.fn().mockReturnValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientMetricsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PhoneResolverService, useValue: phoneResolver },
      ],
    }).compile();
    service = module.get(ClientMetricsService);
  });

  describe("computeMetrics", () => {
    it("should throw NotFoundException when client coreId does not exist", async () => {
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(service.computeMetrics(999)).rejects.toThrow(NotFoundException);
    });

    it("should return metrics when client exists", async () => {
      prisma.client.findUnique.mockResolvedValue({
        id: "c1",
        coreId: 5,
        primaryPhone: null,
        secondaryPhone: null,
      });
      const res = await service.computeMetrics(5, 30);
      expect(res.clientCoreId).toBe(5);
      expect(res.periodDays).toBe(30);
    });
  });
});
