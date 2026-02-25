import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TelephonyStatsService } from '../services/telephony-stats.service';
import { QueryStatsDto } from '../dto/query-stats.dto';

@ApiTags('Telephony')
@Controller('v1/telephony/stats')
@UseGuards(JwtAuthGuard)
export class TelephonyStatsController {
  constructor(private readonly statsService: TelephonyStatsService) {}

  @Get('overview')
  async getOverview(@Query() query: QueryStatsDto) {
    return this.statsService.getOverview(query);
  }

  @Get('agents')
  async getAgentStats(@Query() query: QueryStatsDto) {
    return this.statsService.getAgentStats(query);
  }

  @Get('queues')
  async getQueueStats(@Query() query: QueryStatsDto) {
    return this.statsService.getQueueStats(query);
  }
}
