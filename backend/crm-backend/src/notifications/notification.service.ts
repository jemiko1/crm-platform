import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType } from "@prisma/client";
import { EmailSenderService } from "./email.service";
import { SmsSenderService } from "./sms.service";
import { NotificationTemplatesService } from "./notification-templates.service";
import { NotificationLogService } from "./notification-log.service";
import { SendNotificationDto } from "./dto";

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSender: EmailSenderService,
    private readonly smsSender: SmsSenderService,
    private readonly templates: NotificationTemplatesService,
    private readonly logs: NotificationLogService,
  ) {}

  /**
   * Send notification to a list of employees.
   * Can use a template (by code) or a raw subject+body.
   */
  async send(dto: SendNotificationDto) {
    let subject = dto.subject ?? "";
    let body = dto.body ?? "";

    if (dto.templateCode) {
      const tpl = await this.templates.findByCode(dto.templateCode);
      subject = tpl.subject ? this.templates.renderTemplate(tpl.subject, dto.variables) : "";
      body = this.templates.renderTemplate(tpl.body, dto.variables);
    }

    if (!body) {
      throw new BadRequestException("Notification body is required (provide body or templateCode)");
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: dto.employeeIds }, status: "ACTIVE" },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });

    const results: Array<{ employeeId: string; success: boolean; error?: string }> = [];

    for (const emp of employees) {
      if (dto.type === NotificationType.EMAIL) {
        if (!emp.email) {
          await this.logs.create({
            type: NotificationType.EMAIL,
            recipientId: emp.id,
            subject,
            body,
            status: "FAILED",
            errorMessage: "Employee has no email address",
          });
          results.push({ employeeId: emp.id, success: false, error: "No email address" });
          continue;
        }

        const res = await this.emailSender.sendEmail(emp.email, subject, body);
        await this.logs.create({
          type: NotificationType.EMAIL,
          recipientId: emp.id,
          subject,
          body,
          status: res.success ? "SENT" : "FAILED",
          errorMessage: res.error,
          sentAt: res.success ? new Date() : undefined,
        });
        results.push({ employeeId: emp.id, success: res.success, error: res.error });
      } else {
        if (!emp.phone) {
          await this.logs.create({
            type: NotificationType.SMS,
            recipientId: emp.id,
            body,
            status: "FAILED",
            errorMessage: "Employee has no phone number",
          });
          results.push({ employeeId: emp.id, success: false, error: "No phone number" });
          continue;
        }

        const res = await this.smsSender.sendSms(emp.phone, body);
        await this.logs.create({
          type: NotificationType.SMS,
          recipientId: emp.id,
          body,
          status: res.success ? "SENT" : "FAILED",
          errorMessage: res.error,
          sentAt: res.success ? new Date() : undefined,
        });
        results.push({ employeeId: emp.id, success: res.success, error: res.error });
      }
    }

    return {
      total: employees.length,
      sent: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      details: results,
    };
  }

  /** Convenience method for internal use (e.g. work-order events) */
  async sendToEmployee(
    employeeId: string,
    type: NotificationType,
    subject: string,
    body: string,
  ) {
    return this.send({
      employeeIds: [employeeId],
      type,
      subject,
      body,
    });
  }
}
