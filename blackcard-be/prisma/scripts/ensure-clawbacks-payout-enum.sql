-- Idempotent: safe if CLAWBACKS already exists (e.g. manual or partial migrate).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'IsoApplicationPayoutStatus'
          AND e.enumlabel = 'CLAWBACKS'
    ) THEN
        ALTER TYPE "IsoApplicationPayoutStatus" ADD VALUE 'CLAWBACKS';
    END IF;
END $$;
