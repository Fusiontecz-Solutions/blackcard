import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { axiosGet } from "@/redux/axios";
import { formatNumberUS, normalizeApiDateToYyyyMmDd, parseNumberUS } from "@/lib/utils";
import {
  getApplicationBusinessDisplayName,
  getClientNameFromApplicationClient,
} from "@/lib/applicationBusinessDisplayName";
import {
  resolveOfferDecisionFeesRaw,
  resolveOfferDecisionFundedAmount,
  resolveOfferFeesPercentForForm,
} from "@/lib/offerDecisionFees";
import WouldMePreviewModal from "@/mcaWdPreview/components/WouldMePreviewModal.jsx";
import {
  decodeAdditionalInfoNote,
  isAdditionalInfoNoteContent,
  type AdditionalInfo,
} from "@/lib/additionalInfo";
import type { Application } from "@/types/applicationTypes";
import type { BankAnalysis } from "@/types/bankAnalysisTypes";
import type { Position } from "@/types/positionTypes";
import { toast } from "react-toastify";

export type ScrubbingPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string | null;
  /**
   * Render off-screen and report the preview element (used to attach
   * Breakdown.pdf to the recommend mail). `hasData` is false when the deal has
   * no positions and no bank analysis; element is null when loading failed.
   */
  captureMode?: boolean;
  onCaptureReady?: (
    element: HTMLElement | null,
    hasData: boolean,
    extra?: ScrubbingPreviewCaptureExtra,
  ) => void;
};

export type ScrubbingPreviewCaptureExtra = {
  /** True when any bank-analysis, position or offer number in the preview is > 0. */
  hasPositiveValue: boolean;
  /** Builds the same email HTML the preview's Copy button produces. */
  buildEmailHtml: () => Promise<string | null>;
};

/** True when any finite number (or numeric string) in the value tree is > 0. */
function hasAnyPositiveNumber(value: unknown, depth = 0): boolean {
  if (depth > 6 || value == null) return false;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^[-$\s\d.,%]+$/.test(trimmed) || !/\d/.test(trimmed)) return false;
    const n = parseNumberUS(trimmed.replace(/[$%\s]/g, ""));
    return Number.isFinite(n) && n > 0;
  }
  if (Array.isArray(value)) return value.some((v) => hasAnyPositiveNumber(v, depth + 1));
  if (typeof value === "object") {
    // Skip ids (e.g. allocatedBankAnalysisId) - they are not amounts.
    return Object.entries(value as Record<string, unknown>).some(
      ([key, v]) => !/id$/i.test(key) && hasAnyPositiveNumber(v, depth + 1),
    );
  }
  return false;
}

type McaBankRow = {
  month: string;
  totalCredits: number;
  loan: number;
  transfer: number;
  deposite: number;
  other: number;
  netCredit: number;
  nsfNegDays: number;
  lowNegDays: number;
  averageDailyBalance: number;
};

type McaPosition = {
  lender: string;
  status: string;
  frequency: string;
  amountFunded: number;
  installment: number;
  monthlyMcaPmts: number;
  mcaRemit: number;
  mcaPercentPaid: number;
  startingDate: string;
  dateOfLastPymt: string;
  loanAmount?: number;
  totalRepayments?: number;
  paymentTerm?: number;
  mcaEstBalance?: number;
  pmtsLeft?: number;
  allocatedBankAnalysisId?: number;
};

type LoanTransferAllocated = Record<
  number,
  Record<string, number | number[]>
>;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseNum(value: unknown): number {
  const n = parseNumberUS(value);
  return Number.isFinite(n) ? n : NaN;
}

function isMtdMonthLabel(month: unknown): boolean {
  return String(month || "")
    .toLowerCase()
    .includes("mtd");
}

