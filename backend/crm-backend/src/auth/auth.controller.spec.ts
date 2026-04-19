import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginThrottleService } from "./login-throttle.service";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";

/**
 * Regression guard for audit/P0-B.
 *
 * Ensures `GET /auth/me` never returns `sipPassword` on the
 * telephony extension payload. The browser must fetch fresh SIP
 * credentials via `GET /v1/telephony/sip-credentials` instead.
 */
describe("AuthController.me (audit/P0-B)", () => {
  let controller: AuthController;
  let prisma: any;
  let permissions: any;

  const buildModule = async (opts: { ext?: any } = {}) => {
    const extValue =
      "ext" in opts
        ? opts.ext
        : {
            extension: "101",
            displayName: "Operator 101",
            sipServer: "5.10.34.153",
            // sipPassword is intentionally NOT returned by findUnique
            // because the controller must use `select: {...}` to omit it.
          };

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: "user-1",
          email: "op@crm.local",
          role: "USER",
          isActive: true,
          isSuperAdmin: false,
          employee: {
            id: "emp-1",
            firstName: "Op",
            lastName: "Erator",
            avatar: null,
            employeeId: "EMP-001",
            jobTitle: "Operator",
          },
        }),
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: "emp-1",
          firstName: "Op",
          lastName: "Erator",
          avatar: null,
          employeeId: "EMP-001",
          jobTitle: "Operator",
          position: { id: "pos-1", name: "Operator", code: "OP" },
          department: { id: "dep-1", name: "Call Center", code: "CC" },
        }),
      },
      telephonyExtension: {
        findUnique: jest.fn().mockResolvedValue(extValue),
      },
    };

    permissions = {
      getCurrentUserPermissions: jest.fn().mockResolvedValue(["telephony.call"]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { refreshToken: jest.fn() } },
        { provide: LoginThrottleService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    controller = moduleRef.get(AuthController);
  };

  it("does NOT include sipPassword in telephonyExtension", async () => {
    await buildModule();
    const req: any = {
      user: { id: "user-1", iat: Date.now() / 1000, exp: Date.now() / 1000 + 3600 },
    };
    const res: any = { cookie: jest.fn(), clearCookie: jest.fn() };

    const result: any = await controller.me(req, res);

    expect(result.user.telephonyExtension).toBeDefined();
    expect(result.user.telephonyExtension).toEqual({
      extension: "101",
      displayName: "Operator 101",
      sipServer: "5.10.34.153",
    });
    expect(result.user.telephonyExtension).not.toHaveProperty("sipPassword");
  });

  it("passes `select` that omits sipPassword from the DB query", async () => {
    await buildModule();
    const req: any = {
      user: { id: "user-1", iat: Date.now() / 1000, exp: Date.now() / 1000 + 3600 },
    };
    const res: any = { cookie: jest.fn(), clearCookie: jest.fn() };

    await controller.me(req, res);

    const call = prisma.telephonyExtension.findUnique.mock.calls[0][0];
    expect(call.select).toBeDefined();
    expect(call.select.sipPassword).toBeUndefined();
    expect(call.select.extension).toBe(true);
    expect(call.select.displayName).toBe(true);
    expect(call.select.sipServer).toBe(true);
  });

  it("returns telephonyExtension=null when user has no extension", async () => {
    await buildModule({ ext: null });
    const req: any = {
      user: { id: "user-1", iat: Date.now() / 1000, exp: Date.now() / 1000 + 3600 },
    };
    const res: any = { cookie: jest.fn(), clearCookie: jest.fn() };

    const result: any = await controller.me(req, res);
    expect(result.user.telephonyExtension).toBeNull();
  });
});
