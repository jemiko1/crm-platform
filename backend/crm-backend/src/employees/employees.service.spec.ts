import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EmployeesService } from "./employees.service";
import { PrismaService } from "../prisma/prisma.service";

describe("EmployeesService", () => {
  let service: EmployeesService;
  let prisma: {
    employee: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      employee: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmployeesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(EmployeesService);
  });

  describe("create", () => {
    it("should throw BadRequestException when email already used by employee", async () => {
      prisma.employee.findUnique.mockResolvedValue({ id: "e1" });
      await expect(
        service.create({ email: "dup@test.com" } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw BadRequestException when createUserAccount without positionId", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(
        service.create({
          email: "new@test.com",
          createUserAccount: true,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("findOne", () => {
    it("should throw NotFoundException when employee id missing", async () => {
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(service.findOne("bad")).rejects.toThrow(NotFoundException);
    });
  });
});
