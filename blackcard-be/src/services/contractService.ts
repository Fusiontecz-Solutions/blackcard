import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import uploadService from './uploadService';
import { parseContractLengthDaysFromOfferTerm } from '../utils/deriveFrequencyFromTerm';
import { sanitizePaymentFrequencyForPersist } from '../utils/sanitizePaymentFrequency';
import { syncApplicationToContractGenerated } from './contractApplicationWorkflowSync';
import {
  decryptEncryptedStringsInJson,
  mapAchRecordForApi,
  mapBankDetailRecordForApi,
  mapContractRecordForApi,
  decryptSensitiveField,
} from '../utils/fieldEncryption';
import contractKycDocumentExtractService from './contractKycDocumentExtractService';
import {
  isKycDocumentType,
  mergeContractPrefillPatch,
  normalizeKycDocumentType,
  type KycDocumentType,
  type KycExtractionMapped,
} from './contractKycPrefillMapper';
import {
  loadContractReverseDisbursementConfig,
  normalizeReverseDisbursementScheduleData,
  renderReverseDisbursementSchedulePdf,
} from './pdf/reverseDisbursementSchedule.service';
import { mergePreservingDocuSignEnvelopeMeta } from './docusign/utils/preserve-docusign-prefill-meta';
import { resolveApplicationWhere } from './applicationService';
import {
  syncAchBankFieldsToApplication,
  syncContractPrefillToBankDetail,
  type PlainBankFromRequest,
} from './bankDetailContractSync';
import { syncContractPrefillIdentityToClient } from './clientContractPrefillSync';

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
}

function extractPlainBankFromContractUpdate(
  data: Record<string, unknown>,
): PlainBankFromRequest | null {
  const overrides =
    data.contractPrefillOverrides != null &&
    typeof data.contractPrefillOverrides === 'object' &&
    !Array.isArray(data.contractPrefillOverrides)
      ? (data.contractPrefillOverrides as Record<string, unknown>)
      : {};

  const bankName = firstNonEmptyString(
    data.authorizationClientBankName,
    overrides.authorizationClientBankName,
    overrides.achAuthorizationAccountHolderBankName,
  );
  const accountNumber = firstNonEmptyString(
    data.authorizationClientBankAccount,
    overrides.authorizationClientBankAccount,
    overrides.achAuthorizationAccountHolderBankAccountNumber,
  );
  const routingNumber = firstNonEmptyString(
    data.authorizationClientBankRouting,
    overrides.authorizationClientBankRouting,
    overrides.achAuthorizationAccountHolderBankRoutingNumber,
  );

  if (!bankName && !accountNumber && !routingNumber) return null;
  return { bankName, accountNumber, routingNumber };
}

async function syncAchRowBankQuiet(row: {
  contractId?: number | null;
  bankName?: string | null;
  accountNumber?: string | null;
  routingNumber?: string | null;
}): Promise<void> {
  try {
    await syncAchBankFieldsToApplication(row?.contractId, {
      bankName: row?.bankName ?? '',
      accountNumber: row?.accountNumber ?? '',
      routingNumber: row?.routingNumber ?? '',
    });
  } catch (err) {
    console.error('syncAchBankFieldsToApplication failed:', err);
  }
}

const APPLICATION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accept Application UUID `id` or numeric display `applicationId` (e.g. "1115"). */
async function resolveContractApplicationUuid(applicationRef: string): Promise<string | null> {
  const ref = String(applicationRef ?? '').trim();
  if (!ref) return null;
  if (APPLICATION_UUID_RE.test(ref)) return ref;

  const where = resolveApplicationWhere(ref);
  if (!where) return null;

  const app = await prisma.application.findUnique({
    where,
    select: { id: true },
  });
  return app?.id ?? null;
}

async function resolvePaymentBankDetailForContract(
  prismaClient: typeof prisma | any,
  options: {
    applicationId?: string;
    paymentBankId?: string;
  },
) {
  const { applicationId, paymentBankId } = options;

  const selectBank = {
    id: true,
    bankName: true,
    accountNumber: true,
    routingNumber: true,
  } as const;

  // Bank details are optional at contract creation — filled later from voided check / KYC.
  if (applicationId) {
    if (paymentBankId) {
      const bank = await prismaClient.bankDetail.findFirst({
        where: { id: paymentBankId, applicationId },
        select: selectBank,
      });
      if (bank) return mapBankDetailRecordForApi(bank);
    }
    const bank = await prismaClient.bankDetail.findFirst({
      where: { applicationId },
      orderBy: { createdAt: 'desc' },
      select: selectBank,
    });
    return bank ? mapBankDetailRecordForApi(bank) : null;
  }

  if (paymentBankId) {
    const bank = await prismaClient.bankDetail.findUnique({
      where: { id: paymentBankId },
      select: selectBank,
    });
    return bank ? mapBankDetailRecordForApi(bank) : null;
  }

  return null;
}

