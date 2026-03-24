# DEPENDENCIES_AND_CONFIG.md — Dependency & Config Snapshot

> **Last Updated**: 2026-03-24

---

## 1. Backend Dependencies (`backend/crm-backend/package.json`)

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@nestjs/common` | ^11.0.1 | NestJS core decorators, pipes, guards |
| `@nestjs/core` | ^11.0.1 | NestJS application core |
| `@nestjs/jwt` | ^11.0.2 | JWT token generation/validation |
| `@nestjs/mapped-types` | ^2.1.0 | DTO utility types (PartialType, PickType) |
| `@nestjs/passport` | ^11.0.5 | Passport.js integration for NestJS |
| `@nestjs/platform-express` | ^11.0.1 | Express HTTP adapter for NestJS |
| `@nestjs/platform-socket.io` | ^11.1.13 | Socket.IO WebSocket adapter |
| `@nestjs/schedule` | ^6.1.1 | Cron job scheduling (quality AI pipeline, CDR import) |
| `@nestjs/swagger` | ^11.2.4 | OpenAPI/Swagger documentation generation |
| `@nestjs/terminus` | ^11.1.1 | Health check indicators |
| `@nestjs/throttler` | ^6.5.0 | Rate limiting (60 req/min global) |
| `@nestjs/websockets` | ^11.1.13 | WebSocket gateway support |
| `@prisma/adapter-pg` | ^7.2.0 | Prisma PostgreSQL driver adapter |
| `@prisma/client` | ^7.2.0 | Prisma ORM client (auto-generated from schema) |
| `asterisk-manager` | ^0.2.0 | Asterisk AMI (Manager Interface) TCP client |
| `bcrypt` | ^6.0.0 | Password hashing (native C++ binding) |
| `bcryptjs` | ^3.0.3 | Password hashing (pure JS fallback) |
| `class-transformer` | ^0.5.1 | Object transformation for DTOs |
| `class-validator` | ^0.14.3 | Decorator-based DTO validation |
| `compression` | ^1.8.1 | Gzip response compression middleware |
| `cookie` | ^1.1.1 | Cookie parsing utilities |
| `cookie-parser` | ^1.4.7 | Express cookie parsing middleware |
| `helmet` | ^8.1.0 | HTTP security headers |
| `imapflow` | ^1.2.10 | IMAP email client (for receiving emails) |
| `nodemailer` | ^8.0.1 | SMTP email sending |
| `openai` | ^6.25.0 | OpenAI API client (Whisper transcription + GPT quality scoring) |
| `passport` | ^0.7.0 | Authentication framework |
| `passport-jwt` | ^4.0.1 | JWT strategy for Passport |
| `pg` | ^8.16.3 | PostgreSQL client (used by Prisma adapter) |
| `reflect-metadata` | ^0.2.2 | Metadata reflection (required by NestJS decorators) |
| `rxjs` | ^7.8.1 | Reactive extensions (NestJS internal dependency) |
| `socket.io` | ^4.8.3 | WebSocket server (messenger + telephony real-time) |
| `swagger-ui-express` | ^5.0.1 | Swagger UI serving |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@eslint/eslintrc` | ^3.2.0 | ESLint config utilities |
| `@eslint/js` | ^9.18.0 | ESLint core JS rules |
| `@nestjs/cli` | ^11.0.0 | NestJS CLI for building/scaffolding |
| `@nestjs/schematics` | ^11.0.0 | NestJS code generators |
| `@nestjs/testing` | ^11.0.1 | NestJS test utilities |
| `@prisma/config` | ^7.2.0 | Prisma configuration file support |
| `@types/bcrypt` | ^6.0.0 | TypeScript types for bcrypt |
| `@types/compression` | ^1.8.1 | TypeScript types for compression |
| `@types/cookie-parser` | ^1.4.10 | TypeScript types for cookie-parser |
| `@types/express` | ^5.0.0 | TypeScript types for Express |
| `@types/jest` | ^30.0.0 | TypeScript types for Jest |
| `@types/multer` | ^2.1.0 | TypeScript types for file uploads |
| `@types/node` | ^22.10.7 | TypeScript types for Node.js |
| `@types/nodemailer` | ^7.0.10 | TypeScript types for nodemailer |
| `@types/passport-jwt` | ^4.0.1 | TypeScript types for passport-jwt |
| `@types/supertest` | ^6.0.2 | TypeScript types for supertest |
| `dotenv` | ^17.2.3 | Environment variable loading |
| `eslint` | ^9.18.0 | JavaScript/TypeScript linter |
| `eslint-config-prettier` | ^10.0.1 | Disable ESLint rules conflicting with Prettier |
| `eslint-plugin-prettier` | ^5.2.2 | Run Prettier as ESLint rule |
| `globals` | ^16.0.0 | Global variable definitions for ESLint |
| `jest` | ^30.0.0 | Test runner |
| `prettier` | ^3.4.2 | Code formatter |
| `prisma` | ^7.2.0 | Prisma CLI (migrations, generate) |
| `source-map-support` | ^0.5.21 | Source map support for stack traces |
| `supertest` | ^7.0.0 | HTTP assertion library (E2E tests) |
| `ts-jest` | ^29.2.5 | TypeScript support for Jest |
| `ts-loader` | ^9.5.2 | TypeScript loader for Webpack |
| `ts-node` | ^10.9.2 | TypeScript execution for scripts |
| `tsconfig-paths` | ^4.2.0 | TypeScript path alias resolution |
| `typescript` | ^5.7.3 | TypeScript compiler |
| `typescript-eslint` | ^8.20.0 | TypeScript ESLint parser and rules |

