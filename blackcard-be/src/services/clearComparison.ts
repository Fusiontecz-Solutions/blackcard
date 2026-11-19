import {
  normalizeComparableText,
  normalizeIncorporationDate,
  normalizeStateCode,
  parseUsAddressBlob,
} from './opencorporatesComparison';

export type ClearBusinessSyncFieldKey =
  | 'businessName'
  | 'businessEinNumber'
  | 'address1'
  | 'city'
  | 'state'
  | 'zipCode';

export type ClearPersonSyncFieldKey =
  | 'firstName'
  | 'middleName'
  | 'lastName'
  | 'dateOfBirth'
  | 'ssn'
  | 'address1'
  | 'city'
  | 'state'
  | 'zipCode'
  | 'email'
  | 'mobileNumber';

export const CLEAR_BUSINESS_SYNC_FIELD_KEYS: ClearBusinessSyncFieldKey[] = [
  'businessName',
  'businessEinNumber',
  'address1',
  'city',
  'state',
  'zipCode',
];

export const CLEAR_PERSON_SYNC_FIELD_KEYS: ClearPersonSyncFieldKey[] = [
  'firstName',
  'middleName',
  'lastName',
  'dateOfBirth',
  'ssn',
  'address1',
  'city',
  'state',
  'zipCode',
  'email',
  'mobileNumber',
];

export function isClearBusinessSyncFieldKey(value: unknown): value is ClearBusinessSyncFieldKey {
  return CLEAR_BUSINESS_SYNC_FIELD_KEYS.includes(value as ClearBusinessSyncFieldKey);
}

export function isClearPersonSyncFieldKey(value: unknown): value is ClearPersonSyncFieldKey {
  return CLEAR_PERSON_SYNC_FIELD_KEYS.includes(value as ClearPersonSyncFieldKey);
}

export function normalizeClearSsn(value: unknown): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  return digits;
}

export function normalizeClearEin(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

export {
  normalizeComparableText,
  normalizeIncorporationDate,
  normalizeStateCode,
  parseUsAddressBlob,
};
