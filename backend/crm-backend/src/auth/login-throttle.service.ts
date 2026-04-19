import { HttpException, HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Persistent login throttle backed by the `LoginAttempt` table.
 *
 * State survives backend restarts (auto-deploy restarts happen multiple
 * times/week). Two independent windows are evaluated on every login:
 *
 *   - Per-email: ≥ EMAIL_MAX_FAILURES failed attempts in EMAIL_WINDOW_MS
 *     → lock for EMAIL_LOCKOUT_MS measured from the oldest failure in the
 *     window. Targets credential-stuffing against a single account.
 *
 *   - Per-IP: ≥ IP_MAX_FAILURES failed attempts in IP_WINDOW_MS → lock for
 *     IP_LOCKOUT_MS measured from the oldest failure in the window. Catches
 *     spray attacks from a single source across many emails.
 *
 * The controller calls `assertNotLocked(email, ip)` before the password
 * check and records the outcome via `recordFailure` / `recordSuccess`.
 */
@Injectable()
export class LoginThrottleService {
  private readonly logger = new Logger(LoginThrottleService.name);

  // Per-email rules: 5 failures within 5 minutes → lock for 5 minutes.
  private readonly EMAIL_MAX_FAILURES = 5;
  private readonly EMAIL_WINDOW_MS = 5 * 60_000;
  private readonly EMAIL_LOCKOUT_MS = 5 * 60_000;

  // Per-IP rules: 10 failures within 60 seconds → lock for 60 seconds.
  // Spray detection — intentionally shorter window than email rule.
  private readonly IP_MAX_FAILURES = 10;
  private readonly IP_WINDOW_MS = 60_000;
  private readonly IP_LOCKOUT_MS = 60_000;

  // Retention: drop rows older than 30 days (cron cleanup).
  private readonly RETENTION_MS = 30 * 24 * 60 * 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Throws HTTP 429 if the caller's email OR IP is currently locked.
   * Both windows are queried in parallel.
   */
  async assertNotLocked(email: string, ip: string): Promise<void> {
    const key = email.toLowerCase();
    const now = Date.now();

    const emailWindowStart = new Date(now - this.EMAIL_WINDOW_MS);
    const ipWindowStart = new Date(now - this.IP_WINDOW_MS);

    const [emailFails, ipFails] = await Promise.all([
      this.prisma.loginAttempt.findMany({
        where: {
          email: key,
          success: false,
          attemptedAt: { gte: emailWindowStart },
        },
        orderBy: { attemptedAt: "asc" },
        select: { attemptedAt: true },
      }),
      this.prisma.loginAttempt.findMany({
        where: {
          ip,
          success: false,
          attemptedAt: { gte: ipWindowStart },
        },
        orderBy: { attemptedAt: "asc" },
        select: { attemptedAt: true },
      }),
    ]);

    // Per-email lock: oldest failure + lockout window.
    if (emailFails.length >= this.EMAIL_MAX_FAILURES) {
      const oldest = emailFails[0].attemptedAt.getTime();
      const unlockAt = oldest + this.EMAIL_LOCKOUT_MS;
      const remainingMs = unlockAt - now;
      if (remainingMs > 0) {
        this.throw429("email", Math.ceil(remainingMs / 1000));
      }
    }

    // Per-IP lock: oldest failure + lockout window.
    if (ipFails.length >= this.IP_MAX_FAILURES) {
      const oldest = ipFails[0].attemptedAt.getTime();
      const unlockAt = oldest + this.IP_LOCKOUT_MS;
      const remainingMs = unlockAt - now;
      if (remainingMs > 0) {
        this.throw429("ip", Math.ceil(remainingMs / 1000));
      }
    }
  }

  /** Persist a failed attempt. */
  async recordFailure(
    email: string,
    ip: string,
    userAgent?: string | null,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email: email.toLowerCase(),
        ip,
        success: false,
        userAgent: userAgent ?? null,
      },
    });
  }

  /** Persist a successful attempt (useful for audit + dashboards). */
  async recordSuccess(
    email: string,
    ip: string,
    userAgent?: string | null,
  ): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email: email.toLowerCase(),
        ip,
        success: true,
        userAgent: userAgent ?? null,
      },
    });
  }

  /**
   * Nightly cleanup — prevents unbounded growth. Runs every 6 hours.
   */
  @Cron("0 */6 * * *")
  async pruneOldAttempts(): Promise<void> {
    const cutoff = new Date(Date.now() - this.RETENTION_MS);
    try {
      const result = await this.prisma.loginAttempt.deleteMany({
        where: { attemptedAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(
          `Pruned ${result.count} LoginAttempt rows older than ${cutoff.toISOString()}`,
        );
      }
    } catch (err) {
      this.logger.error("Failed to prune LoginAttempt rows", err as Error);
    }
  }

  private throw429(reason: "email" | "ip", retryAfterSeconds: number): never {
    const mins = Math.floor(retryAfterSeconds / 60);
    const secs = retryAfterSeconds % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const message =
      reason === "email"
        ? `Account temporarily locked. Try again in ${timeStr}.`
        : `Too many failed attempts from this network. Try again in ${timeStr}.`;
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message,
        reason,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
