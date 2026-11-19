-- CreateTable
CREATE TABLE "SuperAdminPlateform" (
    "id" TEXT NOT NULL,
    "clientCount" INTEGER NOT NULL DEFAULT 0,
    "isoCount" INTEGER NOT NULL DEFAULT 0,
    "totalDealsCount" INTEGER NOT NULL DEFAULT 0,
    "fundedDealsCount" INTEGER NOT NULL DEFAULT 0,
    "commissionPortalDealCount" INTEGER NOT NULL DEFAULT 0,
    "commissionDealsFunded" INTEGER NOT NULL DEFAULT 0,
    "totalCommission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deals" JSONB,
    "commission" JSONB,
    "paymentCards" JSONB,
    "lastRefreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuperAdminPlateform_pkey" PRIMARY KEY ("id")
);
