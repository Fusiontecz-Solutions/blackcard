-- Store human-readable term strings ("35 Days", "NA") from Excel / UI; was integer-only.
ALTER TABLE "OfferDecision" ALTER COLUMN "term" DROP DEFAULT;
ALTER TABLE "OfferDecision" ALTER COLUMN "term" TYPE TEXT USING (
  CASE
    WHEN "term" IS NULL THEN NULL
    ELSE "term"::text
  END
);
