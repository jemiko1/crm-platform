import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from "@nestjs/common";

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
    const header = req.headers["x-core-secret"];

    if (header !== secret) {
      throw new ForbiddenException("Invalid webhook secret");
    }

    return true;
  }
}
