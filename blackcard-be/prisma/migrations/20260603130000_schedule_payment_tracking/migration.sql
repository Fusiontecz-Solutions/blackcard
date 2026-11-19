-- Schedule payment tracking (confirmed installments per application batch)
CREATE TYPE "SchedulePaymentTrackingStatus" AS ENUM ('SCHEDULED', 'SUPERSEDED', 'CANCELLED');

CREATE TABLE "SchedulePaymentTracking" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "applicationId" UUID NOT NULL,
    "dealId" TEXT,
    "batchId" UUID NOT NULL,
    "paymentNumber" INTEGER NOT NULL,
    "scheduledDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "label" TEXT,
    "paymentStartDate" DATE,
    "effectiveStartDate" DATE,
    "status" "SchedulePaymentTrackingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "confirmedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchedulePaymentTracking_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchedulePaymentTracking_applicationId_idx" ON "SchedulePaymentTracking"("applicationId");
CREATE INDEX "SchedulePaymentTracking_applicationId_status_idx" ON "SchedulePaymentTracking"("applicationId", "status");
CREATE INDEX "SchedulePaymentTracking_batchId_idx" ON "SchedulePaymentTracking"("batchId");
CREATE INDEX "SchedulePaymentTracking_dealId_idx" ON "SchedulePaymentTracking"("dealId");

ALTER TABLE "SchedulePaymentTracking" ADD CONSTRAINT "SchedulePaymentTracking_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SchedulePaymentTracking" ADD CONSTRAINT "SchedulePaymentTracking_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
