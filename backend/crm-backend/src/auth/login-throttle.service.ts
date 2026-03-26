import { Injectable } from "@nestjs/common";

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
}

@Injectable()
export class LoginThrottleService {
  private readonly attempts = new Map<string, AttemptRecord>();
  private readonly MAX_ATTEMPTS = 5;
  private readonly LOCKOUT_MS = 5 * 60_000;

  /**
   * Returns null if not locked, or the number of seconds remaining if locked.
   */
  getLockedSeconds(email: string): number | null {
    const key = email.toLowerCase();
    const record = this.attempts.get(key);
    if (!record?.lockedUntil) return null;

    const remaining = record.lockedUntil - Date.now();
    if (remaining <= 0) {
      this.attempts.delete(key);
      return null;
    }
    return Math.ceil(remaining / 1000);
  }

  /**
   * Record a failed login attempt. Returns remaining attempts (0 = now locked).
   */
  recordFailure(email: string): number {
    const key = email.toLowerCase();
    const record = this.attempts.get(key) ?? { count: 0, lockedUntil: null };

    record.count += 1;
    const remaining = this.MAX_ATTEMPTS - record.count;

    if (remaining <= 0) {
      record.lockedUntil = Date.now() + this.LOCKOUT_MS;
    }

    this.attempts.set(key, record);
    return Math.max(0, remaining);
  }

  recordSuccess(email: string): void {
    this.attempts.delete(email.toLowerCase());
  }
}
