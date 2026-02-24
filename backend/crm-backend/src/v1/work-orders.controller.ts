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
import { ApiTags, ApiOperation } from "@nestjs/swagger";
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
  @ApiOperation({ summary: "Create a new work order" })
  async create(@Body() createWorkOrderDto: CreateWorkOrderDto, @Req() req: any) {
    return this.workOrdersService.create(createWorkOrderDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: "List work orders with pagination and filters" })
  findAll(@Query() query: QueryWorkOrdersDto) {
    return this.workOrdersService.findAll(query);
  }

  @Post("bulk-delete")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete multiple work orders with optional inventory revert" })
  async bulkDelete(
    @Body() body: { ids: string[]; revertInventory?: boolean },
  ) {
    return this.workOrdersService.bulkRemove(body.ids, body.revertInventory ?? false);
  }

  @Get("statistics/summary")
  @ApiOperation({ summary: "Get work order statistics summary" })
  getStatistics() {
    return this.workOrdersService.getStatistics();
  }

  @Get("my-tasks")
  @ApiOperation({ summary: "Get work orders assigned to current user" })
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
  @ApiOperation({ summary: "Get notifications for current user" })
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
  @ApiOperation({ summary: "Mark notification as read" })
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
  @ApiOperation({ summary: "Get work order by ID" })
  findOne(@Param("id") id: string) {
    return this.workOrdersService.findOne(id);
  }

  @Get(":id/activity")
  @ApiOperation({ summary: "Get activity logs for work order" })
  async getActivityLogs(
    @Param("id") id: string,
    @Query("includeDetails") includeDetails?: string,
    @Query("filter") filter?: string, // ALL, MAIN, PRODUCT_FLOW
  ) {
    const include = includeDetails !== "false";
    return this.workOrdersService.getActivityLogs(id, include, filter);
  }

  @Post(":id/view")
  @ApiOperation({ summary: "Log that user viewed the work order task" })
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
  @ApiOperation({ summary: "Assign employees to work order" })
  async assignEmployees(
    @Param("id") id: string,
    @Body() dto: AssignEmployeesDto,
    @Req() req: any,
  ) {
    return this.workOrdersService.assignEmployees(id, dto, req.user.id);
  }

  @Post(":id/start")
  @ApiOperation({ summary: "Start work on work order (employee)" })
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
  @ApiOperation({ summary: "Submit product usage (tech employee)" })
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
  @ApiOperation({ summary: "Submit deactivated devices (tech employee)" })
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
  @ApiOperation({ summary: "Request Diagnostic → Repair conversion" })
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
  @ApiOperation({ summary: "Submit completion (tech employee)" })
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
  @ApiOperation({ summary: "Approve work order (head of technical department)" })
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
  @ApiOperation({ summary: "Cancel work order (head of technical department)" })
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
  @ApiOperation({ summary: "Get inventory impact of work order (for deletion confirmation)" })
  async getInventoryImpact(@Param("id") id: string) {
    return this.workOrdersService.getInventoryImpact(id);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update work order" })
  update(@Param("id") id: string, @Body() updateWorkOrderDto: UpdateWorkOrderDto) {
    return this.workOrdersService.update(id, updateWorkOrderDto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete work order with optional inventory revert" })
  remove(
    @Param("id") id: string,
    @Query("revertInventory") revertInventory?: string,
  ) {
    const shouldRevert = revertInventory === "true";
    return this.workOrdersService.remove(id, shouldRevert);
  }
}
