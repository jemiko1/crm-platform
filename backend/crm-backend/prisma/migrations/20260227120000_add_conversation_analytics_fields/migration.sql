-- AlterTable
ALTER TABLE "ClientChatConversation" ADD COLUMN "firstResponseAt" TIMESTAMP(3);
ALTER TABLE "ClientChatConversation" ADD COLUMN "resolvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "ClientChatConversation_createdAt_idx" ON "ClientChatConversation"("createdAt");
