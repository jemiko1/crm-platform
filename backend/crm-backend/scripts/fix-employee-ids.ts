import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

async function main() {
  // Find all employees with EMP- prefix
  const employees = await prisma.employee.findMany({
    where: { employeeId: { startsWith: 'EMP-' } },
    select: { id: true, employeeId: true },
  });

  // Find the maximum employee number
  let maxNumber = 0;
  for (const emp of employees) {
    const match = emp.employeeId.match(/EMP-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
  }
  console.log('Current max employee number:', maxNumber);

  // Fix EMP-NaN if it exists
  const nanEmployee = await prisma.employee.findFirst({
    where: { employeeId: 'EMP-NaN' },
  });

  if (nanEmployee) {
    const newId = `EMP-${(maxNumber + 1).toString().padStart(3, '0')}`;
    await prisma.employee.update({
      where: { id: nanEmployee.id },
      data: { employeeId: newId },
    });
    console.log(`Fixed EMP-NaN -> ${newId}`);
    maxNumber = maxNumber + 1;
  } else {
    console.log('No EMP-NaN found');
  }

  // Initialize the counter
  await prisma.externalIdCounter.upsert({
    where: { entity: 'employee' },
    update: { nextId: maxNumber + 1 },
    create: { entity: 'employee', nextId: maxNumber + 1 },
  });
  console.log(`Employee counter set to: ${maxNumber + 1}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
