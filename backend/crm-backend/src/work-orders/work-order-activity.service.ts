import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Activity action types
export enum ActivityAction {
  // Main events (always visible)
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  STARTED = 'STARTED',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  CANCELED = 'CANCELED',
  STATUS_CHANGED = 'STATUS_CHANGED',

  // Detail events (shown with checkbox)
  VIEWED = 'VIEWED',
  PRODUCTS_ADDED = 'PRODUCTS_ADDED',
  PRODUCTS_MODIFIED = 'PRODUCTS_MODIFIED',
  PRODUCTS_APPROVED = 'PRODUCTS_APPROVED',
  DEVICES_ADDED = 'DEVICES_ADDED',
  COMMENT_ADDED = 'COMMENT_ADDED',
  DEADLINE_CHANGED = 'DEADLINE_CHANGED',
  EMPLOYEES_MODIFIED = 'EMPLOYEES_MODIFIED',
  REPAIR_REQUESTED = 'REPAIR_REQUESTED',
  SUB_ORDER_CREATED = 'SUB_ORDER_CREATED',
}

// Activity filter types
export enum ActivityFilter {
  ALL = 'ALL',
  MAIN = 'MAIN',
  PRODUCT_FLOW = 'PRODUCT_FLOW',
}

// Activity categories
export enum ActivityCategory {
  MAIN = 'MAIN',
  DETAIL = 'DETAIL',
}

// Metadata types
export interface ActivityMetadata {
  employeeIds?: string[];
  employeeNames?: string[];
  previousStatus?: string;
  newStatus?: string;
  productIds?: string[];
  productNames?: string[];
  quantities?: number[];
  subOrderId?: string;
  comment?: string;
  deadline?: string;
  [key: string]: any;
}

@Injectable()
export class WorkOrderActivityService {
  constructor(private prisma: PrismaService) {}

