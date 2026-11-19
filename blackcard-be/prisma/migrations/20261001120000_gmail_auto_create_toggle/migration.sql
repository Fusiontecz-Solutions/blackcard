-- Per-mailbox switch for automatic deal creation from Gmail PDF emails.
ALTER TABLE "User" ADD COLUMN "gmailAutoCreateEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "gmailAutoCreateEnabledAt" TIMESTAMP(3);
