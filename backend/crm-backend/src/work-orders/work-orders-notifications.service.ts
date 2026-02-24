import { Injectable, NotFoundException, Logger, Inject, Optional } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notifications/notification.service";
import { NotificationType } from "@prisma/client";

@Injectable()
export class WorkOrdersNotificationsService {
  private readonly logger = new Logger(WorkOrdersNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(NotificationService) private readonly notificationService?: NotificationService,
  ) {}

  // Create notification records for employees and send email/SMS when active
  async createNotifications(workOrderId: string, employeeIds: string[]) {
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { id: true, title: true, workOrderNumber: true, type: true },
    });

    if (!workOrder) {
      throw new NotFoundException(`Work order with ID ${workOrderId} not found`);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        status: "ACTIVE",
      },
    });

    if (employees.length !== employeeIds.length) {
      throw new NotFoundException("One or more employees not found or not active");
    }

    await this.prisma.workOrderNotification.createMany({
      data: employeeIds.map((employeeId) => ({
        workOrderId,
        employeeId,
      })),
      skipDuplicates: true,
    });

    // Fire-and-forget email/SMS if the notification service is available
    if (this.notificationService) {
      this.dispatchExternalNotifications(workOrder, employeeIds).catch((err) =>
        this.logger.warn(`External notification dispatch failed: ${err.message}`),
      );
    }

    return this.getNotificationsForWorkOrder(workOrderId);
  }

  private async dispatchExternalNotifications(
    workOrder: { id: string; title: string; workOrderNumber: number; type: string },
    employeeIds: string[],
  ) {
    const subject = `Work Order #${workOrder.workOrderNumber} - ${workOrder.title}`;
    const body = `You have a new notification for Work Order #${workOrder.workOrderNumber} (${workOrder.type}): ${workOrder.title}`;

    try {
      await this.notificationService!.send({
        employeeIds,
        type: NotificationType.EMAIL,
        subject,
        body,
      });
    } catch { /* config not active -- ignore */ }

    try {
      await this.notificationService!.send({
        employeeIds,
        type: NotificationType.SMS,
        body,
      });
    } catch { /* config not active -- ignore */ }

    for (const employeeId of employeeIds) {
      await this.markAsNotified(workOrder.id, employeeId).catch(() => {});
    }
  }

  // Mark notification as notified (when email/SMS is sent)
  async markAsNotified(workOrderId: string, employeeId: string) {
    const notification = await this.prisma.workOrderNotification.findUnique({
      where: {
        workOrderId_employeeId: {
          workOrderId,
          employeeId,
        },
      },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    return this.prisma.workOrderNotification.update({
      where: { id: notification.id },
      data: {
        notifiedAt: new Date(),
      },
    });
  }

  // Mark notification as read
  async markAsRead(workOrderId: string, employeeId: string) {
    const notification = await this.prisma.workOrderNotification.findUnique({
      where: {
        workOrderId_employeeId: {
          workOrderId,
          employeeId,
        },
      },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    return this.prisma.workOrderNotification.update({
      where: { id: notification.id },
      data: {
        readAt: new Date(),
      },
    });
  }

  // Get unread notifications for employee
  async getUnreadNotifications(employeeId: string) {
    const notifications = await this.prisma.workOrderNotification.findMany({
      where: {
        employeeId,
        readAt: null, // Unread
      },
      include: {
        workOrder: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            createdAt: true,
            building: {
              select: {
                coreId: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return notifications;
  }

  // Get all notifications for employee
  async getAllNotifications(employeeId: string, limit = 50) {
    const notifications = await this.prisma.workOrderNotification.findMany({
      where: {
        employeeId,
      },
      include: {
        workOrder: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            createdAt: true,
            building: {
              select: {
                coreId: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
    });

    return notifications;
  }

  // Get notifications for a specific work order
  async getNotificationsForWorkOrder(workOrderId: string) {
    const notifications = await this.prisma.workOrderNotification.findMany({
      where: {
        workOrderId,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return notifications;
  }
}