function monthLabelToYyyyMm(label: string): string {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const now = new Date();
  const mtd = raw.match(/^([A-Za-z]+)\s+MTD$/i);
  if (mtd) {
    const monthIdx = MONTH_NAMES.findIndex(
      (m) => m.toLowerCase() === mtd[1].toLowerCase(),
    );
    if (monthIdx < 0) return "";
    return `${now.getFullYear()}-${String(monthIdx + 1).padStart(2, "0")}`;
  }
  const full = raw.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!full) return "";
  const monthIdx = MONTH_NAMES.findIndex(
    (m) => m.toLowerCase() === full[1].toLowerCase(),
  );
  if (monthIdx < 0) return "";
  return `${full[2]}-${String(monthIdx + 1).padStart(2, "0")}`;
}

function dateToYyyyMm(value: unknown): string {
  const iso = normalizeApiDateToYyyyMmDd(value as any);
  const m = String(iso || "").match(/^(\d{4}-\d{2})/);
  return m ? m[1] : "";
}

/** axios response / nested `{ data }` envelopes used across books. */
function unwrapList<T>(resp: unknown): T[] {
  const r = resp as { data?: unknown };
  const body = r?.data !== undefined ? r.data : resp;
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === "object") {
    const b = body as { data?: unknown };
    if (Array.isArray(b.data)) return b.data as T[];
    if (b.data && typeof b.data === "object" && !Array.isArray(b.data)) {
      const nested = (b.data as { data?: unknown }).data;
      if (Array.isArray(nested)) return nested as T[];
    }
  }
  return [];
}

function unwrapRecord(resp: unknown): Record<string, unknown> | null {
  const list = unwrapList<Record<string, unknown>>(resp);
  if (list.length && list[0] && typeof list[0] === "object") return list[0];

  const r = resp as { data?: unknown };
  const body = r?.data !== undefined ? r.data : resp;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const b = body as { data?: unknown };
    if (b.data && typeof b.data === "object" && !Array.isArray(b.data)) {
      return b.data as Record<string, unknown>;
    }
    // Envelope without nested data — treat body as record if it looks like an offer
    if (
      "decision" in b ||
      "offer_status" in b ||
      "status" in b ||
      "offer" in b ||
      "fundedAmount" in b ||
      "amount" in b
    ) {
      return b as Record<string, unknown>;
    }
  }
  return null;
}

function mapOfferDecision(apiData: Record<string, unknown> | null): {
  offerDecision: "approved" | "declined" | null;
  declinedReason: string;
  approvedOffer: Record<string, unknown>;
} {
  if (!apiData) {
    return { offerDecision: null, declinedReason: "", approvedOffer: {} };
  }

  const decisionRaw = String(
    apiData.decision ??
      apiData.offer_status ??
      apiData.offerStatus ??
      apiData.status ??
      apiData.offerDecision ??
      "",
  )
    .trim()
    .toLowerCase();
  let offerDecision: "approved" | "declined" | null =
    decisionRaw === "approved" || decisionRaw === "declined"
      ? decisionRaw
      : null;

  const funded = resolveOfferDecisionFundedAmount(apiData);
  const feesRaw = resolveOfferDecisionFeesRaw(apiData);
  const feesPct = resolveOfferFeesPercentForForm(
    funded,
    apiData.rate,
    feesRaw,
  );

  const repayPerPeriod =
    apiData.repayPerPeriod != null
      ? formatNumberUS(apiData.repayPerPeriod)
      : apiData.daysWeeks != null
        ? formatNumberUS(apiData.daysWeeks)
        : "";

  const approvedOffer: Record<string, unknown> = {
    offer: funded != null ? formatNumberUS(funded) : "",
    rate: apiData.rate != null ? String(apiData.rate) : "",
    term: apiData.term != null ? String(apiData.term) : "",
    fees: feesPct != null ? `${formatNumberUS(feesPct)}%` : "10%",
    frequency: apiData.frequency != null ? String(apiData.frequency) : "",
    daysWeeks: repayPerPeriod,
    repayPerPeriod,
    monthlyPayment:
      apiData.monthlyPayment != null
        ? formatNumberUS(apiData.monthlyPayment)
        : "",
    notes: String(apiData.notes ?? "").trim(),
    status: offerDecision ?? "",
    position: apiData.position != null ? String(apiData.position) : "",
    ourRemit:
      apiData.ourRemit != null ? formatNumberUS(apiData.ourRemit) : "",
  };

  // Preview Offer block is gated on isApproved — if we have a funded offer and
  // no decline reason, treat as approved so values match the Scrubbing tab.
  if (
    !offerDecision &&
    funded != null &&
    Number(funded) > 0 &&
    !String(
      apiData.declinedReason ?? apiData.declineReason ?? apiData.reason ?? "",
    ).trim()
  ) {
    offerDecision = "approved";
    approvedOffer.status = "approved";
  }

  return {
    offerDecision,
    declinedReason: String(
      apiData.declinedReason ?? apiData.declineReason ?? apiData.reason ?? "",
    ).trim(),
    approvedOffer,
  };
}

