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
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { WorkOrdersNotificationsService } from "../work-orders/work-orders-notifications.service";
import { CreateWorkOrderDto } from "../work-orders/dto/create-work-order.dto";
import { UpdateWorkOrderDto } from "../work-orders/dto/update-work-order.dto";
import { QueryWorkOrdersDto } from "../work-orders/dto/query-work-orders.dto";
import { ProductUsageDto } from "../work-orders/dto/product-usage.dto";
import { DeactivatedDeviceDto } from "../work-orders/dto/deactivated-device.dto";
import { AssignEmployeesDto } from "../work-orders/dto/assign-employees.dto";
import { RequestRepairDto } from "../work-orders/dto/request-repair.dto";
import { PrismaService } from "../prisma/prisma.service";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

@ApiTags("Work Orders")
@Controller("v1/work-orders")
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(
    private readonly workOrdersService: WorkOrdersService,
    private readonly notificationsService: WorkOrdersNotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Doc({
    summary: "Create a new work order",
    ok: "Created work order",
    status: 201,
    bodyType: CreateWorkOrderDto,
  })
  async create(@Body() createWorkOrderDto: CreateWorkOrderDto, @Req() req: any) {
    return this.workOrdersService.create(createWorkOrderDto, req.user.id);
  }

  @Get()
  @Doc({
    summary: "List work orders with pagination and filters",
    ok: "Paginated work orders",
  })
  findAll(@Query() query: QueryWorkOrdersDto) {
    return this.workOrdersService.findAll(query);
  }

  @Post("bulk-delete")
  @HttpCode(HttpStatus.OK)
  @Doc({
    summary: "Delete multiple work orders with optional inventory revert",
    ok: "Bulk delete result",
  })
  async bulkDelete(
    @Body() body: { ids: string[]; revertInventory?: boolean },
  ) {
    return this.workOrdersService.bulkRemove(body.ids, body.revertInventory ?? false);
  }

  @Get("statistics/summary")
  @Doc({
    summary: "Get work order statistics summary",
    ok: "Statistics summary",
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
  @Doc({
    summary: "Get work order by ID",
    ok: "Work order details",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
  })
  findOne(@Param("id") id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Get(":id/activity")
  @Doc({
    summary: "Get activity logs for work order",
    ok: "Activity log entries",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
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
  @Doc({
    summary: "Assign employees to work order",
    ok: "Assignment result",
    notFound: true,
    bodyType: AssignEmployeesDto,
    params: [{ name: "id", description: "Work order ID" }],
  })
  async assignEmployees(
    @Param("id") id: string,
    @Body() dto: AssignEmployeesDto,
    @Req() req: any,
  ) {
    return this.workOrdersService.assignEmployees(id, dto, req.user.id);
  }

  @Post(":id/start")
  @Doc({
    summary: "Start work on work order (employee)",
    ok: "Work started",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
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
  @Doc({
    summary: "Submit product usage (tech employee)",
    ok: "Product usage saved",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
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
  @Doc({
    summary: "Submit deactivated devices (tech employee)",
    ok: "Deactivated devices saved",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
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
  @Doc({
    summary: "Request Diagnostic → Repair conversion",
    ok: "Conversion requested",
    notFound: true,
    bodyType: RequestRepairDto,
    params: [{ name: "id", description: "Work order ID" }],
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
  @Doc({
    summary: "Submit completion (tech employee)",
    ok: "Completion submitted",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
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
  @Doc({
    summary: "Approve work order (head of technical department)",
    ok: "Approval result",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
  })
  async approveWorkOrder(
    @Param("id") id: string,
    @Body()
    body: {
      productUsages?: ProductUsageDto[];
      comment?: string;
      cancelReason?: string;
    },
    @Req() req: any,
  ) {
    return this.workOrdersService.approveWorkOrder(
      id,
      req.user.id,
      body.productUsages,
      body.comment,
      body.cancelReason,
    );
  }

  @Post(":id/cancel")
  @Doc({
    summary: "Cancel work order (head of technical department)",
    ok: "Cancellation processed",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
  })
  async cancelWorkOrder(
    @Param("id") id: string,
    @Body() body: { cancelReason: string; comment?: string },
    @Req() req: any,
  ) {
    return this.workOrdersService.approveWorkOrder(
      id,
      req.user.id,
      undefined,
      body.comment,
      body.cancelReason,
    );
  }

  @Get(":id/inventory-impact")
  @Doc({
    summary: "Get inventory impact of work order (for deletion confirmation)",
    ok: "Inventory impact summary",
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
  })
  async getInventoryImpact(@Param("id") id: string) {
    return this.workOrdersService.getInventoryImpact(id);
  }

  @Patch(":id")
  @Doc({
    summary: "Update work order",
    ok: "Updated work order",
    notFound: true,
    bodyType: UpdateWorkOrderDto,
    params: [{ name: "id", description: "Work order ID" }],
  })
  update(@Param("id") id: string, @Body() updateWorkOrderDto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(id, updateWorkOrderDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @Doc({
    summary: "Delete work order with optional inventory revert",
    ok: "Work order deleted",
    status: 204,
    notFound: true,
    params: [{ name: "id", description: "Work order ID" }],
  })
  remove(
    @Param("id") id: string,
    @Query("revertInventory") revertInventory?: string,
  ) {
    const shouldRevert = revertInventory === "true";
    return this.workOrdersService.remove(id, shouldRevert);
  }
}
