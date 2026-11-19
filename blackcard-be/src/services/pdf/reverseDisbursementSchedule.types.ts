export type ReverseDisbursementScheduleRow = {
  period: string;
  netDailysCredit: string;
  dailysCreditInclFees: string;
  totalPeriodCredits: string;
  receivablesPurchased: string;
};

export type ReverseDisbursementScheduleSummary = {
  totalFundingAmount?: string;
  netFundingAmount?: string;
  dailyDebit?: string;
  totalTermLength?: string;
  reductionOnDailyRate?: string;
  originationFeePercent?: string;
  factorRate?: string;
};

export type ReverseDisbursementScheduleData = {
  /** @deprecated use summary.dailyDebit instead; kept for backward compatibility with existing saved contracts. */
  fixedDailyDebit?: string;
  summary?: ReverseDisbursementScheduleSummary;
  rows: ReverseDisbursementScheduleRow[];
};

export const REVERSE_DISBURSEMENT_COLUMNS = [
  { key: 'period' as const, label: 'Deposit Disbursement Schedule:' },
  { key: 'netDailysCredit' as const, label: 'Net Dailys Credit' },
  { key: 'dailysCreditInclFees' as const, label: 'Dailys Credit (Incl Fees)' },
  { key: 'totalPeriodCredits' as const, label: 'Total Period Credits' },
  { key: 'receivablesPurchased' as const, label: 'Receivables Purchased' },
];

export const REVERSE_DISBURSEMENT_SUMMARY_FIELDS: Array<{
  key: keyof ReverseDisbursementScheduleSummary;
  label: string;
}> = [
  { key: 'totalFundingAmount', label: 'Total Funding Amount:' },
  { key: 'netFundingAmount', label: 'Net Funding Amount:' },
  { key: 'dailyDebit', label: 'Daily Debit:' },
  { key: 'totalTermLength', label: 'Total Term Length:' },
  { key: 'reductionOnDailyRate', label: 'Reduction On daily Rate:' },
  { key: 'originationFeePercent', label: 'Origination Fee%' },
  { key: 'factorRate', label: 'Factor Rate' },
];
