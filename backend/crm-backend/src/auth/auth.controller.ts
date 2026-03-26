import {
  Body, Controller, Get, Post, Req, Res, UseGuards,
  HttpException, HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { LoginThrottleService } from "./login-throttle.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

class ExchangeTokenDto {
  @IsString()
  handshakeToken!: string;
}

@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private throttle: LoginThrottleService,
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertNotLocked(dto.email);

    try {
      const { accessToken, user } = await this.auth.login(dto.email, dto.password);
      this.throttle.recordSuccess(dto.email);

      const cookieName = process.env.COOKIE_NAME ?? "access_token";
      const secure = (process.env.COOKIE_SECURE ?? "false") === "true";

      res.cookie(cookieName, accessToken, {
        httpOnly: true,
        sameSite: secure ? "none" : "lax",
        secure,
        path: "/",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return { user };
    } catch (err) {
      this.throwWithAttemptInfo(dto.email, err);
    }
  }

  @Post("app-login")
  async appLogin(@Body() dto: LoginDto) {
    this.assertNotLocked(dto.email);

    try {
      const result = await this.auth.appLogin(dto.email, dto.password);
      this.throttle.recordSuccess(dto.email);
      return result;
    } catch (err) {
      this.throwWithAttemptInfo(dto.email, err);
    }
  }

  private assertNotLocked(email: string): void {
    const lockedSeconds = this.throttle.getLockedSeconds(email);
    if (lockedSeconds !== null) {
      const mins = Math.floor(lockedSeconds / 60);
      const secs = lockedSeconds % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Account temporarily locked. Try again in ${timeStr}.`,
          retryAfterSeconds: lockedSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private throwWithAttemptInfo(email: string, original: unknown): never {
    const remaining = this.throttle.recordFailure(email);

    if (remaining === 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: "Too many failed attempts. Account locked for 5 minutes.",
          retryAfterSeconds: 300,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (original instanceof HttpException) {
      const body = original.getResponse();
      const baseMessage =
        typeof body === "string" ? body : (body as any)?.message ?? "Invalid credentials";

      throw new HttpException(
        {
          statusCode: original.getStatus(),
          message: `${baseMessage}. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
          remainingAttempts: remaining,
        },
        original.getStatus(),
      );
    }

    throw original;
  }

  @UseGuards(JwtAuthGuard)
  @Post("device-token")
  async createDeviceToken(@Req() req: any) {
    const token = await this.auth.createDeviceToken(req.user.id);
    return { handshakeToken: token };
  }

  @Post("exchange-token")
  async exchangeToken(@Body() dto: ExchangeTokenDto) {
    return this.auth.exchangeDeviceToken(dto.handshakeToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: any) {
    const userId = req.user.id;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });

    if (!user) {
      return { user: req.user };
    }

    let employee = user.employee as (typeof user.employee) & {
      position?: { id: string; name: string; code: string } | null;
      department?: { id: string; name: string; code: string } | null;
    };
    if (employee) {
      const full = await this.prisma.employee.findUnique({
        where: { id: employee.id },
        include: { position: true, department: true },
      });
      if (full) employee = full;
    }

    const permissions = await this.permissionsService.getCurrentUserPermissions(userId);
    const position = employee?.position;

    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: userId },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
        firstName: employee?.firstName ?? null,
        lastName: employee?.lastName ?? null,
        avatarUrl: employee?.avatar ?? null,
        employeeId: employee?.employeeId ?? null,
        jobTitle: employee?.jobTitle ?? null,
        position: position
          ? {
              id: position.id,
              name: position.name,
              code: position.code,
            }
          : null,
        department: employee?.department
          ? {
              id: employee.department.id,
              name: employee.department.name,
              code: employee.department.code,
            }
          : null,
        permissions,
        telephonyExtension: ext
          ? {
              extension: ext.extension,
              displayName: ext.displayName,
              sipServer: ext.sipServer,
              sipPassword: ext.sipPassword,
            }
          : null,
      },
    };
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    const cookieName = process.env.COOKIE_NAME ?? "access_token";
    const secure = (process.env.COOKIE_SECURE ?? "false") === "true";

    res.clearCookie(cookieName, { path: "/", sameSite: secure ? "none" : "lax", secure });
    return { ok: true };
  }
}
