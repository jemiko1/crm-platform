import { Test, TestingModule } from "@nestjs/testing";
import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock } };
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
    prisma = { user: { findUnique: jest.fn() } };
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
