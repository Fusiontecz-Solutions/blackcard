import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

/** Match commission portal UI (`CommissionPortal.tsx` + `commissionHistoryShared.ts`). */
export const COMMISSION_PORTAL_APPLICATION_LIMIT = 500;

export type CommissionPortalStats = {
  /** Rows in the commission portal list (max COMMISSION_PORTAL_APPLICATION_LIMIT). */
  portalDealCount: number;
  /** @deprecated Alias for portalDealCount — not the global funded count. */
  dealsFunded: number;
  totalFunded: number;
  commissionTotal: number;
  paid: number;
  paidDealCount: number;
  processing: number;
  approved: number;
  pendingDealCount: number;
  clawback: number;
  clawbackDealCount: number;
  pendingCommission: number;
};

type DealStatus = 'APPROVED' | 'PAID' | 'PENDING' | 'CLAWBACK';

const toNum = (value: unknown): number | null => {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]+/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};

function mapRowStatus(
  app: Record<string, unknown>,
  commission: Record<string, unknown> | null | undefined,
): DealStatus {
  const crStatus = commission?.status != null ? String(commission.status) : '';
  if (crStatus === 'Rejected') return 'CLAWBACK';

  const queue = String(app.currentQueue || '').trim();
  const state = String(app.currentState || '').trim();
  const ql = queue.toLowerCase();
  const sl = state.toLowerCase();

  if (queue === 'Declined' || ql === 'declined') return 'CLAWBACK';

  const isoIdRaw = app.isoId;
  const isoObj = app.iso as Record<string, unknown> | undefined;
  const isoFromNested = isoObj?.id ?? isoObj?._id;
  const hasIso =
    (isoIdRaw != null && String(isoIdRaw).trim() !== '') ||
    (isoFromNested != null && String(isoFromNested).trim() !== '');

  if (hasIso) {
    const payout = app.isoCommissionPayout as { payoutStatus?: unknown } | null | undefined;
    const ps =
      payout?.payoutStatus != null ? String(payout.payoutStatus).trim().toLowerCase() : '';
    if (ps === 'paid') return 'PAID';
    if (ps === 'clawbacks' || ps === 'clawback') return 'CLAWBACK';
    return 'PENDING';
  }

  if (ql === 'funded' || sl === 'funded') return 'PAID';
  if (queue === 'Approved' && (state === 'Completed' || sl === 'completed')) return 'PAID';
  if (queue === 'Approved' || ql === 'approved') return 'APPROVED';
  return 'PENDING';
}

function attachIsoCommissionPayout(app: Record<string, unknown>): void {
  const isoId = app.isoId;
  const payouts = app.isoApplicationPayouts as Array<Record<string, unknown>> | undefined;
  if (!isoId || !Array.isArray(payouts) || payouts.length === 0) return;

  const row =
    payouts.find((p) => String(p?.isoId) === String(isoId)) ?? payouts[0];
  if (!row || row.payoutStatus == null) return;

  const u = String(row.payoutStatus).toUpperCase();
  const payoutStatus =
    u === 'PAID' ? 'paid' : u === 'CLAWBACKS' ? 'clawbacks' : 'pending';

  app.isoCommissionPayout = {
    payoutStatus,
    scheduledPayDate: row.scheduledPayDate ?? null,
    paidAt: row.paidAt ?? null,
  };
}

function computeNetCommission(
  app: Record<string, unknown>,
  commission: Record<string, unknown> | null | undefined,
): { net: number; funded: number } {
  const offerDecisionRaw = app.OfferDecision as Record<string, unknown> | undefined;
  const termOffers = app.termsOffers as unknown[] | undefined;
  const latestTermsOffer =
    Array.isArray(termOffers) && termOffers.length > 0
      ? (termOffers[0] as Record<string, unknown>)
      : null;

  const fundedAmount =
    toNum(offerDecisionRaw?.offer) ??
    toNum(latestTermsOffer?.approvedAmount) ??
    toNum(app.loanAmount) ??
    0;

  const commissionAmount =
    toNum(app.commissionAmount) ?? 0;

  const storedPctRaw = toNum(app.commissionPercentage);
  const crPctRaw = commission ? toNum(commission.commissionPercentage) : null;
  const derivedPct =
    fundedAmount > 0 && commissionAmount !== 0
      ? Math.round((commissionAmount / fundedAmount) * 10000) / 100
      : undefined;

  let base: number;
  if (
    commission &&
    commission.fundingAmount != null &&
    commission.commissionPercentage != null
  ) {
    base = Math.round(
      ((toNum(commission.fundingAmount) ?? 0) * (toNum(commission.commissionPercentage) ?? 0)) /
        100,
    );
  } else if (storedPctRaw != null && storedPctRaw > 0) {
    const baseRatePct = Math.min(100, Math.max(0, Math.round(storedPctRaw * 100) / 100));
    base = Math.round((fundedAmount * baseRatePct) / 100);
  } else if (derivedPct != null) {
    base = commissionAmount;
  } else if (storedPctRaw === 0) {
    base = 0;
  } else {
    base = commissionAmount;
  }

  return { net: base, funded: fundedAmount };
}

