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
    it("should upsert building with all fields", async () => {
      const row = { id: "b1", coreId: 5 };
      prisma.building.upsert.mockResolvedValue(row);
      const result = await service.process("building.upsert", {
        coreId: 5,
        name: "Tower",
        phone: "599123456",
        email: "test@asg.ge",
        numberOfApartments: 50,
        disableCrons: false,
        isActive: true,
        branchId: 1,
      });
      expect(result).toEqual(row);
      expect(prisma.building.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 5 },
          create: expect.objectContaining({
            phone: "599123456",
            email: "test@asg.ge",
            numberOfApartments: 50,
            disableCrons: false,
            isActive: true,
            branchId: 1,
          }),
        }),
      );
    });

    it("should derive isActive from disableCrons", async () => {
      prisma.building.upsert.mockResolvedValue({ id: "b1", coreId: 5 });
      await service.process("building.upsert", {
        coreId: 5,
        name: "Inactive Tower",
        disableCrons: true,
        isActive: false,
      });
      expect(prisma.building.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            disableCrons: true,
            isActive: false,
          }),
        }),
      );
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
    it("should upsert client with email", async () => {
      const row = { id: "c1", coreId: 10 };
      prisma.client.upsert.mockResolvedValue(row);
      const result = await service.process("client.upsert", {
        coreId: 10,
        firstName: "Giorgi",
        email: "giorgi@test.com",
      });
      expect(result).toEqual(row);
      expect(prisma.client.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            email: "giorgi@test.com",
          }),
        }),
      );
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

    it("should remove stale apartment links", async () => {
      prisma.client.upsert.mockResolvedValue({ id: "c1", coreId: 10 });
      prisma.building.findMany.mockResolvedValue([
        { id: "b-uuid", coreId: 100 },
      ]);
      prisma.clientBuilding.findMany.mockResolvedValue([
        { id: "old-link", buildingId: "b-old", apartmentCoreId: 999 },
      ]);
      prisma.clientBuilding.upsert.mockResolvedValue({});
      prisma.clientBuilding.deleteMany.mockResolvedValue({ count: 1 });

      await service.process("client.upsert", {
        coreId: 10,
        apartments: [
          { buildingCoreId: 100, apartmentCoreId: 8001 },
        ],
      });

      expect(prisma.clientBuilding.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ["old-link"] } },
        }),
      );
    });
  });

  describe("asset.upsert", () => {
    it("should upsert asset with port as string and productId", async () => {
      prisma.building.findUnique.mockResolvedValue({ id: "b-uuid" });
      const row = { id: "a1", coreId: 20 };
      prisma.asset.upsert.mockResolvedValue(row);

      const result = await service.process("asset.upsert", {
        coreId: 20,
        name: "Lift #1",
        type: "LIFT",
        assignedBuildingCoreId: 5,
        ip: "192.168.1.10",
        port: "4370",
        productId: "159",
      });

      expect(result).toEqual(row);
      expect(prisma.asset.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            port: "4370",
            productId: "159",
          }),
        }),
      );
    });

    it("should upsert gate device with door fields", async () => {
      prisma.building.findUnique.mockResolvedValue({ id: "b-uuid" });
      prisma.asset.upsert.mockResolvedValue({ id: "a2", coreId: 10000021 });

      await service.process("asset.upsert", {
        coreId: 10000021,
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
        type: "1",
        description: "Sales agent",
      });

      expect(prisma.buildingContact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 30 },
          create: expect.objectContaining({
            name: "Nino",
            type: "1",
            description: "Sales agent",
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
      prisma.building.findUnique.mockResolvedValue({ id: "b1", coreId: 5 });
      prisma.building.update.mockResolvedValue({});
      await service.process("building.deactivate", { coreId: 5 });
      expect(prisma.building.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { coreId: 5 },
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it("should skip deactivate when building not found", async () => {
      prisma.building.findUnique.mockResolvedValue(null);
      await service.process("building.deactivate", { coreId: 999 });
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
