import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { TelephonyLiveService } from '../services/telephony-live.service';

@ApiTags('Telephony')
@Controller('v1/telephony')
@UseGuards(JwtAuthGuard)
export class TelephonyLiveController {
  constructor(private readonly liveService: TelephonyLiveService) {}

  @Get('queues/live')
  async getQueueLiveState() {
    return this.liveService.getQueueLiveState();
  }

  @Get('agents/live')
  async getAgentLiveState() {
    return this.liveService.getAgentLiveState();
  }
}
