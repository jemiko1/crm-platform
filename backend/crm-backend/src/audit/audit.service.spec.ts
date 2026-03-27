import { Test, TestingModule } from "@nestjs/testing";
import { AuditService } from "./audit.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuditService", () => {
  let service: AuditService;
  let prisma: { auditLog: { create: jest.Mock } };

  beforeEach(async () => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({ id: "a1" }) } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(AuditService);
  });

  describe("log", () => {
    it("should persist audit with actor, ip, user-agent and payload when req is provided", async () => {
      const req = {
        user: { id: "u1", email: "a@b.c" },
        ip: "1.2.3.4",
        headers: { "user-agent": "jest" },
      };
      await service.log({
        action: "CREATE",
        entity: "CLIENT",
        entityKey: "c1",
        req,
        payload: { x: 1 },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "CREATE",
          entity: "CLIENT",
          entityKey: "c1",
          actorId: "u1",
          actorEmail: "a@b.c",
          ip: "1.2.3.4",
          userAgent: "jest",
          payload: { x: 1 },
        }),
      });
    });

    it("should use null actor fields when req is omitted", async () => {
      await service.log({
        action: "DELETE",
        entity: "BUILDING",
        entityKey: "b1",
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actorId: null,
          actorEmail: null,
          ip: null,
          userAgent: null,
          payload: null,
        }),
      });
    });

    it("should propagate rejection when create fails", async () => {
      prisma.auditLog.create.mockRejectedValueOnce(new Error("db down"));
      await expect(
        service.log({ action: "CREATE", entity: "USER", entityKey: "u" }),
      ).rejects.toThrow("db down");
    });
  });
});
