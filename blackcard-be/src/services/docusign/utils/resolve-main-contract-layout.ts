import {
  DOCUMENT_LAYOUT_KEYS,
  type DocumentLayoutKey,
} from '../layouts/document-layout.registry';
import { isDocumentLayoutKey } from '../platform-document-registry';
import { resolveFunderProfile, isPersistedFunderProfileId } from '../../funderProfileService';
import {
  funderContractLayoutKey,
  isFunderContractLayoutKey,
} from '../../../utils/funderContractLayout';
import {
  findBoldSignTemplatePdfUrlByExactLayoutKey,
  findDefaultContractPdfUrl,
} from '../platform-document-registry';
import {
  isWoodmereFunderProfile,
  usesTexasContractLayout,
} from '../../../utils/funderProfileResolver';
import { isTexasContractState as isTexasState, isTexasOnlyAllowedStates } from '../../../utils/usStateMatch';

export const TEXAS_FUNDING_GROUP_FUNDER_LABEL = 'TEXAS FUNDING GROUP';

/** @deprecated Legacy Alliance Bridge label — prefer Texas Funding Group. */
export const ALLIANCE_BRIDGE_FUNDER_LABEL = 'ALLIANCE BRIDGE CAPITAL';

export function isTexasContractState(state?: string | null): boolean {
  return isTexasState(state);
}

export function isTexasFundingGroupFunder(funderName?: string | null): boolean {
  const normalized = String(funderName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return false;
  return (
    normalized === 'texas funding group' ||
    normalized.includes('texas funding group')
  );
}

/** Legacy Alliance Bridge name matcher (kept for CC / prefill call sites). */
export function isAllianceBridgeFunder(funderName?: string | null): boolean {
  const normalized = String(funderName ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (!normalized) return false;
  return (
    normalized === 'alliance bridge capital' ||
    normalized === 'alliance bridge' ||
    normalized.includes('alliance bridge') ||
    normalized.includes('alliance capital')
  );
}

/** Coordinate layout for main contract PDF (not necessarily the PDF storage key). */
export function resolveMainContractCoordinateLayoutKey(options: {
  funderName?: string | null;
  state?: string | null;
  mainContractLayoutKey?: string | null;
  allowedStates?: string[] | null;
}): DocumentLayoutKey {
  const profileLayout = String(options.mainContractLayoutKey || '').trim();
  const texasLayoutFunder =
    isTexasOnlyAllowedStates(options.allowedStates) ||
    isTexasFundingGroupFunder(options.funderName) ||
    profileLayout === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract;

  if (texasLayoutFunder) {
    return isTexasContractState(options.state)
      ? DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract
      : DOCUMENT_LAYOUT_KEYS.contract;
  }

  if (isWoodmereFunderProfile({ name: options.funderName })) {
    return DOCUMENT_LAYOUT_KEYS.contract;
  }

  return DOCUMENT_LAYOUT_KEYS.contract;
}

/** Main contract PDF + coordinate layout for Create Contract / DocuSign send. */
export function resolveMainContractLayoutKey(
  funderName?: string | null,
  state?: string | null,
): DocumentLayoutKey {
  return resolveMainContractCoordinateLayoutKey({ funderName, state });
}

/**
 * Authoritative layout key for DocuSign send ΓÇö prefers the funder profile in DB
 * so a generic "contract" key cannot pull another funder's PDF.
 */
export async function resolveMainContractLayoutKeyForSend(options: {
  mainContractLayoutKey?: string | null;
  funderName?: string | null;
  funderProfileId?: string | null;
  state?: string | null;
}): Promise<string> {
  const fromClient = String(options.mainContractLayoutKey || '').trim();
  const state = options.state ?? null;

  const profile = await resolveFunderProfile({
    funderProfileId: options.funderProfileId,
    funderName: options.funderName,
    state,
  });
  const funderName = String(options.funderName || profile?.name || '').trim();
  const funderId = String(profile?.id || '').trim();

  const texasNeedsOwnLayout =
    Boolean(profile && usesTexasContractLayout(profile) && isTexasContractState(state));

  const defaultPdf = texasNeedsOwnLayout ? null : await findDefaultContractPdfUrl();
  if (defaultPdf) {
    return DOCUMENT_LAYOUT_KEYS.contract;
  }

  if (fromClient && isFunderContractLayoutKey(fromClient)) {
    const scopedPdf = await findBoldSignTemplatePdfUrlByExactLayoutKey(fromClient);
    if (scopedPdf) return fromClient;
  }

  if (profile) {
    if (funderId && isPersistedFunderProfileId(funderId)) {
      const funderScopedKey = funderContractLayoutKey(funderId);
      const scopedPdf = await findBoldSignTemplatePdfUrlByExactLayoutKey(funderScopedKey);
      if (scopedPdf) return funderScopedKey;
    }

    if (isWoodmereFunderProfile(profile) && !usesTexasContractLayout(profile)) {
        const profileKey = String(profile.mainContractLayoutKey || '').trim();
        if (isFunderContractLayoutKey(profileKey)) {
          return profileKey;
        }
        return DOCUMENT_LAYOUT_KEYS.contract;
      }

      const profileKey = String(profile.mainContractLayoutKey || '').trim();
      if (isFunderContractLayoutKey(profileKey)) {
        return profileKey;
      }
      if (profileKey && isDocumentLayoutKey(profileKey)) {
        if (
          profileKey === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract &&
          !isTexasContractState(state)
        ) {
          if (funderId) {
            const funderScopedKey = funderContractLayoutKey(funderId);
            const scopedPdf = await findBoldSignTemplatePdfUrlByExactLayoutKey(funderScopedKey);
            if (scopedPdf) return funderScopedKey;
          }
          return DOCUMENT_LAYOUT_KEYS.contract;
        }
        return profileKey;
      }
      if (funderId) {
        const funderScopedKey = funderContractLayoutKey(funderId);
        const scopedPdf = await findBoldSignTemplatePdfUrlByExactLayoutKey(funderScopedKey);
        if (scopedPdf) {
          return funderScopedKey;
        }
      }
      if (usesTexasContractLayout(profile)) {
        return resolveMainContractCoordinateLayoutKey({
          funderName: profile.name,
          state,
          mainContractLayoutKey: profileKey,
          allowedStates: profile.allowedStates,
        });
      }
      if (profileKey) {
        return profileKey;
      }
  }

  if (fromClient) {
    if (
      fromClient === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract &&
      !isTexasContractState(state)
    ) {
      return DOCUMENT_LAYOUT_KEYS.contract;
    }
    if (
      funderName &&
      isWoodmereFunderProfile({ name: funderName }) &&
      !(profile && usesTexasContractLayout(profile)) &&
      (fromClient === DOCUMENT_LAYOUT_KEYS.contract ||
        fromClient === DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract)
    ) {
      return DOCUMENT_LAYOUT_KEYS.contract;
    }
    return fromClient;
  }
  return resolveMainContractLayoutKey(funderName, state);
}
