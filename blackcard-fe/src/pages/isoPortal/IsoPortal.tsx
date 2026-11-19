/**
 * ISO Portal — unified workspace for managing Independent Sales Organizations.
 *
 *  1. Approval queue   — review ISOs, request docs, approve/reject, assign manager
 *  2. Commission plans — per-ISO rules (points %, upfront vs on-collection, renewal, caps)
 *  3. Payout batches   — commission payouts per ISO + month, approve, mark paid, CSV export
 *  4. Reports          — pipeline / funding / commission / ranking reports
 *
 * Everything is loaded from `GET /iso/portal-overview` (ISOs, deals, payouts, plans,
 * scoring rules) and every change is saved through the ISO API.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { axiosDelete, axiosGet, axiosPost, axiosPut } from '@/redux/axios';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/utils/formatCurrency';
import { useTheme } from '@/context/ThemeContext';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  CheckCircle2,
  XCircle,
  FileClock,
  UserPlus,
  Plus,
  Pencil,
  Download,
  Users,
  Percent,
  Banknote,
  ClipboardList,
  FileSignature,
  TrendingUp,
  CircleDollarSign,
  FileText,
  ArrowLeft,
  Mail,
  Award,
  RefreshCw,
  Loader2,
} from 'lucide-react';

/* ----------------------------------------------------------------------------
 * Types + persistence
 * -------------------------------------------------------------------------- */

type IsoStatus = 'pending' | 'docs_requested' | 'approved' | 'rejected';

type AgreementStatus = 'not_sent' | 'sent' | 'viewed' | 'signed';

/** One ISO (`id` is the server ISO id). */
type IsoApplication = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone?: string;
  submittedAt: string;
  status: IsoStatus;
  manager: string | null;
  missingDocs: string | null;
  planId: string | null;
  commissionPct: number;
  agreement: AgreementStatus;
  agreementEmail?: string;
  agreementSentAt?: string;
  agreementViewedAt?: string;
  agreementSignedAt?: string;
};

/** Fields the portal can change on an ISO (sent to `PUT /iso/:id`). */
type IsoPatch = {
  status?: IsoStatus;
  manager?: string | null;
  missingDocs?: string | null;
  planId?: string | null;
  agreementEmail?: string | null;
  agreementSentAt?: string | null;
  agreementViewedAt?: string | null;
  agreementSignedAt?: string | null;
  tierOverride?: Tier | null;
  badges?: string[];
};

type CommissionBasis = 'upfront' | 'on_collection';

type CommissionPlan = {
  id: string;
  name: string;
  pointsPct: number; // commission % of funded
  basis: CommissionBasis;
  renewalPct: number;
  capAmount: number; // 0 = no cap
};

type ClawbackAdjustment = {
  id: string;
  iso: string;
  isoId: string;
  amount: number;
  reason: string;
  createdAt: string;
};

type PayoutStatus = 'draft' | 'approved' | 'paid';

/** Commission payout for one ISO in one month, built from per-deal payout records. */
type PayoutBatch = {
  id: string; // `${isoId}|${periodKey}`
  periodKey: string; // YYYY-MM, for sorting
  period: string; // e.g. "Oct 2026"
  iso: string;
  isoId: string;
  gross: number;
  clawback: number;
  status: PayoutStatus;
  /** Application ids in this batch that are not paid yet. */
  unpaidApplicationIds: string[];
};

type DealStatus = 'submitted' | 'approved' | 'funded' | 'declined';
type DealPayoutStatus = 'paid' | 'pending' | 'clawbacks' | null;
type IsoDeal = {
  id: string; // application id
  iso: string; // ISO company
  isoId: string;
  dealId: string;
  merchant: string;
  funded: number;
  commission: number;
  status: DealStatus;
  submittedAt: string;
  payoutStatus: DealPayoutStatus;
  paidAt: string | null;
  scheduledPayDate: string | null;
  payoutUpdatedAt: string | null;
  payoutApprovedAt: string | null;
};

/* Server payloads (GET /iso/portal-overview). */
type ApiIso = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  commissionPercentage: number;
  createdAt: string;
  agreementAcceptedAt: string | null;
  documentCount: number;
  planId: string | null;
  contactName: string | null;
  managerName: string | null;
  missingDocs: string | null;
  agreementEmail: string | null;
  agreementSentAt: string | null;
  agreementViewedAt: string | null;
  tierOverride: Tier | null;
  badges: string[];
};
type ApiIsoDeal = {
  applicationId: string;
  isoId: string;
  dealId: string | null;
  applicationNumber: number;
  merchant: string;
  status: DealStatus;
  amount: number;
  commission: number;
  createdAt: string;
  payoutStatus: DealPayoutStatus;
  paidAt: string | null;
  scheduledPayDate: string | null;
  payoutUpdatedAt: string | null;
  payoutApprovedAt: string | null;
};
type PortalData = {
  isos: ApiIso[];
  deals: ApiIsoDeal[];
  plans: CommissionPlan[];
  scoring: ScoringConfig | null;
};

type Tier = 'Unrated' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
/** Admin overrides per ISO id: pinned tier and/or manual badges. */
type IsoOverride = { tier?: Tier; badges: string[] };

/** What every section renders, derived from the server payload. */
type IsoStore = {
  applications: IsoApplication[];
  adjustments: ClawbackAdjustment[];
  payouts: PayoutBatch[];
  deals: IsoDeal[];
  plans: CommissionPlan[];
  overrides: Record<string, IsoOverride>;
  scoring: ScoringConfig;
};

type ScoringWeights = { volume: number; conversion: number; quality: number; profit: number; submission: number };
type ScoringConfig = {
  weights: ScoringWeights;
  thresholds: { platinum: number; gold: number; silver: number };
  minFunded: number;
};
const DEFAULT_SCORING: ScoringConfig = {
  weights: { volume: 25, conversion: 20, quality: 30, profit: 15, submission: 10 },
  thresholds: { platinum: 85, gold: 70, silver: 50 },
  minFunded: 3,
};

const nowISO = () => new Date().toISOString();
const fmtDate = (v: string) => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const SERVER_TO_UI_STATUS: Record<string, IsoStatus> = {
  active: 'approved',
  pending: 'pending',
  docs_requested: 'docs_requested',
  rejected: 'rejected',
  inactive: 'rejected',
};
const UI_TO_SERVER_STATUS: Record<IsoStatus, string> = {
  approved: 'active',
  pending: 'pending',
  docs_requested: 'docs_requested',
  rejected: 'rejected',
};

function toIsoApplication(iso: ApiIso): IsoApplication {
  const agreement: AgreementStatus = iso.agreementAcceptedAt
    ? 'signed'
    : iso.agreementViewedAt
      ? 'viewed'
      : iso.agreementSentAt
        ? 'sent'
        : 'not_sent';
  return {
    id: iso.id,
    name: iso.contactName ?? '',
    company: iso.name,
    email: iso.email ?? '',
    phone: iso.phone ?? undefined,
    submittedAt: iso.createdAt,
    status: SERVER_TO_UI_STATUS[iso.status] ?? 'approved',
    manager: iso.managerName,
    missingDocs: iso.missingDocs,
    planId: iso.planId,
    commissionPct: iso.commissionPercentage ?? 0,
    agreement,
    agreementEmail: iso.agreementEmail ?? undefined,
    agreementSentAt: iso.agreementSentAt ?? undefined,
    agreementViewedAt: iso.agreementViewedAt ?? undefined,
    agreementSignedAt: iso.agreementAcceptedAt ?? undefined,
  };
}

/** `PUT /iso/:id` body for a portal patch. */
function toServerPatch(patch: IsoPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body.status = UI_TO_SERVER_STATUS[patch.status];
  if (patch.manager !== undefined) body.managerName = patch.manager;
  if (patch.missingDocs !== undefined) body.missingDocs = patch.missingDocs;
  if (patch.planId !== undefined) body.planId = patch.planId;
  if (patch.agreementEmail !== undefined) body.agreementEmail = patch.agreementEmail;
  if (patch.agreementSentAt !== undefined) body.agreementSentAt = patch.agreementSentAt;
  if (patch.agreementViewedAt !== undefined) body.agreementViewedAt = patch.agreementViewedAt;
  if (patch.agreementSignedAt !== undefined) body.agreementAcceptedAt = patch.agreementSignedAt;
  if (patch.tierOverride !== undefined) body.tierOverride = patch.tierOverride;
  if (patch.badges !== undefined) body.badges = patch.badges;
  return body;
}

/** Map the ISO row returned by `PUT /iso/:id` back onto the portal shape. */
function fromServerIso(row: Record<string, unknown>, prev: ApiIso): ApiIso {
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    ...prev,
    name: str(row.name) ?? prev.name,
    email: str(row.email),
    phone: str(row.phone),
    status: str(row.status) ?? prev.status,
    commissionPercentage: Number(row.commissionPercentage ?? prev.commissionPercentage),
    agreementAcceptedAt: str(row.agreementAcceptedAt),
    planId: str(row.tierId),
    contactName: str(row.contactName),
    managerName: str(row.managerName),
    missingDocs: str(row.missingDocs),
    agreementEmail: str(row.agreementEmail),
    agreementSentAt: str(row.agreementSentAt),
    agreementViewedAt: str(row.agreementViewedAt),
    tierOverride: (str(row.tierOverride) as Tier | null),
    badges: Array.isArray(row.badges) ? (row.badges as string[]) : prev.badges,
  };
}

const monthKey = (v: string | null | undefined): string | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

