export type KycDocumentType = 'driverLicense' | 'voidedCheck';

export interface KycPanelOwnerPatch {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface KycPanelGuarantorPatch {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  driverLicenseNumber: string;
}

export interface KycPanelAchPatch {
  bankName: string;
  fullNameOnAccount: string;
  accountNumber: string;
  routingNumber: string;
  dba: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface KycExtractionMapped {
  documentType: KycDocumentType;
  keyData: Record<string, string>;
  contractPrefill: Record<string, string>;
  panels: {
    owner?: KycPanelOwnerPatch;
    guarantor?: KycPanelGuarantorPatch;
    ach?: KycPanelAchPatch;
  };
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

function digitsOnly(v: string): string {
  return String(v || '').replace(/\D/g, '');
}

function routingDigits(v: string): string {
  const d = digitsOnly(v);
  return d.length >= 9 ? d.slice(0, 9) : d;
}

function titleCaseNamePart(part: string): string {
  const s = str(part);
  if (!s) return '';
  return s
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ');
}

function parseLegalNameAndDba(raw: string): { legalName: string; dba: string } {
  const s = str(raw);
  if (!s) return { legalName: '', dba: '' };
  const match = s.match(/^(.+?)\s+dba\s+(.+)$/i);
  if (match) {
    return { legalName: match[1].trim(), dba: match[2].trim() };
  }
  return { legalName: s, dba: '' };
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = str(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

function buildStreetAddress(line1: string, line2: string): string {
  const a = str(line1);
  const b = str(line2);
  if (a && b) return `${a}, ${b}`;
  return a || b;
}

export function mapDriverLicenseKeyDataToPrefill(
  keyData: Record<string, string>,
): KycExtractionMapped {
  const firstName = str(keyData.first_name) || str(keyData.given_name);
  const lastName = str(keyData.last_name) || str(keyData.family_name);
  const fullName =
    str(keyData.full_name) ||
    [firstName, lastName].filter(Boolean).join(' ').trim();
  const dlNumber = str(keyData.driver_license_number) || str(keyData.license_number);
  const addressLine1 = str(keyData.address_line1) || str(keyData.street_address);
  const addressLine2 = str(keyData.address_line2);
  const city = str(keyData.city);
  const state = str(keyData.state).toUpperCase().slice(0, 2);
  const zip = digitsOnly(str(keyData.zip)).slice(0, 10);
  const street = buildStreetAddress(addressLine1, addressLine2);

  const displayName = fullName || [firstName, lastName].filter(Boolean).join(' ');
  const { firstName: fn, lastName: ln } = splitFullName(displayName);

  const contractPrefill: Record<string, string> = {};
  const set = (key: string, val: string) => {
    if (str(val)) contractPrefill[key] = val;
  };

  set('customerName', displayName);
  set('clientName', displayName);
  set('owner1GuarantorName', displayName);
  set('guarantyOwner1Name', displayName);
  set('guarantyGuarantor1Name', displayName);
  set('securityGuarantor', displayName);
  set('achAuthorizationAccountHolderName', displayName);
  set('achAuthorizationConcentAccountHolderName', displayName);

  if (dlNumber) {
    set('guarantyOwner1DriverLicense', dlNumber);
    set('guarantyGuarantor1DriverLicense', dlNumber);
    set('guarantySsDriverLicense', dlNumber);
  }

  if (street) {
    set('guarantorAddress', street);
    set('businessAddressContract', street);
    set('achAuthorizationAccountHolderAddress', street);
  }
  if (city) {
    set('guarantorAddressCity', city);
    set('businessAddressContractCity', city);
    set('achAuthorizationAccountHolderCity', city);
  }
  if (state) {
    set('guarantorAddressState', state);
    set('businessAddressContractState', state);
    set('achAuthorizationAccountHolderState', state);
  }
  if (zip) {
    set('guarantorAddressZip', zip);
    set('businessAddressContractZip', zip);
    set('achAuthorizationAccountHolderZip', zip);
  }

  return {
    documentType: 'driverLicense',
    keyData,
    contractPrefill,
    panels: {
      owner: {
        firstName: titleCaseNamePart(fn),
        lastName: titleCaseNamePart(ln),
        address: street,
        city,
        state,
        zipCode: zip,
      },
      guarantor: {
        firstName: titleCaseNamePart(fn),
        lastName: titleCaseNamePart(ln),
        address: street,
        city,
        state,
        zipCode: zip,
        driverLicenseNumber: dlNumber,
      },
    },
  };
}

export function mapVoidedCheckKeyDataToPrefill(
  keyData: Record<string, string>,
): KycExtractionMapped {
  const accountHolder =
    str(keyData.account_holder_name) ||
    str(keyData.member_name) ||
    str(keyData.payee_name);
  const { legalName, dba } = parseLegalNameAndDba(
    str(keyData.legal_business_name) || accountHolder,
  );
  const dbaName = str(keyData.dba_name) || dba;
  const bankName = str(keyData.bank_name);
  const routing = routingDigits(
    str(keyData.routing_number) || str(keyData.aba_routing_number),
  );
  const account = digitsOnly(
    str(keyData.account_number) || str(keyData.checking_account_number),
  );
  const addressLine1 =
    str(keyData.account_holder_address_line1) || str(keyData.address_line1);
  const addressLine2 = str(keyData.account_holder_address_line2) || str(keyData.address_line2);
  const city = str(keyData.city);
  const state = str(keyData.state).toUpperCase().slice(0, 2);
  const zip = digitsOnly(str(keyData.zip)).slice(0, 10);
  const street = buildStreetAddress(addressLine1, addressLine2);

  const contractPrefill: Record<string, string> = {};
  const set = (key: string, val: string) => {
    if (str(val)) contractPrefill[key] = val;
  };

  if (legalName) {
    set('legalName', legalName);
    set('authorizationClientName', legalName);
    set('authorizationClientNamePrint', accountHolder || legalName);
    set('achAuthorizationAccountHolderName', legalName);
    set('achAuthorizationConcentAccountHolderName', legalName);
    set('securityBusinessName', legalName);
  }
  if (dbaName) {
    set('doingBusinessAs', dbaName);
    set('securityDoingBusinessAs', dbaName);
    set('achAuthorizationAccountHolderDba', dbaName);
  }
  if (bankName) {
    set('authorizationClientBankName', bankName);
    set('achAuthorizationAccountHolderBankName', bankName);
  }
  if (routing) {
    set('authorizationClientBankRouting', routing);
    set('achAuthorizationAccountHolderBankRoutingNumber', routing);
  }
  if (account) {
    set('authorizationClientBankAccount', account);
    set('achAuthorizationAccountHolderBankAccountNumber', account);
  }
  if (street) {
    set('businessAddress', street);
    set('securityBusinessAddress', street);
    set('achAuthorizationAccountHolderAddress', street);
  }
  if (city) {
    set('businessAddressCity', city);
    set('securityBusinessAddressCity', city);
    set('achAuthorizationAccountHolderCity', city);
  }
  if (state) {
    set('businessAddressState', state);
    set('securityBusinessAddressState', state);
    set('achAuthorizationAccountHolderState', state);
    set('achAuthorizationAccountHolderBankState', state);
  }
  if (zip) {
    set('businessAddressZip', zip);
    set('securityBusinessAddressZip', zip);
    set('achAuthorizationAccountHolderZip', zip);
    set('achAuthorizationAccountHolderBankZip', zip);
  }

  const bankCity = str(keyData.bank_city);
  const bankState = str(keyData.bank_state).toUpperCase().slice(0, 2);
  const bankZip = digitsOnly(str(keyData.bank_zip)).slice(0, 10);
  if (bankCity) set('achAuthorizationAccountHolderBankBranchCity', bankCity);
  if (bankState) set('achAuthorizationAccountHolderBankState', bankState);
  if (bankZip) set('achAuthorizationAccountHolderBankZip', bankZip);

  return {
    documentType: 'voidedCheck',
    keyData,
    contractPrefill,
    panels: {
      ach: {
        bankName,
        fullNameOnAccount: legalName || accountHolder,
        accountNumber: account,
        routingNumber: routing,
        dba: dbaName,
        address: street,
        city,
        state,
        zip,
      },
    },
  };
}

export function mapKycKeyDataToPrefill(
  documentType: KycDocumentType,
  keyData: Record<string, string>,
): KycExtractionMapped {
  if (documentType === 'driverLicense') {
    return mapDriverLicenseKeyDataToPrefill(keyData);
  }
  return mapVoidedCheckKeyDataToPrefill(keyData);
}

export function mergeContractPrefillPatch(
  existing: unknown,
  patch: Record<string, string>,
): Record<string, unknown> {
  const base =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  for (const [key, val] of Object.entries(patch)) {
    if (str(val)) {
      base[key] = val;
    }
  }
  return base;
}

export function normalizeKycDocumentType(raw: unknown): KycDocumentType | null {
  const key = String(raw ?? '')
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
  if (key === 'driverlicense') return 'driverLicense';
  if (key === 'voidedcheck') return 'voidedCheck';
  return null;
}

export function isKycDocumentType(raw: unknown): boolean {
  return normalizeKycDocumentType(raw) != null;
}
