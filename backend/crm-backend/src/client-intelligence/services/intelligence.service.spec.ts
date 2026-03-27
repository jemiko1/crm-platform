import { Test, TestingModule } from "@nestjs/testing";
import { IntelligenceService } from "./intelligence.service";
import { ClientMetricsService } from "./client-metrics.service";
import { INTELLIGENCE_PROVIDER } from "../interfaces/intelligence-provider.interface";

describe("IntelligenceService", () => {
  let service: IntelligenceService;
  let metrics: { computeMetrics: jest.Mock };
  let provider: { generateProfile: jest.Mock };

  beforeEach(async () => {
    metrics = {
      computeMetrics: jest.fn().mockResolvedValue({
        clientCoreId: 1,
        periodDays: 180,
        calls: {},
        chats: {},
        incidents: {},
      }),
    };
    provider = {
      generateProfile: jest.fn().mockReturnValue({ summary: "ok" }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntelligenceService,
        { provide: ClientMetricsService, useValue: metrics },
        { provide: INTELLIGENCE_PROVIDER, useValue: provider },
      ],
    }).compile();
    service = module.get(IntelligenceService);
  });

  describe("getProfile", () => {
    it("should return profile from provider when metrics resolve", async () => {
      const res = await service.getProfile(1, 30);
      expect(res).toEqual({ summary: "ok" });
      expect(metrics.computeMetrics).toHaveBeenCalledWith(1, 30);
      expect(provider.generateProfile).toHaveBeenCalled();
    });
  });
});
