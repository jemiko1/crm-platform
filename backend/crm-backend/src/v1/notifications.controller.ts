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
import { ApiTags } from "@nestjs/swagger";
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
import { Doc } from "../common/openapi/doc-endpoint.decorator";

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
  @Doc({
    summary: "Get email (SMTP/IMAP) configuration",
    ok: "Masked email configuration",
    permission: true,
  })
  getEmailConfig() {
    return this.emailConfig.getConfigMasked();
  }

  @Put("email-config")
  @Doc({
    summary: "Create or update email configuration",
    ok: "Email configuration saved",
    permission: true,
    bodyType: UpdateEmailConfigDto,
  })
  updateEmailConfig(@Body() dto: UpdateEmailConfigDto) {
    return this.emailConfig.upsertConfig(dto);
  }

  @Post("email-config/test")
  @Doc({
    summary: "Test SMTP and IMAP connections",
    ok: "SMTP and IMAP test results",
    permission: true,
  })
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
  @Doc({
    summary: "Get SMS provider configuration",
    ok: "Masked SMS configuration",
    permission: true,
  })
  getSmsConfig() {
    return this.smsConfig.getConfigMasked();
  }

  @Put("sms-config")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @Doc({
    summary: "Create or update SMS configuration",
    ok: "SMS configuration saved",
    permission: true,
    bodyType: UpdateSmsConfigDto,
  })
  updateSmsConfig(@Body() dto: UpdateSmsConfigDto) {
    return this.smsConfig.upsertConfig(dto);
  }

  @Post("sms-config/test")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @Doc({
    summary: "Send a test SMS",
    ok: "Test SMS result",
    permission: true,
  })
  testSmsConfig(@Body() body: { testNumber: string }) {
    return this.smsConfig.testConnection(body.testNumber);
  }

  @Get("sms-config/balance")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @Doc({
    summary: "Get Sender.ge account balance",
    ok: "Account balance",
    permission: true,
  })
  getSmsBalance() {
    return this.smsConfig.getBalance();
  }

  @Get("sms-logs")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @Doc({
    summary: "Get SMS-only notification logs",
    ok: "Paginated SMS logs",
    permission: true,
  })
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
  @Doc({
    summary: "Get SMS delivery statistics",
    ok: "SMS delivery statistics",
    permission: true,
  })
  getSmsStats() {
    return this.logService.getSmsStats();
  }

  @Post("sms-logs/:id/check-delivery")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @Doc({
    summary: "Check delivery status for a specific SMS",
    ok: "Delivery status",
    permission: true,
    notFound: true,
    params: [{ name: "id", description: "SMS log ID" }],
  })
  checkSmsDelivery(@Param("id") id: string) {
    return this.smsConfig.checkDeliveryStatus(id);
  }

  @Post("sms-logs/refresh-deliveries")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission("sms_config.access")
  @Doc({
    summary: "Refresh delivery status for all pending SMS",
    ok: "Refresh result",
    permission: true,
  })
  refreshDeliveries() {
    return this.smsConfig.refreshAllPendingDeliveries();
  }

  // ─── Notification Templates ────────────────────────────────

  @Get("templates")
  @Doc({
    summary: "List all notification templates",
    ok: "Notification templates",
    permission: true,
  })
  getTemplates() {
    return this.templatesService.findAll();
  }

  @Post("templates")
  @Doc({
    summary: "Create a notification template",
    ok: "Created template",
    status: 201,
    permission: true,
    bodyType: CreateTemplateDto,
  })
  createTemplate(@Body() dto: CreateTemplateDto) {
    return this.templatesService.create(dto);
  }

  @Patch("templates/:id")
  @Doc({
    summary: "Update a notification template",
    ok: "Updated template",
    permission: true,
    notFound: true,
    bodyType: UpdateTemplateDto,
    params: [{ name: "id", description: "Template ID" }],
  })
  updateTemplate(@Param("id") id: string, @Body() dto: UpdateTemplateDto) {
    return this.templatesService.update(id, dto);
  }

  @Delete("templates/:id")
  @Doc({
    summary: "Delete a notification template",
    ok: "Template deleted",
    permission: true,
    notFound: true,
    params: [{ name: "id", description: "Template ID" }],
  })
  deleteTemplate(@Param("id") id: string) {
    return this.templatesService.delete(id);
  }

  // ─── Send Notification ─────────────────────────────────────

  @Post("send")
  @Doc({
    summary: "Send email/SMS notification to selected employees",
    ok: "Send result",
    permission: true,
    bodyType: SendNotificationDto,
  })
  sendNotification(@Body() dto: SendNotificationDto) {
    return this.notificationService.send(dto);
  }

  // ─── Logs ──────────────────────────────────────────────────

  @Get("logs")
  @Doc({
    summary: "Get paginated notification logs",
    ok: "Paginated notification logs",
    permission: true,
  })
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
