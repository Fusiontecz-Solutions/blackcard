-- Excel import: amount associated with REVERSE applications.
ALTER TABLE "OfferDecision" ADD COLUMN IF NOT EXISTS "reverseAmount" DECIMAL(18,2);
