import {
  Controller,
  Get,
  Put,
  Delete,
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
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatStatus } from '@prisma/client';

@Controller('v1/clientchats/queue')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class ClientChatsManagerController {
  constructor(
    private readonly schedule: QueueScheduleService,
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
        status: ClientChatStatus.OPEN,
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
}
