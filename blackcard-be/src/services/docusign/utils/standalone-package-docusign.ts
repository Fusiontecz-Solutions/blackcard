import type { Prisma } from '@prisma/client';
import prisma from '../../../config/prismaClient';
import { mergeWithExistingEnvelopeStatus } from './docusign-webhook';

/** Standalone contract-package sends (addendum / disclosure without main contract PDF). */
export const STANDALONE_PACKAGE_DOCUSIGN_KEY = 'standalonePackageDocuSign';

export const STANDALONE_PACKAGE_SEND_HISTORY_KEY = 'standalonePackageSendHistory';

export type StandalonePackageDocuSignCapsuleStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'SIGNED'
  | 'VOIDED';

export type StandalonePackageDocuSignMeta = {
  envelopeId: string;
  status: StandalonePackageDocuSignCapsuleStatus;
  sentAt?: string | null;
  updatedAt?: string | null;
  package?: {
    includeMainContract?: boolean;
    includeAddendum?: boolean;
    includeDisclosure?: boolean;
  };
};

export type StandalonePackageSendHistoryEntry = {
  envelopeId: string;
  status: StandalonePackageDocuSignCapsuleStatus;
  sentAt?: string | null;
  archivedAt: string;
  package?: StandalonePackageDocuSignMeta['package'];
};

function packageCapsuleToInternal(status: StandalonePackageDocuSignCapsuleStatus): string {
  switch (status) {
    case 'SIGNED':
      return 'completed';
    case 'VIEWED':
      return 'viewed';
    case 'SENT':
      return 'sent';
    case 'VOIDED':
      return 'revoked';
    default:
      return 'draft';
  }
}

export function mapInternalEnvelopeStatusToPackageCapsule(
  internalStatus: unknown,
): StandalonePackageDocuSignCapsuleStatus {
  const k = String(internalStatus ?? '')
    .trim()
    .toLowerCase();
  if (k === 'voided' || k === 'revoked' || k === 'declined' || k === 'expired') {
    return 'VOIDED';
  }
  if (k === 'completed' || k === 'signed') return 'SIGNED';
  if (k === 'viewed' || k === 'delivered') return 'VIEWED';
  if (k === 'sent' || k === 'processing') return 'SENT';
  return 'DRAFT';
}

const PACKAGE_CAPSULE_STATUS_RANK: Record<StandalonePackageDocuSignCapsuleStatus, number> = {
  DRAFT: 0,
  SENT: 1,
  VIEWED: 2,
  SIGNED: 3,
  VOIDED: 4,
};

function mergeStandalonePackageCapsuleStatus(
  prior: StandalonePackageDocuSignCapsuleStatus,
  patch?: StandalonePackageDocuSignCapsuleStatus,
): StandalonePackageDocuSignCapsuleStatus {
  if (!patch) return prior;
  if (patch === 'VOIDED' || prior === 'VOIDED') return 'VOIDED';
  return PACKAGE_CAPSULE_STATUS_RANK[patch] >= PACKAGE_CAPSULE_STATUS_RANK[prior]
    ? patch
    : prior;
}

function contractPrefillReferencesPackageEnvelope(
  prefill: unknown,
  envelopeId: string,
): boolean {
  const eid = String(envelopeId || '').trim();
  if (!eid) return false;
  const current = parseStandalonePackageDocuSignFromPrefill(prefill);
  if (current?.envelopeId === eid) return true;
  return parseStandalonePackageSendHistoryFromPrefill(prefill).some(
    (row) => row.envelopeId === eid,
  );
}

function updateStandalonePackageSendHistoryEntryStatus(
  baseRaw: unknown,
  envelopeId: string,
  status: StandalonePackageDocuSignCapsuleStatus,
): Record<string, unknown> {
  const base =
    baseRaw && typeof baseRaw === 'object' && !Array.isArray(baseRaw)
      ? { ...(baseRaw as Record<string, unknown>) }
      : {};
  const prior = parseStandalonePackageSendHistoryFromPrefill(base);
  const eid = String(envelopeId || '').trim();
  if (!eid || !prior.length) return base;
  if (!prior.some((row) => row.envelopeId === eid)) return base;
  const nextHistory = prior.map((row) => {
    if (row.envelopeId !== eid) return row;
    return {
      ...row,
      status: mergeStandalonePackageCapsuleStatus(row.status, status),
    };
  });
  return {
    ...base,
    [STANDALONE_PACKAGE_SEND_HISTORY_KEY]: nextHistory,
  };
}

