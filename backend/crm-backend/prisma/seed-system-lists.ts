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
  displayNameKa?: string;
  sortOrder: number;
  colorHex?: string;
  icon?: string;
  isDefault?: boolean;
  isSystemManaged?: boolean;
};

async function seedSystemLists() {
  console.log('🌱 Seeding System Lists...');

  // Define all list categories and their items
  const categories: Array<{
    code: string;
    name: string;
    nameKa?: string;
    description: string;
    tableName: string;
    fieldName: string;
    isUserEditable: boolean;
    sortOrder: number;
    items: SeedItem[];
  }> = [
    {
      code: 'ASSET_TYPE',
      name: 'Device Type',
      nameKa: 'მოწყობილობის ტიპი',
      description: 'Types of devices in buildings',
      tableName: 'Asset',
      fieldName: 'type',
      isUserEditable: true,
      sortOrder: 1,
      items: [
        { value: 'ELEVATOR', displayName: 'Elevator', displayNameKa: 'ლიფტი', sortOrder: 1 },
        { value: 'ENTRANCE_DOOR', displayName: 'Entrance Door', displayNameKa: 'შესასვლელი კარი', sortOrder: 2 },
        { value: 'INTERCOM', displayName: 'Intercom', displayNameKa: 'დომოფონი', sortOrder: 3 },
        { value: 'SMART_GSM_GATE', displayName: 'Smart GSM Gate', displayNameKa: 'სმარტ GSM ჭიშკარი', sortOrder: 4 },
        { value: 'SMART_DOOR_GSM', displayName: 'Smart Door GSM', displayNameKa: 'სმარტ კარი GSM', sortOrder: 5 },
        { value: 'BOOM_BARRIER', displayName: 'Boom Barrier', displayNameKa: 'შლაგბაუმი', sortOrder: 6 },
        { value: 'OTHER', displayName: 'Other', displayNameKa: 'სხვა', sortOrder: 7 },
      ],
    },
    {
      code: 'CONTACT_METHOD',
      name: 'Contact Method',
      nameKa: 'კონტაქტის მეთოდი',
      description: 'How incidents are reported',
      tableName: 'Incident',
      fieldName: 'contactMethod',
      isUserEditable: true,
      sortOrder: 2,
      items: [
        { value: 'PHONE', displayName: 'Phone', displayNameKa: 'ტელეფონი', sortOrder: 1, isDefault: true },
        { value: 'EMAIL', displayName: 'Email', displayNameKa: 'ელ. ფოსტა', sortOrder: 2 },
        { value: 'IN_PERSON', displayName: 'In-Person', displayNameKa: 'პირადად', sortOrder: 3 },
        { value: 'OTHER', displayName: 'Other', displayNameKa: 'სხვა', sortOrder: 4 },
      ],
    },
    {
      code: 'INCIDENT_TYPE',
      name: 'Incident Type',
      nameKa: 'ინციდენტის ტიპი',
      description: 'Categories of incidents',
      tableName: 'Incident',
      fieldName: 'incidentType',
      isUserEditable: true,
      sortOrder: 3,
      items: [
        { value: 'Hardware Failure', displayName: 'Hardware Failure', displayNameKa: 'აპარატურის გაუმართაობა', sortOrder: 1 },
        { value: 'Software/System Issue', displayName: 'Software/System Issue', displayNameKa: 'პროგრამული/სისტემური პრობლემა', sortOrder: 2 },
        { value: 'Access Problem', displayName: 'Access Problem', displayNameKa: 'წვდომის პრობლემა', sortOrder: 3 },
        { value: 'Maintenance Request', displayName: 'Maintenance Request', displayNameKa: 'ტექნიკური მომსახურების მოთხოვნა', sortOrder: 4 },
        { value: 'Safety Concern', displayName: 'Safety Concern', displayNameKa: 'უსაფრთხოების პრობლემა', sortOrder: 5 },
        { value: 'Other', displayName: 'Other', displayNameKa: 'სხვა', sortOrder: 6 },
      ],
    },
    {
      code: 'INCIDENT_PRIORITY',
      name: 'Incident Priority',
      nameKa: 'ინციდენტის პრიორიტეტი',
      description: 'Incident severity levels',
      tableName: 'Incident',
      fieldName: 'priority',
      isUserEditable: true,
      sortOrder: 4,
      items: [
        { value: 'LOW', displayName: 'Low', displayNameKa: 'დაბალი', colorHex: '#6b7280', sortOrder: 1 },
        { value: 'MEDIUM', displayName: 'Medium', displayNameKa: 'საშუალო', colorHex: '#3b82f6', sortOrder: 2, isDefault: true },
        { value: 'HIGH', displayName: 'High', displayNameKa: 'მაღალი', colorHex: '#f59e0b', sortOrder: 3 },
        { value: 'CRITICAL', displayName: 'Critical', displayNameKa: 'კრიტიკული', colorHex: '#ef4444', sortOrder: 4 },
      ],
    },
    {
      code: 'PRODUCT_CATEGORY',
      name: 'Product Category',
      nameKa: 'პროდუქტის კატეგორია',
      description: 'Inventory product categories',
      tableName: 'InventoryProduct',
      fieldName: 'category',
      isUserEditable: true,
      sortOrder: 5,
      items: [
        { value: 'ROUTER', displayName: 'Router', displayNameKa: 'როუტერი', sortOrder: 1, isDefault: true },
        { value: 'CONTROLLER', displayName: 'Controller', displayNameKa: 'კონტროლერი', sortOrder: 2 },
        { value: 'SENSOR', displayName: 'Sensor', displayNameKa: 'სენსორი', sortOrder: 3 },
        { value: 'CABLE', displayName: 'Cable', displayNameKa: 'კაბელი', sortOrder: 4 },
        { value: 'ACCESSORY', displayName: 'Accessory', displayNameKa: 'აქსესუარი', sortOrder: 5 },
        { value: 'HARDWARE', displayName: 'Hardware', displayNameKa: 'აპარატურა', sortOrder: 6 },
        { value: 'SOFTWARE', displayName: 'Software', displayNameKa: 'პროგრამა', sortOrder: 7 },
        { value: 'OTHER', displayName: 'Other', displayNameKa: 'სხვა', sortOrder: 8 },
      ],
    },
    {
      code: 'PRODUCT_UNIT',
      name: 'Product Unit',
      nameKa: 'პროდუქტის ერთეული',
      description: 'Measurement units for inventory',
      tableName: 'InventoryProduct',
      fieldName: 'unit',
      isUserEditable: true,
      sortOrder: 6,
      items: [
        { value: 'PIECE', displayName: 'Piece', displayNameKa: 'ცალი', sortOrder: 1, isDefault: true },
        { value: 'METER', displayName: 'Meter', displayNameKa: 'მეტრი', sortOrder: 2 },
        { value: 'KG', displayName: 'Kilogram', displayNameKa: 'კილოგრამი', sortOrder: 3 },
        { value: 'BOX', displayName: 'Box', displayNameKa: 'ყუთი', sortOrder: 4 },
        { value: 'SET', displayName: 'Set', displayNameKa: 'ნაკრები', sortOrder: 5 },
      ],
    },
    {
      code: 'WORK_ORDER_TYPE',
      name: 'Work Order Type',
      nameKa: 'გამოძახების ტიპი',
      description: 'Types of work orders',
      tableName: 'WorkOrder',
      fieldName: 'type',
      isUserEditable: true,
      sortOrder: 7,
      items: [
        { value: 'INSTALLATION', displayName: 'Installation', displayNameKa: 'ინსტალაცია', sortOrder: 1, isSystemManaged: true },
        { value: 'DIAGNOSTIC', displayName: 'Diagnostic', displayNameKa: 'დიაგნოსტიკა', sortOrder: 2, isSystemManaged: true },
        { value: 'RESEARCH', displayName: 'Research', displayNameKa: 'მოკვლევა', sortOrder: 3, isSystemManaged: true },
        { value: 'DEACTIVATE', displayName: 'Deactivate', displayNameKa: 'დემონტაჟი', sortOrder: 4, isSystemManaged: true },
        { value: 'REPAIR_CHANGE', displayName: 'Repair/Change', displayNameKa: 'შეცვლა', sortOrder: 5, isDefault: true, isSystemManaged: true },
        { value: 'ACTIVATE', displayName: 'Activate', displayNameKa: 'ჩართვა', sortOrder: 6, isSystemManaged: true },
      ],
    },
    {
      code: 'WORK_ORDER_STATUS',
      name: 'Work Order Status',
      nameKa: 'გამოძახების სტატუსი',
      description: 'Work order lifecycle states',
      tableName: 'WorkOrder',
      fieldName: 'status',
      isUserEditable: false,
      sortOrder: 8,
      items: [
        { value: 'NEW', displayName: 'New', displayNameKa: 'ახალი', colorHex: '#3b82f6', sortOrder: 1, isDefault: true },
        { value: 'DISPATCHED', displayName: 'Dispatched', displayNameKa: 'გაგზავნილი', colorHex: '#8b5cf6', sortOrder: 2 },
        { value: 'ACCEPTED', displayName: 'Accepted', displayNameKa: 'მიღებული', colorHex: '#06b6d4', sortOrder: 3 },
        { value: 'IN_PROGRESS', displayName: 'In Progress', displayNameKa: 'მიმდინარე', colorHex: '#f59e0b', sortOrder: 4 },
        { value: 'DONE', displayName: 'Done', displayNameKa: 'დასრულებული', colorHex: '#10b981', sortOrder: 5 },
        { value: 'CANCELED', displayName: 'Canceled', displayNameKa: 'გაუქმებული', colorHex: '#ef4444', sortOrder: 6 },
      ],
    },
    {
      code: 'INCIDENT_STATUS',
      name: 'Incident Status',
      nameKa: 'ინციდენტის სტატუსი',
      description: 'Incident lifecycle states',
      tableName: 'Incident',
      fieldName: 'status',
      isUserEditable: false,
      sortOrder: 9,
      items: [
        { value: 'CREATED', displayName: 'Created', displayNameKa: 'შექმნილი', colorHex: '#3b82f6', sortOrder: 1, isDefault: true },
        { value: 'IN_PROGRESS', displayName: 'In Progress', displayNameKa: 'მიმდინარე', colorHex: '#f59e0b', sortOrder: 2 },
        { value: 'COMPLETED', displayName: 'Completed', displayNameKa: 'დასრულებული', colorHex: '#10b981', sortOrder: 3 },
        { value: 'WORK_ORDER_INITIATED', displayName: 'Work Order Initiated', displayNameKa: 'გამოძახება ინიცირებულია', colorHex: '#8b5cf6', sortOrder: 4 },
      ],
    },
    {
      code: 'DEVICE_STATUS',
      name: 'Device Status',
      nameKa: 'მოწყობილობის სტატუსი',
      description: 'Asset device monitoring status',
      tableName: 'Asset',
      fieldName: 'status',
      isUserEditable: false,
      sortOrder: 10,
      items: [
        { value: 'ONLINE', displayName: 'Online', displayNameKa: 'ონლაინ', colorHex: '#10b981', sortOrder: 1 },
        { value: 'OFFLINE', displayName: 'Offline', displayNameKa: 'ოფლაინ', colorHex: '#ef4444', sortOrder: 2 },
        { value: 'UNKNOWN', displayName: 'Unknown', displayNameKa: 'უცნობი', colorHex: '#6b7280', sortOrder: 3, isDefault: true },
      ],
    },
    {
      code: 'PURCHASE_ORDER_STATUS',
      name: 'Purchase Order Status',
      nameKa: 'შეკვეთის სტატუსი',
      description: 'Purchase order lifecycle states',
      tableName: 'PurchaseOrder',
      fieldName: 'status',
      isUserEditable: false,
      sortOrder: 11,
      items: [
        { value: 'DRAFT', displayName: 'Draft', displayNameKa: 'პროექტი', colorHex: '#6b7280', sortOrder: 1, isDefault: true },
        { value: 'ORDERED', displayName: 'Ordered', displayNameKa: 'შეკვეთილი', colorHex: '#3b82f6', sortOrder: 2 },
        { value: 'SHIPPED', displayName: 'Shipped', displayNameKa: 'გაგზავნილი', colorHex: '#f59e0b', sortOrder: 3 },
        { value: 'RECEIVED', displayName: 'Received', displayNameKa: 'მიღებული', colorHex: '#10b981', sortOrder: 4 },
        { value: 'CANCELLED', displayName: 'Cancelled', displayNameKa: 'გაუქმებული', colorHex: '#ef4444', sortOrder: 5 },
      ],
    },
    {
      code: 'CALL_REPORT_CATEGORY',
      name: 'Call Report Categories',
      nameKa: 'ზარის ანგარიშის კატეგორიები',
      description: 'Categories for call center reports',
      tableName: 'CallReportLabel',
      fieldName: 'categoryCode',
      isUserEditable: true,
      sortOrder: 13,
      items: [
        { value: 'ADDRESS_WORKHOURS', displayName: 'Address / Working hours', displayNameKa: 'მისამართები/სამუშაო საათები', sortOrder: 1 },
        { value: 'CODE_INSTRUCTION', displayName: 'Code instruction', displayNameKa: 'კოდის ინსტრუქცია', sortOrder: 2 },
        { value: 'CODE_USAGE_PROBLEM', displayName: 'Code usage problem', displayNameKa: 'კოდით სარგებლობის პრობლემა', sortOrder: 3 },
        { value: 'BACKUP_CHIP_ACTIVATION', displayName: 'Backup chip activation', displayNameKa: 'სარეზერვო ჩიპის გააქტიურება', sortOrder: 4 },
        { value: 'CHIP_USAGE_PROBLEM', displayName: 'Chip usage problem', displayNameKa: 'ჩიპით სარგებლობის პრობლემა', sortOrder: 5 },
        { value: 'CHIP_DEACTIVATION', displayName: 'Chip deactivation', displayNameKa: 'ჩიპის გაუქმება', sortOrder: 6 },
      ],
    },
    {
      code: 'STOCK_TRANSACTION_TYPE',
      name: 'Stock Transaction Type',
      nameKa: 'მარაგის ტრანზაქციის ტიპი',
      description: 'Types of inventory transactions',
      tableName: 'StockTransaction',
      fieldName: 'type',
      isUserEditable: false,
      sortOrder: 12,
      items: [
        { value: 'PURCHASE_IN', displayName: 'Purchase In', displayNameKa: 'შესყიდვა', sortOrder: 1 },
        { value: 'WORK_ORDER_OUT', displayName: 'Work Order Out', displayNameKa: 'გამოძახებით გატანა', sortOrder: 2 },
        { value: 'ADJUSTMENT_IN', displayName: 'Adjustment In', displayNameKa: 'კორექტირება შემოტანა', sortOrder: 3 },
        { value: 'ADJUSTMENT_OUT', displayName: 'Adjustment Out', displayNameKa: 'კორექტირება გატანა', sortOrder: 4 },
        { value: 'RETURN_IN', displayName: 'Return In', displayNameKa: 'დაბრუნება', sortOrder: 5 },
        { value: 'DAMAGED_OUT', displayName: 'Damaged Out', displayNameKa: 'დაზიანებული გატანა', sortOrder: 6 },
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
          displayNameKa: item.displayNameKa ?? null,
          colorHex: item.colorHex ?? null,
          icon: item.icon ?? null,
          sortOrder: item.sortOrder,
          isDefault: item.isDefault ?? false,
          isActive: true,
          isSystemManaged: item.isSystemManaged ?? false,
        },
        create: {
          categoryId: createdCategory.id,
          value: item.value,
          displayName: item.displayName,
          displayNameKa: item.displayNameKa ?? null,
          colorHex: item.colorHex ?? null,
          icon: item.icon ?? null,
          sortOrder: item.sortOrder,
          isDefault: item.isDefault ?? false,
          isActive: true,
          isSystemManaged: item.isSystemManaged ?? false,
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
