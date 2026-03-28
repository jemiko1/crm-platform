import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { timingSafeEqual } from "crypto";

@Injectable()
export class CoreWebhookGuard implements CanActivate {
  private readonly logger = new Logger(CoreWebhookGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.CORE_WEBHOOK_SECRET;
    if (!secret) {
      this.logger.error("CORE_WEBHOOK_SECRET is not configured");
      throw new ForbiddenException("Webhook endpoint is not configured");
    }

    const req = ctx.switchToHttp().getRequest();
    const header = req.headers["x-core-secret"] as string | undefined;

    if (!header) {
      throw new ForbiddenException("Invalid webhook secret");
    }

    try {
      const isValid = timingSafeEqual(
        Buffer.from(header),
        Buffer.from(secret),
      );
      if (!isValid) {
        throw new ForbiddenException("Invalid webhook secret");
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException("Invalid webhook secret");
    }

    return true;
  }
}
