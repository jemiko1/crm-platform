import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivityTimelineService } from './services/activity-timeline.service';
import { IntelligenceService } from './services/intelligence.service';

@Controller('v1/client-intelligence')
@UseGuards(JwtAuthGuard)
export class ClientIntelligenceController {
  constructor(
    private readonly timelineService: ActivityTimelineService,
    private readonly intelligenceService: IntelligenceService,
  ) {}

  @Get(':clientCoreId/profile')
  getProfile(
    @Param('clientCoreId', ParseIntPipe) clientCoreId: number,
    @Query('periodDays', new DefaultValuePipe(180), ParseIntPipe)
    periodDays: number,
  ) {
    return this.intelligenceService.getProfile(clientCoreId, periodDays);
  }

  @Get(':clientCoreId/timeline')
  getTimeline(
    @Param('clientCoreId', ParseIntPipe) clientCoreId: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.timelineService.getTimeline(clientCoreId, limit, offset);
  }
}
