import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function checkHeadOfTech() {
  console.log('🔍 Checking Head of Technical Department setup...\n');

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
    console.log('❌ PositionSetting "HEAD_OF_TECHNICAL_DEPARTMENT" NOT FOUND');
    console.log('   Run: npx ts-node prisma/seed-position-settings.ts');
    return;
  }

  console.log('✅ PositionSetting found');
  console.log(`   Position ID: ${setting.positionId || 'NULL'}`);
  console.log(`   Description: ${setting.description || 'N/A'}\n`);

  if (!setting.positionId) {
    console.log('⚠️  Position ID is NULL - need to link to a position');
    console.log('   Available positions:');
    const positions = await prisma.position.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    });
    positions.forEach((p) => {
      console.log(`     - ${p.name} (${p.code}) - ID: ${p.id}`);
    });
    return;
  }

  // 2. Check Position
  if (!setting.position) {
    console.log('❌ Position not found for positionId:', setting.positionId);
    return;
  }

  console.log('✅ Position found');
  console.log(`   Name: ${setting.position.name}`);
  console.log(`   Code: ${setting.position.code}`);
  console.log(`   Active employees: ${setting.position.employees.length}\n`);

  // 3. List employees
  if (setting.position.employees.length === 0) {
    console.log('⚠️  No active employees with this position');
  } else {
    console.log('👥 Employees with this position:');
    setting.position.employees.forEach((emp) => {
      console.log(`   - ${emp.firstName} ${emp.lastName} (${emp.employeeId}) - ID: ${emp.id}`);
    });
  }

  // 4. Check recent work orders and notifications
  console.log('\n📋 Recent work orders (CREATED status):');
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
    console.log('   No work orders in CREATED status');
  } else {
    recentWorkOrders.forEach((wo) => {
      console.log(`\n   Work Order: ${wo.title} (ID: ${wo.id})`);
      console.log(`   Notifications: ${wo.notifications.length}`);
      wo.notifications.forEach((notif) => {
        console.log(
          `     - ${notif.employee.firstName} ${notif.employee.lastName} (${notif.employee.employeeId})`,
        );
      });
    });
  }

  // 5. Check EMP-001 specifically
  console.log('\n🔍 Checking EMP-001:');
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
    console.log('❌ EMP-001 not found');
  } else {
    console.log(`✅ Found: ${emp001.firstName} ${emp001.lastName}`);
    console.log(`   Position: ${emp001.position?.name || 'N/A'} (${emp001.position?.code || 'N/A'})`);
    console.log(`   Position ID: ${emp001.positionId || 'NULL'}`);
    console.log(`   Matches Head of Tech position? ${emp001.positionId === setting.positionId ? '✅ YES' : '❌ NO'}`);
    console.log(`   Notifications: ${emp001.workOrderNotifications.length}`);
    emp001.workOrderNotifications.forEach((notif) => {
      console.log(`     - ${notif.workOrder.title} (${notif.workOrder.status})`);
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
