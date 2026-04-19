import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatsEventService } from './clientchats-event.service';

@Injectable()
export class QueueScheduleService {
  private readonly logger = new Logger(QueueScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ClientChatsEventService,
  ) {}

  async getWeeklySchedule() {
    const schedules = await this.prisma.clientChatQueueSchedule.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { createdAt: 'asc' }],
    });

    const byDay: Record<number, typeof schedules> = {};
    for (let d = 1; d <= 7; d++) byDay[d] = [];
    for (const s of schedules) {
      byDay[s.dayOfWeek].push(s);
    }
    return byDay;
  }

  async setDaySchedule(dayOfWeek: number, userIds: string[]) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.clientChatQueueSchedule.deleteMany({
        where: { dayOfWeek },
      });

      if (userIds.length === 0) return [];

      return Promise.all(
        userIds.map((userId) =>
          tx.clientChatQueueSchedule.create({
            data: { dayOfWeek, userId },
          }),
        ),
      );
    });

    await this.fanoutQueueChange({ reason: 'setDaySchedule', dayOfWeek });
    return result;
  }

  async setDailyOverride(date: Date, userIds: string[], createdBy: string) {
    const dateOnly = this.toDateOnly(date);
    const result = await this.prisma.clientChatQueueOverride.upsert({
      where: { date: dateOnly },
      create: { date: dateOnly, userIds, createdBy },
      update: { userIds },
    });

    await this.fanoutQueueChange({
      reason: 'setDailyOverride',
      date: dateOnly.toISOString().slice(0, 10),
    });
    return result;
  }

  async getDailyOverride(date: Date) {
    return this.prisma.clientChatQueueOverride.findUnique({
      where: { date: this.toDateOnly(date) },
    });
  }

  async removeDailyOverride(date: Date) {
    let result;
    try {
      result = await this.prisma.clientChatQueueOverride.delete({
        where: { date: this.toDateOnly(date) },
      });
    } catch {
      return null;
    }

    await this.fanoutQueueChange({
      reason: 'removeDailyOverride',
      date: this.toDateOnly(date).toISOString().slice(0, 10),
    });
    return result;
  }

  async getActiveOperatorsToday(): Promise<string[]> {
    const now = new Date();

    const override = await this.getDailyOverride(now);
    if (override) {
      this.logger.debug(
        `Using daily override for ${now.toISOString().slice(0, 10)}: ${override.userIds.length} operators`,
      );
      return override.userIds;
    }

    const jsDay = now.getDay();
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    const schedules = await this.prisma.clientChatQueueSchedule.findMany({
      where: { dayOfWeek },
      select: { userId: true },
    });

    this.logger.debug(
      `Weekly schedule for day ${dayOfWeek}: ${schedules.length} operators`,
    );
    return schedules.map((s) => s.userId);
  }

  /**
   * Emit queue:updated to managers and recompute queue-room membership for
   * all connected operator sockets. Called after any schedule mutation so
   * mid-day changes take effect without requiring operators to reconnect.
   *
   * Failures here are logged but never propagated — the DB write has already
   * succeeded and we don't want a transient socket issue to cause the HTTP
   * request to 500.
   */
  private async fanoutQueueChange(payload: Record<string, unknown>) {
    try {
      this.events.emitQueueUpdated(payload);
    } catch (err) {
      this.logger.warn(
        `emitQueueUpdated failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    try {
      const activeOperatorIds = await this.getActiveOperatorsToday();
      await this.events.refreshQueueMembership(activeOperatorIds);
    } catch (err) {
      this.logger.warn(
        `refreshQueueMembership failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private toDateOnly(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}
