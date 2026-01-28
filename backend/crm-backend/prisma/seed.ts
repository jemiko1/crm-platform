import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@crm.local';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      isSuperAdmin: true, // Ensure admin has super admin flag
    },
    create: {
      email,
      passwordHash,
      role: UserRole.ADMIN,
      isActive: true,
      isSuperAdmin: true, // Ensure admin has super admin flag
    },
    select: { id: true, email: true, role: true, isActive: true, isSuperAdmin: true, createdAt: true },
  });

  console.log('✅ Seeded ADMIN user:', user);
  console.log('🔑 Login credentials:');
  console.log('   email:', email);
  console.log('   password:', password);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
