import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

type SeedItem = {
  value: string;
  displayName: string;
  sortOrder: number;
  colorHex?: string;
  icon?: string;
  isDefault?: boolean;
};

async function seedSystemLists() {
  console.log('🌱 Seeding System Lists...');

  // Define all list categories and their items
  const categories: Array<{
    code: string;
    name: string;
    description: string;
    tableName: string;
    fieldName: string;
    isUserEditable: boolean;
    sortOrder: number;
    items: SeedItem[];
  }> = [
    {
      code: 'ASSET_TYPE',
      name: 'Asset Type',
      description: 'Types of assets/products in buildings',
      tableName: 'Asset',
      fieldName: 'type',
      isUserEditable: true,
      sortOrder: 1,
      items: [
        { value: 'ELEVATOR', displayName: 'Elevator', sortOrder: 1 },
        { value: 'ENTRANCE_DOOR', displayName: 'Entrance Door', sortOrder: 2 },
        { value: 'INTERCOM', displayName: 'Intercom', sortOrder: 3 },
        { value: 'SMART_GSM_GATE', displayName: 'Smart GSM Gate', sortOrder: 4 },
        { value: 'SMART_DOOR_GSM', displayName: 'Smart Door GSM', sortOrder: 5 },
        { value: 'BOOM_BARRIER', displayName: 'Boom Barrier', sortOrder: 6 },
        { value: 'OTHER', displayName: 'Other', sortOrder: 7 },
      ],
    },
    {
      code: 'CONTACT_METHOD',
      name: 'Contact Method',
      description: 'How incidents are reported',
      tableName: 'Incident',
      fieldName: 'contactMethod',
      isUserEditable: true,
      sortOrder: 2,
      items: [
        { value: 'PHONE', displayName: 'Phone', sortOrder: 1, isDefault: true },
        { value: 'EMAIL', displayName: 'Email', sortOrder: 2 },
        { value: 'IN_PERSON', displayName: 'In-Person', sortOrder: 3 },
        { value: 'OTHER', displayName: 'Other', sortOrder: 4 },
      ],
    },
    {
      code: 'INCIDENT_TYPE',
      name: 'Incident Type',
      description: 'Categories of incidents',
      tableName: 'Incident',
      fieldName: 'incidentType',
      isUserEditable: true,
      sortOrder: 3,
      items: [
        { value: 'Hardware Failure', displayName: 'Hardware Failure', sortOrder: 1 },
        { value: 'Software/System Issue', displayName: 'Software/System Issue', sortOrder: 2 },
        { value: 'Access Problem', displayName: 'Access Problem', sortOrder: 3 },
        { value: 'Maintenance Request', displayName: 'Maintenance Request', sortOrder: 4 },
        { value: 'Safety Concern', displayName: 'Safety Concern', sortOrder: 5 },
        { value: 'Other', displayName: 'Other', sortOrder: 6 },
      ],
    },
    {
      code: 'INCIDENT_PRIORITY',
      name: 'Incident Priority',
      description: 'Incident severity levels',
      tableName: 'Incident',
      fieldName: 'priority',
      isUserEditable: true,
      sortOrder: 4,
      items: [
        { value: 'LOW', displayName: 'Low', colorHex: '#6b7280', sortOrder: 1 },
        { value: 'MEDIUM', displayName: 'Medium', colorHex: '#3b82f6', sortOrder: 2, isDefault: true },
        { value: 'HIGH', displayName: 'High', colorHex: '#f59e0b', sortOrder: 3 },
        { value: 'CRITICAL', displayName: 'Critical', colorHex: '#ef4444', sortOrder: 4 },
      ],
    },
    {
      code: 'PRODUCT_CATEGORY',
      name: 'Product Category',
      description: 'Inventory product categories',
      tableName: 'InventoryProduct',
      fieldName: 'category',
      isUserEditable: true,
      sortOrder: 5,
      items: [
        { value: 'ROUTER', displayName: 'Router', sortOrder: 1, isDefault: true },
        { value: 'CONTROLLER', displayName: 'Controller', sortOrder: 2 },
        { value: 'SENSOR', displayName: 'Sensor', sortOrder: 3 },
        { value: 'CABLE', displayName: 'Cable', sortOrder: 4 },
        { value: 'ACCESSORY', displayName: 'Accessory', sortOrder: 5 },
        { value: 'HARDWARE', displayName: 'Hardware', sortOrder: 6 },
        { value: 'SOFTWARE', displayName: 'Software', sortOrder: 7 },
        { value: 'OTHER', displayName: 'Other', sortOrder: 8 },
      ],
    },
    {
      code: 'PRODUCT_UNIT',
      name: 'Product Unit',
      description: 'Measurement units for inventory',
      tableName: 'InventoryProduct',
      fieldName: 'unit',
      isUserEditable: true,
      sortOrder: 6,
      items: [
        { value: 'PIECE', displayName: 'Piece', sortOrder: 1, isDefault: true },
        { value: 'METER', displayName: 'Meter', sortOrder: 2 },
        { value: 'KG', displayName: 'Kilogram', sortOrder: 3 },
        { value: 'BOX', displayName: 'Box', sortOrder: 4 },
        { value: 'SET', displayName: 'Set', sortOrder: 5 },
      ],
    },
    {
      code: 'WORK_ORDER_TYPE',
      name: 'Work Order Type',
      description: 'Types of work orders',
      tableName: 'WorkOrder',
      fieldName: 'type',
      isUserEditable: true,
      sortOrder: 7,
      items: [
        { value: 'INSTALL', displayName: 'Install', sortOrder: 1 },
        { value: 'DIAGNOSTIC', displayName: 'Diagnostic', sortOrder: 2 },
        { value: 'REPAIR', displayName: 'Repair', sortOrder: 3, isDefault: true },
      ],
    },
    {
      code: 'WORK_ORDER_STATUS',
      name: 'Work Order Status',
      description: 'Work order lifecycle states',
      tableName: 'WorkOrder',
      fieldName: 'status',
      isUserEditable: false, // System-managed
      sortOrder: 8,
      items: [
        { value: 'NEW', displayName: 'New', colorHex: '#3b82f6', sortOrder: 1, isDefault: true },
        { value: 'DISPATCHED', displayName: 'Dispatched', colorHex: '#8b5cf6', sortOrder: 2 },
        { value: 'ACCEPTED', displayName: 'Accepted', colorHex: '#06b6d4', sortOrder: 3 },
        { value: 'IN_PROGRESS', displayName: 'In Progress', colorHex: '#f59e0b', sortOrder: 4 },
        { value: 'DONE', displayName: 'Done', colorHex: '#10b981', sortOrder: 5 },
        { value: 'CANCELED', displayName: 'Canceled', colorHex: '#ef4444', sortOrder: 6 },
      ],
    },
    {
      code: 'INCIDENT_STATUS',
      name: 'Incident Status',
      description: 'Incident lifecycle states',
      tableName: 'Incident',
      fieldName: 'status',
      isUserEditable: false, // System-managed
      sortOrder: 9,
      items: [
        { value: 'CREATED', displayName: 'Created', colorHex: '#3b82f6', sortOrder: 1, isDefault: true },
        { value: 'IN_PROGRESS', displayName: 'In Progress', colorHex: '#f59e0b', sortOrder: 2 },
        { value: 'COMPLETED', displayName: 'Completed', colorHex: '#10b981', sortOrder: 3 },
        { value: 'WORK_ORDER_INITIATED', displayName: 'Work Order Initiated', colorHex: '#8b5cf6', sortOrder: 4 },
      ],
    },
    {
      code: 'DEVICE_STATUS',
      name: 'Device Status',
      description: 'Asset device monitoring status',
      tableName: 'Asset',
      fieldName: 'status',
      isUserEditable: false, // System-managed
      sortOrder: 10,
      items: [
        { value: 'ONLINE', displayName: 'Online', colorHex: '#10b981', sortOrder: 1 },
        { value: 'OFFLINE', displayName: 'Offline', colorHex: '#ef4444', sortOrder: 2 },
        { value: 'UNKNOWN', displayName: 'Unknown', colorHex: '#6b7280', sortOrder: 3, isDefault: true },
      ],
    },
    {
      code: 'PURCHASE_ORDER_STATUS',
      name: 'Purchase Order Status',
      description: 'Purchase order lifecycle states',
      tableName: 'PurchaseOrder',
      fieldName: 'status',
      isUserEditable: false, // System-managed
      sortOrder: 11,
      items: [
        { value: 'DRAFT', displayName: 'Draft', colorHex: '#6b7280', sortOrder: 1, isDefault: true },
        { value: 'ORDERED', displayName: 'Ordered', colorHex: '#3b82f6', sortOrder: 2 },
        { value: 'SHIPPED', displayName: 'Shipped', colorHex: '#f59e0b', sortOrder: 3 },
        { value: 'RECEIVED', displayName: 'Received', colorHex: '#10b981', sortOrder: 4 },
        { value: 'CANCELLED', displayName: 'Cancelled', colorHex: '#ef4444', sortOrder: 5 },
      ],
    },
    {
      code: 'STOCK_TRANSACTION_TYPE',
      name: 'Stock Transaction Type',
      description: 'Types of inventory transactions',
      tableName: 'StockTransaction',
      fieldName: 'type',
      isUserEditable: false, // System-managed (accounting logic)
      sortOrder: 12,
      items: [
        { value: 'PURCHASE_IN', displayName: 'Purchase In', sortOrder: 1 },
        { value: 'WORK_ORDER_OUT', displayName: 'Work Order Out', sortOrder: 2 },
        { value: 'ADJUSTMENT_IN', displayName: 'Adjustment In', sortOrder: 3 },
        { value: 'ADJUSTMENT_OUT', displayName: 'Adjustment Out', sortOrder: 4 },
        { value: 'RETURN_IN', displayName: 'Return In', sortOrder: 5 },
        { value: 'DAMAGED_OUT', displayName: 'Damaged Out', sortOrder: 6 },
      ],
    },
  ];

  // Seed categories and items
  for (const category of categories) {
    const { items, ...categoryData } = category;

    console.log(`  Creating category: ${categoryData.name}`);

    const createdCategory = await prisma.systemListCategory.upsert({
      where: { code: categoryData.code },
      update: categoryData,
      create: categoryData,
    });

    // Seed items
    for (const item of items) {
      await prisma.systemListItem.upsert({
        where: {
          categoryId_value: {
            categoryId: createdCategory.id,
            value: item.value,
          },
        },
        update: {
          displayName: item.displayName,
          colorHex: item.colorHex ?? null,
          icon: item.icon ?? null,
          sortOrder: item.sortOrder,
          isDefault: item.isDefault ?? false,
          isActive: true,
        },
        create: {
          categoryId: createdCategory.id,
          value: item.value,
          displayName: item.displayName,
          colorHex: item.colorHex ?? null,
          icon: item.icon ?? null,
          sortOrder: item.sortOrder,
          isDefault: item.isDefault ?? false,
          isActive: true,
        },
      });
    }

    console.log(`    ✓ Created ${items.length} items`);
  }

  console.log('✅ System Lists seeding complete!');
}

seedSystemLists()
  .catch((e) => {
    console.error('❌ Error seeding system lists:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
