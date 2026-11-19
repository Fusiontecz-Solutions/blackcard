/** US state tokens that should match each other for funder allowed-state checks. */
const STATE_ALIAS_GROUPS: string[][] = [
  ['alabama', 'al'],
  ['alaska', 'ak'],
  ['arizona', 'az'],
  ['arkansas', 'ar'],
  ['california', 'ca'],
  ['colorado', 'co'],
  ['connecticut', 'ct'],
  ['delaware', 'de'],
  ['florida', 'fl'],
  ['georgia', 'ga'],
  ['hawaii', 'hi'],
  ['idaho', 'id'],
  ['illinois', 'il'],
  ['indiana', 'in'],
  ['iowa', 'ia'],
  ['kansas', 'ks'],
  ['kentucky', 'ky'],
  ['louisiana', 'la'],
  ['maine', 'me'],
  ['maryland', 'md'],
  ['massachusetts', 'ma'],
  ['michigan', 'mi'],
  ['minnesota', 'mn'],
  ['mississippi', 'ms'],
  ['missouri', 'mo'],
  ['montana', 'mt'],
  ['nebraska', 'ne'],
  ['nevada', 'nv'],
  ['new hampshire', 'nh'],
  ['new jersey', 'nj'],
  ['new mexico', 'nm'],
  ['new york', 'ny'],
  ['north carolina', 'nc'],
  ['north dakota', 'nd'],
  ['ohio', 'oh'],
  ['oklahoma', 'ok'],
  ['oregon', 'or'],
  ['pennsylvania', 'pa'],
  ['rhode island', 'ri'],
  ['south carolina', 'sc'],
  ['south dakota', 'sd'],
  ['tennessee', 'tn'],
  ['texas', 'tx'],
  ['utah', 'ut'],
  ['vermont', 'vt'],
  ['virginia', 'va'],
  ['washington', 'wa'],
  ['west virginia', 'wv'],
  ['wisconsin', 'wi'],
  ['wyoming', 'wy'],
  ['district of columbia', 'dc'],
];

const CANONICAL_STATE = new Map<string, string>();
for (const group of STATE_ALIAS_GROUPS) {
  const canonical = group[0];
  for (const token of group) {
    CANONICAL_STATE.set(token, canonical);
  }
}

export function normalizeContractStateToken(state?: string | null): string {
  const raw = String(state ?? '')
    .trim()
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  return CANONICAL_STATE.get(raw) || raw;
}

export function contractStatesMatch(
  left?: string | null,
  right?: string | null,
): boolean {
  const a = normalizeContractStateToken(left);
  const b = normalizeContractStateToken(right);
  if (!a || !b) return false;
  return a === b;
}

export function isTexasContractState(state?: string | null): boolean {
  return normalizeContractStateToken(state) === 'texas';
}

/** True when allowed-states is non-empty and every entry is Texas / TX. */
export function isTexasOnlyAllowedStates(
  allowedStates?: string[] | null,
): boolean {
  const allowed = [...new Set(
    (allowedStates ?? [])
      .map((s) => normalizeContractStateToken(s))
      .filter(Boolean),
  )];
  if (!allowed.length) return false;
  return allowed.every((s) => s === 'texas');
}

export function funderStateListIncludes(
  allowedOrExcluded: string[] | null | undefined,
  state?: string | null,
): boolean {
  const target = normalizeContractStateToken(state);
  if (!target) return false;
  for (const raw of allowedOrExcluded ?? []) {
    if (contractStatesMatch(raw, target)) return true;
  }
  return false;
}
