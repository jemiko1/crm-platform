import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // process.env used instead of Prisma's env() so builds succeed without DATABASE_URL.
    // prisma generate doesn't connect — only migrate/seed need a real URL at runtime.
    url: process.env.DATABASE_URL ?? 'postgresql://build:build@localhost:5432/build',
  },
  migrations: {
    seed: 'pnpm exec ts-node prisma/seed.ts',
  },
});
