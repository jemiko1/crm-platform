import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateSmsConfigDto } from "./dto";

@Injectable()
export class SmsConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig() {
    let config = await this.prisma.smsConfig.findFirst();
    if (!config) {
      config = await this.prisma.smsConfig.create({ data: {} });
    }
    return config;
  }

  /** Returns config with secrets masked for API responses */
  async getConfigMasked() {
    const config = await this.getConfig();
    return {
      ...config,
      authToken: config.authToken ? "••••••••" : "",
    };
  }

  async upsertConfig(dto: UpdateSmsConfigDto) {
    const existing = await this.prisma.smsConfig.findFirst();
    if (existing) {
      return this.prisma.smsConfig.update({
        where: { id: existing.id },
        data: {
          ...dto,
          ...(dto.authToken === "••••••••" ? { authToken: undefined } : {}),
        },
      });
    }
    return this.prisma.smsConfig.create({ data: dto as any });
  }

  /** Sends a test SMS to verify credentials */
  async testConnection(testNumber: string): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config.accountSid || !config.authToken) {
      return { success: false, message: "SMS credentials are not configured" };
    }

    try {
      const twilio = await import("twilio");
      const client = twilio.default(config.accountSid, config.authToken);
      await client.messages.create({
        body: "CRM Platform - SMS test successful!",
        from: config.fromNumber,
        to: testNumber,
      });
      return { success: true, message: `Test SMS sent to ${testNumber}` };
    } catch (err: any) {
      return { success: false, message: err.message || "SMS test failed" };
    }
  }
}
