import prisma from '../../../config/prismaClient';
import {
  isPersistedFunderProfileId,
  listFunderProfiles,
} from '../../funderProfileService';
import {
  ACH_AUTHORIZATION_DOCUSIGN_KEY,
  findAchEnvelopeAuthHints,
} from './ach-authorization-docusign';
import { STANDALONE_PACKAGE_DOCUSIGN_KEY } from './standalone-package-docusign';

export type EnvelopeFunderAuthHints = {
  funderName?: string | null;
  funderProfileId?: string | null;
  contractState?: string | null;
  applicationId?: string | null;
  contractId?: number | null;
};

export type EnvelopeFunderAuthCandidate = {
  funderName?: string | null;
  funderProfileId?: string | null;
  contractState?: string | null;
  /** Platform JWT from env (DOCUSIGN_IMPERSONATED_USER_ID) — try last. */
  usePlatformDefault?: boolean;
  /** DocuSignAccountProfile.id — used to dedupe JWT attempts. */
  docusignAccountProfileId?: string | null;
};

const LAST_ACH_SENT_FUNDER_KEY = 'lastAchSentFunder';
const DOCUMENT_SEND_HISTORY_KEY = 'documentSendHistory';

function parseFunderFromPrefillBlob(
  prefill: unknown,
  envelopeId: string,
): EnvelopeFunderAuthCandidate | null {
  if (prefill == null || typeof prefill !== 'object' || Array.isArray(prefill)) return null;
  const raw = prefill as Record<string, unknown>;
  const eid = String(envelopeId || '').trim();
  if (!eid) return null;

  for (const historyKey of [
    DOCUMENT_SEND_HISTORY_KEY,
    'contractSendHistory',
    'standalonePackageSendHistory',
    'achSendHistory',
  ]) {
    const history = raw[historyKey];
    if (!Array.isArray(history)) continue;
    for (const row of history) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      if (String(r.envelopeId ?? '').trim() !== eid) continue;
      const funderName = String(r.funderName ?? '').trim();
      const funderProfileId = String(r.funderProfileId ?? '').trim();
      if (funderName || funderProfileId) {
        return {
          ...(funderName ? { funderName } : {}),
          ...(funderProfileId ? { funderProfileId } : {}),
        };
      }
    }
  }

  for (const capsuleKey of [
    'mainContractSendPackage',
    LAST_ACH_SENT_FUNDER_KEY,
    ACH_AUTHORIZATION_DOCUSIGN_KEY,
    STANDALONE_PACKAGE_DOCUSIGN_KEY,
  ]) {
    const blob = raw[capsuleKey];
    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) continue;
    const o = blob as Record<string, unknown>;
    const blobEid = String(o.envelopeId ?? '').trim();
    // lastAchSentFunder may omit envelopeId; only trust exact match otherwise.
    if (capsuleKey === LAST_ACH_SENT_FUNDER_KEY) {
      if (blobEid && blobEid !== eid) continue;
    } else if (blobEid !== eid) {
      continue;
    }
    const funderName = String(o.funderName ?? '').trim();
    const funderProfileId = String(o.funderProfileId ?? '').trim();
    if (funderName || funderProfileId) {
      return {
        ...(funderName ? { funderName } : {}),
        ...(funderProfileId ? { funderProfileId } : {}),
      };
    }
  }

  return null;
}

function pushCandidate(
  list: EnvelopeFunderAuthCandidate[],
  seenKeys: Set<string>,
  seenDsProfiles: Set<string>,
  candidate: EnvelopeFunderAuthCandidate | null | undefined,
): void {
  if (!candidate) return;
  if (candidate.usePlatformDefault) {
    if (seenKeys.has('platform-default')) return;
    seenKeys.add('platform-default');
    list.push({ usePlatformDefault: true });
    return;
  }

  const funderName = String(candidate.funderName ?? '').trim();
  const funderProfileId = String(candidate.funderProfileId ?? '').trim();
  const dsProfileId = String(candidate.docusignAccountProfileId ?? '').trim();
  if (!funderName && !funderProfileId && !dsProfileId) return;

  // Skip duplicate DocuSign JWT accounts (many funders may share one profile).
  if (dsProfileId) {
    if (seenDsProfiles.has(dsProfileId)) return;
    seenDsProfiles.add(dsProfileId);
  }

  const key = funderProfileId
    ? `id:${funderProfileId}`
    : `name:${funderName.toLowerCase()}|${String(candidate.contractState ?? '')
        .trim()
        .toLowerCase()}`;
  if (seenKeys.has(key)) return;
  seenKeys.add(key);
  list.push({
    ...(funderName ? { funderName } : {}),
    ...(funderProfileId ? { funderProfileId } : {}),
    ...(candidate.contractState
      ? { contractState: String(candidate.contractState).trim() }
      : {}),
    ...(dsProfileId ? { docusignAccountProfileId: dsProfileId } : {}),
  });
}

