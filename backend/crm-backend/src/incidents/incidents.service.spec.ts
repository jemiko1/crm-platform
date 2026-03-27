import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { IncidentsService } from "./incidents.service";
import { PrismaService } from "../prisma/prisma.service";

describe("IncidentsService", () => {
  let service: IncidentsService;
  let prisma: {
    incident: { findUnique: jest.Mock; count: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    building: { findUnique: jest.Mock };
    client: { findUnique: jest.Mock };
    asset: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      incident: {
        findUnique: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      building: { findUnique: jest.fn() },
      client: { findUnique: jest.fn() },
      asset: { findMany: jest.fn() },
      $transaction: jest.fn(async (arg: any) => {
        if (Array.isArray(arg)) {
          return Promise.all(arg.map((op) => (typeof op === "object" && "then" in op ? op : op)));
        }
        return arg(prisma);
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [IncidentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(IncidentsService);
  });

  describe("getById", () => {
    it("should throw NotFoundException when incident does not exist", async () => {
      prisma.incident.findUnique.mockResolvedValue(null);
      await expect(service.getById("bad")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should throw NotFoundException when building coreId is not found", async () => {
      prisma.building.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          buildingId: 1,
          incidentType: "x",
          description: "d",
          priority: "LOW",
          contactMethod: "PHONE",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when client is not linked to building", async () => {
      prisma.building.findUnique.mockResolvedValue({ id: "bid" });
      prisma.client.findUnique.mockResolvedValue({
        id: "c1",
        coreId: 2,
        clientBuildings: [],
      });
      await expect(
        service.create({
          buildingId: 1,
          clientId: 2,
          incidentType: "x",
          description: "d",
          priority: "LOW",
          contactMethod: "PHONE",
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
