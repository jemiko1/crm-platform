import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PositionPermissionGuard } from "../common/guards/position-permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { WorkOrdersNotificationsService } from "../work-orders/work-orders-notifications.service";
import { CreateWorkOrderDto } from "../work-orders/dto/create-work-order.dto";
import { UpdateWorkOrderDto } from "../work-orders/dto/update-work-order.dto";
import { QueryWorkOrdersDto } from "../work-orders/dto/query-work-orders.dto";
import { ProductUsageDto } from "../work-orders/dto/product-usage.dto";
import { DeactivatedDeviceDto } from "../work-orders/dto/deactivated-device.dto";
import { AssignEmployeesDto } from "../work-orders/dto/assign-employees.dto";
import { RequestRepairDto } from "../work-orders/dto/request-repair.dto";
import { CancelWorkOrderDto } from "../work-orders/dto/cancel-work-order.dto";
import { ReassignEmployeesDto } from "../work-orders/dto/reassign-employees.dto";
import { PrismaService } from "../prisma/prisma.service";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

@ApiTags("Work Orders")
@Controller("v1/work-orders")
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly notificationsService: WorkOrdersNotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @RequirePermission("work_orders.create")
  @Doc({
    summary: "Create a new work order",
    ok: "Created work order",
    status: 201,
    bodyType: CreateWorkOrderDto,
    permission: true,
  })
  async create(@Body() createWorkOrderDto: CreateWorkOrderDto, @Req() req: any) {
    return this.workOrdersService.create(createWorkOrderDto, req.user.id);
  }

  @Get()
  @RequirePermission("work_orders.read")
  @Doc({
    summary: "List work orders with pagination and filters",
    ok: "Paginated work orders",
    permission: true,
  })
  findAll(@Query() query: QueryWorkOrdersDto) {
    return this.workOrdersService.findAll(query);
  }

  @Post("bulk-delete")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("work_orders.delete")
  @Doc({
    summary: "Delete multiple work orders with optional inventory revert",
    ok: "Bulk delete result",
    permission: true,
  })
  async bulkDelete(
    @Body() body: { ids: string[]; revertInventory?: boolean },
    @Req() req: any,
  ) {
    if (body.revertInventory) {
      this.requireRevertPermission(req);
    }
    return this.workOrdersService.bulkRemove(body.ids, body.revertInventory ?? false);
  }

  @Get("statistics/summary")
  @RequirePermission("work_orders.read")
  @Doc({
    summary: "Get work order statistics summary",
    ok: "Statistics summary",
    permission: true,
  })
  getStatistics() {
    return this.workOrdersService.getStatistics();
  }

  @Get("my-tasks")
  @Doc({
    summary: "Get work orders assigned to current user",
    ok: "Tasks for current employee",
  })
  async getMyTasks(@Req() req: any) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      return { data: [], meta: { page: 1, pageSize: 0, total: 0, totalPages: 0 } };
    }

    return this.workOrdersService.getWorkOrdersForEmployee(employee.id);
  }

  @Get("notifications")
  @Doc({
    summary: "Get notifications for current user",
    ok: "Unread work order notifications",
  })
  async getNotifications(@Req() req: any) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      return [];
    }

    return this.notificationsService.getUnreadNotifications(employee.id);
  }

  @Post("notifications/:notificationId/read")
  @Doc({
    summary: "Mark notification as read",
    ok: "Notification marked read",
    notFound: true,
    params: [{ name: "notificationId", description: "Notification ID" }],
  })
  async markNotificationAsRead(
    @Param("notificationId") notificationId: string,
    @Req() req: any,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    const notification = await this.prisma.workOrderNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    return this.notificationsService.markAsRead(notification.workOrderId, employee.id);
  }

  @Get(":id")
  @RequirePermission("work_orders.read")
  @Doc({
    summary: "Get work order by ID",
    ok: "Work order details",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  findOne(@Param("id") id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Get(":id/activity")
  @RequirePermission("work_orders.read")
  @Doc({
    summary: "Get activity logs for work order",
    ok: "Activity log entries",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async getActivityLogs(
    @Param("id") id: string,
    @Query("includeDetails") includeDetails?: string,
    @Query("filter") filter?: string, // ALL, MAIN, PRODUCT_FLOW
  ) {
    const include = includeDetails !== "false";
    return this.workOrdersService.getActivityLogs(id, include, filter);
  }

  @Post(":id/view")
  @Doc({
    summary: "Log that user viewed the work order task",
    ok: "View logged",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
  })
  async logTaskViewed(@Param("id") id: string, @Req() req: any) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      return { success: false, message: "Employee not found" };
    }

    await this.workOrdersService.logTaskViewed(id, employee.id);
    return { success: true };
  }

  @Post(":id/assign")
  @RequirePermission("work_orders.assign")
  @Doc({
    summary: "Assign employees to work order",
    ok: "Assignment result",
    notFound: true,
    bodyType: AssignEmployeesDto,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async assignEmployees(
    @Param("id") id: string,
    @Body() dto: AssignEmployeesDto,
    @Req() req: any,
  ) {
    return this.workOrdersService.assignEmployees(id, dto, req.user.id);
  }

  @Post(":id/start")
  @RequirePermission("work_orders.execute")
  @Doc({
    summary: "Start work on work order (employee)",
    ok: "Work started",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async startWork(@Param("id") id: string, @Req() req: any) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    return this.workOrdersService.startWork(id, employee.id);
  }

  @Post(":id/products")
  @RequirePermission("work_orders.execute")
  @Doc({
    summary: "Submit product usage (tech employee)",
    ok: "Product usage saved",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async submitProductUsage(
    @Param("id") id: string,
    @Body() productUsages: ProductUsageDto[],
    @Req() req: any,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    return this.workOrdersService.submitProductUsage(id, employee.id, productUsages);
  }

  @Post(":id/deactivated-devices")
  @RequirePermission("work_orders.manage_devices")
  @Doc({
    summary: "Submit deactivated devices (tech employee)",
    ok: "Deactivated devices saved",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async submitDeactivatedDevices(
    @Param("id") id: string,
    @Body() devices: DeactivatedDeviceDto[],
    @Req() req: any,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    return this.workOrdersService.submitDeactivatedDevices(id, employee.id, devices);
  }

  @Post(":id/request-repair")
  @RequirePermission("work_orders.execute")
  @Doc({
    summary: "Request Diagnostic → Repair conversion",
    ok: "Conversion requested",
    notFound: true,
    bodyType: RequestRepairDto,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async requestRepair(
    @Param("id") id: string,
    @Body() dto: RequestRepairDto,
    @Req() req: any,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    return this.workOrdersService.requestRepairConversion(id, employee.id, dto);
  }

  @Post(":id/complete")
  @RequirePermission("work_orders.execute")
  @Doc({
    summary: "Submit completion (tech employee)",
    ok: "Completion submitted",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async submitCompletion(
    @Param("id") id: string,
    @Body() body: { comment: string },
    @Req() req: any,
  ) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId: req.user.id },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    return this.workOrdersService.submitCompletion(id, employee.id, body.comment);
  }

  @Post(":id/approve")
  @RequirePermission("work_orders.approve")
  @Doc({
    summary: "Approve work order (head of technical department)",
    ok: "Approval result",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async approveWorkOrder(
    @Param("id") id: string,
    @Body()
    body: {
      productUsages?: ProductUsageDto[];
      comment?: string;
    },
    @Req() req: any,
  ) {
    return this.workOrdersService.approveWorkOrder(
      id,
      req.user.id,
      body.productUsages,
      body.comment,
    );
  }

  @Post(":id/cancel")
  @RequirePermission("work_orders.cancel")
  @Doc({
    summary: "Cancel work order (Step 1 or Step 5 positions)",
    ok: "Work order canceled",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    bodyType: CancelWorkOrderDto,
    permission: true,
  })
  async cancelWorkOrder(
    @Param("id") id: string,
    @Body() body: CancelWorkOrderDto,
    @Req() req: any,
  ) {
    return this.workOrdersService.cancelWorkOrder(id, body, req.user.id);
  }

  @Post(":id/reassign")
  @RequirePermission("work_orders.assign")
  @Doc({
    summary: "Reassign employees on a work order (Step 1 positions only)",
    ok: "Employees reassigned",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    bodyType: ReassignEmployeesDto,
    permission: true,
  })
  async reassignEmployees(
    @Param("id") id: string,
    @Body() body: ReassignEmployeesDto,
    @Req() req: any,
  ) {
    return this.workOrdersService.reassignEmployees(id, body, req.user.id);
  }

  @Get(":id/inventory-impact")
  @RequirePermission("work_orders.delete")
  @Doc({
    summary: "Get inventory impact of work order (for deletion confirmation)",
    ok: "Inventory impact summary",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  async getInventoryImpact(@Param("id") id: string) {
    return this.workOrdersService.getInventoryImpact(id);
  }

  @Patch(":id")
  @RequirePermission("work_orders.update")
  @Doc({
    summary: "Update work order",
    ok: "Updated work order",
    notFound: true,
    bodyType: UpdateWorkOrderDto,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  update(@Param("id") id: string, @Body() updateWorkOrderDto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(id, updateWorkOrderDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("work_orders.delete")
  @Doc({
    summary: "Delete work order with optional inventory revert",
    ok: "Work order deleted",
    status: 204,
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
    permission: true,
  })
  remove(
    @Param("id") id: string,
    @Req() req: any,
    @Query("revertInventory") revertInventory?: string,
  ) {
    const shouldRevert = revertInventory === "true";
    if (shouldRevert) {
      this.requireRevertPermission(req);
    }
    return this.workOrdersService.remove(id, shouldRevert);
  }

  /**
   * Manual permission check for delete_revert_inventory.
   * Used when the standard @RequirePermission guard checks work_orders.delete,
   * but the revert option requires the elevated permission.
   */
  private requireRevertPermission(req: any) {
    if (req?.user?.isSuperAdmin) return;
    const permissions: string[] = req?.user?.permissions ?? [];
    if (!permissions.includes("work_orders.delete_revert_inventory")) {
      throw new ForbiddenException(
        "Access denied. Required permission: work_orders.delete_revert_inventory",
      );
    }
  }
}
