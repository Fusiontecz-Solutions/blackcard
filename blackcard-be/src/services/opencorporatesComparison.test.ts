import { describe, expect, it } from '@jest/globals';
import {
  isOpenCorporatesSyncFieldKey,
  normalizeComparableText,
  normalizeEntityType,
  normalizeIncorporationDate,
  normalizeStateCode,
  parseUsAddressBlob,
} from './opencorporatesComparison';

describe('opencorporatesComparison', () => {
  it('normalizes names, punctuation, capitalization, and whitespace', () => {
    expect(normalizeComparableText('  ACME,   Holdings & Co. ')).toBe(
      'acme holdings and co',
    );
  });

  it('normalizes jurisdiction codes and state names', () => {
    expect(normalizeStateCode('us_ar')).toBe('AR');
    expect(normalizeStateCode('AR')).toBe('AR');
    expect(normalizeStateCode('Arkansas')).toBe('AR');
  });

  it('normalizes entity type aliases', () => {
    expect(normalizeEntityType('Foreign Limited Liability Company')).toBe('llc');
    expect(normalizeEntityType('LLC')).toBe('llc');
    expect(normalizeEntityType('Inc.')).toBe('inc');
  });

  it('normalizes incorporation dates to YYYY-MM-DD', () => {
    expect(normalizeIncorporationDate('2016-07-04')).toBe('2016-07-04');
    expect(normalizeIncorporationDate('July 4, 2016')).toBe('2016-07-04');
  });

  it('parses confident US address blobs', () => {
    expect(
      parseUsAddressBlob('180 S THORNTON AVE, PIGGOTT, ARKANSAS, 72454, USA'),
    ).toEqual({
      address1: '180 S THORNTON AVE',
      city: 'PIGGOTT',
      state: 'AR',
      zipCode: '72454',
    });
  });

  it('rejects incomplete address blobs', () => {
    expect(parseUsAddressBlob('PIGGOTT, AR')).toBeNull();
    expect(parseUsAddressBlob('180 S THORNTON AVE, PIGGOTT, AR')).toBeNull();
    expect(parseUsAddressBlob('')).toBeNull();
  });

  it('allowlists only known sync fields', () => {
    expect(isOpenCorporatesSyncFieldKey('businessName')).toBe(true);
    expect(isOpenCorporatesSyncFieldKey('officers')).toBe(false);
  });
});
