import {
  Controller,
  Get,
  Put,
  Post,
  Query,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ClientChatsObservabilityService } from '../services/clientchats-observability.service';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { TelegramWebhookService } from '../services/telegram-webhook.service';
import { ViberWebhookService } from '../services/viber-webhook.service';
import { FacebookWebhookService } from '../services/facebook-webhook.service';
import { WhatsAppWebhookService } from '../services/whatsapp-webhook.service';
import { ClientChatChannelType } from '@prisma/client';
import { UpdateChannelAccountDto } from '../dto/update-channel-account.dto';

@Controller('v1/clientchats')
@UseGuards(JwtAuthGuard)
export class ClientChatsAdminController {
  constructor(
    private readonly observability: ClientChatsObservabilityService,
    private readonly core: ClientChatsCoreService,
    private readonly telegramWebhook: TelegramWebhookService,
    private readonly viberWebhook: ViberWebhookService,
    private readonly facebookWebhook: FacebookWebhookService,
    private readonly whatsappWebhook: WhatsAppWebhookService,
  ) {}

  @Get('status')
  getStatus() {
    return this.observability.getStatus();
  }

  @Get('webhook-failures')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  getWebhookFailures(
    @Query('limit') limit?: string,
    @Query('channelType') channelType?: ClientChatChannelType,
  ) {
    return this.observability.getWebhookFailures(
      limit ? parseInt(limit, 10) : 50,
      channelType,
    );
  }

  // ── Channel configuration (admin) ──────────────────────────

  @Get('channel-accounts')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  getChannelAccountsConfig() {
    return this.core.getChannelAccountsConfig();
  }

  @Put('channel-accounts/:channelType')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  updateChannelAccountConfig(
    @Param('channelType') channelType: ClientChatChannelType,
    @Body() dto: UpdateChannelAccountDto,
  ) {
    return this.core.updateChannelAccountConfig(channelType, {
      name: dto.name,
      metadata: dto.metadata,
    });
  }

  // ── Telegram webhook (register, status) ─────────────────────

  @Get('telegram/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  getTelegramWebhookStatus() {
    return this.telegramWebhook.getWebhookInfo();
  }

  @Post('telegram/register-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  registerTelegramWebhook() {
    return this.telegramWebhook.registerWebhook();
  }

  @Post('telegram/delete-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  deleteTelegramWebhook() {
    return this.telegramWebhook.deleteWebhook();
  }

  // ── Viber webhook (register, status) ─────────────────────

  @Get('viber/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  getViberWebhookStatus() {
    return this.viberWebhook.getWebhookInfo();
  }

  @Post('viber/register-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  registerViberWebhook() {
    return this.viberWebhook.registerWebhook();
  }

  @Post('viber/delete-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  deleteViberWebhook() {
    return this.viberWebhook.deleteWebhook();
  }

  // ── Facebook webhook (status only — webhook set in Dev Console) ─────

  @Get('facebook/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  getFacebookWebhookStatus() {
    return this.facebookWebhook.getWebhookStatus();
  }

  // ── WhatsApp webhook (status only — webhook set in Meta Dev Console) ─────

  @Get('whatsapp/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  getWhatsAppWebhookStatus() {
    return this.whatsappWebhook.getWebhookStatus();
  }
}
