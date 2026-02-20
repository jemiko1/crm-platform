-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "CallDisposition" AS ENUM ('ANSWERED', 'MISSED', 'ABANDONED', 'BUSY', 'FAILED', 'NOANSWER');

-- CreateEnum
CREATE TYPE "CallLegType" AS ENUM ('CUSTOMER', 'AGENT', 'TRANSFER');

-- CreateEnum
CREATE TYPE "QueueStrategy" AS ENUM ('RRMEMORY', 'FEWESTCALLS', 'RANDOM', 'RINGALL', 'LINEAR', 'WRANDOM');

-- CreateEnum
CREATE TYPE "MissedCallReason" AS ENUM ('OUT_OF_HOURS', 'ABANDONED', 'NO_ANSWER');

-- CreateEnum
CREATE TYPE "MissedCallStatus" AS ENUM ('NEW', 'HANDLED', 'IGNORED');

-- CreateEnum
CREATE TYPE "CallbackRequestStatus" AS ENUM ('PENDING', 'SCHEDULED', 'ATTEMPTING', 'DONE', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "QualityReviewStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "AuditEntity" ADD VALUE 'CALL_SESSION';

-- AlterEnum
ALTER TYPE "PermissionCategory" ADD VALUE 'TELEPHONY';

-- CreateTable
CREATE TABLE "TelephonyExtension" (
    "id" TEXT NOT NULL,
    "crmUserId" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isOperator" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelephonyQueue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" "QueueStrategy" NOT NULL DEFAULT 'RRMEMORY',
    "isAfterHoursQueue" BOOLEAN NOT NULL DEFAULT false,
    "worktimeConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelephonyQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" TEXT NOT NULL,
    "linkedId" TEXT NOT NULL,
    "uniqueId" TEXT,
    "direction" "CallDirection" NOT NULL,
    "did" TEXT,
    "callerNumber" TEXT NOT NULL,
    "calleeNumber" TEXT,
    "queueId" TEXT,
    "assignedUserId" TEXT,
    "assignedExtension" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "answerAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "disposition" "CallDisposition",
    "hangupCause" TEXT,
    "recordingStatus" "RecordingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLeg" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "type" "CallLegType" NOT NULL,
    "userId" TEXT,
    "extension" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "answerAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "disposition" "CallDisposition",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallEvent" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT,
    "eventType" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "source" TEXT NOT NULL DEFAULT 'asterisk',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallMetrics" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "waitSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ringSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "talkSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "holdSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wrapupSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transfersCount" INTEGER NOT NULL DEFAULT 0,
    "abandonsAfterSeconds" DOUBLE PRECISION,
    "firstResponseSeconds" DOUBLE PRECISION,
    "isSlaMet" BOOLEAN,
    "slaThresholdSeconds" INTEGER,

    CONSTRAINT "CallMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissedCall" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "reason" "MissedCallReason" NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queueId" TEXT,
    "userId" TEXT,
    "callerNumber" TEXT NOT NULL,
    "status" "MissedCallStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissedCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallbackRequest" (
    "id" TEXT NOT NULL,
    "missedCallId" TEXT NOT NULL,
    "status" "CallbackRequestStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "assignedToUserId" TEXT,
    "attemptsCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'asterisk',
    "url" TEXT,
    "filePath" TEXT,
    "durationSeconds" INTEGER,
    "availableAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReview" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "status" "QualityReviewStatus" NOT NULL DEFAULT 'PENDING',
    "summary" TEXT,
    "score" INTEGER,
    "flags" JSONB,
    "tags" JSONB,
    "transcriptRef" TEXT,
    "reviewerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityRubric" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER NOT NULL DEFAULT 25,
    "maxScore" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QualityRubric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique constraints)
CREATE UNIQUE INDEX "TelephonyExtension_crmUserId_key" ON "TelephonyExtension"("crmUserId");
CREATE UNIQUE INDEX "TelephonyExtension_extension_key" ON "TelephonyExtension"("extension");
CREATE UNIQUE INDEX "TelephonyQueue_name_key" ON "TelephonyQueue"("name");
CREATE UNIQUE INDEX "CallSession_linkedId_key" ON "CallSession"("linkedId");
CREATE UNIQUE INDEX "CallEvent_idempotencyKey_key" ON "CallEvent"("idempotencyKey");
CREATE UNIQUE INDEX "CallMetrics_callSessionId_key" ON "CallMetrics"("callSessionId");
CREATE UNIQUE INDEX "MissedCall_callSessionId_key" ON "MissedCall"("callSessionId");
CREATE UNIQUE INDEX "CallbackRequest_missedCallId_key" ON "CallbackRequest"("missedCallId");
CREATE UNIQUE INDEX "QualityReview_callSessionId_key" ON "QualityReview"("callSessionId");

-- CreateIndex (performance indexes)
CREATE INDEX "TelephonyExtension_isActive_idx" ON "TelephonyExtension"("isActive");
CREATE INDEX "TelephonyQueue_isActive_idx" ON "TelephonyQueue"("isActive");

CREATE INDEX "CallSession_startAt_idx" ON "CallSession"("startAt");
CREATE INDEX "CallSession_queueId_idx" ON "CallSession"("queueId");
CREATE INDEX "CallSession_assignedUserId_idx" ON "CallSession"("assignedUserId");
CREATE INDEX "CallSession_disposition_idx" ON "CallSession"("disposition");
CREATE INDEX "CallSession_callerNumber_idx" ON "CallSession"("callerNumber");
CREATE INDEX "CallSession_queueId_startAt_idx" ON "CallSession"("queueId", "startAt");
CREATE INDEX "CallSession_assignedUserId_startAt_idx" ON "CallSession"("assignedUserId", "startAt");
CREATE INDEX "CallSession_createdAt_idx" ON "CallSession"("createdAt");

CREATE INDEX "CallLeg_callSessionId_idx" ON "CallLeg"("callSessionId");
CREATE INDEX "CallLeg_userId_idx" ON "CallLeg"("userId");
CREATE INDEX "CallLeg_type_idx" ON "CallLeg"("type");
CREATE INDEX "CallLeg_startAt_idx" ON "CallLeg"("startAt");

CREATE INDEX "CallEvent_callSessionId_idx" ON "CallEvent"("callSessionId");
CREATE INDEX "CallEvent_eventType_idx" ON "CallEvent"("eventType");
CREATE INDEX "CallEvent_createdAt_idx" ON "CallEvent"("createdAt");

CREATE INDEX "MissedCall_status_idx" ON "MissedCall"("status");
CREATE INDEX "MissedCall_queueId_idx" ON "MissedCall"("queueId");
CREATE INDEX "MissedCall_detectedAt_idx" ON "MissedCall"("detectedAt");
CREATE INDEX "MissedCall_callerNumber_idx" ON "MissedCall"("callerNumber");
CREATE INDEX "MissedCall_userId_idx" ON "MissedCall"("userId");

CREATE INDEX "CallbackRequest_status_idx" ON "CallbackRequest"("status");
CREATE INDEX "CallbackRequest_scheduledAt_idx" ON "CallbackRequest"("scheduledAt");
CREATE INDEX "CallbackRequest_assignedToUserId_idx" ON "CallbackRequest"("assignedToUserId");

CREATE INDEX "Recording_callSessionId_idx" ON "Recording"("callSessionId");
CREATE INDEX "Recording_createdAt_idx" ON "Recording"("createdAt");

CREATE INDEX "QualityReview_status_idx" ON "QualityReview"("status");
CREATE INDEX "QualityReview_reviewerUserId_idx" ON "QualityReview"("reviewerUserId");
CREATE INDEX "QualityReview_createdAt_idx" ON "QualityReview"("createdAt");
CREATE INDEX "QualityReview_score_idx" ON "QualityReview"("score");

CREATE INDEX "QualityRubric_isActive_idx" ON "QualityRubric"("isActive");
CREATE INDEX "QualityRubric_sortOrder_idx" ON "QualityRubric"("sortOrder");

-- AddForeignKey
ALTER TABLE "TelephonyExtension" ADD CONSTRAINT "TelephonyExtension_crmUserId_fkey" FOREIGN KEY ("crmUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "TelephonyQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallLeg" ADD CONSTRAINT "CallLeg_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallLeg" ADD CONSTRAINT "CallLeg_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallEvent" ADD CONSTRAINT "CallEvent_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallMetrics" ADD CONSTRAINT "CallMetrics_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "TelephonyQueue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CallbackRequest" ADD CONSTRAINT "CallbackRequest_missedCallId_fkey" FOREIGN KEY ("missedCallId") REFERENCES "MissedCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallbackRequest" ADD CONSTRAINT "CallbackRequest_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Recording" ADD CONSTRAINT "Recording_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QualityReview" ADD CONSTRAINT "QualityReview_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QualityReview" ADD CONSTRAINT "QualityReview_reviewerUserId_fkey" FOREIGN KEY ("reviewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
