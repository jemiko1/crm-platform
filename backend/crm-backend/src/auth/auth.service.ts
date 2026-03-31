import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.validateCredentials(email, password);

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  async appLogin(email: string, password: string) {
    const user = await this.validateCredentials(email, password);

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
    );

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: user.id },
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
      telephonyExtension: ext
        ? {
            extension: ext.extension,
            displayName: ext.displayName,
            sipPassword: ext.sipPassword,
            sipServer: ext.sipServer,
          }
        : null,
    };
  }

  async createDeviceToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 30_000);

    await this.prisma.deviceHandshakeToken.create({
      data: { token, userId, expiresAt },
    });

    return token;
  }

  async exchangeDeviceToken(token: string) {
    const record = await this.prisma.deviceHandshakeToken.findUnique({
      where: { token },
    });

    if (!record || record.consumed || record.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired handshake token");
    }

    await this.prisma.deviceHandshakeToken.update({
      where: { id: record.id },
      data: { consumed: true },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: record.userId },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("User not found or inactive");
    }

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
    );

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: user.id },
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
      telephonyExtension: ext
        ? {
            extension: ext.extension,
            displayName: ext.displayName,
            sipPassword: ext.sipPassword,
            sipServer: ext.sipServer,
          }
        : null,
    };
  }

  /**
   * Issue a fresh JWT for an already-authenticated user (sliding session).
   */
  async refreshToken(user: { id: string; email: string; role: string }) {
    return this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        "Your account has been dismissed. Please contact your system administrator."
      );
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return user;
  }
}
