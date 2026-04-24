import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { EmployeesService } from "./employees.service";
import { PrismaService } from "../prisma/prisma.service";
import { ExtensionLinkService } from "../telephony/services/extension-link.service";

describe("EmployeesService", () => {
  let service: EmployeesService;
  let prisma: {
    employee: { findUnique: jest.Mock; findMany: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let extensionLink: { unlink: jest.Mock };

  beforeEach(async () => {
    prisma = {
      employee: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    extensionLink = { unlink: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: prisma },
        { provide: ExtensionLinkService, useValue: extensionLink },
      ],
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

  describe("autoUnlinkForUser (private — exercised via dismiss/hardDelete)", () => {
    // These tests target the auto-unlink hook directly by invoking the
    // private method through a cast. We don't stub the full dismiss/
    // hardDelete transactions here — they're complex and covered by
    // integration testing. The contract we care about is:
    //   1. If the user has a linked extension, ExtensionLinkService.unlink
    //      is invoked with its id.
    //   2. If the user has no extension, unlink is NOT called.
    //   3. If unlink throws, the hook swallows the error (must never
    //      block an HR dismissal).
    function invokePrivate(userId: string, ctx: "dismiss" | "hardDelete") {
      return (service as any).autoUnlinkForUser(userId, ctx);
    }

    it("invokes ExtensionLinkService.unlink when user has a linked extension", async () => {
      (prisma as any).telephonyExtension = {
        findFirst: jest.fn().mockResolvedValue({ id: "ext-1", extension: "215" }),
      };

      await invokePrivate("user-1", "dismiss");

      expect(extensionLink.unlink).toHaveBeenCalledWith("ext-1");
    });

    it("is a no-op when the user has no linked extension", async () => {
      (prisma as any).telephonyExtension = {
        findFirst: jest.fn().mockResolvedValue(null),
      };

      await invokePrivate("user-1", "hardDelete");

      expect(extensionLink.unlink).not.toHaveBeenCalled();
    });

    it("swallows unlink errors so HR dismissal is never blocked by a PBX outage", async () => {
      // Regression guard: if ExtensionLinkService throws (AMI down, race
      // conflict, DB glitch), autoUnlinkForUser MUST NOT rethrow — the
      // dismiss / hardDelete transaction has to proceed regardless.
      (prisma as any).telephonyExtension = {
        findFirst: jest.fn().mockResolvedValue({ id: "ext-1", extension: "215" }),
      };
      extensionLink.unlink.mockRejectedValueOnce(new Error("AMI not connected"));

      await expect(invokePrivate("user-1", "dismiss")).resolves.toBeUndefined();
    });
  });

  describe("dismiss — call-site ordering (regression guard)", () => {
    // Pre-transaction ordering is load-bearing: the unlink hook MUST run
    // before prisma.$transaction, otherwise for hardDelete the FK SetNull
    // cascade would strip crmUserId and the unlink service would
    // short-circuit with no AMI emitted. If a future refactor ever moves
    // the call inside the transaction (or drops it), this test fails.
    it("calls autoUnlinkForUser BEFORE the $transaction callback", async () => {
      const order: string[] = [];
      extensionLink.unlink.mockImplementation(async () => {
        order.push("unlink");
      });

      // Minimal prisma surface to reach the transaction. findOne returns an
      // employee with a userId and ACTIVE status; no active leads/work
      // orders so delegation is not required.
      (prisma as any).user.findFirst = jest.fn().mockResolvedValue(null); // not superadmin
      (prisma as any).telephonyExtension = {
        findFirst: jest.fn().mockResolvedValue({ id: "ext-1", extension: "215" }),
      };
      (prisma as any).lead = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).workOrder = { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) };
      (prisma as any).workOrderAssignment = {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      };
      prisma.employee.findUnique.mockResolvedValue({
        id: "emp-1",
        userId: "user-1",
        firstName: "X",
        lastName: "Y",
        employeeId: "EMP-001",
        status: "ACTIVE",
        user: { isSuperAdmin: false },
        position: { code: "OP" },
        department: null,
      });
      (prisma as any).$transaction = jest.fn(async (cb: any) => {
        order.push("tx");
        // Give the callback minimal tx stubs so it doesn't throw; we don't
        // care about its return value for ordering purposes.
        const txStub: any = {
          lead: { updateMany: jest.fn() },
          workOrderAssignment: { updateMany: jest.fn() },
          user: { update: jest.fn() },
          employee: { update: jest.fn().mockResolvedValue({}) },
        };
        return cb(txStub);
      });

      await service.dismiss("emp-1");

      expect(order).toEqual(["unlink", "tx"]);
    });
  });
});
