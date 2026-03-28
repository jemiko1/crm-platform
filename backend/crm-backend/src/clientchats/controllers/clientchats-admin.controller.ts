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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ClientChatsObservabilityService } from '../services/clientchats-observability.service';
import { ClientChatsCoreService } from '../services/clientchats-core.service';
import { ClientChatsAnalyticsService } from '../services/clientchats-analytics.service';
import { TelegramWebhookService } from '../services/telegram-webhook.service';
import { ViberWebhookService } from '../services/viber-webhook.service';
import { FacebookWebhookService } from '../services/facebook-webhook.service';
import { WhatsAppWebhookService } from '../services/whatsapp-webhook.service';
import { ClientChatChannelType } from '@prisma/client';
import { UpdateChannelAccountDto } from '../dto/update-channel-account.dto';
import { CreateTestWhatsAppConversationDto } from '../dto/create-test-whatsapp-conversation.dto';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';

@ApiTags('ClientChatsAdmin')
@Controller('v1/clientchats')
@UseGuards(JwtAuthGuard)
export class ClientChatsAdminController {
  constructor(
    private readonly observability: ClientChatsObservabilityService,
    private readonly core: ClientChatsCoreService,
    private readonly analytics: ClientChatsAnalyticsService,
    private readonly telegramWebhook: TelegramWebhookService,
    private readonly viberWebhook: ViberWebhookService,
    private readonly facebookWebhook: FacebookWebhookService,
    private readonly whatsappWebhook: WhatsAppWebhookService,
  ) {}

  @Get('status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Client chats integration status', ok: 'Channel and webhook health snapshot', permission: true })
  getStatus() {
    return this.observability.getStatus();
  }

  @Get('webhook-failures')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({
    summary: 'Recent webhook processing failures',
    ok: 'Failure log rows',
    permission: true,
    queries: [
      { name: 'limit', description: 'Max rows' },
      { name: 'channelType', description: 'Filter by channel enum' },
    ],
  })
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
  @Doc({
    summary: 'Channel account configuration',
    ok: 'All channel accounts and metadata',
    permission: true,
  })
  getChannelAccountsConfig() {
    return this.core.getChannelAccountsConfig();
  }

  @Put('channel-accounts/:channelType')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({
    summary: 'Update channel account config',
    ok: 'Updated account',
    permission: true,
    notFound: true,
    bodyType: UpdateChannelAccountDto,
    params: [{ name: 'channelType', description: 'ClientChatChannelType enum value' }],
  })
  updateChannelAccountConfig(
    @Param('channelType') channelType: ClientChatChannelType,
    @Body() dto: UpdateChannelAccountDto,
  ) {
    return this.core.updateChannelAccountConfig(channelType, {
      name: dto.name,
      metadata: dto.metadata,
      status: dto.status,
    });
  }

  // ── Telegram webhook (register, status) ─────────────────────

  @Get('telegram/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Telegram getWebhookInfo', ok: 'Telegram API webhook status', permission: true })
  getTelegramWebhookStatus() {
    return this.telegramWebhook.getWebhookInfo();
  }

  @Post('telegram/register-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Register Telegram webhook URL', ok: 'Telegram API result', permission: true })
  registerTelegramWebhook() {
    return this.telegramWebhook.registerWebhook();
  }

  @Post('telegram/delete-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Delete Telegram webhook', ok: 'Telegram API result', permission: true })
  deleteTelegramWebhook() {
    return this.telegramWebhook.deleteWebhook();
  }

  // ── Viber webhook (register, status) ─────────────────────

  @Get('viber/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Viber webhook status', ok: 'Viber API info', permission: true })
  getViberWebhookStatus() {
    return this.viberWebhook.getWebhookInfo();
  }

  @Post('viber/register-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Register Viber webhook', ok: 'Viber API result', permission: true })
  registerViberWebhook() {
    return this.viberWebhook.registerWebhook();
  }

  @Post('viber/delete-webhook')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Delete Viber webhook', ok: 'Viber API result', permission: true })
  deleteViberWebhook() {
    return this.viberWebhook.deleteWebhook();
  }

  // ── Facebook webhook (status only — webhook set in Dev Console) ─────

  @Get('facebook/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'Facebook webhook subscription status', ok: 'Meta API status', permission: true })
  getFacebookWebhookStatus() {
    return this.facebookWebhook.getWebhookStatus();
  }

  // ── WhatsApp webhook (status only — webhook set in Meta Dev Console) ─────

  @Get('whatsapp/webhook-status')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({ summary: 'WhatsApp webhook subscription status', ok: 'Meta API status', permission: true })
  getWhatsAppWebhookStatus() {
    return this.whatsappWebhook.getWebhookStatus();
  }

  @Post('whatsapp/create-test-conversation')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({
    summary: 'Create test WhatsApp conversation',
    ok: 'Test conversation metadata',
    permission: true,
    bodyType: CreateTestWhatsAppConversationDto,
  })
  createTestWhatsAppConversation(
    @Body() dto: CreateTestWhatsAppConversationDto,
  ) {
    return this.core.createTestWhatsAppConversation(dto.phoneNumber);
  }

  // ── Analytics ─────────────────────────────────────────

  @Get('analytics/overview')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({
    summary: 'Client chats analytics overview',
    ok: 'Aggregate KPIs',
    permission: true,
    queries: [
      { name: 'from', description: 'ISO start date' },
      { name: 'to', description: 'ISO end date' },
    ],
  })
  getAnalyticsOverview(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getOverview(from, to);
  }

  @Get('analytics/by-channel')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({
    summary: 'Analytics grouped by channel',
    ok: 'Per-channel metrics',
    permission: true,
    queries: [
      { name: 'from', description: 'ISO start date' },
      { name: 'to', description: 'ISO end date' },
    ],
  })
  getAnalyticsByChannel(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getByChannel(from, to);
  }

  @Get('analytics/by-agent')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('client_chats_config.access')
  @Doc({
    summary: 'Analytics grouped by agent',
    ok: 'Per-agent metrics',
    permission: true,
    queries: [
      { name: 'from', description: 'ISO start date' },
      { name: 'to', description: 'ISO end date' },
    ],
  })
  getAnalyticsByAgent(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.getByAgent(from, to);
  }
}
