import {
  Body, Controller, Get, Post, Req, Res, UseGuards,
  HttpException, HttpStatus, UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { LoginThrottleService } from "./login-throttle.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

class LoginDto {
  @ApiProperty({ format: "email" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;
}

class ExchangeTokenDto {
  @ApiProperty()
  @IsString()
  handshakeToken!: string;
}

/**
 * Browsers ignore Set-Cookie with Secure=true on http://. Non-production always
 * uses Secure=false so local dev works even when COOKIE_SECURE=true is copied
 * from production. Production still honors COOKIE_SECURE for HTTPS.
 */
function authSessionCookieSecure(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }
  return (process.env.COOKIE_SECURE ?? "false") === "true";
}

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private throttle: LoginThrottleService,
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  @Post("login")
  @Doc({
    summary: "Browser login — sets httpOnly session cookie",
    ok: "User profile; JWT stored in cookie",
    noAuth: true,
    badRequest: true,
    tooManyRequests: true,
    bodyType: LoginDto,
    status: 200,
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertNotLocked(dto.email);

    try {
      const { accessToken, user } = await this.auth.login(dto.email, dto.password);
      this.throttle.recordSuccess(dto.email);

      const cookieName = process.env.COOKIE_NAME ?? "access_token";
      const secure = authSessionCookieSecure();

      res.cookie(cookieName, accessToken, {
        httpOnly: true,
        sameSite: secure ? "none" : "lax",
        secure,
        path: "/",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      return { user };
    } catch (err) {
      this.throwWithAttemptInfo(dto.email, err);
    }
  }

  @Post("app-login")
  @Doc({
    summary: "Native/app login — returns access token in JSON body",
    ok: "Access token and user payload for mobile or desktop clients",
    noAuth: true,
    badRequest: true,
    tooManyRequests: true,
    bodyType: LoginDto,
    status: 200,
  })
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
  @Doc({
    summary: "Create short-lived device handshake token",
    ok: "Handshake token for pairing another client",
    status: 200,
  })
  async createDeviceToken(@Req() req: any) {
    const token = await this.auth.createDeviceToken(req.user.id);
    return { handshakeToken: token };
  }

  @Post("exchange-token")
  @Doc({
    summary: "Exchange device handshake token for JWT",
    ok: "Access credentials after successful handshake",
    noAuth: true,
    badRequest: true,
    bodyType: ExchangeTokenDto,
    status: 200,
  })
  async exchangeToken(@Body() dto: ExchangeTokenDto) {
    return this.auth.exchangeDeviceToken(dto.handshakeToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @Doc({
    summary: "Current user profile, permissions, and telephony extension",
    ok: "Aggregated session user with RBAC and telephony fields",
    status: 200,
  })
  async me(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const userId = req.user.id;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true },
    });

    if (!user || !user.isActive) {
      // User deleted or dismissed — clear cookie and reject
      const cookieName = process.env.COOKIE_NAME ?? "access_token";
      const secure = authSessionCookieSecure();
      res.clearCookie(cookieName, { path: "/", sameSite: secure ? "none" : "lax", secure });
      throw new UnauthorizedException("Account has been deactivated");
    }

    // Sliding session: refresh token if past 50% of its lifetime
    const { iat, exp } = req.user;
    if (iat && exp) {
      const now = Math.floor(Date.now() / 1000);
      const halfLife = iat + Math.floor((exp - iat) / 2);
      if (now >= halfLife) {
        const newToken = await this.auth.refreshToken({
          id: user.id,
          email: user.email,
          role: user.role,
        });
        const cookieName = process.env.COOKIE_NAME ?? "access_token";
        const secure = authSessionCookieSecure();
        res.cookie(cookieName, newToken, {
          httpOnly: true,
          sameSite: secure ? "none" : "lax",
          secure,
          path: "/",
          maxAge: 30 * 24 * 60 * 60 * 1000,
        });
      }
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
  @Doc({
    summary: "Clear session cookie",
    ok: "{ ok: true } after cookie cleared",
    noAuth: true,
    status: 200,
  })
  logout(@Res({ passthrough: true }) res: Response) {
    const cookieName = process.env.COOKIE_NAME ?? "access_token";
    const secure = authSessionCookieSecure();

    res.clearCookie(cookieName, { path: "/", sameSite: secure ? "none" : "lax", secure });
    return { ok: true };
  }
}
