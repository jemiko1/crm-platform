import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/prisma/prisma.service";
import { HttpExceptionFilter } from "../../src/common/filters/http-exception.filter";
import cookieParser from "cookie-parser";
import { config } from "dotenv";
import { resolve } from "path";
import * as bcrypt from "bcrypt";

config({ path: resolve(__dirname, "../../.env.test"), override: true });

/**
 * Bootstraps a NestJS application identical to production
 * (validation pipes, cookie parser, exception filters).
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.init();
  return app;
}

/**
 * Truncates all application tables (preserving schema/migrations).
 * Uses CASCADE to handle foreign key constraints.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables: Array<{ tablename: string }> = await prisma.$queryRawUnsafe(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('_prisma_migrations')
  `);

  if (tables.length === 0) return;

  const tableNames = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`,
  );
}

/**
 * Seeds a test user and returns credentials + user record.
 * Useful for e2e tests that need an authenticated session.
 */
export async function createTestUser(
  prisma: PrismaService,
  overrides: {
    email?: string;
    password?: string;
    role?: "ADMIN" | "CALL_CENTER" | "TECHNICIAN" | "WAREHOUSE" | "MANAGER";
    isActive?: boolean;
    isSuperAdmin?: boolean;
  } = {},
) {
  const email = overrides.email ?? "test@crm.local";
  const password = overrides.password ?? "TestPass123!";
  const role = overrides.role ?? "ADMIN";
  const isActive = overrides.isActive ?? true;
  const isSuperAdmin = overrides.isSuperAdmin ?? false;

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role,
      isActive,
      isSuperAdmin,
    },
  });

  return { user, email, password };
}
