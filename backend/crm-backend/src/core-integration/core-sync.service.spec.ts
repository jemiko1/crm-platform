import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { CoreSyncService } from "./core-sync.service";
import { PrismaService } from "../prisma/prisma.service";

describe("CoreSyncService", () => {
  let service: CoreSyncService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      building: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      client: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      asset: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      buildingContact: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      clientBuilding: {
        findMany: jest.fn().mockResolvedValue([]),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        upsert: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoreSyncService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(CoreSyncService);
  });

  describe("building.upsert", () => {
    it("should upsert building with all new fields", async () => {
      const row = { id: "b1", coreId: 5, source: "core" };
      prisma.building.upsert.mockResolvedValue(row);
      const result = await service.process("building.upsert", {
        coreId: 5,
        name: "Tower",
        phone: "599123456",
        email: "test@asg.ge",
        identificationCode: "ABC123",
        numberOfApartments: 50,
        disableCrons: false,
        branchId: 1,
      });
      expect(result).toEqual(row);
      expect(prisma.building.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 5 },
          create: expect.objectContaining({
            phone: "599123456",
            email: "test@asg.ge",
            identificationCode: "ABC123",
            numberOfApartments: 50,
            disableCrons: false,
            branchId: 1,
            source: "core",
          }),
        }),
      );
    });

    it("should skip upsert for manual buildings", async () => {
      prisma.building.findUnique.mockResolvedValue({ source: "manual" });
      await service.process("building.upsert", {
        coreId: 5,
        name: "Tower",
      });
      expect(prisma.building.upsert).not.toHaveBeenCalled();
    });

    it("should throw when coreId is missing", async () => {
      await expect(
        service.process("building.upsert", { name: "Tower" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw when name is empty", async () => {
      await expect(
        service.process("building.upsert", { coreId: 1, name: "   " }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("client.upsert", () => {
    it("should upsert client with email and state", async () => {
      const row = { id: "c1", coreId: 10, source: "core" };
      prisma.client.upsert.mockResolvedValue(row);
      const result = await service.process("client.upsert", {
        coreId: 10,
        firstName: "Giorgi",
        email: "giorgi@test.com",
        state: "ACTIVE",
      });
      expect(result).toEqual(row);
      expect(prisma.client.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            email: "giorgi@test.com",
            state: "ACTIVE",
            source: "core",
          }),
        }),
      );
    });

    it("should skip upsert for manual clients", async () => {
      prisma.client.findUnique.mockResolvedValue({ source: "manual" });
      await service.process("client.upsert", {
        coreId: 10,
      });
      expect(prisma.client.upsert).not.toHaveBeenCalled();
    });

    it("should sync apartment links when apartments array provided", async () => {
      prisma.client.upsert.mockResolvedValue({ id: "c1", coreId: 10 });
      prisma.building.findMany.mockResolvedValue([
        { id: "b-uuid", coreId: 100 },
      ]);
      prisma.clientBuilding.upsert.mockResolvedValue({});

      await service.process("client.upsert", {
        coreId: 10,
        apartments: [
          {
            buildingCoreId: 100,
            apartmentCoreId: 8001,
            apartmentNumber: "4A",
            entranceNumber: "2",
            floorNumber: "3",
            paymentId: "PAY-001",
            balance: 150.5,
          },
        ],
      });

      expect(prisma.clientBuilding.upsert).toHaveBeenCalled();
    });
  });

  describe("asset.upsert", () => {
    it("should upsert asset with port, productId, and door fields", async () => {
      prisma.building.findUnique.mockResolvedValue({ id: "b-uuid" });
      const row = { id: "a1", coreId: 20, source: "core" };
      prisma.asset.upsert.mockResolvedValue(row);

      const result = await service.process("asset.upsert", {
        coreId: 20,
        name: "Lift #1",
        type: "LIFT",
        assignedBuildingCoreId: 5,
        ip: "192.168.1.10",
        port: 8080,
        productId: "PROD-001",
      });

      expect(result).toEqual(row);
      expect(prisma.asset.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            port: 8080,
            productId: "PROD-001",
            source: "core",
          }),
        }),
      );
    });

    it("should upsert gate device with door fields", async () => {
      prisma.building.findUnique.mockResolvedValue({ id: "b-uuid" });
      prisma.asset.upsert.mockResolvedValue({
        id: "a2",
        coreId: 21,
        source: "core",
      });

      await service.process("asset.upsert", {
        coreId: 21,
        name: "Gate #1",
        type: "SMART_GSM_GATE",
        assignedBuildingCoreId: 5,
        door1: "995599111222",
        door2: "995599111333",
        door3: null,
      });

      expect(prisma.asset.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            door1: "995599111222",
            door2: "995599111333",
            door3: null,
          }),
        }),
      );
    });

    it("should skip upsert for manual assets", async () => {
      prisma.asset.findUnique.mockResolvedValue({ source: "manual" });
      await service.process("asset.upsert", {
        coreId: 20,
        name: "Lift #1",
        type: "LIFT",
        assignedBuildingCoreId: 5,
      });
      expect(prisma.asset.upsert).not.toHaveBeenCalled();
    });

    it("should throw when building not found", async () => {
      prisma.building.findUnique.mockResolvedValue(null);
      await expect(
        service.process("asset.upsert", {
          coreId: 20,
          name: "Lift",
          type: "LIFT",
          assignedBuildingCoreId: 999,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("contact.upsert", () => {
    it("should upsert building contact", async () => {
      prisma.building.findUnique.mockResolvedValue({ id: "b-uuid" });
      prisma.buildingContact.upsert.mockResolvedValue({
        id: "bc1",
        coreId: 30,
      });

      await service.process("contact.upsert", {
        coreId: 30,
        buildingCoreId: 5,
        name: "Nino",
        type: "SALES_AGENT",
        phone: "599222333",
      });

      expect(prisma.buildingContact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 30 },
          create: expect.objectContaining({
            name: "Nino",
            type: "SALES_AGENT",
            phone: "599222333",
          }),
        }),
      );
    });

    it("should throw when building not found for contact", async () => {
      prisma.building.findUnique.mockResolvedValue(null);
      await expect(
        service.process("contact.upsert", {
          coreId: 30,
          buildingCoreId: 999,
          name: "Nino",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("deactivate", () => {
    it("should soft-delete building", async () => {
      prisma.building.findUnique.mockResolvedValue({ source: "core" });
      prisma.building.update.mockResolvedValue({});
      await service.process("building.deactivate", { coreId: 5 });
      expect(prisma.building.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 5 },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it("should not deactivate manual buildings", async () => {
      prisma.building.findUnique.mockResolvedValue({ source: "manual" });
      await service.process("building.deactivate", { coreId: 5 });
      expect(prisma.building.update).not.toHaveBeenCalled();
    });

    it("should deactivate contact", async () => {
      prisma.buildingContact.findUnique.mockResolvedValue({ coreId: 30, isActive: true });
      prisma.buildingContact.update.mockResolvedValue({});
      await service.process("contact.deactivate", { coreId: 30 });
      expect(prisma.buildingContact.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 30 },
          data: { isActive: false },
        }),
      );
    });

    it("should skip deactivate contact when not found", async () => {
      prisma.buildingContact.findUnique.mockResolvedValue(null);
      await service.process("contact.deactivate", { coreId: 999 });
      expect(prisma.buildingContact.update).not.toHaveBeenCalled();
    });
  });
});
