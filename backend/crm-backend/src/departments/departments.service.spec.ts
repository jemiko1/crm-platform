import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { DepartmentsService } from "./departments.service";
import { PrismaService } from "../prisma/prisma.service";

describe("DepartmentsService", () => {
  let service: DepartmentsService;
  let prisma: {
    department: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    employee: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      department: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      employee: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [DepartmentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(DepartmentsService);
  });

  describe("findOne", () => {
    it("should throw NotFoundException when department id is not found", async () => {
      prisma.department.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should throw BadRequestException when parentId does not exist", async () => {
      prisma.department.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          name: "Child",
          parentId: "p-missing",
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("should create department when parent and head are valid", async () => {
      prisma.department.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: "parent-1" });
      prisma.employee.findUnique.mockResolvedValue({ id: "e1" });
      const created = { id: "d1", name: "Sales", code: "SALES" };
      prisma.department.create.mockResolvedValue(created);
      const result = await service.create({
        name: "Sales",
        parentId: "parent-1",
        headId: "e1",
      } as any);
      expect(result).toEqual(created);
      expect(prisma.department.create).toHaveBeenCalled();
    });
  });
});
