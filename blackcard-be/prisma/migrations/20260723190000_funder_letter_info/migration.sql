ALTER TABLE "FunderProfile"
ADD COLUMN IF NOT EXISTS "letterCompanyName" TEXT,
ADD COLUMN IF NOT EXISTS "letterLogoUrl" TEXT,
ADD COLUMN IF NOT EXISTS "letterWatermarkUrl" TEXT,
ADD COLUMN IF NOT EXISTS "letterAccentStripLight" TEXT,
ADD COLUMN IF NOT EXISTS "letterAccentStripDark" TEXT,
ADD COLUMN IF NOT EXISTS "letterInfoTableIconBg" TEXT;
