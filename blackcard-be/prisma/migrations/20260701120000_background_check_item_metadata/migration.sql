-- Store extended background-check item fields (risk, note images, NY court evidence, etc.)
ALTER TABLE "BackgroundCheckItem" ADD COLUMN IF NOT EXISTS "metadata" JSONB;
