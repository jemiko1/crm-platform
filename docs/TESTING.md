# Testing Guide

> How to set up, run, and write tests for the CRM-Platform backend.

---

## Overview

The backend uses **Jest** for both unit and e2e tests.

| Test type | Scope | Database | Command |
|-----------|-------|----------|---------|
| Unit | Individual services with mocked dependencies | None (mocked) | `pnpm test:unit` |
| E2E | Full HTTP request through the real app | Real Postgres | `pnpm test:e2e` |

---

## Prerequisites

- Node.js 22+
- pnpm 10+
- PostgreSQL 16+ (local or Docker)

---

## Setting Up the Test Database

### Option A: Local PostgreSQL

```bash
# Connect to Postgres and create the test database
psql -U postgres -c "CREATE DATABASE crm_test;"
```

### Option B: Docker

```bash
docker run -d --name crm-test-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=crm_test \
  -p 5432:5432 \
  postgres:16
```

### Configure .env.test

The file `backend/crm-backend/.env.test` is committed with sensible local defaults:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crm_test"
JWT_SECRET="test-jwt-secret-do-not-use-in-production"
JWT_EXPIRES_IN="1h"
```

Adjust if your local setup differs (different port, username, etc.).

---

## Running Tests

All commands run from `backend/crm-backend/`:

```bash
# Unit tests only (no DB required)
pnpm test:unit

# E2E tests (requires test DB)
pnpm test:e2e

# All tests
pnpm test

# Unit tests in watch mode (during development)
pnpm test:watch

# With coverage report
pnpm test:cov
```

### Windows-specific note

The commands are identical on Windows. If using PowerShell, ensure the test database is accessible at the URL in `.env.test`.

### Linux/macOS

Same commands. No differences.

---

## Test Architecture

### Unit tests

Located alongside their source files: `src/**/*.spec.ts`

Strategy:
- Mock `PrismaService` with jest mocks -- no real DB calls.
- Mock external services (JwtService, etc.).
- Test business logic, error handling, and edge cases.

Example structure:
```
src/
  auth/
    auth.service.ts
    auth.service.spec.ts      ← unit test
  buildings/
    buildings.service.ts
    buildings.service.spec.ts  ← unit test
```

### E2E tests

Located in `test/`: `test/*.e2e-spec.ts`

Strategy:
- Bootstrap the full NestJS app via `createTestApp()` (from `test/helpers/test-utils.ts`).
- Uses a real Postgres database pointed to by `.env.test`.
- `resetDatabase()` truncates all tables between tests for isolation.
- Global setup (`test/setup-e2e.ts`) runs `prisma migrate deploy` once before the suite.

### Test utilities (`test/helpers/test-utils.ts`)

| Function | Purpose |
|----------|---------|
| `createTestApp()` | Creates a NestJS app with the same pipes/filters as production |
| `resetDatabase(prisma)` | Truncates all tables (except migrations) with CASCADE |
| `createTestUser(prisma, overrides?)` | Seeds a User record and returns credentials |

---

## Writing New Tests

### Adding a unit test

1. Create `src/<module>/<service>.spec.ts` next to the service file.
2. Use `Test.createTestingModule` with mocked providers.
3. Test all meaningful code paths (success, errors, edge cases).

```typescript
import { Test } from "@nestjs/testing";
import { MyService } from "./my.service";
import { PrismaService } from "../prisma/prisma.service";

describe("MyService", () => {
  let service: MyService;
  let prisma: { myModel: { findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = { myModel: { findMany: jest.fn() } };
    const module = await Test.createTestingModule({
      providers: [
        MyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(MyService);
  });

  it("does something", async () => {
    prisma.myModel.findMany.mockResolvedValue([]);
    const result = await service.list();
    expect(result).toEqual([]);
  });
});
```

### Adding an e2e test

1. Create `test/<feature>.e2e-spec.ts`.
2. Use the shared helpers from `test/helpers/test-utils.ts`.
3. Call `resetDatabase()` in `beforeEach` for test isolation.

```typescript
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { PrismaService } from "../src/prisma/prisma.service";
import { createTestApp, resetDatabase } from "./helpers/test-utils";

describe("MyFeature (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());
  beforeEach(() => resetDatabase(prisma));

  it("GET /my-endpoint returns 200", async () => {
    await request(app.getHttpServer()).get("/my-endpoint").expect(200);
  });
});
```

---

## CI

Tests run automatically in GitHub Actions on every PR to `dev`, `staging`, or `master`. See [CI_CD.md](./CI_CD.md) for details.

The CI uses a Postgres service container, so no external database is needed.
