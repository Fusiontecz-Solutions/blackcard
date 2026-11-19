/** Align with Prisma `PaymentMethod` / `RepaymentMethod`. */
export const RAILS_METHOD_OPTIONS = [
  'ACH',
  'CHECK',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'WIRE_TRANSFER',
  'MOBILE_PAYMENT',
  'BANK_DRAFT',
  'PAYPAL',
  'OTHER',
] as const;

/** Admin billing: payment / repayment transmission method pickers (subset of Prisma enums). */
export const BILLING_TRANSMISSION_METHOD_OPTIONS = [
  'ACH',
  'CREDIT_CARD',
  'WIRE_TRANSFER',
  'OTHER',
] as const;

const BILLING_TRANSMISSION_METHOD_SET = new Set<string>(BILLING_TRANSMISSION_METHOD_OPTIONS);

export function isStandardBillingTransmissionMethod(method: string): boolean {
  return BILLING_TRANSMISSION_METHOD_SET.has(String(method ?? '').trim().toUpperCase());
}

export function formatBillingTransmissionOptionLabel(enumValue: string): string {
  const v = enumValue.trim().toUpperCase();
  if (v === 'CREDIT_CARD') return 'Credit card';
  if (v === 'WIRE_TRANSFER') return 'Wire';
  if (v === 'OTHER') return 'Other';
  if (v === 'ACH') return 'ACH';
  return v.replace(/_/g, ' ');
}

/** Methods where a PSP / ACH processor dropdown is meaningful (rails-style syndicator UX). */
const METHOD_SUPPORTS_PROCESSOR = new Set<string>([
  'ACH',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'PAYPAL',
  'BANK_DRAFT',
  'MOBILE_PAYMENT',
]);

export function methodSupportsProcessor(method: string): boolean {
  return METHOD_SUPPORTS_PROCESSOR.has(String(method ?? '').trim().toUpperCase());
}

export const PROCESSOR_OPTIONS = ['ACTUM', 'STRIPE', 'PAYPAL', 'OTHER'] as const;

export const PAYMENT_FREQUENCY_OPTIONS = ['DAILY', 'WEEKLY', 'BIWEEKLY'] as const;

/** Weekdays typically used for syndicator ACH-style schedules (matches terms-offer weekdays). */
export const BUSINESS_WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
] as const;
export type BusinessWeekday = (typeof BUSINESS_WEEKDAYS)[number];

export function formatWeekdayLabel(day: string): string {
  const d = day.trim().toUpperCase();
  if (!d) return '';
  return d.charAt(0) + d.slice(1).toLowerCase();
}

/** Map stored strings (Monday, MON, …) onto BUSINESS_WEEKDAYS. */
export function normalizeBusinessWeekday(input: unknown, fallback: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return fallback;
  const collapsed = raw.toUpperCase().replace(/[\s._-]/g, '');

  const map: Record<string, BusinessWeekday> = {
    MONDAY: 'MONDAY',
    MON: 'MONDAY',
    TUESDAY: 'TUESDAY',
    TUE: 'TUESDAY',
    TUES: 'TUESDAY',
    WEDNESDAY: 'WEDNESDAY',
    WED: 'WEDNESDAY',
    THURSDAY: 'THURSDAY',
    THU: 'THURSDAY',
    THURS: 'THURSDAY',
    FRIDAY: 'FRIDAY',
    FRI: 'FRIDAY',
  };

  const hit = map[collapsed];
  return hit ?? fallback;
}

export const CALCULATION_LOGIC_OPTIONS = [
  'PRINCIPAL_SYNDICATED_AMOUNT',
  'DISBURSED_SYNDICATED_AMOUNT',
] as const;

export const inputSelectClass =
  'border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-xs md:text-sm';

/** Compact width for weekday dropdowns (weekly / bi-weekly). */
export const weekdaySelectClass = `${inputSelectClass} max-w-[200px]`;
