import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { RolesService } from "./roles.service";
import { PrismaService } from "../prisma/prisma.service";

describe("RolesService", () => {
  let service: RolesService;
  let prisma: {
    role: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      role: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(RolesService);
  });

  describe("findOne", () => {
    it("should throw NotFoundException when role id is not found", async () => {
      prisma.role.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should throw BadRequestException when role name already exists", async () => {
      prisma.role.findUnique.mockResolvedValueOnce({ id: "r1" });
      await expect(
        service.create({
          name: "Dup",
          code: "DUP",
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("should create role when name and code are unique", async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const created = { id: "r2", name: "New", code: "NEW" };
      prisma.role.create.mockResolvedValue(created);
      const dto = {
        name: "New",
        code: "NEW",
        description: null,
        level: 1,
      };
      await expect(service.create(dto as any)).resolves.toEqual(created);
    });
  });
});
