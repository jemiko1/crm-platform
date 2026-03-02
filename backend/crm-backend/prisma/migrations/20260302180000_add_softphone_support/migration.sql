-- AlterTable: add SIP connection fields to TelephonyExtension
ALTER TABLE "TelephonyExtension" ADD COLUMN "sipServer" TEXT;
ALTER TABLE "TelephonyExtension" ADD COLUMN "sipPassword" TEXT;

-- CreateTable: DeviceHandshakeToken for desktop app auth sync
CREATE TABLE "DeviceHandshakeToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceHandshakeToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceHandshakeToken_token_key" ON "DeviceHandshakeToken"("token");
CREATE INDEX "DeviceHandshakeToken_token_idx" ON "DeviceHandshakeToken"("token");
CREATE INDEX "DeviceHandshakeToken_expiresAt_idx" ON "DeviceHandshakeToken"("expiresAt");

ALTER TABLE "DeviceHandshakeToken" ADD CONSTRAINT "DeviceHandshakeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