function mapBankTables(list: BankAnalysis[]): {
  bankTables: McaBankRow[][];
  bankAccountNumbers: string[];
} {
  const bankTables: McaBankRow[][] = [];
  const bankAccountNumbers: string[] = [];

  list.forEach((item) => {
    bankAccountNumbers.push(item.accountNumber || "");
    const rows = (item.rows ?? []).map((r) => {
      const totalCredits = parseNum(r.totalCredit) || 0;
      const loan = parseNum(r.loanTransfer) || 0;
      const other = parseNum(r.other) || 0;
      // The preview's "Transfers & other deductions" column renders `transfer`,
      // and the Scrubbing tab labels the `deposit` field with that same heading.
      // Mapping deposit into `deposite` left the column permanently "-" while
      // still subtracting the amount from Net Credit: the figure was deducted
      // but never shown. Feed it to `transfer` instead and zero `deposite`, so
      // the value appears and Net Credit is unchanged (each subtracted once).
      const transfer = parseNum(r.deposit) || 0;
      const deposite = 0;
      const netCredit = totalCredits - loan - transfer - deposite - other;
      const storedAvg = parseNum(r.avgDailyBlc);
      const autoAvg =
        Number.isFinite(storedAvg) && storedAvg > 0
          ? storedAvg
          : netCredit > 0
            ? netCredit / 30
            : 0;
      return {
        month: r.monthLabel || "-",
        totalCredits,
        loan,
        transfer,
        deposite,
        other,
        netCredit,
        nsfNegDays: parseNum(r.nsfNegDays) || 0,
        lowNegDays: parseNum(r.lowBlcDays) || 0,
        averageDailyBalance: autoAvg || 0,
      };
    });
    // Preview / Copy / PDFs skip a month with nothing above 0 (e.g. an
    // empty MTD). Position-funded months are added back by addPositionMonthRows.
    bankTables.push(
      rows.filter((r) =>
        [
          r.totalCredits,
          r.loan,
          r.transfer,
          r.other,
          r.nsfNegDays,
          r.lowNegDays,
          r.averageDailyBalance,
        ].some((v) => v > 0),
      ),
    );
  });

  return { bankTables, bankAccountNumbers };
}

function mapPositions(list: Position[]): McaPosition[] {
  return list
    .map((p) => {
      const allocatedRaw = Number((p as any).allocatedBankAnalysisId);
      const allocatedBankAnalysisId =
        Number.isInteger(allocatedRaw) && allocatedRaw > 0
          ? allocatedRaw
          : undefined;
      return {
        lender: String(p.funder || ""),
        status: String(p.status || (p.activeStatus ? "ACTIVE" : "")).trim(),
        frequency: String(p.frequency || ""),
        amountFunded: parseNum(p.fundedAmount) || 0,
        installment: parseNum(p.ach) || 0,
        monthlyMcaPmts: parseNum(p.monthlyMcaPmts) || 0,
        mcaRemit: parseNum(p.mcaRemit ?? p.percentOfGross) || 0,
        mcaPercentPaid: parseNum(p.mcaPercentPaid) || 0,
        startingDate: p.fundingDate ? String(p.fundingDate) : "",
        dateOfLastPymt: p.lastPaymentDate ? String(p.lastPaymentDate) : "",
        loanAmount: parseNum(p.loanAmount) || 0,
        totalRepayments: parseNum(p.paybackAmount) || 0,
        paymentTerm: parseNum(p.paymentTerm) || 0,
        mcaEstBalance: parseNum(p.mcaEstBalance) || 0,
        pmtsLeft: parseNum(p.pmtsLeft) || 0,
        allocatedBankAnalysisId,
      };
    })
    .filter(
      (row) =>
        row.lender ||
        row.amountFunded > 0 ||
        row.installment > 0 ||
        row.monthlyMcaPmts > 0 ||
        row.mcaRemit > 0 ||
        row.status,
    );
}

