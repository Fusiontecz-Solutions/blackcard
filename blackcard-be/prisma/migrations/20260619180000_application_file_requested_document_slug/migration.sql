-- Track which requested document an uploaded application file fulfills.
ALTER TABLE "ApplicationFile" ADD COLUMN IF NOT EXISTS "requestedDocumentSlug" TEXT;
