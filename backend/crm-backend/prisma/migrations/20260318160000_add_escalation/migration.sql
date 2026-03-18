-- AlterTable
ALTER TABLE "ClientChatConversation" ADD COLUMN "lastOperatorActivityAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ClientChatEscalationConfig" (
    "id" TEXT NOT NULL,
    "firstResponseTimeoutMins" INTEGER NOT NULL DEFAULT 5,
    "reassignAfterMins" INTEGER NOT NULL DEFAULT 10,
    "notifyManagerOnEscalation" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientChatEscalationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientChatEscalationEvent" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatEscalationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientChatEscalationEvent_conversationId_idx" ON "ClientChatEscalationEvent"("conversationId");

-- CreateIndex
CREATE INDEX "ClientChatEscalationEvent_createdAt_idx" ON "ClientChatEscalationEvent"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ClientChatEscalationEvent" ADD CONSTRAINT "ClientChatEscalationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ClientChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
