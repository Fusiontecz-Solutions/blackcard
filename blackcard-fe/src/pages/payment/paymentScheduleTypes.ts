export type PaymentStatus =
  | "scheduled"
  | "paid"
  | "failed"
  | "due_today"
  | "upcoming"
  | "manual"
  | "waived"
  | "reversed"
  | "credit"
  | "debit";

export type PaymentRow = {
  id?: string;
  payNum: number;
  date: string;
  amount: number;
  status: PaymentStatus;
  refId: string;
  note?: string;
  /** CollectionPayment / upload deal id when present (for UI scoping by application deal). */
  dealId?: string | null;
};

export type DealSchedule = {
  id: string;
  deal: string;
  merchant: string;
  ein?: string;
  agent?: string;
  industry?: string;
  iso?: string;
  advanceAmount: number;
  factor: number;
  paybackAmount: number;
  dailyPayment: number;
  startDate: string;
  totalPayments: number;
  payments: PaymentRow[];
};

