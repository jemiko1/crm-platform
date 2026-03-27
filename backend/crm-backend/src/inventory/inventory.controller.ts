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
import { ApiTags } from '@nestjs/swagger';
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
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Inventory')
@Controller('v1/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // ===== PRODUCTS =====
  @Post('products')
  @Doc({
    summary: 'Create inventory product',
    ok: 'Created product',
    status: 201,
    bodyType: CreateProductDto,
  })
  createProduct(@Body() dto: CreateProductDto) {
    return this.inventoryService.createProduct(dto);
  }

  @Get('products')
  @Doc({
    summary: 'List products',
    ok: 'Paged products',
    queries: [
      { name: 'category', description: 'Category filter' },
      { name: 'lowStock', description: 'Only low-stock items (true/false)' },
      { name: 'page', description: 'Page number' },
      { name: 'pageSize', description: 'Page size' },
    ],
  })
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
  @Doc({
    summary: 'Get product by ID',
    ok: 'Product detail',
    notFound: true,
    params: [{ name: 'id', description: 'Product UUID' }],
  })
  findOneProduct(@Param('id') id: string) {
    return this.inventoryService.findOneProduct(id);
  }

  @Put('products/:id')
  @Doc({
    summary: 'Update product',
    ok: 'Updated product',
    notFound: true,
    bodyType: UpdateProductDto,
    params: [{ name: 'id', description: 'Product UUID' }],
  })
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.inventoryService.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @Doc({
    summary: 'Delete product',
    ok: 'Deletion result',
    notFound: true,
    params: [{ name: 'id', description: 'Product UUID' }],
  })
  deleteProduct(@Param('id') id: string) {
    return this.inventoryService.deleteProduct(id);
  }

  // ===== PURCHASE ORDERS =====
  @Post('purchase-orders')
  @Doc({
    summary: 'Create purchase order',
    ok: 'Created purchase order',
    status: 201,
    bodyType: CreatePurchaseOrderDto,
  })
  createPurchaseOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.inventoryService.createPurchaseOrder(dto);
  }

  @Get('purchase-orders')
  @Doc({
    summary: 'List purchase orders',
    ok: 'Paged purchase orders',
    queries: [
      { name: 'status', description: 'Status filter' },
      { name: 'page', description: 'Page number' },
      { name: 'pageSize', description: 'Page size' },
    ],
  })
  findAllPurchaseOrders(@Query('status') status?: string, @Query() pagination?: PaginationDto) {
    return this.inventoryService.findAllPurchaseOrders(status, pagination?.page, pagination?.pageSize);
  }

  @Get('purchase-orders/:id')
  @Doc({
    summary: 'Get purchase order by ID',
    ok: 'Purchase order detail',
    notFound: true,
    params: [{ name: 'id', description: 'Purchase order UUID' }],
  })
  findOnePurchaseOrder(@Param('id') id: string) {
    return this.inventoryService.findOnePurchaseOrder(id);
  }

  @Put('purchase-orders/:id')
  @Doc({
    summary: 'Update purchase order',
    ok: 'Updated purchase order',
    notFound: true,
    bodyType: UpdatePurchaseOrderDto,
    params: [{ name: 'id', description: 'Purchase order UUID' }],
  })
  updatePurchaseOrder(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.inventoryService.updatePurchaseOrder(id, dto);
  }

  @Put('purchase-orders/:id/status')
  @Doc({
    summary: 'Update purchase order status',
    ok: 'Updated status',
    notFound: true,
    bodyType: UpdatePurchaseOrderStatusDto,
    params: [{ name: 'id', description: 'Purchase order UUID' }],
  })
  updatePurchaseOrderStatus(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderStatusDto) {
    return this.inventoryService.updatePurchaseOrderStatus(id, dto);
  }

  // ===== STOCK ADJUSTMENTS =====
  @Post('adjustments')
  @Doc({
    summary: 'Create stock adjustment',
    ok: 'Adjustment recorded',
    status: 201,
    bodyType: CreateStockAdjustmentDto,
  })
  createStockAdjustment(@Body() dto: CreateStockAdjustmentDto, @Req() req: any) {
    const performedBy = req.user?.email || 'Unknown';
    return this.inventoryService.createStockAdjustment(dto, performedBy);
  }

  // ===== WORK ORDER INTEGRATION =====
  @Post('deduct-for-work-order')
  @Doc({
    summary: 'Deduct stock for work order',
    ok: 'Deduction result',
    bodyType: DeductStockForWorkOrderDto,
  })
  deductStockForWorkOrder(@Body() dto: DeductStockForWorkOrderDto, @Req() req: any) {
    if (!dto.performedBy) {
      dto.performedBy = req.user?.email || 'Unknown';
    }
    return this.inventoryService.deductStockForWorkOrder(dto);
  }

  // ===== TRANSACTIONS & REPORTING =====
  @Get('transactions')
  @Doc({
    summary: 'Stock transactions',
    ok: 'Paged transaction log',
    queries: [
      { name: 'productId', description: 'Filter by product' },
      { name: 'page', description: 'Page number' },
      { name: 'pageSize', description: 'Page size' },
    ],
  })
  getTransactions(@Query('productId') productId?: string, @Query() pagination?: PaginationDto) {
    return this.inventoryService.getTransactions(productId, pagination?.page, pagination?.pageSize);
  }

  @Get('reports/low-stock')
  @Doc({
    summary: 'Low-stock report',
    ok: 'Products below threshold',
    queries: [
      { name: 'page', description: 'Page number' },
      { name: 'pageSize', description: 'Page size' },
    ],
  })
  getLowStockProducts(@Query() pagination?: PaginationDto) {
    return this.inventoryService.getLowStockProducts(pagination?.page, pagination?.pageSize);
  }

  @Get('reports/inventory-value')
  @Doc({ summary: 'Total inventory valuation', ok: 'Aggregated value snapshot' })
  getInventoryValue() {
    return this.inventoryService.getInventoryValue();
  }

  // ===== DEACTIVATED DEVICES =====
  @Get('deactivated-devices')
  @Doc({
    summary: 'Deactivated devices from the field',
    ok: 'Device rows',
    queries: [{ name: 'transferred', description: 'Include already transferred (true/false)' }],
  })
  getDeactivatedDevices(@Query('transferred') transferred?: string) {
    const includeTransferred = transferred === 'true';
    return this.inventoryService.getDeactivatedDevices(includeTransferred);
  }

  @Post('deactivated-devices/:id/mark-working')
  @Doc({
    summary: 'Mark deactivated device as working',
    ok: 'Updated device row',
    notFound: true,
    params: [{ name: 'id', description: 'Deactivated device UUID' }],
  })
  markAsWorkingCondition(@Param('id') id: string, @Req() req: any) {
    const checkedBy = req.user?.email || 'Unknown';
    return this.inventoryService.markDeactivatedDeviceAsWorking(id, checkedBy);
  }

  @Post('deactivated-devices/:id/transfer-to-stock')
  @Doc({
    summary: 'Transfer deactivated device back to stock',
    ok: 'Transfer result',
    notFound: true,
    params: [{ name: 'id', description: 'Deactivated device UUID' }],
  })
  transferToStock(@Param('id') id: string, @Req() req: any) {
    const transferredBy = req.user?.email || 'Unknown';
    return this.inventoryService.transferDeactivatedDeviceToStock(id, transferredBy);
  }
}
