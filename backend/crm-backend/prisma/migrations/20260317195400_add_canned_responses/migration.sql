-- CreateTable
CREATE TABLE "ClientChatCannedResponse" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "channelType" "ClientChatChannelType",
    "createdById" TEXT NOT NULL,
    "isGlobal" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientChatCannedResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientChatCannedResponse_isGlobal_idx" ON "ClientChatCannedResponse"("isGlobal");

-- CreateIndex
CREATE INDEX "ClientChatCannedResponse_createdById_idx" ON "ClientChatCannedResponse"("createdById");

-- CreateIndex
CREATE INDEX "ClientChatCannedResponse_channelType_idx" ON "ClientChatCannedResponse"("channelType");

-- AddForeignKey
ALTER TABLE "ClientChatCannedResponse" ADD CONSTRAINT "ClientChatCannedResponse_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
