import {
  Controller,
  Get,
  Put,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminOnlyGuard } from "../common/guards/admin-only.guard";
import { PositionPermissionGuard } from "../common/guards/position-permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { EmailConfigService } from "../notifications/email-config.service";
import { SmsConfigService } from "../notifications/sms-config.service";
import { NotificationTemplatesService } from "../notifications/notification-templates.service";
import { NotificationLogService } from "../notifications/notification-log.service";
import { NotificationService } from "../notifications/notification.service";
import {
  UpdateEmailConfigDto,
  UpdateSmsConfigDto,
  CreateTemplateDto,
  UpdateTemplateDto,
  SendNotificationDto,
} from "../notifications/dto";
import { NotificationType } from "@prisma/client";

@ApiTags("Admin Notifications")
@Controller("v1/admin/notifications")
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class NotificationsController {
  constructor(
    private readonly emailConfig: EmailConfigService,
    private readonly smsConfig: SmsConfigService,
    private readonly templatesService: NotificationTemplatesService,
    private readonly logService: NotificationLogService,
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Email Config ──────────────────────────────────────────

  @Get("email-config")
  @ApiOperation({ summary: "Get email (SMTP/IMAP) configuration" })
  getEmailConfig() {
    return this.emailConfig.getConfigMasked();
  }

  @Put("email-config")
  @ApiOperation({ summary: "Create or update email configuration" })
  updateEmailConfig(@Body() dto: UpdateEmailConfigDto) {
    return this.emailConfig.upsertConfig(dto);
  }

  @Post("email-config/test")
  @ApiOperation({ summary: "Test SMTP and IMAP connections" })
  async testEmailConfig() {
    const [smtp, imap] = await Promise.all([
      this.emailConfig.testSmtpConnection(),
      this.emailConfig.testImapConnection(),
    ]);
    return { smtp, imap };
  }

  // ─── SMS Config ────────────────────────────────────────────

  @Get("sms-config")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Get SMS provider configuration" })
  getSmsConfig() {
    return this.smsConfig.getConfigMasked();
  }

  @Put("sms-config")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Create or update SMS configuration" })
  updateSmsConfig(@Body() dto: UpdateSmsConfigDto) {
    return this.smsConfig.upsertConfig(dto);
  }

  @Post("sms-config/test")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Send a test SMS" })
  testSmsConfig(@Body() body: { testNumber: string }) {
    return this.smsConfig.testConnection(body.testNumber);
  }

  @Get("sms-config/balance")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Get Sender.ge account balance" })
  getSmsBalance() {
    return this.smsConfig.getBalance();
  }

  @Get("sms-logs")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Get SMS-only notification logs" })
  getSmsLogs(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
  ) {
    return this.logService.findSmsLogs({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
  }

  @Get("sms-logs/stats")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Get SMS delivery statistics" })
  getSmsStats() {
    return this.logService.getSmsStats();
  }

  @Post("sms-logs/:id/check-delivery")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Check delivery status for a specific SMS" })
  checkSmsDelivery(@Param("id") id: string) {
    return this.smsConfig.checkDeliveryStatus(id);
  }

  @Post("sms-logs/refresh-deliveries")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @ApiOperation({ summary: "Refresh delivery status for all pending SMS" })
  refreshDeliveries() {
    return this.smsConfig.refreshAllPendingDeliveries();
  }

  // ─── Notification Templates ────────────────────────────────

  @Get("templates")
  @ApiOperation({ summary: "List all notification templates" })
  getTemplates() {
    return this.templatesService.findAll();
  }

  @Post("templates")
  @ApiOperation({ summary: "Create a notification template" })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch("templates/:id")
  @ApiOperation({ summary: "Update a notification template" })
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete("templates/:id")
  @ApiOperation({ summary: "Delete a notification template" })
  deleteTemplate(@Param("id") id: string) {
    return this.templatesService.delete(id);
  }

  // ─── Send Notification ─────────────────────────────────────

  @Post("send")
  @ApiOperation({ summary: "Send email/SMS notification to selected employees" })
  sendNotification(@Body() dto: SendNotificationDto) {
    return this.notificationService.send(dto);
  }

  // ─── Logs ──────────────────────────────────────────────────

  @Get("logs")
  @ApiOperation({ summary: "Get paginated notification logs" })
  getLogs(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("type") type?: NotificationType,
  ) {
    return this.logService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      type,
    });
  }
}
