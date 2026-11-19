-- Background Check module tables (additive). Mirrors backgroundCheck.prisma.
DO $$ BEGIN CREATE TYPE "BackgroundCheckStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','READY_FOR_DECISION','APPROVED','DECLINED'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BackgroundCheckType" AS ENUM ('TLO','OPENCORPORATES','SOS','NY_COURT','DATAMERCH','GOOGLE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BackgroundCheckItemStatus" AS ENUM ('NOT_STARTED','IN_PROGRESS','COMPLETE'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BackgroundCheckResult" AS ENUM ('PASS','FAIL','FLAG','NA'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BackgroundCheckOutcome" AS ENUM ('APPROVED','DECLINED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "BackgroundCheck" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL UNIQUE,
  "status" "BackgroundCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundCheck_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BackgroundCheck_applicationId_idx" ON "BackgroundCheck"("applicationId");
CREATE INDEX IF NOT EXISTS "BackgroundCheck_status_idx" ON "BackgroundCheck"("status");

CREATE TABLE IF NOT EXISTS "BackgroundCheckItem" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "backgroundCheckId" UUID NOT NULL,
  "checkType" "BackgroundCheckType" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "status" "BackgroundCheckItemStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "result" "BackgroundCheckResult",
  "notes" TEXT,
  "performedById" UUID,
  "performedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundCheckItem_bc_fkey" FOREIGN KEY ("backgroundCheckId") REFERENCES "BackgroundCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BackgroundCheckItem_bc_type_key" ON "BackgroundCheckItem"("backgroundCheckId","checkType");
CREATE INDEX IF NOT EXISTS "BackgroundCheckItem_bc_idx" ON "BackgroundCheckItem"("backgroundCheckId");

CREATE TABLE IF NOT EXISTS "BackgroundCheckAttachment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT,
  "originalName" TEXT,
  "uploadedById" UUID,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundCheckAttachment_item_fkey" FOREIGN KEY ("itemId") REFERENCES "BackgroundCheckItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BackgroundCheckAttachment_item_idx" ON "BackgroundCheckAttachment"("itemId");

CREATE TABLE IF NOT EXISTS "BackgroundCheckDecision" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "backgroundCheckId" UUID NOT NULL UNIQUE,
  "outcome" "BackgroundCheckOutcome" NOT NULL,
  "reasonCode" TEXT,
  "reasonText" TEXT NOT NULL,
  "conditionsText" TEXT,
  "overrodeFail" BOOLEAN NOT NULL DEFAULT false,
  "decidedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundCheckDecision_bc_fkey" FOREIGN KEY ("backgroundCheckId") REFERENCES "BackgroundCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "BackgroundCheckEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "backgroundCheckId" UUID NOT NULL,
  "itemId" UUID,
  "action" TEXT NOT NULL,
  "fromStatus" TEXT,
  "toStatus" TEXT,
  "detail" JSONB,
  "actorId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BackgroundCheckEvent_bc_fkey" FOREIGN KEY ("backgroundCheckId") REFERENCES "BackgroundCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "BackgroundCheckEvent_bc_created_idx" ON "BackgroundCheckEvent"("backgroundCheckId","createdAt");

SELECT 'tables' AS k, count(*) FROM information_schema.tables WHERE table_name LIKE 'BackgroundCheck%';
