-- AlterTable
ALTER TABLE "Application" ADD COLUMN "assignedUnderwriterId" UUID;

-- CreateIndex
CREATE INDEX "Application_assignedUnderwriterId_idx" ON "Application"("assignedUnderwriterId");

-- CreateIndex
CREATE INDEX "Application_currentQueue_assignedUnderwriterId_idx" ON "Application"("currentQueue", "assignedUnderwriterId");

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_assignedUnderwriterId_fkey" FOREIGN KEY ("assignedUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
