import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { TelephonyQualityService } from "./telephony-quality.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TelephonyQualityService", () => {
  let service: TelephonyQualityService;
  let prisma: { qualityReview: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      qualityReview: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelephonyQualityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TelephonyQualityService);
  });

  describe("findOneReview", () => {
    it("should throw NotFoundException when review missing", async () => {
      prisma.qualityReview.findUnique.mockResolvedValue(null);
      await expect(service.findOneReview("bad")).rejects.toThrow(NotFoundException);
    });
  });
});
