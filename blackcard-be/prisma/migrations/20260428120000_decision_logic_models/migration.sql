-- Decision Logic persistence (see prisma/schema/decisionLogic.prisma)

CREATE TABLE "DecisionLogicToken" (
    "token" TEXT NOT NULL,
    "businessOwnerId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLogicToken_pkey" PRIMARY KEY ("token")
);

CREATE TABLE "DecisionLogicReportRow" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestCode" TEXT NOT NULL,
    "businessOwnerId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "reportsDetails" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DecisionLogicReportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DecisionLogicReportRow_requestCode_businessOwnerId_bankAccountId_key" ON "DecisionLogicReportRow"("requestCode", "businessOwnerId", "bankAccountId");

CREATE INDEX "DecisionLogicReportRow_businessOwnerId_idx" ON "DecisionLogicReportRow"("businessOwnerId");
