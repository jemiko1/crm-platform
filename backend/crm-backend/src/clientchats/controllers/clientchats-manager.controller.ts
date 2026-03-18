import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Param,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { QueueScheduleService } from '../services/queue-schedule.service';
import { EscalationService } from '../services/escalation.service';
import { ClientChatsEventService } from '../services/clientchats-event.service';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatStatus } from '@prisma/client';

@Controller('v1/clientchats/queue')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class ClientChatsManagerController {
  constructor(
    private readonly schedule: QueueScheduleService,
    private readonly escalation: EscalationService,
    private readonly events: ClientChatsEventService,
    private readonly core: ClientChatsCoreService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('today')
  @RequirePermission('client_chats.manage')
  async getTodayQueue() {
    const operatorIds = await this.schedule.getActiveOperatorsToday();

    if (operatorIds.length === 0) {
      return { operators: [], override: null };
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: operatorIds } },
      select: {
        id: true,
        email: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    const chatCounts = await this.prisma.clientChatConversation.groupBy({
      by: ['assignedUserId'],
      where: {
        assignedUserId: { in: operatorIds },
        status: ClientChatStatus.LIVE,
      },
      _count: true,
    });
    const countMap = new Map(
      chatCounts.map((c) => [c.assignedUserId, c._count]),
    );

    const override = await this.schedule.getDailyOverride(new Date());

    return {
      operators: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.employee
          ? `${u.employee.firstName} ${u.employee.lastName}`.trim()
          : u.email,
        openChats: countMap.get(u.id) ?? 0,
      })),
      override: override
        ? { date: override.date, userIds: override.userIds }
        : null,
    };
  }

  @Get('schedule')
  @RequirePermission('client_chats.manage')
  getWeeklySchedule() {
    return this.schedule.getWeeklySchedule();
  }

  @Put('schedule/:dayOfWeek')
  @RequirePermission('client_chats.manage')
  setDaySchedule(
    @Param('dayOfWeek') dayParam: string,
    @Body() body: { userIds: string[] },
  ) {
    const dayOfWeek = parseInt(dayParam, 10);
    if (isNaN(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
      throw new BadRequestException('dayOfWeek must be 1-7 (Mon-Sun)');
    }
    if (!Array.isArray(body.userIds)) {
      throw new BadRequestException('userIds must be an array');
    }
    return this.schedule.setDaySchedule(dayOfWeek, body.userIds);
  }

  @Put('override')
  @RequirePermission('client_chats.manage')
  setDailyOverride(
    @Body() body: { date: string; userIds: string[] },
    @Req() req: any,
  ) {
    if (!body.date) {
      throw new BadRequestException('date is required');
    }
    if (!Array.isArray(body.userIds)) {
      throw new BadRequestException('userIds must be an array');
    }
    return this.schedule.setDailyOverride(
      new Date(body.date),
      body.userIds,
      req.user.id,
    );
  }

  @Delete('override/:date')
  @RequirePermission('client_chats.manage')
  removeDailyOverride(@Param('date') date: string) {
    return this.schedule.removeDailyOverride(new Date(date));
  }

  // ── Escalation config ──────────────────────────────────

  @Get('escalation-config')
  @RequirePermission('client_chats.manage')
  getEscalationConfig() {
    return this.escalation.getConfig();
  }

  @Put('escalation-config')
  @RequirePermission('client_chats.manage')
  updateEscalationConfig(
    @Body()
    body: {
      firstResponseTimeoutMins?: number;
      reassignAfterMins?: number;
      notifyManagerOnEscalation?: boolean;
    },
  ) {
    return this.escalation.updateConfig(body);
  }

  @Get('escalation-events')
  @RequirePermission('client_chats.manage')
  getEscalationEvents(@Query('limit') limit?: string) {
    return this.escalation.getRecentEvents(
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ── Live status dashboard ──────────────────────────────

  @Get('live-status')
  @RequirePermission('client_chats.manage')
  async getLiveStatus() {
    const operatorIds = await this.schedule.getActiveOperatorsToday();

    const users = operatorIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: operatorIds } },
          select: {
            id: true,
            email: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        })
      : [];

    const chatCounts = operatorIds.length > 0
      ? await this.prisma.clientChatConversation.groupBy({
          by: ['assignedUserId'],
          where: {
            assignedUserId: { in: operatorIds },
            status: ClientChatStatus.LIVE,
          },
          _count: true,
        })
      : [];
    const countMap = new Map(
      chatCounts.map((c) => [c.assignedUserId, c._count]),
    );

    const responseTimeData = operatorIds.length > 0
      ? await this.prisma.clientChatConversation.findMany({
          where: {
            assignedUserId: { in: operatorIds },
            firstResponseAt: { not: null },
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) },
          },
          select: { assignedUserId: true, createdAt: true, firstResponseAt: true },
        })
      : [];

    const avgResponseMap = new Map<string, number>();
    const grouped = new Map<string, number[]>();
    for (const r of responseTimeData) {
      if (!r.assignedUserId || !r.firstResponseAt) continue;
      const mins =
        (new Date(r.firstResponseAt).getTime() -
          new Date(r.createdAt).getTime()) /
        60_000;
      const arr = grouped.get(r.assignedUserId) ?? [];
      arr.push(mins);
      grouped.set(r.assignedUserId, arr);
    }
    for (const [uid, times] of grouped) {
      avgResponseMap.set(
        uid,
        Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      );
    }

    const onlineUserIds = this.events.getConnectedAgentIds?.() ?? [];

    const activeOperators = users.map((u) => ({
      userId: u.id,
      name: u.employee
        ? `${u.employee.firstName} ${u.employee.lastName}`.trim()
        : u.email,
      email: u.email,
      openChats: countMap.get(u.id) ?? 0,
      avgResponseMins: avgResponseMap.get(u.id) ?? null,
      isOnline: onlineUserIds.includes(u.id),
    }));

    const escalationConfig = await this.escalation.getConfig();
    const slaThresholdMs =
      escalationConfig.firstResponseTimeoutMins * 60_000;

    const [totalOpen, unassigned, pastSLACount] = await Promise.all([
      this.prisma.clientChatConversation.count({
        where: { status: ClientChatStatus.LIVE },
      }),
      this.prisma.clientChatConversation.count({
        where: {
          status: ClientChatStatus.LIVE,
          assignedUserId: null,
        },
      }),
      this.prisma.clientChatConversation.count({
        where: {
          status: ClientChatStatus.LIVE,
          firstResponseAt: null,
          lastMessageAt: {
            lt: new Date(Date.now() - slaThresholdMs),
          },
        },
      }),
    ]);

    const openConvs = await this.prisma.clientChatConversation.findMany({
      where: {
        status: ClientChatStatus.LIVE,
        assignedUserId: { not: null },
        firstResponseAt: null,
      },
      select: { lastMessageAt: true },
    });
    const waitTimes = openConvs
      .filter((c) => c.lastMessageAt)
      .map(
        (c) =>
          (Date.now() - new Date(c.lastMessageAt!).getTime()) / 60_000,
      );
    const avgWaitMins =
      waitTimes.length > 0
        ? Math.round(
            waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length,
          )
        : 0;

    const recentEscalations = await this.escalation.getRecentEvents(10);

    return {
      activeOperators,
      queueStats: {
        totalOpen,
        unassigned,
        pastSLA: pastSLACount,
        avgWaitMins,
      },
      recentEscalations,
    };
  }

  // ── Manager chat controls ─────────────────────────────

  @Post('conversations/:id/pause-operator')
  @RequirePermission('client_chats.manage')
  pauseOperator(@Param('id') id: string) {
    return this.core.pauseOperator(id);
  }

  @Post('conversations/:id/unpause-operator')
  @RequirePermission('client_chats.manage')
  unpauseOperator(@Param('id') id: string) {
    return this.core.unpauseOperator(id);
  }

  @Post('conversations/:id/reopen')
  @RequirePermission('client_chats.manage')
  reopenConversation(
    @Param('id') id: string,
    @Body() body: { keepOperator?: boolean },
  ) {
    return this.core.approveReopen(id, body.keepOperator ?? false);
  }

  @Post('conversations/:id/approve-reopen')
  @RequirePermission('client_chats.manage')
  approveReopen(
    @Param('id') id: string,
    @Body() body: { keepOperator?: boolean },
  ) {
    return this.core.approveReopen(id, body.keepOperator ?? false);
  }
}
