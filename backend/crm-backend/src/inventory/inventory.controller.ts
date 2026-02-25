import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  CreateProductDto,
  UpdateProductDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
  CreateStockAdjustmentDto,
  DeductStockForWorkOrderDto,
} from './inventory.dto';
import { PaginationDto } from '../common/dto/pagination.dto';

@Controller('v1/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ===== PRODUCTS =====
  @Post('products')
  createProduct(@Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(dto);
  }

  @Get('products')
  findAllProducts(
    @Query('category') category?: string,
    @Query('lowStock') lowStock?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.inventoryService.findAllProducts(
      category,
      lowStock === 'true',
      pagination?.page ?? 1,
      pagination?.pageSize ?? 50,
    );
  }

  @Get('products/:id')
  findOneProduct(@Param('id') id: string) {
    return this.inventoryService.findOneProduct(id);
  }

  @Put('products/:id')
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.inventoryService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string) {
    return this.inventoryService.deleteProduct(id);
  }

  // ===== PURCHASE ORDERS =====
  @Post('purchase-orders')
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.inventoryService.createPurchaseOrder(dto);
  }

  @Get('purchase-orders')
  findAllPurchaseOrders(@Query('status') status?: string, @Query() pagination?: PaginationDto) {
    return this.inventoryService.findAllPurchaseOrders(status, pagination?.page, pagination?.pageSize);
  }

  @Get('purchase-orders/:id')
  findOnePurchaseOrder(@Param('id') id: string) {
    return this.inventoryService.findOnePurchaseOrder(id);
  }

  @Put('purchase-orders/:id')
  updatePurchaseOrder(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.inventoryService.updatePurchaseOrder(id, dto);
  }

  @Put('purchase-orders/:id/status')
  updatePurchaseOrderStatus(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderStatusDto) {
    return this.inventoryService.updatePurchaseOrderStatus(id, dto);
  }

  // ===== STOCK ADJUSTMENTS =====
  @Post('adjustments')
  createStockAdjustment(@Body() dto: CreateStockAdjustmentDto, @Req() req: any) {
    const performedBy = req.user?.email || 'Unknown';
    return this.inventoryService.createStockAdjustment(dto, performedBy);
  }

  // ===== WORK ORDER INTEGRATION =====
  @Post('deduct-for-work-order')
  deductStockForWorkOrder(@Body() dto: DeductStockForWorkOrderDto, @Req() req: any) {
    if (!dto.performedBy) {
      dto.performedBy = req.user?.email || 'Unknown';
    }
    return this.inventoryService.deductStockForWorkOrder(dto);
  }

  // ===== TRANSACTIONS & REPORTING =====
  @Get('transactions')
  getTransactions(@Query('productId') productId?: string, @Query() pagination?: PaginationDto) {
    return this.inventoryService.getTransactions(productId, pagination?.page, pagination?.pageSize);
  }

  @Get('reports/low-stock')
  getLowStockProducts(@Query() pagination?: PaginationDto) {
    return this.inventoryService.getLowStockProducts(pagination?.page, pagination?.pageSize);
  }

  @Get('reports/inventory-value')
  getInventoryValue() {
    return this.inventoryService.getInventoryValue();
  }

  // ===== DEACTIVATED DEVICES =====
  @Get('deactivated-devices')
  getDeactivatedDevices(@Query('transferred') transferred?: string) {
    const includeTransferred = transferred === 'true';
    return this.inventoryService.getDeactivatedDevices(includeTransferred);
  }

  @Post('deactivated-devices/:id/mark-working')
  markAsWorkingCondition(@Param('id') id: string, @Req() req: any) {
    const checkedBy = req.user?.email || 'Unknown';
    return this.inventoryService.markDeactivatedDeviceAsWorking(id, checkedBy);
  }

  @Post('deactivated-devices/:id/transfer-to-stock')
  transferToStock(@Param('id') id: string, @Req() req: any) {
    const transferredBy = req.user?.email || 'Unknown';
    return this.inventoryService.transferDeactivatedDeviceToStock(id, transferredBy);
  }
}
