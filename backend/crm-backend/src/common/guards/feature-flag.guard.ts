import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    const enabled = String(process.env.FEATURE_MANUAL_CREATE ?? "true").toLowerCase() === "true";
    if (!enabled) {
      throw new ForbiddenException("Manual creation is disabled (FEATURE_MANUAL_CREATE=false)");
    }
    return true;
  }
}
