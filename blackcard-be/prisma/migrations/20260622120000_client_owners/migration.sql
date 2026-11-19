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

-- AddForeignKey
ALTER TABLE "ClientOwner" ADD CONSTRAINT "ClientOwner_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing primary owners from Client flat columns
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
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid(),
    c."id",
    0,
    c."ownerFirstName",
    c."ownerMiddleName",
    c."ownerLastName",
    c."ownerEmail",
    c."ownerMobileNumber",
    c."ownerDateOfBirth",
    c."ownerSsn",
    c."ownerFicoScore",
    c."ownerOwnershipStartDate",
    c."ownerOwnershipPercentage",
    c."ownerAddress1",
    c."ownerAddress2",
    c."ownerCity",
    c."ownerState",
    c."ownerZipCode",
    c."createdAt",
    c."updatedAt"
FROM "Client" c
WHERE c."ownerFirstName" IS NOT NULL
  AND c."ownerLastName" IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM "ClientOwner" co WHERE co."clientId" = c."id"
  );
