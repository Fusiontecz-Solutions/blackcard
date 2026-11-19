-- Idempotent: create DocuSign / Funder profile tables (final schema)

CREATE TABLE IF NOT EXISTS "DocuSignAccountProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "integrationKey" TEXT NOT NULL,
    "clientSecret" TEXT,
    "impersonatedUserId" TEXT NOT NULL,
    "rsaPrivateKey" TEXT NOT NULL,
    "accountId" TEXT,
    "baseUri" TEXT,
    "defaultRoleName" TEXT NOT NULL DEFAULT 'Signer',
    "webhookUser" TEXT,
    "webhookPassword" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocuSignAccountProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "FunderProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "dealIdPrefix" TEXT,
    "assignsDealId" BOOLEAN NOT NULL DEFAULT false,
    "mainContractLayoutKey" TEXT NOT NULL DEFAULT 'contract',
    "contractPdfFileName" TEXT,
    "allowedStates" JSONB,
    "excludedStates" JSONB,
    "organization" TEXT,
    "legalName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "addressLine1" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "docusignAccountProfileId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "documentsSource" TEXT NOT NULL DEFAULT 'own',
    "sharedDocumentsFunderId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FunderProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FunderProfile_name_key" ON "FunderProfile"("name");
CREATE INDEX IF NOT EXISTS "DocuSignAccountProfile_name_idx" ON "DocuSignAccountProfile"("name");
CREATE INDEX IF NOT EXISTS "DocuSignAccountProfile_isActive_idx" ON "DocuSignAccountProfile"("isActive");
CREATE INDEX IF NOT EXISTS "FunderProfile_docusignAccountProfileId_idx" ON "FunderProfile"("docusignAccountProfileId");
CREATE INDEX IF NOT EXISTS "FunderProfile_isActive_idx" ON "FunderProfile"("isActive");
CREATE INDEX IF NOT EXISTS "FunderProfile_sortOrder_idx" ON "FunderProfile"("sortOrder");

DO $$ BEGIN
  ALTER TABLE "FunderProfile"
    ADD CONSTRAINT "FunderProfile_docusignAccountProfileId_fkey"
    FOREIGN KEY ("docusignAccountProfileId") REFERENCES "DocuSignAccountProfile"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop legacy columns if an older migration shape was applied
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "authBase";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "defaultTemplateId";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "lenderEmailName";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "senderReturnUrl";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "notes";
ALTER TABLE "FunderProfile" DROP COLUMN IF EXISTS "lenderEmailName";
ALTER TABLE "FunderProfile" DROP COLUMN IF EXISTS "notes";
ALTER TABLE "DocuSignAccountProfile" ADD COLUMN IF NOT EXISTS "baseUri" TEXT;

-- Add columns if table existed from an older migration without them
ALTER TABLE "FunderProfile" ADD COLUMN IF NOT EXISTS "excludedStates" JSONB;
ALTER TABLE "FunderProfile" ADD COLUMN IF NOT EXISTS "documentsSource" TEXT NOT NULL DEFAULT 'own';
ALTER TABLE "FunderProfile" ADD COLUMN IF NOT EXISTS "sharedDocumentsFunderId" UUID;

INSERT INTO "FunderProfile" (
    "id", "name", "displayName", "dealIdPrefix", "assignsDealId",
    "mainContractLayoutKey", "contractPdfFileName", "allowedStates",
    "organization", "sortOrder", "isActive", "documentsSource", "updatedAt"
) VALUES
(
    'b1000000-0000-4000-8000-000000000001',
    'Woodmere Financial', 'Woodmere Financial', NULL, false,
    'contract', 'WOODMERE FINANCIAL - FINANCIAL CONTRACT.pdf', NULL,
    'Woodmere Financial', 1, true, 'platform', CURRENT_TIMESTAMP
)
ON CONFLICT ("name") DO NOTHING;

UPDATE "FunderProfile"
SET "documentsSource" = 'platform'
WHERE "id" = 'b1000000-0000-4000-8000-000000000001'
   OR LOWER("name") LIKE '%woodmere%';
