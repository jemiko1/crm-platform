/**
 * One-off script: Reset all active employee user passwords to "123456"
 * Usage: npx tsx src/scripts/reset-passwords.ts
 * Skips superadmin accounts.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  try {
    const hash = await bcrypt.hash('123456', 10);

    const result = await prisma.user.updateMany({
      where: {
        isActive: true,
        isSuperAdmin: false,
        employee: { status: 'ACTIVE' },
      },
      data: { passwordHash: hash },
    });

    console.log(`Updated ${result.count} active employee user passwords to "123456".`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
