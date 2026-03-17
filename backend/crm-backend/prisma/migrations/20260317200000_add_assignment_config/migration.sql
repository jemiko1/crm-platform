-- CreateTable
CREATE TABLE "ClientChatAssignmentConfig" (
    "id" TEXT NOT NULL,
    "channelType" "ClientChatChannelType",
    "strategy" TEXT NOT NULL DEFAULT 'manual',
    "assignableUsers" TEXT[],
    "lastAssignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientChatAssignmentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientChatAssignmentConfig_channelType_key" ON "ClientChatAssignmentConfig"("channelType");
