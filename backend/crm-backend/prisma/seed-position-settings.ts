import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function seedPositionSettings() {
  console.log('🌱 Seeding Position Settings...');

  try {
    // Find or create "Head of Technical Department" position setting
    // Note: This assumes a Position with code "HEAD_OF_TECHNICAL" exists
    // If it doesn't exist, we'll create the setting without positionId initially
    const headOfTechPosition = await prisma.position.findFirst({
      where: {
        OR: [
          { code: 'HEAD_OF_TECHNICAL' },
          { code: 'HEAD_OF_TECHNICAL_DEPARTMENT' },
          { name: { contains: 'Technical', mode: 'insensitive' } },
        ],
      },
    });

    await prisma.positionSetting.upsert({
      where: { key: 'HEAD_OF_TECHNICAL_DEPARTMENT' },
      update: {
        positionId: headOfTechPosition?.id ?? null,
        description: 'Position that receives new work orders for assignment to technical employees',
      },
      create: {
        key: 'HEAD_OF_TECHNICAL_DEPARTMENT',
        positionId: headOfTechPosition?.id ?? null,
        description: 'Position that receives new work orders for assignment to technical employees',
      },
    });

    console.log('✅ Seeded Position Setting: HEAD_OF_TECHNICAL_DEPARTMENT');
    if (headOfTechPosition) {
      console.log(`   Linked to position: ${headOfTechPosition.name} (${headOfTechPosition.code})`);
    } else {
      console.log('   ⚠️  No matching position found. Update positionId manually after creating the position.');
    }
  } catch (error) {
    console.error('❌ Error seeding position settings:', error);
    throw error;
  }
}

seedPositionSettings()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
