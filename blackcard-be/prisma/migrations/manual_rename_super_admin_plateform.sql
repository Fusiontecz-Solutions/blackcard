-- Align legacy PascalCase table name with Prisma @@map("superAdminPlateform").
-- Safe to run when only "SuperAdminPlateform" exists (no-op if already renamed).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'SuperAdminPlateform'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'superAdminPlateform'
  ) THEN
    ALTER TABLE "SuperAdminPlateform" RENAME TO "superAdminPlateform";
  END IF;
END $$;
