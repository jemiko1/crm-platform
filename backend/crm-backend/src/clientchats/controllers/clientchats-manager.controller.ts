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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { QueueScheduleService } from '../services/queue-schedule.service';
import { EscalationService } from '../services/escalation.service';
import { ClientChatsEventService } from '../services/clientchats-event.service';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatStatus } from '@prisma/client';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('ClientChatsManager')
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
  @Doc({
    summary: "Today's queue operators and overrides",
    ok: 'Operators with open chat counts',
    permission: true,
  })
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
  @Doc({ summary: 'Weekly queue schedule', ok: 'Day → operator IDs', permission: true })
  getWeeklySchedule() {
    return this.schedule.getWeeklySchedule();
  }

  @Put('schedule/:dayOfWeek')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Set operators for a weekday (1–7)',
    ok: 'Updated schedule row',
    permission: true,
    badRequest: true,
    params: [{ name: 'dayOfWeek', description: '1=Monday … 7=Sunday' }],
  })
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
  @Doc({
    summary: 'Set daily queue override',
    ok: 'Override saved',
    permission: true,
    badRequest: true,
  })
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
  @Doc({
    summary: 'Remove daily override',
    ok: 'Override cleared',
    permission: true,
    params: [{ name: 'date', description: 'Date key for override' }],
  })
  removeDailyOverride(@Param('date') date: string) {
    return this.schedule.removeDailyOverride(new Date(date));
  }

  // ── Escalation config ──────────────────────────────────

  @Get('escalation-config')
  @RequirePermission('client_chats.manage')
  @Doc({ summary: 'SLA / escalation configuration', ok: 'Escalation config row', permission: true })
  getEscalationConfig() {
    return this.escalation.getConfig();
  }

  @Put('escalation-config')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Update escalation configuration',
    ok: 'Updated config',
    permission: true,
  })
  async updateEscalationConfig(
    @Body()
    body: {
      firstResponseTimeoutMins?: number;
      reassignAfterMins?: number;
      postReplyTimeoutMins?: number;
      postReplyReassignAfterMins?: number;
      notifyManagerOnEscalation?: boolean;
    },
  ) {
    try {
      return await this.escalation.updateConfig(body);
    } catch (err) {
      // The service throws plain Error with a descriptive message on
      // validation failure; surface that as a 400 so the admin UI can
      // show the specific field that's invalid rather than a generic 500.
      const msg = err instanceof Error ? err.message : 'Invalid config';
      throw new BadRequestException(msg);
    }
  }

  @Get('escalation-events')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Recent escalation events',
    ok: 'Event log',
    permission: true,
    queries: [{ name: 'limit', description: 'Max rows' }],
  })
  getEscalationEvents(@Query('limit') limit?: string) {
    return this.escalation.getRecentEvents(
      limit ? parseInt(limit, 10) : 50,
    );
  }

  // ── Live status dashboard ──────────────────────────────

  @Get('live-status')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Live queue dashboard',
    ok: 'Operators, queue stats, escalations',
    permission: true,
  })
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

    // Bug A1 fix (live-status version): response time is measured from the
    // first non-system inbound message, not from conversation createdAt.
    // See `ClientChatsAnalyticsService` for the full rationale — the web
    // widget's "[Chat started]" placeholder would otherwise inflate times.
    const since24h = new Date(Date.now() - 24 * 60 * 60_000);
    const responseTimeData =
      operatorIds.length > 0
        ? await this.prisma.$queryRaw<
            { assignedUserId: string; clockStart: Date; firstResponseAt: Date }[]
          >`
            SELECT c."assignedUserId",
                   COALESCE(
                     (SELECT MIN(m."sentAt")
                      FROM "ClientChatMessage" m
                      WHERE m."conversationId" = c.id
                        AND m."direction" = 'IN'
                        AND m."text" <> '[Chat started]'),
                     c."createdAt"
                   ) AS "clockStart",
                   c."firstResponseAt" AS "firstResponseAt"
            FROM "ClientChatConversation" c
            WHERE c."assignedUserId" = ANY (${operatorIds})
              AND c."firstResponseAt" IS NOT NULL
              AND c."createdAt" >= ${since24h}
          `
        : [];

    const avgResponseMap = new Map<string, number>();
    const grouped = new Map<string, number[]>();
    for (const r of responseTimeData) {
      if (!r.assignedUserId || !r.firstResponseAt) continue;
      const mins = Math.max(
        0,
        (new Date(r.firstResponseAt).getTime() -
          new Date(r.clockStart).getTime()) /
          60_000,
      );
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

  @Delete('conversations/:id')
  @RequirePermission('client_chats.delete')
  @Doc({
    summary: 'Hard-delete conversation (manager)',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  deleteConversation(@Param('id') id: string) {
    return this.core.deleteConversation(id);
  }

  @Post('conversations/:id/pause-operator')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Pause assigned operator on conversation',
    ok: 'Pause state',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  pauseOperator(@Param('id') id: string) {
    return this.core.pauseOperator(id);
  }

  @Post('conversations/:id/unpause-operator')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Resume operator on conversation',
    ok: 'Active state',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  unpauseOperator(@Param('id') id: string) {
    return this.core.unpauseOperator(id);
  }

  @Post('conversations/:id/reopen')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Reopen closed conversation',
    ok: 'Conversation reopened',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  reopenConversation(
    @Param('id') id: string,
    @Body() body: { keepOperator?: boolean },
  ) {
    return this.core.approveReopen(id, body.keepOperator ?? false);
  }

  @Post('conversations/:id/approve-reopen')
  @RequirePermission('client_chats.manage')
  @Doc({
    summary: 'Approve pending reopen request',
    ok: 'Conversation reopened',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Conversation UUID' }],
  })
  approveReopen(
    @Param('id') id: string,
    @Body() body: { keepOperator?: boolean },
  ) {
    return this.core.approveReopen(id, body.keepOperator ?? false);
  }
}
