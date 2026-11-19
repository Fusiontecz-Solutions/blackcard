CREATE TABLE "DocuSignAccountProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "integrationKey" TEXT NOT NULL,
    "clientSecret" TEXT,
    "impersonatedUserId" TEXT NOT NULL,
    "rsaPrivateKey" TEXT NOT NULL,
    "accountId" TEXT,
    "baseUri" TEXT,
    "authBase" TEXT NOT NULL DEFAULT 'https://account-d.docusign.com',
    "defaultTemplateId" TEXT,
    "defaultRoleName" TEXT NOT NULL DEFAULT 'Signer',
    "lenderEmailName" TEXT,
    "webhookUser" TEXT,
    "webhookPassword" TEXT,
    "senderReturnUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocuSignAccountProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FunderProfile" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "dealIdPrefix" TEXT,
    "assignsDealId" BOOLEAN NOT NULL DEFAULT false,
    "mainContractLayoutKey" TEXT NOT NULL DEFAULT 'contract',
    "contractPdfFileName" TEXT,
    "allowedStates" JSONB,
    "organization" TEXT,
    "legalName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "addressLine1" TEXT,
    "addressCity" TEXT,
    "addressState" TEXT,
    "addressZip" TEXT,
    "docusignAccountProfileId" UUID,
    "lenderEmailName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunderProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunderProfile_name_key" ON "FunderProfile"("name");
CREATE INDEX "DocuSignAccountProfile_name_idx" ON "DocuSignAccountProfile"("name");
CREATE INDEX "DocuSignAccountProfile_isActive_idx" ON "DocuSignAccountProfile"("isActive");
CREATE INDEX "FunderProfile_docusignAccountProfileId_idx" ON "FunderProfile"("docusignAccountProfileId");
CREATE INDEX "FunderProfile_isActive_idx" ON "FunderProfile"("isActive");
CREATE INDEX "FunderProfile_sortOrder_idx" ON "FunderProfile"("sortOrder");

ALTER TABLE "FunderProfile" ADD CONSTRAINT "FunderProfile_docusignAccountProfileId_fkey" FOREIGN KEY ("docusignAccountProfileId") REFERENCES "DocuSignAccountProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default funders (replaces hardcoded Katan II / III + Alliance Bridge)
INSERT INTO "FunderProfile" (
    "id", "name", "displayName", "dealIdPrefix", "assignsDealId",
    "mainContractLayoutKey", "contractPdfFileName", "allowedStates",
    "organization", "sortOrder", "isActive", "updatedAt"
) VALUES
(
    'a1000000-0000-4000-8000-000000000001',
    'Katan II',
    'Katan II',
    'KK',
    true,
    'contract',
    'Contract.pdf',
    NULL,
    'Katan II',
    1,
    true,
    CURRENT_TIMESTAMP
),
(
    'a1000000-0000-4000-8000-000000000002',
    'Katan III',
    'Katan III',
    'KC',
    true,
    'contract',
    'Contract.pdf',
    NULL,
    'Katan III',
    2,
    true,
    CURRENT_TIMESTAMP
),
(
    'a1000000-0000-4000-8000-000000000003',
    'ALLIANCE BRIDGE CAPITAL',
    'Alliance Bridge Capital',
    NULL,
    false,
    'alliance_bridge_contract',
    'ALLIANCE BRIDGE CAPITAL.pdf',
    '["TX","tx","Texas","texas"]'::jsonb,
    NULL,
    3,
    true,
    CURRENT_TIMESTAMP
);
