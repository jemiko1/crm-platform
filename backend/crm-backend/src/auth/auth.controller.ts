import { Body, Controller, Get, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { IsEmail, IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
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

@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
  ) {}

  @Post("login")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.auth.login(dto.email, dto.password);

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

    // Fetch position/department in a separate query to avoid
    // PrismaPg nested-include limitation.
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
