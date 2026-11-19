-- CreateTable
CREATE TABLE "UnderwriterRoutingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "designatedUnderwriterId" UUID,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnderwriterRoutingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnderwriterRoutingConfig_designatedUnderwriterId_idx" ON "UnderwriterRoutingConfig"("designatedUnderwriterId");

-- AddForeignKey
ALTER TABLE "UnderwriterRoutingConfig" ADD CONSTRAINT "UnderwriterRoutingConfig_designatedUnderwriterId_fkey" FOREIGN KEY ("designatedUnderwriterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
