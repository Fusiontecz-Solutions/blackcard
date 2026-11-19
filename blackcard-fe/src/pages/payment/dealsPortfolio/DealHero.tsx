import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDollarSign,
  Clock,
  ExternalLink,
  History,
  Landmark,
  Repeat,
  Scale,
  Wallet,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTheme } from '@/context/ThemeContext';
import { cn, formatCurrency, formatCurrencyFull, formatDateMonthDayYear } from '@/lib/utils';
import { CornerSummaryCard } from '@/pages/commissionPortal/CornerSummaryCard';
import { useDealDetail } from './useDealDetail';
import { HEALTH_LABEL, type DealDetailDeal, type DealDetailResponse } from './portfolioApi';
import { DealPaydownChart, MerchantPaybackRing, MotionPaybackBar, fadeUp, listStagger } from './portfolioViz';
import { DealTagSelect, DealTagPill } from '../DealTagSelect';

const fmtDate = (v: string | null | undefined) => (v ? formatDateMonthDayYear(v) : '—');
const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`);
const money = (v: number | null | undefined) => formatCurrency(v, { fallback: '—' });

const CARD_SHADOW = 'shadow-[0px_10px_28px_0px_rgba(2,6,23,0.10)]';

type DealStateCard = {
  title: string;
  icon: ReactNode;
  countValue: string;
  countSuffix: string;
  footLeft: string;
  amountValue: string;
  footNote?: string;
  footNoteClassName?: string;
  toneClassName?: string;
};

const FIGURE_SKELETONS: DealStateCard[] = Array.from({ length: 7 }, (_, i) => ({
  title: `Metric ${i + 1}`,
  icon: <CircleDollarSign className="h-6 w-6 text-muted-foreground" />,
  countValue: '—',
  countSuffix: '—',
  footLeft: '—',
  amountValue: '—',
}));

function dealStateCards(d: DealDetailDeal): DealStateCard[] {
  const paidOff = d.health === 'paid_off';
  const overdueAmount = paidOff ? 0 : d.overdueAmount;
  const overdueCount = paidOff ? 0 : d.overdueCount;
  const remainingCount = paidOff ? 0 : d.remainingCount;
  const hasExceptions =
    !paidOff && (d.failedCount > 0 || d.debitCount > 0 || overdueCount > 0 || overdueAmount > 0);
  const abovePrincipal = d.repaid - d.funded;
  const factor = d.factorRate ?? (d.funded > 0 ? d.payback / d.funded : null);
  return [
    {
      title: 'Funded',
      icon: <Landmark className="h-6 w-6 text-sky-500" />,
      countValue: money(d.funded),
      countSuffix: 'Advanced',
      footLeft: 'Funded date',
      amountValue: fmtDate(d.dates.fundedAt),
    },
    {
      title: 'Total repayment',
      icon: <Wallet className="h-6 w-6 text-[var(--brand)]" />,
      countValue: money(d.payback),
      countSuffix: 'Total due',
      footLeft: 'Factor',
      amountValue: factor != null ? `${factor.toFixed(3)}x` : '—',
    },
    {
      title: 'Above principal',
      icon: <Scale className={cn('h-6 w-6', abovePrincipal < -0.005 ? 'text-red-500' : 'text-emerald-500')} />,
      countValue: money(abovePrincipal),
      countSuffix: abovePrincipal < -0.005 ? 'Not yet recovered' : 'Recovered above funded',
      footLeft: 'Is funded',
      amountValue: money(d.funded),
      toneClassName:
        abovePrincipal < -0.005
          ? 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30'
          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
    },
    {
      title: 'Installment',
      icon: <Repeat className="h-6 w-6 text-sky-500" />,
      countValue: d.installment ? money(d.installment) : '—',
      countSuffix: d.frequency?.trim() || 'Per period',
      footLeft: 'Remaining payments',
      amountValue: `${remainingCount}`,
    },
    {
      title: 'Next payment',
      icon: <Clock className="h-6 w-6 text-sky-500" />,
      countValue: paidOff ? 'Complete' : fmtDate(d.nextPaymentDate),
      countSuffix: paidOff ? 'Paid off' : 'Date due',
      footLeft: 'Amount due',
      amountValue: money(paidOff ? 0 : d.nextPaymentAmount),
      footNote: overdueAmount > 0 ? `${money(overdueAmount)} overdue` : undefined,
      footNoteClassName: overdueAmount > 0 ? 'text-red-500' : undefined,
    },
    {
      title: 'Last payment',
      icon: <History className="h-6 w-6 text-amber-500" />,
      countValue: fmtDate(d.lastPaymentDate),
      countSuffix: 'Date received',
      footLeft: 'Amount collected',
      amountValue: money(d.lastPaymentAmount),
    },
    {
      title: 'Failed / debit',
      icon: <AlertTriangle className={cn('h-6 w-6', hasExceptions ? 'text-red-500' : 'text-muted-foreground')} />,
      countValue: `${d.failedCount} / ${d.debitCount ?? 0}`,
      countSuffix: 'Failed / debit',
      footLeft: 'Debit amount',
      amountValue: money(d.debitAmount ?? 0),
      footNote: d.failedAmount > 0 ? `${money(d.failedAmount)} failed` : undefined,
      footNoteClassName: hasExceptions ? 'text-red-500' : undefined,
    },
  ];
}

function Timeline({ deal }: { deal: DealDetailDeal }) {
  const steps = [
    { label: 'Created', at: deal.dates.createdAt },
    { label: 'Approved', at: deal.dates.approvedAt },
    { label: 'Contract sent', at: deal.dates.contractSentAt },
    { label: 'Signed', at: deal.dates.contractSignedAt },
    { label: 'Funded', at: deal.dates.fundedAt },
    { label: deal.health === 'paid_off' ? 'Paid off' : 'Payoff est.', at: deal.health === 'paid_off' ? deal.lastPaymentDate : deal.expectedPayoffDate, future: deal.health !== 'paid_off' },
  ];
  return (
    <ol className="flex h-full min-h-[9.5rem] flex-1 items-stretch gap-1 sm:gap-2">
      {steps.map((s, i) => {
        const done = !!s.at && !s.future;
        return (
          <li key={s.label} className="relative flex min-w-0 flex-1 flex-col items-center text-center">
            {i < steps.length - 1 ? (
              <span className="absolute left-[calc(50%+14px)] right-[calc(-50%+14px)] top-[13px] hidden h-0.5 bg-border sm:block" aria-hidden />
            ) : null}
            <span className="relative z-[1] flex size-7 shrink-0 items-center justify-center rounded-full bg-card">
              {done ? (
                <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Circle className={cn('size-7', s.at ? 'text-[var(--brand)]' : 'text-muted-foreground/35')} />
              )}
            </span>
            <div
              className={cn(
                'mt-2 w-full break-words px-0.5 text-xs font-semibold leading-tight sm:text-[13px]',
                done ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.label}
            </div>
            <div className="mt-0.5 w-full truncate text-[11px] text-muted-foreground">{fmtDate(s.at)}</div>
            <span
              className={cn(
                'mt-2 w-px min-h-10 flex-1',
                done ? 'bg-emerald-500/50' : s.at ? 'bg-[var(--brand)]/35' : 'bg-border',
              )}
              aria-hidden
            />
          </li>
        );
      })}
    </ol>
  );
}

const SCHEDULE_TONES = {
  paid: 'bg-emerald-500',
  failed: 'bg-red-500',
  debit: 'bg-indigo-600',
  overdue: 'bg-amber-500',
  waived: 'bg-slate-400',
  upcoming: 'bg-sky-400',
} as const;

function scheduleTone(status: string) {
  if (status === 'paid') return SCHEDULE_TONES.paid;
  if (status === 'failed') return SCHEDULE_TONES.failed;
  if (status === 'debit') return SCHEDULE_TONES.debit;
  if (status === 'overdue') return SCHEDULE_TONES.overdue;
  if (status === 'waived') return SCHEDULE_TONES.waived;
  return SCHEDULE_TONES.upcoming;
}

function ScheduleSummary({
  schedule,
  paidOff,
  payback,
  isDark,
}: {
  schedule: DealDetailResponse['schedule'];
  paidOff: boolean;
  payback: number;
  isDark: boolean;
}) {
  const c = schedule.counts;
  const segments = [
    { label: 'Paid', count: c.paid, color: SCHEDULE_TONES.paid },
    { label: 'Failed', count: c.failed, color: SCHEDULE_TONES.failed },
    { label: 'Debit', count: c.debit ?? 0, color: SCHEDULE_TONES.debit },
    { label: 'Overdue', count: paidOff ? 0 : c.overdue, color: SCHEDULE_TONES.overdue },
    { label: 'Upcoming', count: paidOff ? 0 : c.scheduled, color: SCHEDULE_TONES.upcoming },
  ];
  const total = segments.reduce((a, s) => a + s.count, 0);
  const strip = schedule.strip;
  const first = strip[0]?.date;
  const last = strip[strip.length - 1]?.date;
  return (
    <div className={cn('rounded-md border p-4', isDark ? 'border-[#2A2B2F]' : 'border-[#E8EBF2]')}>
      <div className="mb-2 text-sm font-semibold text-foreground">Schedule</div>
      <div className={cn('flex h-3 w-full overflow-hidden rounded-full', isDark ? 'bg-[#1f2023]' : 'bg-[#EEF1F6]')}>
        {total > 0
          ? segments.map((s) =>
              s.count > 0 ? (
                <motion.span
                  key={s.label}
                  className={cn('h-full', s.color)}
                  initial={{ width: 0 }}
                  animate={{ width: `${(s.count / total) * 100}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                  title={`${s.label}: ${s.count}`}
                />
              ) : null,
            )
          : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={cn('size-2.5 shrink-0 rounded-[2px]', s.color)} aria-hidden />
              {s.label} <span className="font-medium tabular-nums text-foreground">{s.count}</span>
            </span>
          ))}
        </div>
        <span className="tabular-nums">{total} {total === 1 ? 'payment' : 'payments'}</span>
      </div>
      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Payment history ({strip.length})</span>
          {first && last ? (
            <span className="tabular-nums">
              {formatDateMonthDayYear(first)} → {formatDateMonthDayYear(last)}
            </span>
          ) : null}
        </div>
        <ScheduleStrip strip={strip} payback={payback} />
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  paid: 'Paid',
  failed: 'Failed',
  debit: 'Debit',
  overdue: 'Overdue',
  waived: 'Waived',
  upcoming: 'Upcoming',
  scheduled: 'Upcoming',
};

