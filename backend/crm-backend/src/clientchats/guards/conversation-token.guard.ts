import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface ConversationTokenPayload {
  conversationId: string;
  visitorId: string;
  channelAccountId: string;
}

@Injectable()
export class ConversationTokenGuard implements CanActivate {
  private readonly logger = new Logger(ConversationTokenGuard.name);

  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['x-conversation-token'] as string;

    if (!header) {
      throw new UnauthorizedException('Missing conversation token');
    }

    try {
      const payload = this.jwt.verify<ConversationTokenPayload>(header);
      req.conversationToken = payload;
      return true;
    } catch {
      this.logger.warn('Invalid conversation token');
      throw new UnauthorizedException('Invalid or expired conversation token');
    }
  }
}
