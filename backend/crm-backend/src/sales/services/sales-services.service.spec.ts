import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { SalesServicesService } from "./sales-services.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("SalesServicesService", () => {
  let service: SalesServicesService;
  let prisma: {
    salesService: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      salesService: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesServicesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SalesServicesService);
  });

  describe("createService", () => {
    it("should throw ConflictException when code exists", async () => {
      prisma.salesService.findUnique.mockResolvedValue({ id: "x" });
      await expect(
        service.createService({ code: "C", name: "N", categoryId: "cat" } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("findServiceById", () => {
    it("should throw NotFoundException when id missing", async () => {
      prisma.salesService.findUnique.mockResolvedValue(null);
      await expect(service.findServiceById("bad")).rejects.toThrow(NotFoundException);
    });
  });
});
