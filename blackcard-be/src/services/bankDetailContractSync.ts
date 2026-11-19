import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { decryptEncryptedStringsInJson, encryptField } from '../utils/fieldEncryption';

/** Plaintext bank fields copied into Contract / ACH for DocuSign prefill (not re-encrypted). */
export type PlainBankFields = {
  bankName: string;
  accountNumber: string;
  routingNumber: string | null;
};

export type PlainBankFromRequest = {
  bankName?: string;
  accountNumber?: string;
  routingNumber?: string | null;
};

const PREFILL_BANK_OVERRIDE_KEYS = [
  'authorizationClientBankName',
  'authorizationClientBankAccount',
  'authorizationClientBankRouting',
  'achAuthorizationAccountHolderBankName',
  'achAuthorizationAccountHolderBankAccountNumber',
  'achAuthorizationAccountHolderBankRoutingNumber',
] as const;

const DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY = 'documentTemplatePrefillByMappingId';

function normalizeAchMappingTabKey(key: string): string {
  return String(key || '')
    .toLowerCase()
    .replace(/^ach_form_texas_/, '')
    .replace(/^ach_form_/, '')
    .replace(/__instance_\d+$/i, '')
    .replace(/__p\d+_[a-z0-9]+$/i, '')
    .replace(/__page\d+$/i, '');
}

function setAchMappingBankField(
  fields: Record<string, string>,
  canonicalTab: string,
  value: string,
): void {
  if (!value) return;
  const target = normalizeAchMappingTabKey(canonicalTab);
  let matched = false;
  for (const key of Object.keys(fields)) {
    if (normalizeAchMappingTabKey(key) === target) {
      matched = true;
      fields[key] = value;
    }
  }
  if (!matched) {
    fields[canonicalTab] = value;
  }
}

function mappingLooksLikeAch(fields: Record<string, unknown>, mappingId: string): boolean {
  const id = String(mappingId || '').toLowerCase();
  if (id === 'ach_authorization' || id.includes('ach')) return true;
  return Object.keys(fields).some((key) => {
    const k = key.toLowerCase();
    return (
      k.includes('authorization_client') ||
      k.includes('ach_authorization') ||
      k.includes('authorized_business_phone')
    );
  });
}

function patchDocumentTemplatePrefillAchBank(
  overrides: Record<string, unknown>,
  bank: PlainBankFields,
): Record<string, unknown> {
  const rawBlob = overrides[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
  if (rawBlob == null || typeof rawBlob !== 'object' || Array.isArray(rawBlob)) {
    return overrides;
  }
  const blob = { ...(rawBlob as Record<string, unknown>) };
  let blobChanged = false;
  for (const [mappingId, rawFields] of Object.entries(blob)) {
    if (rawFields == null || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
      continue;
    }
    const stringFields: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawFields as Record<string, unknown>)) {
      stringFields[k] = String(v ?? '');
    }
    if (!mappingLooksLikeAch(stringFields, mappingId)) continue;

    setAchMappingBankField(stringFields, 'authorization_client_bank_name', bank.bankName);
    setAchMappingBankField(
      stringFields,
      'authorization_client_bank_routing',
      bank.routingNumber || '',
    );
    setAchMappingBankField(
      stringFields,
      'authorization_client_bank_account',
      bank.accountNumber,
    );
    setAchMappingBankField(
      stringFields,
      'ach_authorization_account_holder_bank_name',
      bank.bankName,
    );
    setAchMappingBankField(
      stringFields,
      'ach_authorization_account_holder_bank_routing_number',
      bank.routingNumber || '',
    );
    setAchMappingBankField(
      stringFields,
      'ach_authorization_account_holder_bank_account_number',
      bank.accountNumber,
    );

    blob[mappingId] = stringFields;
    blobChanged = true;
  }
  if (!blobChanged) return overrides;
  return {
    ...overrides,
    [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: blob,
  };
}

function patchContractPrefillOverridesBankFields(
  existing: unknown,
  bank: PlainBankFields,
): Record<string, unknown> {
  const base =
    existing != null && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  const next: Record<string, unknown> = {
    authorizationClientBankName: bank.bankName || null,
    authorizationClientBankAccount: bank.accountNumber || null,
    authorizationClientBankRouting: bank.routingNumber || null,
    achAuthorizationAccountHolderBankName: bank.bankName || null,
    achAuthorizationAccountHolderBankAccountNumber: bank.accountNumber || null,
    achAuthorizationAccountHolderBankRoutingNumber: bank.routingNumber || null,
  };
  for (const key of PREFILL_BANK_OVERRIDE_KEYS) {
    base[key] = next[key];
  }
  return decryptEncryptedStringsInJson(
    patchDocumentTemplatePrefillAchBank(base, bank),
  ) as Record<string, unknown>;
}

function toPlainBankFields(plainBank: PlainBankFromRequest): PlainBankFields {
  return {
    bankName: String(plainBank.bankName ?? '').trim(),
    accountNumber: String(plainBank.accountNumber ?? '').trim(),
    routingNumber:
      plainBank.routingNumber != null ? String(plainBank.routingNumber).trim() || null : null,
  };
}

