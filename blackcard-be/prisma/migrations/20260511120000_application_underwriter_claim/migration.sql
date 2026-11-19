-- AlterTable
ALTER TABLE "Application" ADD COLUMN "claimedByUnderwriterId" UUID;
ALTER TABLE "Application" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Application_claimedByUnderwriterId_idx" ON "Application"("claimedByUnderwriterId");

-- CreateIndex
CREATE INDEX "Application_currentQueue_claimedByUnderwriterId_idx" ON "Application"("currentQueue", "claimedByUnderwriterId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_claimedByUnderwriterId_fkey" FOREIGN KEY ("claimedByUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