export function parseStandalonePackageDocuSignFromPrefill(
  raw: unknown,
): StandalonePackageDocuSignMeta | null {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const blob = (raw as Record<string, unknown>)[STANDALONE_PACKAGE_DOCUSIGN_KEY];
  if (blob == null || typeof blob !== 'object' || Array.isArray(blob)) return null;
  const o = blob as Record<string, unknown>;
  const envelopeId = String(o.envelopeId ?? '').trim();
  if (!envelopeId) return null;
  const statusRaw = String(o.status ?? 'DRAFT').trim().toUpperCase();
  const status: StandalonePackageDocuSignCapsuleStatus =
    statusRaw === 'SENT' ||
    statusRaw === 'VIEWED' ||
    statusRaw === 'SIGNED' ||
    statusRaw === 'VOIDED'
      ? statusRaw
      : 'DRAFT';
  const pkgRaw = o.package;
  const packageMeta =
    pkgRaw != null && typeof pkgRaw === 'object' && !Array.isArray(pkgRaw)
      ? {
          includeMainContract: Boolean((pkgRaw as Record<string, unknown>).includeMainContract),
          includeAddendum: Boolean((pkgRaw as Record<string, unknown>).includeAddendum),
          includeDisclosure: Boolean((pkgRaw as Record<string, unknown>).includeDisclosure),
        }
      : undefined;
  return {
    envelopeId,
    status,
    sentAt: o.sentAt != null ? String(o.sentAt) : null,
    updatedAt: o.updatedAt != null ? String(o.updatedAt) : null,
    package: packageMeta,
  };
}

export function mergeStandalonePackageDocuSignIntoPrefill(
  baseRaw: unknown,
  patch: Partial<StandalonePackageDocuSignMeta> & { envelopeId: string },
): Record<string, unknown> {
  const base =
    baseRaw && typeof baseRaw === 'object' && !Array.isArray(baseRaw)
      ? { ...(baseRaw as Record<string, unknown>) }
      : {};
  const prior = parseStandalonePackageDocuSignFromPrefill(base) ?? {
    envelopeId: patch.envelopeId,
    status: 'DRAFT' as const,
  };
  const status = mergeStandalonePackageCapsuleStatus(prior.status, patch.status);
  const now = new Date().toISOString();
  const meta: StandalonePackageDocuSignMeta = {
    envelopeId: String(patch.envelopeId || prior.envelopeId).trim(),
    status,
    sentAt:
      patch.sentAt !== undefined
        ? patch.sentAt
        : status === 'VOIDED'
          ? null
          : status === 'SENT' || status === 'VIEWED' || status === 'SIGNED'
            ? (prior.sentAt ?? now)
            : (prior.sentAt ?? null),
    updatedAt: patch.updatedAt ?? now,
    package: patch.package ?? prior.package,
  };
  return {
    ...base,
    [STANDALONE_PACKAGE_DOCUSIGN_KEY]: meta,
  };
}

export function appendStandalonePackageSendHistoryEntry(
  baseRaw: unknown,
  entry: Omit<StandalonePackageSendHistoryEntry, 'archivedAt'> & { archivedAt?: string },
): Record<string, unknown> {
  const base =
    baseRaw && typeof baseRaw === 'object' && !Array.isArray(baseRaw)
      ? { ...(baseRaw as Record<string, unknown>) }
      : {};
  const prior = parseStandalonePackageSendHistoryFromPrefill(base);
  const envelopeId = String(entry.envelopeId ?? '').trim();
  if (!envelopeId) return base;
  if (prior.some((row) => row.envelopeId === envelopeId)) return base;
  const next: StandalonePackageSendHistoryEntry = {
    envelopeId,
    status: entry.status,
    sentAt: entry.sentAt ?? null,
    archivedAt: entry.archivedAt ?? new Date().toISOString(),
    package: entry.package,
  };
  return {
    ...base,
    [STANDALONE_PACKAGE_SEND_HISTORY_KEY]: [...prior, next],
  };
}

export function parseStandalonePackageSendHistoryFromPrefill(
  raw: unknown,
): StandalonePackageSendHistoryEntry[] {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const list = (raw as Record<string, unknown>)[STANDALONE_PACKAGE_SEND_HISTORY_KEY];
  if (!Array.isArray(list)) return [];
  const out: StandalonePackageSendHistoryEntry[] = [];
  for (const item of list) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const envelopeId = String(o.envelopeId ?? '').trim();
    if (!envelopeId) continue;
    const statusRaw = String(o.status ?? 'DRAFT').trim().toUpperCase();
    const status: StandalonePackageDocuSignCapsuleStatus =
      statusRaw === 'SENT' ||
      statusRaw === 'VIEWED' ||
      statusRaw === 'SIGNED' ||
      statusRaw === 'VOIDED'
        ? statusRaw
        : 'DRAFT';
    out.push({
      envelopeId,
      status,
      sentAt: o.sentAt != null ? String(o.sentAt) : null,
      archivedAt: String(o.archivedAt ?? new Date(0).toISOString()),
      package:
        o.package != null && typeof o.package === 'object' && !Array.isArray(o.package)
          ? {
              includeMainContract: Boolean(
                (o.package as Record<string, unknown>).includeMainContract,
              ),
              includeAddendum: Boolean((o.package as Record<string, unknown>).includeAddendum),
              includeDisclosure: Boolean(
                (o.package as Record<string, unknown>).includeDisclosure,
              ),
            }
          : undefined,
    });
  }
  return out;
}

