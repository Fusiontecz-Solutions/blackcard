ALTER TABLE "FunderProfile" ADD COLUMN IF NOT EXISTS "documentsSource" TEXT NOT NULL DEFAULT 'own';
ALTER TABLE "FunderProfile" ADD COLUMN IF NOT EXISTS "sharedDocumentsFunderId" UUID;

UPDATE "FunderProfile"
SET "documentsSource" = 'platform'
WHERE LOWER("name") LIKE '%katan%'
   OR LOWER(COALESCE("displayName", '')) LIKE '%katan%';
