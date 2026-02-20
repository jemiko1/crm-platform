import { execSync } from "child_process";
import { resolve } from "path";
import { config } from "dotenv";

export default async function globalSetup() {
  config({ path: resolve(__dirname, "../.env.test"), override: true });

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Create backend/crm-backend/.env.test with a test database URL.",
    );
  }

  console.log("\n[e2e setup] Running Prisma migrations on test database...");
  execSync("npx prisma migrate deploy", {
    cwd: resolve(__dirname, ".."),
    env: { ...process.env },
    stdio: "inherit",
  });
  console.log("[e2e setup] Migrations complete.\n");
}
