-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "BugCategory" AS ENUM ('BUG', 'IMPROVEMENT', 'UI_ISSUE', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "GithubSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "BugReportStatus" AS ENUM ('NEW', 'AI_ANALYZED', 'GITHUB_CREATED', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'WONT_FIX');

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "BugSeverity" NOT NULL,
    "category" "BugCategory" NOT NULL DEFAULT 'BUG',
    "pageUrl" TEXT NOT NULL,
    "browserInfo" JSONB NOT NULL,
    "actionLog" JSONB NOT NULL,
    "consoleLog" JSONB NOT NULL,
    "networkLog" JSONB NOT NULL,
    "videoPath" TEXT,
    "screenshots" JSONB,
    "aiTitle" TEXT,
    "aiAnalysis" JSONB,
    "aiSeverity" "BugSeverity",
    "githubIssueId" INTEGER,
    "githubIssueUrl" TEXT,
    "githubSyncStatus" "GithubSyncStatus" NOT NULL DEFAULT 'PENDING',
    "status" "BugReportStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BugReport_reporterId_idx" ON "BugReport"("reporterId");

-- CreateIndex
CREATE INDEX "BugReport_status_idx" ON "BugReport"("status");

-- CreateIndex
CREATE INDEX "BugReport_severity_idx" ON "BugReport"("severity");

-- CreateIndex
CREATE INDEX "BugReport_createdAt_idx" ON "BugReport"("createdAt");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