/**
 * Resolve envelope-specific funder DocuSign auth.
 * Priority: envelope-stored history/capsule → explicit FE hints → current contract funder.
 */
export async function resolveEnvelopeFunderAuthHints(
  envelopeId: string,
  explicit?: Partial<EnvelopeFunderAuthHints>,
): Promise<EnvelopeFunderAuthHints> {
  const eid = String(envelopeId || '').trim();
  const out: EnvelopeFunderAuthHints = {
    funderName: null,
    funderProfileId: null,
    contractState: String(explicit?.contractState ?? '').trim() || null,
    applicationId: String(explicit?.applicationId ?? '').trim() || null,
    contractId:
      Number.isFinite(Number(explicit?.contractId)) && Number(explicit?.contractId) > 0
        ? Number(explicit?.contractId)
        : null,
  };

  let contractFunderFallback: string | null = null;

  // 1) Envelope-specific ACH / send-history funder (highest priority).
  if (eid) {
    const achHints = await findAchEnvelopeAuthHints(eid);
    if (achHints) {
      out.applicationId = out.applicationId || achHints.applicationId;
      out.contractId = out.contractId || achHints.contractId;
      if (achHints.funderName) out.funderName = achHints.funderName;
      if (achHints.funderProfileId) out.funderProfileId = achHints.funderProfileId;
    }
  }

  const contractIdHint = out.contractId;
  if (contractIdHint) {
    const row = await prisma.contract.findUnique({
      where: { id: contractIdHint },
      select: {
        funderName: true,
        state: true,
        applicationId: true,
        contractPrefillOverrides: true,
      },
    });
    if (row) {
      out.applicationId = out.applicationId || String(row.applicationId ?? '').trim() || null;
      out.contractState = out.contractState || row.state;
      const fromPrefill = parseFunderFromPrefillBlob(row.contractPrefillOverrides, eid);
      if (fromPrefill?.funderProfileId && !out.funderProfileId) {
        out.funderProfileId = fromPrefill.funderProfileId;
      }
      if (fromPrefill?.funderName && !out.funderName) {
        out.funderName = fromPrefill.funderName;
      }
      if (!contractFunderFallback) {
        contractFunderFallback = String(row.funderName ?? '').trim() || null;
      }
    }
  }

  let appId = out.applicationId;
  if (!appId && eid) {
    const doc = await prisma.document.findFirst({
      where: { envelopeId: eid },
      select: { applicationId: true },
    });
    appId = String(doc?.applicationId ?? '').trim() || null;
    out.applicationId = appId;
  }

  if (eid && (!out.funderName || !out.funderProfileId)) {
    const linked = await prisma.contract.findFirst({
      where: {
        OR: [
          {
            contractPrefillOverrides: {
              path: [ACH_AUTHORIZATION_DOCUSIGN_KEY, 'envelopeId'],
              equals: eid,
            },
          },
          {
            contractPrefillOverrides: {
              path: [STANDALONE_PACKAGE_DOCUSIGN_KEY, 'envelopeId'],
              equals: eid,
            },
          },
          ...(appId ? [{ applicationId: appId }] : []),
        ],
      },
      select: {
        id: true,
        funderName: true,
        state: true,
        applicationId: true,
        contractPrefillOverrides: true,
      },
      orderBy: { id: 'desc' },
    });
    if (linked) {
      out.contractId = out.contractId || linked.id;
      out.applicationId =
        out.applicationId || String(linked.applicationId ?? '').trim() || null;
      out.contractState = out.contractState || linked.state;
      const fromPrefill = parseFunderFromPrefillBlob(linked.contractPrefillOverrides, eid);
      if (fromPrefill?.funderProfileId && !out.funderProfileId) {
        out.funderProfileId = fromPrefill.funderProfileId;
      }
      if (fromPrefill?.funderName && !out.funderName) {
        out.funderName = fromPrefill.funderName;
      }
      if (!contractFunderFallback) {
        contractFunderFallback = String(linked.funderName ?? '').trim() || null;
      }
    }
  }

  // 2) Explicit FE hints beat current contract funder (viewer may open a prior-funder envelope).
  const explicitProfileId = String(explicit?.funderProfileId ?? '').trim();
  const explicitFunderName = String(explicit?.funderName ?? '').trim();
  if (!out.funderProfileId && explicitProfileId) out.funderProfileId = explicitProfileId;
  if (!out.funderName && explicitFunderName) out.funderName = explicitFunderName;

  // 3) Live contract funder only when envelope history and FE gave nothing.
  if (!out.funderName && !out.funderProfileId && contractFunderFallback) {
    out.funderName = contractFunderFallback;
  }

  return out;
}

