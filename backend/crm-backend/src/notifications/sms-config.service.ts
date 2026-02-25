import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationLogService } from "./notification-log.service";
import { SmsSenderService } from "./sms.service";
import { UpdateSmsConfigDto } from "./dto";

const SENDER_GE_BALANCE_API = "https://sender.ge/api/getBalance.php";
const SENDER_GE_CALLBACK_API = "https://sender.ge/api/callback.php";
const MASKED = "••••••••";

@Injectable()
export class SmsConfigService {
  private readonly logger = new Logger(SmsConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly logService: NotificationLogService,
    @Inject(forwardRef(() => SmsSenderService))
    private readonly smsSender: SmsSenderService,
  ) {}

  async getConfig() {
    let config = await this.prisma.smsConfig.findFirst();
    if (!config) {
      config = await this.prisma.smsConfig.create({ data: {} });
    }
    return config;
  }

  async getConfigMasked() {
    const config = await this.getConfig();
    return {
      ...config,
      apiKey: config.apiKey ? MASKED : "",
    };
  }

  async upsertConfig(dto: UpdateSmsConfigDto) {
    const existing = await this.prisma.smsConfig.findFirst();
    const data = {
      ...dto,
      ...(dto.apiKey === MASKED ? { apiKey: undefined } : {}),
    };

    if (existing) {
      return this.prisma.smsConfig.update({
        where: { id: existing.id },
        data,
      });
    }
    return this.prisma.smsConfig.create({ data: data as any });
  }

  async testConnection(testNumber: string): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfig();
    if (!config.apiKey) {
      return { success: false, message: "SMS API key is not configured" };
    }

    const messageBody = "CRM Platform - SMS test successful!";
    const destination = testNumber.replace(/^\+995/, "").replace(/\D/g, "");

    const result = await this.smsSender.sendSms(testNumber, messageBody);

    await this.prisma.notificationLog.create({
      data: {
        type: "SMS",
        body: messageBody,
        status: result.success ? "SENT" : "FAILED",
        destination,
        errorMessage: result.error,
        senderMessageId: result.messageId,
        smsCount: result.smsCount,
        sentAt: result.success ? new Date() : undefined,
      },
    });

    if (!result.success) {
      return { success: false, message: result.error || "SMS test failed" };
    }

    return { success: true, message: `Test SMS sent to ${testNumber}` };
  }

  async getBalance(): Promise<{ success: boolean; balance?: number; overdraft?: number; error?: string }> {
    const config = await this.getConfig();
    if (!config.apiKey) {
      return { success: false, error: "SMS API key is not configured" };
    }

    try {
      const params = new URLSearchParams({ apikey: config.apiKey });
      const res = await fetch(`${SENDER_GE_BALANCE_API}?${params.toString()}`);

      if (!res.ok) {
        return { success: false, error: `Sender.ge error (${res.status})` };
      }

      const data = await res.json();
      return {
        success: true,
        balance: Number(data.balance),
        overdraft: Number(data.overdraft),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async checkDeliveryStatus(logId: string): Promise<{ success: boolean; status?: string; deliveredAt?: string; error?: string }> {
    const log = await this.prisma.notificationLog.findUnique({ where: { id: logId } });
    if (!log || !log.senderMessageId) {
      return { success: false, error: "No Sender.ge message ID found for this log entry" };
    }

    const config = await this.getConfig();
    if (!config.apiKey) {
      return { success: false, error: "SMS API key is not configured" };
    }

    try {
      const params = new URLSearchParams({
        apikey: config.apiKey,
        messageId: log.senderMessageId,
      });

      const res = await fetch(`${SENDER_GE_CALLBACK_API}?${params.toString()}`);

      if (!res.ok) {
        return { success: false, error: `Sender.ge error (${res.status})` };
      }

      const data = await res.json();
      const statusId = String(data.statusId);
      const deliveredAt = data.timestamp ? new Date(data.timestamp) : undefined;

      await this.logService.updateDeliveryStatus(logId, statusId, deliveredAt);

      const statusMap: Record<string, string> = { "0": "PENDING", "1": "DELIVERED", "2": "UNDELIVERED" };

      return {
        success: true,
        status: statusMap[statusId] ?? statusId,
        deliveredAt: deliveredAt?.toISOString(),
      };
    } catch (err: any) {
      this.logger.error(`Delivery check failed for log ${logId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async refreshAllPendingDeliveries(): Promise<{ checked: number; updated: number }> {
    const pendingLogs = await this.prisma.notificationLog.findMany({
      where: {
        type: "SMS",
        senderMessageId: { not: null },
        deliveryStatus: { not: "DELIVERED" },
        status: { in: ["SENT", "PENDING"] },
      },
      select: { id: true },
      take: 100,
    });

    let updated = 0;
    for (const log of pendingLogs) {
      const result = await this.checkDeliveryStatus(log.id);
      if (result.success && result.status !== "PENDING") updated++;
    }

    return { checked: pendingLogs.length, updated };
  }
}
