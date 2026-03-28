import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class TelephonyIngestGuard implements CanActivate {
  private readonly logger = new Logger(TelephonyIngestGuard.name);

  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.TELEPHONY_INGEST_SECRET;
    if (!secret) {
      this.logger.error('TELEPHONY_INGEST_SECRET is not configured');
      throw new ForbiddenException('Telephony ingest endpoint is not configured');
    }

    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['x-telephony-secret'] as string | undefined;

    if (!header) {
      throw new ForbiddenException('Invalid telephony ingest secret');
    }

    try {
      const isValid = timingSafeEqual(
        Buffer.from(header),
        Buffer.from(secret),
      );
      if (!isValid) {
        throw new ForbiddenException('Invalid telephony ingest secret');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid telephony ingest secret');
    }

    return true;
  }
}