/**
 * Ordered DocuSign JWT candidates for an envelope — try each unique DocuSign
 * account until the sender matches (USER_NOT_ENVELOPE_SENDER → next).
 */
export async function listEnvelopeFunderAuthCandidates(
  envelopeId: string,
  explicit?: Partial<EnvelopeFunderAuthHints>,
): Promise<EnvelopeFunderAuthCandidate[]> {
  const hints = await resolveEnvelopeFunderAuthHints(envelopeId, explicit);
  const candidates: EnvelopeFunderAuthCandidate[] = [];
  const seenKeys = new Set<string>();
  const seenDsProfiles = new Set<string>();

  // Envelope-resolved sender first.
  pushCandidate(candidates, seenKeys, seenDsProfiles, {
    funderProfileId: hints.funderProfileId,
    funderName: hints.funderName,
    contractState: hints.contractState,
  });

  // Explicit FE funder next (may differ from envelope-resolved).
  pushCandidate(candidates, seenKeys, seenDsProfiles, {
    funderProfileId: explicit?.funderProfileId,
    funderName: explicit?.funderName,
    contractState: explicit?.contractState ?? hints.contractState,
  });

  if (hints.contractId) {
    const row = await prisma.contract.findUnique({
      where: { id: hints.contractId },
      select: { funderName: true, state: true, contractPrefillOverrides: true },
    });
    if (row) {
      pushCandidate(candidates, seenKeys, seenDsProfiles, {
        funderName: row.funderName,
        contractState: row.state,
      });
      pushCandidate(
        candidates,
        seenKeys,
        seenDsProfiles,
        parseFunderFromPrefillBlob(row.contractPrefillOverrides, envelopeId),
      );
    }
  }

  if (hints.applicationId) {
    const row = await prisma.contract.findFirst({
      where: { applicationId: hints.applicationId },
      select: { funderName: true, state: true, contractPrefillOverrides: true },
      orderBy: { id: 'desc' },
    });
    if (row) {
      pushCandidate(candidates, seenKeys, seenDsProfiles, {
        funderName: row.funderName,
        contractState: row.state,
      });
      pushCandidate(
        candidates,
        seenKeys,
        seenDsProfiles,
        parseFunderFromPrefillBlob(row.contractPrefillOverrides, envelopeId),
      );
    }
  }

  // Every active funder that has a linked DocuSign account (deduped by DS profile).
  const funders = await listFunderProfiles({ activeOnly: true });
  for (const funder of funders) {
    if (!isPersistedFunderProfileId(funder.id)) continue;
    const dsId = String(funder.docusignAccountProfileId ?? '').trim();
    if (!dsId) continue;
    pushCandidate(candidates, seenKeys, seenDsProfiles, {
      funderProfileId: funder.id,
      funderName: funder.name,
      docusignAccountProfileId: dsId,
    });
  }

  // Platform/default JWT last — envelopes sent before funder-linked accounts.
  pushCandidate(candidates, seenKeys, seenDsProfiles, { usePlatformDefault: true });

  return candidates;
}

export function isDocuSignUserNotEnvelopeSenderError(err: unknown): boolean {
  const ax = err as {
    response?: { data?: { message?: string; errorCode?: string } };
    message?: string;
  };
  const errorCode = String(ax?.response?.data?.errorCode ?? '').trim();
  if (/USER_NOT_ENVELOPE_SENDER/i.test(errorCode)) return true;
  const msg = String(
    ax?.response?.data?.message ?? ax?.message ?? err ?? '',
  );
  return /USER_NOT_ENVELOPE_SENDER|not the sender of the envelope/i.test(msg);
}