/** Derive what the sections render from the server payload. */
function buildStore(data: PortalData | null): IsoStore {
  const isos = data?.isos ?? [];
  const nameById = new Map(isos.map((i) => [i.id, i.name]));
  const applications = isos.map(toIsoApplication);
  const overrides: Record<string, IsoOverride> = {};
  for (const iso of isos) {
    if (iso.tierOverride || iso.badges?.length) {
      overrides[iso.id] = { tier: iso.tierOverride ?? undefined, badges: iso.badges ?? [] };
    }
  }

  const deals: IsoDeal[] = (data?.deals ?? []).map((d) => ({
    id: d.applicationId,
    iso: nameById.get(d.isoId) ?? '—',
    isoId: d.isoId,
    dealId: d.dealId ?? `#${d.applicationNumber}`,
    merchant: d.merchant,
    funded: d.amount,
    commission: d.commission,
    status: d.status,
    submittedAt: d.createdAt,
    payoutStatus: d.payoutStatus,
    paidAt: d.paidAt,
    scheduledPayDate: d.scheduledPayDate,
    payoutUpdatedAt: d.payoutUpdatedAt,
    payoutApprovedAt: d.payoutApprovedAt,
  }));

  const adjustments: ClawbackAdjustment[] = deals
    .filter((d) => d.payoutStatus === 'clawbacks')
    .map((d) => ({
      id: d.id,
      iso: d.iso,
      isoId: d.isoId,
      amount: d.commission,
      reason: `Clawback on ${d.dealId} (${d.merchant})`,
      createdAt: d.payoutUpdatedAt ?? d.submittedAt,
    }));

  const batches = new Map<string, PayoutBatch & { allApproved: boolean }>();
  for (const d of deals) {
    if (d.status !== 'funded' || !d.commission) continue;
    const key = monthKey(d.paidAt) ?? monthKey(d.scheduledPayDate) ?? monthKey(d.submittedAt);
    if (!key) continue;
    const id = `${d.isoId}|${key}`;
    const b = batches.get(id) ?? {
      id,
      periodKey: key,
      period: monthLabel(key),
      iso: d.iso,
      isoId: d.isoId,
      gross: 0,
      clawback: 0,
      status: 'draft' as PayoutStatus,
      unpaidApplicationIds: [],
      allApproved: true,
    };
    if (d.payoutStatus === 'clawbacks') b.clawback += d.commission;
    else {
      b.gross += d.commission;
      if (d.payoutStatus !== 'paid') {
        b.unpaidApplicationIds.push(d.id);
        if (!d.payoutApprovedAt) b.allApproved = false;
      }
    }
    batches.set(id, b);
  }
  const payouts: PayoutBatch[] = [...batches.values()]
    .map(({ allApproved, ...b }) => ({
      ...b,
      status: (b.unpaidApplicationIds.length === 0 ? 'paid' : allApproved ? 'approved' : 'draft') as PayoutStatus,
    }))
    .sort((a, b) => b.periodKey.localeCompare(a.periodKey) || a.iso.localeCompare(b.iso));

  return {
    applications,
    deals,
    adjustments,
    payouts,
    plans: data?.plans ?? [],
    overrides,
    scoring: data?.scoring ?? DEFAULT_SCORING,
  };
}

/* ----------------------------------------------------------------------------
 * ISO scoring / tiers / badges
 * -------------------------------------------------------------------------- */

type Badge = { key: string; label: string; tone: 'good' | 'warn' | 'risk' | 'manual' };
type IsoScore = {
  score: number;
  tier: Tier;
  tierPinned: boolean;
  badges: Badge[];
  fundedCount: number;
  fundedAmt: number;
  commission: number;
  approvalPct: number;
  clawbackPct: number;
  clawback: number;
  netRevenue: number;
  /** Submissions repeating a merchant this ISO already sent. */
  duplicates: number;
  avgDealSize: number;
  components: { volume: number; conversion: number; quality: number; profit: number; submission: number };
  statusMix: { submitted: number; approved: number; funded: number; declined: number };
};

const clamp100 = (n: number) => Math.max(0, Math.min(100, n));

/** Composite 0–100 score + tier + auto badges for one ISO, from its deals. */
function computeIsoScore(isoId: string, store: IsoStore): IsoScore {
  const deals = store.deals.filter((d) => d.isoId === isoId);
  const funded = deals.filter((d) => d.status === 'funded');
  const approved = deals.filter((d) => d.status === 'approved' || d.status === 'funded');
  const fundedAmt = funded.reduce((a, d) => a + d.funded, 0);
  const commission = funded.reduce((a, d) => a + d.commission, 0);
  const clawback = store.adjustments.filter((x) => x.isoId === isoId).reduce((a, x) => a + x.amount, 0);
  const approvalPct = deals.length ? (approved.length / deals.length) * 100 : 0;
  const clawbackPct = commission ? (clawback / commission) * 100 : 0;
  const netRevenue = commission - clawback;

  const duplicates = duplicateSubmissionCount(deals);
  const duplicatePct = deals.length ? (duplicates / deals.length) * 100 : 0;

  // Component scores (0–100): volume by funded $, conversion by approval rate,
  // quality by inverse clawback, profitability by net revenue, submission by inverse duplicate rate.
  const volume = clamp100((fundedAmt / 100000) * 100);
  const conversion = clamp100(approvalPct);
  const quality = clamp100(100 - clawbackPct);
  const profit = clamp100((netRevenue / 20000) * 100);
  const submission = Math.round(clamp100(100 - duplicatePct));

  const cfg = store.scoring ?? DEFAULT_SCORING;
  const w = cfg.weights;
  const wSum = w.volume + w.conversion + w.quality + w.profit + w.submission || 1;
  const raw = (volume * w.volume + conversion * w.conversion + quality * w.quality + profit * w.profit + submission * w.submission) / wSum;
  const score = Math.round(raw);

  const override = store.overrides[isoId];
  const th = cfg.thresholds;
  let tier: Tier;
  let tierPinned = false;
  if (override?.tier) {
    tier = override.tier;
    tierPinned = true;
  } else if (funded.length < cfg.minFunded) {
    tier = 'Unrated';
  } else if (score >= th.platinum) tier = 'Platinum';
  else if (score >= th.gold) tier = 'Gold';
  else if (score >= th.silver) tier = 'Silver';
  else tier = 'Bronze';

  const badges: Badge[] = [];
  if (fundedAmt >= 100000) badges.push({ key: 'high_volume', label: 'High volume', tone: 'good' });
  if (funded.length >= 1 && clawbackPct === 0) badges.push({ key: 'clean_book', label: 'Clean book', tone: 'good' });
  if (clawbackPct > 10) badges.push({ key: 'high_clawback', label: 'High clawback', tone: 'risk' });
  if (deals.length >= 3 && approvalPct < 40) badges.push({ key: 'low_approval', label: 'Low approval', tone: 'warn' });
  for (const b of override?.badges ?? []) badges.push({ key: `manual_${b}`, label: b, tone: 'manual' });

  return {
    score,
    tier,
    tierPinned,
    badges,
    fundedCount: funded.length,
    fundedAmt,
    commission,
    approvalPct,
    clawbackPct,
    clawback,
    netRevenue,
    duplicates,
    avgDealSize: funded.length ? fundedAmt / funded.length : 0,
    components: { volume: Math.round(volume), conversion: Math.round(conversion), quality: Math.round(quality), profit: Math.round(profit), submission },
    statusMix: {
      submitted: deals.filter((d) => d.status === 'submitted').length,
      approved: deals.filter((d) => d.status === 'approved').length,
      funded: funded.length,
      declined: deals.filter((d) => d.status === 'declined').length,
    },
  };
}

function duplicateSubmissionCount(deals: IsoDeal[]): number {
  const seen = new Set<string>();
  let dup = 0;
  for (const d of deals) {
    const key = d.merchant.trim().toLowerCase();
    if (!key || key === '—') continue;
    if (seen.has(key)) dup++;
    else seen.add(key);
  }
  return dup;
}

/** ISO id with the highest funded $ (min 1 funded deal) — gets the Top performer badge. */
function topPerformer(store: IsoStore): string | null {
  const byIso = new Map<string, number>();
  for (const d of store.deals) if (d.status === 'funded') byIso.set(d.isoId, (byIso.get(d.isoId) ?? 0) + d.funded);
  let best: string | null = null;
  let bestAmt = 0;
  for (const [iso, amt] of byIso) if (amt > bestAmt) { bestAmt = amt; best = iso; }
  return best;
}

const TIER_CLS: Record<Tier, string> = {
  Platinum: 'bg-gradient-to-r from-violet-200 to-white text-violet-800 border-violet-300 dark:from-violet-500/20 dark:to-transparent dark:text-violet-200',
  Gold: 'bg-gradient-to-r from-amber-200 to-white text-amber-800 border-amber-300 dark:from-amber-500/20 dark:to-transparent dark:text-amber-200',
  Silver: 'bg-gradient-to-r from-slate-200 to-white text-slate-700 border-slate-300 dark:from-slate-500/20 dark:to-transparent dark:text-slate-200',
  Bronze: 'bg-gradient-to-r from-orange-200 to-white text-orange-800 border-orange-300 dark:from-orange-500/20 dark:to-transparent dark:text-orange-200',
  Unrated: 'bg-muted text-muted-foreground border-border',
};

function TierChip({ tier, pinned }: { tier: Tier; pinned?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', TIER_CLS[tier])}>
      <Award className="size-3" />{tier}{pinned ? ' · pinned' : ''}
    </span>
  );
}

const BADGE_CLS: Record<Badge['tone'], string> = {
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  risk: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  manual: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
};

function BadgeChip({ badge }: { badge: Badge }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', BADGE_CLS[badge.tone])}>{badge.label}</span>;
}

const apiError = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;

/* ----------------------------------------------------------------------------
 * Shared UI
 * -------------------------------------------------------------------------- */

const SECTIONS = [
  { key: 'queue', label: 'Approval queue', icon: ClipboardList },
  { key: 'plans', label: 'Commission plans', icon: Percent },
  { key: 'payouts', label: 'Payout batches', icon: Banknote },
  { key: 'reports', label: 'Reports', icon: FileText },
] as const;
type SectionKey = (typeof SECTIONS)[number]['key'];

