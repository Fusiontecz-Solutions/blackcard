export type OpenCorporatesSyncFieldKey =
  | 'businessName'
  | 'businessEntityType'
  | 'incorporationDate'
  | 'incorporationState'
  | 'address1'
  | 'city'
  | 'state'
  | 'zipCode';

export const OPENCORPORATES_SYNC_FIELD_KEYS: OpenCorporatesSyncFieldKey[] = [
  'businessName',
  'businessEntityType',
  'incorporationDate',
  'incorporationState',
  'address1',
  'city',
  'state',
  'zipCode',
];

export type ParsedUsAddress = {
  address1: string;
  city: string;
  state: string;
  zipCode: string;
};

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  'district of columbia': 'DC',
};

const ENTITY_ALIASES: Record<string, string> = {
  llc: 'llc',
  'l.l.c': 'llc',
  'l.l.c.': 'llc',
  'limited liability company': 'llc',
  'limited liability co': 'llc',
  'foreign limited liability company': 'llc',
  'domestic limited liability company': 'llc',
  inc: 'inc',
  'inc.': 'inc',
  incorporated: 'inc',
  corporation: 'inc',
  corp: 'inc',
  'corp.': 'inc',
  'c corporation': 'inc',
  'c-corp': 'inc',
  's corporation': 'inc',
  's-corp': 'inc',
  'professional corporation': 'inc',
  pc: 'inc',
  'p.c.': 'inc',
  llp: 'llp',
  'l.l.p': 'llp',
  'limited liability partnership': 'llp',
  lp: 'lp',
  'l.p.': 'lp',
  'limited partnership': 'lp',
  'sole proprietorship': 'sole',
  'general partnership': 'gp',
};

export function normalizeComparableText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeStateCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const jurisdiction = raw.match(/^us[_-]?([a-z]{2})$/i);
  if (jurisdiction) return jurisdiction[1].toUpperCase();
  if (/^[a-z]{2}$/i.test(raw)) return raw.toUpperCase();
  return US_STATE_NAME_TO_CODE[normalizeComparableText(raw)] ?? '';
}

export function normalizeIncorporationDate(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeEntityType(value: unknown): string {
  const normalized = normalizeComparableText(value);
  if (!normalized) return '';
  if (ENTITY_ALIASES[normalized]) return ENTITY_ALIASES[normalized];
  for (const [alias, canonical] of Object.entries(ENTITY_ALIASES)) {
    if (normalized.includes(alias)) return canonical;
  }
  return normalized;
}

export function parseUsAddressBlob(raw: unknown): ParsedUsAddress | null {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\bUSA\b\.?/gi, '')
    .replace(/\bUnited States\b\.?/gi, '')
    .trim()
    .replace(/[,\s]+$/g, '');
  if (!text) return null;

  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!zipMatch || zipMatch.index == null) return null;
  const zipCode = zipMatch[1];
  const beforeZip = text.slice(0, zipMatch.index).replace(/[,\s]+$/g, '').trim();
  if (!beforeZip) return null;

  const parts = beforeZip
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  let state = normalizeStateCode(parts[parts.length - 1]);
  let city = '';
  let streetParts = parts.slice(0, -1);

  if (!state && parts.length >= 3) {
    state = normalizeStateCode(parts[parts.length - 2]);
    if (state) {
      city = parts[parts.length - 1];
      streetParts = parts.slice(0, -2);
    }
  } else if (state) {
    if (streetParts.length === 0) return null;
    city = streetParts[streetParts.length - 1] ?? '';
    streetParts = streetParts.slice(0, -1);
  }

  const address1 = streetParts.join(', ').trim();
  if (!address1 || !city || !state || !zipCode) return null;
  return { address1, city, state, zipCode };
}

export function isOpenCorporatesSyncFieldKey(
  value: unknown,
): value is OpenCorporatesSyncFieldKey {
  return OPENCORPORATES_SYNC_FIELD_KEYS.includes(value as OpenCorporatesSyncFieldKey);
}
