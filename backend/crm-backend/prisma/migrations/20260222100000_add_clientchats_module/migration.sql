-- CreateEnum
CREATE TYPE "ClientChatChannelType" AS ENUM ('WEB', 'VIBER', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "ClientChatStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED', 'SPAM');

-- CreateEnum
CREATE TYPE "ClientChatDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "ClientChatAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "PermissionCategory" ADD VALUE 'CLIENT_CHATS';

-- CreateTable
CREATE TABLE "ClientChatChannelAccount" (
    "id" TEXT NOT NULL,
    "type" "ClientChatChannelType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ClientChatAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatChannelAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientChatConversation" (
    "id" TEXT NOT NULL,
    "channelType" "ClientChatChannelType" NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "externalConversationId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "clientId" TEXT,
    "status" "ClientChatStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientChatParticipant" (
    "id" TEXT NOT NULL,
    "channelType" "ClientChatChannelType" NOT NULL,
    "channelAccountId" TEXT NOT NULL,
    "externalUserId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "mappedClientId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "participantId" TEXT,
    "senderUserId" TEXT,
    "direction" "ClientChatDirection" NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "attachments" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "deliveryStatus" TEXT,
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientChatWebhookFailure" (
    "id" TEXT NOT NULL,
    "channelType" "ClientChatChannelType" NOT NULL,
    "error" TEXT NOT NULL,
    "payloadMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatWebhookFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientChatChannelAccount_type_idx" ON "ClientChatChannelAccount"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ClientChatConversation_externalConversationId_key" ON "ClientChatConversation"("externalConversationId");

-- CreateIndex
CREATE INDEX "ClientChatConversation_lastMessageAt_idx" ON "ClientChatConversation"("lastMessageAt" DESC);

-- CreateIndex
CREATE INDEX "ClientChatConversation_assignedUserId_idx" ON "ClientChatConversation"("assignedUserId");

-- CreateIndex
CREATE INDEX "ClientChatConversation_status_idx" ON "ClientChatConversation"("status");

-- CreateIndex
CREATE INDEX "ClientChatConversation_channelType_idx" ON "ClientChatConversation"("channelType");

-- CreateIndex
CREATE UNIQUE INDEX "ClientChatParticipant_externalUserId_key" ON "ClientChatParticipant"("externalUserId");

-- CreateIndex
CREATE INDEX "ClientChatParticipant_channelType_idx" ON "ClientChatParticipant"("channelType");

-- CreateIndex
CREATE INDEX "ClientChatParticipant_mappedClientId_idx" ON "ClientChatParticipant"("mappedClientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientChatMessage_externalMessageId_key" ON "ClientChatMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "ClientChatMessage_conversationId_sentAt_idx" ON "ClientChatMessage"("conversationId", "sentAt" DESC);

-- CreateIndex
CREATE INDEX "ClientChatMessage_externalMessageId_idx" ON "ClientChatMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "ClientChatWebhookFailure_channelType_idx" ON "ClientChatWebhookFailure"("channelType");

-- CreateIndex
CREATE INDEX "ClientChatWebhookFailure_createdAt_idx" ON "ClientChatWebhookFailure"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ClientChatConversation" ADD CONSTRAINT "ClientChatConversation_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ClientChatChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatConversation" ADD CONSTRAINT "ClientChatConversation_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatConversation" ADD CONSTRAINT "ClientChatConversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatParticipant" ADD CONSTRAINT "ClientChatParticipant_channelAccountId_fkey" FOREIGN KEY ("channelAccountId") REFERENCES "ClientChatChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatParticipant" ADD CONSTRAINT "ClientChatParticipant_mappedClientId_fkey" FOREIGN KEY ("mappedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatMessage" ADD CONSTRAINT "ClientChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ClientChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatMessage" ADD CONSTRAINT "ClientChatMessage_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ClientChatParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatMessage" ADD CONSTRAINT "ClientChatMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
