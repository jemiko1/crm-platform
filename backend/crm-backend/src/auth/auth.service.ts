import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
    // Atomic claim: single UPDATE with WHERE guards prevents the
    // findUnique→update race (1–5 ms window) where two parallel requests
    // could each pass the read-side check and both flip `consumed`.
    // Only the winning updater sees count === 1.
    const now = new Date();
    const claimed = await this.prisma.deviceHandshakeToken.updateMany({
      where: {
        token,
        consumed: false,
        expiresAt: { gt: now },
      },
      data: { consumed: true, consumedAt: now },
    });

    if (claimed.count !== 1) {
      throw new UnauthorizedException("Invalid or expired handshake token");
    }

    // Safe to read now — the row is ours; no concurrent writer left.
    const record = await this.prisma.deviceHandshakeToken.findUnique({
      where: { token },
    });
    if (!record) {
      // Should be unreachable after a successful claim, but fail closed.
      throw new UnauthorizedException("Invalid or expired handshake token");
    }

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

  /**
   * Nightly cleanup for `DeviceHandshakeToken`.
   *
   * The table grows unbounded otherwise — each softphone handshake inserts a
   * row and nothing ever deletes. Delete anything expired more than 24h ago
   * (covers unconsumed tokens that timed out) AND anything consumed more than
   * 24h ago (keeps recent rows for short-window audit but bounds the table).
   *
   * Prior audit finding #42.
   */
  @Cron("0 3 * * *")
  async cleanupExpiredDeviceTokens(): Promise<void> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.deviceHandshakeToken.deleteMany({
        where: {
          OR: [
            { expiresAt: { lt: cutoff } },
            { consumed: true, consumedAt: { lt: cutoff } },
          ],
        },
      });
      this.logger.log(
        `DeviceHandshakeToken cleanup: ${result.count} rows deleted`,
      );
    } catch (err) {
      this.logger.error(
        `DeviceHandshakeToken cleanup failed: ${(err as Error).message}`,
      );
    }
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
