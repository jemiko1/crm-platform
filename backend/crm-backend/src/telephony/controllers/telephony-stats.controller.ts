import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { TelephonyStatsService } from '../services/telephony-stats.service';
import { QueryStatsDto } from '../dto/query-stats.dto';
import { QueryBreakdownDto } from '../dto/query-breakdown.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony/stats')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('call_center.statistics')
export class TelephonyStatsController {
  constructor(private readonly statsService: TelephonyStatsService) {}

  // Cache-Control: no-store on every live-data list endpoint — see
  // CLAUDE.md Silent Override Risk #23. Express's default weak ETag
  // would otherwise let the browser 304-cache an empty window indefinitely.

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Call center overview stats', ok: 'KPI rollup for period' })
  async getOverview(@Query() query: QueryStatsDto) {
    return this.statsService.getOverview(query);
  }

  @Get('agents')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Per-agent statistics', ok: 'Agent metrics' })
  async getAgentStats(@Query() query: QueryStatsDto) {
    return this.statsService.getAgentStats(query);
  }

  @Get('queues')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Per-queue statistics', ok: 'Queue metrics' })
  async getQueueStats(@Query() query: QueryStatsDto) {
    return this.statsService.getQueueStats(query);
  }

  @Get('breakdown')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Dimensional breakdown of calls', ok: 'Breakdown series' })
  async getBreakdown(@Query() query: QueryBreakdownDto) {
    return this.statsService.getBreakdown(query);
  }

  @Get('overview-extended')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Extended overview metrics', ok: 'Richer KPI rollup' })
  async getOverviewExtended(@Query() query: QueryStatsDto) {
    return this.statsService.getOverviewExtended(query);
  }

  @Get('agents-breakdown')
  @Header('Cache-Control', 'no-store')
  @Doc({ summary: 'Agent-level breakdown', ok: 'Per-agent dimensional stats' })
  async getAgentBreakdown(@Query() query: QueryStatsDto) {
    return this.statsService.getAgentBreakdown(query);
  }
}
