-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('EMAIL', 'SMS');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable: EmailConfig
CREATE TABLE IF NOT EXISTS "EmailConfig" (
    "id" TEXT NOT NULL,
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 587,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT false,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "imapHost" TEXT NOT NULL DEFAULT '',
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "imapSecure" BOOLEAN NOT NULL DEFAULT true,
    "imapUser" TEXT NOT NULL DEFAULT '',
    "imapPass" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SmsConfig (Sender.ge provider with spam protection)
CREATE TABLE IF NOT EXISTS "SmsConfig" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'sender_ge',
    "apiKey" TEXT NOT NULL DEFAULT '',
    "fromNumber" TEXT NOT NULL DEFAULT '',
    "smsNo" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "maxPerMinute" INTEGER NOT NULL DEFAULT 10,
    "maxPerHour" INTEGER NOT NULL DEFAULT 100,
    "maxPerDay" INTEGER NOT NULL DEFAULT 500,
    "recipientCooldownMin" INTEGER NOT NULL DEFAULT 5,
    "maxBatchRecipients" INTEGER NOT NULL DEFAULT 50,
    "autoDisableOnLimit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConfig_pkey" PRIMARY KEY ("id")
);

-- Migrate existing SmsConfig tables that may have old Twilio columns
-- Drop old Twilio-specific columns if they exist
ALTER TABLE "SmsConfig" DROP COLUMN IF EXISTS "accountSid";
ALTER TABLE "SmsConfig" DROP COLUMN IF EXISTS "authToken";
ALTER TABLE "SmsConfig" DROP COLUMN IF EXISTS "twilioNumber";

-- Add Sender.ge columns to existing SmsConfig (safe: IF NOT EXISTS)
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "provider" TEXT NOT NULL DEFAULT 'sender_ge';
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "apiKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "fromNumber" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "smsNo" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "maxPerMinute" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "maxPerHour" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "maxPerDay" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "recipientCooldownMin" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "maxBatchRecipients" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "SmsConfig" ADD COLUMN IF NOT EXISTS "autoDisableOnLimit" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: NotificationTemplate
CREATE TABLE IF NOT EXISTS "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NotificationLog
CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "recipientId" TEXT,
    "templateId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderMessageId" TEXT,
    "deliveryStatus" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "smsCount" INTEGER,
    "destination" TEXT,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- Add SMS tracking columns to existing NotificationLog (safe: IF NOT EXISTS)
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "senderMessageId" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "deliveryStatus" TEXT;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "deliveredAt" TIMESTAMP(3);
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "smsCount" INTEGER;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "destination" TEXT;

-- Make recipientId nullable if it was NOT NULL before
ALTER TABLE "NotificationLog" ALTER COLUMN "recipientId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationTemplate_code_key" ON "NotificationTemplate"("code");
CREATE INDEX IF NOT EXISTS "NotificationTemplate_type_idx" ON "NotificationTemplate"("type");
CREATE INDEX IF NOT EXISTS "NotificationTemplate_isActive_idx" ON "NotificationTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "NotificationLog_recipientId_idx" ON "NotificationLog"("recipientId");
CREATE INDEX IF NOT EXISTS "NotificationLog_type_idx" ON "NotificationLog"("type");
CREATE INDEX IF NOT EXISTS "NotificationLog_status_idx" ON "NotificationLog"("status");
CREATE INDEX IF NOT EXISTS "NotificationLog_createdAt_idx" ON "NotificationLog"("createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_senderMessageId_idx" ON "NotificationLog"("senderMessageId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
