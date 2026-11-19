import {
  funderAvailableForState,
  funderNamesEquivalent,
  isPersistedFunderProfileId,
  pickFunderProfileFromList,
  resolveFunderProfile,
  type SerializedFunderProfile,
} from '../services/funderProfileService';
import { isPlatformBrandName } from '../constants/brand';
import prisma from '../config/prismaClient';
import {
  isAllianceBridgeFunder,
  isTexasContractState,
  isTexasFundingGroupFunder,
} from '../services/docusign/utils/resolve-main-contract-layout';
import { DOCUMENT_LAYOUT_KEYS } from '../services/docusign/layouts/document-layout.registry';
import { CONTRACT_ENVELOPE_LENDER_NAME } from '../utils/contractEnvelopeEmailSubject';
import { isTexasOnlyAllowedStates } from './usStateMatch';

export type { SerializedFunderProfile };
export { pickFunderProfileFromList, resolveFunderProfile };

function normalizeFunderToken(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** Legacy Alliance Bridge profile matcher (kept for contract CC defaults). */
export function isAllianceFunderProfile(profile: {
  name?: string | null;
  displayName?: string | null;
  mainContractLayoutKey?: string | null;
  organization?: string | null;
  legalName?: string | null;
  contactEmail?: string | null;
}): boolean {
  return (
    isAllianceBridgeFunder(profile.name) ||
    isAllianceBridgeFunder(profile.displayName) ||
    isAllianceBridgeFunder(profile.organization) ||
    isAllianceBridgeFunder(profile.legalName) ||
    String(profile.name ?? '').toLowerCase().includes('alliance capital') ||
    String(profile.displayName ?? '').toLowerCase().includes('alliance capital') ||
    String(profile.contactEmail ?? '')
      .toLowerCase()
      .includes('@alliancebridgecapital.com') ||
    String(profile.mainContractLayoutKey || '').trim() === 'alliance_bridge_contract'
  );
}

export function isWoodmereFunderProfile(profile: {
  name?: string | null;
  displayName?: string | null;
  organization?: string | null;
  legalName?: string | null;
}): boolean {
  const tokens = [profile.name, profile.displayName, profile.organization, profile.legalName]
    .map(normalizeFunderToken)
    .filter(Boolean);
  return tokens.some(
    (t) =>
      funderNamesEquivalent(t, CONTRACT_ENVELOPE_LENDER_NAME) ||
      isPlatformBrandName(t),
  );
}

export function isTexasFundingGroupFunderProfile(profile: {
  name?: string | null;
  displayName?: string | null;
  mainContractLayoutKey?: string | null;
  organization?: string | null;
  legalName?: string | null;
  contactEmail?: string | null;
}): boolean {
  if (isWoodmereFunderProfile(profile)) return false;

  return (
    isTexasFundingGroupFunder(profile.name) ||
    isTexasFundingGroupFunder(profile.displayName) ||
    isTexasFundingGroupFunder(profile.organization) ||
    isTexasFundingGroupFunder(profile.legalName) ||
    String(profile.mainContractLayoutKey || '').trim() ===
      DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract
  );
}

/** Settings → Funders “Only show in these states” is Texas / TX only. */
export function isTexasOnlyFunderProfile(profile: {
  allowedStates?: string[] | null;
}): boolean {
  return isTexasOnlyAllowedStates(profile.allowedStates);
}

/** Use the 13-page Texas contract coordinates (name, layout key, or Texas-only states). */
export function usesTexasContractLayout(profile: {
  name?: string | null;
  displayName?: string | null;
  mainContractLayoutKey?: string | null;
  organization?: string | null;
  legalName?: string | null;
  contactEmail?: string | null;
  allowedStates?: string[] | null;
}): boolean {
  if (isTexasOnlyFunderProfile(profile)) return true;
  return isTexasFundingGroupFunderProfile(profile);
}

export function resolveDefaultFunderNameForState(
  profiles: Array<{
    name: string;
    displayName?: string | null;
    allowedStates?: string[];
    excludedStates?: string[];
    sortOrder?: number;
    isActive?: boolean;
    mainContractLayoutKey?: string | null;
    organization?: string | null;
    legalName?: string | null;
  }>,
  state?: string | null,
): string | null {
  const normalizedState = normalizeFunderToken(state);
  const active = profiles.filter((p) => p.isActive !== false);

  if (isTexasContractState(normalizedState)) {
    const texasFunder = [...active]
      .filter((p) => usesTexasContractLayout(p))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .find((p) =>
        funderAvailableForState(
          p.allowedStates ?? [],
          p.excludedStates ?? [],
          normalizedState,
        ),
      );
    if (texasFunder?.name) {
      return String(texasFunder.name).trim();
    }
  }

  const woodmere = active.find((p) => isWoodmereFunderProfile(p));
  if (
    woodmere?.name &&
    funderAvailableForState(
      woodmere.allowedStates ?? [],
      woodmere.excludedStates ?? [],
      normalizedState,
    )
  ) {
    return String(woodmere.name).trim();
  }
  if (woodmere?.name && !isTexasContractState(normalizedState)) {
    return String(woodmere.name).trim();
  }

  const fallback = active
    .filter((p) => !usesTexasContractLayout(p))
    .filter((p) =>
      funderAvailableForState(
        p.allowedStates ?? [],
        p.excludedStates ?? [],
        normalizedState,
      ),
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  return fallback?.name ? String(fallback.name).trim() : null;
}

/**
 * Auto-select funder on contract state change:
 * - Selecting Texas → Texas-only funder (or Texas Funding Group)
 * - Leaving Texas → Woodmere / Black Card
 * - Same Texas-ness → keep current funder
 */
export function resolveFunderSwitchOnStateChange(options: {
  currentFunderName?: string | null;
  previousState?: string | null;
  newState?: string | null;
  profiles: Array<{
    name: string;
    displayName?: string | null;
    allowedStates?: string[];
    excludedStates?: string[];
    sortOrder?: number;
    isActive?: boolean;
    mainContractLayoutKey?: string | null;
    organization?: string | null;
    legalName?: string | null;
  }>;
}): string | null {
  const pickedState = String(options.newState ?? '').trim();
  if (!pickedState) return null;

  const profiles = options.profiles.filter((p) => p.isActive !== false);
  const current = pickFunderProfileFromList(
    profiles as SerializedFunderProfile[],
    options.currentFunderName,
    pickedState,
  );
  const prevTexas = isTexasContractState(options.previousState);
  const nextTexas = isTexasContractState(pickedState);

  // Selecting Texas (from any non-Texas state): Texas-only / TFG funder.
  if (nextTexas && !prevTexas) {
    const texasFunder =
      [...profiles]
        .filter((p) => usesTexasContractLayout(p))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0] ??
      profiles.find(
        (p) =>
          String(p.mainContractLayoutKey || '').trim() ===
          DOCUMENT_LAYOUT_KEYS.texasFundingGroupContract,
      );
    if (!texasFunder?.name) return null;
    if (current && usesTexasContractLayout(current)) return null;
    return String(texasFunder.name).trim();
  }

  // Leaving Texas: Woodmere.
  if (prevTexas && !nextTexas) {
    const woodmere = profiles.find((p) => isWoodmereFunderProfile(p));
    if (woodmere?.name) {
      if (current && isWoodmereFunderProfile(current)) return null;
      return String(woodmere.name).trim();
    }
    return resolveDefaultFunderNameForState(profiles, pickedState);
  }

  // Same Texas-ness: keep funder unless it is unavailable for the new state.
  if (
    current &&
    funderAvailableForState(
      current.allowedStates ?? [],
      current.excludedStates ?? [],
      pickedState,
    )
  ) {
    return null;
  }
  return resolveDefaultFunderNameForState(profiles, pickedState);
}

export async function getFunderWithDocuSignCredentialsResolved(options: {
  funderProfileId?: string | null;
  funderName?: string | null;
  state?: string | null;
}) {
  const profile = await resolveFunderProfile(options);
  if (!profile) return null;

  if (!isPersistedFunderProfileId(profile.id)) {
    return { funder: profile, docusignProfile: null };
  }

  const row = await prisma.funderProfile.findUnique({
    where: { id: profile.id },
    include: { docusignAccountProfile: true },
  });
  if (!row) return null;

  return {
    funder: profile,
    docusignProfile: row.docusignAccountProfile,
  };
}
