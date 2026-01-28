import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const email = 'admin@crm.local';

  console.log(`🔧 Setting isSuperAdmin=true for ${email}...`);

  const user = await prisma.user.update({
    where: { email },
    data: {
      isSuperAdmin: true,
      role: 'ADMIN', // Also ensure role is ADMIN
    },
    select: {
      id: true,
      email: true,
      role: true,
      isSuperAdmin: true,
      isActive: true,
    },
  });

  console.log('✅ Updated user:', user);
  console.log(`✅ ${email} now has isSuperAdmin=${user.isSuperAdmin} and role=${user.role}`);
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
