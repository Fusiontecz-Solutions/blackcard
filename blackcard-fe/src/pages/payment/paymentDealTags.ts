import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  CheckCircle2,
  Lock,
  Pause,
  Snowflake,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export type PaymentCategoryOption = {
  value: string;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  pillClassName: string;
};

/** Health tags from All Deals (Delinquent, Needs attention, On track, Paid off). */
export const DEAL_HEALTH_TAG_OPTIONS: PaymentCategoryOption[] = [
  {
    value: 'Delinquent',
    label: 'Delinquent',
    icon: AlertTriangle,
    iconClassName: 'text-red-600 dark:text-red-400',
    pillClassName: 'border border-red-500/40 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300',
  },
  {
    value: 'Needs attention',
    label: 'Needs attention',
    icon: AlertTriangle,
    iconClassName: 'text-amber-600 dark:text-amber-400',
    pillClassName: 'border border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  {
    value: 'On track',
    label: 'On track',
    icon: TrendingUp,
    iconClassName: 'text-sky-600 dark:text-sky-400',
    pillClassName: 'border border-sky-500/40 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  {
    value: 'Paid off',
    label: 'Paid off',
    icon: CheckCircle2,
    iconClassName: 'text-emerald-600 dark:text-emerald-400',
    pillClassName: 'border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  },
];

export const DEAL_OPS_TAG_OPTIONS: PaymentCategoryOption[] = [
  {
    value: 'Insufficient Funds',
    label: 'Insufficient Funds',
    icon: Wallet,
    iconClassName: 'text-rose-500',
    pillClassName: 'border border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
  {
    value: 'Weekly Payments',
    label: 'Weekly Payments',
    icon: CalendarDays,
    iconClassName: 'text-sky-500',
    pillClassName: 'border border-sky-500/40 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300',
  },
  {
    value: 'Paused Payments',
    label: 'Paused Payments',
    icon: Pause,
    iconClassName: 'text-amber-500',
    pillClassName: 'border border-amber-500/40 bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300',
  },
  {
    value: 'Blocked Payments',
    label: 'Blocked Payments',
    icon: Ban,
    iconClassName: 'text-red-500',
    pillClassName: 'border border-red-500/40 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300',
  },
  {
    value: 'Shut Debits',
    label: 'Shut Debits',
    icon: Lock,
    iconClassName: 'text-orange-500',
    pillClassName: 'border border-orange-500/40 bg-orange-50 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300',
  },
  {
    value: 'Account Issues',
    label: 'Account Issues',
    icon: AlertTriangle,
    iconClassName: 'text-yellow-500',
    pillClassName: 'border border-yellow-500/40 bg-yellow-50 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',
  },
  {
    value: 'Account Closed',
    label: 'Account Closed',
    icon: Store,
    iconClassName: 'text-slate-500',
    pillClassName: 'border border-slate-500/40 bg-slate-50 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300',
  },
  {
    value: 'Account Frozen',
    label: 'Account Frozen',
    icon: Snowflake,
    iconClassName: 'text-cyan-500',
    pillClassName: 'border border-cyan-500/40 bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  },
];

export const PAYMENT_CATEGORY_GROUPS: { label: string; options: PaymentCategoryOption[] }[] = [
  { label: 'Health', options: DEAL_HEALTH_TAG_OPTIONS },
  { label: 'Collections', options: DEAL_OPS_TAG_OPTIONS },
];

export const PAYMENT_CATEGORY_OPTIONS: PaymentCategoryOption[] = [
  ...DEAL_HEALTH_TAG_OPTIONS,
  ...DEAL_OPS_TAG_OPTIONS,
];

const PAYMENT_CATEGORY_OPTION_BY_VALUE = new Map<string, PaymentCategoryOption>(
  PAYMENT_CATEGORY_OPTIONS.map((opt) => [opt.value.toLowerCase(), opt]),
);

export function resolvePaymentCategoryOption(
  value: string | null | undefined,
): PaymentCategoryOption | null {
  if (!value) return null;
  return PAYMENT_CATEGORY_OPTION_BY_VALUE.get(value.trim().toLowerCase()) ?? null;
}
