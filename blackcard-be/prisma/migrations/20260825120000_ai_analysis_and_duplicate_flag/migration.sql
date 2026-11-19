-- Duplicate identity tag
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "isDuplicate" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Application_isDuplicate_idx" ON "Application"("isDuplicate");

-- AI analysis + MCA tag tables
CREATE TABLE IF NOT EXISTS "AiAnalysis" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bankAnalysisId" UUID NOT NULL,
    "documentUrl" TEXT,
    "documentPublicId" TEXT,
    "fileName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "engine" TEXT,
    "error" TEXT,
    "result" JSONB,
    "processedAt" TIMESTAMP(6),
    "processedBy" UUID,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiAnalysis_bankAnalysisId_idx" ON "AiAnalysis"("bankAnalysisId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'AiAnalysis_bankAnalysisId_fkey'
    ) THEN
        ALTER TABLE "AiAnalysis"
            ADD CONSTRAINT "AiAnalysis_bankAnalysisId_fkey"
            FOREIGN KEY ("bankAnalysisId") REFERENCES "BankAnalysis"("id")
            ON DELETE CASCADE ON UPDATE NO ACTION;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "McaTag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "example" TEXT,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "McaTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "McaTag_key_key" ON "McaTag"("key");
CREATE INDEX IF NOT EXISTS "McaTag_key_idx" ON "McaTag"("key");
