export interface BankAnalysisRow {
  _id: string;
  monthLabel: string;
  monthDate: string;
  totalCredit: number;
  loanTransfer: number;
  deposit: number;
  other: number;
  nsfNegDays: number;
  lowBlcDays: number;
  avgDailyBlc: number;
}

export interface BankAnalysisTotals {
  totalCredit: number;
  loanTransfer: number;
  deposit: number;
  other: number;
  netCredit: number;
  nsfNegDays: number;
  lowBlcDays: number;
  avgDailyBlc: number;
}

export interface BankAnalysis {
  _id: string;
  bankName?: string | null;
  accountNumber: string;
  application?: string | {
    _id: string;
    applicationId?: number;
    priority?: string;
    type?: string;
    currentQueue?: string;
    currentState?: string;
  };
  rows: BankAnalysisRow[];
  totals: BankAnalysisTotals;
  createdAt?: string;
  updatedAt?: string;
}

export interface GetBankAnalysisParams {
  application: string;
}

