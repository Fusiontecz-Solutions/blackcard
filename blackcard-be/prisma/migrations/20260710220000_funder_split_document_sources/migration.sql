-- Split addendum vs disclosure document sources on FunderProfile
ALTER TABLE "FunderProfile"
  ADD COLUMN IF NOT EXISTS "addendumDocumentsSource" TEXT,
  ADD COLUMN IF NOT EXISTS "disclosureDocumentsSource" TEXT,
  ADD COLUMN IF NOT EXISTS "sharedAddendumFunderId" UUID,
  ADD COLUMN IF NOT EXISTS "sharedDisclosureFunderId" UUID;

-- Backfill dedicated columns from legacy combined source
UPDATE "FunderProfile"
SET
  "addendumDocumentsSource" = COALESCE("addendumDocumentsSource", "documentsSource"),
  "disclosureDocumentsSource" = COALESCE("disclosureDocumentsSource", "documentsSource"),
  "sharedAddendumFunderId" = COALESCE("sharedAddendumFunderId", "sharedDocumentsFunderId"),
  "sharedDisclosureFunderId" = COALESCE("sharedDisclosureFunderId", "sharedDocumentsFunderId");
