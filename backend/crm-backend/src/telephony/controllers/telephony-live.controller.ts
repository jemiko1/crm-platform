import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TelephonyLiveService } from '../services/telephony-live.service';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('Telephony')
@Controller('v1/telephony')
@UseGuards(JwtAuthGuard)
export class TelephonyLiveController {
  constructor(private readonly liveService: TelephonyLiveService) {}

  @Get('queues/live')
  @Doc({ summary: 'Live queue state snapshot', ok: 'Queue membership and calls waiting' })
  async getQueueLiveState() {
    return this.liveService.getQueueLiveState();
  }

  @Get('agents/live')
  @Doc({ summary: 'Live agent / extension state', ok: 'Agent availability snapshot' })
  async getAgentLiveState() {
    return this.liveService.getAgentLiveState();
  }
}
