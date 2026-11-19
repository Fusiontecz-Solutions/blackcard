-- ISO portal: persist commission plans, scoring rules, onboarding notes, agreement steps,
-- tier pins / badges and payout approvals. Additive only; safe to re-run.

ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "managerName" TEXT;
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "missingDocs" TEXT;
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "agreementEmail" TEXT;
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "agreementSentAt" TIMESTAMP(3);
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "agreementViewedAt" TIMESTAMP(3);
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "tierOverride" VARCHAR(16);
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "IsoApplicationPayout" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "IsoCommissionPlan" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "pointsPct" DOUBLE PRECISION NOT NULL,
  "basis" VARCHAR(16) NOT NULL DEFAULT 'on_collection',
  "renewalPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "capAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IsoCommissionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IsoPortalSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "scoring" JSONB,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "IsoPortalSetting_pkey" PRIMARY KEY ("id")
);
