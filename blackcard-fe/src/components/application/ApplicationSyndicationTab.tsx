import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { axiosDelete, axiosGet, axiosPost } from '@/redux/axios';
import type { RootState } from '@/redux/store';
import AddUserModal from '@/pages/settings/AddUserModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'react-toastify';
import { CircleDollarSign, Loader2, Trash2, UserPlus } from 'lucide-react';
import { cn, formatNumberUSForInput, parseNumberUS } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Syndicator = {
  id: number;
  firstName: string;
  lastName?: string | null;
  email: string;
};

type ApplicationSyndication = {
  id: number;
  syndicatorId: number;
  syndicatorName?: string | null;
  fundedAmount?: number | string;
  paybackAmount?: number | string;
  termLength?: number | string;
  amountSyndicated: number | string;
  percentageSyndicated: number | string;
  paybackAmountSyndicated: number | string;
  collectedAmount: number | string;
  remainingAmount: number | string;
  commissionAmount?: number | string;
  managementFeeToDate?: number | string;
  merchantName?: string | null;
};

export type SyndicationDealHints = {
  fundedAmount?: number;
  paybackAmount?: number;
  termLength?: number;
  merchantName?: string;
};

/** Seed deal fields from a GET-application style payload (e.g. Redux `applicationDetail.data`). */
export function buildSyndicationDealHints(
  applicationData: unknown,
): SyndicationDealHints | undefined {
  if (!applicationData || typeof applicationData !== 'object') return undefined;
  const app = applicationData as Record<string, unknown>;
  const termsRaw = app.termsOffers;
  const t0 =
    Array.isArray(termsRaw) && termsRaw[0] && typeof termsRaw[0] === 'object'
      ? (termsRaw[0] as Record<string, unknown>)
      : null;
  const approved = t0 != null ? Number(t0.approvedAmount) : NaN;
  const payback = t0 != null ? Number(t0.paybackAmount) : NaN;
  const term = t0 != null ? Number(t0.termLength) : NaN;

  let merchant = '';
  const client = app.client;
  if (client && typeof client === 'object') {
    const c = client as Record<string, unknown>;
    const business = c.business as Record<string, unknown> | undefined;
    const bp = c.businessProfile as Record<string, unknown> | undefined;
    merchant = String(business?.name ?? bp?.businessName ?? '');
  }

  const loan = Number(app.loanAmount);
  const hints: SyndicationDealHints = {};

  if (Number.isFinite(approved) && approved > 0) hints.fundedAmount = approved;
  else if (Number.isFinite(loan) && loan > 0) hints.fundedAmount = loan;

  if (Number.isFinite(payback) && payback > 0) hints.paybackAmount = payback;
  if (Number.isFinite(term) && term > 0) hints.termLength = term;
  if (merchant.trim()) hints.merchantName = merchant.trim();

  return Object.keys(hints).length ? hints : undefined;
}

type DealContext = {
  fundedAmount: string;
  paybackAmount: string;
  termLength: string;
  merchantName: string;
};

type OfferDecisionLike = Record<string, unknown> | null;

const toFinitePositive = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '');
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const toLoosePositiveInt = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d+)/.exec(s);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

type DraftRow = {
  syndicatorId: number;
  syndicatorName: string;
  /** Funded amount syndicated (advance from this syndicator) */
  fundedSyndicated: string;
  percentageSyndicated: string;
  commissionAmount: string;
  /** From syndicator admin settings (`feePercentage`) */
  syndicatorFeePercentage: number;
  /** From syndicator admin settings — fee basis stored as `syndicationCalculationLogic` on save */
  syndicatorFeeBasis: string;
};

function pickSyndicatorSetting(raw: Record<string, unknown>): Record<string, unknown> | null {
  const ss =
    raw.SyndicatorSetting ??
    raw.syndicatorSetting ??
    (raw as { syndicator_setting?: unknown }).syndicator_setting;
  return ss && typeof ss === 'object' && !Array.isArray(ss) ? (ss as Record<string, unknown>) : null;
}

const FEE_BASIS_LABELS: Record<string, string> = {
  PRINCIPAL_SYNDICATED_AMOUNT: 'Principal syndicated amount',
  DISBURSED_SYNDICATED_AMOUNT: 'Disbursed syndicated amount',
};

