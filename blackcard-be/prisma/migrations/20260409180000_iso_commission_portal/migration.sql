-- CreateEnum
CREATE TYPE "IsoApplicationPayoutStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "IsoCommissionSchedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "isoId" UUID NOT NULL,
    "applicationId" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "scheduleDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsoCommissionSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IsoApplicationPayout" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "isoId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "payoutStatus" "IsoApplicationPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsoApplicationPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IsoCommissionSchedule_isoId_idx" ON "IsoCommissionSchedule"("isoId");

-- CreateIndex
CREATE INDEX "IsoCommissionSchedule_applicationId_idx" ON "IsoCommissionSchedule"("applicationId");

-- CreateIndex
CREATE INDEX "IsoApplicationPayout_isoId_idx" ON "IsoApplicationPayout"("isoId");

-- CreateIndex
CREATE INDEX "IsoApplicationPayout_applicationId_idx" ON "IsoApplicationPayout"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "IsoApplicationPayout_isoId_applicationId_key" ON "IsoApplicationPayout"("isoId", "applicationId");

-- AddForeignKey
ALTER TABLE "IsoCommissionSchedule" ADD CONSTRAINT "IsoCommissionSchedule_isoId_fkey" FOREIGN KEY ("isoId") REFERENCES "Iso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoCommissionSchedule" ADD CONSTRAINT "IsoCommissionSchedule_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoApplicationPayout" ADD CONSTRAINT "IsoApplicationPayout_isoId_fkey" FOREIGN KEY ("isoId") REFERENCES "Iso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsoApplicationPayout" ADD CONSTRAINT "IsoApplicationPayout_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
