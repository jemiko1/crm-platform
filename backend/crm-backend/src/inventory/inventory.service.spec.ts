import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { PrismaService } from "../prisma/prisma.service";

describe("InventoryService", () => {
  let service: InventoryService;
  let prisma: {
    inventoryProduct: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      inventoryProduct: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [InventoryService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(InventoryService);
  });

  describe("createProduct", () => {
    it("should create product when SKU is unique", async () => {
      prisma.inventoryProduct.findUnique.mockResolvedValue(null);
      const row = { id: "p1", sku: "SKU1", name: "N" };
      prisma.inventoryProduct.create.mockResolvedValue(row);
      const dto = {
        sku: "SKU1",
        name: "N",
        description: null,
        category: "C",
        unit: "PIECE",
        lowStockThreshold: 5,
      };
      await expect(service.createProduct(dto as any)).resolves.toEqual(row);
    });

    it("should throw BadRequestException when SKU already exists", async () => {
      prisma.inventoryProduct.findUnique.mockResolvedValue({ id: "x" });
      await expect(
        service.createProduct({ sku: "DUP", name: "n" } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("findOneProduct", () => {
    it("should throw NotFoundException when product id is missing", async () => {
      prisma.inventoryProduct.findUnique.mockResolvedValue(null);
      await expect(service.findOneProduct("missing")).rejects.toThrow(NotFoundException);
    });
  });
});