function ScheduleStrip({ strip, payback }: { strip: DealDetailResponse['schedule']['strip']; payback: number }) {
  const [hover, setHover] = useState<{ i: number; left: number; top: number } | null>(null);
  const repaidToDate = useMemo(() => {
    let sum = 0;
    return strip.map((p) => {
      if (p.status === 'paid') sum += p.amount;
      return sum;
    });
  }, [strip]);
  if (!strip.length) return <p className="text-xs text-muted-foreground">No payment schedule for this deal yet.</p>;
  const hp = hover ? strip[hover.i] : null;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex flex-wrap gap-[3px]" role="img" aria-label="Payment schedule">
        {strip.map((p, i) => (
          <motion.span
            key={`${p.date}-${i}`}
            className={cn(
              'h-6 w-2.5 cursor-pointer rounded-[2px] transition-transform',
              scheduleTone(p.status),
              hover?.i === i && 'scale-y-125 ring-2 ring-foreground/40',
            )}
            onMouseEnter={(e) => {
              const el = e.currentTarget;
              setHover({ i, left: el.offsetLeft + el.offsetWidth / 2, top: el.offsetTop });
            }}
            initial={{ opacity: 0, scaleY: 0.4 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: Math.min(i * 0.008, 0.4), duration: 0.22 }}
          />
        ))}
      </div>
      {hover && hp ? (
        <div
          className="pointer-events-none absolute z-20 w-56 -translate-x-1/2 -translate-y-full rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-[0_8px_30px_rgba(15,23,42,0.15)]"
          style={{ left: hover.left, top: hover.top - 8 }}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-semibold text-foreground">Installment {hover.i + 1} of {strip.length}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold text-white', scheduleTone(hp.status))}>
              {STATUS_LABEL[hp.status] ?? hp.status}
            </span>
          </div>
          {[
            ['Date', formatDateMonthDayYear(hp.date) || '—'],
            ['Amount', formatCurrencyFull(hp.amount)],
            ['Repaid to date', formatCurrencyFull(repaidToDate[hover.i])],
            ['Balance after', formatCurrencyFull(Math.max(0, payback - repaidToDate[hover.i]))],
          ].map(([label, value]) => (
            <p key={label} className="flex items-center justify-between gap-4 py-0.5">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DealHero({
  dealRef,
  onBack,
  showBack = true,
  applicationId,
  category,
}: {
  dealRef: string | undefined;
  onBack?: () => void;
  showBack?: boolean;
  applicationId?: string | null;
  category?: string | null;
}) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const q = useDealDetail(dealRef);
  const d = q.data?.deal;
  const m = q.data?.merchant;
  const card = isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#F1F3F7] bg-card';
  const figures = useMemo(() => (d ? dealStateCards(d) : FIGURE_SKELETONS), [d]);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const tagApplicationId = applicationId || d?.applicationUuid || null;
  const tagValue = category !== undefined ? category : (d?.category ?? null);

  if (q.isError) {
    return (
      <div className={cn('flex flex-wrap items-center justify-between gap-3 rounded-[5px] border px-5 py-4', card)}>
        {showBack ? (
          <button type="button" onClick={onBack ?? (() => navigate(-1))} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Back to deals
          </button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {tagApplicationId ? <DealTagSelect applicationId={tagApplicationId} value={tagValue} /> : null}
          <span className="text-xs text-muted-foreground">Portfolio summary is not available for this deal yet.</span>
        </div>
      </div>
    );
  }

  return (
    <motion.section initial="hidden" animate="show" variants={listStagger}>
      <div className="flex flex-col gap-5">
        <motion.div variants={fadeUp} className="flex flex-wrap items-start gap-3">
          {showBack ? (
            <button
              type="button"
              onClick={onBack ?? (() => navigate(-1))}
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
              aria-label="Back to deals"
            >
              <ArrowLeft className="size-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            { !d || !m ? (
              <div className="space-y-2"><Skeleton className="h-6 w-64" /><Skeleton className="h-4 w-80" /></div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{m.name}</h1>
                  {(() => {
                    const tag = (d.category && d.category.trim()) || HEALTH_LABEL[d.health];
                    if (!tag || tag.toLowerCase() === 'on track') return null;
                    return <DealTagPill value={tag} />;
                  })()}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{d.dealId ?? (d.applicationNumericId ? `#${d.applicationNumericId}` : 'Deal')}</span>
                  {d.bookCode ? ` · ${d.bookCode}` : ''}
                  {` · Funded ${fmtDate(d.dates.fundedAt)}`}
                  {d.agentName ? ` · ${d.agentName}` : ''}
                  {d.isoName ? ` · ${d.isoName}` : ''}
                  {m.dealCount > 1 ? ` · ${m.dealCount} deals` : ''}
                </p>
              </>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {tagApplicationId ? <DealTagSelect applicationId={tagApplicationId} value={tagValue} /> : null}
            <button
              type="button"
              onClick={() => setDetailsOpen((open) => !open)}
              aria-expanded={detailsOpen}
              aria-controls="deal-hero-details"
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
            >
              {detailsOpen ? 'Collapse' : 'Expand'}
              <motion.span
                aria-hidden
                className="inline-flex"
                animate={{ rotate: detailsOpen ? 180 : 0 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="size-3.5" />
              </motion.span>
            </button>
            {d ? (
              <Link
                to={`/application-details/${encodeURIComponent(d.applicationUuid)}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted"
              >
                Application <ExternalLink className="size-3.5" />
              </Link>
            ) : null}
          </div>
        </motion.div>

        <AnimatePresence initial={false}>
          {detailsOpen ? (
            <motion.div
              id="deal-hero-details"
              key="deal-hero-details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-5">
                {d ? (
                  <div className={cn('rounded-md border p-4', isDark ? 'border-[#2A2B2F] bg-[#101114]' : 'border-[#E8EBF2] bg-[#F7F8FB]')}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="text-base font-semibold text-foreground">Payback</span>
                      <span className="text-xl font-semibold tabular-nums text-foreground">
                        {fmtPct(d.pctPaid)} <span className="text-sm font-normal text-muted-foreground">repaid</span>
                      </span>
                    </div>
                    <MotionPaybackBar
                      offer={d.offer}
                      funded={d.funded}
                      payback={d.payback}
                      repaid={d.repaid}
                      balance={d.balance}
                      overdue={d.health === 'paid_off' ? 0 : d.overdueAmount}
                      installment={d.installment}
                      paidCount={d.paidCount}
                      remainingCount={d.health === 'paid_off' ? 0 : d.remainingCount}
                      lastPaymentDate={d.lastPaymentDate}
                      nextPaymentDate={d.health === 'paid_off' ? null : d.nextPaymentDate}
                    />
                  </div>
                ) : (
                  <Skeleton className="h-20 w-full" />
                )}

                {d || q.isPending ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {figures.map((figure) => (
                      <div key={figure.title} className={cn('h-full overflow-hidden rounded-xl', CARD_SHADOW)}>
                        <CornerSummaryCard
                          isDark={isDark}
                          title={figure.title.toUpperCase()}
                          icon={figure.icon}
                          iconSize={22}
                          isLoading={!d}
                          countValue={figure.countValue}
                          countSuffix={figure.countSuffix}
                          footLeft={figure.footLeft}
                          amountValue={figure.amountValue}
                          footNote={figure.footNote}
                          footNoteClassName={figure.footNoteClassName}
                          toneClassName={figure.toneClassName}
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {d && q.data ? (
                  <>
                    <ScheduleSummary schedule={q.data.schedule} paidOff={d.health === 'paid_off'} payback={d.payback} isDark={isDark} />
                    <div className="@container">
                    <div className="grid items-stretch gap-3 @3xl:grid-cols-2">
                      <div className={cn('rounded-md border p-4', isDark ? 'border-[#2A2B2F]' : 'border-[#E8EBF2]')}>
                        <div className="mb-2 text-sm font-semibold text-foreground">Paydown</div>
                        <DealPaydownChart strip={q.data.schedule.strip} payback={d.payback} isDark={isDark} />
                      </div>
                      <div className={cn('flex flex-col rounded-md border p-4', isDark ? 'border-[#2A2B2F]' : 'border-[#E8EBF2]')}>
                        <div className="mb-3 text-sm font-semibold text-foreground">Timeline</div>
                        <Timeline deal={d} />
                      </div>
                    </div>
                    </div>
                  </>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

export function DealSidebar({ dealRef }: { dealRef: string | undefined }) {
  const q = useDealDetail(dealRef);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const data = q.data;
  const merchantDeals = useMemo(() => {
    if (!data?.deal) return [];
    const rest = data.siblings ?? [];
    return [data.deal, ...rest.filter((s) => s.id !== data.deal.id)];
  }, [data]);
  if (q.isError || !data) return null;
  const m = data.merchant;
  const currentId = data.deal.id;
  const card = isDark ? 'border-[#374151] bg-[#141517]' : 'border-[#F1F3F7] bg-card';

  return (
    <motion.aside className="space-y-3" initial="hidden" animate="show" variants={listStagger}>
      <motion.section variants={fadeUp} className={cn('rounded-[5px] border p-5 shadow-[0px_4px_20px_0px_#00000005]', card)}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-base font-semibold text-foreground">Merchant</div>
            <p className="truncate text-sm text-muted-foreground">{m.name}</p>
          </div>
          <span className="shrink-0 text-sm text-muted-foreground">{m.dealCount} deal{m.dealCount === 1 ? '' : 's'}</span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          {m.books.map((b) => b.code ?? b.name).filter(Boolean).join(' · ')}
          {m.ein ? ` · EIN ${m.ein}` : ''}
        </p>
        <MerchantPaybackRing
          isDark={isDark}
          funded={m.funded}
          payback={m.payback}
          repaid={m.repaid}
          balance={m.balance}
          overdue={m.balance <= 0.5 ? 0 : m.overdueAmount}
        />
      </motion.section>

      {merchantDeals.length > 0 ? (
        <motion.section variants={fadeUp} className={cn('rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005]', card)}>
          <div className={cn('border-b px-5 py-3 text-base font-semibold text-foreground', isDark ? 'border-[#2A2B2F]' : 'border-[#E8EBF2]')}>
            Deals
            <span className="ml-2 font-normal text-muted-foreground">{merchantDeals.length}</span>
          </div>
          <ul>
            {merchantDeals.map((s) => {
              const isCurrent = s.id === currentId;
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-base font-medium text-foreground">
                      {s.dealId ?? (s.applicationNumericId ? `#${s.applicationNumericId}` : 'Deal')}
                      {isCurrent ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(this deal)</span> : null}
                    </span>
                    {(() => {
                      const tag = (s.category && s.category.trim()) || HEALTH_LABEL[s.health];
                      if (!tag || tag.toLowerCase() === 'on track') return null;
                      return <DealTagPill value={tag} />;
                    })()}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {fmtDate(s.dates.fundedAt)} · {formatCurrencyFull(s.funded)}
                  </div>
                  <div className="mt-2">
                    <MotionPaybackBar size="sm" showLegend={false} funded={s.funded} payback={s.payback} repaid={s.repaid} balance={s.balance} overdue={s.health === 'paid_off' ? 0 : s.overdueAmount} />
                  </div>
                </>
              );
              return (
                <li key={s.id} className={cn('border-b last:border-b-0', isDark ? 'border-[#2A2B2F]' : 'border-[#E8EBF2]')}>
                  {isCurrent ? (
                    <div className="bg-muted/40 px-5 py-3.5">{body}</div>
                  ) : (
                    <Link to={`/payments/${encodeURIComponent(s.applicationUuid)}`} className="block px-5 py-3.5 hover:bg-muted/30">
                      {body}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </motion.section>
      ) : null}

      <motion.section variants={fadeUp} className={cn('overflow-hidden rounded-[5px] border shadow-[0px_4px_20px_0px_#00000005]', card)}>
        <div className={cn('border-b px-5 py-3 text-base font-semibold text-foreground', isDark ? 'border-[#2A2B2F]' : 'border-[#E8EBF2]')}>Upcoming</div>
        {data.schedule.upcoming.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Nothing scheduled.</p>
        ) : (
          <ul className="divide-y divide-border text-base">
            {data.schedule.upcoming.map((u, i) => (
              <li key={`${u.date}-${i}`} className="flex items-center justify-between px-5 py-3">
                <span className="text-muted-foreground">{formatDateMonthDayYear(u.date)}</span>
                <span className="font-semibold tabular-nums text-foreground">{formatCurrencyFull(u.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </motion.aside>
  );
}

export default DealHero;