function aggregateStatsFromRows(
  rows: Array<{ net: number; funded: number; status: DealStatus }>,
): CommissionPortalStats {
  let paid = 0;
  let paidDealCount = 0;
  let processing = 0;
  let approved = 0;
  let pendingDealCount = 0;
  let clawback = 0;
  let clawbackDealCount = 0;
  let totalFunded = 0;
  let commissionTotal = 0;

  for (const r of rows) {
    totalFunded += r.funded;
    commissionTotal += r.net;
    if (r.status === 'PAID') {
      paid += r.net;
      paidDealCount += 1;
    } else if (r.status === 'PENDING') {
      processing += r.net;
      pendingDealCount += 1;
    } else if (r.status === 'APPROVED') {
      approved += r.net;
      pendingDealCount += 1;
    } else if (r.status === 'CLAWBACK') {
      clawback += r.net;
      clawbackDealCount += 1;
    }
  }

  return {
    portalDealCount: rows.length,
    dealsFunded: rows.length,
    totalFunded,
    commissionTotal,
    paid,
    paidDealCount,
    processing,
    approved,
    clawback,
    clawbackDealCount,
    pendingDealCount,
    pendingCommission: approved + processing,
  };
}

const applicationSelect = {
  id: true,
  applicationId: true,
  createdAt: true,
  loanAmount: true,
  commissionAmount: true,
  commissionPercentage: true,
  currentQueue: true,
  currentState: true,
  isoId: true,
  iso: { select: { id: true, name: true } },
  isoApplicationPayouts: {
    select: {
      isoId: true,
      payoutStatus: true,
      scheduledPayDate: true,
      paidAt: true,
    },
  },
  termsOffers: {
    orderBy: { updatedAt: 'desc' as const },
    take: 1,
    select: {
      approvedAmount: true,
      factorRate: true,
      paybackAmount: true,
      commissionAmount: true,
    },
  },
  OfferDecision: {
    select: {
      offer: true,
      decision: true,
      rate: true,
      fees: true,
      refinanceAmount: true,
      totalRemit: true,
    },
  },
} satisfies Prisma.ApplicationSelect;

async function buildLatestCommissionByApplicationIds(
  applicationIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  const latest = new Map<string, Record<string, unknown>>();
  if (!applicationIds.length) return latest;

  const requests = await prisma.commissionRequest.findMany({
    where: { applicationId: { in: applicationIds } },
    orderBy: { createdAt: 'desc' },
    select: {
      applicationId: true,
      status: true,
      fundingAmount: true,
      commissionPercentage: true,
      createdAt: true,
    },
  });

  for (const cr of requests) {
    if (!latest.has(cr.applicationId)) {
      latest.set(cr.applicationId, cr as unknown as Record<string, unknown>);
    }
  }
  return latest;
}

/**
 * Computes commission portal KPIs the same way as the Commission Portal UI
 * (applications list + funded-deals commission lookup + client-side aggregation).
 */
export async function computeCommissionPortalStats(): Promise<CommissionPortalStats> {
  const applications = await prisma.application.findMany({
    take: COMMISSION_PORTAL_APPLICATION_LIMIT,
    orderBy: { createdAt: 'desc' },
    select: applicationSelect,
  });

  const commissionByAppId = await buildLatestCommissionByApplicationIds(
    applications.map((app) => app.id),
  );

  const rows = applications.map((app) => {
    const appRecord = app as unknown as Record<string, unknown>;
    attachIsoCommissionPayout(appRecord);
    const commission = commissionByAppId.get(app.id) ?? null;
    const { net, funded } = computeNetCommission(appRecord, commission);
    const status = mapRowStatus(appRecord, commission);
    return { net, funded, status };
  });

  return aggregateStatsFromRows(rows);
}