type PackageContractPrefillRow = {
  id: number;
  applicationId: string | null;
  contractPrefillOverrides: unknown;
};

async function loadContractsForPackageLink(
  applicationId: string,
  contractId?: number,
): Promise<PackageContractPrefillRow[]> {
  const numericContractId = Number(contractId);
  if (Number.isFinite(numericContractId) && numericContractId > 0) {
    const byId = await prisma.contract.findUnique({
      where: { id: numericContractId },
      select: { id: true, applicationId: true, contractPrefillOverrides: true },
    });
    if (byId) return [byId];
  }
  const appId = String(applicationId || '').trim();
  if (!appId) return [];
  return prisma.contract.findMany({
    where: { applicationId: appId },
    select: { id: true, applicationId: true, contractPrefillOverrides: true },
    orderBy: { id: 'desc' },
    take: 1,
  });
}

export async function linkStandalonePackageEnvelopeToContract(
  applicationId: string,
  envelopeId: string,
  internalStatus = 'draft',
  contractId?: number,
  packageMeta?: StandalonePackageDocuSignMeta['package'],
): Promise<boolean> {
  const eid = String(envelopeId || '').trim();
  if (!eid) return false;

  const appId = String(applicationId || '').trim();
  if (appId) {
    const mainDoc = await prisma.document.findUnique({
      where: { applicationId: appId },
      select: { envelopeId: true },
    });
    const mainEnvelopeId = String(mainDoc?.envelopeId ?? '').trim();
    if (mainEnvelopeId && mainEnvelopeId === eid) {
      console.warn('[Package DocuSign] refusing to link main contract envelope as standalone package', {
        applicationId: appId,
        envelopeId: eid,
      });
      return false;
    }
  }

  const contracts = await loadContractsForPackageLink(applicationId, contractId);
  if (!contracts.length) {
    console.warn('[Package DocuSign] no contract row to link standalone package envelope', {
      applicationId,
      contractId,
      envelopeId: eid,
    });
    return false;
  }

  const capsule = mapInternalEnvelopeStatusToPackageCapsule(internalStatus);
  const now = new Date().toISOString();

  for (const contract of contracts) {
    const prior = parseStandalonePackageDocuSignFromPrefill(contract.contractPrefillOverrides);
    let prefillBase = contract.contractPrefillOverrides;
    if (prior?.envelopeId && prior.envelopeId !== eid) {
      prefillBase = appendStandalonePackageSendHistoryEntry(prefillBase, {
        envelopeId: prior.envelopeId,
        status: prior.status,
        sentAt: prior.sentAt ?? null,
        archivedAt: now,
        package: prior.package,
      });
    }
    const merged = mergeStandalonePackageDocuSignIntoPrefill(prefillBase, {
      envelopeId: eid,
      status: capsule,
      sentAt:
        capsule === 'SENT' || capsule === 'VIEWED' || capsule === 'SIGNED' ? now : null,
      updatedAt: now,
      package: packageMeta,
    });
    await prisma.contract.update({
      where: { id: contract.id },
      data: { contractPrefillOverrides: merged as Prisma.InputJsonValue },
    });
  }
  return true;
}

async function findContractsForPackageEnvelopeUpdate(
  envelopeId: string,
  hints?: { applicationId?: string; contractId?: number },
): Promise<PackageContractPrefillRow[]> {
  const eid = String(envelopeId || '').trim();
  let contracts: PackageContractPrefillRow[] = await prisma.contract.findMany({
    where: {
      contractPrefillOverrides: {
        path: [STANDALONE_PACKAGE_DOCUSIGN_KEY, 'envelopeId'],
        equals: eid,
      },
    },
    select: { id: true, applicationId: true, contractPrefillOverrides: true },
  });
  if (!contracts.length && hints && (hints.applicationId || hints.contractId)) {
    const candidates = await loadContractsForPackageLink(
      hints.applicationId ?? '',
      hints.contractId,
    );
    contracts = candidates.filter((row) =>
      contractPrefillReferencesPackageEnvelope(row.contractPrefillOverrides, eid),
    );
  }
  return contracts;
}

