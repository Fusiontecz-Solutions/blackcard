-- Durable Gmail PDF auto-create idempotency (SHA message keys; read + unread scan).
CREATE TABLE IF NOT EXISTS "GmailAutoCreateLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "messageKey" TEXT NOT NULL,
    "pdfContentHash" TEXT,
    "applicationId" UUID,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GmailAutoCreateLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GmailAutoCreateLedger_messageKey_key"
    ON "GmailAutoCreateLedger"("messageKey");

CREATE UNIQUE INDEX IF NOT EXISTS "GmailAutoCreateLedger_userId_gmailMessageId_key"
    ON "GmailAutoCreateLedger"("userId", "gmailMessageId");

CREATE INDEX IF NOT EXISTS "GmailAutoCreateLedger_userId_idx"
    ON "GmailAutoCreateLedger"("userId");

CREATE INDEX IF NOT EXISTS "GmailAutoCreateLedger_pdfContentHash_idx"
    ON "GmailAutoCreateLedger"("pdfContentHash");

CREATE INDEX IF NOT EXISTS "GmailAutoCreateLedger_createdAt_idx"
    ON "GmailAutoCreateLedger"("createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GmailAutoCreateLedger_userId_fkey'
    ) THEN
        ALTER TABLE "GmailAutoCreateLedger"
            ADD CONSTRAINT "GmailAutoCreateLedger_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GmailAutoCreateLedger_applicationId_fkey'
    ) THEN
        ALTER TABLE "GmailAutoCreateLedger"
            ADD CONSTRAINT "GmailAutoCreateLedger_applicationId_fkey"
            FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
