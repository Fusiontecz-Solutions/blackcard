-- Syndicator wallet withdrawal requests (pending until staff approves)
CREATE TYPE "SyndicatorWithdrawalRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

CREATE TABLE "SyndicatorWithdrawalRequest" (
    "id" SERIAL NOT NULL,
    "syndicatorId" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "transactionType" TEXT,
    "comment" TEXT,
    "payoutDate" TIMESTAMP(3),
    "status" "SyndicatorWithdrawalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyndicatorWithdrawalRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SyndicatorWithdrawalRequest_syndicatorId_status_idx" ON "SyndicatorWithdrawalRequest"("syndicatorId", "status");

ALTER TABLE "SyndicatorWithdrawalRequest" ADD CONSTRAINT "SyndicatorWithdrawalRequest_syndicatorId_fkey" FOREIGN KEY ("syndicatorId") REFERENCES "Syndicator"("id") ON DELETE CASCADE ON UPDATE CASCADE;
