-- Underwriter → Scrubber correction send-back (pre-decision only).
ALTER TABLE "Application" ADD COLUMN "returnedToScrubberId" UUID;
ALTER TABLE "Application" ADD COLUMN "returnedByUnderwriterId" UUID;
ALTER TABLE "Application" ADD COLUMN "returnedToScrubberAt" TIMESTAMP(3);
ALTER TABLE "Application" ADD COLUMN "returnReasons" TEXT;
ALTER TABLE "Application" ADD COLUMN "returnNote" TEXT;

CREATE INDEX "Application_returnedToScrubberId_idx" ON "Application"("returnedToScrubberId");

ALTER TABLE "Application" ADD CONSTRAINT "Application_returnedToScrubberId_fkey"
    FOREIGN KEY ("returnedToScrubberId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Application" ADD CONSTRAINT "Application_returnedByUnderwriterId_fkey"
    FOREIGN KEY ("returnedByUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
