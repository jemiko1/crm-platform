import {
  Body, Controller, Get, Post, Req, Res, UseGuards,
  HttpException, HttpStatus, UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { LoginThrottleService } from "./login-throttle.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";
import { PositionPermissionGuard } from "../common/guards/position-permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
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

/**
 * Resolve the caller's IP address. Express populates `req.ip` from the
 * left-most X-Forwarded-For entry when `trust proxy` is set (see main.ts).
 * Falls back to the socket address if neither is available, and "unknown"
 * as a last resort so the throttle query never receives undefined.
 */
function resolveClientIp(req: Request): string {
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    "unknown"
  );
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = resolveClientIp(req);
    const userAgent = req.headers["user-agent"] ?? null;

    await this.throttle.assertNotLocked(dto.email, ip);

    try {
      const { accessToken, user } = await this.auth.login(dto.email, dto.password);
      await this.throttle.recordSuccess(dto.email, ip, userAgent);

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
      await this.throttle.recordFailure(dto.email, ip, userAgent);
      this.rethrowWithAttemptInfo(err);
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
  async appLogin(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = resolveClientIp(req);
    const userAgent = req.headers["user-agent"] ?? null;

    await this.throttle.assertNotLocked(dto.email, ip);

    try {
      const result = await this.auth.appLogin(dto.email, dto.password);
      await this.throttle.recordSuccess(dto.email, ip, userAgent);
      return result;
    } catch (err) {
      await this.throttle.recordFailure(dto.email, ip, userAgent);
      this.rethrowWithAttemptInfo(err);
    }
  }

  /**
   * Preserve the original error semantics (401 Invalid credentials, etc.)
   * while still letting the persistent throttle record the failure. The
   * throttle itself throws 429 separately on subsequent requests once a
   * window is exceeded — we no longer tack "attempts remaining" onto the
   * message since the count is no longer tracked per-request in memory.
   */
  private rethrowWithAttemptInfo(original: unknown): never {
    if (original instanceof HttpException) {
      throw original;
    }
    throw new HttpException(
      {
        statusCode: HttpStatus.UNAUTHORIZED,
        message: "Invalid credentials",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  @UseGuards(JwtAuthGuard, PositionPermissionGuard)
  @RequirePermission("softphone.handshake")
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

    // SECURITY (audit/P0-B): never include sipPassword in /auth/me — the
    // browser does not need it, and any authenticated user could curl this
    // endpoint to read their SIP credentials. The softphone fetches fresh
    // credentials via GET /v1/telephony/sip-credentials instead.
    const ext = await this.prisma.telephonyExtension.findUnique({
      where: { crmUserId: userId },
      select: {
        extension: true,
        displayName: true,
        sipServer: true,
      },
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
