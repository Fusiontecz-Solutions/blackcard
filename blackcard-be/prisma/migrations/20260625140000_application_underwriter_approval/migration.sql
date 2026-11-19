-- AlterTable
ALTER TABLE "Application" ADD COLUMN "approvedByUnderwriterId" UUID;
ALTER TABLE "Application" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Application_approvedByUnderwriterId_idx" ON "Application"("approvedByUnderwriterId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_approvedByUnderwriterId_fkey" FOREIGN KEY ("approvedByUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
