import { shouldSkipPrefillUppercase, toPrefillUppercase } from './prefill-uppercase';

describe('prefill uppercase', () => {
  it('uppercases names and addresses', () => {
    expect(toPrefillUppercase('John Smith', 'client_name')).toBe('JOHN SMITH');
    expect(toPrefillUppercase('123 Main St', 'business_address')).toBe('123 MAIN ST');
  });

  it('skips credentials, urls, emails, and entity type', () => {
    expect(shouldSkipPrefillUppercase('achAuthorizationPassword')).toBe(true);
    expect(shouldSkipPrefillUppercase('ach_authorization_username')).toBe(true);
    expect(shouldSkipPrefillUppercase('ach_authorization_bank_portal_website')).toBe(true);
    expect(shouldSkipPrefillUppercase('client_email')).toBe(true);
    expect(shouldSkipPrefillUppercase('entity_type')).toBe(true);
    expect(toPrefillUppercase('Secret1', 'achAuthorizationPassword')).toBe('Secret1');
    expect(toPrefillUppercase('https://bank.example/login', 'achAuthorizationBankPortalWebsite')).toBe(
      'https://bank.example/login',
    );
  });
});
