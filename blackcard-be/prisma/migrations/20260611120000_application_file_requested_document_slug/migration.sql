-- Track which document request an application file fulfills.
ALTER TABLE "ApplicationFile" ADD COLUMN IF NOT EXISTS "requestedDocumentSlug" TEXT;

CREATE INDEX IF NOT EXISTS "ApplicationFile_requestedDocumentSlug_idx"
  ON "ApplicationFile"("requestedDocumentSlug");
