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

  describe("reserveStockTx", () => {
    let tx: any;
    beforeEach(() => {
      tx = {
        inventoryProduct: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        stockTransaction: {
          create: jest.fn(),
        },
      };
    });

    it("should reserve stock when available", async () => {
      tx.inventoryProduct.findUnique.mockResolvedValue({
        id: "p1", name: "Widget", currentStock: 20, reservedStock: 5,
      });
      tx.inventoryProduct.update.mockResolvedValue({});
      tx.stockTransaction.create.mockResolvedValue({});

      await service.reserveStockTx(tx, [{ productId: "p1", quantity: 10 }], "wo1");

      expect(tx.inventoryProduct.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { reservedStock: { increment: 10 } },
      });
      expect(tx.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "RESERVATION_HOLD",
            quantity: 10,
            workOrderId: "wo1",
          }),
        }),
      );
    });

    it("should throw when insufficient available stock", async () => {
      tx.inventoryProduct.findUnique.mockResolvedValue({
        id: "p1", name: "Widget", currentStock: 10, reservedStock: 8,
      });

      await expect(
        service.reserveStockTx(tx, [{ productId: "p1", quantity: 5 }], "wo1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw when product not found", async () => {
      tx.inventoryProduct.findUnique.mockResolvedValue(null);

      await expect(
        service.reserveStockTx(tx, [{ productId: "missing", quantity: 1 }], "wo1"),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("releaseReservationTx", () => {
    let tx: any;
    beforeEach(() => {
      tx = {
        inventoryProduct: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        stockTransaction: {
          create: jest.fn(),
        },
      };
    });

    it("should release reservation and cap at current reservedStock", async () => {
      tx.inventoryProduct.findUnique.mockResolvedValue({
        id: "p1", name: "Widget", currentStock: 20, reservedStock: 3,
      });
      tx.inventoryProduct.update.mockResolvedValue({});
      tx.stockTransaction.create.mockResolvedValue({});

      await service.releaseReservationTx(tx, [{ productId: "p1", quantity: 10 }], "wo1");

      // Should cap at reservedStock (3), not release 10
      expect(tx.inventoryProduct.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { reservedStock: { decrement: 3 } },
      });
    });

    it("should skip if product was deleted", async () => {
      tx.inventoryProduct.findUnique.mockResolvedValue(null);

      await service.releaseReservationTx(tx, [{ productId: "p1", quantity: 5 }], "wo1");

      expect(tx.inventoryProduct.update).not.toHaveBeenCalled();
    });
  });

  describe("revertStockForWorkOrderTx", () => {
    let tx: any;
    beforeEach(() => {
      tx = {
        workOrderProductUsage: {
          findMany: jest.fn(),
        },
        inventoryProduct: {
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        stockTransaction: {
          create: jest.fn(),
        },
      };
    });

    it("should revert approved usages and create REVERSAL_IN transactions", async () => {
      tx.workOrderProductUsage.findMany.mockResolvedValue([
        { productId: "p1", quantity: 5, isApproved: true, product: { id: "p1", name: "W" } },
      ]);
      tx.inventoryProduct.findUnique.mockResolvedValue({ currentStock: 10 });
      tx.inventoryProduct.update.mockResolvedValue({});
      tx.stockTransaction.create.mockResolvedValue({});

      await service.revertStockForWorkOrderTx(tx, "wo1");

      expect(tx.inventoryProduct.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { currentStock: { increment: 5 } },
      });
      expect(tx.stockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: "REVERSAL_IN",
            quantity: 5,
            balanceBefore: 10,
            balanceAfter: 15,
          }),
        }),
      );
    });

    it("should do nothing if no approved usages exist", async () => {
      tx.workOrderProductUsage.findMany.mockResolvedValue([]);

      await service.revertStockForWorkOrderTx(tx, "wo1");

      expect(tx.inventoryProduct.update).not.toHaveBeenCalled();
    });
  });
});
