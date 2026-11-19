-- Commission dollars live on Application (imports, reporting). Remove legacy payout column if present.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "commissionAmount" DOUBLE PRECISION;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'IsoApplicationPayout'
      AND column_name = 'commissionAmount'
  ) THEN
    UPDATE "Application" a
    SET "commissionAmount" = (p."commissionAmount")::double precision
    FROM "IsoApplicationPayout" p
    WHERE p."applicationId" = a.id
      AND p."commissionAmount" IS NOT NULL
      AND a."commissionAmount" IS NULL;

    ALTER TABLE "IsoApplicationPayout" DROP COLUMN "commissionAmount";
  END IF;
END $$;
