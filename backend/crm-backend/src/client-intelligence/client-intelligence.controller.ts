import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityTimelineService } from './services/activity-timeline.service';
import { IntelligenceService } from './services/intelligence.service';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('ClientIntelligence')
@Controller('v1/client-intelligence')
@UseGuards(JwtAuthGuard)
export class ClientIntelligenceController {
  constructor(
    private readonly timelineService: ActivityTimelineService,
    private readonly intelligenceService: IntelligenceService,
  ) {}

  @Get(':clientCoreId/profile')
  @Doc({
    summary: 'Client intelligence profile rollup',
    ok: 'Profile metrics for the client',
    notFound: true,
    params: [{ name: 'clientCoreId', description: 'Client core ID', type: 'number' }],
    queries: [{ name: 'periodDays', description: 'Lookback window in days', required: false }],
  })
  getProfile(
    @Param('clientCoreId', ParseIntPipe) clientCoreId: number,
    @Query('periodDays', new DefaultValuePipe(180), ParseIntPipe)
    periodDays: number,
  ) {
    return this.intelligenceService.getProfile(clientCoreId, periodDays);
  }

  @Get(':clientCoreId/timeline')
  @Doc({
    summary: 'Activity timeline for client',
    ok: 'Chronological activity events',
    notFound: true,
    params: [{ name: 'clientCoreId', description: 'Client core ID', type: 'number' }],
    queries: [
      { name: 'limit', description: 'Max rows' },
      { name: 'offset', description: 'Offset for pagination' },
    ],
  })
  getTimeline(
    @Param('clientCoreId', ParseIntPipe) clientCoreId: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.timelineService.getTimeline(clientCoreId, limit, offset);
  }
}
