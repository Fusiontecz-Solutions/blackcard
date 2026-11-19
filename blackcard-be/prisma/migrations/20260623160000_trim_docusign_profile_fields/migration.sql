-- Remove unused per-account DocuSign / funder settings (use .env for base URI, return URL, lender name)

ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "baseUri";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "defaultTemplateId";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "lenderEmailName";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "senderReturnUrl";
ALTER TABLE "DocuSignAccountProfile" DROP COLUMN IF EXISTS "notes";

ALTER TABLE "FunderProfile" DROP COLUMN IF EXISTS "lenderEmailName";
ALTER TABLE "FunderProfile" DROP COLUMN IF EXISTS "notes";
