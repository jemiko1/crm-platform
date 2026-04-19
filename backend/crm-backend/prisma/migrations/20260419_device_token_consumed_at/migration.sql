-- AlterTable: add consumedAt audit column to DeviceHandshakeToken
-- Used by /auth/exchange-token atomic-consume path and nightly cleanup cron.
ALTER TABLE "DeviceHandshakeToken" ADD COLUMN "consumedAt" TIMESTAMP(3);