---

## 2. Frontend Dependencies (`frontend/crm-frontend/package.json`)

### Production Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `next` | 16.1.1 | Next.js framework (App Router) |
| `react` | 19.2.3 | React UI library |
| `react-dom` | 19.2.3 | React DOM rendering |
| `date-fns` | ^4.1.0 | Date formatting and manipulation |
| `recharts` | ^3.8.0 | Chart library (call center stats, sales dashboard) |
| `socket.io-client` | ^4.8.3 | Socket.IO client for real-time features |

### Dev Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@tailwindcss/postcss` | ^4 | Tailwind CSS v4 PostCSS plugin |
| `@types/node` | ^20 | TypeScript types for Node.js |
| `@types/react` | ^19 | TypeScript types for React |
| `@types/react-dom` | ^19 | TypeScript types for React DOM |
| `eslint` | ^9 | JavaScript/TypeScript linter |
| `eslint-config-next` | 16.1.1 | Next.js ESLint configuration |
| `tailwindcss` | ^4 | Tailwind CSS v4 core |
| `typescript` | ^5 | TypeScript compiler |

---

## 3. Config Files Explained

### Backend Config

| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript config: ES2023 target, NodeNext modules, decorators enabled, strict null checks, source maps |
| `tsconfig.build.json` | Build-only TS config: extends base, excludes tests and seed files |
| `eslint.config.mjs` | ESLint flat config: recommended + typescript-eslint + prettier, ignores dist/prisma, no-explicit-any OFF |
| `prisma.config.ts` | Prisma datasource config with fallback URL for builds without DB, seed command definition |
| `pnpm-workspace.yaml` | pnpm workspace config with allowed native build dependencies |
| `.env` | Local environment variables (gitignored, contains secrets) |
| `.env.example` | Template of all environment variables with descriptions |
| `.env.test` | Test environment config (separate test database) |

### Frontend Config

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config: API rewrites (`/auth/*`, `/v1/*`, `/public/*` → backend) |
| `tsconfig.json` | TypeScript config: ES2017 target, bundler module resolution, JSX react-jsx, `@/*` path alias |
| `eslint.config.mjs` | ESLint flat config: `eslint-config-next` with core-web-vitals + typescript |
| `postcss.config.mjs` | PostCSS config: only `@tailwindcss/postcss` plugin |
| `src/app/globals.css` | Tailwind v4 theme: CSS variables for colors, fonts, dark mode support |

### No Tailwind Config File

Tailwind v4 uses PostCSS plugin + CSS-based configuration. Theme tokens defined in `globals.css` via `@theme inline { ... }`. There is **no** `tailwind.config.ts` or `tailwind.config.js`.

### No Prettier Config File

No `.prettierrc` or `prettier.config.*` exists in either backend or frontend. Prettier runs with defaults via ESLint integration (backend) or not at all (frontend).

---

## 4. CI/CD Setup

### GitHub Actions (`.github/workflows/ci.yml`)

