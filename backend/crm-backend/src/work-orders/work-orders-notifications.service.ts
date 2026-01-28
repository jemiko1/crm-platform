import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WorkOrdersNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Create notification records for employees
  async createNotifications(workOrderId: string, employeeIds: string[]) {
    // Verify work order exists
    const workOrder = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
    });

    if (!workOrder) {
      throw new NotFoundException(`Work order with ID ${workOrderId} not found`);
    }

    // Verify all employees exist
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: employeeIds },
        status: "ACTIVE",
      },
    });

    if (employees.length !== employeeIds.length) {
      throw new NotFoundException("One or more employees not found or not active");
    }

    // Create notification records (skip duplicates)
    await this.prisma.workOrderNotification.createMany({
      data: employeeIds.map((employeeId) => ({
        workOrderId,
        employeeId,
      })),
      skipDuplicates: true,
    });

    return this.getNotificationsForWorkOrder(workOrderId);
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
