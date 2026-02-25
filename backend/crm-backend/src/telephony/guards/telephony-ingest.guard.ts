import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

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
    const header = req.headers['x-telephony-secret'];

    if (header !== secret) {
      throw new ForbiddenException('Invalid telephony ingest secret');
    }

    return true;
  }
}
