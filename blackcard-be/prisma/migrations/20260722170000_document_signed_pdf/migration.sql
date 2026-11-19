-- Durable Cloudinary archive of signed DocuSign envelopes (per-funder folder uploads).
ALTER TABLE "Document"
ADD COLUMN IF NOT EXISTS "signedPdfUrl" TEXT,
ADD COLUMN IF NOT EXISTS "signedPdfPublicId" TEXT;
