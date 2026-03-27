import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('BackfillWorkOrderNotifications');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function backfillNotifications() {
  logger.log('🔧 Backfilling work order notifications...\n');

  // Get Head of Technical Department setting
  const setting = await prisma.positionSetting.findUnique({
    where: { key: 'HEAD_OF_TECHNICAL_DEPARTMENT' },
    include: {
      position: {
        include: {
          employees: {
            where: { status: 'ACTIVE' },
          },
        },
      },
    },
  });

  if (!setting || !setting.positionId || !setting.position) {
    logger.log('❌ Head of Technical Department setting not found or not linked to a position');
    return;
  }

  const headOfTechEmployeeIds = setting.position.employees.map((e) => e.id);
  logger.log(`Found ${headOfTechEmployeeIds.length} Head of Technical Department employee(s)\n`);

  // Get all work orders in CREATED status
  const workOrders = await prisma.workOrder.findMany({
    where: { status: 'CREATED' },
    include: {
      notifications: {
        select: { employeeId: true },
      },
    },
  });

  logger.log(`Found ${workOrders.length} work order(s) in CREATED status\n`);

  let created = 0;
  let skipped = 0;

  for (const wo of workOrders) {
    const existingEmployeeIds = new Set(wo.notifications.map((n) => n.employeeId));

    for (const employeeId of headOfTechEmployeeIds) {
      if (!existingEmployeeIds.has(employeeId)) {
        await prisma.workOrderNotification.create({
          data: {
            workOrderId: wo.id,
            employeeId,
          },
        });
        logger.log(`✅ Created notification for work order "${wo.title}" → Employee ID: ${employeeId}`);
        created++;
      } else {
        skipped++;
      }
    }
  }

  logger.log(`\n✅ Done! Created ${created} notification(s), skipped ${skipped} existing`);
}

backfillNotifications()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
