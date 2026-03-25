/**
 * Orchestrator seed script — runs all seed scripts in the correct
 * dependency order so foreign-key constraints are never violated.
 *
 * Usage:  npx tsx prisma/seed-all.ts
 */
import "dotenv/config";
import { execSync } from "child_process";

const SEED_ORDER = [
  "prisma/seed.ts",
  "prisma/seed-permissions.ts",
  "prisma/seed-rbac.ts",
  "prisma/seed-system-lists.ts",
  "prisma/seed-workflow-steps.ts",
  "prisma/seed-position-settings.ts",
  "prisma/seed-employees.ts",
  "prisma/seed-sales.ts",
];

async function main() {
  console.log("=== Running all seed scripts in order ===\n");

  for (const script of SEED_ORDER) {
    console.log(`\n--- ${script} ---`);
    try {
      execSync(`npx tsx ${script}`, {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      console.log(`  OK`);
    } catch {
      console.error(`\n  FAILED: ${script}`);
      process.exit(1);
    }
  }

  console.log("\n=== All seeds completed successfully ===");
}

main();
