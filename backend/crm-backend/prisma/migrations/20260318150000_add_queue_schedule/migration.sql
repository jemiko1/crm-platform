-- CreateTable
CREATE TABLE "ClientChatQueueSchedule" (
    "id" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientChatQueueSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientChatQueueOverride" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "userIds" TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientChatQueueOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientChatQueueSchedule_dayOfWeek_idx" ON "ClientChatQueueSchedule"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "ClientChatQueueSchedule_dayOfWeek_userId_key" ON "ClientChatQueueSchedule"("dayOfWeek", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientChatQueueOverride_date_key" ON "ClientChatQueueOverride"("date");

-- AddForeignKey
ALTER TABLE "ClientChatQueueSchedule" ADD CONSTRAINT "ClientChatQueueSchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientChatQueueOverride" ADD CONSTRAINT "ClientChatQueueOverride_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
