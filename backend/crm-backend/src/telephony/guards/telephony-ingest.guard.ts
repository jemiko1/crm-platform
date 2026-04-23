import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * B11 — replay window for HMAC-signed requests. 5 minutes is the industry
 * standard for server-to-server signed webhooks (GitHub, Stripe, etc.).
 * The bridge and backend clocks are on the same VM, so skew is < 1 s.
 */
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

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
    const headers = req.headers as Record<string, string | undefined>;
    const signature = headers['x-telephony-signature'];
    const timestamp = headers['x-telephony-timestamp'];
    const legacy = headers['x-telephony-secret'];

    // Prefer HMAC when the bridge sends signed requests. Falls through
    // to the legacy shared-secret check only when signature headers are
    // absent, for rollout ordering safety.
    if (signature && timestamp) {
      return this.verifyHmac(req, secret, timestamp, signature);
    }

    if (!legacy) {
      throw new ForbiddenException('Invalid telephony ingest secret');
    }
    return this.verifyLegacy(legacy, secret);
  }

  /**
   * HMAC-SHA256 over `${timestamp}.${raw body}` in constant time. Rejects
   * stale or future-dated timestamps to prevent replay. `rawBody: true` is
   * enabled globally in main.ts so req.rawBody is always populated on
   * POST — if not, we fall back to a stringified JSON of req.body.
   */
  private verifyHmac(
    req: any,
    secret: string,
    timestamp: string,
    signature: string,
  ): boolean {
    const ts = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(ts)) {
      throw new ForbiddenException('Invalid telephony ingest signature');
    }
    const skew = Math.abs(Date.now() - ts);
    if (skew > REPLAY_WINDOW_MS) {
      throw new ForbiddenException('Telephony ingest timestamp outside replay window');
    }

    const rawBody: string | Buffer | undefined = req.rawBody;
    const bodyStr =
      typeof rawBody === 'string'
        ? rawBody
        : rawBody instanceof Buffer
          ? rawBody.toString('utf-8')
          : JSON.stringify(req.body ?? {});

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${bodyStr}`)
      .digest('hex');

    try {
      const a = Buffer.from(signature, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException('Invalid telephony ingest signature');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid telephony ingest signature');
    }
    return true;
  }

  private verifyLegacy(header: string, secret: string): boolean {
    try {
      const a = Buffer.from(header);
      const b = Buffer.from(secret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException('Invalid telephony ingest secret');
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      throw new ForbiddenException('Invalid telephony ingest secret');
    }
    return true;
  }
}
