import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { LoginThrottleService } from "./login-throttle.service";
import { AuthController } from "./auth.controller";
import { PrismaModule } from "../prisma/prisma.module";
import { JwtStrategy } from "./jwt.strategy";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    PermissionsModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: {
        expiresIn: (process.env.JWT_EXPIRES_IN ?? "24h") as any,
      },
    }),
  ],
  providers: [AuthService, LoginThrottleService, JwtStrategy],
  controllers: [AuthController],
})
export class AuthModule {}
