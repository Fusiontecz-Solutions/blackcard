-- CreateTable
CREATE TABLE "ReportPaymentFact" (
    "id" UUID NOT NULL,
    "bookId" UUID NOT NULL,
    "paymentUuid" TEXT NOT NULL,
    "applicationUuid" TEXT,
    "applicationNumericId" TEXT,
    "dealId" TEXT,
    "merchantName" TEXT,
    "amount" DECIMAL(18,2),
    "paidAmount" DECIMAL(18,2),
    "status" TEXT NOT NULL,
    "rawStatus" TEXT,
    "failureReason" TEXT,
    "method" TEXT,
    "scheduledDate" TIMESTAMP(3),
    "processedDate" TIMESTAMP(3),
    "createdAtTenant" TIMESTAMP(3),
    "updatedAtTenant" TIMESTAMP(3),
    "notes" TEXT,
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportPaymentFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportPaymentFact_bookId_status_idx" ON "ReportPaymentFact"("bookId", "status");

-- CreateIndex
CREATE INDEX "ReportPaymentFact_scheduledDate_idx" ON "ReportPaymentFact"("scheduledDate");

-- CreateIndex
CREATE INDEX "ReportPaymentFact_processedDate_idx" ON "ReportPaymentFact"("processedDate");

-- CreateIndex
CREATE INDEX "ReportPaymentFact_applicationUuid_idx" ON "ReportPaymentFact"("applicationUuid");

-- CreateIndex
CREATE INDEX "ReportPaymentFact_bookId_applicationUuid_idx" ON "ReportPaymentFact"("bookId", "applicationUuid");

-- CreateIndex
CREATE UNIQUE INDEX "ReportPaymentFact_bookId_paymentUuid_key" ON "ReportPaymentFact"("bookId", "paymentUuid");

-- AddForeignKey
ALTER TABLE "ReportPaymentFact" ADD CONSTRAINT "ReportPaymentFact_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

