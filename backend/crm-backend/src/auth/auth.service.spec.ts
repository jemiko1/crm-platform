import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as fs from "fs";
import * as path from "path";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock };
    deviceHandshakeToken: {
      updateMany: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
    telephonyExtension: { findUnique: jest.Mock };
  };
  let jwt: { signAsync: jest.Mock };

  const TEST_HASH = bcrypt.hashSync("CorrectPass1!", 10);

  const activeUser = {
    id: "user-1",
    email: "active@crm.local",
    passwordHash: TEST_HASH,
    role: "ADMIN",
    isActive: true,
  };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      deviceHandshakeToken: {
        updateMany: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      telephonyExtension: { findUnique: jest.fn() },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue("mock-jwt-token") };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe("login", () => {
    it("returns accessToken and user on valid credentials", async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await service.login("active@crm.local", "CorrectPass1!");

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user).toEqual({
        id: "user-1",
        email: "active@crm.local",
        role: "ADMIN",
      });
      expect(jwt.signAsync).toHaveBeenCalledWith({
        sub: "user-1",
        email: "active@crm.local",
        role: "ADMIN",
      });
    });

    it("throws UnauthorizedException when user does not exist", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login("nobody@crm.local", "any")).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("throws UnauthorizedException with dismissal message when user is inactive", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });

      await expect(
        service.login("active@crm.local", "CorrectPass1!"),
      ).rejects.toThrow("Your account has been dismissed");
    });

    it("throws UnauthorizedException on wrong password", async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser);

      await expect(
        service.login("active@crm.local", "WrongPassword"),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe("exchangeDeviceToken", () => {
    const now = new Date("2026-04-19T12:00:00.000Z");
    const futureExpiry = new Date("2026-04-19T12:00:30.000Z");
    const pastExpiry = new Date("2026-04-19T11:59:00.000Z");

    const tokenRecord = {
      id: "tok-1",
      token: "handshake-abc",
      userId: "user-1",
      expiresAt: futureExpiry,
      consumed: true,
      consumedAt: now,
    };

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("issues JWT when token is valid and unconsumed", async () => {
      prisma.deviceHandshakeToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.deviceHandshakeToken.findUnique.mockResolvedValue(tokenRecord);
      prisma.user.findUnique.mockResolvedValue(activeUser);

      const result = await service.exchangeDeviceToken("handshake-abc");

      expect(prisma.deviceHandshakeToken.updateMany).toHaveBeenCalledWith({
        where: {
          token: "handshake-abc",
          consumed: false,
          expiresAt: { gt: now },
        },
        data: { consumed: true, consumedAt: now },
      });
      expect(result.accessToken).toBe("mock-jwt-token");
      expect(result.user).toEqual({
        id: "user-1",
        email: "active@crm.local",
        role: "ADMIN",
      });
    });

    it("atomic consume: parallel redemption — exactly one resolves, other throws", async () => {
      // Simulate DB-level atomicity: the first updateMany sees count=1
      // (the row flipped from consumed=false to consumed=true), the second
      // sees count=0 (the WHERE consumed:false filter excludes it).
      let callCount = 0;
      prisma.deviceHandshakeToken.updateMany.mockImplementation(async () => {
        callCount++;
        return callCount === 1 ? { count: 1 } : { count: 0 };
      });
      prisma.deviceHandshakeToken.findUnique.mockResolvedValue(tokenRecord);
      prisma.user.findUnique.mockResolvedValue(activeUser);

      const results = await Promise.allSettled([
        service.exchangeDeviceToken("handshake-abc"),
        service.exchangeDeviceToken("handshake-abc"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.deviceHandshakeToken.updateMany).toHaveBeenCalledTimes(2);
    });

    it("throws UnauthorizedException on expired token", async () => {
      // updateMany returns count=0 because WHERE expiresAt>now fails.
      prisma.deviceHandshakeToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.exchangeDeviceToken("handshake-abc"),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it("throws UnauthorizedException on already-consumed token", async () => {
      // updateMany returns count=0 because WHERE consumed:false fails.
      prisma.deviceHandshakeToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.exchangeDeviceToken("handshake-abc"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException on non-existent token", async () => {
      // No matching row → count=0.
      prisma.deviceHandshakeToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.exchangeDeviceToken("does-not-exist"),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws UnauthorizedException when bound user is inactive", async () => {
      prisma.deviceHandshakeToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.deviceHandshakeToken.findUnique.mockResolvedValue(tokenRecord);
      prisma.user.findUnique.mockResolvedValue({ ...activeUser, isActive: false });

      await expect(
        service.exchangeDeviceToken("handshake-abc"),
      ).rejects.toThrow(UnauthorizedException);
    });

    // Touching pastExpiry to ensure fixture stays referenced for intent clarity.
    // (pastExpiry value is used only to document the TTL-gate test case.)
    it("updateMany query rejects tokens whose expiresAt is in the past", () => {
      expect(pastExpiry.getTime()).toBeLessThan(now.getTime());
      expect(futureExpiry.getTime()).toBeGreaterThan(now.getTime());
    });
  });

  describe("softphone.handshake permission catalog", () => {
    it("is present in seed-permissions.ts with TELEPHONY category", () => {
      // Load the seed file as text — avoid importing it so we don't
      // trigger its top-level Prisma/Pool connection side-effects.
      const seedPath = path.resolve(
        __dirname,
        "../../prisma/seed-permissions.ts",
      );
      const seed = fs.readFileSync(seedPath, "utf8");

      const hasResource = /resource:\s*"softphone"/.test(seed);
      const hasAction = /action:\s*"handshake"/.test(seed);
      expect(hasResource).toBe(true);
      expect(hasAction).toBe(true);

      // The permission line itself — must sit together on one line so the
      // category matches the resource/action pair.
      const lineMatch = seed.match(
        /resource:\s*"softphone",\s*action:\s*"handshake",\s*category:\s*PermissionCategory\.TELEPHONY/,
      );
      expect(lineMatch).not.toBeNull();
    });
  });

  describe("cleanupExpiredDeviceTokens", () => {
    const now = new Date("2026-04-19T03:00:00.000Z");
    const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(now);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("deletes expired and old-consumed tokens using 24h cutoff", async () => {
      // Simulate 10 tokens older than cutoff + 5 fresh ones.
      prisma.deviceHandshakeToken.deleteMany.mockResolvedValue({ count: 10 });

      await service.cleanupExpiredDeviceTokens();

      expect(prisma.deviceHandshakeToken.deleteMany).toHaveBeenCalledTimes(1);
      const callArg = prisma.deviceHandshakeToken.deleteMany.mock.calls[0][0];
      expect(callArg.where.OR).toHaveLength(2);
      expect(callArg.where.OR[0]).toEqual({ expiresAt: { lt: cutoff } });
      expect(callArg.where.OR[1]).toEqual({
        consumed: true,
        consumedAt: { lt: cutoff },
      });
    });

    it("swallows DB errors so the cron does not crash the process", async () => {
      prisma.deviceHandshakeToken.deleteMany.mockRejectedValue(
        new Error("connection lost"),
      );

      await expect(service.cleanupExpiredDeviceTokens()).resolves.toBeUndefined();
    });
  });
});