/**
 * After BankDetail create/update, mirror plaintext into Contract authorization fields,
 * contract prefill (including ACH mapping blobs), and ACH rows so Application bank
 * details, Verify prefill, ACH forms, and Decision Logic all show the same values.
 */
export async function syncBankDetailToContractPrefill(
  applicationId: string,
  plainBank: PlainBankFromRequest,
  options?: { bankDetailId?: string },
): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { applicationId },
    select: { id: true, clientId: true, contractPrefillOverrides: true },
  });
  if (!contract) return;

  const bank = toPlainBankFields(plainBank);
  const bankName = bank.bankName;
  const accountNumber = bank.accountNumber;
  const routingNumber = bank.routingNumber || '';

  const contractUpdate: Prisma.ContractUpdateInput = {
    authorizationClientBankName: bankName || null,
    authorizationClientBankAccount: accountNumber || null,
    authorizationClientBankRouting: routingNumber || null,
    contractPrefillOverrides: patchContractPrefillOverridesBankFields(
      contract.contractPrefillOverrides,
      bank,
    ) as Prisma.InputJsonValue,
  };
  if (options?.bankDetailId) {
    contractUpdate.paymentBank = { connect: { id: options.bankDetailId } };
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: contractUpdate,
  });

  const achUpdate = {
    bankName: bankName || null,
    accountNumber: accountNumber || null,
    routingNumber: routingNumber || null,
  };

  const achCount = await prisma.aCH.count({ where: { contractId: contract.id } });
  if (achCount > 0) {
    await prisma.aCH.updateMany({
      where: { contractId: contract.id },
      data: achUpdate,
    });
  }
}

/**
 * After Contract prefill / ACH / voided-check update, sync plaintext bank fields
 * back to BankDetail so Application Overview and Decision Logic stay in sync.
 */
export async function syncContractPrefillToBankDetail(
  applicationId: string,
  plainBank: PlainBankFromRequest,
  options?: { bankDetailId?: string },
): Promise<void> {
  const bank = toPlainBankFields(plainBank);
  const bankName = bank.bankName;
  const accountNumber = bank.accountNumber;
  const routingNumber = bank.routingNumber || '';

  if (!bankName && !accountNumber && !routingNumber) return;

  let bankDetailId = options?.bankDetailId;
  if (!bankDetailId) {
    const contract = await prisma.contract.findUnique({
      where: { applicationId },
      select: { paymentBankId: true },
    });
    bankDetailId = contract?.paymentBankId ?? undefined;
  }
  if (!bankDetailId) {
    const latest = await prisma.bankDetail.findFirst({
      where: { applicationId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    bankDetailId = latest?.id;
  }

  const plain: PlainBankFields = {
    bankName: bankName || 'Bank',
    accountNumber,
    routingNumber: routingNumber || null,
  };

  if (!bankDetailId) {
    if (!accountNumber) return;

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, createdById: true, salesRepresentativeId: true },
    });
    const createdById =
      application?.createdById ?? application?.salesRepresentativeId ?? undefined;
    if (!application || !createdById) return;

    const created = await prisma.bankDetail.create({
      data: {
        bankName: plain.bankName,
        accountNumber: encryptField(accountNumber),
        routingNumber: routingNumber ? encryptField(routingNumber) : null,
        applicationId: application.id,
        createdById,
      },
      select: { id: true },
    });
    bankDetailId = created.id;
    await syncBankDetailToContractPrefill(applicationId, plain, { bankDetailId });
    return;
  }

  const data: Prisma.BankDetailUpdateInput = {};
  if (bankName) data.bankName = bankName;
  if (accountNumber) data.accountNumber = encryptField(accountNumber);
  if (routingNumber) data.routingNumber = encryptField(routingNumber);

  if (Object.keys(data).length === 0) return;

  await prisma.bankDetail.update({
    where: { id: bankDetailId },
    data,
  });

  await syncBankDetailToContractPrefill(applicationId, plain, { bankDetailId });
}

/**
 * After ACH create/update or voided-check persist, push bank name/account/routing
 * to Application BankDetail + contract prefill (Decision Logic reads BankDetail).
 */
export async function syncAchBankFieldsToApplication(
  contractId: number | null | undefined,
  plainBank: PlainBankFromRequest,
): Promise<void> {
  if (contractId == null || !Number.isFinite(Number(contractId))) return;
  const bank = toPlainBankFields(plainBank);
  if (!bank.bankName && !bank.accountNumber && !bank.routingNumber) return;

  const contract = await prisma.contract.findUnique({
    where: { id: Number(contractId) },
    select: { applicationId: true, paymentBankId: true },
  });
  const applicationId = String(contract?.applicationId ?? '').trim();
  if (!applicationId) return;

  await syncContractPrefillToBankDetail(applicationId, bank, {
    bankDetailId: contract?.paymentBankId ?? undefined,
  });
}
