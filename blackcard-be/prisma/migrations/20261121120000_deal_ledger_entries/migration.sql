-- Funding wires and ISO commission payouts per deal, synced from the Google Sheet bank ledger.
DO $$ BEGIN
    CREATE TYPE "DealLedgerKind" AS ENUM ('FUNDING', 'COMMISSION');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DealLedgerEntry" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "dealId" TEXT NOT NULL,
    "kind" "DealLedgerKind" NOT NULL,
    "entryDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'SHEET_SYNC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DealLedgerEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "DealLedgerEntry_applicationId_fkey" FOREIGN KEY ("applicationId")
        REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DealLedgerEntry_applicationId_kind_idx" ON "DealLedgerEntry"("applicationId", "kind");
CREATE INDEX IF NOT EXISTS "DealLedgerEntry_dealId_idx" ON "DealLedgerEntry"("dealId");