function StatusPill({ status }: { status: IsoStatus }) {
  const map: Record<IsoStatus, { label: string; cls: string }> = {
    pending: { label: 'Pending', cls: 'from-amber-100 to-white text-amber-700 dark:from-amber-950 dark:to-transparent dark:text-amber-200' },
    docs_requested: { label: 'Docs requested', cls: 'from-sky-100 to-white text-sky-700 dark:from-sky-950 dark:to-transparent dark:text-sky-200' },
    approved: { label: 'Approved', cls: 'from-emerald-100 to-white text-emerald-700 dark:from-emerald-950 dark:to-transparent dark:text-emerald-200' },
    rejected: { label: 'Rejected', cls: 'from-red-100 to-white text-red-700 dark:from-red-950 dark:to-transparent dark:text-red-200' },
  };
  const s = map[status] ?? map.pending;
  return <span className={cn('inline-flex rounded-full bg-gradient-to-r px-2 py-0.5 text-[11px] font-medium', s.cls)}>{s.label}</span>;
}

function AgreementPill({ status }: { status: AgreementStatus }) {
  const map: Record<AgreementStatus, { label: string; cls: string }> = {
    not_sent: { label: 'Not sent', cls: 'bg-muted text-muted-foreground' },
    sent: { label: 'Sent', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    viewed: { label: 'Viewed', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    signed: { label: 'Signed', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
  };
  const s = map[status] ?? map.not_sent;
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', s.cls)}>{s.label}</span>;
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Main
 * -------------------------------------------------------------------------- */

export default function IsoPortal() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>('queue');

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await axiosGet('/iso/portal-overview');
      const payload = res?.data?.data as Partial<PortalData> | undefined;
      setData({
        isos: payload?.isos ?? [],
        deals: payload?.deals ?? [],
        plans: payload?.plans ?? [],
        scoring: payload?.scoring ?? null,
      });
    } catch (e) {
      setLoadError(apiError(e, 'Failed to load ISO data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const store = useMemo(() => buildStore(data), [data]);

  const actions = useMemo<PortalActions>(() => ({
    reload: () => void reload(),
    async updateIso(app, patch) {
      const body = toServerPatch(patch);
      if (!Object.keys(body).length) return true;
      try {
        const res = await axiosPut(`/iso/${app.id}`, body);
        const row = res?.data?.data as Record<string, unknown> | undefined;
        if (row) {
          setData((d) => (d ? { ...d, isos: d.isos.map((i) => (i.id === app.id ? fromServerIso(row, i) : i)) } : d));
        }
        return true;
      } catch (e) {
        toast.error(apiError(e, 'Failed to update ISO'));
        return false;
      }
    },
    async createIso(input) {
      try {
        await axiosPost('/iso', {
          name: input.company,
          email: input.email,
          phone: input.phone || null,
          bankAccountNo: input.bankAccountNo || 'NA',
          routingNumber: input.routingNumber || 'NA',
          commissionPercentage: input.commissionPct,
          status: 'pending',
          contactName: input.contactName || null,
          planId: input.planId,
          ...(input.sendAgreement ? { agreementEmail: input.email, agreementSentAt: nowISO() } : {}),
        });
        await reload();
        return true;
      } catch (e) {
        toast.error(apiError(e, 'Failed to create ISO'));
        return false;
      }
    },
    async setBatchApproved(batch, approved) {
      try {
        const res = await axiosPut(`/iso/${batch.isoId}/payout-approval`, {
          applicationIds: batch.unpaidApplicationIds,
          approved,
        });
        const approvedAt = (res?.data?.data?.approvedAt as string | null | undefined) ?? null;
        const ids = new Set(batch.unpaidApplicationIds);
        setData((d) =>
          d
            ? {
                ...d,
                deals: d.deals.map((x) =>
                  ids.has(x.applicationId)
                    ? { ...x, payoutApprovedAt: approvedAt, payoutStatus: x.payoutStatus ?? 'pending' }
                    : x,
                ),
              }
            : d,
        );
        return true;
      } catch (e) {
        toast.error(apiError(e, 'Failed to update payout approval'));
        return false;
      }
    },
    async markBatchPaid(batch) {
      const results = await Promise.allSettled(
        batch.unpaidApplicationIds.map((applicationId) =>
          axiosPut(`/iso/${batch.isoId}/application-payout-status`, { applicationId, payoutStatus: 'paid' }),
        ),
      );
      const failed = results.filter((r) => r.status === 'rejected').length;
      await reload();
      if (failed) toast.error(`${failed} deal payout(s) could not be marked paid`);
      return failed === 0;
    },
    async savePlan(plan) {
      const body = {
        name: plan.name,
        pointsPct: plan.pointsPct,
        basis: plan.basis,
        renewalPct: plan.renewalPct,
        capAmount: plan.capAmount,
      };
      try {
        const res = plan.id
          ? await axiosPut(`/iso/commission-plans/${plan.id}`, body)
          : await axiosPost('/iso/commission-plans', body);
        const saved = res?.data?.data as CommissionPlan | undefined;
        if (saved) {
          setData((d) => {
            if (!d) return d;
            const exists = d.plans.some((p) => p.id === saved.id);
            return { ...d, plans: exists ? d.plans.map((p) => (p.id === saved.id ? saved : p)) : [...d.plans, saved] };
          });
        }
        return true;
      } catch (e) {
        toast.error(apiError(e, 'Failed to save plan'));
        return false;
      }
    },
    async deletePlan(plan) {
      try {
        await axiosDelete(`/iso/commission-plans/${plan.id}`);
        setData((d) =>
          d
            ? {
                ...d,
                plans: d.plans.filter((p) => p.id !== plan.id),
                isos: d.isos.map((i) => (i.planId === plan.id ? { ...i, planId: null } : i)),
              }
            : d,
        );
        return true;
      } catch (e) {
        toast.error(apiError(e, 'Failed to delete plan'));
        return false;
      }
    },
    async saveScoring(scoring) {
      try {
        await axiosPut('/iso/portal-settings/scoring', { scoring });
        setData((d) => (d ? { ...d, scoring } : d));
        return true;
      } catch (e) {
        toast.error(apiError(e, 'Failed to save scoring rules'));
        return false;
      }
    },
  }), [reload]);

  const [selectedIsoId, setSelectedIsoId] = useState<string | null>(null);
  const selectedIso = useMemo(
    () => (selectedIsoId ? store.applications.find((a) => a.id === selectedIsoId) ?? null : null),
    [selectedIsoId, store.applications],
  );

  const totals = useMemo(() => {
    const pending = store.applications.filter((a) => a.status === 'pending' || a.status === 'docs_requested').length;
    const approved = store.applications.filter((a) => a.status === 'approved').length;
    const payoutNet = store.payouts
      .filter((p) => p.status !== 'paid')
      .reduce((a, p) => a + Math.max(0, p.gross - p.clawback), 0);
    return { pending, approved, plans: store.plans.length, payoutNet };
  }, [store]);

  const sectionProps: SectionProps = { store, actions };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">ISO Portal</h1>
            <p className="text-sm text-muted-foreground">
              Onboard and manage Independent Sales Organizations — approvals, commission plans, payouts and reports.
            </p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void reload()} disabled={loading}>
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {loadError ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
            <span>{loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void reload()}>Retry</Button>
          </div>
        ) : null}

        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-card py-16 text-sm text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Loading ISOs…
          </div>
        ) : null}

        {/* KPI strip */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile label="Awaiting review" value={String(totals.pending)} icon={ClipboardList} accent="amber" />
          <KpiTile label="Active ISOs" value={String(totals.approved)} icon={Users} accent="emerald" />
          <KpiTile label="Commission plans" value={String(totals.plans)} icon={Percent} accent="violet" />
          <KpiTile label="Net payable" value={formatUSD(totals.payoutNet)} icon={Banknote} accent="sky" />
        </div>

        {!data ? null : selectedIso ? (
          <IsoDetailView app={selectedIso} {...sectionProps} onBack={() => setSelectedIsoId(null)} />
        ) : (
          <>
            {/* Section nav */}
            <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-2">
              {SECTIONS.map((s) => {
                const Icon = s.icon;
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSection(s.key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-4" />
                    {s.label}
                  </button>
                );
              })}
            </div>

            {section === 'queue' && <ApprovalQueue {...sectionProps} onOpenIso={(a) => setSelectedIsoId(a.id)} />}
            {section === 'plans' && <CommissionPlans {...sectionProps} />}
            {section === 'payouts' && <Payouts {...sectionProps} />}
            {section === 'reports' && <Reports {...sectionProps} />}
          </>
        )}
      </div>
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, accent }: { label: string; value: string; icon: typeof Users; accent: 'amber' | 'emerald' | 'violet' | 'sky' }) {
  const chip: Record<string, string> = {
    amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    violet: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    sky: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn('flex size-7 items-center justify-center rounded-lg', chip[accent])}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

type NewIsoInput = {
  company: string;
  contactName: string;
  email: string;
  phone: string;
  bankAccountNo: string;
  routingNumber: string;
  commissionPct: number;
  planId: string | null;
  sendAgreement: boolean;
};

/** Every action saves through the API and resolves false (after a toast) on failure. */
type PortalActions = {
  reload: () => void;
  updateIso: (app: IsoApplication, patch: IsoPatch) => Promise<boolean>;
  createIso: (input: NewIsoInput) => Promise<boolean>;
  setBatchApproved: (batch: PayoutBatch, approved: boolean) => Promise<boolean>;
  markBatchPaid: (batch: PayoutBatch) => Promise<boolean>;
  /** Creates the plan when `id` is empty. */
  savePlan: (plan: CommissionPlan) => Promise<boolean>;
  deletePlan: (plan: CommissionPlan) => Promise<boolean>;
  saveScoring: (scoring: ScoringConfig) => Promise<boolean>;
};

type SectionProps = {
  store: IsoStore;
  actions: PortalActions;
};

/* ----------------------------------------------------------------------------
 * 1. Approval queue
 * -------------------------------------------------------------------------- */

function ApprovalQueue({ store, actions, onOpenIso }: SectionProps & { onOpenIso: (a: IsoApplication) => void }) {
  const [docsFor, setDocsFor] = useState<IsoApplication | null>(null);
  const [docsText, setDocsText] = useState('');
  const [mgrFor, setMgrFor] = useState<IsoApplication | null>(null);
  const [mgrText, setMgrText] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | IsoStatus>('all');

  const dealCountByIso = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of store.deals) m.set(d.isoId, (m.get(d.isoId) ?? 0) + 1);
    return m;
  }, [store.deals]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return store.applications.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return [a.company, a.name, a.email, a.phone ?? ''].join(' ').toLowerCase().includes(q);
    });
  }, [store.applications, search, statusFilter]);

  const approve = async (a: IsoApplication) => {
    if (!(await actions.updateIso(a, { status: 'approved' }))) return;
    toast.success(`${a.company} approved`);
  };
  const reject = async (a: IsoApplication) => {
    if (!(await actions.updateIso(a, { status: 'rejected' }))) return;
    toast.info(`${a.company} rejected`);
  };
  const saveDocs = async () => {
    if (!docsFor) return;
    if (!(await actions.updateIso(docsFor, { status: 'docs_requested', missingDocs: docsText.trim() || 'Documents requested' }))) return;
    toast.success('Document request recorded');
    setDocsFor(null);
    setDocsText('');
  };
  const saveMgr = async () => {
    if (!mgrFor) return;
    await actions.updateIso(mgrFor, { manager: mgrText.trim() || null });
    toast.success('Manager assigned');
    setMgrFor(null);
    setMgrText('');
  };

  // Add ISO onboarding form
  const emptyForm = { name: '', company: '', email: '', phone: '', bankAccountNo: '', routingNumber: '', planId: '', sendAgreement: true };
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const createIso = async () => {
    if (!form.company.trim() || !form.email.trim()) {
      toast.error('Company and email are required');
      return;
    }
    const plan = store.plans.find((p) => p.id === form.planId);
    setCreating(true);
    const ok = await actions.createIso({
      company: form.company.trim(),
      contactName: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      bankAccountNo: form.bankAccountNo.trim(),
      routingNumber: form.routingNumber.trim(),
      commissionPct: plan?.pointsPct ?? 0,
      planId: form.planId || null,
      sendAgreement: form.sendAgreement,
    });
    setCreating(false);
    if (!ok) return;
    toast.success('ISO added');
    setAddOpen(false);
    setForm(emptyForm);
  };

  const [docuFor, setDocuFor] = useState<IsoApplication | null>(null);
  const docuApp = useMemo(() => (docuFor ? store.applications.find((a) => a.id === docuFor.id) ?? docuFor : null), [docuFor, store.applications]);

  return (
    <SectionCard
      title={`ISOs (${rows.length}${rows.length !== store.applications.length ? ` of ${store.applications.length}` : ''})`}
      action={<Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}><UserPlus className="size-4" />Add ISO</Button>}
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ISO, contact, email…" className="h-9 sm:max-w-sm" />
        <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | IsoStatus)}>
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="docs_requested">Docs requested</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-slate-100 to-white hover:bg-transparent dark:from-slate-800/40 dark:to-transparent">
              <TableHead>ISO</TableHead>
              <TableHead className="text-right">Deals</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Manager</TableHead>
              <TableHead>Agreement</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No ISOs match.</TableCell>
              </TableRow>
            ) : null}
            {rows.map((a) => (
              <TableRow key={a.id} className="border-b border-border">
                <TableCell>
                  <button type="button" onClick={() => onOpenIso(a)} className="text-left">
                    <p className="flex items-center gap-2 font-medium text-primary hover:underline">
                      {a.company}
                      {(() => { const t = computeIsoScore(a.id, store).tier; return t !== 'Unrated' ? <TierChip tier={t} /> : null; })()}
                    </p>
                    <p className="text-xs text-muted-foreground">{[a.name, a.email, a.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
                  </button>
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{dealCountByIso.get(a.id) ?? 0}</TableCell>
                <TableCell className="text-muted-foreground">{fmtDate(a.submittedAt)}</TableCell>
                <TableCell className="text-muted-foreground">{a.manager ?? '—'}</TableCell>
                <TableCell><AgreementPill status={a.agreement} /></TableCell>
                <TableCell><StatusPill status={a.status} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <IconBtn title="Partner agreement" onClick={() => setDocuFor(a)}><FileSignature className="size-3.5" /></IconBtn>
                    <IconBtn title="Request docs" onClick={() => { setDocsFor(a); setDocsText(a.missingDocs ?? ''); }}><FileClock className="size-3.5" /></IconBtn>
                    <IconBtn title="Assign manager" onClick={() => { setMgrFor(a); setMgrText(a.manager ?? ''); }}><UserPlus className="size-3.5" /></IconBtn>
                    {a.status !== 'approved' && (
                      <IconBtn title="Approve" tone="emerald" onClick={() => void approve(a)}><CheckCircle2 className="size-3.5" /></IconBtn>
                    )}
                    {a.status !== 'rejected' && (
                      <IconBtn title="Reject" tone="red" onClick={() => void reject(a)}><XCircle className="size-3.5" /></IconBtn>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Request docs dialog */}
      <Dialog open={!!docsFor} onOpenChange={(o: boolean) => !o && setDocsFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Request documents — {docsFor?.company}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="docs">Documents needed</Label>
            <Input id="docs" value={docsText} onChange={(e) => setDocsText(e.target.value)} placeholder="e.g. W-9, voided check, bank statements" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDocsFor(null)}>Cancel</Button>
            <Button onClick={() => void saveDocs()}>Send request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign manager dialog */}
      <Dialog open={!!mgrFor} onOpenChange={(o: boolean) => !o && setMgrFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign ISO manager — {mgrFor?.company}</DialogTitle></DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="mgr">Manager</Label>
            <Input id="mgr" value={mgrText} onChange={(e) => setMgrText(e.target.value)} placeholder="Manager name" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMgrFor(null)}>Cancel</Button>
            <Button onClick={() => void saveMgr()}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add ISO (onboard) dialog */}
      <Dialog open={addOpen} onOpenChange={(o: boolean) => { if (!o) { setAddOpen(false); setForm(emptyForm); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Onboard new ISO</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="ISO company name" />
            </div>
            <div className="space-y-2">
              <Label>Contact name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contact@iso.com" />
            </div>
            <div className="space-y-2">
              <Label>Bank account no.</Label>
              <Input value={form.bankAccountNo} onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label>Routing number</Label>
              <Input value={form.routingNumber} onChange={(e) => setForm({ ...form, routingNumber: e.target.value })} placeholder="Optional" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Commission plan</Label>
              <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })}>
                <option value="">Assign later</option>
                {store.plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pointsPct}%)</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 sm:col-span-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
              <input type="checkbox" checked={form.sendAgreement} onChange={(e) => setForm({ ...form, sendAgreement: e.target.checked })} />
              <FileSignature className="size-4 text-muted-foreground" />
              Mark onboarding agreement as sent
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddOpen(false); setForm(emptyForm); }}>Cancel</Button>
            <Button disabled={creating} onClick={() => void createIso()}>{creating ? 'Saving…' : 'Add ISO'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocuSignDialog
        app={docuApp}
        onClose={() => setDocuFor(null)}
        update={(patch) => (docuApp ? actions.updateIso(docuApp, patch) : Promise.resolve(false))}
      />
    </SectionCard>
  );
}

