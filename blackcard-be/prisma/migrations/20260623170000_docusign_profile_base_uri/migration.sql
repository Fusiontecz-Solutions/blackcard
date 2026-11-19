-- Auth base is environment-wide (DOCUSIGN_AUTH_BASE); base URI is per DocuSign account.

ALTER TABLE "DocuSignAccountProfile" ADD COLUMN IF NOT EXISTS "baseUri" TEXT;
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "authBase";
