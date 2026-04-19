-- AlterTable: add deliveryError column for storing outbound adapter error messages
-- When sendReply fails (WhatsApp 24h window closed, adapter throws, etc.) the
-- message is still persisted so the operator can see what they tried to send.
ALTER TABLE "ClientChatMessage" ADD COLUMN "deliveryError" TEXT;
