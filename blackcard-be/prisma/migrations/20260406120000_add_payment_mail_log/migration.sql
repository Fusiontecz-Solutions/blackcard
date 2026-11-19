-- Payment workspace mail history (Letters tab)
CREATE TYPE "PaymentMailLogStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TABLE "PaymentMailLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "applicationId" UUID NOT NULL,
    "dealKey" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT,
    "status" "PaymentMailLogStatus" NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentMailLog_applicationId_idx" ON "PaymentMailLog"("applicationId");
CREATE INDEX "PaymentMailLog_createdAt_idx" ON "PaymentMailLog"("createdAt");

ALTER TABLE "PaymentMailLog" ADD CONSTRAINT "PaymentMailLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentMailLog" ADD CONSTRAINT "PaymentMailLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
