-- Persist per-deal commission from bulk imports and other flows; optional so existing rows stay valid.
ALTER TABLE "IsoApplicationPayout" ADD COLUMN IF NOT EXISTS "commissionAmount" DECIMAL(18,2);
