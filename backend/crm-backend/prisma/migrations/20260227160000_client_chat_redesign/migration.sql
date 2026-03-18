-- Step 1: Add new enum value LIVE
ALTER TYPE "ClientChatStatus" ADD VALUE IF NOT EXISTS 'LIVE';

-- Step 2: Migrate existing data
UPDATE "ClientChatConversation" SET "status" = 'LIVE' WHERE "status" IN ('OPEN', 'PENDING');
UPDATE "ClientChatConversation" SET "status" = 'CLOSED' WHERE "status" = 'SPAM';

-- Step 3: Add new columns
ALTER TABLE "ClientChatConversation" ADD COLUMN "pausedOperatorId" TEXT;
ALTER TABLE "ClientChatConversation" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "ClientChatConversation" ADD COLUMN "previousConversationId" TEXT;
ALTER TABLE "ClientChatConversation" ADD COLUMN "reopenRequestedBy" TEXT;
ALTER TABLE "ClientChatConversation" ADD COLUMN "reopenRequestedAt" TIMESTAMP(3);

-- Step 4: Add self-referencing foreign key
ALTER TABLE "ClientChatConversation" ADD CONSTRAINT "ClientChatConversation_previousConversationId_fkey" FOREIGN KEY ("previousConversationId") REFERENCES "ClientChatConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 5: Add index
CREATE INDEX "ClientChatConversation_previousConversationId_idx" ON "ClientChatConversation"("previousConversationId");

-- Step 6: Update default value
ALTER TABLE "ClientChatConversation" ALTER COLUMN "status" SET DEFAULT 'LIVE';

-- Step 7: Remove old enum values (rename enum approach for PostgreSQL)
-- PostgreSQL doesn't support DROP VALUE from enum, so we recreate:
ALTER TYPE "ClientChatStatus" RENAME TO "ClientChatStatus_old";
CREATE TYPE "ClientChatStatus" AS ENUM ('LIVE', 'CLOSED');
ALTER TABLE "ClientChatConversation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ClientChatConversation" ALTER COLUMN "status" TYPE "ClientChatStatus" USING ("status"::text::"ClientChatStatus");
ALTER TABLE "ClientChatConversation" ALTER COLUMN "status" SET DEFAULT 'LIVE';
DROP TYPE "ClientChatStatus_old";