  /**
   * Log an activity event for a work order
   */
  async logActivity(params: {
    workOrderId: string;
    action: ActivityAction;
    category: ActivityCategory;
    title: string;
    description: string;
    performedById?: string;
    performedByName?: string;
    metadata?: ActivityMetadata;
  }) {
    const {
      workOrderId,
      action,
      category,
      title,
      description,
      performedById,
      performedByName,
      metadata,
    } = params;

    // Get performer name if not provided but ID is given
    let finalPerformerName = performedByName;
    if (!finalPerformerName && performedById) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: performedById },
        select: { firstName: true, lastName: true, employeeId: true },
      });
      if (employee) {
        finalPerformerName = `${employee.firstName} ${employee.lastName} (${employee.employeeId})`;
      }
    }

    return this.prisma.workOrderActivityLog.create({
      data: {
        workOrderId,
        action,
        category,
        title,
        description,
        performedById,
        performedByName: finalPerformerName,
        metadata: metadata as any,
      },
    });
  }

  /**
   * Log work order creation
   */
  async logCreation(
    workOrderId: string,
    performedById: string | undefined,
    buildingName: string,
    workOrderType: string,
  ) {
    let performerName = 'System';
    if (performedById) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: performedById },
        select: { firstName: true, lastName: true, employeeId: true },
      });
      if (employee) {
        performerName = `${employee.firstName} ${employee.lastName} (${employee.employeeId})`;
      }
    }

    return this.logActivity({
      workOrderId,
      action: ActivityAction.CREATED,
      category: ActivityCategory.MAIN,
      title: 'Work Order Created',
      description: `Created by ${performerName}. Building: ${buildingName}, Type: ${workOrderType}`,
      performedById,
      performedByName: performerName,
      metadata: {
        buildingName,
        workOrderType,
      },
    });
  }

  /**
   * Log task viewed by employee
   */
  async logViewed(workOrderId: string, employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})`
      : 'Unknown Employee';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.VIEWED,
      category: ActivityCategory.DETAIL,
      title: 'Task Viewed',
      description: `${employeeName} viewed the task`,
      performedById: employeeId,
      performedByName: employeeName,
    });
  }

  /**
   * Log employees assigned
   */
  async logAssignment(
    workOrderId: string,
    assignedById: string,
    assignedEmployeeIds: string[],
  ) {
    const assigner = await this.prisma.employee.findUnique({
      where: { id: assignedById },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const assignedEmployees = await this.prisma.employee.findMany({
      where: { id: { in: assignedEmployeeIds } },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const assignerName = assigner
      ? `${assigner.firstName} ${assigner.lastName} (${assigner.employeeId})`
      : 'Unknown';

    const assignedNames = assignedEmployees.map(
      (e) => `${e.firstName} ${e.lastName}`,
    );

    return this.logActivity({
      workOrderId,
      action: ActivityAction.ASSIGNED,
      category: ActivityCategory.MAIN,
      title: 'Employees Assigned',
      description: `${assignerName} assigned ${assignedEmployees.length} employee(s): ${assignedNames.join(', ')}`,
      performedById: assignedById,
      performedByName: assignerName,
      metadata: {
        employeeIds: assignedEmployeeIds,
        employeeNames: assignedNames,
      },
    });
  }

  /**
   * Log work started
   */
  async logWorkStarted(workOrderId: string, employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})`
      : 'Unknown Employee';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.STARTED,
      category: ActivityCategory.MAIN,
      title: 'Work Started',
      description: `${employeeName} started work on this order`,
      performedById: employeeId,
      performedByName: employeeName,
    });
  }

  /**
   * Log work submitted for review
   */
  async logSubmission(
    workOrderId: string,
    employeeId: string,
    comment?: string,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})`
      : 'Unknown Employee';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.SUBMITTED,
      category: ActivityCategory.MAIN,
      title: 'Work Submitted',
      description: `${employeeName} submitted work for review${comment ? `: "${comment}"` : ''}`,
      performedById: employeeId,
      performedByName: employeeName,
      metadata: comment ? { comment } : undefined,
    });
  }

  /**
   * Log work order approved
   */
  async logApproval(workOrderId: string, approvedById: string, comment?: string) {
    const approver = await this.prisma.employee.findUnique({
      where: { id: approvedById },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const approverName = approver
      ? `${approver.firstName} ${approver.lastName} (${approver.employeeId})`
      : 'Unknown';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.APPROVED,
      category: ActivityCategory.MAIN,
      title: 'Work Order Approved',
      description: `${approverName} approved the work order${comment ? `: "${comment}"` : ''}`,
      performedById: approvedById,
      performedByName: approverName,
      metadata: comment ? { comment } : undefined,
    });
  }

  /**
   * Log work order canceled
   */
  async logCancellation(
    workOrderId: string,
    canceledById: string,
    reason: string,
  ) {
    const canceler = await this.prisma.employee.findUnique({
      where: { id: canceledById },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const cancelerName = canceler
      ? `${canceler.firstName} ${canceler.lastName} (${canceler.employeeId})`
      : 'Unknown';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.CANCELED,
      category: ActivityCategory.MAIN,
      title: 'Work Order Canceled',
      description: `${cancelerName} canceled the work order: "${reason}"`,
      performedById: canceledById,
      performedByName: cancelerName,
      metadata: { reason },
    });
  }

  /**
   * Log status change
   */
  async logStatusChange(
    workOrderId: string,
    performedById: string | undefined,
    previousStatus: string,
    newStatus: string,
  ) {
    let performerName = 'System';
    if (performedById) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: performedById },
        select: { firstName: true, lastName: true, employeeId: true },
      });
      if (employee) {
        performerName = `${employee.firstName} ${employee.lastName} (${employee.employeeId})`;
      }
    }

    return this.logActivity({
      workOrderId,
      action: ActivityAction.STATUS_CHANGED,
      category: ActivityCategory.MAIN,
      title: 'Status Changed',
      description: `Status changed from ${previousStatus} to ${newStatus}`,
      performedById,
      performedByName: performerName,
      metadata: {
        previousStatus,
        newStatus,
      },
    });
  }

  /**
   * Log products added
   */
  async logProductsAdded(
    workOrderId: string,
    employeeId: string,
    products: { name: string; quantity: number }[],
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})`
      : 'Unknown Employee';

    const productSummary = products
      .map((p) => `${p.name} (×${p.quantity})`)
      .join(', ');

    return this.logActivity({
      workOrderId,
      action: ActivityAction.PRODUCTS_ADDED,
      category: ActivityCategory.DETAIL,
      title: 'Products Added',
      description: `${employeeName} added products: ${productSummary}`,
      performedById: employeeId,
      performedByName: employeeName,
      metadata: {
        productNames: products.map((p) => p.name),
        quantities: products.map((p) => p.quantity),
      },
    });
  }

  /**
   * Log products modified by tech head
   */
  async logProductsModified(
    workOrderId: string,
    modifiedById: string,
    products: { name: string; sku?: string; originalQuantity?: number; newQuantity: number; action: 'added' | 'modified' | 'removed' }[],
  ) {
    const modifier = await this.prisma.employee.findUnique({
      where: { id: modifiedById },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const modifierName = modifier
      ? `${modifier.firstName} ${modifier.lastName} (${modifier.employeeId})`
      : 'Unknown';

    // Build summary
    const addedProducts = products.filter(p => p.action === 'added');
    const modifiedProducts = products.filter(p => p.action === 'modified');
    const removedProducts = products.filter(p => p.action === 'removed');

    const summaryParts: string[] = [];
    if (addedProducts.length > 0) {
      summaryParts.push(`added ${addedProducts.length} product(s)`);
    }
    if (modifiedProducts.length > 0) {
      summaryParts.push(`modified ${modifiedProducts.length} product(s)`);
    }
    if (removedProducts.length > 0) {
      summaryParts.push(`removed ${removedProducts.length} product(s)`);
    }

    const summary = summaryParts.length > 0 
      ? summaryParts.join(', ') 
      : 'reviewed products';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.PRODUCTS_MODIFIED,
      category: ActivityCategory.DETAIL,
      title: 'Products Modified by Reviewer',
      description: `${modifierName} ${summary}`,
      performedById: modifiedById,
      performedByName: modifierName,
      metadata: {
        products: products.map(p => ({
          name: p.name,
          sku: p.sku,
          originalQuantity: p.originalQuantity,
          newQuantity: p.newQuantity,
          action: p.action,
        })),
        addedCount: addedProducts.length,
        modifiedCount: modifiedProducts.length,
        removedCount: removedProducts.length,
      },
    });
  }

  /**
   * Log final products approved (after tech head approval)
   */
  async logProductsApproved(
    workOrderId: string,
    approvedById: string,
    products: { name: string; sku?: string; quantity: number }[],
  ) {
    const approver = await this.prisma.employee.findUnique({
      where: { id: approvedById },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const approverName = approver
      ? `${approver.firstName} ${approver.lastName} (${approver.employeeId})`
      : 'Unknown';

    const productSummary = products
      .map((p) => `${p.name} (×${p.quantity})`)
      .join(', ');

    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);

    return this.logActivity({
      workOrderId,
      action: ActivityAction.PRODUCTS_APPROVED,
      category: ActivityCategory.DETAIL,
      title: 'Products Approved & Deducted',
      description: `${approverName} approved ${products.length} product(s) (total qty: ${totalQuantity}). Stock deducted from inventory.`,
      performedById: approvedById,
      performedByName: approverName,
      metadata: {
        products: products.map(p => ({
          name: p.name,
          sku: p.sku,
          quantity: p.quantity,
        })),
        totalProducts: products.length,
        totalQuantity,
      },
    });
  }

  /**
   * Log deactivated devices added
   */
  async logDevicesAdded(
    workOrderId: string,
    employeeId: string,
    devices: { name: string; quantity: number }[],
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})`
      : 'Unknown Employee';

    const deviceSummary = devices
      .map((d) => `${d.name} (×${d.quantity})`)
      .join(', ');

    return this.logActivity({
      workOrderId,
      action: ActivityAction.DEVICES_ADDED,
      category: ActivityCategory.DETAIL,
      title: 'Deactivated Devices Submitted',
      description: `${employeeName} submitted deactivated devices: ${deviceSummary}`,
      performedById: employeeId,
      performedByName: employeeName,
      metadata: {
        productNames: devices.map((d) => d.name),
        quantities: devices.map((d) => d.quantity),
      },
    });
  }

  /**
   * Log repair conversion request
   */
  async logRepairRequest(workOrderId: string, employeeId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { firstName: true, lastName: true, employeeId: true },
    });

    const employeeName = employee
      ? `${employee.firstName} ${employee.lastName} (${employee.employeeId})`
      : 'Unknown Employee';

    return this.logActivity({
      workOrderId,
      action: ActivityAction.REPAIR_REQUESTED,
      category: ActivityCategory.MAIN,
      title: 'Repair Requested',
      description: `${employeeName} requested to convert to Repair/Change work order`,
      performedById: employeeId,
      performedByName: employeeName,
    });
  }

  /**
   * Log sub-order creation
   */
  async logSubOrderCreated(
    parentWorkOrderId: string,
    subOrderId: string,
    subOrderTitle: string,
    createdById?: string,
  ) {
    let creatorName = 'System';
    if (createdById) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: createdById },
        select: { firstName: true, lastName: true, employeeId: true },
      });
      if (employee) {
        creatorName = `${employee.firstName} ${employee.lastName} (${employee.employeeId})`;
      }
    }

    return this.logActivity({
      workOrderId: parentWorkOrderId,
      action: ActivityAction.SUB_ORDER_CREATED,
      category: ActivityCategory.MAIN,
      title: 'Sub-Order Created',
      description: `Sub-order "${subOrderTitle}" created by ${creatorName}`,
      performedById: createdById,
      performedByName: creatorName,
      metadata: {
        subOrderId,
        subOrderTitle,
      },
    });
  }

  /**
   * Get activity logs for a work order
   */
  async getActivityLogs(
    workOrderId: string,
    options?: {
      includeDetails?: boolean;
      filter?: ActivityFilter;
      limit?: number;
    },
  ) {
    const where: any = { workOrderId };

    // Apply filter
    if (options?.filter === ActivityFilter.PRODUCT_FLOW) {
      // Show only product-related activities
      where.action = {
        in: [
          ActivityAction.PRODUCTS_ADDED,
          ActivityAction.PRODUCTS_MODIFIED,
          ActivityAction.PRODUCTS_APPROVED,
          ActivityAction.DEVICES_ADDED,
        ],
      };
    } else if (options?.filter === ActivityFilter.MAIN || options?.includeDetails === false) {
      // Show only MAIN events
      where.category = ActivityCategory.MAIN;
    }
    // ActivityFilter.ALL or no filter - show everything

    const logs = await this.prisma.workOrderActivityLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      include: {
        performedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
            email: true,
          },
        },
      },
    });

    return logs;
  }
}