/**
 * Same allocation shape WouldMe / BankMonthlyBar expect:
 * `{ [bankIndex]: { [monthLabel]: amount | amount[] } }`
 */
function buildLoanTransferAllocated(
  bankTables: McaBankRow[][],
  positions: McaPosition[],
): LoanTransferAllocated {
  const result: LoanTransferAllocated = {};
  const bankCount = bankTables.length;
  if (!bankCount || !positions.length) return result;

  const labelsByBankYm = bankTables.map((table) => {
    const map = new Map<string, string[]>();
    table.forEach((row) => {
      const label = String(row.month || "").trim();
      const ym = monthLabelToYyyyMm(label);
      if (!label || !ym) return;
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(label);
    });
    return map;
  });

  const push = (bankIndex: number, label: string, amount: number) => {
    if (!result[bankIndex]) result[bankIndex] = {};
    const prev = result[bankIndex][label];
    if (prev == null) result[bankIndex][label] = amount;
    else if (Array.isArray(prev)) result[bankIndex][label] = [...prev, amount];
    else result[bankIndex][label] = [prev, amount];
  };

  positions.forEach((p) => {
    const amount = p.amountFunded;
    if (!(amount > 0)) return;
    const ym = dateToYyyyMm(p.startingDate);
    if (!ym) return;

    let bankIndex = 0;
    if (bankCount > 1) {
      const idx = Number(p.allocatedBankAnalysisId);
      if (!Number.isInteger(idx) || idx < 1 || idx > bankCount) return;
      bankIndex = idx - 1;
    }

    const labels = labelsByBankYm[bankIndex]?.get(ym) || [];
    const label =
      labels.find((l) => !isMtdMonthLabel(l)) || labels[0] || "";
    if (!label) return;
    push(bankIndex, label, amount);
  });

  return result;
}

