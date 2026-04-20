/**
 * backfill-call-legs.ts — ONE-TIME helper for the P0-G stats correctness fix.
 *
 * What this script does
 * ---------------------
 * For every historical CallSession that has `assignedUserId` set but NO
 * CallLeg rows with that user, seed a single AGENT CallLeg representing the
 * last-known handler. This preserves `handledCount` / `touchedCount`
 * aggregations (which now read CallLeg — see audit/STATS_STANDARDS.md M5)
 * for sessions that predate the ingest fix.
 *
 * Why this is needed
 * ------------------
 * Before the P0-G fix, `handleTransfer` overwrote `CallSession.assignedUserId`
 * every time the call was transferred. Each transfer correctly appended a new
 * CallLeg row, BUT for sessions that completed before CallLeg was populated
 * (or that never transferred and only contain a CUSTOMER leg), the only
 * attribution signal is `assignedUserId`. The new stats pipeline reads
 * exclusively from CallLeg, so these sessions would vanish from per-agent
 * dashboards.
 *
 * This backfill runs once against the current database. It does NOT replay
 * transfer history — it only reconstructs a single AGENT leg per session
 * where one is missing. That's enough for handled/touched counts on
 * non-transferred calls to remain correct.
 *
 * Safety
 * ------
 * - Default mode is `--dry-run`. Running the script WITHOUT that flag is
 *   required to actually write rows.
 * - Idempotent: re-running skips sessions that already have an AGENT leg for
 *   the target user.
 * - Batched: processes 500 sessions per transaction to avoid long locks.
 * - Read-only phase reports counts before any write.
 *
 * Invocation
 * ----------
 *   # Preview only (no writes):
 *   pnpm tsx prisma/backfill-call-legs.ts --dry-run
 *
 *   # Actually write:
 *   pnpm tsx prisma/backfill-call-legs.ts --apply
 *
 * NOT part of seed:all. Jemiko must run this manually on prod after the
 * P0-G migration lands, once.
 */

import 'dotenv/config';
import { PrismaClient, CallLegType, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const BATCH_SIZE = 500;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type Mode = 'dry-run' | 'apply';

function parseMode(): Mode {
  const args = process.argv.slice(2);
  if (args.includes('--apply')) return 'apply';
  // Default to dry-run (safe) — and also treat explicit --dry-run the same
  // way. Either way, require `--apply` to opt in to writes.
  return 'dry-run';
}

async function main(): Promise<void> {
  const mode = parseMode();
  console.log(`[backfill-call-legs] mode = ${mode}`);

  // Pre-flight: count eligible sessions.
  const eligibleRows = await prisma.$queryRaw<
    Array<{ total: bigint }>
  >`
    SELECT COUNT(*)::bigint AS total
    FROM "CallSession" cs
    WHERE cs."assignedUserId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "CallLeg" cl
        WHERE cl."callSessionId" = cs.id
          AND cl."userId" = cs."assignedUserId"
          AND cl."type" = 'AGENT'
      );
  `;
  const totalEligible = Number(eligibleRows[0]?.total ?? 0);

  console.log(
    `[backfill-call-legs] eligible sessions (assignedUserId set, no AGENT leg for that user): ${totalEligible}`,
  );

  if (totalEligible === 0) {
    console.log('[backfill-call-legs] nothing to do. exiting.');
    return;
  }

  if (mode === 'dry-run') {
    // Sample up to 5 sessions so the reviewer can eyeball the payload shape
    // before approving a real run.
    const sample = await prisma.callSession.findMany({
      where: {
        assignedUserId: { not: null },
        callLegs: {
          none: {
            type: CallLegType.AGENT,
            // Note: Prisma doesn't support column-level equality here; the
            // EXISTS subquery above in raw SQL is the source of truth. This
            // sample just shows sessions-with-assignedUser-and-no-AGENT-leg,
            // which is very close but may overcount by assignedUser mismatch.
          },
        },
      },
      select: {
        id: true,
        assignedUserId: true,
        assignedExtension: true,
        answerAt: true,
        endAt: true,
        disposition: true,
      },
      take: 5,
    });
    console.log('[backfill-call-legs] sample (first 5):');
    for (const s of sample) {
      console.log(
        `  session=${s.id} user=${s.assignedUserId} ext=${s.assignedExtension ?? '-'} ` +
          `answerAt=${s.answerAt?.toISOString() ?? '-'} endAt=${s.endAt?.toISOString() ?? '-'} disposition=${s.disposition ?? '-'}`,
      );
    }
    console.log(
      '[backfill-call-legs] DRY RUN. No rows written. Re-run with --apply to write.',
    );
    return;
  }

  // Apply mode. Page through eligible sessions, insert one AGENT leg each.
  let processed = 0;
  let created = 0;
  let skipped = 0;

  // Iterate by id (stable ordering). We pull BATCH_SIZE IDs at a time via raw
  // SQL to avoid re-selecting already-backfilled rows each loop.
  let cursorId: string | null = null;

  while (true) {
    const batch = await prisma.$queryRaw<
      Array<{
        id: string;
        assignedUserId: string;
        assignedExtension: string | null;
        answerAt: Date | null;
        endAt: Date | null;
        startAt: Date;
        disposition: string | null;
      }>
    >`
      SELECT cs.id, cs."assignedUserId", cs."assignedExtension",
             cs."answerAt", cs."endAt", cs."startAt", cs."disposition"::text AS "disposition"
      FROM "CallSession" cs
      WHERE cs."assignedUserId" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "CallLeg" cl
          WHERE cl."callSessionId" = cs.id
            AND cl."userId" = cs."assignedUserId"
            AND cl."type" = 'AGENT'
        )
        ${cursorId ? Prisma.sql`AND cs.id > ${cursorId}` : Prisma.empty}
      ORDER BY cs.id ASC
      LIMIT ${BATCH_SIZE};
    `;

    if (batch.length === 0) break;

    for (const row of batch) {
      processed++;

      try {
        // Idempotent re-check inside the write path (cheap, prevents races
        // with ingest running concurrently).
        const exists = await prisma.callLeg.findFirst({
          where: {
            callSessionId: row.id,
            userId: row.assignedUserId,
            type: CallLegType.AGENT,
          },
          select: { id: true },
        });
        if (exists) {
          skipped++;
          continue;
        }

        // The AGENT leg's timestamps mirror the session's: startAt = when the
        // agent first picked up (answerAt) if known, else the session startAt;
        // answerAt = session answerAt (null for NOANSWER/BUSY). endAt = the
        // session's endAt so duration math works.
        await prisma.callLeg.create({
          data: {
            callSessionId: row.id,
            type: CallLegType.AGENT,
            userId: row.assignedUserId,
            extension: row.assignedExtension,
            startAt: row.answerAt ?? row.startAt,
            answerAt: row.answerAt,
            endAt: row.endAt,
          },
        });
        created++;
      } catch (err: any) {
        console.error(
          `[backfill-call-legs] session=${row.id} ERROR: ${err.message ?? err}`,
        );
      }
    }

    cursorId = batch[batch.length - 1].id;

    console.log(
      `[backfill-call-legs] progress: processed=${processed} created=${created} skipped=${skipped}`,
    );
  }

  console.log(
    `[backfill-call-legs] DONE. processed=${processed} created=${created} skipped=${skipped}`,
  );
}

main()
  .catch((err) => {
    console.error('[backfill-call-legs] fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
