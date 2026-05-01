# Cron Jobs

> Reference detail. CLAUDE.md only points here. Update both when adding/removing a cron.

## Backend (NestJS @Cron)

| Service | Schedule | What it does | Concern |
|---------|----------|-------------|---------|
| `escalation.service.ts` | Every 1 min | Check chat SLA rules | Overlap-guarded |
| `cdr-import.service.ts` | Every 5 min | Import CDR from Asterisk | — |
| `asterisk-sync.service.ts` | Every 5 min | Sync extension/queue state | — |
| `quality-pipeline.service.ts` | Every 2 min | OpenAI call reviews | Overlap-guarded |
| `operator-break.service.ts` `autoCloseStaleBreaks` | Every 30 min | Auto-close active operator breaks past `COMPANY_WORK_END_HOUR` (default 19) or older than 12h | Race-safe via `updateMany` with `endedAt IS NULL` predicate |

## Core Sync Bridge (PM2, separate process on the VM)

| Task | Schedule | What it does | Concern |
|---------|----------|-------------|---------|
| Delta poll (timestamp + ID sweep) | Every 5 min | Sync changed/new buildings, clients, assets from core MySQL | Overlap-guarded (10 min timeout) |
| Count check | Every 60 min | Compare entity counts core vs CRM, log mismatches | Requires bridge-health endpoint (shared secret) |
| Gap repair | 3 AM daily | Fix mismatches via ID-set diff | Only runs if countMismatches non-empty |
| Gates/contacts reload | 4 AM daily | Full reload of tables without timestamps | — |
| Failed event retry | Every 30 min | Re-process FAILED SyncEvents (max 3 retries) | — |
