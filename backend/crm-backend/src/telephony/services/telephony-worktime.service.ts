import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WorktimeConfig } from '../types/telephony.types';

@Injectable()
export class TelephonyWorktimeService {
  private readonly logger = new Logger(TelephonyWorktimeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async isWithinWorktime(queueId: string, timestamp: Date): Promise<boolean> {
    const config = await this.getWorktimeConfig(queueId);
    if (!config) return true; // no config means always open

    return this.checkWithinWindows(timestamp, config);
  }

  async nextWorktimeStart(queueId: string, after: Date): Promise<Date> {
    const config = await this.getWorktimeConfig(queueId);
    if (!config) return after; // no config means always open

    return this.findNextWindowStart(after, config);
  }

  checkWithinWindows(timestamp: Date, config: WorktimeConfig): boolean {
    const localTime = this.toTimezone(timestamp, config.timezone);
    const dayOfWeek = localTime.getDay();
    const timeStr = this.formatTime(localTime);

    return config.windows.some(
      (w) => w.day === dayOfWeek && timeStr >= w.start && timeStr < w.end,
    );
  }

  findNextWindowStart(after: Date, config: WorktimeConfig): Date {
    if (config.windows.length === 0) return after;

    const sorted = [...config.windows].sort((a, b) =>
      a.day !== b.day ? a.day - b.day : a.start.localeCompare(b.start),
    );

    const localAfter = this.toTimezone(after, config.timezone);
    const currentDay = localAfter.getDay();
    const currentTime = this.formatTime(localAfter);

    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
      const checkDay = (currentDay + dayOffset) % 7;

      for (const window of sorted) {
        if (window.day !== checkDay) continue;

        if (dayOffset === 0 && window.start <= currentTime) {
          if (window.end > currentTime) {
            return after; // we're inside this window
          }
          continue; // this window has passed today
        }

        // Calculate delta in the config timezone, then apply to original UTC time.
        // This avoids local-TZ contamination from setHours/setDate.
        const [hours, minutes] = window.start.split(':').map(Number);
        const targetLocal = new Date(
          localAfter.getFullYear(),
          localAfter.getMonth(),
          localAfter.getDate() + dayOffset,
          hours,
          minutes,
          0,
          0,
        );
        const deltaMs = targetLocal.getTime() - localAfter.getTime();
        return new Date(after.getTime() + deltaMs);
      }
    }

    // Fallback: first window of next week
    const firstWindow = sorted[0];
    const daysUntil = ((firstWindow.day - currentDay + 7) % 7) || 7;
    const [hours, minutes] = firstWindow.start.split(':').map(Number);
    const targetLocal = new Date(
      localAfter.getFullYear(),
      localAfter.getMonth(),
      localAfter.getDate() + daysUntil,
      hours,
      minutes,
      0,
      0,
    );
    const deltaMs = targetLocal.getTime() - localAfter.getTime();
    return new Date(after.getTime() + deltaMs);
  }

  private async getWorktimeConfig(queueId: string): Promise<WorktimeConfig | null> {
    const queue = await this.prisma.telephonyQueue.findUnique({
      where: { id: queueId },
      select: { worktimeConfig: true },
    });

    if (!queue?.worktimeConfig) return null;

    const raw = queue.worktimeConfig as unknown;
    if (typeof raw !== 'object' || raw === null) return null;

    const config = raw as WorktimeConfig;
    if (!config.timezone || !Array.isArray(config.windows)) return null;

    return config;
  }

  /**
   * Simple timezone offset conversion.
   * In production, use date-fns-tz or Intl.DateTimeFormat for DST handling.
   */
  private toTimezone(date: Date, timezone: string): Date {
    const str = date.toLocaleString('en-US', { timeZone: timezone });
    return new Date(str);
  }

  private fromTimezone(localDate: Date, timezone: string): Date {
    const utcStr = localDate.toLocaleString('en-US', { timeZone: 'UTC' });
    const tzStr = localDate.toLocaleString('en-US', { timeZone: timezone });
    const diff = new Date(utcStr).getTime() - new Date(tzStr).getTime();
    return new Date(localDate.getTime() + diff);
  }

  private formatTime(date: Date): string {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