**Triggers**:
- Pull requests to `dev`, `staging`, `master`
- Pushes to `dev`

**Jobs**:

| Job | What It Does |
|-----|-------------|
| `backend-test` | Install deps → prisma generate → `pnpm test:unit` |
| `backend-typecheck` | Install deps → prisma generate → `pnpm typecheck` (`tsc --noEmit`) |
| `frontend-build` | Install deps → `pnpm build` (Next.js production build) |

**Environment**: Ubuntu latest, Node.js 20, pnpm 9

**No automated deployment** in CI — Railway handles deployment automatically from branch pushes.

### Workflow Guidance (`.github/workflows/workflow-guidance.yml`)

Additional workflow configuration file (details not documented here).

### GitHub Templates

- `.github/PULL_REQUEST_TEMPLATE.md` — PR template
- `.github/ISSUE_TEMPLATE/bug_report.yml` — Bug report issue template
- `.github/WORKFLOW_AUTOMATION_PLAN.md` — Planned automation improvements

---

## 5. Deployment Details

### Platform: Railway

| Service | Root Directory | Build Command | Start Command |
|---------|---------------|---------------|---------------|
| **PostgreSQL** | — (Railway plugin) | — | — |
| **Backend** | `backend/crm-backend` | `pnpm install --frozen-lockfile && pnpm build` | `pnpm start:railway` |
| **Frontend** | `frontend/crm-frontend` | `pnpm install --frozen-lockfile && pnpm build` | `pnpm start` |

### Railway Start Commands Explained

**Backend `start:railway`** script:
```bash
prisma migrate deploy && npx tsx prisma/seed-permissions.ts && node dist/main
```
This runs pending migrations, seeds permissions, then starts the compiled app.

**Frontend `start`** script:
```bash
next start --port ${PORT:-3000}
```
Railway sets `PORT` automatically.

### Production Domain

- **Primary**: `crm28.asg.ge`
- **Deployment trigger**: Push to `master` branch
- **Auto-deploy**: Yes (Railway watches the branch)

### Production Environment Variables

Backend requires: `DATABASE_URL` (Railway Postgres ref), `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGINS`, `COOKIE_SECURE=true`, `CLIENTCHATS_WEBHOOK_BASE_URL`

Frontend requires: `API_BACKEND_URL` (internal Railway URL to backend service), `PORT` (auto-set by Railway)

### Branch Flow for Deployment

```
feature/* → PR → dev (daily work)
dev → PR → staging (pre-production testing)
staging → PR → master (production deploy, Railway auto-deploys)
```

---

## 6. Package.json Scripts

### Backend Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `build` | `prisma generate && nest build` | Generate Prisma client + compile TypeScript |
| `start` | `nest start` | Start compiled app |
| `start:dev` | `nest start --watch` | Start with hot reload (development) |
| `start:debug` | `nest start --debug --watch` | Start with debugger + hot reload |
| `start:prod` | `node dist/main` | Start compiled app (production) |
| `start:railway` | `prisma migrate deploy && npx tsx prisma/seed-permissions.ts && node dist/main` | Railway deployment start |
| `seed:permissions` | `npx tsx prisma/seed-permissions.ts` | Seed RBAC permissions |
| `format` | `prettier --write "src/**/*.ts" "test/**/*.ts"` | Format all source files |
| `lint` | `eslint "{src,apps,libs,test}/**/*.ts"` | Lint all source files |
| `lint:fix` | `eslint ... --fix` | Lint and auto-fix |
| `typecheck` | `tsc --noEmit` | TypeScript type checking only |
| `test` | `jest` | Run all tests |
| `test:unit` | `jest --testPathPatterns=\.spec\.ts$` | Run unit tests only |
| `test:watch` | `jest --watch` | Run tests in watch mode |
| `test:cov` | `jest --coverage` | Run tests with coverage report |
| `test:e2e` | `jest --config ./test/jest-e2e.json --runInBand --detectOpenHandles --forceExit` | Run E2E tests |

### Frontend Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev -p 4002` | Start dev server (port 4002 by default in script, usually overridden to 3002) |
| `build` | `next build` | Production build |
| `start` | `next start --port ${PORT:-3000}` | Start production server |
| `lint` | `eslint` | Lint source files |
| `typecheck` | `tsc --noEmit` | TypeScript type checking |