const toCurrency = (value: unknown) => {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

function syndicatorFullName(s: Syndicator) {
  return `${s.firstName || ''} ${s.lastName || ''}`.trim();
}

function emptyDeal(): DealContext {
  return {
    fundedAmount: '',
    paybackAmount: '',
    termLength: '0',
    merchantName: '',
  };
}

function buildDealFromApplicationPayload(raw: unknown): Partial<DealContext> {
  if (!raw || typeof raw !== 'object') return {};
  const app = raw as Record<string, unknown>;
  const termsRaw = app.termsOffers;
  const terms = Array.isArray(termsRaw)
    ? termsRaw.filter((t) => t && typeof t === 'object') as Record<string, unknown>[]
    : [];
  const latest = terms.sort((a, b) => {
    const ta = Date.parse(String(a.createdAt ?? ''));
    const tb = Date.parse(String(b.createdAt ?? ''));
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    const ida = Number(a.termsOfferId ?? 0);
    const idb = Number(b.termsOfferId ?? 0);
    return idb - ida;
  })[0] ?? null;

  const approved = latest != null ? Number(latest.approvedAmount) : NaN;
  const paybackDirect = latest != null ? Number(latest.paybackAmount) : NaN;
  const repaymentDirect = latest != null ? Number(latest.totalRepayment ?? latest.totalRepayments) : NaN;
  const paymentAmount = latest != null ? Number(latest.paymentAmount) : NaN;
  const numberOfPayments = latest != null ? Number(latest.numberOfPayments) : NaN;
  const paybackDerived =
    Number.isFinite(paymentAmount) && paymentAmount > 0 && Number.isFinite(numberOfPayments) && numberOfPayments > 0
      ? paymentAmount * numberOfPayments
      : NaN;
  const payback = Number.isFinite(paybackDirect) && paybackDirect > 0
    ? paybackDirect
    : Number.isFinite(repaymentDirect) && repaymentDirect > 0
      ? repaymentDirect
      : paybackDerived;

  const term = latest != null ? Number(latest.termLength ?? latest.numberOfPayments) : NaN;
  const loan = Number(app.loanAmount);

  let merchantName = '';
  const client = app.client;
  if (client && typeof client === 'object') {
    const c = client as Record<string, unknown>;
    merchantName = String(c.businessName ?? c.name ?? '').trim();
  }

  const out: Partial<DealContext> = {};
  if (Number.isFinite(approved) && approved > 0) out.fundedAmount = String(approved);
  else if (Number.isFinite(loan) && loan > 0) out.fundedAmount = String(loan);
  if (Number.isFinite(payback) && payback > 0) out.paybackAmount = String(payback);
  if (Number.isFinite(term) && term > 0) out.termLength = String(term);
  if (merchantName) out.merchantName = merchantName;
  return out;
}

function buildDealFromDealSources(
  appPayload: unknown,
  latestTerms: unknown,
  offerDecision: OfferDecisionLike,
): Partial<DealContext> {
  const appBased = buildDealFromApplicationPayload({
    ...(appPayload && typeof appPayload === 'object' ? (appPayload as Record<string, unknown>) : {}),
    termsOffers: latestTerms ? [latestTerms] : undefined,
  });

  const od = offerDecision ?? {};
  const offerFunded = toFinitePositive((od as Record<string, unknown>).offer);
  const offerRate = toFinitePositive((od as Record<string, unknown>).rate);
  const offerTerm = toLoosePositiveInt(
    (od as Record<string, unknown>).term ?? (od as Record<string, unknown>).termLength,
  );
  const offerPeriodic = toFinitePositive((od as Record<string, unknown>).repayPerPeriod);
  const offerPaybackExplicit =
    toFinitePositive((od as Record<string, unknown>).paybackAmount) ??
    toFinitePositive((od as Record<string, unknown>).totalRepayment) ??
    toFinitePositive((od as Record<string, unknown>).totalRepayments);
  const appFunded = toFinitePositive(appBased.fundedAmount);
  const appPayback = toFinitePositive(appBased.paybackAmount);
  const fundedForRate = offerFunded ?? appFunded;
  const offerPaybackDerived =
    fundedForRate != null && offerRate != null
      ? Number((fundedForRate * offerRate).toFixed(3))
      : offerPeriodic != null && offerTerm != null
        ? Number((offerPeriodic * offerTerm).toFixed(3))
        : null;
  const hasOfferMathInputs =
    (offerPeriodic != null && offerTerm != null) || (offerFunded != null && offerRate != null);
  // Prefer explicit offer payback, then offer-decision math (e.g. 12000 * 1.499 = 17988), then terms/app.
  const offerPayback = offerPaybackExplicit ?? (hasOfferMathInputs ? offerPaybackDerived : null) ?? appPayback;

  return {
    fundedAmount: offerFunded != null ? String(offerFunded) : appBased.fundedAmount,
    paybackAmount: offerPayback != null ? String(offerPayback) : appBased.paybackAmount,
    termLength:
      offerTerm != null
        ? String(offerTerm)
        : toLoosePositiveInt(appBased.termLength) != null
          ? String(toLoosePositiveInt(appBased.termLength))
          : appBased.termLength,
    merchantName: appBased.merchantName,
  };
}

/** Parse finite non-negative number or null */
function parseMoney(raw: string): number | null {
  const n = parseFloat(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Syndication % across the deal must total 100% (existing rows + this batch). */
const PCT_TOTAL_TOLERANCE = 0.02;

function isSyndicationPctTotalValid(total: number): boolean {
  return Math.abs(total - 100) <= PCT_TOTAL_TOLERANCE;
}

/** Payback share preview: scales with advance vs full deal (same ratio as Fidi-style proportional). */
function computePaybackSyndicated(
  dealFunded: number | null,
  dealPayback: number | null,
  fundedSyndicated: number | null,
  pct: number | null,
): number {
  if (fundedSyndicated == null || fundedSyndicated < 0) return 0;
  if (dealPayback == null || dealPayback <= 0) return 0;
  if (dealFunded != null && dealFunded > 0) {
    return Number(((dealPayback / dealFunded) * fundedSyndicated).toFixed(2));
  }
  if (pct != null && pct > 0) return Number(((dealPayback * pct) / 100).toFixed(2));
  return 0;
}

function computeDraftManagementFee(fundedSyndicated: number | null, feePercentage: number): number {
  if (fundedSyndicated == null || fundedSyndicated <= 0) return 0;
  const p = Number(feePercentage);
  if (!Number.isFinite(p) || p < 0) return 0;
  return Number(((p / 100) * fundedSyndicated).toFixed(2));
}

/** Keep % and funded syndicated in sync whenever one side is edited. */
function syncPctAndFunded(dealFunded: number | null, row: DraftRow, source: 'funded' | 'pct'): DraftRow {
  const f = parseMoney(row.fundedSyndicated);
  const p = parseMoney(row.percentageSyndicated);
  let nextFundedStr = row.fundedSyndicated;
  let nextPctStr = row.percentageSyndicated;

  if (dealFunded != null && dealFunded > 0) {
    if (source === 'pct') {
      if (p != null) {
        nextFundedStr = String(Number(((dealFunded * p) / 100).toFixed(2)));
      }
    } else {
      if (f != null) {
        nextPctStr = String(Number(((100 * f) / dealFunded).toFixed(4)));
      }
    }
  }
  return {
    ...row,
    fundedSyndicated: nextFundedStr,
    percentageSyndicated: nextPctStr,
  };
}

export default function ApplicationSyndicationTab({
  applicationId,
  dealHints,
}: {
  applicationId?: string;
  dealHints?: SyndicationDealHints;
}) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [syndicators, setSyndicators] = useState<Syndicator[]>([]);
  const [rows, setRows] = useState<ApplicationSyndication[]>([]);
  const [tableSearch, setTableSearch] = useState('');

  const [deal, setDeal] = useState<DealContext>(emptyDeal);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  /** Remount Select after pick so placeholder resets */
  const [addSyndicatorSelectKey, setAddSyndicatorSelectKey] = useState(0);
  const [pickingSyndicator, setPickingSyndicator] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteSyndicatorOpen, setInviteSyndicatorOpen] = useState(false);
  const [syndicatorPickerOpen, setSyndicatorPickerOpen] = useState(false);
  const [syndicatorPickerQuery, setSyndicatorPickerQuery] = useState('');
  const syndicatorSearchInputRef = useRef<HTMLInputElement>(null);

  const isAdmin =
    useSelector((s: RootState) => {
      const r = s.login?.data?.user?.role;
      return r === 'ADMIN' || r === 'SUPER_ADMIN';
    }) ||
    (typeof window !== 'undefined' &&
      (localStorage.getItem('role') === 'ADMIN' ||
        localStorage.getItem('role') === 'SUPER_ADMIN'));

  const mappedIds = useMemo(
    () => new Set(rows.map((r) => r.syndicatorId).filter((id) => id != null)),
    [rows],
  );

  const draftIds = useMemo(() => new Set(drafts.map((d) => d.syndicatorId)), [drafts]);

  const selectable = useMemo(
    () =>
      syndicators.filter(
        (s) => !mappedIds.has(s.id) && !draftIds.has(s.id),
      ),
    [syndicators, mappedIds, draftIds],

  );

  const selectableFiltered = useMemo(() => {
    const q = syndicatorPickerQuery.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter((s) => {
      const name = syndicatorFullName(s).toLowerCase();
      const email = String(s.email ?? '').toLowerCase();
      const id = String(s.id);
      return name.includes(q) || email.includes(q) || id.includes(q);
    });
  }, [selectable, syndicatorPickerQuery]);

  const dealFundedN = parseMoney(deal.fundedAmount);
  const dealPaybackN = parseMoney(deal.paybackAmount);

  const alreadyAllocated = useMemo(
    () => rows.reduce((a, r) => a + Number(r.amountSyndicated ?? 0), 0),
    [rows],

  );

  const batchAllocated = useMemo(
    () =>
      drafts.reduce((a, d) => {
        const v = parseMoney(d.fundedSyndicated);
        return a + (v ?? 0);
      }, 0),
    [drafts],

  );

  const existingPctSum = useMemo(
    () =>
      rows.reduce((a, r) => {
        const n = Number(r.percentageSyndicated ?? 0);
        return a + (Number.isFinite(n) ? n : 0);
      }, 0),
    [rows],
  );

  const draftPctSum = useMemo(
    () =>
      drafts.reduce((sum, d) => {
        const p = parseMoney(d.percentageSyndicated);
        return sum + (p ?? 0);
      }, 0),
    [drafts],
  );

  const combinedSyndicationPct = existingPctSum + draftPctSum;

  const syndicationPctOk = useMemo(
    () => isSyndicationPctTotalValid(combinedSyndicationPct),
    [combinedSyndicationPct],
  );

  const totals = useMemo(() => {
    return {
      collected: rows.reduce((a, r) => a + Number(r.collectedAmount ?? 0), 0),
      remaining: rows.reduce((a, r) => a + Number(r.remainingAmount ?? 0), 0),
      commission: rows.reduce((a, r) => a + Number(r.commissionAmount ?? 0), 0),
      managementFee: rows.reduce((a, r) => a + Number(r.managementFeeToDate ?? 0), 0),
    };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const name = (r.syndicatorName ?? '').toLowerCase();
      const blob = [name, String(r.syndicatorId), String(r.amountSyndicated ?? '')].join(' ');
      return blob.includes(q);
    });
  }, [rows, tableSearch]);

  const canSubmit = useMemo(() => {
    if (!applicationId || drafts.length === 0) return false;
    if (dealFundedN == null || dealFundedN <= 0) return false;
    if (!syndicationPctOk) return false;
    return drafts.every((d) => {
      const f = parseMoney(d.fundedSyndicated);
      const p = parseMoney(d.percentageSyndicated);
      return f != null && f > 0 && p != null && p > 0;
    });
  }, [applicationId, drafts, dealFundedN, syndicationPctOk]);

  const submitDisabledReason = useMemo((): string | null => {
    if (!applicationId) return 'Application is not available.';
    if (drafts.length === 0) return 'Add at least one syndicator.';
    if (dealFundedN == null || dealFundedN <= 0) return 'Deal funded amount is missing or invalid.';
    if (!syndicationPctOk) return 'Syndication shares must total 100%.';
    const incomplete = drafts.some((d) => {
      const f = parseMoney(d.fundedSyndicated);
      const p = parseMoney(d.percentageSyndicated);
      return f == null || f <= 0 || p == null || p <= 0;
    });
    if (incomplete) return 'Enter funded syndicated amount and percentage for each row.';
    return null;
  }, [applicationId, drafts, dealFundedN, syndicationPctOk]);

  const loadData = useCallback(async () => {
    if (!applicationId) return;
    setLoading(true);
    try {
      const [syndicatorRes, detailsRes] = await Promise.all([
        axiosGet('/syndicators'),
        axiosGet(`/application-syndicators/${applicationId}`),
      ]);
      setSyndicators(syndicatorRes?.data?.data ?? []);
      setRows(detailsRes?.data?.data ?? []);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to load syndication details');
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  const ensureDealContext = useCallback(async () => {
    if (!applicationId) return;
    try {
      const [appRes, termsRes, offerDecisionRes] = await Promise.all([
        axiosGet(`/applications/${applicationId}`),
        axiosGet(`/terms-offers?application=${applicationId}`),
        axiosGet(`/offer-decisions?application=${applicationId}`),
      ]);
      const appPayload = (appRes?.data?.data ?? appRes?.data) as Record<string, unknown>;
      const latestTerms = Array.isArray(termsRes?.data?.data) ? termsRes.data.data[0] : null;
      const offerDecision = (offerDecisionRes?.data?.data ?? null) as OfferDecisionLike;
      const fromApi = buildDealFromDealSources(appPayload, latestTerms, offerDecision);
      if (Object.keys(fromApi).length === 0) return;
      setDeal((prev) => ({
        // Prefer latest resolved payback from API sources (offer-decision/terms) over seeded modal values.
        fundedAmount: fromApi.fundedAmount || prev.fundedAmount || '',
        paybackAmount: fromApi.paybackAmount || prev.paybackAmount || '',
        termLength: fromApi.termLength || (prev.termLength !== '0' ? prev.termLength : '0'),
        merchantName: prev.merchantName || fromApi.merchantName || '',
      }));
    } catch {
      // Keep existing deal defaults when terms endpoint is unavailable.
    }
  }, [applicationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!open) return;
    void ensureDealContext();
  }, [open, ensureDealContext]);

  /** If deal funded changes, keep each row’s % and advance in sync. */
  useEffect(() => {
    if (!open || drafts.length === 0) return;
    setDrafts((prev) => prev.map((d) => syncPctAndFunded(dealFundedN, d, 'pct')));
  }, [open, deal.fundedAmount]);

  useEffect(() => {
    if (!open) {
      setSyndicatorPickerOpen(false);
      setSyndicatorPickerQuery('');
    }
  }, [open]);

  /**
   * Radix Select focuses the listbox/first item after content is positioned (`isPositioned`), often in
   * a later commit — a single synchronous focus loses to that. Retry a few times across tasks/frames.
   */
  useEffect(() => {
    if (!syndicatorPickerOpen || selectable.length === 0) return;
    const focusSearch = () =>
      syndicatorSearchInputRef.current?.focus({ preventScroll: true });
    const timeouts = [0, 32, 64].map((ms) =>
      window.setTimeout(focusSearch, ms),
    );
    return () => timeouts.forEach((id) => window.clearTimeout(id));
  }, [syndicatorPickerOpen, selectable.length]);

  const seedModal = useCallback(() => {
    const t = rows[0];
    const fh = dealHints?.fundedAmount;
    const ph = dealHints?.paybackAmount;
    const th = dealHints?.termLength;
    const mh = dealHints?.merchantName;

    const fr = t != null ? Number(t.fundedAmount ?? t.amountSyndicated) : NaN;
    // Do not seed deal payback from existing syndication rows (can be stale/historic).
    const pr = NaN;
    const tr = t != null ? Number(t.termLength) : NaN;
    const mr = t?.merchantName != null ? String(t.merchantName) : '';

    const funded =
      fh != null && Number.isFinite(fh) && fh > 0 ? fh : Number.isFinite(fr) && fr > 0 ? fr : NaN;
    const payback = ph != null && Number.isFinite(ph) && ph > 0 ? ph : Number.isFinite(pr) && pr > 0 ? pr : NaN;
    const term =
      th != null && Number.isFinite(th) && th > 0 ? th : Number.isFinite(tr) && tr > 0 ? tr : NaN;

    setDeal({
      fundedAmount: Number.isFinite(funded) ? String(funded) : '',
      paybackAmount: Number.isFinite(payback) ? String(payback) : '',
      termLength: Number.isFinite(term) ? String(term) : '0',
      merchantName: (mh && mh.trim()) || mr || '',
    });
    setDrafts([]);
    setAddSyndicatorSelectKey((k) => k + 1);
    setSyndicatorPickerOpen(false);
    setSyndicatorPickerQuery('');
  }, [rows, dealHints]);

  const appendSyndicatorToDrafts = useCallback(async (s: Syndicator) => {
    setPickingSyndicator(true);
    try {
      let feePct = 0;
      let feeBasis = 'PRINCIPAL_SYNDICATED_AMOUNT';
      try {
        const res = await axiosGet(`/syndicators/${s.id}?extended=1`);
        const raw = res?.data?.data;
        const dataObj =
          typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
        const ss = pickSyndicatorSetting(dataObj);
        const fp = Number(ss?.feePercentage);
        if (Number.isFinite(fp) && fp >= 0) feePct = fp;
        const cl = ss?.calculationLogic;
        if (
          typeof cl === 'string' &&
          cl.trim() &&
          (cl === 'PRINCIPAL_SYNDICATED_AMOUNT' || cl === 'DISBURSED_SYNDICATED_AMOUNT')
        ) {
          feeBasis = cl.trim();
        }
      } catch {
        /* keep defaults */
      }

      setDrafts((prev) => {
        if (prev.some((d) => d.syndicatorId === s.id)) return prev;
        return [
          ...prev,
          {
            syndicatorId: s.id,
            syndicatorName: syndicatorFullName(s) || s.email,
            fundedSyndicated: '',
            percentageSyndicated: '',
            commissionAmount: '0',
            syndicatorFeePercentage: feePct,
            syndicatorFeeBasis: feeBasis,
          },
        ];
      });
      setAddSyndicatorSelectKey((k) => k + 1);
    } finally {
      setPickingSyndicator(false);
    }
  }, []);

  const updateDraft = (id: number, patch: Partial<DraftRow>) => {
    setDrafts((prev) => prev.map((d) => (d.syndicatorId === id ? { ...d, ...patch } : d)));
  };

  const onFundedSyndicatedChange = (id: number, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.syndicatorId !== id) return d;
        const withVal = { ...d, fundedSyndicated: value };
        return syncPctAndFunded(dealFundedN, withVal, 'funded');
      }),
    );
  };

  const onPctChange = (id: number, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.syndicatorId !== id) return d;
        const withVal = { ...d, percentageSyndicated: value };
        return syncPctAndFunded(dealFundedN, withVal, 'pct');
      }),
    );
  };

  const handleBatchSave = async () => {
    if (!applicationId || !canSubmit) return;
    const totalPct =
      existingPctSum +
      drafts.reduce((sum, d) => sum + (parseMoney(d.percentageSyndicated) ?? 0), 0);
    if (!isSyndicationPctTotalValid(totalPct)) {
      toast.error('Syndication shares must total 100% for the deal.');
      return;
    }
    setSaving(true);
    let ok = 0;
    const errors: string[] = [];
    try {
      for (const d of drafts) {
        const f = parseMoney(d.fundedSyndicated)!;
        const p = parseMoney(d.percentageSyndicated)!;
        const pb = computePaybackSyndicated(dealFundedN, dealPaybackN, f!, p!);
        const mgmtComputed = computeDraftManagementFee(f, d.syndicatorFeePercentage);
        const meta = syndicators.find((x) => x.id === d.syndicatorId);
        try {
          await axiosPost(`/application-syndicators/${applicationId}`, {
            syndicatorId: d.syndicatorId,
            syndicatorName: d.syndicatorName || meta?.firstName,
            fundedAmount: deal.fundedAmount,
            paybackAmount: deal.paybackAmount,
            termLength: deal.termLength,
            amountSyndicated: String(f),
            paybackAmountSyndicated: String(pb),
            percentageSyndicated: String(p),
            commissionAmount: (() => {
              const n = parseNumberUS(d.commissionAmount);
              return String(Number.isFinite(n) ? n : 0);
            })(),
            managementFeeToDate: String(mgmtComputed),
            merchantName: deal.merchantName.trim() || undefined,
            syndicationCalculationLogic: d.syndicatorFeeBasis || 'PRINCIPAL_SYNDICATED_AMOUNT',
          });
          ok += 1;
        } catch (err: any) {
          errors.push(
            String(err?.response?.data?.message || `Failed for ${d.syndicatorName || d.syndicatorId}`),
          );
        }
      }
      if (ok > 0) {
        toast.success(
          ok === drafts.length
            ? `Saved ${ok} syndicator${ok === 1 ? '' : 's'}`
            : `Saved ${ok} of ${drafts.length}; see errors for the rest.`,
        );
      }
      errors.forEach((e) => toast.error(e));
      if (ok > 0) {
        setOpen(false);
        setDrafts([]);
        setDeal(emptyDeal());
        await loadData();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axiosDelete(`/application-syndicators/${id}`);
      toast.success('Syndicator participation removed');
      await loadData();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Failed to remove syndicator');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Collected amount</p>
              <p className="text-lg font-semibold">{toCurrency(totals.collected)}</p>
            </div>
            <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Remaining amount</p>
              <p className="text-lg font-semibold">{toCurrency(totals.remaining)}</p>
            </div>
            <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total commission</p>
              <p className="text-lg font-semibold">{toCurrency(totals.commission)}</p>
            </div>
            <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Total management fee</p>
              <p className="text-lg font-semibold">{toCurrency(totals.managementFee)}</p>
            </div>
            <CircleDollarSign className="h-8 w-8 text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          type="search"
          placeholder="Search syndications…"
          className="max-w-xs"
          value={tableSearch}
          onChange={(e) => setTableSearch(e.target.value)}
        />
        <Dialog
          open={open}
          onOpenChange={(next: boolean) => {
            setOpen(next);
            if (next) seedModal();
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" className="shrink-0 sm:ml-auto">
              Add Syndication
            </Button>
          </DialogTrigger>
          <DialogContent
            className={cn(
              'flex max-h-[92vh] w-[min(1400px,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] flex-col gap-0 p-0 sm:max-w-[min(1400px,calc(100vw-1.5rem))]',
            )}
          >
            <DialogHeader className="border-b border-border px-6 py-4 text-left">
              <div className="flex flex-wrap items-center gap-3">
                <DialogTitle className="text-xl font-semibold">Assign syndicator</DialogTitle>
                {deal.merchantName.trim() ? (
                  <span
                    className="inline-flex max-w-[min(100%,28rem)] items-center truncate rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground"
                    title={deal.merchantName.trim()}
                  >
                    {deal.merchantName.trim()}
                  </span>
                ) : null}
              </div>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="syndicator-add-select" className="text-sm font-medium">
                  Syndicator
                </Label>
                {loading ? (
                  <div
                    className="flex min-h-[3.5rem] items-center justify-center rounded-md border border-border bg-muted/30 px-3 py-6"
                    role="status"
                    aria-live="polite"
                  >
                    <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                    <span className="sr-only">Loading syndicators</span>
                  </div>
                ) : selectable.length === 0 ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
                    <p className="min-w-0 flex-1 rounded-md border border-dashed border-border bg-muted/20 px-3 py-2.5 text-sm text-muted-foreground">
                      All syndicators are already on this deal or added below. Remove a draft row
                      or finish saving to choose another.
                      {isAdmin ? (
                        <>
                          {' '}
                          Or use <span className="font-medium text-foreground">Add Syndicator</span> to create
                          a new syndicator user and profile.
                        </>
                      ) : (
                        <> Ask an admin to create a new syndicator if needed.</>
                      )}
                    </p>
                    {isAdmin && (
                      <Button
                        type="button"
                        className="gap-2 shrink-0 self-start bg-[image:var(--brand-gradient)] hover:opacity-90"
                        onClick={() => setInviteSyndicatorOpen(true)}
                      >
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Add Syndicator
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
                    <Select
                      key={`syndicator-add-${addSyndicatorSelectKey}`}
                      open={syndicatorPickerOpen}
                      onOpenChange={(next: boolean) => {
                        setSyndicatorPickerOpen(next);
                        if (!next) setSyndicatorPickerQuery('');
                      }}
                      disabled={pickingSyndicator}
                      onValueChange={(idStr: string) => {
                        void (async () => {
                          const id = Number(idStr);
                          if (!Number.isFinite(id)) return;
                          const s = syndicators.find((x) => x.id === id);
                          if (!s || mappedIds.has(id)) return;
                          await appendSyndicatorToDrafts(s);
                        })();
                      }}
                    >
                      <SelectTrigger
                        id="syndicator-add-select"
                        className="h-10 w-[min(100%,32rem)] min-w-[14rem] max-w-lg shrink-0"
                      >
                        <SelectValue placeholder="Select syndicator to add…" />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        className="max-h-[min(360px,var(--radix-select-content-available-height))] p-0"
                      >
                        <div
                          className="sticky top-0 z-10 -mx-1 border-b border-border bg-popover px-3 py-2"
                          onPointerDown={(e) => {
                            // preventDefault on the wrapper blocks the input from receiving focus; only
                            // use it for non-field clicks (keeps menu from stealing focus in edge cases).
                            const t = e.target as HTMLElement | null;
                            if (t?.closest?.('input, textarea, [contenteditable="true"]')) return;
                            e.preventDefault();
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <Input
                            ref={syndicatorSearchInputRef}
                            type="search"
                            autoComplete="off"
                            placeholder="Search syndicators…"
                            className="h-9"
                            value={syndicatorPickerQuery}
                            onChange={(e) => setSyndicatorPickerQuery(e.target.value)}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            disabled={selectable.length === 0}
                          />
                        </div>
                        {selectable.length === 0 ? (
                          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                            No syndicators available to add.
                          </p>
                        ) : selectableFiltered.length === 0 ? (
                          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                            No syndicators match your search.
                          </p>
                        ) : (
                          selectableFiltered.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              <span className="tabular-nums text-muted-foreground">{s.id}</span>
                              <span className="mx-2 text-muted-foreground">·</span>
                              <span>{syndicatorFullName(s) || s.email}</span>
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {isAdmin && (
                      <Button
                        type="button"
                        className="gap-2 shrink-0 bg-[image:var(--brand-gradient)] hover:opacity-90"
                        onClick={() => setInviteSyndicatorOpen(true)}
                        disabled={pickingSyndicator}
                      >
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Add Syndicator
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {pickingSyndicator ? (
                <div
                  className="flex min-h-[3rem] w-full items-center justify-center rounded-md border border-border bg-muted/30 py-6"
                  role="status"
                  aria-live="polite"
                  aria-busy={true}
                >
                  <Loader2 className="h-6 w-6 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                  <span className="sr-only">Loading syndicator settings</span>
                </div>
              ) : null}

              {drafts.length > 0 && (
                <div className="w-full overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="min-w-[52px] whitespace-nowrap">Id</TableHead>
                        <TableHead className="min-w-[140px] whitespace-nowrap">Syndicator name</TableHead>
                        <TableHead className="min-w-[100px] whitespace-nowrap">Funded amount</TableHead>
                        <TableHead className="min-w-[100px] whitespace-nowrap">Payback amount</TableHead>
                        <TableHead className="min-w-[80px] whitespace-nowrap">Term</TableHead>
                        <TableHead className="min-w-[120px] whitespace-nowrap">
                          Funded syndicated <span className="text-destructive">*</span>
                        </TableHead>
                        <TableHead className="min-w-[140px] whitespace-nowrap">
                          Payback syndicated <span className="text-destructive">*</span>
                        </TableHead>
                        <TableHead className="min-w-[110px] whitespace-nowrap">
                          % syndicated <span className="text-destructive">*</span>
                        </TableHead>
                        <TableHead className="min-w-[120px] whitespace-nowrap">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground/80">
                                Commission
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm leading-snug">
                              Dollar amount recorded as this syndicator&apos;s commission on this allocation.
                              Enter any amount; it is stored on the participation row and included in syndicator
                              commission totals (separate from the deal-level ISO commission).
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="min-w-[120px] whitespace-nowrap">
                          <Tooltip delayDuration={300}>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground/80">
                                Management fee
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs text-sm leading-snug">
                              Calculated from this syndicator&apos;s default management fee % (in Syndicator
                              settings) × the funded syndicated amount for this row. Saved as management fee
                              on the allocation.
                            </TooltipContent>
                          </Tooltip>
                        </TableHead>
                        <TableHead className="min-w-[200px] whitespace-nowrap">Fee basis</TableHead>
                        <TableHead className="w-[72px] min-w-[72px] max-w-[72px] p-2 text-right">
                          <span className="sr-only">Delete</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drafts.map((d) => {
                        const fAmt = parseMoney(d.fundedSyndicated);
                        const pAmt = parseMoney(d.percentageSyndicated);
                        const pb = computePaybackSyndicated(dealFundedN, dealPaybackN, fAmt, pAmt);
                        const mgmtPreview = computeDraftManagementFee(fAmt, d.syndicatorFeePercentage);
                        const basisLabel =
                          FEE_BASIS_LABELS[d.syndicatorFeeBasis] ?? d.syndicatorFeeBasis.replace(/_/g, ' ');
                        return (
                          <TableRow key={d.syndicatorId}>
                            <TableCell className="tabular-nums">{d.syndicatorId}</TableCell>
                            <TableCell className="font-medium">{d.syndicatorName}</TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {deal.fundedAmount || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">
                              {deal.paybackAmount || '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{deal.termLength}</TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                placeholder="Advance"
                                className="min-w-[100px]"
                                value={d.fundedSyndicated}
                                onChange={(e) => onFundedSyndicatedChange(d.syndicatorId, e.target.value)}
                              />
                            </TableCell>
                            <TableCell className="text-sm tabular-nums text-muted-foreground">
                              {fAmt != null && fAmt > 0 && dealPaybackN != null && dealPaybackN > 0
                                ? toCurrency(pb)
                                : fAmt != null && fAmt > 0 &&
                                    (dealPaybackN == null || dealPaybackN <= 0)
                                  ? toCurrency(0)
                                  : '—'}
                            </TableCell>
                            <TableCell>
                              <Input
                                inputMode="decimal"
                                placeholder="%"
                                className="min-w-[90px]"
                                value={d.percentageSyndicated}
                                onChange={(e) => onPctChange(d.syndicatorId, e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="relative min-w-[108px]">
                                <span className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-xs text-muted-foreground">
                                  $
                                </span>
                                <Input
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  className="min-w-[108px] pl-7 font-medium tabular-nums"
                                  value={d.commissionAmount}
                                  onChange={(e) =>
                                    updateDraft(d.syndicatorId, {
                                      commissionAmount: formatNumberUSForInput(e.target.value),
                                    })
                                  }
                                />
                              </div>
                            </TableCell>
                            <TableCell className="text-sm tabular-nums text-foreground">
                              {fAmt != null && fAmt > 0 ? toCurrency(mgmtPreview) : '—'}
                            </TableCell>
                            <TableCell className="max-w-[220px] text-sm text-muted-foreground">
                              {basisLabel}
                            </TableCell>
                            <TableCell className="w-[72px] max-w-[72px] p-2 text-right align-middle">
                              <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${d.syndicatorName || 'syndicator'} from this batch`}
                                className="h-9 w-9 shrink-0 border-0 bg-transparent text-red-600 shadow-none hover:bg-transparent hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
                                onClick={() =>
                                  setDrafts((prev) => prev.filter((x) => x.syndicatorId !== d.syndicatorId))
                                }
                              >
                                <Trash2 className="h-4 w-4 text-current" strokeWidth={2.25} />
                              </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {drafts.length === 0 && !pickingSyndicator && (
                <p className="text-center text-sm text-muted-foreground">
                  Choose a syndicator from the dropdown — each selection adds one row to the table.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>
                  Deal funded:{' '}
                  <strong className="text-foreground tabular-nums">
                    {dealFundedN != null ? toCurrency(dealFundedN) : '—'}
                  </strong>
                </span>
                <span>
                  Already syndicated on deal:{' '}
                  <strong className="text-foreground tabular-nums">{toCurrency(alreadyAllocated)}</strong>
                </span>
                <span>
                  This batch:{' '}
                  <strong className="text-foreground tabular-nums">{toCurrency(batchAllocated)}</strong>
                </span>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
                  Cancel
                </Button>
                {saving || submitDisabledReason ? (
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">
                        <Button
                          type="button"
                          disabled={!canSubmit || saving}
                          onClick={() => void handleBatchSave()}
                        >
                          {saving ? 'Saving…' : 'Submit'}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" sideOffset={6} className="max-w-xs text-balance">
                      {saving ? 'Saving…' : submitDisabledReason}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button type="button" onClick={() => void handleBatchSave()}>
                    Submit
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <AddUserModal
        open={inviteSyndicatorOpen}
        onClose={() => setInviteSyndicatorOpen(false)}
        role="SYNDICATORS"
        roleName="Syndicator"
        createSyndicatorProfile={true}
        onSuccess={() => void loadData()}
      />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Syndicator</TableHead>
              <TableHead>% Share</TableHead>
              <TableHead>Funded</TableHead>
              <TableHead>Payback</TableHead>
              <TableHead>Amount syndicated</TableHead>
              <TableHead>Payback share</TableHead>
              <TableHead className="whitespace-nowrap">Commission</TableHead>
              <TableHead className="whitespace-nowrap">Management fee</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Remaining</TableHead>
              <TableHead className="w-[72px] min-w-[72px] max-w-[72px] p-2 text-right">
                <span className="sr-only">Delete</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={11} className="py-12 text-center">
                  <div className="flex justify-center" role="status" aria-live="polite">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
                    <span className="sr-only">Loading syndication details</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  {rows.length === 0
                    ? 'No syndicators mapped to this application yet.'
                    : 'No results match your search.'}
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.syndicatorName || `Syndicator #${row.syndicatorId}`}</TableCell>
                  <TableCell>{Number(row.percentageSyndicated).toFixed(2)}%</TableCell>
                  <TableCell>{toCurrency(row.fundedAmount ?? row.amountSyndicated)}</TableCell>
                  <TableCell>{toCurrency(row.paybackAmount ?? row.paybackAmountSyndicated)}</TableCell>
                  <TableCell>{toCurrency(row.amountSyndicated)}</TableCell>
                  <TableCell>{toCurrency(row.paybackAmountSyndicated)}</TableCell>
                  <TableCell className="tabular-nums">{toCurrency(row.commissionAmount)}</TableCell>
                  <TableCell className="tabular-nums">{toCurrency(row.managementFeeToDate)}</TableCell>
                  <TableCell>{toCurrency(row.collectedAmount)}</TableCell>
                  <TableCell>{toCurrency(row.remainingAmount)}</TableCell>
                  <TableCell className="w-[72px] max-w-[72px] p-2 text-right align-middle">
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${row.syndicatorName || 'syndication'} from this deal`}
                        className="h-9 w-9 shrink-0 border-0 bg-transparent text-red-600 shadow-none hover:bg-transparent hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
                        onClick={() => void handleDelete(row.id)}
                      >
                        <Trash2 className="h-4 w-4 text-current" strokeWidth={2.25} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
