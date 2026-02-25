import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType } from "@prisma/client";

@Injectable()
export class NotificationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    type: NotificationType;
    recipientId?: string;
    templateId?: string;
    subject?: string;
    body: string;
    status: string;
    errorMessage?: string;
    sentAt?: Date;
    senderMessageId?: string;
    smsCount?: number;
    destination?: string;
  }) {
    return this.prisma.notificationLog.create({ data });
  }

  async findAll(params: { page?: number; limit?: number; type?: NotificationType }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.type) where.type = params.type;

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        include: {
          recipient: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findSmsLogs(params: { page?: number; limit?: number; status?: string }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: any = { type: NotificationType.SMS };
    if (params.status) where.status = params.status;

    const [items, total] = await Promise.all([
      this.prisma.notificationLog.findMany({
        where,
        include: {
          recipient: {
            select: { id: true, firstName: true, lastName: true, phone: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.notificationLog.count({ where }),
    ]);

    const mapped = items.map((item) => ({
      ...item,
      recipientDisplay: item.recipient
        ? `${item.recipient.firstName} ${item.recipient.lastName}`
        : item.destination
          ? `Test: ${item.destination}`
          : "Unknown",
    }));

    return { items: mapped, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateDeliveryStatus(
    id: string,
    deliveryStatus: string,
    deliveredAt?: Date,
  ) {
    const statusMap: Record<string, string> = {
      "0": "PENDING",
      "1": "DELIVERED",
      "2": "UNDELIVERED",
    };

    return this.prisma.notificationLog.update({
      where: { id },
      data: {
        deliveryStatus: statusMap[deliveryStatus] ?? deliveryStatus,
        deliveredAt,
        status: deliveryStatus === "1" ? "DELIVERED" : deliveryStatus === "2" ? "FAILED" : undefined,
      },
    });
  }

  async getSmsStats() {
    const [total, sent, delivered, failed, pending] = await Promise.all([
      this.prisma.notificationLog.count({ where: { type: NotificationType.SMS } }),
      this.prisma.notificationLog.count({ where: { type: NotificationType.SMS, status: "SENT" } }),
      this.prisma.notificationLog.count({ where: { type: NotificationType.SMS, status: "DELIVERED" } }),
      this.prisma.notificationLog.count({ where: { type: NotificationType.SMS, status: "FAILED" } }),
      this.prisma.notificationLog.count({ where: { type: NotificationType.SMS, status: "PENDING" } }),
    ]);

    return { total, sent, delivered, failed, pending };
  }
}
