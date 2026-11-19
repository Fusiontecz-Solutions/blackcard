-- Stub Book registry for single-tenant reporting FKs
CREATE TABLE IF NOT EXISTS "Book" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "domain" TEXT NOT NULL DEFAULT '',
    "apiBaseUrl" TEXT NOT NULL DEFAULT '',
    "status" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Book_code_key" ON "Book"("code");

-- CreateTable
CREATE TABLE "ReportApplicationFact" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "applicationUuid" TEXT NOT NULL,
    "applicationNumericId" TEXT,
    "dealId" TEXT,
    "merchantName" TEXT,
    "dealType" TEXT,
    "priority" TEXT,
    "agentId" TEXT,
    "agentName" TEXT,
    "isoId" TEXT,
    "isoName" TEXT,
    "salesRep" TEXT,
    "underwriterId" TEXT,
    "underwriterName" TEXT,
    "scrubberRecommendation" TEXT,
    "stage" TEXT,
    "state" TEXT,
    "status" TEXT,
    "category" TEXT,
    "requestedAmount" DECIMAL(18,2),
    "approvedAmount" DECIMAL(18,2),
    "fundedAmount" DECIMAL(18,2),
    "commissionAmount" DECIMAL(18,2),
    "commissionPct" DECIMAL(9,4),
    "paybackAmount" DECIMAL(18,2),
    "repaidAmount" DECIMAL(18,2),
    "balanceDue" DECIMAL(18,2),
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "needsContractReinitiation" BOOLEAN NOT NULL DEFAULT false,
    "createdAtTenant" TIMESTAMP(3),
    "updatedAtTenant" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "contractSentAt" TIMESTAMP(3),
    "contractSignedAt" TIMESTAMP(3),
    "fundedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "deletedAtTenant" TIMESTAMP(3),
    "declinedByRole" TEXT,
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportApplicationFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportStageEvent" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "applicationUuid" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL DEFAULT 'sync',

    CONSTRAINT "ReportStageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDailySnapshot" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSyncRun" (
    "id" UUID NOT NULL,
    "bookId" UUID,
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "applicationsSeen" INTEGER NOT NULL DEFAULT 0,
    "upserted" INTEGER NOT NULL DEFAULT 0,
    "stageEvents" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "ReportSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "frequency" TEXT NOT NULL,
    "hourLocal" INTEGER NOT NULL DEFAULT 7,
    "minuteLocal" INTEGER NOT NULL DEFAULT 0,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "sections" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeAttachment" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "note" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdByEmail" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSavedView" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportApplicationFact_bookId_stage_idx" ON "ReportApplicationFact"("bookId", "stage");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_bookId_status_idx" ON "ReportApplicationFact"("bookId", "status");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_createdAtTenant_idx" ON "ReportApplicationFact"("createdAtTenant");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_fundedAt_idx" ON "ReportApplicationFact"("fundedAt");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_approvedAt_idx" ON "ReportApplicationFact"("approvedAt");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_declinedAt_idx" ON "ReportApplicationFact"("declinedAt");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_agentId_idx" ON "ReportApplicationFact"("agentId");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_underwriterId_idx" ON "ReportApplicationFact"("underwriterId");

-- CreateIndex
CREATE INDEX "ReportApplicationFact_syncedAt_idx" ON "ReportApplicationFact"("syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportApplicationFact_bookId_applicationUuid_key" ON "ReportApplicationFact"("bookId", "applicationUuid");

-- CreateIndex
CREATE INDEX "ReportStageEvent_bookId_applicationUuid_at_idx" ON "ReportStageEvent"("bookId", "applicationUuid", "at");

-- CreateIndex
CREATE INDEX "ReportStageEvent_toStage_at_idx" ON "ReportStageEvent"("toStage", "at");

-- CreateIndex
CREATE INDEX "ReportStageEvent_at_idx" ON "ReportStageEvent"("at");

-- CreateIndex
CREATE INDEX "ReportDailySnapshot_date_idx" ON "ReportDailySnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ReportDailySnapshot_bookId_date_key" ON "ReportDailySnapshot"("bookId", "date");

-- CreateIndex
CREATE INDEX "ReportSyncRun_startedAt_idx" ON "ReportSyncRun"("startedAt");

-- CreateIndex
CREATE INDEX "ReportSyncRun_bookId_startedAt_idx" ON "ReportSyncRun"("bookId", "startedAt");

-- CreateIndex
CREATE INDEX "ReportSchedule_enabled_nextRunAt_idx" ON "ReportSchedule"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "ReportSavedView_ownerId_idx" ON "ReportSavedView"("ownerId");

-- CreateIndex
CREATE INDEX "ReportSavedView_reportKey_isShared_idx" ON "ReportSavedView"("reportKey", "isShared");

-- AddForeignKey
ALTER TABLE "ReportApplicationFact" ADD CONSTRAINT "ReportApplicationFact_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportStageEvent" ADD CONSTRAINT "ReportStageEvent_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDailySnapshot" ADD CONSTRAINT "ReportDailySnapshot_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

