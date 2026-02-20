/**
 * Replay sample telephony events against a running local server.
 *
 * Usage:
 *   npx ts-node src/telephony/fixtures/replay-events.ts
 *
 * Env vars (optional):
 *   BASE_URL                 default http://localhost:3000
 *   TELEPHONY_INGEST_SECRET  default test-telephony-secret
 */

import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const SECRET = process.env.TELEPHONY_INGEST_SECRET ?? 'test-telephony-secret';

async function main() {
  const filePath = path.join(__dirname, 'sample-events.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const fixture = JSON.parse(raw);
  const events: any[] = fixture.events;

  console.log(`Replaying ${events.length} events to ${BASE_URL}/v1/telephony/events`);

  const batchSize = 5;
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < events.length; i += batchSize) {
    const batch = events.slice(i, i + batchSize);

    const res = await fetch(`${BASE_URL}/v1/telephony/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-telephony-secret': SECRET,
      },
      body: JSON.stringify({ events: batch }),
    });

    if (!res.ok) {
      console.error(`Batch ${i / batchSize + 1} failed: ${res.status} ${res.statusText}`);
      const body = await res.text();
      console.error(body);
      errors += batch.length;
      continue;
    }

    const result = await res.json();
    processed += result.processed ?? 0;
    skipped += result.skipped ?? 0;
    errors += (result.errors?.length ?? 0);

    console.log(
      `Batch ${Math.floor(i / batchSize) + 1}: processed=${result.processed}, skipped=${result.skipped}, errors=${result.errors?.length ?? 0}`,
    );
  }

  console.log(`\nDone. Total: processed=${processed}, skipped=${skipped}, errors=${errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
