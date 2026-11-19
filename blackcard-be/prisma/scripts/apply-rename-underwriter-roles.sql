-- Rename workflow stage + role: Underwriter -> Scrubbing, Final Underwriter -> Underwriter.
-- Safe to run when DB still has legacy UNDERWRITER + FINAL_UNDERWRITER enum values.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'UNDERWRITER'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'SCRUBBING'
  ) THEN
    ALTER TYPE "Role" RENAME VALUE 'UNDERWRITER' TO 'SCRUBBING';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role' AND e.enumlabel = 'FINAL_UNDERWRITER'
  ) THEN
    ALTER TYPE "Role" RENAME VALUE 'FINAL_UNDERWRITER' TO 'UNDERWRITER';
  END IF;
END $$;

UPDATE "Application" SET "currentQueue" = 'Scrubbing' WHERE "currentQueue" = 'Underwriter';
UPDATE "Application" SET "currentQueue" = 'Underwriter' WHERE "currentQueue" = 'Final Underwriter';

UPDATE "Application" SET "currentState" = 'Scrubbing' WHERE "currentState" = 'Underwriter';
UPDATE "Application" SET "currentState" = 'Underwriter' WHERE "currentState" = 'Final Underwriter';
