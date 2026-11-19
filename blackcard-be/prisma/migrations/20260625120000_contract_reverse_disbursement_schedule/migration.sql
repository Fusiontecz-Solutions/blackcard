-- Reverse disbursement schedule (optional last page on contract PDF)
ALTER TABLE "Contract"
ADD COLUMN IF NOT EXISTS "reverseDisbursementEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Contract"
ADD COLUMN IF NOT EXISTS "reverseDisbursementSchedule" JSONB;
