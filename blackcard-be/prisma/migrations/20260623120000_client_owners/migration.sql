-- CreateTable
CREATE TABLE "ClientOwner" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "mobileNumber" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "ssn" TEXT,
    "ficoScore" INTEGER,
    "ownershipStartDate" TIMESTAMP(3),
    "ownershipPercentage" DOUBLE PRECISION,
    "address1" TEXT,
    "address2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientOwner_clientId_idx" ON "ClientOwner"("clientId");

-- CreateIndex
CREATE INDEX "ClientOwner_ssn_idx" ON "ClientOwner"("ssn");

-- AddForeignKey
ALTER TABLE "ClientOwner" ADD CONSTRAINT "ClientOwner_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing primary owners from Client flat fields
INSERT INTO "ClientOwner" (
    "id",
    "clientId",
    "sortOrder",
    "firstName",
    "middleName",
    "lastName",
    "email",
    "mobileNumber",
    "dateOfBirth",
    "ssn",
    "ficoScore",
    "ownershipStartDate",
    "ownershipPercentage",
    "address1",
    "address2",
    "city",
    "state",
    "zipCode",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    "id",
    0,
    "ownerFirstName",
    "ownerMiddleName",
    "ownerLastName",
    "ownerEmail",
    "ownerMobileNumber",
    "ownerDateOfBirth",
    "ownerSsn",
    "ownerFicoScore",
    "ownerOwnershipStartDate",
    "ownerOwnershipPercentage",
    "ownerAddress1",
    "ownerAddress2",
    "ownerCity",
    "ownerState",
    "ownerZipCode",
    CURRENT_TIMESTAMP
FROM "Client";
