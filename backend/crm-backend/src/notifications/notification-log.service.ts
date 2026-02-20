import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationType } from "@prisma/client";

@Injectable()
export class NotificationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    type: NotificationType;
    recipientId: string;
    templateId?: string;
    subject?: string;
    body: string;
    status: string;
    errorMessage?: string;
    sentAt?: Date;
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
}
