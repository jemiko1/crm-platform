import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const SENDER_GE_API = "https://sender.ge/api/send.php";

export type SmsSendResult = {
  success: boolean;
  error?: string;
  messageId?: string;
  smsCount?: number;
};

@Injectable()
export class SmsSenderService {
  private readonly logger = new Logger(SmsSenderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async sendSms(to: string, body: string): Promise<SmsSendResult> {
    try {
      const config = await this.prisma.smsConfig.findFirst();
      if (!config || !config.isActive || !config.apiKey) {
        return { success: false, error: "SMS service is not configured or inactive" };
      }

      const destination = to.replace(/^\+995/, "").replace(/\D/g, "");

      // ── Rate limit checks ──────────────────────────────────
      const rateLimitError = await this.checkRateLimits(config, destination);
      if (rateLimitError) {
        this.logger.warn(`SMS blocked (${destination}): ${rateLimitError}`);
        return { success: false, error: rateLimitError };
      }

      // ── Send via Sender.ge ─────────────────────────────────
      const params = new URLSearchParams({
        apikey: config.apiKey,
        smsno: String(config.smsNo ?? 2),
        destination,
        content: body,
      });

      const res = await fetch(`${SENDER_GE_API}?${params.toString()}`);

      if (res.status === 401) {
        return { success: false, error: "Sender.ge: unauthorized – check API key" };
      }
      if (res.status === 402) {
        return { success: false, error: "Sender.ge: insufficient balance" };
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { success: false, error: `Sender.ge error (${res.status}): ${text}` };
      }

      const data = await res.json().catch(() => ({}));
      this.logger.log(`SMS sent to ${destination} via Sender.ge (messageId: ${data.messageId})`);

      return {
        success: true,
        messageId: data.messageId ? String(data.messageId) : undefined,
        smsCount: data.qnt ? Number(data.qnt) : undefined,
      };
    } catch (err: any) {
      this.logger.error(`Failed to send SMS to ${to}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  private async checkRateLimits(
    config: {
      id: string;
      maxPerMinute: number;
      maxPerHour: number;
      maxPerDay: number;
      recipientCooldownMin: number;
      autoDisableOnLimit: boolean;
    },
    destination: string,
  ): Promise<string | null> {
    const now = Date.now();

    const [lastMinute, lastHour, lastDay] = await Promise.all([
      this.prisma.notificationLog.count({
        where: { type: "SMS", status: "SENT", sentAt: { gte: new Date(now - 60_000) } },
      }),
      this.prisma.notificationLog.count({
        where: { type: "SMS", status: "SENT", sentAt: { gte: new Date(now - 3_600_000) } },
      }),
      this.prisma.notificationLog.count({
        where: { type: "SMS", status: "SENT", sentAt: { gte: new Date(now - 86_400_000) } },
      }),
    ]);

    if (lastDay >= config.maxPerDay) {
      if (config.autoDisableOnLimit) {
        await this.prisma.smsConfig.update({
          where: { id: config.id },
          data: { isActive: false },
        });
        this.logger.error(`SMS auto-disabled: daily limit of ${config.maxPerDay} reached`);
        return `Daily SMS limit (${config.maxPerDay}) reached – service auto-disabled`;
      }
      return `Daily SMS limit (${config.maxPerDay}) reached`;
    }

    if (lastHour >= config.maxPerHour) {
      return `Hourly SMS limit (${config.maxPerHour}) reached – try again later`;
    }

    if (lastMinute >= config.maxPerMinute) {
      return `Per-minute SMS limit (${config.maxPerMinute}) reached – slow down`;
    }

    // Per-recipient cooldown
    if (config.recipientCooldownMin > 0) {
      const cooldownMs = config.recipientCooldownMin * 60_000;
      const recentToRecipient = await this.prisma.notificationLog.count({
        where: {
          type: "SMS",
          status: "SENT",
          destination,
          sentAt: { gte: new Date(now - cooldownMs) },
        },
      });

      if (recentToRecipient > 0) {
        return `Recipient cooldown: SMS already sent to ${destination} within the last ${config.recipientCooldownMin} min`;
      }
    }

    return null;
  }
}
