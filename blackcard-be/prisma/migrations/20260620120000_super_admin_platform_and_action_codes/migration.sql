-- Replace legacy SuperAdminPlateform table (wrong name/columns) with schema-aligned superAdminPlateform.
DROP TABLE IF EXISTS "SuperAdminPlateform";

CREATE TABLE IF NOT EXISTS "superAdminPlateform" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "clientCount" INTEGER NOT NULL DEFAULT 0,
    "isoCount" INTEGER NOT NULL DEFAULT 0,
    "totalDealsCount" INTEGER NOT NULL DEFAULT 0,
    "fundedDealsCount" INTEGER NOT NULL DEFAULT 0,
    "dealCount" INTEGER NOT NULL DEFAULT 0,
    "commissionPortalDealCount" INTEGER NOT NULL DEFAULT 0,
    "commissionDealsFunded" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionPaid" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionPending" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionProcessing" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionApproved" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "commissionClawback" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalFundedVolume" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "fundedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netFundingTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "abovePrincipalTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recoveredAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "failedPaymentAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "failedPaymentCount" INTEGER NOT NULL DEFAULT 0,
    "dueToday" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueNext7Days" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDues" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalPayback" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "collectionEfficiency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "superAdminPlateform_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "actionCode" VARCHAR(4);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "actionCodeGeneratedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "actionCodeOperation" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "actionCodeUsedAt" TIMESTAMP(3);

ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "actionCode" VARCHAR(4);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "actionCodeGeneratedAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "actionCodeOperation" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "actionCodeUsedAt" TIMESTAMP(3);
