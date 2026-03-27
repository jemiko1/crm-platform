import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { PositionsService } from "./positions.service";
import { PrismaService } from "../prisma/prisma.service";

describe("PositionsService", () => {
  let service: PositionsService;
  let prisma: {
    position: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    roleGroup: { findUnique: jest.Mock };
    department: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      position: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      roleGroup: { findUnique: jest.fn() },
      department: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PositionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PositionsService);
  });

  describe("findOne", () => {
    it("should throw NotFoundException when position id is not found", async () => {
      prisma.position.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should throw NotFoundException when role group does not exist", async () => {
      prisma.position.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      prisma.roleGroup.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          name: "Mgr",
          roleGroupId: "rg-bad",
        } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw ConflictException when position name already exists", async () => {
      prisma.position.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "p1" });
      await expect(
        service.create({ name: "Dup", roleGroupId: "rg1" } as any),
      ).rejects.toThrow(ConflictException);
    });
  });
});
