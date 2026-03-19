-- AlterTable
ALTER TABLE "ClientChatConversation" ADD COLUMN "participantId" TEXT;

-- AddForeignKey
ALTER TABLE "ClientChatConversation" ADD CONSTRAINT "ClientChatConversation_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ClientChatParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
