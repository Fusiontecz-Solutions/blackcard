ALTER TABLE "FunderProfile"
ADD COLUMN IF NOT EXISTS "letterWireBankName" TEXT,
ADD COLUMN IF NOT EXISTS "letterWireAddressLine1" TEXT,
ADD COLUMN IF NOT EXISTS "letterWireCityStateZip" TEXT,
ADD COLUMN IF NOT EXISTS "letterWireRoutingNumber" TEXT,
ADD COLUMN IF NOT EXISTS "letterWireAccountNumber" TEXT;
