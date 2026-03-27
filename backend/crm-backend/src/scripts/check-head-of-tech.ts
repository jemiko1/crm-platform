import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('CheckHeadOfTech');

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function checkHeadOfTech() {
  logger.log('🔍 Checking Head of Technical Department setup...\n');

  // 1. Check PositionSetting
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

  if (!setting) {
    logger.log('❌ PositionSetting "HEAD_OF_TECHNICAL_DEPARTMENT" NOT FOUND');
    logger.log('   Run: npx ts-node prisma/seed-position-settings.ts');
    return;
  }

  logger.log('✅ PositionSetting found');
  logger.log(`   Position ID: ${setting.positionId || 'NULL'}`);
  logger.log(`   Description: ${setting.description || 'N/A'}\n`);

  if (!setting.positionId) {
    logger.log('⚠️  Position ID is NULL - need to link to a position');
    logger.log('   Available positions:');
    const positions = await prisma.position.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });
    positions.forEach((p) => {
      logger.log(`     - ${p.name} (${p.code}) - ID: ${p.id}`);
    });
    return;
  }

  // 2. Check Position
  if (!setting.position) {
    logger.log(`❌ Position not found for positionId: ${setting.positionId}`);
    return;
  }

  logger.log('✅ Position found');
  logger.log(`   Name: ${setting.position.name}`);
  logger.log(`   Code: ${setting.position.code}`);
  logger.log(`   Active employees: ${setting.position.employees.length}\n`);

  // 3. List employees
  if (setting.position.employees.length === 0) {
    logger.log('⚠️  No active employees with this position');
  } else {
    logger.log('👥 Employees with this position:');
    setting.position.employees.forEach((emp) => {
      logger.log(`   - ${emp.firstName} ${emp.lastName} (${emp.employeeId}) - ID: ${emp.id}`);
    });
  }

  // 4. Check recent work orders and notifications
  logger.log('\n📋 Recent work orders (CREATED status):');
  const recentWorkOrders = await prisma.workOrder.findMany({
    where: { status: 'CREATED' },
    take: 5,
    orderBy: { createdAt: 'desc' },
    include: {
      notifications: {
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
            },
          },
        },
      },
    },
  });

  if (recentWorkOrders.length === 0) {
    logger.log('   No work orders in CREATED status');
  } else {
    recentWorkOrders.forEach((wo) => {
      logger.log(`\n   Work Order: ${wo.title} (ID: ${wo.id})`);
      logger.log(`   Notifications: ${wo.notifications.length}`);
      wo.notifications.forEach((notif) => {
        logger.log(
          `     - ${notif.employee.firstName} ${notif.employee.lastName} (${notif.employee.employeeId})`,
        );
      });
    });
  }

  // 5. Check EMP-001 specifically
  logger.log('\n🔍 Checking EMP-001:');
  const emp001 = await prisma.employee.findFirst({
    where: { employeeId: 'EMP-001' },
    include: {
      position: true,
      workOrderNotifications: {
        include: {
          workOrder: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!emp001) {
    logger.log('❌ EMP-001 not found');
  } else {
    logger.log(`✅ Found: ${emp001.firstName} ${emp001.lastName}`);
    logger.log(`   Position: ${emp001.position?.name || 'N/A'} (${emp001.position?.code || 'N/A'})`);
    logger.log(`   Position ID: ${emp001.positionId || 'NULL'}`);
    logger.log(`   Matches Head of Tech position? ${emp001.positionId === setting.positionId ? '✅ YES' : '❌ NO'}`);
    logger.log(`   Notifications: ${emp001.workOrderNotifications.length}`);
    emp001.workOrderNotifications.forEach((notif) => {
      logger.log(`     - ${notif.workOrder.title} (${notif.workOrder.status})`);
    });
  }
}

checkHeadOfTech()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
