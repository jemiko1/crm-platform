import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ClientChatsObservabilityService } from '../services/clientchats-observability.service';
import { ClientChatChannelType } from '@prisma/client';

@Controller('v1/clientchats')
@UseGuards(JwtAuthGuard)
export class ClientChatsAdminController {
  constructor(
    private readonly observability: ClientChatsObservabilityService,
  ) {}

  @Get('status')
  getStatus() {
    return this.observability.getStatus();
  }

  @Get('webhook-failures')
  getWebhookFailures(
    @Query('limit') limit?: string,
    @Query('channelType') channelType?: ClientChatChannelType,
  ) {
    return this.observability.getWebhookFailures(
      limit ? parseInt(limit, 10) : 50,
      channelType,
    );
  }
}
