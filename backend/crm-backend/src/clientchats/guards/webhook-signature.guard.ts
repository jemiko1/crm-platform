import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ViberAdapter } from '../adapters/viber.adapter';
import { FacebookAdapter } from '../adapters/facebook.adapter';

@Injectable()
export class ViberWebhookGuard implements CanActivate {
  private readonly logger = new Logger(ViberWebhookGuard.name);

  constructor(private readonly viber: ViberAdapter) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!this.viber.verifyWebhook(req)) {
      this.logger.warn('Invalid Viber webhook signature');
      throw new ForbiddenException('Invalid Viber signature');
    }
    return true;
  }
}

@Injectable()
export class FacebookWebhookGuard implements CanActivate {
  private readonly logger = new Logger(FacebookWebhookGuard.name);

  constructor(private readonly facebook: FacebookAdapter) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    if (!this.facebook.verifyWebhook(req)) {
      this.logger.warn('Invalid Facebook webhook signature');
      throw new ForbiddenException('Invalid Facebook signature');
    }
    return true;
  }
}