export async function contractRowHasStandalonePackageEnvelope(
  envelopeId: string,
  hints?: { applicationId?: string; contractId?: number },
): Promise<boolean> {
  const eid = String(envelopeId || '').trim();
  if (!eid) return false;
  const count = await prisma.contract.count({
    where: {
      contractPrefillOverrides: {
        path: [STANDALONE_PACKAGE_DOCUSIGN_KEY, 'envelopeId'],
        equals: eid,
      },
    },
  });
  if (count > 0) return true;
  if (!hints?.applicationId && !hints?.contractId) return false;
  const rows = await loadContractsForPackageLink(hints?.applicationId ?? '', hints?.contractId);
  return rows.some(
    (row) =>
      parseStandalonePackageDocuSignFromPrefill(row.contractPrefillOverrides)?.envelopeId === eid,
  );
}

export async function isStandalonePackageEnvelope(
  envelopeId: string,
  hints?: { applicationId?: string; contractId?: number },
): Promise<boolean> {
  const eid = String(envelopeId || '').trim();
  if (!eid) return false;
  if (!(await contractRowHasStandalonePackageEnvelope(eid, hints))) return false;

  const appIdHint = String(hints?.applicationId ?? '').trim();
  if (appIdHint) {
    const mainDoc = await prisma.document.findUnique({
      where: { applicationId: appIdHint },
      select: { envelopeId: true },
    });
    return String(mainDoc?.envelopeId ?? '').trim() !== eid;
  }

  const contracts = await findContractsForPackageEnvelopeUpdate(eid, hints);
  for (const contract of contracts) {
    const appId = String(contract.applicationId ?? '').trim();
    if (!appId) continue;
    const mainDoc = await prisma.document.findUnique({
      where: { applicationId: appId },
      select: { envelopeId: true },
    });
    if (String(mainDoc?.envelopeId ?? '').trim() === eid) return false;
  }
  return true;
}

export async function updateStandalonePackageDocuSignStatus(
  envelopeId: string,
  internalStatus: string,
  hints?: { applicationId?: string; contractId?: number },
): Promise<boolean> {
  const eid = String(envelopeId || '').trim();
  if (!eid) return false;

  const incomingCapsule = mapInternalEnvelopeStatusToPackageCapsule(internalStatus);
  const now = new Date().toISOString();
  const contracts = await findContractsForPackageEnvelopeUpdate(eid, hints);
  if (!contracts.length) return false;

  for (const contract of contracts) {
    const prior = parseStandalonePackageDocuSignFromPrefill(contract.contractPrefillOverrides);
    const priorInternal = prior ? packageCapsuleToInternal(prior.status) : null;
    const mergedInternal = mergeWithExistingEnvelopeStatus(priorInternal, internalStatus);
    const status = mergedInternal
      ? mapInternalEnvelopeStatusToPackageCapsule(mergedInternal)
      : incomingCapsule;

    let mergedPrefill = contract.contractPrefillOverrides;
    if (prior?.envelopeId === eid) {
      mergedPrefill = mergeStandalonePackageDocuSignIntoPrefill(mergedPrefill, {
        envelopeId: eid,
        status,
        updatedAt: now,
      });
    } else {
      mergedPrefill = updateStandalonePackageSendHistoryEntryStatus(mergedPrefill, eid, status);
    }

    await prisma.contract.update({
      where: { id: contract.id },
      data: { contractPrefillOverrides: mergedPrefill as Prisma.InputJsonValue },
    });
  }
  return true;
}

/** True when supplemental-only send is ACH (not contract-package addendum/disclosure). */
export function isAchStandaloneLayoutRef(ref: string): boolean {
  const key = String(ref || '')
    .trim()
    .toLowerCase();
  if (!key) return false;
  return (
    key === 'ach_authorization' ||
    key === 'ach_authorization_standalone' ||
    key === 'ach_authorization_texas' ||
    key.includes('ach_authorization') ||
    key.includes('ach_form') ||
    (/(^|_)ach(_|$)/.test(key) && !key.includes('addendum') && !key.includes('disclosure'))
  );
}

export function resolveStandaloneLinkKind(
  supplementalRefs: string[],
  includeMainContract?: boolean,
): 'main' | 'ach' | 'package' {
  const refs = (supplementalRefs || [])
    .map((r) => String(r || '').trim())
    .filter(Boolean);

  // Explicit main-contract include always wins.
  if (includeMainContract === true) return 'main';

  // ACH-only refs → ACH capsule (standalone ACH often omits includeMainContract:false).
  if (refs.length > 0 && refs.every(isAchStandaloneLayoutRef)) {
    return 'ach';
  }

  if (includeMainContract === false) return 'package';

  // No supplemental / standalone refs → main contract envelope.
  if (refs.length === 0) return 'main';

  return 'package';
}
