import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyCallsService } from "./telephony-calls.service";
import { PrismaService } from "../../prisma/prisma.service";
import { PhoneResolverService } from "../../common/phone-resolver/phone-resolver.service";
import { IntelligenceService } from "../../client-intelligence/services/intelligence.service";

describe("TelephonyCallsService", () => {
  let service: TelephonyCallsService;
  let prisma: {
    callSession: { findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      callSession: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyCallsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: PhoneResolverService,
          useValue: { normalize: jest.fn(), localDigits: jest.fn(), buildCallSessionFilter: jest.fn() },
        },
        { provide: IntelligenceService, useValue: { getProfile: jest.fn() } },
      ],
    }).compile();
    service = module.get(TelephonyCallsService);
  });

  describe("findAll", () => {
    it("should return paginated empty result", async () => {
      const res = await service.findAll({
        from: new Date().toISOString(),
        to: new Date().toISOString(),
      } as any);
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
    });
  });
});
