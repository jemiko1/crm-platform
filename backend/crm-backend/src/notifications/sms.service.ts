import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendSms(
    to: string,
    body: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.prisma.smsConfig.findFirst();
      if (!config || !config.isActive || !config.accountSid) {
        return { success: false, error: "SMS service is not configured or inactive" };
      }

      const twilio = await import("twilio");
      const client = twilio.default(config.accountSid, config.authToken);
      await client.messages.create({
        body,
        from: config.fromNumber,
        to,
      });

      return { success: true };
    } catch (err: any) {
      this.logger.error(`Failed to send SMS to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }
}
