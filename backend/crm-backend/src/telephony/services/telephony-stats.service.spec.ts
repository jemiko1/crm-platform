import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyStatsService } from "./telephony-stats.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TelephonyStatsService", () => {
  let service: TelephonyStatsService;
  let prisma: {
    callSession: { findMany: jest.Mock; aggregate: jest.Mock };
    telephonyExtension: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      callSession: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _avg: {}, _count: {} }),
      },
      telephonyExtension: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelephonyStatsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TelephonyStatsService);
  });

  describe("getAgentStats", () => {
    it("should return empty list when no sessions", async () => {
      const res = await service.getAgentStats({
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      } as any);
      expect(res).toEqual([]);
    });
  });
});
