import { Prisma } from '@prisma/client';
import prisma from '../../../config/prismaClient';

/**
 * Map of envelopeId → CRM-triggered DocuSign notification resends.
 * Stored on `Contract.contractPrefillOverrides`.
 */
export const DOCUSIGN_ENVELOPE_RESENDS_KEY = 'docusignEnvelopeResends';

export type EnvelopeResendMetaEntry = {
  lastResentAt: string;
  resentCount: number;
  /** All CRM resend timestamps (oldest → newest). */
  resentAtHistory: string[];
};

export type EnvelopeResendMetaMap = Record<string, EnvelopeResendMetaEntry>;

function normalizeResentAtHistory(
  rawHistory: unknown,
  lastResentAt: string,
  resentCount: number,
): string[] {
  const fromArray = Array.isArray(rawHistory)
    ? rawHistory
        .map((v) => String(v ?? '').trim())
        .filter(Boolean)
    : [];
  if (fromArray.length) return fromArray;
  // Legacy rows only stored lastResentAt / resentCount.
  if (!lastResentAt) return [];
  if (resentCount <= 1) return [lastResentAt];
  return Array.from({ length: resentCount }, () => lastResentAt);
}

export function parseEnvelopeResendMetaFromPrefill(raw: unknown): EnvelopeResendMetaMap {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const blob = (raw as Record<string, unknown>)[DOCUSIGN_ENVELOPE_RESENDS_KEY];
  if (blob == null || typeof blob !== 'object' || Array.isArray(blob)) return {};
  const out: EnvelopeResendMetaMap = {};
  for (const [envelopeId, value] of Object.entries(blob as Record<string, unknown>)) {
    const eid = String(envelopeId ?? '').trim();
    if (!eid || value == null || typeof value !== 'object' || Array.isArray(value)) continue;
    const o = value as Record<string, unknown>;
    const lastResentAt = String(o.lastResentAt ?? '').trim();
    if (!lastResentAt) continue;
    const count = Number(o.resentCount);
    const resentCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
    const resentAtHistory = normalizeResentAtHistory(
      o.resentAtHistory,
      lastResentAt,
      resentCount,
    );
    out[eid] = {
      lastResentAt: resentAtHistory[resentAtHistory.length - 1] || lastResentAt,
      resentCount: Math.max(resentCount, resentAtHistory.length),
      resentAtHistory,
    };
  }
  return out;
}

export function mergeEnvelopeResendIntoPrefill(
  baseRaw: unknown,
  envelopeId: string,
  atIso?: string,
): Record<string, unknown> {
  const base =
    baseRaw && typeof baseRaw === 'object' && !Array.isArray(baseRaw)
      ? { ...(baseRaw as Record<string, unknown>) }
      : {};
  const eid = String(envelopeId || '').trim();
  if (!eid) return base;

  const prior = parseEnvelopeResendMetaFromPrefill(base);
  const now = atIso || new Date().toISOString();
  const prevEntry = prior[eid];
  const resentAtHistory = [...(prevEntry?.resentAtHistory ?? []), now];
  prior[eid] = {
    lastResentAt: now,
    resentCount: resentAtHistory.length,
    resentAtHistory,
  };
  return {
    ...base,
    [DOCUSIGN_ENVELOPE_RESENDS_KEY]: prior,
  };
}

async function loadContractsForResendMeta(hints: {
  applicationId?: string;
  contractId?: number;
  envelopeId: string;
}): Promise<Array<{ id: number; contractPrefillOverrides: unknown }>> {
  const contractId =
    hints.contractId != null && Number.isFinite(hints.contractId) && hints.contractId > 0
      ? hints.contractId
      : null;
  if (contractId) {
    const row = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, contractPrefillOverrides: true },
    });
    return row ? [row] : [];
  }

  const appId = String(hints.applicationId ?? '').trim();
  if (appId) {
    return prisma.contract.findMany({
      where: { applicationId: appId },
      select: { id: true, contractPrefillOverrides: true },
      orderBy: { id: 'desc' },
      take: 5,
    });
  }

  const eid = String(hints.envelopeId || '').trim();
  if (!eid) return [];

  const byDocument = await prisma.document.findFirst({
    where: { envelopeId: eid },
    select: { applicationId: true },
  });
  const docAppId = byDocument?.applicationId ? String(byDocument.applicationId).trim() : '';
  if (docAppId) {
    return prisma.contract.findMany({
      where: { applicationId: docAppId },
      select: { id: true, contractPrefillOverrides: true },
      orderBy: { id: 'desc' },
      take: 5,
    });
  }

  return [];
}

/**
 * Persist lastResentAt / resentCount / resentAtHistory for an envelope.
 */
export async function recordEnvelopeResendMeta(
  envelopeId: string,
  hints?: { applicationId?: string | null; contractId?: number | null },
): Promise<EnvelopeResendMetaEntry | null> {
  const eid = String(envelopeId || '').trim();
  if (!eid) return null;

  const now = new Date().toISOString();
  const contracts = await loadContractsForResendMeta({
    envelopeId: eid,
    applicationId: hints?.applicationId ?? undefined,
    contractId: hints?.contractId ?? undefined,
  });
  if (!contracts.length) return null;

  let result: EnvelopeResendMetaEntry | null = null;
  for (const contract of contracts) {
    const merged = mergeEnvelopeResendIntoPrefill(
      contract.contractPrefillOverrides,
      eid,
      now,
    );
    const entry = parseEnvelopeResendMetaFromPrefill(merged)[eid];
    await prisma.contract.update({
      where: { id: contract.id },
      data: { contractPrefillOverrides: merged as Prisma.InputJsonValue },
    });
    if (entry) result = entry;
  }
  return result;
}
