-- Scrubbing stage + underwriter pipeline fields (Woodmere parity with workflow rename).

-- 1) New application columns for final-underwriter claim + approval tracking.
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "approvedByUnderwriterId" UUID;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "underwriterAction" TEXT;
ALTER TABLE "Application" ADD COLUMN IF NOT EXISTS "assignedUnderwriterId" UUID;

CREATE INDEX IF NOT EXISTS "Application_approvedByUnderwriterId_idx" ON "Application"("approvedByUnderwriterId");
CREATE INDEX IF NOT EXISTS "Application_assignedUnderwriterId_idx" ON "Application"("assignedUnderwriterId");
CREATE INDEX IF NOT EXISTS "Application_currentQueue_assignedUnderwriterId_idx" ON "Application"("currentQueue", "assignedUnderwriterId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Application_approvedByUnderwriterId_fkey'
    ) THEN
        ALTER TABLE "Application"
            ADD CONSTRAINT "Application_approvedByUnderwriterId_fkey"
            FOREIGN KEY ("approvedByUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Application_assignedUnderwriterId_fkey'
    ) THEN
        ALTER TABLE "Application"
            ADD CONSTRAINT "Application_assignedUnderwriterId_fkey"
            FOREIGN KEY ("assignedUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- 2) Role enum: Underwriter -> Scrubbing, Final Underwriter -> Underwriter.
-- Use RENAME VALUE (not drop/add) so existing User rows are preserved.
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

-- 3) Application workflow string columns.
UPDATE "Application" SET "currentQueue" = 'Scrubbing'   WHERE "currentQueue" = 'Underwriter';
UPDATE "Application" SET "currentQueue" = 'Underwriter' WHERE "currentQueue" = 'Final Underwriter';

UPDATE "Application" SET "currentState" = 'Scrubbing'   WHERE "currentState" = 'Underwriter';
UPDATE "Application" SET "currentState" = 'Underwriter' WHERE "currentState" = 'Final Underwriter';
