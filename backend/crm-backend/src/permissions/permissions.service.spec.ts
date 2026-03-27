import { Test, TestingModule } from "@nestjs/testing";
import { PermissionsService } from "./permissions.service";
import { PrismaService } from "../prisma/prisma.service";

describe("PermissionsService", () => {
  let service: PermissionsService;
  let prisma: {
    permission: {
      upsert: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    employee: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      permission: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      employee: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(PermissionsService);
  });

  describe("onModuleInit", () => {
    it("should complete when upsert succeeds", async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      expect(prisma.permission.upsert).toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return permissions from prisma", async () => {
      const rows = [{ id: "p1", resource: "a", action: "b", category: "ADMIN" }];
      prisma.permission.findMany.mockResolvedValue(rows);
      await expect(service.findAll()).resolves.toEqual(rows);
    });
  });

  describe("getEffectivePermissions", () => {
    it("should return empty array when employee id is not found", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.getEffectivePermissions("e-missing")).resolves.toEqual([]);
    });
  });
});
