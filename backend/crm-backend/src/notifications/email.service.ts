import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailSenderService {
  private readonly logger = new Logger(EmailSenderService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getTransporter(): Promise<nodemailer.Transporter | null> {
    const config = await this.prisma.emailConfig.findFirst();
    if (!config || !config.isActive || !config.smtpHost) return null;

    return nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: { user: config.smtpUser, pass: config.smtpPass },
    });
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const transporter = await this.getTransporter();
      if (!transporter) {
        return { success: false, error: "Email service is not configured or inactive" };
      }

      const config = await this.prisma.emailConfig.findFirst();
      await transporter.sendMail({
        from: `"${config!.fromName}" <${config!.fromEmail}>`,
        to,
        subject,
        html,
      });

      transporter.close();
      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