/* Agreement tracker. Each step is saved on the ISO record; there is no ISO agreement
 * DocuSign template yet, so steps are recorded manually. */
function DocuSignDialog({ app, onClose, update }: {
  app: IsoApplication | null;
  onClose: () => void;
  update: (patch: IsoPatch) => Promise<boolean>;
}) {
  const [email, setEmail] = useState('');
  useEffect(() => { if (app) setEmail(app.agreementEmail ?? app.email ?? ''); }, [app]);
  if (!app) return null;

  const DOC = 'ISO Partner Agreement';
  const sent = app.agreement !== 'not_sent';

  const send = async () => {
    if (!email.trim()) { toast.error('Recipient email is required'); return; }
    const ok = await update({ agreementEmail: email.trim(), agreementSentAt: nowISO(), agreementViewedAt: null, agreementSignedAt: null });
    if (ok) toast.success(`Agreement marked as sent to ${email.trim()}`);
  };
  const markViewed = () => { void update({ agreementViewedAt: nowISO() }); };
  const markSigned = async () => {
    const ok = await update({ agreementSignedAt: nowISO(), agreementViewedAt: app.agreementViewedAt ?? nowISO() });
    if (ok) toast.success('Agreement signed');
  };

  const steps: { key: AgreementStatus; label: string; at?: string }[] = [
    { key: 'sent', label: 'Sent', at: app.agreementSentAt },
    { key: 'viewed', label: 'Viewed', at: app.agreementViewedAt },
    { key: 'signed', label: 'Signed', at: app.agreementSignedAt },
  ];
  const order: AgreementStatus[] = ['not_sent', 'sent', 'viewed', 'signed'];
  const curIdx = order.indexOf(app.agreement);

  return (
    <Dialog open={!!app} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Partner agreement — {app.company}</DialogTitle></DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <FileSignature className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            Send the <span className="font-medium text-foreground">{DOC}</span> to the ISO the usual way, then record each step here.
            The dates are saved on the ISO record.
          </span>
        </div>

        {/* Recipient + sent */}
        <div className="mt-3 space-y-2">
          <Label htmlFor="docu-email">Sent to</Label>
          <div className="flex gap-2">
            <Input id="docu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="signer@iso.com" />
            <Button className="shrink-0 gap-1.5" onClick={() => void send()}><Mail className="size-4" />{sent ? 'Mark re-sent' : 'Mark sent'}</Button>
          </div>
        </div>

        {/* Progress tracker */}
        {sent ? (
          <div className="mt-4 rounded-lg border border-border p-3">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Signing progress</p>
            <div className="flex items-center">
              {steps.map((s, i) => {
                const done = curIdx >= order.indexOf(s.key);
                return (
                  <div key={s.key} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center">
                      <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-semibold', done ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>
                        {done ? <CheckCircle2 className="size-4" /> : i + 1}
                      </span>
                      <span className="mt-1 text-[11px] text-foreground">{s.label}</span>
                      <span className="text-[10px] text-muted-foreground">{s.at ? fmtDate(s.at) : '—'}</span>
                    </div>
                    {i < steps.length - 1 ? <div className={cn('mx-1 h-0.5 flex-1', curIdx > order.indexOf(s.key) ? 'bg-emerald-500' : 'bg-muted')} /> : null}
                  </div>
                );
              })}
            </div>
            {app.agreement !== 'signed' ? (
              <div className="mt-3 flex items-center justify-end gap-2">
                {app.agreement === 'sent' ? <Button size="sm" variant="outline" onClick={markViewed}>Mark viewed</Button> : null}
                <Button size="sm" variant="outline" onClick={() => void markSigned()}>Mark signed</Button>
              </div>
            ) : (
              <p className="mt-3 text-right text-xs font-medium text-emerald-600 dark:text-emerald-400">Completed — agreement signed.</p>
            )}
          </div>
        ) : null}

        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ISO detail with Deals + Performance scorecard — rendered inline in the page. */
function IsoDetailView({ app, store, actions, onBack }: SectionProps & { app: IsoApplication; onBack: () => void }) {
  const [tab, setTab] = useState<'deals' | 'performance'>('deals');
  const [manageOpen, setManageOpen] = useState(false);
  const [scoringOpen, setScoringOpen] = useState(false);
  const deals = useMemo(() => store.deals.filter((d) => d.isoId === app.id), [app.id, store.deals]);
  const adjustments = useMemo(() => {
    const ids = new Set(deals.map((d) => d.id));
    return store.adjustments.filter((x) => ids.has(x.id));
  }, [deals, store.adjustments]);
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const scoreInfo = useMemo(() => computeIsoScore(app.id, store), [app.id, store]);
  const isTop = useMemo(() => topPerformer(store) === app.id, [store, app.id]);
  const badges = isTop ? [{ key: 'top', label: 'Top performer', tone: 'good' as const }, ...scoreInfo.badges] : scoreInfo.badges;

  const perf = useMemo(() => {
    const submissions = deals.length;
    const funded = deals.filter((d) => d.status === 'funded');
    const approved = deals.filter((d) => d.status === 'approved' || d.status === 'funded');
    const declined = deals.filter((d) => d.status === 'declined');
    const fundedAmt = funded.reduce((a, d) => a + d.funded, 0);
    const commissionPaid = funded.reduce((a, d) => a + d.commission, 0);
    const clawback = adjustments.reduce((a, x) => a + x.amount, 0);
    return {
      submissions,
      fundedCount: funded.length,
      fundedAmt,
      avgDealSize: funded.length ? fundedAmt / funded.length : 0,
      approvalRate: submissions ? (approved.length / submissions) * 100 : 0,
      subToFunded: submissions ? (funded.length / submissions) * 100 : 0,
      declined: declined.length,
      commissionPaid,
      clawback,
      clawbackPct: commissionPaid ? (clawback / commissionPaid) * 100 : 0,
      netRevenue: commissionPaid - clawback,
    };
  }, [deals, adjustments]);

  const money = (v: number) => formatUSD(v);
  const pct = (v: number) => `${v.toFixed(0)}%`;

  const scorecard: { area: string; rows: { label: string; value: string }[] }[] = [
    { area: 'Volume', rows: [
      { label: 'Submissions', value: String(perf.submissions) },
      { label: 'Funded deals', value: String(perf.fundedCount) },
      { label: 'Funded $', value: money(perf.fundedAmt) },
      { label: 'Avg deal size', value: money(perf.avgDealSize) },
      { label: 'Renewals funded', value: '—' },
    ] },
    { area: 'Conversion', rows: [
      { label: 'Approval rate', value: pct(perf.approvalRate) },
      { label: 'Submission→funded', value: pct(perf.subToFunded) },
      { label: 'Offer→contract', value: '—' },
      { label: 'Avg time to funding', value: '—' },
    ] },
    { area: 'Deal quality', rows: [
      { label: 'Default rate', value: '—' },
      { label: 'Early default (30/60/90d)', value: '—' },
      { label: 'NSF / returned', value: '—' },
      { label: 'Stacking / fraud flags', value: '—' },
      { label: 'Paid-off rate', value: '—' },
    ] },
    { area: 'Profitability', rows: [
      { label: 'Avg factor rate', value: '—' },
      { label: 'Commission paid', value: money(perf.commissionPaid) },
      { label: 'Clawback $', value: money(perf.clawback) },
      { label: 'Clawback % of commission', value: pct(perf.clawbackPct) },
      { label: 'Net revenue', value: money(perf.netRevenue) },
    ] },
    { area: 'Submission quality', rows: [
      { label: 'Complete-file rate', value: '—' },
      { label: 'Stips turnaround', value: '—' },
      { label: 'Duplicate submissions', value: String(scoreInfo.duplicates) },
    ] },
  ];

  const dealTone: Record<DealStatus, string> = {
    submitted: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    approved: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
    funded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    declined: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground" aria-label="Back to ISO portal">
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">{app.company}</h2>
              <TierChip tier={scoreInfo.tier} pinned={scoreInfo.tierPinned} />
              <span className="text-xs text-muted-foreground">score {scoreInfo.score}</span>
            </div>
            <p className="text-sm text-muted-foreground">{[app.name, app.email, app.phone].filter(Boolean).join(' · ') || 'No contact details'} · {app.commissionPct}% commission</p>
            {badges.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {badges.map((b) => <BadgeChip key={b.key} badge={b} />)}
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={app.status} />
          <select
            className="h-8 rounded-md border border-border bg-background px-2 text-sm"
            value={app.planId ?? ''}
            onChange={(e) => void actions.updateIso(app, { planId: e.target.value || null }).then((ok) => ok && toast.success('Commission plan updated'))}
            aria-label="Commission plan"
          >
            <option value="">No plan</option>
            {store.plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.pointsPct}%)</option>)}
          </select>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setManageOpen(true)}><Award className="size-4" />Recognition</Button>
        </div>
      </div>

      <ManageRecognitionDialog
        open={manageOpen}
        onClose={() => setManageOpen(false)}
        app={app}
        store={store}
        actions={actions}
      />
      <ScoringRulesDialog
        open={scoringOpen}
        onClose={() => setScoringOpen(false)}
        store={store}
        actions={actions}
        preview={scoreInfo}
      />

      <div className="pt-4">
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button type="button" onClick={() => setTab('deals')} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', tab === 'deals' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <ClipboardList className="size-4" />Deals ({deals.length})
          </button>
          <button type="button" onClick={() => setTab('performance')} className={cn('inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium', tab === 'performance' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <TrendingUp className="size-4" />Performance
          </button>
        </div>

        {tab === 'deals' ? (
          <div className="mt-3 rounded-lg border border-border">
            {deals.length ? (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-slate-100 to-white hover:bg-transparent dark:from-slate-800/40 dark:to-transparent">
                    <TableHead>Deal</TableHead><TableHead>Merchant</TableHead>
                    <TableHead className="text-right">Offer</TableHead><TableHead className="text-right">Commission</TableHead><TableHead>Status</TableHead><TableHead>Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deals.map((d) => (
                    <TableRow
                      key={d.id}
                      className="group cursor-pointer border-b border-border hover:bg-muted/40"
                      onClick={() => navigate(`/application-details/${d.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/application-details/${d.id}`); } }}
                      title={`Open deal ${d.dealId}`}
                    >
                      <TableCell className="font-medium text-primary group-hover:underline">{d.dealId}</TableCell>
                      <TableCell className="text-muted-foreground">{d.merchant}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(d.funded)}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">{d.commission ? money(d.commission) : '—'}</TableCell>
                      <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', dealTone[d.status])}>{d.status}</span></TableCell>
                      <TableCell className="text-xs capitalize text-muted-foreground">{d.payoutStatus ?? '—'}{d.payoutStatus === 'paid' && d.paidAt ? ` · ${fmtDate(d.paidAt)}` : ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No deals submitted by this ISO yet.</p>
            )}
          </div>
        ) : (
          <div className="mt-3 space-y-4">
            {/* KPI row */}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tier score</p>
                    <button type="button" onClick={() => setScoringOpen(true)} className="text-muted-foreground hover:text-foreground" title="View & edit scoring rules" aria-label="Edit scoring rules">
                      <Pencil className="size-3" />
                    </button>
                  </div>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{scoreInfo.score}<span className="text-sm text-muted-foreground">/100</span></p>
                </div>
                <TierChip tier={scoreInfo.tier} pinned={scoreInfo.tierPinned} />
              </div>
              <MiniStat icon={CircleDollarSign} label="Funded $" value={money(scoreInfo.fundedAmt)} />
              <MiniStat icon={TrendingUp} label="Approval rate" value={pct(scoreInfo.approvalPct)} />
              <MiniStat icon={CircleDollarSign} label="Net revenue" value={money(scoreInfo.netRevenue)} />
            </div>

            {/* Charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Score breakdown */}
              <div className="rounded-xl border border-border p-4">
                <p className="mb-3 text-sm font-semibold text-foreground">Score breakdown</p>
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart
                    layout="vertical"
                    data={[
                      { name: 'Volume', v: scoreInfo.components.volume },
                      { name: 'Conversion', v: scoreInfo.components.conversion },
                      { name: 'Profit', v: scoreInfo.components.profit },
                      { name: 'Submission', v: scoreInfo.components.submission },
                    ]}
                    margin={{ top: 2, right: 28, left: 8, bottom: 2 }}
                    barCategoryGap={10}
                  >
                    <defs>
                      {[
                        ['scVolume', '#7c3aed'],
                        ['scConversion', '#0284c7'],
                        ['scProfit', '#d97706'],
                        ['scSubmission', '#475569'],
                      ].map(([id, c]) => (
                        <linearGradient key={id} id={id} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={c} stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#ffffff" stopOpacity={0.9} />
                        </linearGradient>
                      ))}
                    </defs>
                    <CartesianGrid horizontal={false} stroke={isDark ? '#2A2B2F' : '#EEF1F6'} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: isDark ? '#d1d5db' : '#374151' }} axisLine={false} tickLine={false} />
                    <RTooltip formatter={(v) => [`${v ?? 0}/100`, 'Score'] as [string, string]} contentStyle={{ background: isDark ? '#141517' : '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="v" radius={[0, 4, 4, 0]} barSize={16} label={{ position: 'right', fontSize: 11, fill: isDark ? '#9ca3af' : '#6b7280' }}>
                      {['scVolume', 'scConversion', 'scProfit', 'scSubmission'].map((g, i) => <Cell key={i} fill={`url(#${g})`} stroke={['#7c3aed', '#0284c7', '#d97706', '#475569'][i]} strokeWidth={0.5} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Status mix donut */}
              <div className="rounded-xl border border-border p-4">
                <p className="mb-3 text-sm font-semibold text-foreground">Deal status mix</p>
                {(() => {
                  const mix = [
                    { name: 'Funded', value: scoreInfo.statusMix.funded, color: '#22c55e' },
                    { name: 'Approved', value: scoreInfo.statusMix.approved, color: '#0ea5e9' },
                    { name: 'Submitted', value: scoreInfo.statusMix.submitted, color: '#f59e0b' },
                    { name: 'Declined', value: scoreInfo.statusMix.declined, color: '#ef4444' },
                  ].filter((x) => x.value > 0);
                  return mix.length ? (
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width="55%" height={170}>
                        <PieChart>
                          <defs>
                            {mix.map((m) => (
                              <linearGradient key={m.name} id={`mix-${m.name}`} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor={m.color} stopOpacity={0.95} />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.85} />
                              </linearGradient>
                            ))}
                          </defs>
                          <Pie data={mix} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2}>
                            {mix.map((m) => <Cell key={m.name} fill={`url(#mix-${m.name})`} stroke={m.color} strokeWidth={1} />)}
                          </Pie>
                          <RTooltip contentStyle={{ background: isDark ? '#141517' : '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5">
                        {mix.map((m) => (
                          <div key={m.name} className="flex items-center gap-2 text-sm">
                            <span className="size-2.5 rounded-sm" style={{ background: m.color }} />
                            <span className="text-muted-foreground">{m.name}</span>
                            <span className="font-medium tabular-nums text-foreground">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <p className="py-10 text-center text-sm text-muted-foreground">No deals yet.</p>;
                })()}
              </div>
            </div>

            {/* Pipeline funnel */}
            <div className="rounded-xl border border-border p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">Pipeline funnel</p>
              {(() => {
                const total = perf.submissions || 0;
                const steps = [
                  { label: 'Submissions', n: total, color: '#8b5cf6' },
                  { label: 'Approved + funded', n: scoreInfo.statusMix.approved + scoreInfo.statusMix.funded, color: '#0ea5e9' },
                  { label: 'Funded', n: scoreInfo.statusMix.funded, color: '#22c55e' },
                ];
                return (
                  <div className="space-y-2">
                    {steps.map((s) => (
                      <div key={s.label} className="flex items-center gap-3">
                        <span className="w-36 shrink-0 text-xs text-muted-foreground">{s.label}</span>
                        <div className="h-6 flex-1 overflow-hidden rounded-md bg-muted/60">
                          <div
                            className="h-full rounded-md"
                            style={{
                              width: `${total ? (s.n / total) * 100 : 0}%`,
                              background: `linear-gradient(90deg, ${s.color}, #ffffff)`,
                              border: `1px solid ${s.color}`,
                            }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{s.n}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Scorecard detail */}
            <div className="grid gap-3 md:grid-cols-2">
              {scorecard.map((g) => (
                <div key={g.area} className="rounded-lg border border-border">
                  <p className="border-b border-border bg-gradient-to-r from-slate-100 to-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:from-slate-800/40 dark:to-transparent">{g.area}</p>
                  <div className="divide-y divide-border/60">
                    {g.rows.map((r) => (
                      <div key={r.label} className="flex items-center justify-between px-3 py-1.5 text-sm">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-medium tabular-nums text-foreground">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">Metrics shown as “—” need loan-performance data (defaults, NSF, timing, stips) wired from the servicing records.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ManageRecognitionDialog({ open, onClose, app, store, actions }: { open: boolean; onClose: () => void; app: IsoApplication; store: IsoStore; actions: PortalActions }) {
  const current = store.overrides[app.id] ?? { badges: [] };
  const pin = current.tier ?? 'auto';
  const manualBadges = current.badges;
  const [badgeDraft, setBadgeDraft] = useState('');

  useEffect(() => {
    if (open) setBadgeDraft('');
  }, [open]);

  const savePin = (v: string) => {
    void actions.updateIso(app, { tierOverride: v === 'auto' ? null : (v as Tier) });
  };
  const addBadge = async () => {
    const b = badgeDraft.trim();
    if (!b) return;
    if (manualBadges.includes(b)) { setBadgeDraft(''); return; }
    if (await actions.updateIso(app, { badges: [...manualBadges, b] })) setBadgeDraft('');
  };
  const removeBadge = (b: string) => {
    void actions.updateIso(app, { badges: manualBadges.filter((x) => x !== b) });
  };

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Recognition — {app.company}</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label>Tier</Label>
            <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={pin} onChange={(e) => savePin(e.target.value)}>
              <option value="auto">Auto (from score)</option>
              <option value="Bronze">Pin · Bronze</option>
              <option value="Silver">Pin · Silver</option>
              <option value="Gold">Pin · Gold</option>
              <option value="Platinum">Pin · Platinum</option>
            </select>
            <p className="text-[11px] text-muted-foreground">Auto tiers come from the composite score; pinning overrides it.</p>
          </div>
          <div className="space-y-2">
            <Label>Manual badges</Label>
            <div className="flex gap-2">
              <Input value={badgeDraft} onChange={(e) => setBadgeDraft(e.target.value)} placeholder="e.g. Strategic partner" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addBadge(); } }} />
              <Button type="button" variant="secondary" onClick={() => void addBadge()}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {manualBadges.length ? manualBadges.map((b) => (
                <span key={b} className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                  {b}
                  <button type="button" onClick={() => removeBadge(b)} aria-label={`Remove ${b}`}><XCircle className="size-3" /></button>
                </span>
              )) : <span className="text-xs text-muted-foreground">No manual badges.</span>}
            </div>
          </div>
        </div>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScoringRulesDialog({ open, onClose, store, actions, preview }: {
  open: boolean; onClose: () => void; store: IsoStore; actions: PortalActions; preview: IsoScore;
}) {
  const [saving, setSaving] = useState(false);
  const [cfg, setCfg] = useState<ScoringConfig>(store.scoring ?? DEFAULT_SCORING);
  useEffect(() => { if (open) setCfg(store.scoring ?? DEFAULT_SCORING); }, [open, store.scoring]);

  const wSum = cfg.weights.volume + cfg.weights.conversion + cfg.weights.quality + cfg.weights.profit + cfg.weights.submission;
  const comps = preview.components;
  const previewScore = wSum
    ? Math.round((comps.volume * cfg.weights.volume + comps.conversion * cfg.weights.conversion + comps.quality * cfg.weights.quality + comps.profit * cfg.weights.profit + comps.submission * cfg.weights.submission) / wSum)
    : 0;

  const setW = (k: keyof ScoringWeights, v: number) => setCfg((c) => ({ ...c, weights: { ...c.weights, [k]: Math.max(0, v) } }));
  const setTh = (k: 'platinum' | 'gold' | 'silver', v: number) => setCfg((c) => ({ ...c, thresholds: { ...c.thresholds, [k]: Math.max(0, Math.min(100, v)) } }));

  const save = async () => {
    setSaving(true);
    const ok = await actions.saveScoring(cfg);
    setSaving(false);
    if (!ok) return;
    toast.success('Scoring rules saved — all ISO tiers recalculated');
    onClose();
  };
  const reset = () => setCfg(DEFAULT_SCORING);

  const weightRows: { key: keyof ScoringWeights; label: string; comp: number }[] = [
    { key: 'volume', label: 'Volume', comp: comps.volume },
    { key: 'conversion', label: 'Conversion', comp: comps.conversion },
    { key: 'quality', label: 'Quality', comp: comps.quality },
    { key: 'profit', label: 'Profit', comp: comps.profit },
    { key: 'submission', label: 'Submission', comp: comps.submission },
  ];

  return (
    <Dialog open={open} onOpenChange={(o: boolean) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Tier scoring rules</DialogTitle></DialogHeader>
        <p className="-mt-1 text-xs text-muted-foreground">Weights apply to all ISOs. Each component is scored 0–100; the composite is the weighted average. “This ISO” shows the current component values.</p>

        <div className="mt-2 rounded-lg border border-border">
          <div className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Component</span><span className="text-right">Weight %</span><span className="text-right">This ISO</span>
          </div>
          {weightRows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-2 border-b border-border/60 px-3 py-2 text-sm last:border-b-0">
              <span className="text-foreground">{r.label}</span>
              <Input type="number" className="h-8 text-right" value={cfg.weights[r.key]} onChange={(e) => setW(r.key, Number(e.target.value) || 0)} />
              <span className="text-right tabular-nums text-muted-foreground">{r.comp}/100</span>
            </div>
          ))}
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-muted-foreground">Total weight {wSum}{wSum !== 100 ? ' (normalized)' : ''}</span>
            <span className="font-semibold text-foreground">Preview score: {previewScore}/100</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Platinum ≥</Label>
            <Input type="number" className="h-8" value={cfg.thresholds.platinum} onChange={(e) => setTh('platinum', Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Gold ≥</Label>
            <Input type="number" className="h-8" value={cfg.thresholds.gold} onChange={(e) => setTh('gold', Number(e.target.value) || 0)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Silver ≥</Label>
            <Input type="number" className="h-8" value={cfg.thresholds.silver} onChange={(e) => setTh('silver', Number(e.target.value) || 0)} />
          </div>
        </div>
        <div className="mt-2 space-y-1">
          <Label className="text-xs">Min funded deals to be rated</Label>
          <Input type="number" className="h-8 w-28" value={cfg.minFunded} onChange={(e) => setCfg((c) => ({ ...c, minFunded: Math.max(0, Number(e.target.value) || 0) }))} />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={reset}>Reset to default</Button>
          <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save rules'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function IconBtn({ children, title, onClick, tone }: { children: React.ReactNode; title: string; onClick: () => void; tone?: 'emerald' | 'red' }) {
  const toneCls = tone === 'emerald'
    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300'
    : tone === 'red'
      ? 'border-red-300 text-red-700 hover:bg-red-50 dark:text-red-300'
      : 'border-border text-foreground hover:bg-muted/60';
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className={cn('inline-flex size-7 items-center justify-center rounded-md border transition-colors', toneCls)}>
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------------------
 * 2. Commission plans
 * -------------------------------------------------------------------------- */

function CommissionPlans({ store, actions }: SectionProps) {
  const [edit, setEdit] = useState<CommissionPlan | null>(null);
  const [draft, setDraft] = useState<CommissionPlan | null>(null);

  const [saving, setSaving] = useState(false);
  const planUsage = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of store.applications) if (a.planId) m.set(a.planId, (m.get(a.planId) ?? 0) + 1);
    return m;
  }, [store.applications]);

  const openNew = () => setDraft({ id: '', name: '', pointsPct: 8, basis: 'on_collection', renewalPct: 4, capAmount: 0 });
  const openEdit = (p: CommissionPlan) => { setEdit(p); setDraft({ ...p }); };
  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error('Plan name is required'); return; }
    setSaving(true);
    const ok = await actions.savePlan({ ...draft, name: draft.name.trim() });
    setSaving(false);
    if (!ok) return;
    toast.success('Plan saved');
    setDraft(null); setEdit(null);
  };
  const remove = async (p: CommissionPlan) => {
    const used = planUsage.get(p.id) ?? 0;
    if (!window.confirm(`Delete plan "${p.name}"?${used ? ` ${used} ISO(s) using it will be left without a plan.` : ''}`)) return;
    if (await actions.deletePlan(p)) toast.info('Plan deleted');
  };

  return (
    <SectionCard
      title={`Commission plans (${store.plans.length})`}
      action={<Button size="sm" className="gap-1.5" onClick={openNew}><Plus className="size-4" />New plan</Button>}
    >
      <p className="mb-3 text-xs text-muted-foreground">When you onboard an ISO, the chosen plan's points % is saved as that ISO's commission %. Assign or change a plan from the ISO's page.</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-slate-100 to-white hover:bg-transparent dark:from-slate-800/40 dark:to-transparent">
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Points %</TableHead>
              <TableHead>Basis</TableHead>
              <TableHead className="text-right">Renewal %</TableHead>
              <TableHead className="text-right">Cap</TableHead>
              <TableHead className="text-right">ISOs</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {store.plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No commission plans yet. Create one with “New plan”.</TableCell>
              </TableRow>
            ) : null}
            {store.plans.map((p) => (
              <TableRow key={p.id} className="border-b border-border">
                <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                <TableCell className="text-right tabular-nums">{p.pointsPct}%</TableCell>
                <TableCell className="text-muted-foreground">{p.basis === 'upfront' ? 'Upfront' : 'On collection'}</TableCell>
                <TableCell className="text-right tabular-nums">{p.renewalPct}%</TableCell>
                <TableCell className="text-right tabular-nums">{p.capAmount > 0 ? formatUSD(p.capAmount) : 'None'}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{planUsage.get(p.id) ?? 0}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <IconBtn title="Edit" onClick={() => openEdit(p)}><Pencil className="size-3.5" /></IconBtn>
                    <IconBtn title="Delete" tone="red" onClick={() => void remove(p)}><XCircle className="size-3.5" /></IconBtn>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!draft} onOpenChange={(o: boolean) => !o && (setDraft(null), setEdit(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{edit ? 'Edit' : 'New'} commission plan</DialogTitle></DialogHeader>
          {draft && (
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Plan name</Label>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Points %</Label>
                <Input type="number" step="0.1" value={draft.pointsPct} onChange={(e) => setDraft({ ...draft, pointsPct: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Basis</Label>
                <select className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm" value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value as CommissionBasis })}>
                  <option value="on_collection">On collection</option>
                  <option value="upfront">Upfront</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Renewal %</Label>
                <Input type="number" step="0.1" value={draft.renewalPct} onChange={(e) => setDraft({ ...draft, renewalPct: Number(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Cap ($, 0 = none)</Label>
                <Input type="number" value={draft.capAmount} onChange={(e) => setDraft({ ...draft, capAmount: Number(e.target.value) || 0 })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDraft(null); setEdit(null); }}>Cancel</Button>
            <Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save plan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

/* ----------------------------------------------------------------------------
 * 4. Payout batches
 * -------------------------------------------------------------------------- */

function Payouts({ store, actions }: SectionProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | PayoutStatus>('draft');
  const [payingId, setPayingId] = useState<string | null>(null);
  const visible = useMemo(
    () => (statusFilter === 'all' ? store.payouts : store.payouts.filter((p) => p.status === statusFilter)),
    [store.payouts, statusFilter],
  );

  const approve = async (p: PayoutBatch) => {
    setPayingId(p.id);
    const ok = await actions.setBatchApproved(p, true);
    setPayingId(null);
    if (ok) toast.success('Payout approved');
  };
  const unapprove = async (p: PayoutBatch) => {
    setPayingId(p.id);
    await actions.setBatchApproved(p, false);
    setPayingId(null);
  };
  const markPaid = async (p: PayoutBatch) => {
    if (!window.confirm(`Mark ${p.unpaidApplicationIds.length} deal payout(s) for ${p.iso} (${p.period}) as paid?`)) return;
    setPayingId(p.id);
    const ok = await actions.markBatchPaid(p);
    setPayingId(null);
    if (ok) {
      toast.success('Payout marked paid');
    }
  };

  const exportCsv = (scope: 'all' | 'approved') => {
    const rows = store.payouts.filter((p) => (scope === 'approved' ? p.status === 'approved' : true));
    if (!rows.length) { toast.error('Nothing to export'); return; }
    const header = ['Period', 'ISO', 'Gross', 'Clawback', 'Net', 'Status'];
    const body = rows.map((p) => [p.period, p.iso, p.gross.toFixed(2), p.clawback.toFixed(2), (p.gross - p.clawback).toFixed(2), p.status]);
    const csv = [header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `iso-payouts-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const net = (p: PayoutBatch) => Math.max(0, p.gross - p.clawback);

  return (
    <SectionCard
      title={`Payout batches (${store.payouts.length})`}
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => exportCsv('approved')}><Download className="size-4" />Export approved</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => exportCsv('all')}><Download className="size-4" />Export all</Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Funded deals grouped per ISO per month. Approve, export to accounting / ACH, then mark paid (saved to each deal's payout record). Net = gross commission − clawbacks.</p>
        <select className="h-8 rounded-md border border-border bg-background px-2 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | PayoutStatus)}>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
          <option value="all">All</option>
        </select>
      </div>
      <div className="max-h-[36rem] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-slate-100 to-white hover:bg-transparent dark:from-slate-800/40 dark:to-transparent">
              <TableHead>Period</TableHead><TableHead>ISO</TableHead>
              <TableHead className="text-right">Gross</TableHead><TableHead className="text-right">Clawback</TableHead>
              <TableHead className="text-right">Net</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No {statusFilter === 'all' ? '' : `${statusFilter} `}payouts.</TableCell>
              </TableRow>
            ) : null}
            {visible.map((p) => (
              <TableRow key={p.id} className="border-b border-border">
                <TableCell className="text-muted-foreground">{p.period}</TableCell>
                <TableCell className="font-medium text-foreground">{p.iso}</TableCell>
                <TableCell className="text-right tabular-nums">{formatUSD(p.gross)}</TableCell>
                <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">{p.clawback ? `−${formatUSD(p.clawback)}` : '—'}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">{formatUSD(net(p))}</TableCell>
                <TableCell>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium',
                    p.status === 'paid' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : p.status === 'approved' ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300')}>
                    {p.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {p.status === 'draft' ? (
                    <Button size="sm" variant="outline" onClick={() => void approve(p)} disabled={payingId === p.id}>Approve</Button>
                  ) : p.status === 'approved' ? (
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => void unapprove(p)} disabled={payingId === p.id}>Undo</Button>
                      <Button size="sm" onClick={() => void markPaid(p)} disabled={payingId === p.id}>{payingId === p.id ? 'Saving…' : 'Mark paid'}</Button>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

/* ----------------------------------------------------------------------------
 * 5. Reports
 * -------------------------------------------------------------------------- */

const ISO_REPORTS: { name: string; email: 'Yes' | 'No' | 'Optional' | 'Summary only'; freq: string; shows: string }[] = [
  { name: 'Pipeline report', email: 'Yes', freq: 'Weekly', shows: 'Open deals by stage, days in stage, pending stips, offers awaiting contracts' },
  { name: 'Funding report', email: 'Yes', freq: 'Weekly / monthly', shows: 'Deals funded, funded $, payback $, factor, term, points' },
  { name: 'Commission statement', email: 'Yes', freq: 'Per payout', shows: 'Commission per deal, adjustments, clawbacks netted, net payout, payment reference' },
  { name: 'Clawback report', email: 'Yes', freq: 'Monthly', shows: 'Clawbacks by deal, reason, amount, date, recovered vs outstanding balance' },
  { name: 'Portfolio performance', email: 'Summary only', freq: 'Monthly', shows: 'Funded deals by status: current, late, default, paid off; % collected' },
  { name: 'Renewal opportunities', email: 'Yes', freq: 'Weekly', shows: 'Merchants at 50%+ paid down and in good standing, eligible for renewal' },
  { name: 'Declined deals', email: 'Yes', freq: 'Monthly', shows: 'Declines by reason, to coach ISOs on what to submit' },
  { name: 'Sales rep report', email: 'Optional', freq: 'Monthly', shows: 'Submissions, funded volume and commission per rep' },
  { name: 'ISO ranking & scorecard', email: 'No', freq: 'Monthly / quarterly', shows: 'All ISOs side by side on volume, approval rate, default rate, clawback %, tier' },
  { name: 'Early-default cohort', email: 'No', freq: 'Monthly', shows: 'Defaults within 30/60/90 days by ISO and funding month' },
  { name: 'Risk & fraud flags', email: 'No', freq: 'Live', shows: 'Stacking, duplicate submissions, NSF spikes, document issues by ISO' },
  { name: 'Payout & liability report', email: 'No', freq: 'Per payout', shows: 'Commissions owed, approved, paid, and clawback balances across all ISOs' },
  { name: 'Year-end tax report', email: 'Yes', freq: 'Annual', shows: 'Total commissions paid per ISO, 1099' },
];

function emailPillCls(v: string): string {
  if (v === 'Yes') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300';
  if (v === 'No') return 'bg-muted text-muted-foreground';
  return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'; // Optional / Summary only
}

type ReportData = { columns: string[]; rows: (string | number)[][]; note?: string };

/** Generate a report's rows from the portal data. */
function buildReport(name: string, store: IsoStore): ReportData {
  const m = (v: number) => formatUSD(v);
  const deals = store.deals;
  const dealsByIso = new Map<string, IsoDeal[]>();
  for (const d of deals) dealsByIso.set(d.isoId, [...(dealsByIso.get(d.isoId) ?? []), d]);
  const isoIds = [...dealsByIso.keys()];
  const byIso = (isoId: string) => dealsByIso.get(isoId) ?? [];
  const isoName = (isoId: string) => byIso(isoId)[0]?.iso ?? '—';

  switch (name) {
    case 'Pipeline report':
      return {
        columns: ['ISO', 'Deal', 'Merchant', 'Stage', 'Requested $'],
        rows: deals.filter((d) => d.status === 'submitted' || d.status === 'approved').map((d) => [d.iso, d.dealId, d.merchant, d.status, m(d.funded)]),
      };
    case 'Funding report':
      return {
        columns: ['ISO', 'Deal', 'Merchant', 'Funded $', 'Commission'],
        rows: deals.filter((d) => d.status === 'funded').map((d) => [d.iso, d.dealId, d.merchant, m(d.funded), m(d.commission)]),
      };
    case 'Commission statement': {
      const rows = deals.filter((d) => d.status === 'funded').map((d) => [d.iso, d.dealId, d.merchant, m(d.commission)]);
      store.adjustments.forEach((x) => rows.push([x.iso, '—', `Clawback: ${x.reason || 'adjustment'}`, `−${m(x.amount)}`]));
      return { columns: ['ISO', 'Deal', 'Line', 'Amount'], rows };
    }
    case 'Clawback report':
      return {
        columns: ['Date', 'ISO', 'Amount', 'Reason'],
        rows: store.adjustments.map((x) => [fmtDate(x.createdAt), x.iso, `−${m(x.amount)}`, x.reason || '—']),
        note: store.adjustments.length ? undefined : 'No clawbacks posted yet.',
      };
    case 'Portfolio performance':
      return {
        columns: ['ISO', 'Submitted', 'Approved', 'Funded', 'Declined'],
        rows: isoIds.map((id) => {
          const d = byIso(id);
          return [isoName(id), d.filter((x) => x.status === 'submitted').length, d.filter((x) => x.status === 'approved').length, d.filter((x) => x.status === 'funded').length, d.filter((x) => x.status === 'declined').length];
        }),
        note: 'Current/late/default/paid-off split needs servicing data (not yet wired).',
      };
    case 'Renewal opportunities':
      return { columns: ['ISO', 'Deal', 'Merchant', 'Funded $'], rows: deals.filter((d) => d.status === 'funded').map((d) => [d.iso, d.dealId, d.merchant, m(d.funded)]), note: 'Eligibility (50%+ paid down, good standing) needs paydown data.' };
    case 'Declined deals':
      return { columns: ['ISO', 'Deal', 'Merchant', 'Requested $'], rows: deals.filter((d) => d.status === 'declined').map((d) => [d.iso, d.dealId, d.merchant, m(d.funded)]), note: 'Decline reasons need the underwriting outcome field.' };
    case 'Sales rep report':
      return { columns: ['Rep', 'Submissions', 'Funded', 'Commission'], rows: [], note: 'No per-rep data captured yet.' };
    case 'ISO ranking & scorecard': {
      const top = topPerformer(store);
      const ranked = isoIds
        .map((id) => ({ id, sc: computeIsoScore(id, store) }))
        .sort((a, b) => b.sc.score - a.sc.score);
      return {
        columns: ['ISO', 'Tier', 'Score', 'Submissions', 'Funded', 'Approval %', 'Funded $', 'Clawback %', 'Top'],
        rows: ranked.map(({ id, sc }) => [
          isoName(id), sc.tier, sc.score, byIso(id).length, sc.fundedCount, `${Math.round(sc.approvalPct)}%`, m(sc.fundedAmt), `${sc.clawbackPct.toFixed(1)}%`, id === top ? '🏆' : '',
        ]),
      };
    }
    case 'Early-default cohort':
      return { columns: ['ISO', 'Funding month', '30d', '60d', '90d'], rows: [], note: 'Default timing needs servicing data (not yet wired).' };
    case 'Risk & fraud flags': {
      const rows: (string | number)[][] = [];
      for (const id of isoIds) {
        const byMerchant = new Map<string, IsoDeal[]>();
        for (const d of byIso(id)) {
          const key = d.merchant.trim().toLowerCase();
          if (!key || key === '—') continue;
          byMerchant.set(key, [...(byMerchant.get(key) ?? []), d]);
        }
        for (const list of byMerchant.values()) {
          if (list.length < 2) continue;
          rows.push([isoName(id), 'Duplicate submission', `${list[0]!.merchant}: ${list.length} submissions (${list.map((d) => d.dealId).join(', ')})`]);
        }
      }
      return { columns: ['ISO', 'Flag', 'Detail'], rows, note: 'Stacking and NSF flags need servicing data (not yet wired).' };
    }
    case 'Payout & liability report':
      return { columns: ['Period', 'ISO', 'Gross', 'Clawback', 'Net', 'Status'], rows: store.payouts.map((p) => [p.period, p.iso, m(p.gross), m(p.clawback), m(Math.max(0, p.gross - p.clawback)), p.status]) };
    case 'Year-end tax report':
      return {
        columns: ['ISO', `Commissions paid in ${new Date().getFullYear()}`, '1099'],
        rows: isoIds.map((id) => {
          const year = new Date().getFullYear();
          const paid = byIso(id)
            .filter((x) => x.payoutStatus === 'paid' && x.paidAt && new Date(x.paidAt).getFullYear() === year)
            .reduce((a, x) => a + x.commission, 0);
          return [isoName(id), m(paid), paid >= 600 ? 'Required' : 'Not required'];
        }),
      };
    default:
      return { columns: [], rows: [], note: 'Report not available.' };
  }
}

function downloadReportCsv(name: string, data: ReportData) {
  const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = [data.columns, ...data.rows].map((r) => r.map(esc).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports({ store }: SectionProps) {
  const [open, setOpen] = useState<string>(ISO_REPORTS[0]!.name);
  const meta = useMemo(() => ISO_REPORTS.find((r) => r.name === open) ?? null, [open]);
  const data = useMemo(() => (open ? buildReport(open, store) : null), [open, store]);

  const download = () => {
    if (!open || !data) return;
    downloadReportCsv(open, data);
    toast.success('CSV downloaded');
  };

  return (
    <SectionCard
      title="ISO reports"
      action={
        data && data.rows.length ? (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={download}>
            <Download className="size-4" />Download CSV
          </Button>
        ) : undefined
      }
    >
      {/* Report picker */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="report-select" className="text-xs text-muted-foreground">Select a report</Label>
          <select
            id="report-select"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={open}
            onChange={(e) => setOpen(e.target.value)}
          >
            {ISO_REPORTS.map((r) => (
              <option key={r.name} value={r.name}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Meta row */}
      {meta ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Frequency <span className="font-medium text-foreground">{meta.freq}</span></span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            Email to ISO
            <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', emailPillCls(meta.email))}>
              {meta.email === 'Yes' ? <Mail className="size-3" /> : null}{meta.email}
            </span>
          </span>
          <span className="min-w-0 flex-1 text-muted-foreground">{meta.shows}</span>
        </div>
      ) : null}

      {/* Preview */}
      {data ? (
        <div className="mt-4">
          {data.note ? (
            <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">{data.note}</p>
          ) : null}
          {data.rows.length ? (
            <>
              <div className="max-h-[28rem] overflow-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="sticky top-0 bg-gradient-to-r from-slate-100 to-white hover:bg-transparent dark:from-slate-800/40 dark:to-transparent">
                      {data.columns.map((c) => <TableHead key={c}>{c}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row, i) => (
                      <TableRow key={i} className="border-b border-border">
                        {row.map((cell, j) => <TableCell key={j} className={cn(j === 0 ? 'font-medium text-foreground' : 'text-muted-foreground', 'tabular-nums')}>{cell}</TableCell>)}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-right text-xs text-muted-foreground">{data.rows.length} row(s)</p>
            </>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No rows to show for this report yet.</p>
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
