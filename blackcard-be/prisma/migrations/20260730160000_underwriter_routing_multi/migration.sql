-- DropForeignKey
ALTER TABLE "UnderwriterRoutingConfig" DROP CONSTRAINT IF EXISTS "UnderwriterRoutingConfig_designatedUnderwriterId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "UnderwriterRoutingConfig_designatedUnderwriterId_idx";

-- AlterTable
ALTER TABLE "UnderwriterRoutingConfig" ADD COLUMN "designatedUnderwriterIds" UUID[] DEFAULT ARRAY[]::UUID[];

-- Carry over the single designated underwriter set before multi-select existed.
UPDATE "UnderwriterRoutingConfig"
SET "designatedUnderwriterIds" = ARRAY["designatedUnderwriterId"]
WHERE "designatedUnderwriterId" IS NOT NULL;

-- AlterTable
ALTER TABLE "UnderwriterRoutingConfig" DROP COLUMN IF EXISTS "designatedUnderwriterId";
