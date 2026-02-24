import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  UpdateProductDto,
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpdatePurchaseOrderStatusDto,
  CreateStockAdjustmentDto,
  DeductStockForWorkOrderDto,
} from './inventory.dto';
import { Prisma, StockTransactionType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  // ===== PRODUCTS =====
  async createProduct(dto: CreateProductDto) {
    // Check if SKU already exists
    const existing = await this.prisma.inventoryProduct.findUnique({
      where: { sku: dto.sku },
    });

    if (existing) {
      throw new BadRequestException(`Product with SKU ${dto.sku} already exists`);
    }

    return this.prisma.inventoryProduct.create({
      data: {
        sku: dto.sku,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        unit: dto.unit || 'PIECE',
        lowStockThreshold: dto.lowStockThreshold || 10,
        currentStock: 0,
      },
    });
  }

  async findAllProducts(
    category?: string,
    lowStock?: boolean,
    page: number = 1,
    pageSize: number = 50,
  ) {
    const where: any = { isActive: true };

    if (category) {
      where.category = category;
    }

    const skip = (page - 1) * pageSize;

    // Use raw SQL for lowStock filter since Prisma doesn't support column-to-column comparison
    if (lowStock) {
      let products: any[];
      let countResult: { count: bigint }[];

      if (category) {
        // With category filter - use parameterized query
        [products, countResult] = await Promise.all([
          this.prisma.$queryRaw<any[]>`
            SELECT * FROM "InventoryProduct"
            WHERE "isActive" = true
            AND category = ${category}
            AND "currentStock" <= "lowStockThreshold"
            ORDER BY name ASC
            LIMIT ${pageSize} OFFSET ${skip}
          `,
          this.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*)::bigint as count FROM "InventoryProduct"
            WHERE "isActive" = true
            AND category = ${category}
            AND "currentStock" <= "lowStockThreshold"
          `,
        ]);
      } else {
        // Without category filter
        [products, countResult] = await Promise.all([
          this.prisma.$queryRaw<any[]>`
            SELECT * FROM "InventoryProduct"
            WHERE "isActive" = true
            AND "currentStock" <= "lowStockThreshold"
            ORDER BY name ASC
            LIMIT ${pageSize} OFFSET ${skip}
          `,
          this.prisma.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(*)::bigint as count FROM "InventoryProduct"
            WHERE "isActive" = true
            AND "currentStock" <= "lowStockThreshold"
          `,
        ]);
      }

      const total = Number(countResult[0]?.count ?? 0);

      return {
        data: products,
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      };
    }

    // Standard Prisma query for non-lowStock requests
    const [products, total] = await Promise.all([
      this.prisma.inventoryProduct.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.inventoryProduct.count({ where }),
    ]);

    return {
      data: products,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOneProduct(id: string) {
    const product = await this.prisma.inventoryProduct.findUnique({
      where: { id },
      include: {
        stockBatches: {
          where: { remainingQuantity: { gt: 0 } },
          orderBy: { receivedDate: 'asc' }, // FIFO
        },
        stockTransactions: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    await this.findOneProduct(id); // Ensure exists

    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.category) data.category = dto.category;
    if (dto.unit) data.unit = dto.unit;
    if (dto.lowStockThreshold !== undefined) {
      data.lowStockThreshold = dto.lowStockThreshold;
    }

    return this.prisma.inventoryProduct.update({
      where: { id },
      data,
    });
  }

  async deleteProduct(id: string) {
    await this.findOneProduct(id);

    // Soft delete
    return this.prisma.inventoryProduct.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ===== PURCHASE ORDERS =====
  async createPurchaseOrder(dto: CreatePurchaseOrderDto) {
    const year = new Date().getFullYear();
    const counter = await this.prisma.externalIdCounter.upsert({
      where: { entity: 'purchase_order' },
      update: { nextId: { increment: 1 } },
      create: { entity: 'purchase_order', nextId: 1 },
    });
    const poNumber = `PO-${year}-${String(counter.nextId).padStart(3, '0')}`;

    let totalAmount = new Prisma.Decimal(0);

    const items = dto.items.map((item) => {
      const subtotal = new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(item.purchasePrice));
      totalAmount = totalAmount.add(subtotal);

      return {
        productId: item.productId,
        quantity: item.quantity,
        purchasePrice: new Prisma.Decimal(item.purchasePrice),
        sellPrice: new Prisma.Decimal(item.sellPrice),
        subtotal,
      };
    });

    return this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierName: dto.supplierName,
        supplierEmail: dto.supplierEmail,
        orderDate: dto.orderDate ? new Date(dto.orderDate) : null,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        notes: dto.notes,
        totalAmount,
        items: {
          create: items,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async findAllPurchaseOrders(status?: string) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOnePurchaseOrder(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return po;
  }

  async updatePurchaseOrder(id: string, dto: UpdatePurchaseOrderDto) {
    const po = await this.findOnePurchaseOrder(id);

    // Only allow editing if not yet received
    if (po.status === 'RECEIVED') {
      throw new BadRequestException('Cannot edit a received purchase order');
    }

    // Update basic fields
    const updateData: any = {};
    if (dto.supplierName) updateData.supplierName = dto.supplierName;
    if (dto.supplierEmail !== undefined) updateData.supplierEmail = dto.supplierEmail;
    if (dto.orderDate) updateData.orderDate = new Date(dto.orderDate);
    if (dto.expectedDate) updateData.expectedDate = new Date(dto.expectedDate);
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    // If items are being updated, delete old items and create new ones
    if (dto.items) {
      await this.prisma.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: id },
      });

      let totalAmount = new Prisma.Decimal(0);
      const items = dto.items.map((item) => {
        const subtotal = new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(item.purchasePrice));
        totalAmount = totalAmount.add(subtotal);

        return {
          productId: item.productId,
          quantity: item.quantity,
          purchasePrice: new Prisma.Decimal(item.purchasePrice),
          sellPrice: new Prisma.Decimal(item.sellPrice),
          subtotal,
        };
      });

      updateData.totalAmount = totalAmount;
      updateData.items = {
        create: items,
      };
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async updatePurchaseOrderStatus(id: string, dto: UpdatePurchaseOrderStatusDto) {
    const po = await this.findOnePurchaseOrder(id);

    // If marking as RECEIVED, create stock batches
    if (dto.status === 'RECEIVED' && po.status !== 'RECEIVED') {
      await this.receivePurchaseOrder(id, dto.receivedDate);
    }

    return this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: dto.status,
        receivedDate: dto.receivedDate ? new Date(dto.receivedDate) : undefined,
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  private async receivePurchaseOrder(poId: string, receivedDateStr?: string) {
    const po = await this.findOnePurchaseOrder(poId);
    const receivedDate = receivedDateStr ? new Date(receivedDateStr) : new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const item of po.items) {
        await tx.stockBatch.create({
          data: {
            productId: item.productId,
            purchaseOrderItemId: item.id,
            initialQuantity: item.quantity,
            remainingQuantity: item.quantity,
            purchasePrice: item.purchasePrice,
            sellPrice: item.sellPrice,
            receivedDate,
          },
        });

        const product = await tx.inventoryProduct.findUnique({
          where: { id: item.productId },
        });

        const balanceBefore = product!.currentStock;
        const balanceAfter = balanceBefore + item.quantity;

        await tx.inventoryProduct.update({
          where: { id: item.productId },
          data: { currentStock: balanceAfter },
        });

        await tx.stockTransaction.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE_IN',
            quantity: item.quantity,
            referenceId: poId,
            balanceBefore,
            balanceAfter,
            notes: `Received from PO ${po.poNumber}`,
          },
        });
      }
    });
  }

  // ===== STOCK ADJUSTMENTS =====
  async createStockAdjustment(dto: CreateStockAdjustmentDto, performedBy?: string) {
    const product = await this.findOneProduct(dto.productId);

    const isIncrease = ['ADJUSTMENT_IN', 'RETURN_IN'].includes(dto.type);
    const balanceBefore = product.currentStock;
    const balanceAfter = isIncrease ? balanceBefore + dto.quantity : balanceBefore - dto.quantity;

    if (balanceAfter < 0) {
      throw new BadRequestException('Insufficient stock for this adjustment');
    }

    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.stockTransaction.create({
        data: {
          productId: dto.productId,
          type: dto.type,
          quantity: isIncrease ? dto.quantity : -dto.quantity,
          balanceBefore,
          balanceAfter,
          performedBy,
          notes: dto.notes,
        },
      });

      await tx.inventoryProduct.update({
        where: { id: dto.productId },
        data: { currentStock: balanceAfter },
      });

      return transaction;
    });
  }

  // ===== WORK ORDER INTEGRATION =====
  async deductStockForWorkOrder(dto: DeductStockForWorkOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      const results: Array<{ productId: string; productName: string; deducted: number }> = [];

      for (const item of dto.items) {
        const product = await tx.inventoryProduct.findUnique({
          where: { id: item.productId },
          include: {
            stockBatches: {
              where: { remainingQuantity: { gt: 0 } },
              orderBy: { receivedDate: 'asc' },
            },
            stockTransactions: {
              take: 20,
              orderBy: { createdAt: 'desc' },
            },
          },
        });

        if (!product) {
          throw new NotFoundException(`Product with ID ${item.productId} not found`);
        }

        if (product.currentStock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. Available: ${product.currentStock}, Requested: ${item.quantity}`,
          );
        }

        let remainingToDeduct = item.quantity;
        const batches = await tx.stockBatch.findMany({
          where: {
            productId: item.productId,
            remainingQuantity: { gt: 0 },
          },
          orderBy: { receivedDate: 'asc' },
        });

        let currentStock = product.currentStock;

        for (const batch of batches) {
          if (remainingToDeduct <= 0) break;

          const deductFromBatch = Math.min(batch.remainingQuantity, remainingToDeduct);

          await tx.stockBatch.update({
            where: { id: batch.id },
            data: {
              remainingQuantity: batch.remainingQuantity - deductFromBatch,
            },
          });

          remainingToDeduct -= deductFromBatch;

          const balanceBefore = currentStock;
          const balanceAfter = balanceBefore - deductFromBatch;

          await tx.stockTransaction.create({
            data: {
              productId: item.productId,
              batchId: batch.id,
              type: 'WORK_ORDER_OUT',
              quantity: -deductFromBatch,
              workOrderId: dto.workOrderId,
              balanceBefore,
              balanceAfter,
              performedBy: dto.performedBy,
              notes: dto.notes || `Used for work order ${dto.workOrderId}`,
            },
          });

          await tx.inventoryProduct.update({
            where: { id: item.productId },
            data: { currentStock: balanceAfter },
          });

          currentStock = balanceAfter;
        }

        results.push({
          productId: item.productId,
          productName: product.name,
          deducted: item.quantity,
        });
      }

      return results;
    });
  }

  // ===== TRANSACTIONS LOG =====
  async getTransactions(productId?: string, limit = 100) {
    const where: any = {};
    if (productId) {
      where.productId = productId;
    }

    return this.prisma.stockTransaction.findMany({
      where,
      include: {
        product: true,
        batch: {
          include: {
            purchaseOrderItem: {
              include: {
                purchaseOrder: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ===== REPORTING =====
  async getLowStockProducts() {
    return this.prisma.inventoryProduct.findMany({
      where: {
        isActive: true,
        currentStock: {
          lte: this.prisma.inventoryProduct.fields.lowStockThreshold,
        },
      },
      orderBy: { currentStock: 'asc' },
    });
  }

  async getInventoryValue() {
    const products = await this.prisma.inventoryProduct.findMany({
      where: { isActive: true, currentStock: { gt: 0 } },
      include: {
        stockBatches: {
          where: { remainingQuantity: { gt: 0 } },
        },
      },
    });

    let totalPurchaseValue = new Prisma.Decimal(0);
    let totalSellValue = new Prisma.Decimal(0);

    for (const product of products) {
      // Calculate purchase and sell value using FIFO batches
      for (const batch of product.stockBatches) {
        const batchPurchaseValue = new Prisma.Decimal(batch.remainingQuantity).mul(batch.purchasePrice);
        totalPurchaseValue = totalPurchaseValue.add(batchPurchaseValue);

        const batchSellValue = new Prisma.Decimal(batch.remainingQuantity).mul(batch.sellPrice);
        totalSellValue = totalSellValue.add(batchSellValue);
      }
    }

    return {
      totalPurchaseValue: totalPurchaseValue.toFixed(2),
      totalSellValue: totalSellValue.toFixed(2),
      potentialProfit: totalSellValue.sub(totalPurchaseValue).toFixed(2),
    };
  }

  // ===== DEACTIVATED DEVICES =====
  async getDeactivatedDevices(includeTransferred: boolean = false) {
    const where: any = {};
    if (!includeTransferred) {
      where.transferredToStock = false;
    }

    return this.prisma.deactivatedDevice.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            category: true,
          },
        },
        workOrder: {
          select: {
            id: true,
            title: true,
            type: true,
            building: {
              select: {
                name: true,
                coreId: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markDeactivatedDeviceAsWorking(deviceId: string, checkedBy: string) {
    const device = await this.prisma.deactivatedDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException(`Deactivated device with ID ${deviceId} not found`);
    }

    if (device.isWorkingCondition) {
      throw new BadRequestException('Device is already marked as working condition');
    }

    return this.prisma.deactivatedDevice.update({
      where: { id: deviceId },
      data: {
        isWorkingCondition: true,
        checkedBy,
        checkedAt: new Date(),
      },
    });
  }

  async transferDeactivatedDeviceToStock(deviceId: string, transferredBy: string) {
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
      throw new BadRequestException('Device has already been transferred to stock');
    }

    if (!device.isWorkingCondition) {
      throw new BadRequestException('Device must be marked as working condition before transfer');
    }

    // Use the work orders service method for transfer
    // We'll need to import it or create a shared service
    // For now, let's implement it here
    return this.prisma.$transaction(async (tx) => {
      // Update product stock
      // Calculate balances before updating
      const balanceBefore = device.product.currentStock;
      const balanceAfter = balanceBefore + device.quantity;

      await tx.inventoryProduct.update({
        where: { id: device.productId },
        data: {
          currentStock: {
            increment: device.quantity,
          },
        },
      });

      // Create stock transaction
      const transaction = await tx.stockTransaction.create({
        data: {
          productId: device.productId,
          type: 'RETURN_IN',
          quantity: device.quantity,
          balanceBefore,
          balanceAfter,
          performedBy: transferredBy,
          notes: `Transferred from deactivated device (Work Order: ${device.workOrder.title})`,
        },
      });

      // Update deactivated device
      const updatedDevice = await tx.deactivatedDevice.update({
        where: { id: deviceId },
        data: {
          transferredToStock: true,
          transferredBy,
          transferredAt: new Date(),
          stockTransactionId: transaction.id,
        },
      });

      return updatedDevice;
    });
  }
}
