import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateWorkOrderDto } from "./dto/create-work-order.dto";
import { UpdateWorkOrderDto } from "./dto/update-work-order.dto";
import { QueryWorkOrdersDto } from "./dto/query-work-orders.dto";
import { ProductUsageDto } from "./dto/product-usage.dto";
import { DeactivatedDeviceDto } from "./dto/deactivated-device.dto";
import { AssignEmployeesDto } from "./dto/assign-employees.dto";
import { RequestRepairDto } from "./dto/request-repair.dto";
import { BuildingsService } from "../buildings/buildings.service";
import { AssetsService } from "../assets/assets.service";
import { InventoryService } from "../inventory/inventory.service";
import { WorkOrderActivityService } from "./work-order-activity.service";
import { WorkflowService } from "../workflow/workflow.service";
import { WorkflowTriggerEngine } from "../workflow/workflow-trigger-engine.service";
import { WorkOrderStatus, WorkOrderType } from "@prisma/client";

@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly buildings: BuildingsService,
    private readonly assets: AssetsService,
    private readonly inventory: InventoryService,
    private readonly activityService: WorkOrderActivityService,
    private readonly workflowService: WorkflowService,
    private readonly triggerEngine: WorkflowTriggerEngine,
  ) {}

  // ===== CREATE WORK ORDER =====
  async create(dto: CreateWorkOrderDto, createdByUserId?: string) {
    // Resolve building by coreId
    const buildingId = await this.buildings.internalId(dto.buildingId);
    if (!buildingId) {
      throw new NotFoundException(`Building with coreId ${dto.buildingId} not found`);
    }

    // Get building details for title generation
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { name: true, coreId: true },
    });

    if (!building) {
      throw new NotFoundException(`Building with ID ${buildingId} not found`);
    }

    // Validate type-specific fields
    if (
      (dto.type === "INSTALLATION" || dto.type === "REPAIR_CHANGE") &&
      !dto.amountGel &&
      dto.amountGel !== 0
    ) {
      // amountGel is optional but recommended
    }

    // Resolve assets by coreIds
    const assetIds: string[] = [];
    for (const assetCoreId of dto.assetIds) {
      const assetId = await this.assets.internalId(assetCoreId);
      if (!assetId) {
        throw new NotFoundException(`Asset with coreId ${assetCoreId} not found`);
      }

      // Verify asset belongs to building
      const asset = await this.prisma.asset.findUnique({
        where: { id: assetId },
      });
      if (asset?.buildingId !== buildingId) {
        throw new BadRequestException(
          `Asset with coreId ${assetCoreId} does not belong to the specified building`,
        );
      }

      assetIds.push(assetId);
    }

    // Title is generated AFTER creation using DB-assigned workOrderNumber (never reused)
    const shouldAutoTitle = !dto.title;

    // Find employees to notify based on workflow configuration (Step 1: ASSIGN_EMPLOYEES)
    let workflowEmployeeIds: string[] = [];
    try {
      // Get the workflow step for "ASSIGN_EMPLOYEES" (Step 1)
      const assignStep = await this.workflowService.findStepByKey("ASSIGN_EMPLOYEES");
      
      // Check if step is active
      if (!assignStep.isActive) {
        throw new Error(`Workflow step ASSIGN_EMPLOYEES is not active`);
      }
      
      // Check if work order type matches the step's filter
      // If workOrderTypes is null or empty array, all types are allowed
      let shouldNotify = true;
      if (assignStep.workOrderTypes !== null && assignStep.workOrderTypes !== undefined) {
        const allowedTypes = assignStep.workOrderTypes as string[];
        // Empty array means all types, otherwise check if type is included
        shouldNotify = allowedTypes.length === 0 || allowedTypes.includes(dto.type);
      }
      
      if (!shouldNotify) {
        // Work order type doesn't match filter, don't notify anyone from workflow
        console.log(`[WorkOrder Create] Work order type ${dto.type} does not match step filter for ASSIGN_EMPLOYEES`);
      } else {
        // Check if any positions are assigned to this step
        const positions = await this.workflowService.getPositionsForStep("ASSIGN_EMPLOYEES");
        
        if (positions.length === 0) {
          throw new Error(`No positions assigned to ASSIGN_EMPLOYEES step. Please assign positions in workflow configuration.`);
        }
        
        // Get employees for this step
        const employees = await this.workflowService.getEmployeesForStep("ASSIGN_EMPLOYEES");
        workflowEmployeeIds = employees.map((e) => e.id);
        
        if (workflowEmployeeIds.length === 0) {
          console.warn(`[WorkOrder Create] No active employees found for positions assigned to ASSIGN_EMPLOYEES step. Positions: ${positions.map(p => p.name).join(', ')}. This is expected if no employees have these positions yet.`);
        }
      }
    } catch (error: any) {
      // If workflow step doesn't exist or there's an error, fall back to legacy behavior
      console.warn(`[WorkOrder Create] Failed to get employees from workflow configuration (${error?.message || error}), falling back to legacy method`);
      
      // Fallback to HEAD_OF_TECHNICAL_DEPARTMENT if workflow is not configured
      const headOfTechSetting = await this.prisma.positionSetting.findUnique({
        where: { key: "HEAD_OF_TECHNICAL_DEPARTMENT" },
        include: {
          position: {
            include: {
              employees: {
                where: {
                  status: "ACTIVE",
                },
              },
            },
          },
        },
      });

      if (headOfTechSetting?.position?.employees) {
        workflowEmployeeIds = headOfTechSetting.position.employees.map((e) => e.id);
      } else if (headOfTechSetting?.positionId) {
        const employees = await this.prisma.employee.findMany({
          where: {
            positionId: headOfTechSetting.positionId,
            status: "ACTIVE",
          },
        });
        workflowEmployeeIds = employees.map((e) => e.id);
      }
    }

    // Combine with manually specified employee IDs
    const allEmployeeIdsToNotify = [
      ...(dto.employeeIdsToNotify || []),
      ...workflowEmployeeIds,
    ].filter((id, index, self) => self.indexOf(id) === index); // Remove duplicates

    // Create work order (workOrderNumber auto-assigned by DB sequence — never reused)
    const workOrder = await this.prisma.workOrder.create({
      data: {
        buildingId,
        assetId: assetIds[0] || null,
        type: dto.type,
        status: "CREATED",
        title: dto.title ?? "PENDING",
        notes: dto.description ?? null,
        contactNumber: dto.contactNumber ?? null,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        amountGel: dto.amountGel ?? null,
        inventoryProcessingType: dto.inventoryProcessingType ?? null,
        workOrderAssets: {
          create: assetIds.map((assetId) => ({
            assetId,
          })),
        },
        notifications: allEmployeeIdsToNotify.length > 0
          ? {
              create: allEmployeeIdsToNotify.map((employeeId) => ({
                employeeId,
              })),
            }
          : undefined,
      },
      include: {
        building: {
          select: {
            coreId: true,
            name: true,
            address: true,
            city: true,
          },
        },
        workOrderAssets: {
          include: {
        asset: {
          select: {
            coreId: true,
            name: true,
            type: true,
                status: true,
              },
            },
          },
        },
        notifications: {
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
        },
      },
    });

    // Generate title from the DB-assigned workOrderNumber (guaranteed unique, never reused)
    if (shouldAutoTitle) {
      let typeLabel: string = dto.type;
      try {
        const listItem = await this.prisma.systemListItem.findFirst({
          where: {
            value: dto.type,
            category: { code: "WORK_ORDER_TYPE" },
          },
          select: { displayName: true },
        });
        if (listItem) typeLabel = listItem.displayName;
      } catch {}
      const generatedTitle = `ID-${workOrder.workOrderNumber} - ${building.name} - ${typeLabel}`;
      await this.prisma.workOrder.update({
        where: { id: workOrder.id },
        data: { title: generatedTitle },
      });
      (workOrder as any).title = generatedTitle;
    }

    // Log activity - Work Order Created
    let creatorEmployeeId: string | undefined;
    if (createdByUserId) {
      const creator = await this.prisma.employee.findFirst({
        where: { userId: createdByUserId },
      });
      creatorEmployeeId = creator?.id;
    }

    await this.activityService.logCreation(
      workOrder.id,
      creatorEmployeeId,
      building.name,
      dto.type,
    );

    // Fire workflow triggers for CREATED status
    this.triggerEngine.evaluateStatusChange(
      { id: workOrder.id, type: dto.type, title: (workOrder as any).title, workOrderNumber: workOrder.workOrderNumber },
      null,
      "CREATED",
    ).catch(() => {});

    return workOrder;
  }

  // ===== LIST WORK ORDERS =====
  async findAll(query: QueryWorkOrdersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const skip = (page - 1) * pageSize;

    const where: any = {};

    if (query.buildingId) {
      const buildingId = await this.buildings.internalId(query.buildingId);
      if (buildingId) {
        where.buildingId = buildingId;
      }
    }

    if (query.assetId) {
      const assetId = await this.assets.internalId(query.assetId);
      if (assetId) {
        where.OR = [
          { assetId },
          { workOrderAssets: { some: { assetId } } },
        ];
      }
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    const [data, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          building: {
            select: {
              coreId: true,
              name: true,
            },
          },
          workOrderAssets: {
            include: {
          asset: {
            select: {
              coreId: true,
              name: true,
              type: true,
                },
              },
            },
          },
          assignments: {
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
          },
        },
      }),
      this.prisma.workOrder.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async getStatistics() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    // Efficient count queries (these are already optimal)
    const [totalCount, openCount, currentMonthCreated, currentMonthActive, overdueCount] =
      await Promise.all([
        this.prisma.workOrder.count(),
        this.prisma.workOrder.count({
          where: { status: { notIn: ["COMPLETED", "CANCELED"] } },
        }),
        this.prisma.workOrder.count({
          where: {
            createdAt: {
              gte: new Date(currentYear, currentMonth - 1, 1),
              lt: new Date(currentYear, currentMonth, 1),
            },
          },
        }),
        this.prisma.workOrder.count({
          where: {
            status: { notIn: ["CANCELED"] },
            createdAt: {
              gte: new Date(currentYear, currentMonth - 1, 1),
              lt: new Date(currentYear, currentMonth, 1),
            },
          },
        }),
        this.prisma.workOrder.count({
          where: {
            status: { notIn: ["CANCELED"] },
            deadline: { not: null, lt: now },
          },
        }),
      ]);

    // Use SQL aggregations instead of loading all records into memory
    // 1. Monthly created breakdown - GROUP BY year/month
    const monthlyCreatedRaw = await this.prisma.$queryRaw<
      { year: number; month: number; count: bigint }[]
    >`
      SELECT
        EXTRACT(YEAR FROM "createdAt")::int as year,
        EXTRACT(MONTH FROM "createdAt")::int as month,
        COUNT(*)::bigint as count
      FROM "WorkOrder"
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    const monthlyCreatedBreakdown: Record<number, Record<number, number>> = {};
    for (const row of monthlyCreatedRaw) {
      if (!monthlyCreatedBreakdown[row.year]) monthlyCreatedBreakdown[row.year] = {};
      monthlyCreatedBreakdown[row.year][row.month] = Number(row.count);
    }

    // Completion rate for current month
    const completedThisMonth = await this.prisma.workOrder.count({
      where: {
        status: "COMPLETED",
        completedAt: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lt: new Date(currentYear, currentMonth, 1),
        },
      },
    });

    const createdThisMonthExclCanceled = await this.prisma.workOrder.count({
      where: {
        status: { notIn: ["CANCELED"] },
        createdAt: {
          gte: new Date(currentYear, currentMonth - 1, 1),
          lt: new Date(currentYear, currentMonth, 1),
        },
      },
    });

    const currentMonthCompletionRate =
      createdThisMonthExclCanceled > 0
        ? Math.round((completedThisMonth / createdThisMonthExclCanceled) * 1000) / 10
        : 0;

    // 2. Monthly completion stats - GROUP BY with FILTER for completed count
    const monthlyCompletionRaw = await this.prisma.$queryRaw<
      { year: number; month: number; created: bigint; completed: bigint }[]
    >`
      SELECT
        EXTRACT(YEAR FROM "createdAt")::int as year,
        EXTRACT(MONTH FROM "createdAt")::int as month,
        COUNT(*) as created,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed
      FROM "WorkOrder"
      WHERE status NOT IN ('CANCELED')
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    const monthlyCompletionBreakdown: Record<number, Record<number, number>> = {};
    for (const row of monthlyCompletionRaw) {
      const created = Number(row.created);
      const completed = Number(row.completed);
      const rate = created > 0 ? Math.round((completed / created) * 1000) / 10 : 0;
      if (!monthlyCompletionBreakdown[row.year]) monthlyCompletionBreakdown[row.year] = {};
      monthlyCompletionBreakdown[row.year][row.month] = rate;
    }

    // 3. Monthly overdue breakdown - GROUP BY deadline year/month
    const monthlyOverdueRaw = await this.prisma.$queryRaw<
      { year: number; month: number; count: bigint }[]
    >`
      SELECT
        EXTRACT(YEAR FROM deadline)::int as year,
        EXTRACT(MONTH FROM deadline)::int as month,
        COUNT(*)::bigint as count
      FROM "WorkOrder"
      WHERE status NOT IN ('CANCELED')
        AND deadline IS NOT NULL
        AND deadline < NOW()
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;

    const monthlyOverdueBreakdown: Record<number, Record<number, number>> = {};
    for (const row of monthlyOverdueRaw) {
      if (!monthlyOverdueBreakdown[row.year]) monthlyOverdueBreakdown[row.year] = {};
      monthlyOverdueBreakdown[row.year][row.month] = Number(row.count);
    }

    // Calculate percentage changes
    let lastMonth = currentMonth - 1;
    let lastMonthYear = currentYear;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = currentYear - 1;
    }
    const lastMonthCreated = monthlyCreatedBreakdown[lastMonthYear]?.[lastMonth] ?? 0;
    let currentMonthPercentageChange = 0;
    if (lastMonthCreated > 0) {
      currentMonthPercentageChange =
        ((currentMonthCreated - lastMonthCreated) / lastMonthCreated) * 100;
    } else if (currentMonthCreated > 0) {
      currentMonthPercentageChange = 100;
    }

    const allMonthCounts = Object.values(monthlyCreatedBreakdown).flatMap((v) =>
      Object.values(v),
    );
    const avg =
      allMonthCounts.length > 0
        ? allMonthCounts.reduce((a, b) => a + b, 0) / allMonthCounts.length
        : 0;
    let averagePercentageChange = 0;
    if (avg > 0) {
      averagePercentageChange = ((currentMonthCreated - avg) / avg) * 100;
    } else if (currentMonthCreated > 0) {
      averagePercentageChange = 100;
    }

    return {
      totalWorkOrdersCount: totalCount,
      openWorkOrdersCount: openCount,
      currentMonthCreated,
      currentMonthActive,
      currentMonthPercentageChange: Math.round(currentMonthPercentageChange * 10) / 10,
      averagePercentageChange: Math.round(averagePercentageChange * 10) / 10,
      monthlyCreatedBreakdown,
      currentMonthCompletionRate,
      monthlyCompletionBreakdown,
      overdueCount,
      monthlyOverdueBreakdown,
    };
  }

  // ===== GET WORK ORDER BY ID OR NUMBER =====
  async findOne(idOrNumber: string) {
    // Check if input is UUID (contains dashes) or numeric workOrderNumber
    let whereClause: { id: string } | { workOrderNumber: number };
    
    if (idOrNumber.includes('-')) {
      // UUID format
      whereClause = { id: idOrNumber };
    } else {
      // Try as workOrderNumber (numeric string)
      const numValue = parseInt(idOrNumber, 10);
      if (!isNaN(numValue)) {
        whereClause = { workOrderNumber: numValue };
      } else {
        whereClause = { id: idOrNumber };
      }
    }
    
    const workOrder = await this.prisma.workOrder.findUnique({
      where: whereClause,
      include: {
        building: {
          select: {
            coreId: true,
            name: true,
            address: true,
            city: true,
          },
        },
        asset: {
          select: {
            coreId: true,
            name: true,
            type: true,
            status: true,
          },
        },
        workOrderAssets: {
          include: {
            asset: {
              select: {
                coreId: true,
                name: true,
                type: true,
                status: true,
              },
            },
          },
        },
        assignments: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                employeeId: true,
              },
            },
          },
        },
        productUsages: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                category: true,
              },
            },
            batch: {
              select: {
                id: true,
                purchasePrice: true,
                sellPrice: true,
              },
            },
          },
        },
        deactivatedDevices: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                category: true,
              },
            },
          },
        },
        notifications: {
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
        },
        parentWorkOrder: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
          },
        },
        childWorkOrders: {
          select: {
            id: true,
            title: true,
            type: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!workOrder) {
      throw new NotFoundException(`Work order with ID ${idOrNumber} not found`);
    }

    return workOrder;
  }

  // ===== UPDATE WORK ORDER =====
  async update(idOrNumber: string, dto: UpdateWorkOrderDto) {
    const workOrder = await this.findOne(idOrNumber); // Throws NotFoundException if not found

    return this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.title && { title: dto.title }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.techEmployeeComment !== undefined && {
          techEmployeeComment: dto.techEmployeeComment,
        }),
        ...(dto.techHeadComment !== undefined && { techHeadComment: dto.techHeadComment }),
        ...(dto.cancelReason !== undefined && { cancelReason: dto.cancelReason }),
      },
      include: {
        building: {
          select: {
            coreId: true,
            name: true,
          },
        },
        workOrderAssets: {
          include: {
        asset: {
          select: {
            coreId: true,
            name: true,
            type: true,
              },
            },
          },
        },
      },
    });
  }

  // ===== DELETE WORK ORDER =====

  /**
   * Get inventory impact information for a work order
   * This shows what products were deducted and what devices were transferred
   */
  async getInventoryImpact(idOrNumber: string) {
    const workOrder = await this.findOne(idOrNumber);

    // Get approved product usages (these affected inventory)
    const approvedProductUsages = await this.prisma.workOrderProductUsage.findMany({
      where: {
        workOrderId: workOrder.id,
        isApproved: true,
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true },
        },
      },
    });

    // Get deactivated devices that were transferred to stock
    const transferredDevices = await this.prisma.deactivatedDevice.findMany({
      where: {
        workOrderId: workOrder.id,
        transferredToStock: true,
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true },
        },
      },
    });

    // Get stock transactions for this work order
    const stockTransactions = await this.prisma.stockTransaction.findMany({
      where: {
        workOrderId: workOrder.id,
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true },
        },
      },
    });

    const hasImpact = 
      approvedProductUsages.length > 0 || 
      transferredDevices.length > 0 ||
      stockTransactions.length > 0;

    return {
      hasImpact,
      workOrderStatus: workOrder.status,
      workOrderNumber: workOrder.workOrderNumber,
      approvedProductUsages: approvedProductUsages.length,
      productUsages: approvedProductUsages.map(pu => ({
        productId: pu.productId,
        productName: pu.product.name,
        productSku: pu.product.sku,
        quantity: pu.quantity,
      })),
      transferredDevices: transferredDevices.length,
      deactivatedDevices: transferredDevices.map(dd => ({
        deviceId: dd.id,
        productId: dd.productId,
        productName: dd.product.name,
        productSku: dd.product.sku,
        quantity: dd.quantity,
      })),
      // Building product flow - not implemented in schema yet, return empty
      buildingProductFlowCount: 0,
      buildingProductFlow: [],
      inventoryTransactionsCount: stockTransactions.length,
      inventoryTransactions: stockTransactions.map(st => ({
        id: st.id,
        productName: st.product.name,
        quantity: st.quantity,
        type: st.type,
      })),
    };
  }

  /**
   * Remove a work order with optional inventory revert
   */
  async remove(idOrNumber: string, revertInventory: boolean = false) {
    const workOrder = await this.findOne(idOrNumber);

    if (revertInventory) {
      // Revert all inventory changes
      await this.revertInventoryChanges(workOrder.id);
    }

    // Delete the work order (cascades to related records via Prisma schema)
    return this.prisma.workOrder.delete({
      where: { id: workOrder.id },
    });
  }

  async bulkRemove(ids: string[], revertInventory: boolean = false) {
    const results: { id: string; success: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await this.remove(id, revertInventory);
        results.push({ id, success: true });
      } catch (err: any) {
        results.push({ id, success: false, error: err.message ?? "Unknown error" });
      }
    }
    return {
      deleted: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  /**
   * Revert all inventory changes made by a work order
   */
  private async revertInventoryChanges(workOrderId: string) {
    // 1. Revert product usage deductions (add back to stock)
    const approvedProductUsages = await this.prisma.workOrderProductUsage.findMany({
      where: {
        workOrderId,
        isApproved: true,
      },
      include: {
        product: true,
      },
    });

    for (const usage of approvedProductUsages) {
      // Get current stock for balance tracking
      const product = await this.prisma.inventoryProduct.findUnique({
        where: { id: usage.productId },
        select: { currentStock: true },
      });
      
      const balanceBefore = product?.currentStock || 0;
      const balanceAfter = balanceBefore + usage.quantity;

      // Add back to product stock
      await this.prisma.inventoryProduct.update({
        where: { id: usage.productId },
        data: {
          currentStock: { increment: usage.quantity },
        },
      });

      // Create reversal transaction using StockTransaction model
      await this.prisma.stockTransaction.create({
        data: {
          productId: usage.productId,
          type: 'ADJUSTMENT_IN', // Using ADJUSTMENT_IN to add back to stock
          quantity: usage.quantity,
          workOrderId,
          notes: `Work order deletion reversal`,
          performedBy: 'system',
          balanceBefore,
          balanceAfter,
        },
      });
    }

    // 2. Revert deactivated device transfers (mark as not transferred)
    await this.prisma.deactivatedDevice.updateMany({
      where: {
        workOrderId,
        transferredToStock: true,
      },
      data: {
        transferredToStock: false,
        transferredAt: null,
        transferredBy: null,
        stockTransactionId: null,
      },
    });

    // 3. Remove stock transactions for this work order
    await this.prisma.stockTransaction.deleteMany({
      where: { workOrderId },
    });
  }

  // ===== WORKFLOW METHODS =====

  // Assign employees to work order (Head of Technical Department)
  async assignEmployees(workOrderId: string, dto: AssignEmployeesDto, assignedBy: string) {
    const workOrder = await this.findOne(workOrderId);

    if (workOrder.status !== "CREATED") {
      throw new BadRequestException(
        `Cannot assign employees to work order with status ${workOrder.status}. Work order must be in CREATED status.`,
      );
    }

    // Verify all employees exist
    const employees = await this.prisma.employee.findMany({
      where: {
        id: { in: dto.employeeIds },
        status: "ACTIVE",
      },
    });

    if (employees.length !== dto.employeeIds.length) {
      throw new NotFoundException("One or more employees not found or not active");
    }

    // Create assignments
    await this.prisma.workOrderAssignment.createMany({
      data: dto.employeeIds.map((employeeId) => ({
        workOrderId: workOrder.id,
        employeeId,
        assignedBy,
      })),
      skipDuplicates: true,
    });

    // Get the assigner's employee ID
    const assigner = await this.prisma.employee.findFirst({
      where: { userId: assignedBy },
    });

    // Log activity - Employees Assigned
    await this.activityService.logAssignment(
      workOrder.id,
      assigner?.id || assignedBy,
      dto.employeeIds,
    );

    // Log status change
    await this.activityService.logStatusChange(
      workOrder.id,
      assigner?.id,
      "CREATED",
      "LINKED_TO_GROUP",
    );

    // Fire workflow triggers
    this.triggerEngine.evaluateStatusChange(
      { id: workOrder.id, type: workOrder.type, title: workOrder.title, workOrderNumber: workOrder.workOrderNumber },
      "CREATED",
      "LINKED_TO_GROUP",
    ).catch(() => {});

    // Update status to LINKED_TO_GROUP
    return this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        status: "LINKED_TO_GROUP",
      },
      include: {
        assignments: {
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
        },
      },
    });
  }

  // Employee starts work
  async startWork(workOrderId: string, employeeId: string) {
    const workOrder = await this.findOne(workOrderId);

    // Verify employee is assigned
    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: {
        workOrderId: workOrder.id,
        employeeId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException("You are not assigned to this work order");
    }

    if (workOrder.status !== "LINKED_TO_GROUP") {
      throw new BadRequestException(
        `Cannot start work order with status ${workOrder.status}. Work order must be in LINKED_TO_GROUP status.`,
      );
    }

    // Log activity - Work Started
    await this.activityService.logWorkStarted(workOrder.id, employeeId);

    // Log status change
    await this.activityService.logStatusChange(
      workOrder.id,
      employeeId,
      "LINKED_TO_GROUP",
      "IN_PROGRESS",
    );

    // Fire workflow triggers
    this.triggerEngine.evaluateStatusChange(
      { id: workOrder.id, type: workOrder.type, title: workOrder.title, workOrderNumber: workOrder.workOrderNumber },
      "LINKED_TO_GROUP",
      "IN_PROGRESS",
    ).catch(() => {});

    return this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  }

  // Submit product usage (Tech employee)
  async submitProductUsage(
    workOrderId: string,
    employeeId: string,
    productUsages: ProductUsageDto[],
  ) {
    const workOrder = await this.findOne(workOrderId);

    // Verify employee is assigned
    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: {
        workOrderId: workOrder.id,
        employeeId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException("You are not assigned to this work order");
    }

    if (workOrder.status !== "IN_PROGRESS") {
      throw new BadRequestException("Work order must be IN_PROGRESS to submit product usage");
    }

    if (
      workOrder.type !== "INSTALLATION" &&
      workOrder.type !== "REPAIR_CHANGE"
    ) {
      throw new BadRequestException(
        `Product usage is only allowed for INSTALLATION and REPAIR_CHANGE work orders`,
      );
    }

    // Verify all products exist and have sufficient stock
    for (const usage of productUsages) {
      const product = await this.prisma.inventoryProduct.findUnique({
        where: { id: usage.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${usage.productId} not found`);
      }

      if (product.currentStock < usage.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${product.name}. Available: ${product.currentStock}, Requested: ${usage.quantity}`,
        );
      }
    }

    // Delete existing unapproved product usages for this work order
    // This prevents duplication when products are re-submitted
    await this.prisma.workOrderProductUsage.deleteMany({
      where: {
        workOrderId: workOrder.id,
        isApproved: false, // Only delete unapproved ones
      },
    });

    // Create product usage records (not yet approved)
    await this.prisma.workOrderProductUsage.createMany({
      data: productUsages.map((usage) => ({
        workOrderId: workOrder.id,
        productId: usage.productId,
        quantity: usage.quantity,
        batchId: usage.batchId ?? null,
        filledBy: employeeId,
        isApproved: false,
      })),
    });

    // Get product details for activity log
    const products = await this.prisma.inventoryProduct.findMany({
      where: { id: { in: productUsages.map((u) => u.productId) } },
      select: { id: true, name: true },
    });

    const productDetails = productUsages.map((usage) => ({
      name: products.find((p) => p.id === usage.productId)?.name || "Unknown",
      quantity: usage.quantity,
    }));

    // Log activity - Products Added
    await this.activityService.logProductsAdded(workOrder.id, employeeId, productDetails);

    return this.findOne(workOrder.id);
  }

  // Submit deactivated devices (Tech employee)
  async submitDeactivatedDevices(
    workOrderId: string,
    employeeId: string,
    devices: DeactivatedDeviceDto[],
  ) {
    const workOrder = await this.findOne(workOrderId);

    // Verify employee is assigned
    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: {
        workOrderId: workOrder.id,
        employeeId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException("You are not assigned to this work order");
    }

    if (workOrder.status !== "IN_PROGRESS") {
      throw new BadRequestException("Work order must be IN_PROGRESS to submit deactivated devices");
    }

    if (workOrder.type !== "DEACTIVATE") {
      throw new BadRequestException("Deactivated devices are only allowed for DEACTIVATE work orders");
    }

    // Verify all products exist
    for (const device of devices) {
      const product = await this.prisma.inventoryProduct.findUnique({
        where: { id: device.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${device.productId} not found`);
      }
    }

    // Create deactivated device records
    await this.prisma.deactivatedDevice.createMany({
      data: devices.map((device) => ({
        workOrderId: workOrder.id,
        productId: device.productId,
        quantity: device.quantity,
        batchId: device.batchId ?? null,
        notes: device.notes ?? null,
      })),
    });

    // Get product details for activity log
    const products = await this.prisma.inventoryProduct.findMany({
      where: { id: { in: devices.map((d) => d.productId) } },
      select: { id: true, name: true },
    });

    const deviceDetails = devices.map((device) => ({
      name: products.find((p) => p.id === device.productId)?.name || "Unknown",
      quantity: device.quantity,
    }));

    // Log activity - Devices Added
    await this.activityService.logDevicesAdded(workOrder.id, employeeId, deviceDetails);

    return this.findOne(workOrder.id);
  }

  // Request Diagnostic → Repair conversion
  async requestRepairConversion(
    workOrderId: string,
    employeeId: string,
    dto: RequestRepairDto,
  ) {
    const workOrder = await this.findOne(workOrderId);

    // Verify employee is assigned
    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: {
        workOrderId: workOrder.id,
        employeeId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException("You are not assigned to this work order");
    }

    if (workOrder.type !== "DIAGNOSTIC") {
      throw new BadRequestException("Only DIAGNOSTIC work orders can be converted to REPAIR_CHANGE");
    }

    if (workOrder.status !== "IN_PROGRESS") {
      throw new BadRequestException("Work order must be IN_PROGRESS to request conversion");
    }

    // Create sub-order (child work order) with same parameters but REPAIR_CHANGE type
    const childWorkOrder = await this.create(
      {
        buildingId: workOrder.building.coreId,
        assetIds: workOrder.workOrderAssets.map((wa) => wa.asset.coreId),
        type: "REPAIR_CHANGE",
        title: `Repair/Change - ${workOrder.title}`,
        description: `Converted from Diagnostic work order. Reason: ${dto.reason}`,
        contactNumber: workOrder.contactNumber ?? undefined,
        deadline: workOrder.deadline?.toISOString(),
        amountGel: undefined, // Will be filled by head
        inventoryProcessingType: undefined, // Will be filled by head
        employeeIdsToNotify: workOrder.notifications.map((n) => n.employeeId),
      },
    );

    // Link as child
    await this.prisma.workOrder.update({
      where: { id: childWorkOrder.id },
      data: {
        parentWorkOrderId: workOrder.id,
      },
    });

    // Log activity - Repair Requested
    await this.activityService.logRepairRequest(workOrder.id, employeeId);

    // Log activity - Sub-Order Created
    await this.activityService.logSubOrderCreated(
      workOrder.id,
      childWorkOrder.id,
      childWorkOrder.title,
      employeeId,
    );

    return this.findOne(workOrder.id);
  }

  // Submit completion (Tech employee)
  async submitCompletion(idOrNumber: string | number, employeeId: string, comment: string) {
    const workOrder = await this.findOne(String(idOrNumber));

    // Verify employee is assigned
    const assignment = await this.prisma.workOrderAssignment.findFirst({
      where: {
        workOrderId: workOrder.id,
        employeeId,
      },
    });

    if (!assignment) {
      throw new ForbiddenException("You are not assigned to this work order");
    }

    if (workOrder.status !== "IN_PROGRESS") {
      throw new BadRequestException("Work order must be IN_PROGRESS to submit completion");
    }

    // Log activity - Work Submitted
    await this.activityService.logSubmission(workOrder.id, employeeId, comment);

    // Create notifications for FINAL_APPROVAL positions
    try {
      const approvalEmployees = await this.workflowService.getEmployeesForStep("FINAL_APPROVAL");
      const approvalEmployeeIds = approvalEmployees.map((e) => e.id);
      
      if (approvalEmployeeIds.length > 0) {
        // Create notifications for final approval positions
        await this.prisma.workOrderNotification.createMany({
          data: approvalEmployeeIds.map((empId) => ({
            workOrderId: workOrder.id,
            employeeId: empId,
          })),
          skipDuplicates: true,
        });
        console.log(`[WorkOrder Submit] Created notifications for ${approvalEmployeeIds.length} FINAL_APPROVAL employees`);
      }
    } catch (error) {
      console.warn("[WorkOrder Submit] Failed to create notifications for FINAL_APPROVAL step:", error);
    }

    // Fire workflow triggers for field change (techEmployeeComment = "Waiting For Approval")
    this.triggerEngine.evaluateFieldChange(
      { id: workOrder.id, type: workOrder.type, title: workOrder.title, workOrderNumber: workOrder.workOrderNumber },
      ["techEmployeeComment"],
    ).catch(() => {});

    // Update with comment - status remains IN_PROGRESS until head approves
    return this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        techEmployeeComment: comment,
      },
    });
  }

  // Approve work order (Head of Technical Department)
  async approveWorkOrder(
    workOrderId: string,
    headUserId: string,
    productUsages?: ProductUsageDto[],
    comment?: string,
    cancelReason?: string,
  ) {
    const workOrder = await this.findOne(workOrderId);

    if (workOrder.status !== "IN_PROGRESS") {
      throw new BadRequestException(
        `Cannot approve work order with status ${workOrder.status}. Work order must be IN_PROGRESS.`,
      );
    }

    // Get head's employee ID
    const head = await this.prisma.employee.findFirst({
      where: { userId: headUserId },
    });
    const headEmployeeId = head?.id || headUserId;

    if (cancelReason) {
      // Log activity - Canceled
      await this.activityService.logCancellation(workOrder.id, headEmployeeId, cancelReason);

      // Log status change
      await this.activityService.logStatusChange(
        workOrder.id,
        headEmployeeId,
        "IN_PROGRESS",
        "CANCELED",
      );

      // Fire workflow triggers
      this.triggerEngine.evaluateStatusChange(
        { id: workOrder.id, type: workOrder.type, title: workOrder.title, workOrderNumber: workOrder.workOrderNumber },
        "IN_PROGRESS",
        "CANCELED",
      ).catch(() => {});

      // Cancel work order
      return this.prisma.workOrder.update({
        where: { id: workOrder.id },
        data: {
          status: "CANCELED",
          cancelReason,
          canceledAt: new Date(),
          techHeadComment: comment ?? null,
        },
      });
    }

    // Approve work order
    // Get product details for logging
    const existingUsages = workOrder.productUsages.filter((pu) => !pu.isApproved);
    const existingProductIds = existingUsages.map((pu) => pu.productId);
    
    // Fetch product names for logging
    const productDetails = await this.prisma.inventoryProduct.findMany({
      where: { id: { in: [...existingProductIds, ...(productUsages?.map(p => p.productId) || [])] } },
      select: { id: true, name: true, sku: true },
    });
    const productMap = new Map(productDetails.map(p => [p.id, { name: p.name, sku: p.sku }]));

    // If product usages provided, update them (head can modify)
    if (productUsages && productUsages.length > 0) {
      // Calculate modifications for activity log
      const modifications: { name: string; sku?: string; originalQuantity?: number; newQuantity: number; action: 'added' | 'modified' | 'removed' }[] = [];
      
      // Check for added/modified products
      for (const usage of productUsages) {
        const existing = existingUsages.find(eu => eu.productId === usage.productId);
        const productInfo = productMap.get(usage.productId);
        if (existing) {
          if (existing.quantity !== usage.quantity) {
            modifications.push({
              name: productInfo?.name || 'Unknown',
              sku: productInfo?.sku,
              originalQuantity: existing.quantity,
              newQuantity: usage.quantity,
              action: 'modified',
            });
          }
        } else {
          modifications.push({
            name: productInfo?.name || 'Unknown',
            sku: productInfo?.sku,
            newQuantity: usage.quantity,
            action: 'added',
          });
        }
      }
      
      // Check for removed products
      for (const existing of existingUsages) {
        if (!productUsages.find(pu => pu.productId === existing.productId)) {
          const productInfo = productMap.get(existing.productId);
          modifications.push({
            name: productInfo?.name || 'Unknown',
            sku: productInfo?.sku,
            originalQuantity: existing.quantity,
            newQuantity: 0,
            action: 'removed',
          });
        }
      }

      // Log modifications if any
      if (modifications.length > 0) {
        await this.activityService.logProductsModified(workOrder.id, headEmployeeId, modifications);
      }

      // Delete existing unapproved usages
      await this.prisma.workOrderProductUsage.deleteMany({
        where: {
          workOrderId: workOrder.id,
          isApproved: false,
        },
      });

      // Create new usages with head's modifications
      await this.prisma.workOrderProductUsage.createMany({
        data: productUsages.map((usage) => ({
          workOrderId: workOrder.id,
          productId: usage.productId,
          quantity: usage.quantity,
          batchId: usage.batchId ?? null,
          filledBy: workOrder.productUsages[0]?.filledBy ?? null,
          modifiedBy: headUserId,
          isApproved: true,
          approvedBy: headUserId,
          approvedAt: new Date(),
        })),
      });

      // Log final approved products
      const approvedProducts = productUsages.map(usage => ({
        name: productMap.get(usage.productId)?.name || 'Unknown',
        sku: productMap.get(usage.productId)?.sku,
        quantity: usage.quantity,
      }));
      await this.activityService.logProductsApproved(workOrder.id, headEmployeeId, approvedProducts);

      // Deduct stock using inventory service
      await this.inventory.deductStockForWorkOrder({
        workOrderId: workOrder.id,
        items: productUsages.map((usage) => ({
          productId: usage.productId,
          quantity: usage.quantity,
        })),
        performedBy: headUserId,
      });
    } else if (workOrder.productUsages.length > 0) {
      // Approve existing usages without modification
      await this.prisma.workOrderProductUsage.updateMany({
        where: {
          workOrderId: workOrder.id,
          isApproved: false,
        },
        data: {
          isApproved: true,
          approvedBy: headUserId,
          approvedAt: new Date(),
        },
      });

      // Log final approved products (no modifications)
      const approvedProducts = existingUsages.map(usage => ({
        name: productMap.get(usage.productId)?.name || 'Unknown',
        sku: productMap.get(usage.productId)?.sku,
        quantity: usage.quantity,
      }));
      if (approvedProducts.length > 0) {
        await this.activityService.logProductsApproved(workOrder.id, headEmployeeId, approvedProducts);
      }

      // Deduct stock
      const usagesToDeduct = workOrder.productUsages
        .filter((pu) => !pu.isApproved)
        .map((pu) => ({
          productId: pu.productId,
          quantity: pu.quantity,
          batchId: pu.batchId ?? undefined,
        }));

      if (usagesToDeduct.length > 0) {
        await this.inventory.deductStockForWorkOrder({
          workOrderId: workOrder.id,
          items: usagesToDeduct.map((u) => ({
            productId: u.productId,
            quantity: u.quantity,
          })),
          performedBy: headUserId,
        });
      }
    }

    // Log activity - Approved
    await this.activityService.logApproval(workOrder.id, headEmployeeId, comment);

    // Log status change
    await this.activityService.logStatusChange(
      workOrder.id,
      headEmployeeId,
      "IN_PROGRESS",
      "COMPLETED",
    );

    // Fire workflow triggers
    this.triggerEngine.evaluateStatusChange(
      { id: workOrder.id, type: workOrder.type, title: workOrder.title, workOrderNumber: workOrder.workOrderNumber },
      "IN_PROGRESS",
      "COMPLETED",
    ).catch(() => {});

    return this.prisma.workOrder.update({
      where: { id: workOrder.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        techHeadComment: comment ?? null,
      },
    });
  }

  // Get work orders for position based on workflow configuration
  async getWorkOrdersForPosition(positionId: string) {
    try {
      // Check if position is assigned to Step 1 (ASSIGN_EMPLOYEES)
      const step1Positions = await this.workflowService.getPositionsForStep("ASSIGN_EMPLOYEES");
      const isAssignedToStep1 = step1Positions.some((p) => p.id === positionId);
      
      // Check if position is assigned to Step 5 (FINAL_APPROVAL)
      const step5Positions = await this.workflowService.getPositionsForStep("FINAL_APPROVAL");
      const isAssignedToStep5 = step5Positions.some((p) => p.id === positionId);
      
      if (!isAssignedToStep1 && !isAssignedToStep5) {
        // Position not assigned to any workflow step
        return { data: [], meta: { page: 1, pageSize: 0, total: 0, totalPages: 0 } };
      }

      // Return work orders based on which step the position is assigned to
      if (isAssignedToStep1) {
        return this.findAll({ status: "CREATED" } as QueryWorkOrdersDto);
      }
      
      if (isAssignedToStep5) {
        return this.findAll({ status: "IN_PROGRESS" } as QueryWorkOrdersDto);
      }

      return { data: [], meta: { page: 1, pageSize: 0, total: 0, totalPages: 0 } };
    } catch (error) {
      // Fallback to legacy behavior if workflow is not configured
      const setting = await this.prisma.positionSetting.findUnique({
        where: { key: "HEAD_OF_TECHNICAL_DEPARTMENT" },
      });

      if (!setting || setting.positionId !== positionId) {
        return { data: [], meta: { page: 1, pageSize: 0, total: 0, totalPages: 0 } };
      }

      return this.findAll({ status: "CREATED" } as QueryWorkOrdersDto);
    }
  }

  // Get work orders for employee (assigned work orders + notifications for Head of Technical)
  async getWorkOrdersForEmployee(employeeId: string) {
    // Get employee's position
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        position: true,
      },
    });

    if (!employee) {
      return {
        data: [],
        meta: {
          page: 1,
          pageSize: 0,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Check if employee's position is assigned to workflow steps
    let isAssignEmployeesPosition = false; // Step 1: Can assign employees
    let isFinalApprovalPosition = false;   // Step 5: Can approve/reject
    
    try {
      // Check Step 1 (ASSIGN_EMPLOYEES) positions
      const step1Positions = await this.workflowService.getPositionsForStep("ASSIGN_EMPLOYEES");
      isAssignEmployeesPosition = step1Positions.some((p) => p.id === employee.positionId);
      
      // Check Step 5 (FINAL_APPROVAL) positions
      const step5Positions = await this.workflowService.getPositionsForStep("FINAL_APPROVAL");
      isFinalApprovalPosition = step5Positions.some((p) => p.id === employee.positionId);
    } catch (error) {
      // Fallback to legacy behavior if workflow is not configured
      const headOfTechSetting = await this.prisma.positionSetting.findUnique({
        where: { key: "HEAD_OF_TECHNICAL_DEPARTMENT" },
      });
      const isLegacyHead = headOfTechSetting?.positionId === employee.positionId;
      isAssignEmployeesPosition = isLegacyHead;
      isFinalApprovalPosition = isLegacyHead;
    }
    
    // Combined check - position can see tasks if assigned to either step
    const isWorkflowManager = isAssignEmployeesPosition || isFinalApprovalPosition;

    // Get assigned work orders
    const assignments = await this.prisma.workOrderAssignment.findMany({
      where: { employeeId },
      include: {
        workOrder: {
          include: {
            building: {
              select: {
                coreId: true,
                name: true,
              },
            },
            workOrderAssets: {
              include: {
                asset: {
                  select: {
                    coreId: true,
                    name: true,
                    type: true,
                  },
                },
              },
            },
            assignments: {
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
            },
            productUsages: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    category: true,
                  },
                },
              },
            },
            deactivatedDevices: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const assignedWorkOrderIds = new Set(assignments.map((a) => a.workOrder.id));

    // If workflow manager (Step 1 or Step 5), get ALL work orders they were notified about
    // This includes all statuses so they can monitor the full lifecycle
    let notifiedWorkOrders: any[] = [];
    
    if (isWorkflowManager) {
      // First get all notifications for this employee
      const notifications = await this.prisma.workOrderNotification.findMany({
        where: {
          employeeId,
        },
        select: {
          workOrderId: true,
        },
      });

      const workOrderIds = notifications.map((n) => n.workOrderId);

      if (workOrderIds.length > 0) {
        // Fetch ALL work orders that this Head of Technical was notified about
        // This allows them to see the full lifecycle of tasks they're responsible for
        const allNotifiedWorkOrders = await this.prisma.workOrder.findMany({
          where: {
            id: { in: workOrderIds },
          },
          include: {
            building: {
              select: {
                coreId: true,
                name: true,
              },
            },
            workOrderAssets: {
              include: {
                asset: {
                  select: {
                    coreId: true,
                    name: true,
                    type: true,
                  },
                },
              },
            },
            assignments: {
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
            },
            productUsages: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    category: true,
                  },
                },
              },
            },
            deactivatedDevices: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    category: true,
                  },
                },
              },
            },
          },
        });

        // Filter out work orders that are already in assigned list (avoid duplicates)
        notifiedWorkOrders = allNotifiedWorkOrders.filter(
          (wo) => !assignedWorkOrderIds.has(wo.id),
        );
      }
    }

    // Combine assigned and notified work orders
    const allWorkOrders = [
      ...assignments.map((a) => a.workOrder),
      ...notifiedWorkOrders,
    ];

    return {
      data: allWorkOrders,
      meta: {
        page: 1,
        pageSize: allWorkOrders.length,
        total: allWorkOrders.length,
        totalPages: 1,
      },
    };
  }

  // Get activity logs for a work order
  async getActivityLogs(idOrNumber: string, includeDetails: boolean = true, filter?: string) {
    const workOrder = await this.findOne(idOrNumber);
    return this.activityService.getActivityLogs(workOrder.id, { 
      includeDetails,
      filter: filter as any, // ActivityFilter enum
    });
  }

  // Log task viewed
  async logTaskViewed(idOrNumber: string, employeeId: string) {
    const workOrder = await this.findOne(idOrNumber);
    return this.activityService.logViewed(workOrder.id, employeeId);
  }

  // Transfer deactivated device to active stock
  async transferDeactivatedDeviceToStock(deviceId: string, checkedBy: string) {
    const device = await this.prisma.deactivatedDevice.findUnique({
      where: { id: deviceId },
      include: {
        product: true,
        workOrder: true,
      },
    });

    if (!device) {
      throw new NotFoundException(`Deactivated device with ID ${deviceId} not found`);
    }

    if (device.transferredToStock) {
      throw new BadRequestException("Device has already been transferred to stock");
    }

    // Mark as working condition and transfer
    return this.prisma.$transaction(async (tx) => {
      // Update device
      const updatedDevice = await tx.deactivatedDevice.update({
        where: { id: deviceId },
        data: {
          isWorkingCondition: true,
          checkedBy,
          checkedAt: new Date(),
          transferredToStock: true,
          transferredBy: checkedBy,
          transferredAt: new Date(),
        },
      });

      // Create stock transaction (add to active stock)
      const balanceBefore = device.product.currentStock;
      const balanceAfter = balanceBefore + device.quantity;

      const stockTransaction = await tx.stockTransaction.create({
        data: {
          productId: device.productId,
          type: "RETURN_IN",
          quantity: device.quantity,
          balanceBefore,
          balanceAfter,
          performedBy: checkedBy,
          notes: `Transferred from deactivated device (Work Order: ${device.workOrder.title})`,
        },
      });

      // Update product stock
      await tx.inventoryProduct.update({
        where: { id: device.productId },
        data: {
          currentStock: balanceAfter,
        },
      });

      // Update device with transaction ID
      await tx.deactivatedDevice.update({
        where: { id: deviceId },
        data: {
          stockTransactionId: stockTransaction.id,
        },
      });

      return updatedDevice;
    });
  }
}
