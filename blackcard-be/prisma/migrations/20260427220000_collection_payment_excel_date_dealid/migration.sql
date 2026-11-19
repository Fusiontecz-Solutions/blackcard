-- Excel upload: store transaction date and deal id; allow rows without scheduledDate when date is set on "date".
ALTER TABLE "CollectionPayment" ADD COLUMN IF NOT EXISTS "date" DATE;
ALTER TABLE "CollectionPayment" ADD COLUMN IF NOT EXISTS "dealId" TEXT;
ALTER TABLE "CollectionPayment" ALTER COLUMN "scheduledDate" DROP NOT NULL;