/** Coerce optional FK to a positive int or null so bogus values (e.g. NaN, 0, placeholders) never hit Prisma. */
function normalizeBusinessInfoIdForFk(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

const CONTRACT_EXTRA_STRING_FIELDS = [
  'legalName',
  'clientName',
  'entityType',
  'remittance',
  'clientEmail',
  'clientPhone',
  'customerName',
  'purchasePrice',
  'purchaseAmount',
  'purchasePercent',
  'securityTaxEin',
  'businessAddress',
  'businessAddressCity',
  'businessAddressState',
  'businessAddressZip',
  'doingBusinessAs',
  'federalTaxIdEin',
  'exhibitOwnerName',
  'appendixClientName',
  'appendixUnderwritingFees',
  'authorizationApplication',
  'authorizationClientDate',
  'authorizationClientName',
  'authorizationClientNamePrint',
  'authorizationClientTaxId',
  'authorizationClientBankName',
  'authorizationClientBankAccount',
  'authorizationClientBankRouting',
  'achAuthorizationBankPortalWebsite',
  'achAuthorizationUsername',
  'achAuthorizationPassword',
  'achAuthorizationSecurityQuestion1',
  'achAuthorizationSecurityAnswer1',
  'achAuthorizationSecurityQuestion2',
  'achAuthorizationSecurityAnswer2',
  'achAuthorizationSecurityQuestion3',
  'achAuthorizationSecurityAnswer3',
  'achAuthorizationOtherInfomation',
  'authorizedBusinessPhone',
  'businessAddressContract',
  'businessAddressContractCity',
  'businessAddressContractState',
  'businessAddressContractZip',
  'securityBusinessName',
  'securityDoingBusinessAs',
  'securityBusinessAddress',
  'securityBusinessAddressCity',
  'securityBusinessAddressState',
  'securityBusinessAddressZip',
  'securityGuarantor',
] as const;

type ContractExtraStringField = (typeof CONTRACT_EXTRA_STRING_FIELDS)[number];
type ContractExtraFields = Partial<Record<ContractExtraStringField, string | null | undefined>>;

function applyContractExtraFields(target: Record<string, unknown>, source: ContractExtraFields) {
  for (const key of CONTRACT_EXTRA_STRING_FIELDS) {
    if (!(key in source)) continue;
    const raw = source[key];
    target[key] = raw == null ? null : String(raw);
  }
}

const DOCUMENT_TYPE_FILENAME_SEPARATOR = '::';

function normalizeUploadedDocumentType(raw: unknown): string {
  const input = String(raw ?? '').trim();
  if (!input) return 'Other';
  const key = input.replace(/[\s_-]+/g, '').toLowerCase();
  const byKey: Record<string, string> = {
    voidedcheck: 'Voided Check',
    driverlicense: 'Driver License',
    bankstatement: 'Bank Statement',
    utilitybill: 'Utility Bill',
  };
  if (byKey[key]) return byKey[key];
  return input
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function encodeTypedFileName(documentType: string, originalFileName: string): string {
  const safeType = normalizeUploadedDocumentType(documentType);
  const safeName = String(originalFileName || '').trim() || `${safeType}-${Date.now()}`;
  return `${safeType}${DOCUMENT_TYPE_FILENAME_SEPARATOR}${safeName}`;
}

function decodeTypedFileName(storedFileName: unknown): {
  documentType: string | null;
  displayFileName: string;
} {
  const raw = String(storedFileName ?? '').trim();
  if (!raw) {
    return { documentType: null, displayFileName: '' };
  }
  const idx = raw.indexOf(DOCUMENT_TYPE_FILENAME_SEPARATOR);
  if (idx <= 0) {
    return { documentType: null, displayFileName: raw };
  }
  const maybeType = raw.slice(0, idx).trim();
  const rest = raw.slice(idx + DOCUMENT_TYPE_FILENAME_SEPARATOR.length).trim();
  return {
    documentType: maybeType || null,
    displayFileName: rest || raw,
  };
}

function resolveOfferFeeDollarsForContract(
  fundedAmount: number | null | undefined,
  feesRaw: unknown,
): string | null {
  const funded = Number(fundedAmount);
  const fees = Number(feesRaw);
  if (!Number.isFinite(funded) || funded <= 0) return null;
  if (!Number.isFinite(fees) || fees <= 0) return null;
  const looksLikeDollars = fees > 100 || fees > funded * 0.005;
  if (looksLikeDollars) {
    return String(Math.round(fees * 100) / 100);
  }
  if (fees > 0 && fees <= 100) {
    return String(Math.round(((funded * fees) / 100) * 100) / 100);
  }
  return null;
}

const OFFER_DECISION_CONTRACT_SELECT = {
  id: true,
  offer: true,
  totalRemit: true,
  term: true,
  frequency: true,
  repayPerPeriod: true,
  rate: true,
} as const;

/** Latest terms offer fields needed for contract UI (buy rate, % gross, factor, etc.). */
const TERMS_OFFER_CONTRACT_SELECT = {
  id: true,
  termsOfferId: true,
  approvedAmount: true,
  factorRate: true,
  paybackAmount: true,
  paymentAmount: true,
  percentOfGross: true,
  buyRate: true,
  commissionPercent: true,
  commissionAmount: true,
  termLength: true,
  frequency: true,
  position: true,
  numberOfPayments: true,
  createdAt: true,
  updatedAt: true,
} as const;

function mapTermsOfferNestedForApi(offer: Record<string, unknown> | null | undefined) {
  if (!offer || typeof offer !== 'object') return offer;
  const { id, ...rest } = offer;
  return { ...rest, _id: id, id };
}

function enrichContractRowForApi(row: Record<string, unknown> | null | undefined) {
  if (!row) return row;
  const mapped = mapContractRecordForApi(row) as Record<string, unknown>;
  const termsOffers = Array.isArray(row.termsOffers)
    ? row.termsOffers.map((t) => mapTermsOfferNestedForApi(t as Record<string, unknown>))
    : row.termsOffers;
  const app = row.application as Record<string, unknown> | undefined;
  const application =
    app && typeof app === 'object'
      ? {
          ...app,
          termsOffers: Array.isArray(app.termsOffers)
            ? app.termsOffers.map((t) =>
                mapTermsOfferNestedForApi(t as Record<string, unknown>),
              )
            : app.termsOffers,
        }
      : app;
  return { ...mapped, termsOffers, application };
}

function mapUploadedDocumentForResponse(row: Record<string, unknown>) {
  const parsed = decodeTypedFileName(row.fileName);
  const explicitType = normalizeUploadedDocumentType(firstNonEmptyString(row.documentType));
  return {
    ...row,
    fileName: parsed.displayFileName || String(row.fileName ?? ''),
    documentType: explicitType || parsed.documentType || 'Other',
  };
}

class ContractService {
  private async resolveBoldSignTemplateRowId(templateRef: string): Promise<string> {
    const ref = String(templateRef || '').trim();
    if (!ref) throw new Error('templateRef is required');
    const { isDocumentLayoutKey, ensurePlatformBoldSignTemplateRow } = await import(
      './docusign/platform-document-registry'
    );
    if (isDocumentLayoutKey(ref)) {
      return ensurePlatformBoldSignTemplateRow(ref);
    }
    const byLayoutKey = await (prisma as any).boldSignTemplate.findFirst({
      where: { layoutKey: ref },
      select: { id: true },
    });
    if (byLayoutKey?.id) return byLayoutKey.id;
    const byId = await (prisma as any).boldSignTemplate.findUnique({
      where: { id: ref },
      select: { id: true },
    });
    if (byId?.id) return byId.id;
    const byTemplateId = await (prisma as any).boldSignTemplate.findFirst({
      where: { templateId: ref },
      select: { id: true },
    });
    if (byTemplateId?.id) return byTemplateId.id;
    throw new Error('BoldSign template not found');
  }

  async createContractDocumentTemplateMapping(data: {
    contractId: number;
    templateRef: string;
    documentType: string;
    order?: number;
  }) {
    const templateId = await this.resolveBoldSignTemplateRowId(data.templateRef);
    const maxOrderRow = await (prisma as any).contractDocumentTemplateMapping.findFirst({
      where: { contractId: data.contractId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    const nextOrder = Number.isFinite(Number(data.order))
      ? Number(data.order)
      : Number(maxOrderRow?.order || 0) + 1;
    return (prisma as any).contractDocumentTemplateMapping.create({
      data: {
        contractId: data.contractId,
        templateId,
        documentType: String(data.documentType || '').trim() || 'other',
        order: nextOrder,
      },
      include: { template: true },
    });
  }

  async getAllContractDocumentTemplateMappings(contractId: number) {
    return (prisma as any).contractDocumentTemplateMapping.findMany({
      where: { contractId },
      include: { template: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Reorder every mapping of one documentType (addendum send-order board).
   * Reuses the rows' existing `order` slots so their position relative to other
   * document types (disclosure, ACH) is unchanged. Returns null when `mappingIds`
   * is not exactly the current set of rows (stale client).
   */
  async reorderContractDocumentTemplateMappings(data: {
    contractId: number;
    documentType: string;
    mappingIds: string[];
  }) {
    const contractId = Number(data.contractId);
    if (!Number.isFinite(contractId) || contractId <= 0) {
      throw new Error('Contract not found');
    }
    const documentType = String(data.documentType || '').trim() || 'addendum';
    const mappingIds = data.mappingIds.map((id) => String(id || '').trim()).filter(Boolean);

    const existing = (await (prisma as any).contractDocumentTemplateMapping.findMany({
      where: { contractId, documentType: { equals: documentType, mode: 'insensitive' } },
      select: { id: true, order: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    })) as Array<{ id: string; order: number }>;

    const existingIds = new Set(existing.map((row) => row.id));
    if (
      mappingIds.length !== existing.length ||
      new Set(mappingIds).size !== mappingIds.length ||
      mappingIds.some((id) => !existingIds.has(id))
    ) {
      return null;
    }

    // Strictly increasing slots so ties (legacy duplicate orders) cannot mask the new order.
    const slots = existing.map((row) => Number(row.order || 0));
    for (let i = 1; i < slots.length; i += 1) {
      if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
    }

    await (prisma as any).$transaction(
      mappingIds.map((id, index) =>
        (prisma as any).contractDocumentTemplateMapping.update({
          where: { id },
          data: { order: slots[index] },
        }),
      ),
    );

    return this.getAllContractDocumentTemplateMappings(contractId);
  }

  async updateContractDocumentTemplateMapping(
    id: string,
    data: { templateRef?: string; documentType?: string; order?: number },
  ) {
    const updateData: any = {};
    if (data.templateRef !== undefined) {
      updateData.templateId = await this.resolveBoldSignTemplateRowId(data.templateRef);
    }
    if (data.documentType !== undefined) {
      updateData.documentType = String(data.documentType || '').trim() || 'other';
    }
    if (data.order !== undefined) {
      updateData.order = Number(data.order);
    }
    return (prisma as any).contractDocumentTemplateMapping.update({
      where: { id },
      data: updateData,
      include: { template: true },
    });
  }

  async deleteContractDocumentTemplateMapping(id: string, contractId?: number) {
    // deleteMany is idempotent — concurrent cleanup can race and hit the same id twice.
    const where: { id: string; contractId?: number } = { id };
    if (contractId != null && Number.isFinite(contractId)) {
      where.contractId = contractId;
    }
    return (prisma as any).contractDocumentTemplateMapping.deleteMany({ where });
  }

  /**
   * Persist KYC extraction into contract prefill JSON, contract scalar columns, and ACH row.
   * Voided-check scans must update bank fields everywhere they are read (not only JSON overrides).
   */
  private async persistKycExtractionToContract(
    contractId: number,
    mapped: KycExtractionMapped,
  ): Promise<Record<string, unknown>> {
    const contractRow = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true, clientId: true, contractPrefillOverrides: true },
    });
    if (!contractRow) {
      throw new Error('Contract not found');
    }

    const mergedContractPrefillOverrides = mergeContractPrefillPatch(
      contractRow.contractPrefillOverrides,
      mapped.contractPrefill,
    );

    const scalarUpdate: ContractExtraFields = {};
    for (const key of CONTRACT_EXTRA_STRING_FIELDS) {
      const val = mapped.contractPrefill[key];
      if (firstNonEmptyString(val)) {
        scalarUpdate[key] = String(val).trim();
      }
    }

    await this.updateContract(contractId, {
      contractPrefillOverrides: mergedContractPrefillOverrides,
      ...scalarUpdate,
    });

    if (mapped.documentType === 'voidedCheck' && mapped.panels?.ach) {
      const ach = mapped.panels.ach;
      const achPayload = {
        bankName: firstNonEmptyString(ach.bankName) || undefined,
        accountHolderName: firstNonEmptyString(ach.fullNameOnAccount) || undefined,
        accountNumber: firstNonEmptyString(ach.accountNumber) || undefined,
        routingNumber: firstNonEmptyString(ach.routingNumber) || undefined,
        dba: firstNonEmptyString(ach.dba) || undefined,
        address: firstNonEmptyString(ach.address) || undefined,
        city: firstNonEmptyString(ach.city) || undefined,
        state: firstNonEmptyString(ach.state) || undefined,
        zip: firstNonEmptyString(ach.zip) || undefined,
      };
      const hasAchData = Object.values(achPayload).some((v) => Boolean(v));
      if (hasAchData) {
        const existing = await (prisma as any).aCH.findFirst({
          where: { contractId },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        });
        if (existing?.id) {
          await this.updateACH(existing.id, achPayload);
        } else if (contractRow.clientId) {
          await this.createACH({
            clientId: contractRow.clientId,
            contractId,
            ...achPayload,
          });
        }
      }
      try {
        await syncAchBankFieldsToApplication(contractId, {
          bankName: ach.bankName,
          accountNumber: ach.accountNumber,
          routingNumber: ach.routingNumber,
        });
      } catch (err) {
        console.error('syncAchBankFieldsToApplication after voided check failed:', err);
      }
    }

    if (mapped.documentType === 'driverLicense') {
      if (mapped.panels?.owner) {
        const owner = mapped.panels.owner;
        const ownerFirstName = firstNonEmptyString(owner.firstName);
        const ownerLastName = firstNonEmptyString(owner.lastName);
        if (ownerFirstName || ownerLastName) {
          const ownerPayload = {
            firstName: ownerFirstName || undefined,
            lastName: ownerLastName || undefined,
            address: firstNonEmptyString(owner.address) || undefined,
            city: firstNonEmptyString(owner.city) || undefined,
            state: firstNonEmptyString(owner.state) || undefined,
            zip: firstNonEmptyString(owner.zipCode) || undefined,
          };
          const existingOwner = await (prisma as any).contractOwner.findFirst({
            where: { contractId },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          });
          if (existingOwner?.id) {
            await this.updateContractOwner(existingOwner.id, ownerPayload);
          } else {
            await this.createContractOwner({
              contractId,
              firstName: ownerFirstName || '—',
              lastName: ownerLastName || '—',
              address: ownerPayload.address,
              city: ownerPayload.city,
              state: ownerPayload.state,
              zip: ownerPayload.zip,
            });
          }
        }
      }

      if (mapped.panels?.guarantor) {
        const guarantor = mapped.panels.guarantor;
        const guarantorFirstName = firstNonEmptyString(guarantor.firstName);
        const guarantorLastName = firstNonEmptyString(guarantor.lastName);
        if (guarantorFirstName || guarantorLastName) {
          const guarantorPayload = {
            firstName: guarantorFirstName || undefined,
            lastName: guarantorLastName || undefined,
            address: firstNonEmptyString(guarantor.address) || undefined,
            city: firstNonEmptyString(guarantor.city) || undefined,
            state: firstNonEmptyString(guarantor.state) || undefined,
            zip: firstNonEmptyString(guarantor.zipCode) || undefined,
            driverLicense: firstNonEmptyString(guarantor.driverLicenseNumber) || undefined,
          };
          const existingGuarantor = await (prisma as any).contractGuarantor.findFirst({
            where: { contractId },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          });
          if (existingGuarantor?.id) {
            await this.updateContractGuarantor(existingGuarantor.id, guarantorPayload);
          } else {
            await this.createContractGuarantor({
              contractId,
              firstName: guarantorFirstName || '—',
              lastName: guarantorLastName || '—',
              address: guarantorPayload.address,
              city: guarantorPayload.city,
              state: guarantorPayload.state,
              zip: guarantorPayload.zip,
              driverLicense: guarantorPayload.driverLicense,
            });
          }
        }
      }
    }

    return mergedContractPrefillOverrides;
  }

  async uploadContractDocuments(
    contractId: number,
    filesByType: Record<string, any>,
  ) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true, contractNumber: true },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    const normalizedEntries = Object.entries(filesByType).flatMap(([documentType, input]) => {
      const fileArray = Array.isArray(input) ? input : [input];
      return fileArray
        .filter(Boolean)
        .map((file) => ({ documentType, file }));
    });

    if (!normalizedEntries.length) {
      throw new Error('No files found to upload');
    }

    const folder = `ih-crm/contracts/${contract.contractNumber || contract.id}`;
    const savedDocuments: any[] = [];
    const kycExtractions: any[] = [];

    for (const { documentType, file } of normalizedEntries) {
      const normalizedType = normalizeUploadedDocumentType(documentType);
      const uploadResult = await uploadService.uploadFile(file, folder, file?.name);
      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error || `Failed to upload ${documentType}`);
      }

      const secureUrl = uploadResult.data.secure_url as string;
      const publicId = uploadResult.data.public_id as string;

      const metadata = await (prisma as any).fileMetadata.create({
        data: {
          fileName: encodeTypedFileName(
            normalizedType,
            file?.name || uploadResult.fileName || `${documentType}-${Date.now()}`,
          ),
          documentType: normalizedType,
          filePath: publicId,
          fileUrl: secureUrl,
          downloadUrl: secureUrl,
          contentType: file?.mimetype || 'application/octet-stream',
          size: Number(file?.size || uploadResult.data.bytes || 0),
          contractId,
        },
      });

      savedDocuments.push({
        documentType: normalizedType,
        metadata: mapUploadedDocumentForResponse(metadata as Record<string, unknown>),
      });

      if (isKycDocumentType(documentType)) {
        try {
          const kycType = normalizeKycDocumentType(documentType)!;
          const mapped = await contractKycDocumentExtractService.extractFromUploadedFile(
            file,
            kycType,
          );

          kycExtractions.push({
            documentType: kycType,
            keyData: mapped.keyData,
            contractPrefill: mapped.contractPrefill,
            panels: mapped.panels,
          });
        } catch (extractErr: unknown) {
          const msg =
            extractErr instanceof Error ? extractErr.message : 'KYC extraction failed';
          console.error(
            `[uploadContractDocuments] KYC extraction failed for ${documentType}:`,
            extractErr,
          );
          kycExtractions.push({
            documentType: normalizeKycDocumentType(documentType),
            error: msg,
          });
        }
      }
    }

    return { documents: savedDocuments, kycExtractions };
  }

  async extractKycDocumentForContract(
    contractId: number,
    file: any,
    documentTypeRaw: string,
  ) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) {
      throw new Error('Contract not found');
    }

    const documentType = normalizeKycDocumentType(documentTypeRaw);
    if (!documentType) {
      throw new Error('documentType must be driverLicense or voidedCheck');
    }

    const mapped = await contractKycDocumentExtractService.extractFromUploadedFile(
      file,
      documentType,
    );

    const mergedContractPrefillOverrides = await this.persistKycExtractionToContract(
      contractId,
      mapped,
    );

    const updated = await this.getByIdContract(contractId);

    return {
      documentType,
      keyData: mapped.keyData,
      contractPrefill: mapped.contractPrefill,
      panels: mapped.panels,
      mergedContractPrefillOverrides,
      contract: updated,
    };
  }

  /**
   * Apply reviewed KYC extraction (driver license / voided check) to contract prefill + related rows.
   */
  async syncKycPrefillToContract(
    contractId: number,
    payload: {
      documentType: KycDocumentType;
      contractPrefill?: Record<string, string>;
      panels?: KycExtractionMapped['panels'];
      keyData?: Record<string, string>;
    },
  ) {
    const documentType = payload.documentType;
    if (documentType !== 'driverLicense' && documentType !== 'voidedCheck') {
      throw new Error('documentType must be driverLicense or voidedCheck');
    }

    const mapped: KycExtractionMapped = {
      documentType,
      keyData: payload.keyData ?? {},
      contractPrefill: payload.contractPrefill ?? {},
      panels: payload.panels ?? {},
    };

    const mergedContractPrefillOverrides = await this.persistKycExtractionToContract(
      contractId,
      mapped,
    );

    const updated = await this.getByIdContract(contractId);

    return {
      documentType,
      keyData: mapped.keyData,
      contractPrefill: mapped.contractPrefill,
      panels: mapped.panels,
      mergedContractPrefillOverrides,
      contract: updated,
    };
  }

  async getUploadedContractDocuments(contractId: number) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    const rows = await (prisma as any).fileMetadata.findMany({
      where: { contractId },
      orderBy: { uploadedAt: 'desc' },
    });
    return Array.isArray(rows)
      ? rows.map((row: Record<string, unknown>) => mapUploadedDocumentForResponse(row))
      : [];
  }

  async getUploadedContractDocumentById(contractId: number, fileId: string) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    const row = await (prisma as any).fileMetadata.findFirst({
      where: { id: fileId, contractId },
    });
    if (!row) return null;
    return mapUploadedDocumentForResponse(row as Record<string, unknown>);
  }

  async updateUploadedContractDocument(
    contractId: number,
    fileId: string,
    payload: { fileName?: string; file?: any },
  ) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true, contractNumber: true },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    const existing = await (prisma as any).fileMetadata.findFirst({
      where: { id: fileId, contractId },
    });

    if (!existing) {
      throw new Error('Uploaded file not found');
    }

    const updateData: any = {};
    const existingType = normalizeUploadedDocumentType(
      firstNonEmptyString(
        (existing as Record<string, unknown>).documentType,
        decodeTypedFileName((existing as Record<string, unknown>).fileName).documentType,
      ),
    );

    if (payload.fileName) {
      updateData.fileName = encodeTypedFileName(existingType, payload.fileName);
      updateData.documentType = existingType;
    }

    if (payload.file) {
      const folder = `ih-crm/contracts/${contract.contractNumber || contract.id}`;
      const uploadResult = await uploadService.uploadFile(payload.file, folder, payload.file.name);
      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error || 'Failed to upload replacement file');
      }

      // Best effort cleanup of old asset if it exists in Cloudinary.
      if (existing.filePath) {
        await uploadService.deleteFile(existing.filePath, 'raw');
      }

      updateData.fileName = encodeTypedFileName(
        existingType,
        payload.file?.name || updateData.fileName || existing.fileName,
      );
      updateData.documentType = existingType;
      updateData.filePath = uploadResult.data.public_id;
      updateData.fileUrl = uploadResult.data.secure_url;
      updateData.downloadUrl = uploadResult.data.secure_url;
      updateData.contentType = payload.file?.mimetype || 'application/octet-stream';
      updateData.size = Number(payload.file?.size || uploadResult.data.bytes || 0);
    }

    if (!Object.keys(updateData).length) {
      return mapUploadedDocumentForResponse(existing as Record<string, unknown>);
    }

    const updated = await (prisma as any).fileMetadata.update({
      where: { id: fileId },
      data: updateData,
    });
    return mapUploadedDocumentForResponse(updated as Record<string, unknown>);
  }

  async deleteUploadedContractDocument(contractId: number, fileId: string) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    const existing = await (prisma as any).fileMetadata.findFirst({
      where: { id: fileId, contractId },
    });

    if (!existing) {
      throw new Error('Uploaded file not found');
    }

    if (existing.filePath) {
      await uploadService.deleteFile(existing.filePath, 'raw');
    }

    await (prisma as any).fileMetadata.delete({
      where: { id: fileId },
    });

    return { id: fileId };
  }



  async createContract(data: {
    clientId?: string;
    applicationId?: string;
    offerId?: string;
    startDate?: Date | string;
    endDate?: Date | string;
    contractLenght?: number;
    approvedAmount?: number;
    totalAmount?: number;
    status?:
    | 'DRAFT'
    | 'SENT'
    | 'VIEWED'
    | 'SIGNED'
    | 'COMPLETED'
    | 'DECLINED'
    | 'REVOKED'
    | 'EXPIRED';
    createdById?: string;
    agreementDate?: Date | string;
    paymentBankId?: string;
    state?: string | null;
    funderName?: string | null;
  } & ContractExtraFields) {
    const application = data.applicationId
      ? await (prisma as any).application.findUnique({
        where: { id: data.applicationId },
        include: {
          client: true,
          businessInfo: true,
          salesRepresentative: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
          referringAgent: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
          OfferDecision: true,
          termsOffers: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      })
      : null;

    const resolvedPaymentBank = await resolvePaymentBankDetailForContract(prisma as any, {
      applicationId: data.applicationId,
      paymentBankId: data.paymentBankId,
    });

    const derivedClientId = data.clientId ?? application?.clientId ?? null;
    // Prefer a User.id that actually exists — Super Admin proxy / deleted users break Contract_createdById_fkey.
    const createdByCandidates = [
      data.createdById,
      application?.createdById,
      application?.salesRepresentative?.id,
      application?.referringAgent?.id,
    ].filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    let derivedCreatedById: string | null = null;
    for (const candidateId of createdByCandidates) {
      const user = await (prisma as any).user.findUnique({
        where: { id: candidateId },
        select: { id: true },
      });
      if (user?.id) {
        derivedCreatedById = user.id;
        break;
      }
    }
    const derivedOfferId = data.offerId ?? application?.termsOffers?.[0]?.id ?? null;
    const derivedPaymentBankId = resolvedPaymentBank?.id ?? null;
    const derivedContractLength =
      data.contractLenght ??
      parseContractLengthDaysFromOfferTerm(application?.OfferDecision?.term ?? null);
    const derivedApprovedAmount =
      data.approvedAmount ?? (application?.OfferDecision?.offer != null ? Number(application.OfferDecision.offer) : null);
    const derivedTotalAmount =
      data.totalAmount ?? (application?.OfferDecision?.totalRemit != null ? Number(application.OfferDecision.totalRemit) : null);
    const derivedStartDate = data.startDate ? new Date(data.startDate) : new Date();
    const derivedAgreementDate = data.agreementDate ? new Date(data.agreementDate) : new Date();
    const derivedEndDate = data.endDate
      ? new Date(data.endDate)
      : (() => {
        const end = new Date(derivedStartDate);
        end.setDate(end.getDate() + Number(derivedContractLength || 0));
        return end;
      })();

    if (!derivedOfferId) throw new Error('offerId could not be derived from request/application termsOffers');
    if (!derivedCreatedById) throw new Error('createdById could not be derived');
    if (derivedContractLength == null) throw new Error('contractLenght could not be derived');
    if (derivedApprovedAmount == null) throw new Error('approvedAmount could not be derived');
    if (derivedTotalAmount == null) throw new Error('totalAmount could not be derived');
    const client = application?.client as any;
    const biz = application?.businessInfo as any;
    const offer = application?.OfferDecision as any;
    const paymentBank = resolvedPaymentBank as any;

    const customerName = firstNonEmptyString(
      `${String(client?.ownerFirstName ?? '').trim()} ${String(client?.ownerLastName ?? '').trim()}`,
    );
    const businessAddress = firstNonEmptyString(
      [client?.businessAddress1, client?.businessAddress2].filter(Boolean).join(', '),
      biz?.businessAddress,
    );
    const businessCity = firstNonEmptyString(client?.businessCity, biz?.city);
    const businessState = firstNonEmptyString(client?.businessState, biz?.state);
    const businessZip = firstNonEmptyString(client?.businessZipCode, biz?.zipCode, biz?.zip);
    const ownerHomeAddress = firstNonEmptyString(
      [client?.ownerAddress1, client?.ownerAddress2].filter(Boolean).join(', '),
    );
    const ownerHomeCity = firstNonEmptyString(client?.ownerCity);
    const ownerHomeState = firstNonEmptyString(client?.ownerState);
    const ownerHomeZip = firstNonEmptyString(client?.ownerZipCode);
    const purchaseAmount = derivedApprovedAmount != null ? String(derivedApprovedAmount) : '';
    const purchasePrice = derivedTotalAmount != null ? String(derivedTotalAmount) : '';
    const legalName = firstNonEmptyString(client?.businessName, biz?.clientBusinessName);
    const bankRouting = firstNonEmptyString(
      decryptSensitiveField(paymentBank?.routingNumber ?? undefined),
    );
    const bankAccount = firstNonEmptyString(
      decryptSensitiveField(paymentBank?.accountNumber ?? undefined),
    );
    const bankName = firstNonEmptyString(paymentBank?.bankName);
    const taxEin = firstNonEmptyString(client?.businessEinNumber, biz?.federalTaxIdEin);
    const dba = firstNonEmptyString(biz?.doingBusinessAs, biz?.dba);

    const derivedExtraFields: ContractExtraFields = {
      legalName: legalName || null,
      clientName: customerName || null,
      entityType: firstNonEmptyString(client?.businessEntityType, biz?.entityType) || null,
      remittance:
        firstNonEmptyString(
          offer?.repayPerPeriod != null ? String(offer.repayPerPeriod) : '',
          offer?.paymentAmount != null ? String(offer.paymentAmount) : '',
          biz?.remittance,
        ) || null,
      clientEmail: firstNonEmptyString(client?.businessEmail, client?.ownerEmail) || null,
      clientPhone: firstNonEmptyString(client?.businessNumber, client?.ownerMobileNumber) || null,
      customerName: customerName || null,
      purchasePrice: purchasePrice || null,
      purchaseAmount: purchaseAmount || null,
      purchasePercent: null,
      securityTaxEin: taxEin || null,
      businessAddress: businessAddress || null,
      businessAddressCity: businessCity || null,
      businessAddressState: businessState || null,
      businessAddressZip: businessZip || null,
      doingBusinessAs: dba || null,
      federalTaxIdEin: taxEin || null,
      exhibitOwnerName: customerName || null,
      appendixClientName: customerName || null,
      appendixUnderwritingFees:
        resolveOfferFeeDollarsForContract(
          derivedApprovedAmount ?? (offer?.offer != null ? Number(offer.offer) : null),
          offer?.fees,
        ) ||
        firstNonEmptyString(biz?.appendixUnderwritingFees) ||
        null,
      authorizationApplication: firstNonEmptyString(legalName, customerName) || null,
      authorizationClientDate: derivedAgreementDate.toISOString().slice(0, 10),
      authorizationClientName: legalName || null,
      authorizationClientNamePrint: customerName || legalName || null,
      authorizationClientTaxId: taxEin || null,
      authorizationClientBankName: bankName || null,
      authorizationClientBankAccount: bankAccount || null,
      authorizationClientBankRouting: bankRouting || null,
      authorizedBusinessPhone: firstNonEmptyString(client?.businessNumber, client?.ownerMobileNumber) || null,
      /** Contact / mailing address = Owner 1 home (not business location). */
      businessAddressContract: ownerHomeAddress || null,
      businessAddressContractCity: ownerHomeCity || null,
      businessAddressContractState: ownerHomeState || null,
      businessAddressContractZip: ownerHomeZip || null,
      securityBusinessName: legalName || null,
      securityDoingBusinessAs: dba || null,
      securityBusinessAddress: businessAddress || null,
      securityBusinessAddressCity: businessCity || null,
      securityBusinessAddressState: businessState || null,
      securityBusinessAddressZip: businessZip || null,
      securityGuarantor: customerName || null,
    };

    const contractInclude = {
      client: {
        select: {
          id: true,
          businessName: true,
          businessEmail: true,
          ownerFirstName: true,
          ownerLastName: true,
        },
      },
      application: {
        select: {
          id: true,
          applicationId: true,
          OfferDecision: { select: OFFER_DECISION_CONTRACT_SELECT },
        },
      },
      offer: { select: OFFER_DECISION_CONTRACT_SELECT },
      createdBy: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
      paymentTerms: { select: { id: true, paymentMethod: true, paymentFrequency: true } },
      paymentBank: { select: { id: true, bankName: true } },
    };

    /** Default interactive tx timeout is 5s — this flow runs multiple writes (contract + ACH + addendum + owner + application). */
    const createContractTransactionOptions = { maxWait: 10_000, timeout: 30_000 } as const;

    return (prisma as any).$transaction(async (tx: any) => {
      const contractData: Record<string, unknown> = {
        clientId: derivedClientId,
        applicationId: data.applicationId || null,
        offerId: derivedOfferId,
        startDate: derivedStartDate,
        endDate: derivedEndDate,
        contractLenght: Number(derivedContractLength),
        approvedAmount: Number(derivedApprovedAmount),
        totalAmount: Number(derivedTotalAmount),
        status: data.status || 'DRAFT',
        createdById: derivedCreatedById,
        agreementDate: derivedAgreementDate,
        paymentBankId: derivedPaymentBankId,
        state: data.state ?? (businessState || null),
        ...derivedExtraFields,
      };
      if (data.funderName !== undefined) {
        contractData.funderName =
          data.funderName === '' || data.funderName == null
            ? null
            : String(data.funderName).trim();
      }
      applyContractExtraFields(contractData, data);

      let created: any;
      // applicationId is unique on Contract. Repeated "create contract" clicks
      // should update the existing row instead of throwing P2002.
      if (data.applicationId) {
        const existing = await tx.contract.findUnique({
          where: { applicationId: data.applicationId },
          select: { id: true, status: true },
        });

        if (existing?.id) {
          // Preserve lifecycle status set by BoldSign webhooks (SENT/VIEWED/SIGNED/COMPLETED/etc.)
          // when a repeated create is triggered for the same applicationId. Only allow status to
          // remain at the explicit DRAFT default; never downgrade an advanced status back to DRAFT.
          const existingStatus = String(existing.status ?? '').toUpperCase();
          const incomingStatusRaw = (contractData as { status?: string }).status;
          const incomingStatus = String(incomingStatusRaw ?? '').toUpperCase();
          const lifecycleAdvanced =
            existingStatus && existingStatus !== 'DRAFT';
          const updateData: Record<string, unknown> = { ...contractData };
          if (lifecycleAdvanced && (!incomingStatus || incomingStatus === 'DRAFT')) {
            delete updateData.status;
          }
          created = await tx.contract.update({
            where: { id: existing.id },
            data: updateData,
            include: contractInclude,
          });
        } else {
          created = await tx.contract.create({
            data: contractData,
            include: contractInclude,
          });
        }
      } else {
        created = await tx.contract.create({
          data: contractData,
          include: contractInclude,
        });
      }

      const businessInfoId = normalizeBusinessInfoIdForFk(application?.businessInfo?.id);

      const existingAch = await tx.aCH.findFirst({
        where: { contractId: created.id },
        select: { id: true },
      });
      if (!existingAch) {
        await tx.aCH.create({
          data: {
            clientId: created.clientId,
            contractId: created.id,
            businessInfoId,
            bankName: bankName || null,
            accountHolderName: legalName || null,
            accountNumber: bankAccount || null,
            routingNumber: bankRouting || null,
            paymentAmount: purchaseAmount || null,
            frequency:
              sanitizePaymentFrequencyForPersist(offer?.frequency) || null,
            dba: dba || null,
            phone: firstNonEmptyString(client?.businessNumber, client?.ownerMobileNumber) || null,
            address: businessAddress || null,
            city: businessCity || null,
            state: businessState || null,
            zip: businessZip || null,
            bankBranchCity: null,
            bankState: null,
            bankZip: null,
          },
        });
      }

      const existingAddendum = await tx.addendum.findFirst({
        where: { contractId: created.id },
        select: { id: true },
      });
      if (!existingAddendum) {
        await tx.addendum.create({
          data: {
            clientId: created.clientId,
            contractId: created.id,
            businessInfoId,
            legalName1: legalName || null,
            dba1: dba || null,
            typeOfEntity1: firstNonEmptyString(client?.businessEntityType, biz?.entityType) || null,
            ein1: taxEin || null,
            mailingAddress1: businessAddress || null,
            legalName2: null,
            dba2: null,
            typeOfEntity2: null,
            ein2: null,
            mailingAddress2: null,
            legalName3: null,
            dba3: null,
            typeOfEntity3: null,
            ein3: null,
            mailingAddress3: null,
            addendumDated: derivedAgreementDate.toISOString().slice(0, 10),
            principalOwner: customerName || null,
            principalBusiness: legalName || null,
            businessLocation: businessAddress || null,
            principalState: businessState || null,
            principalOwnerAmount1: purchaseAmount || null,
            principalOwnerAmount2: purchasePrice || null,
            principalOwner1Name: customerName || null,
            principalOwner1Date: derivedAgreementDate.toISOString().slice(0, 10),
            principalOwner2Name: null,
            principalOwner2Date: null,
          },
        });
      }

      const existingOwner = await tx.contractOwner.findFirst({
        where: { contractId: created.id },
        select: { id: true },
      });
      if (!existingOwner && firstNonEmptyString(client?.ownerFirstName, client?.ownerLastName)) {
        await tx.contractOwner.create({
          data: {
            contractId: created.id,
            firstName: firstNonEmptyString(client?.ownerFirstName),
            lastName: firstNonEmptyString(client?.ownerLastName),
            email: firstNonEmptyString(client?.ownerEmail, client?.businessEmail) || null,
            phone: firstNonEmptyString(client?.ownerMobileNumber, client?.businessNumber) || null,
            address: firstNonEmptyString(client?.ownerAddress1, client?.ownerAddress2) || null,
            state: firstNonEmptyString(client?.ownerState) || null,
            city: firstNonEmptyString(client?.ownerCity) || null,
            zip: firstNonEmptyString(client?.ownerZipCode) || null,
            ownershipPercentage:
              client?.ownerOwnershipPercentage != null ? Number(client.ownerOwnershipPercentage) : null,
          },
        });
      }

      if (data.applicationId) {
        await syncApplicationToContractGenerated(tx, data.applicationId, {
          source: 'contractService.createContract',
          contractId: created.id,
          contractStatusNew: 'DRAFT',
        });
      }

      return mapContractRecordForApi(created);
    }, createContractTransactionOptions);
  }

  async getAllContracts(filters: {
    clientId?: string;
    applicationId?: string;
    status?:
    | 'DRAFT'
    | 'SENT'
    | 'VIEWED'
    | 'SIGNED'
    | 'COMPLETED'
    | 'DECLINED'
    | 'REVOKED'
    | 'EXPIRED';
  }) {
    const where: any = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.applicationId) where.applicationId = filters.applicationId;
    if (filters.status) where.status = filters.status;

    const rows = await (prisma as any).contract.findMany({
      where,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
        application: {
          select: {
            id: true,
            applicationId: true,
            OfferDecision: true,
          },
        },
        offer: { select: OFFER_DECISION_CONTRACT_SELECT },
        paymentTerms: { select: { id: true, paymentMethod: true, paymentFrequency: true } },
        paymentBank: { select: { id: true, bankName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: Record<string, unknown>) => mapContractRecordForApi(row));
  }

  async getByIdContract(id: number) {
    const row = await (prisma as any).contract.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
        application: {
          select: {
            id: true,
            applicationId: true,
            salesRepresentative: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
            referringAgent: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
            document: {
              select: {
                id: true,
                envelopeId: true,
                status: true,
                sentAt: true,
                completedAt: true,
                updatedAt: true,
              },
            },
            termsOffers: {
              orderBy: { createdAt: 'desc' as const },
              take: 1,
              select: TERMS_OFFER_CONTRACT_SELECT,
            },
          },
        },
        offer: { select: OFFER_DECISION_CONTRACT_SELECT },
        termsOffers: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          select: TERMS_OFFER_CONTRACT_SELECT,
        },
        paymentTerms: { select: { id: true, paymentMethod: true, paymentFrequency: true } },
        paymentBank: { select: { id: true, bankName: true } },
      },
    });
    return row ? enrichContractRowForApi(row) : row;
  }

  async getByApplicationIdContract(applicationId: string) {
    const applicationUuid = await resolveContractApplicationUuid(applicationId);
    if (!applicationUuid) return null;

    const row = await (prisma as any).contract.findUnique({
      where: { applicationId: applicationUuid },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
        application: {
          select: {
            id: true,
            applicationId: true,
            salesRepresentative: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
            referringAgent: { select: { id: true, userId: true, firstName: true, lastName: true, email: true } },
            document: {
              select: {
                id: true,
                envelopeId: true,
                status: true,
                sentAt: true,
                completedAt: true,
                updatedAt: true,
              },
            },
            termsOffers: {
              orderBy: { createdAt: 'desc' as const },
              take: 1,
              select: TERMS_OFFER_CONTRACT_SELECT,
            },
          },
        },
        offer: { select: OFFER_DECISION_CONTRACT_SELECT },
        termsOffers: {
          orderBy: { createdAt: 'desc' as const },
          take: 1,
          select: TERMS_OFFER_CONTRACT_SELECT,
        },
        paymentTerms: { select: { id: true, paymentMethod: true, paymentFrequency: true } },
        paymentBank: { select: { id: true, bankName: true } },
      },
    });
    return row ? enrichContractRowForApi(row) : row;
  }

  async updateContract(
    id: number,
    data: {
      clientId?: string;
      applicationId?: string;
      offerId?: string;
      startDate?: Date | string;
      endDate?: Date | string;
      contractLenght?: number;
      approvedAmount?: number;
      totalAmount?: number;
      status?:
      | 'DRAFT'
      | 'SENT'
      | 'VIEWED'
      | 'SIGNED'
      | 'COMPLETED'
      | 'DECLINED'
      | 'REVOKED'
      | 'EXPIRED';
      createdById?: string;
      agreementDate?: Date | string;
      paymentBankId?: string;
      state?: string | null;
      funderName?: string | null;
      contractPrefillOverrides?: unknown;
      reverseDisbursementEnabled?: boolean;
      reverseDisbursementSchedule?: unknown;
    } & ContractExtraFields,
  ) {
    const updateData: any = {};
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.applicationId !== undefined) updateData.applicationId = data.applicationId;
    if (data.offerId !== undefined) updateData.offerId = data.offerId;
    if (data.startDate !== undefined) updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.contractLenght !== undefined) updateData.contractLenght = data.contractLenght;
    if (data.approvedAmount !== undefined) updateData.approvedAmount = data.approvedAmount;
    if (data.totalAmount !== undefined) updateData.totalAmount = data.totalAmount;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.createdById !== undefined) updateData.createdById = data.createdById;
    if (data.agreementDate !== undefined) updateData.agreementDate = new Date(data.agreementDate);
    if (data.paymentBankId !== undefined) updateData.paymentBankId = data.paymentBankId;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.funderName !== undefined) updateData.funderName = data.funderName;
    if (data.contractPrefillOverrides !== undefined) {
      // FE prefill saves often rebuild the JSON blob and omit DocuSign history keys.
      // Preserve sent/voided history + ACH/package capsules so they do not disappear.
      const existing = await prisma.contract.findUnique({
        where: { id },
        select: { contractPrefillOverrides: true },
      });
      const merged = mergePreservingDocuSignEnvelopeMeta(
        existing?.contractPrefillOverrides,
        data.contractPrefillOverrides,
      );
      updateData.contractPrefillOverrides =
        merged === null
          ? Prisma.DbNull
          : (decryptEncryptedStringsInJson(merged) as Prisma.InputJsonValue);
    }
    if (data.reverseDisbursementEnabled !== undefined) {
      updateData.reverseDisbursementEnabled = data.reverseDisbursementEnabled === true;
    }
    if (data.reverseDisbursementSchedule !== undefined) {
      updateData.reverseDisbursementSchedule =
        data.reverseDisbursementSchedule === null
          ? Prisma.DbNull
          : (data.reverseDisbursementSchedule as Prisma.InputJsonValue);
    }
    applyContractExtraFields(updateData, data);

    if (Object.keys(updateData).length === 0) {
      throw new Error('No contract fields provided for update');
    }

    const row = await prisma.contract.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true } },
        application: { select: { id: true, applicationId: true } },
        offer: { select: { id: true } },
        paymentTerms: { select: { id: true, paymentMethod: true, paymentFrequency: true } },
        paymentBank: { select: { id: true, bankName: true } },
      },
    });

    const applicationId = String((row as { applicationId?: string | null }).applicationId ?? '').trim();
    const plainBank = extractPlainBankFromContractUpdate(data as Record<string, unknown>);
    let rowToReturn = row;

    // Contract / ACH prefill saves → Client (+ list dealDisplayName) so Overview matches.
    if (data.contractPrefillOverrides !== undefined) {
      try {
        await syncContractPrefillIdentityToClient(id);
      } catch (err) {
        console.error('syncContractPrefillIdentityToClient failed:', err);
      }
    }

    if (plainBank && applicationId) {
      const paymentBank = (row as { paymentBank?: { id?: string } | null }).paymentBank;
      try {
        await syncContractPrefillToBankDetail(applicationId, plainBank, {
          bankDetailId: paymentBank?.id,
        });
        const refreshed = await prisma.contract.findUnique({
          where: { id },
          include: {
            client: { select: { id: true, businessName: true, businessEmail: true } },
            application: { select: { id: true, applicationId: true } },
            offer: { select: { id: true } },
            paymentTerms: { select: { id: true, paymentMethod: true, paymentFrequency: true } },
            paymentBank: { select: { id: true, bankName: true } },
          },
        });
        if (refreshed) rowToReturn = refreshed;
      } catch (err) {
        console.error('syncContractPrefillToBankDetail failed:', err);
      }
    }

    return mapContractRecordForApi(rowToReturn as Record<string, unknown>);
  }

  async deleteContract(id: number) {
    return (prisma as any).contract.delete({ where: { id } });
  }

  async createACH(data: {
    clientId: string;
    contractId?: number;
    businessInfoId?: number;
    bankName?: string;
    accountHolderName?: string;
    accountNumber?: string;
    routingNumber?: string;
    ach_authorization_bank_portal_website?: string;
    ach_authorization_username?: string;
    ach_authorization_password?: string;
    ach_authorization_security_question1?: string;
    ach_authorization_security_answer1?: string;
    ach_authorization_security_question2?: string;
    ach_authorization_security_answer2?: string;
    ach_authorization_security_question3?: string;
    ach_authorization_security_answer3?: string;
    ach_authorization_other_infomation?: string;
    ach_authorization_reference_name1?: string;
    ach_authorization_reference_number_1?: string;
    ach_authorization_reference_relationship1?: string;
    ach_authorization_reference_name2?: string;
    ach_authorization_reference_number2?: string;
    ach_authorization_reference_relationship2?: string;
    ach_authorization_reference_name3?: string;
    ach_authorization_reference_number3?: string;
    ach_authorization_reference_relationship3?: string;
    paymentAmount?: string;
    frequency?: string;
    dba?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    bankBranchCity?: string;
    bankState?: string;
    bankZip?: string;
  }) {
    const row = await (prisma as any).aCH.create({
      data: {
        clientId: data.clientId,
        contractId: data.contractId ?? null,
        businessInfoId: normalizeBusinessInfoIdForFk(data.businessInfoId),
        bankName: data.bankName || null,
        accountHolderName: data.accountHolderName || null,
        accountNumber:
          decryptSensitiveField(data.accountNumber ?? undefined) ?? data.accountNumber ?? null,
        routingNumber:
          decryptSensitiveField(data.routingNumber ?? undefined) ?? data.routingNumber ?? null,
        ach_authorization_bank_portal_website:
          data.ach_authorization_bank_portal_website || null,
        ach_authorization_username: data.ach_authorization_username || null,
        ach_authorization_password: data.ach_authorization_password || null,
        ach_authorization_security_question1:
          data.ach_authorization_security_question1 || null,
        ach_authorization_security_answer1:
          data.ach_authorization_security_answer1 || null,
        ach_authorization_security_question2:
          data.ach_authorization_security_question2 || null,
        ach_authorization_security_answer2:
          data.ach_authorization_security_answer2 || null,
        ach_authorization_security_question3:
          data.ach_authorization_security_question3 || null,
        ach_authorization_security_answer3:
          data.ach_authorization_security_answer3 || null,
        ach_authorization_other_infomation:
          data.ach_authorization_other_infomation || null,
        ach_authorization_reference_name1:
          data.ach_authorization_reference_name1 || null,
        ach_authorization_reference_number_1:
          data.ach_authorization_reference_number_1 || null,
        ach_authorization_reference_relationship1:
          data.ach_authorization_reference_relationship1 || null,
        ach_authorization_reference_name2:
          data.ach_authorization_reference_name2 || null,
        ach_authorization_reference_number2:
          data.ach_authorization_reference_number2 || null,
        ach_authorization_reference_relationship2:
          data.ach_authorization_reference_relationship2 || null,
        ach_authorization_reference_name3:
          data.ach_authorization_reference_name3 || null,
        ach_authorization_reference_number3:
          data.ach_authorization_reference_number3 || null,
        ach_authorization_reference_relationship3:
          data.ach_authorization_reference_relationship3 || null,
        paymentAmount: data.paymentAmount || null,
        frequency: sanitizePaymentFrequencyForPersist(data.frequency),
        dba: data.dba || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip: data.zip || null,
        bankBranchCity: data.bankBranchCity || null,
        bankState: data.bankState || null,
        bankZip: data.bankZip || null,
      },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
    await syncAchRowBankQuiet(row);
    return mapAchRecordForApi(row);
  }

  async getAllACH(filters: { clientId?: string; contractId?: number }) {
    const where: any = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.contractId) where.contractId = filters.contractId;

    const rows = await (prisma as any).aCH.findMany({
      where,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row: Record<string, unknown>) => mapAchRecordForApi(row));
  }

  async getByIdACH(id: number) {
    const row = await (prisma as any).aCH.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
    return row ? mapAchRecordForApi(row) : row;
  }

  async updateACH(
    id: number,
    data: {
      bankName?: string;
      accountHolderName?: string;
      accountNumber?: string;
      routingNumber?: string;
      ach_authorization_bank_portal_website?: string;
      ach_authorization_username?: string;
      ach_authorization_password?: string;
      ach_authorization_security_question1?: string;
      ach_authorization_security_answer1?: string;
      ach_authorization_security_question2?: string;
      ach_authorization_security_answer2?: string;
      ach_authorization_security_question3?: string;
      ach_authorization_security_answer3?: string;
      ach_authorization_other_infomation?: string;
      ach_authorization_reference_name1?: string;
      ach_authorization_reference_number_1?: string;
      ach_authorization_reference_relationship1?: string;
      ach_authorization_reference_name2?: string;
      ach_authorization_reference_number2?: string;
      ach_authorization_reference_relationship2?: string;
      ach_authorization_reference_name3?: string;
      ach_authorization_reference_number3?: string;
      ach_authorization_reference_relationship3?: string;
      paymentAmount?: string;
      frequency?: string;
      clientId?: string;
      contractId?: number;
      businessInfoId?: number;
      dba?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      bankBranchCity?: string;
      bankState?: string;
      bankZip?: string;
    },
  ) {
    const updateData: any = {};
    if (data.bankName !== undefined) updateData.bankName = data.bankName;
    if (data.accountHolderName !== undefined) updateData.accountHolderName = data.accountHolderName;
    if (data.accountNumber !== undefined) {
      updateData.accountNumber =
        decryptSensitiveField(data.accountNumber) ?? data.accountNumber;
    }
    if (data.routingNumber !== undefined) {
      updateData.routingNumber =
        decryptSensitiveField(data.routingNumber) ?? data.routingNumber;
    }
    if (data.ach_authorization_bank_portal_website !== undefined) updateData.ach_authorization_bank_portal_website = data.ach_authorization_bank_portal_website;
    if (data.ach_authorization_username !== undefined) updateData.ach_authorization_username = data.ach_authorization_username;
    if (data.ach_authorization_password !== undefined) updateData.ach_authorization_password = data.ach_authorization_password;
    if (data.ach_authorization_security_question1 !== undefined) updateData.ach_authorization_security_question1 = data.ach_authorization_security_question1;
    if (data.ach_authorization_security_answer1 !== undefined) updateData.ach_authorization_security_answer1 = data.ach_authorization_security_answer1;
    if (data.ach_authorization_security_question2 !== undefined) updateData.ach_authorization_security_question2 = data.ach_authorization_security_question2;
    if (data.ach_authorization_security_answer2 !== undefined) updateData.ach_authorization_security_answer2 = data.ach_authorization_security_answer2;
    if (data.ach_authorization_security_question3 !== undefined) updateData.ach_authorization_security_question3 = data.ach_authorization_security_question3;
    if (data.ach_authorization_security_answer3 !== undefined) updateData.ach_authorization_security_answer3 = data.ach_authorization_security_answer3;
    if (data.ach_authorization_other_infomation !== undefined) updateData.ach_authorization_other_infomation = data.ach_authorization_other_infomation;
    if (data.ach_authorization_reference_name1 !== undefined) updateData.ach_authorization_reference_name1 = data.ach_authorization_reference_name1;
    if (data.ach_authorization_reference_number_1 !== undefined) updateData.ach_authorization_reference_number_1 = data.ach_authorization_reference_number_1;
    if (data.ach_authorization_reference_relationship1 !== undefined) updateData.ach_authorization_reference_relationship1 = data.ach_authorization_reference_relationship1;
    if (data.ach_authorization_reference_name2 !== undefined) updateData.ach_authorization_reference_name2 = data.ach_authorization_reference_name2;
    if (data.ach_authorization_reference_number2 !== undefined) updateData.ach_authorization_reference_number2 = data.ach_authorization_reference_number2;
    if (data.ach_authorization_reference_relationship2 !== undefined) updateData.ach_authorization_reference_relationship2 = data.ach_authorization_reference_relationship2;
    if (data.ach_authorization_reference_name3 !== undefined) updateData.ach_authorization_reference_name3 = data.ach_authorization_reference_name3;
    if (data.ach_authorization_reference_number3 !== undefined) updateData.ach_authorization_reference_number3 = data.ach_authorization_reference_number3;
    if (data.ach_authorization_reference_relationship3 !== undefined) updateData.ach_authorization_reference_relationship3 = data.ach_authorization_reference_relationship3;
    if (data.paymentAmount !== undefined) updateData.paymentAmount = data.paymentAmount;
    if (data.frequency !== undefined) {
      // Skip junk % values; do not clobber a good stored cadence with "0.00%".
      const sanitized = sanitizePaymentFrequencyForPersist(data.frequency);
      if (sanitized != null) updateData.frequency = sanitized;
    }
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.contractId !== undefined) updateData.contractId = data.contractId;
    if (data.businessInfoId !== undefined) {
      updateData.businessInfoId = normalizeBusinessInfoIdForFk(data.businessInfoId);
    }
    if (data.dba !== undefined) updateData.dba = data.dba;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.zip !== undefined) updateData.zip = data.zip;
    if (data.bankBranchCity !== undefined) updateData.bankBranchCity = data.bankBranchCity;
    if (data.bankState !== undefined) updateData.bankState = data.bankState;
    if (data.bankZip !== undefined) updateData.bankZip = data.bankZip;

    const row = await (prisma as any).aCH.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
    await syncAchRowBankQuiet(row);
    return mapAchRecordForApi(row);
  }

  async deleteACH(id: number) {
    return (prisma as any).aCH.delete({ where: { id } });
  }

  async createEPO(data: {
    clientId: string;
    contractId?: number;
    amountReceived1?: string;
    receivedDate1?: string;
    amountReceived2?: string;
    receivedDate2?: string;
    amountReceived3?: string;
    receivedDate3?: string;
  }) {
    return (prisma as any).ePO.create({
      data: {
        clientId: data.clientId,
        contractId: data.contractId ?? null,
        amountReceived1: data.amountReceived1 || null,
        receivedDate1: data.receivedDate1 || null,
        amountReceived2: data.amountReceived2 || null,
        receivedDate2: data.receivedDate2 || null,
        amountReceived3: data.amountReceived3 || null,
        receivedDate3: data.receivedDate3 || null,
      },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
  }

  async getAllEPO(filters: { clientId?: string; contractId?: number }) {
    const where: any = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.contractId) where.contractId = filters.contractId;

    return (prisma as any).ePO.findMany({
      where,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdEPO(id: number) {
    return (prisma as any).ePO.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
  }

  async updateEPO(
    id: number,
    data: {
      amountReceived1?: string;
      receivedDate1?: string;
      amountReceived2?: string;
      receivedDate2?: string;
      amountReceived3?: string;
      receivedDate3?: string;
      clientId?: string;
      contractId?: number;
    },
  ) {
    const updateData: any = {};
    if (data.amountReceived1 !== undefined) updateData.amountReceived1 = data.amountReceived1;
    if (data.receivedDate1 !== undefined) updateData.receivedDate1 = data.receivedDate1;
    if (data.amountReceived2 !== undefined) updateData.amountReceived2 = data.amountReceived2;
    if (data.receivedDate2 !== undefined) updateData.receivedDate2 = data.receivedDate2;
    if (data.amountReceived3 !== undefined) updateData.amountReceived3 = data.amountReceived3;
    if (data.receivedDate3 !== undefined) updateData.receivedDate3 = data.receivedDate3;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.contractId !== undefined) updateData.contractId = data.contractId;

    return (prisma as any).ePO.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
  }

  async deleteEPO(id: number) {
    return (prisma as any).ePO.delete({ where: { id } });
  }

  async createAddendum(data: {
    clientId: string;
    contractId?: number;
    businessInfoId?: number;
    legalName1?: string;
    dba1?: string;
    typeOfEntity1?: string;
    ein1?: string;
    mailingAddress1?: string;
    legalName2?: string;
    dba2?: string;
    typeOfEntity2?: string;
    ein2?: string;
    mailingAddress2?: string;
    legalName3?: string;
    dba3?: string;
    typeOfEntity3?: string;
    ein3?: string;
    mailingAddress3?: string;
    addendumDated?: string;
    principalOwner?: string;
    principalBusiness?: string;
    businessLocation?: string;
    principalState?: string;
    principalOwnerAmount1?: string;
    principalOwnerAmount2?: string;
    principalOwner1Name?: string;
    principalOwner1Date?: string;
    principalOwner2Name?: string;
    principalOwner2Date?: string;
  }) {
    return (prisma as any).addendum.create({
      data: {
        clientId: data.clientId,
        contractId: data.contractId ?? null,
        businessInfoId: normalizeBusinessInfoIdForFk(data.businessInfoId),
        legalName1: data.legalName1 || null,
        dba1: data.dba1 || null,
        typeOfEntity1: data.typeOfEntity1 || null,
        ein1: data.ein1 || null,
        mailingAddress1: data.mailingAddress1 || null,
        legalName2: data.legalName2 || null,
        dba2: data.dba2 || null,
        typeOfEntity2: data.typeOfEntity2 || null,
        ein2: data.ein2 || null,
        mailingAddress2: data.mailingAddress2 || null,
        legalName3: data.legalName3 || null,
        dba3: data.dba3 || null,
        typeOfEntity3: data.typeOfEntity3 || null,
        ein3: data.ein3 || null,
        mailingAddress3: data.mailingAddress3 || null,
        addendumDated: data.addendumDated || null,
        principalOwner: data.principalOwner || null,
        principalBusiness: data.principalBusiness || null,
        businessLocation: data.businessLocation || null,
        principalState: data.principalState || null,
        principalOwnerAmount1: data.principalOwnerAmount1 || null,
        principalOwnerAmount2: data.principalOwnerAmount2 || null,
        principalOwner1Name: data.principalOwner1Name || null,
        principalOwner1Date: data.principalOwner1Date || null,
        principalOwner2Name: data.principalOwner2Name || null,
        principalOwner2Date: data.principalOwner2Date || null,
      },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
  }

  async getAllAddendum(filters: { clientId?: string; contractId?: number }) {
    const where: any = {};
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.contractId) where.contractId = filters.contractId;

    return (prisma as any).addendum.findMany({
      where,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdAddendum(id: number) {
    return (prisma as any).addendum.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
  }

  async updateAddendum(
    id: number,
    data: {
      legalName1?: string;
      dba1?: string;
      typeOfEntity1?: string;
      ein1?: string;
      mailingAddress1?: string;
      legalName2?: string;
      dba2?: string;
      typeOfEntity2?: string;
      ein2?: string;
      mailingAddress2?: string;
      legalName3?: string;
      dba3?: string;
      typeOfEntity3?: string;
      ein3?: string;
      mailingAddress3?: string;
      clientId?: string;
      contractId?: number;
      businessInfoId?: number;
      addendumDated?: string;
      principalOwner?: string;
      principalBusiness?: string;
      businessLocation?: string;
      principalState?: string;
      principalOwnerAmount1?: string;
      principalOwnerAmount2?: string;
      principalOwner1Name?: string;
      principalOwner1Date?: string;
      principalOwner2Name?: string;
      principalOwner2Date?: string;
    },
  ) {
    const updateData: any = {};
    if (data.legalName1 !== undefined) updateData.legalName1 = data.legalName1;
    if (data.dba1 !== undefined) updateData.dba1 = data.dba1;
    if (data.typeOfEntity1 !== undefined) updateData.typeOfEntity1 = data.typeOfEntity1;
    if (data.ein1 !== undefined) updateData.ein1 = data.ein1;
    if (data.mailingAddress1 !== undefined) updateData.mailingAddress1 = data.mailingAddress1;
    if (data.legalName2 !== undefined) updateData.legalName2 = data.legalName2;
    if (data.dba2 !== undefined) updateData.dba2 = data.dba2;
    if (data.typeOfEntity2 !== undefined) updateData.typeOfEntity2 = data.typeOfEntity2;
    if (data.ein2 !== undefined) updateData.ein2 = data.ein2;
    if (data.mailingAddress2 !== undefined) updateData.mailingAddress2 = data.mailingAddress2;
    if (data.legalName3 !== undefined) updateData.legalName3 = data.legalName3;
    if (data.dba3 !== undefined) updateData.dba3 = data.dba3;
    if (data.typeOfEntity3 !== undefined) updateData.typeOfEntity3 = data.typeOfEntity3;
    if (data.ein3 !== undefined) updateData.ein3 = data.ein3;
    if (data.mailingAddress3 !== undefined) updateData.mailingAddress3 = data.mailingAddress3;
    if (data.clientId !== undefined) updateData.clientId = data.clientId;
    if (data.contractId !== undefined) updateData.contractId = data.contractId;
    if (data.businessInfoId !== undefined) {
      updateData.businessInfoId = normalizeBusinessInfoIdForFk(data.businessInfoId);
    }
    if (data.addendumDated !== undefined) updateData.addendumDated = data.addendumDated;
    if (data.principalOwner !== undefined) updateData.principalOwner = data.principalOwner;
    if (data.principalBusiness !== undefined) updateData.principalBusiness = data.principalBusiness;
    if (data.businessLocation !== undefined) updateData.businessLocation = data.businessLocation;
    if (data.principalState !== undefined) updateData.principalState = data.principalState;
    if (data.principalOwnerAmount1 !== undefined) updateData.principalOwnerAmount1 = data.principalOwnerAmount1;
    if (data.principalOwnerAmount2 !== undefined) updateData.principalOwnerAmount2 = data.principalOwnerAmount2;
    if (data.principalOwner1Name !== undefined) updateData.principalOwner1Name = data.principalOwner1Name;
    if (data.principalOwner1Date !== undefined) updateData.principalOwner1Date = data.principalOwner1Date;
    if (data.principalOwner2Name !== undefined) updateData.principalOwner2Name = data.principalOwner2Name;
    if (data.principalOwner2Date !== undefined) updateData.principalOwner2Date = data.principalOwner2Date;

    return (prisma as any).addendum.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, businessName: true, businessEmail: true, ownerFirstName: true, ownerLastName: true } },
      },
    });
  }

  async deleteAddendum(id: number) {
    return (prisma as any).addendum.delete({ where: { id } });
  }

  async createContractOwner(data: {
    contractId: number;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    address?: string;
    state?: string;
    city?: string;
    zip?: string;
    ownershipPercentage?: number;
  }) {
    return (prisma as any).contractOwner.create({
      data: {
        contractId: data.contractId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        state: data.state || null,
        city: data.city || null,
        zip: data.zip || null,
        ownershipPercentage:
          data.ownershipPercentage !== undefined ? data.ownershipPercentage : null,
      },
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
    });
  }

  async getAllContractOwners(filters: { contractId?: number }) {
    const where: any = {};
    if (filters.contractId) where.contractId = filters.contractId;

    return (prisma as any).contractOwner.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdContractOwner(id: number) {
    return (prisma as any).contractOwner.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
    });
  }

  async updateContractOwner(
    id: number,
    data: {
      contractId?: number;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      address?: string;
      state?: string;
      city?: string;
      zip?: string;
      ownershipPercentage?: number;
    },
  ) {
    const updateData: any = {};
    if (data.contractId !== undefined) updateData.contractId = data.contractId;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.zip !== undefined) updateData.zip = data.zip;
    if (data.ownershipPercentage !== undefined) {
      updateData.ownershipPercentage = data.ownershipPercentage;
    }

    return (prisma as any).contractOwner.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
    });
  }

  async deleteContractOwner(id: number) {
    return (prisma as any).contractOwner.delete({ where: { id } });
  }

  async createContractGuarantor(data: {
    contractId: number;
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    address?: string;
    state?: string;
    city?: string;
    zip?: string;
    ssn?: string;
    driverLicense?: string;
    entityType?: string;
  }) {
    return (prisma as any).contractGuarantor.create({
      data: {
        contractId: data.contractId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        state: data.state || null,
        city: data.city || null,
        zip: data.zip || null,
        ssn: data.ssn || null,
        driverLicense: data.driverLicense || null,
        entityType: data.entityType || null,
      },
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
    });
  }

  async getAllContractGuarantors(filters: { contractId?: number }) {
    const where: any = {};
    if (filters.contractId) where.contractId = filters.contractId;

    return (prisma as any).contractGuarantor.findMany({
      where,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdContractGuarantor(id: number) {
    return (prisma as any).contractGuarantor.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
    });
  }

  async updateContractGuarantor(
    id: number,
    data: {
      contractId?: number;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
      address?: string;
      state?: string;
      city?: string;
      zip?: string;
      ssn?: string;
      driverLicense?: string;
      entityType?: string;
    },
  ) {
    const updateData: any = {};
    if (data.contractId !== undefined) updateData.contractId = data.contractId;
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.address !== undefined) updateData.address = data.address;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.city !== undefined) updateData.city = data.city;
    if (data.zip !== undefined) updateData.zip = data.zip;
    if (data.ssn !== undefined) updateData.ssn = data.ssn;
    if (data.driverLicense !== undefined) updateData.driverLicense = data.driverLicense;
    if (data.entityType !== undefined) updateData.entityType = data.entityType;

    return (prisma as any).contractGuarantor.update({
      where: { id },
      data: updateData,
      include: {
        contract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            clientId: true,
          },
        },
      },
    });
  }

  async deleteContractGuarantor(id: number) {
    return (prisma as any).contractGuarantor.delete({ where: { id } });
  }

  async getContractRelatedDataByContractId(contractId: number) {
    const contract = await (prisma as any).contract.findUnique({
      where: { id: contractId },
      include: {
        achs: true,
        epos: true,
        addendums: true,
        owners: true,
        guarantors: true,
        documents: true,
      },
    });

    if (!contract) {
      throw new Error('Contract not found');
    }

    return mapContractRecordForApi(contract);
  }

  async createBoldSignTemplate(data: {
    name: string;
    type: string;
    templateId?: string;
    state?: string;
    frequency?: string;
    pdfUrl?: string;
    pdfPublicId?: string;
    originalFileName?: string;
    layoutKey?: string;
  }) {
    const { resolveLayoutKeyFromBoldSignType } = await import(
      './docusign/layouts/document-layout.registry'
    );
    const layoutKey =
      data.layoutKey ||
      resolveLayoutKeyFromBoldSignType(String(data.type || '')) ||
      null;
    return (prisma as any).boldSignTemplate.create({
      data: {
        name: data.name,
        type: data.type,
        state: data.state || null,
        frequency: data.frequency || null,
        templateId: data.templateId || null,
        pdfUrl: data.pdfUrl || null,
        pdfPublicId: data.pdfPublicId || null,
        originalFileName: data.originalFileName || null,
        layoutKey,
      },
    });
  }

  async getAllBoldSignTemplates(filters: {
    type?: string;
    state?: string;
    frequency?: string;
  }) {
    const where: any = {};
    if (filters.type) where.type = String(filters.type).trim();
    if (filters.state) where.state = String(filters.state).trim().toLowerCase();
    if (filters.frequency) where.frequency = String(filters.frequency).trim().toLowerCase();

    return (prisma as any).boldSignTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByIdBoldSignTemplate(id: string) {
    return (prisma as any).boldSignTemplate.findUnique({
      where: { id },
    });
  }

  async updateBoldSignTemplate(
    id: string,
    data: {
      name?: string;
      type?: string;
      templateId?: string;
      state?: string | null;
      frequency?: string | null;
    },
  ) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.templateId !== undefined) updateData.templateId = data.templateId;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.frequency !== undefined) updateData.frequency = data.frequency;

    return (prisma as any).boldSignTemplate.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteBoldSignTemplate(id: string) {
    return (prisma as any).boldSignTemplate.delete({
      where: { id },
    });
  }

  async previewReverseDisbursementSchedulePdf(
    contractId: number,
    scheduleOverride?: unknown,
  ): Promise<Buffer> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { funderName: true },
    });
    const funderName = contract?.funderName ?? null;

    let schedule = normalizeReverseDisbursementScheduleData(scheduleOverride);
    if (!schedule) {
      const config = await loadContractReverseDisbursementConfig(contractId);
      schedule = config.schedule;
    }
    if (!schedule?.rows?.length) {
      throw new Error(
        'No disbursement schedule rows found. Paste the table and save before previewing.',
      );
    }
    return renderReverseDisbursementSchedulePdf(schedule, funderName);
  }

}

const contractService = new ContractService();
export default contractService;
