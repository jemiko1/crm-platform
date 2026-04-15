-- SimplifyUserRoleEnum
-- Collapse UserRole enum from (ADMIN, CALL_CENTER, TECHNICIAN, WAREHOUSE, MANAGER) to (ADMIN, USER)
-- ADMIN stays unchanged. All other roles become USER.
-- Also drops the legacyRole column from Role table (no longer needed).

-- Step 1: Drop the legacyRole index and column from Role table
DROP INDEX IF EXISTS "Role_legacyRole_idx";
ALTER TABLE "Role" DROP COLUMN IF EXISTS "legacyRole";

-- Step 2: Convert all non-ADMIN users to a text placeholder before enum swap
-- (We need to swap the enum type, and the USING clause handles the conversion)

-- Step 3: Create new enum, swap columns, drop old
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'USER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new"
  USING (CASE WHEN "role"::text = 'ADMIN' THEN 'ADMIN'::"UserRole_new" ELSE 'USER'::"UserRole_new" END);

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
