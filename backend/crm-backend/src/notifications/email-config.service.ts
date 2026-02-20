import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateEmailConfigDto } from "./dto";
import * as nodemailer from "nodemailer";

@Injectable()
export class EmailConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    let config = await this.prisma.emailConfig.findFirst();
    if (!config) {
      config = await this.prisma.emailConfig.create({ data: {} });
    }
    return config;
  }

  /** Returns config with secrets masked for API responses */
  async getConfigMasked() {
    const config = await this.getConfig();
    return {
      ...config,
      smtpPass: config.smtpPass ? "••••••••" : "",
      imapPass: config.imapPass ? "••••••••" : "",
    };
  }

  async upsertConfig(dto: UpdateEmailConfigDto) {
    const existing = await this.prisma.emailConfig.findFirst();
    if (existing) {
      return this.prisma.emailConfig.update({
        where: { id: existing.id },
        data: {
          ...dto,
          // Keep existing password if masked placeholder is sent back
          ...(dto.smtpPass === "••••••••" ? { smtpPass: undefined } : {}),
          ...(dto.imapPass === "••••••••" ? { imapPass: undefined } : {}),
        },
      });
    }
    return this.prisma.emailConfig.create({ data: dto as any });
  }

  /** Attempts SMTP verify and returns success/error */
  async testSmtpConnection(): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config.smtpHost) {
      return { success: false, message: "SMTP host is not configured" };
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: { user: config.smtpUser, pass: config.smtpPass },
        connectionTimeout: 10000,
      });
      await transporter.verify();
      transporter.close();
      return { success: true, message: "SMTP connection successful" };
    } catch (err: any) {
      return { success: false, message: err.message || "SMTP connection failed" };
    }
  }

  /** Attempts IMAP login and returns success/error */
  async testImapConnection(): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config.imapHost) {
      return { success: false, message: "IMAP host is not configured" };
    }

    try {
      const { ImapFlow } = await import("imapflow");
      const client = new ImapFlow({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: { user: config.imapUser, pass: config.imapPass },
        logger: false as any,
      });
      await client.connect();
      await client.logout();
      return { success: true, message: "IMAP connection successful" };
    } catch (err: any) {
      return { success: false, message: err.message || "IMAP connection failed" };
    }
  }
}
