import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { SalesPlanType } from "@prisma/client";
import { SalesPlansService } from "./sales-plans.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("SalesPlansService", () => {
  let service: SalesPlansService;
  let prisma: { salesPlan: { findFirst: jest.Mock; create: jest.Mock }; $transaction: jest.Mock };

  beforeEach(async () => {
    prisma = {
      salesPlan: { findFirst: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesPlansService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SalesPlansService);
  });

  describe("create", () => {
    it("should throw BadRequestException when MONTHLY plan has no month", async () => {
      await expect(
        service.create(
          {
            type: SalesPlanType.MONTHLY,
            year: 2026,
            name: "P",
            employeeId: "e1",
          } as any,
          "e1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when creator is missing", async () => {
      await expect(
        service.create(
          {
            type: SalesPlanType.ANNUAL,
            year: 2026,
            name: "P",
          } as any,
          undefined,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
