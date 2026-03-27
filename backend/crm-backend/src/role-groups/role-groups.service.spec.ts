import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { RoleGroupsService } from "./role-groups.service";
import { PrismaService } from "../prisma/prisma.service";

describe("RoleGroupsService", () => {
  let service: RoleGroupsService;
  let prisma: {
    roleGroup: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      roleGroup: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoleGroupsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RoleGroupsService);
  });

  describe("findOne", () => {
    it("should throw NotFoundException when id is not found", async () => {
      prisma.roleGroup.findUnique.mockResolvedValue(null);
      await expect(service.findOne("x")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should throw ConflictException when name already exists", async () => {
      prisma.roleGroup.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "g1" });
      await expect(
        service.create({ name: "Existing", description: null } as any),
      ).rejects.toThrow(ConflictException);
    });

    it("should create when name is unique", async () => {
      prisma.roleGroup.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const created = { id: "g2", name: "New" };
      prisma.roleGroup.create.mockResolvedValue(created);
      const res = await service.create({ name: "New", description: "d" } as any);
      expect(res).toEqual(created);
    });
  });
});