function allocatedExtraForRow(
  alloc: LoanTransferAllocated | null,
  bankIndex: number,
  monthLabel: string,
): number {
  if (!alloc) return 0;
  const perBank = alloc[bankIndex];
  if (!perBank) return 0;
  const label = String(monthLabel || "").trim();
  const raw = perBank[label];
  if (raw == null) return 0;
  if (Array.isArray(raw)) return raw.reduce((s, n) => s + (Number(n) || 0), 0);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** Aggregate per-month totals across all banks (allocation-aware net credit). */
function computeBankTotals(
  bankTables: McaBankRow[][],
  alloc: LoanTransferAllocated | null = null,
): {
  bankTotalRows: McaBankRow[];
  bankTotalAverages: Record<string, number>;
} {
  const byMonth = new Map<string, McaBankRow>();

  bankTables.forEach((table, bankIndex) => {
    table.forEach((row) => {
      const key = String(row.month || "").trim();
      if (!key) return;
      const extraLoan = allocatedExtraForRow(alloc, bankIndex, key);
      const displayLoan = (row.loan || 0) > 0 ? row.loan || 0 : extraLoan;
      // Match WouldMe privateRole=false: use stored loan if > 0 else allocation
      const effectiveLoan =
        (row.loan || 0) > 0 ? row.loan || 0 : extraLoan > 0 ? extraLoan : 0;
      const netCredit =
        (row.totalCredits || 0) -
        (effectiveLoan +
          (row.transfer || 0) +
          (row.deposite || 0) +
          (row.other || 0));

      const adjusted: McaBankRow = {
        ...row,
        loan: displayLoan || row.loan || 0,
        netCredit,
      };

      const existing = byMonth.get(key);
      if (!existing) {
        byMonth.set(key, { ...adjusted });
        return;
      }
      existing.totalCredits += adjusted.totalCredits || 0;
      existing.loan += adjusted.loan || 0;
      existing.transfer += adjusted.transfer || 0;
      existing.deposite += adjusted.deposite || 0;
      existing.other += adjusted.other || 0;
      existing.netCredit += adjusted.netCredit || 0;
      existing.nsfNegDays += adjusted.nsfNegDays || 0;
      existing.lowNegDays += adjusted.lowNegDays || 0;
      existing.averageDailyBalance += adjusted.averageDailyBalance || 0;
    });
  });

  const bankTotalRows = Array.from(byMonth.values());
  const nonMtd = bankTotalRows.filter((r) => !isMtdMonthLabel(r.month));

  const avg = (field: keyof McaBankRow) => {
    if (!nonMtd.length) return NaN;
    const sum = nonMtd.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    return sum / nonMtd.length;
  };

  return {
    bankTotalRows,
    bankTotalAverages: {
      netCredit: avg("netCredit"),
      totalCredits: avg("totalCredits"),
      loan: avg("loan"),
      transfer: avg("transfer"),
      deposite: avg("deposite"),
      other: avg("other"),
      averageDailyBalance: avg("averageDailyBalance"),
      nsfNegDays: avg("nsfNegDays"),
      lowNegDays: avg("lowNegDays"),
    },
  };
}

export default function ScrubbingPreviewModal({
  open,
  onOpenChange,
  applicationId,
  captureMode = false,
  onCaptureReady,
}: ScrubbingPreviewModalProps) {
  const applicationData = useSelector(
    (state: RootState) => state.applicationDetail.data,
  ) as Application | null;
  const loginUser = useSelector((state: RootState) => state.login.data?.user);

  const [loading, setLoading] = useState(false);
  const [offerDecision, setOfferDecision] = useState<
    "approved" | "declined" | null
  >(null);
  const [declinedReason, setDeclinedReason] = useState("");
  const [approvedOffer, setApprovedOffer] = useState<Record<string, unknown>>(
    {},
  );
  const [bankTables, setBankTables] = useState<McaBankRow[][]>([]);
  const [bankAccountNumbers, setBankAccountNumbers] = useState<string[]>([]);
  const [positions, setPositions] = useState<McaPosition[]>([]);
  /** Additional Info is stored as a prefixed note, the same as the editor reads. */
  const [additionalInfo, setAdditionalInfo] = useState<AdditionalInfo | null>(null);
  const [bankTotalRows, setBankTotalRows] = useState<McaBankRow[]>([]);
  const [bankTotalAverages, setBankTotalAverages] = useState<
    Record<string, number>
  >({});
  const [loanTransferAllocatedByBankAndMonth, setLoanTransferAllocated] =
    useState<LoanTransferAllocated | null>(null);

  const appKey = useMemo(() => {
    // Prefer Mongo _id for bank/position/offer GETs (same as live tab loaders).
    // Numeric route params (e.g. 759) are accepted by some endpoints but can
    // intermittently return empty / partial payloads.
    const fromAppUuid =
      (applicationData as any)?._id ?? (applicationData as any)?.id ?? "";
    if (fromAppUuid != null && String(fromAppUuid).trim() !== "") {
      return String(fromAppUuid).trim();
    }
    const fromProp =
      applicationId != null && String(applicationId).trim() !== ""
        ? String(applicationId).trim()
        : "";
    if (fromProp) return fromProp;
    const fromAppNum =
      (applicationData as any)?.applicationId != null
        ? String((applicationData as any).applicationId).trim()
        : "";
    return fromAppNum;
  }, [applicationId, applicationData]);

  const clientName = useMemo(() => {
    if (!applicationData) return "Financial Analysis";
    return (
      getApplicationBusinessDisplayName(applicationData) ||
      getClientNameFromApplicationClient(applicationData.client) ||
      "Financial Analysis"
    );
  }, [applicationData]);

  const signedBy = useMemo(() => {
    const first = (loginUser as any)?.firstName || "";
    const last = (loginUser as any)?.lastName || "";
    const name = `${first} ${last}`.trim();
    return name || (loginUser as any)?.email || "";
  }, [loginUser]);

  const displayDate = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const form = useMemo(
    () => ({
      clientName,
      date: displayDate,
    }),
    [clientName, displayDate],
  );

  const createdBy = useMemo(
    () => (signedBy ? { fullName: signedBy } : null),
    [signedBy],
  );

  useEffect(() => {
    if (!open || !appKey) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [offerRes, banksRes, positionsRes, notesRes] = await Promise.all([
          axiosGet("/offer-decisions", { params: { application: appKey } }),
          axiosGet(
            `/bank-analysis?${new URLSearchParams({ application: appKey }).toString()}`,
          ),
          axiosGet(
            `/positions?${new URLSearchParams({ application: appKey }).toString()}`,
          ),
          axiosGet(
            `/notes?${new URLSearchParams({ application: appKey }).toString()}`,
          ),
        ]);
        if (cancelled) return;

        const mappedOffer = mapOfferDecision(unwrapRecord(offerRes));
        setOfferDecision(mappedOffer.offerDecision);
        setDeclinedReason(mappedOffer.declinedReason);
        setApprovedOffer(mappedOffer.approvedOffer);

        const { bankTables: tables, bankAccountNumbers: accounts } =
          mapBankTables(unwrapList<BankAnalysis>(banksRes));
        setBankTables(tables);
        setBankAccountNumbers(accounts);

        const mappedPositions = mapPositions(
          unwrapList<Position>(positionsRes),
        );
        setPositions(mappedPositions);

        // Additional Info rides along as a note with a known prefix; the most
        // recent one wins, matching how the editor loads it.
        const noteList = unwrapList<{ content?: string }>(notesRes);
        const infoNote = [...noteList]
          .reverse()
          .find((n) => isAdditionalInfoNoteContent(n?.content));
        setAdditionalInfo(
          infoNote ? decodeAdditionalInfoNote(infoNote.content) : null,
        );

        const alloc = buildLoanTransferAllocated(tables, mappedPositions);
        setLoanTransferAllocated(
          Object.keys(alloc).length ? alloc : null,
        );

        const totals = computeBankTotals(tables, alloc);
        setBankTotalRows(totals.bankTotalRows);
        setBankTotalAverages(totals.bankTotalAverages);
      } catch (err) {
        console.error("Failed to load scrubbing preview:", err);
        if (!cancelled) {
          if (captureMode) onCaptureReady?.(null, false);
          else toast.error("Failed to load scrubbing preview.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, appKey]);

  if (!open) return null;

  if (loading) {
    if (captureMode) return null;
    return createPortal(
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
        style={{ zIndex: 200000 }}
      >
        <div className="rounded-xl bg-white px-8 py-6 text-sm text-slate-600 shadow-xl">
          Loading preview…
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <WouldMePreviewModal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      form={form}
      offerDecision={offerDecision}
      declinedReason={declinedReason}
      approvedOffer={approvedOffer}
      bankTables={bankTables}
      bankAccountNumbers={bankAccountNumbers}
      bankTotalRows={bankTotalRows}
      bankTotalAverages={bankTotalAverages}
      positions={positions}
      loanTransferAllocatedByBankAndMonth={loanTransferAllocatedByBankAndMonth}
      eligibility={{}}
      mcaOffer={{}}
      currentNote={null}
      additionalInfo={additionalInfo}
      notesFromApi=""
      variant="wd"
      createdBy={createdBy}
      updatedBy={createdBy}
      captureMode={captureMode}
      onCaptureReady={
        captureMode
          ? (
              element: HTMLElement | null,
              buildEmailHtml?: () => Promise<string | null>,
            ) =>
              onCaptureReady?.(
                element,
                positions.length > 0 || bankTables.length > 0,
                {
                  hasPositiveValue:
                    hasAnyPositiveNumber(bankTables) ||
                    hasAnyPositiveNumber(positions) ||
                    hasAnyPositiveNumber(approvedOffer),
                  buildEmailHtml: buildEmailHtml ?? (async () => null),
                },
              )
          : undefined
      }
    />
  );
}
