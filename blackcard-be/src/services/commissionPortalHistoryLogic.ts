/**
 * Commission portal row mapping — mirrors
 * woodmere-inhouse-fe/src/pages/commissionPortal/commissionHistoryShared.ts
 */

export type DealStatus = 'APPROVED' | 'PAID' | 'PENDING' | 'CLAWBACK';

type FundedDealApi = {
  application?: Record<string, unknown>;
  commission?: Record<string, unknown> | null;
};

export type DealRow = {
  id: string;
  dealDisplayId: string;
  merchant: string;
  funded: number;
  iso: string;
  base: number;
  net: number;
  commissionPctLabel: string;
  status: DealStatus;
  month: string;
  monthKey: string;
  activityAtMs: number;
};

export function toNum(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]+/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function getIsoNameFromApplication(app: unknown): string {
  const r = app as Record<string, unknown>;
  const iso = r?.iso as Record<string, unknown> | undefined;
  return String(
    (iso?.name as string | undefined) ?? (r?.isoName as string | undefined) ?? '—',
  );
}

export function mapRowStatus(
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

export function buildCommissionLookupByApplication(
  fundedDeals: unknown[],
): Map<string, Record<string, unknown> | null> {
  const m = new Map<string, Record<string, unknown> | null>();
  if (!Array.isArray(fundedDeals)) return m;
  for (const item of fundedDeals) {
    const row = item as FundedDealApi;
    const app = row.application || {};
    const commission = (row.commission ?? null) as Record<string, unknown> | null;
    const uuid = app.id != null ? String(app.id) : '';
    const num = app.applicationId != null ? String(app.applicationId) : '';
    if (uuid) m.set(uuid, commission);
    if (num) m.set(`n:${num}`, commission);
  }
  return m;
}

export function getCommissionForApplication(
  app: unknown,
  lookup: Map<string, Record<string, unknown> | null>,
): Record<string, unknown> | null | undefined {
  const r = app as Record<string, unknown>;
  const uuid = r.id ?? r._id;
  if (uuid != null && String(uuid).trim() !== '') {
    if (lookup.has(String(uuid))) return lookup.get(String(uuid)) ?? null;
  }
  const num = r.applicationId;
  if (num != null && String(num).trim() !== '') {
    const key = `n:${String(num)}`;
    if (lookup.has(key)) return lookup.get(key) ?? null;
  }
  return undefined;
}

function formatApplicationCommissionPctLabel(
  appPct: number | null,
  crPct: number | null,
  derivedPct: number | undefined,
): string {
  if (appPct != null && appPct >= 0) {
    return `${Math.round(appPct * 100) / 100}%`;
  }
  if (crPct != null && crPct >= 0) {
    return `${Math.round(crPct * 100) / 100}%`;
  }
  if (derivedPct != null && derivedPct > 0) {
    return `${Math.round(derivedPct * 100) / 100}%`;
  }
  return '—';
}

export function mapApplicationToHistoryRow(
  app: unknown,
  rowIndex: number,
  commission: Record<string, unknown> | null | undefined,
): DealRow {
  const r = app as Record<string, unknown>;
  const offerDecisionRaw = r?.OfferDecision as Record<string, unknown> | undefined;
  const nestedOfferDecision =
    offerDecisionRaw?.offer &&
    typeof offerDecisionRaw.offer === 'object' &&
    !Array.isArray(offerDecisionRaw.offer)
      ? (offerDecisionRaw.offer as Record<string, unknown>)
      : null;
  const sourceOfferDecision = nestedOfferDecision ?? offerDecisionRaw ?? null;
  const termOffers = r?.termsOffers as unknown[] | undefined;
  const latestTermsOffer =
    Array.isArray(termOffers) && termOffers.length > 0
      ? (termOffers[0] as Record<string, unknown>)
      : null;
  const latestTermsOfferNested =
    latestTermsOffer?.offer &&
    typeof latestTermsOffer.offer === 'object' &&
    !Array.isArray(latestTermsOffer.offer)
      ? (latestTermsOffer.offer as Record<string, unknown>)
      : null;

  const fundedAmount =
    toNum(sourceOfferDecision?.offer) ??
    toNum(sourceOfferDecision?.approvedAmount) ??
    toNum(latestTermsOfferNested?.offer) ??
    toNum(latestTermsOfferNested?.approvedAmount) ??
    toNum(latestTermsOffer?.approvedAmount) ??
    toNum(r?.loanAmount) ??
    0;

  const commissionAmount =
    toNum(sourceOfferDecision?.commissionAmount) ??
    toNum(sourceOfferDecision?.commission) ??
    toNum(r?.commissionAmount) ??
    0;

  const storedPctRaw = toNum(r?.commissionPercentage);
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

  const net = base;

  const client = r?.client as Record<string, unknown> | undefined;
  const business = client?.business as Record<string, unknown> | undefined;
  const created = r?.createdAt ? new Date(String(r.createdAt)) : null;
  const appTime = created && !Number.isNaN(created.getTime()) ? created.getTime() : 0;
  const crCreated = commission?.createdAt ? new Date(String(commission.createdAt)).getTime() : NaN;
  const activityAtMs = Math.max(appTime, Number.isFinite(crCreated) ? crCreated : 0);

  const monthKey =
    created && !Number.isNaN(created.getTime())
      ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
      : 'unknown';
  const month =
    created && !Number.isNaN(created.getTime())
      ? created.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '—';

  const merchant =
    (business?.name as string | undefined) ||
    (client?.businessName as string | undefined) ||
    `Application #${r?.applicationId ?? r?.id ?? '—'}`;

  const appNum = r?.applicationId;
  const id = String(r?.id ?? r?._id ?? `deal-${rowIndex}`);
  const rawDealId = typeof r?.dealId === 'string' ? r.dealId.trim() : '';
  const dealDisplayId =
    rawDealId || (appNum != null && String(appNum).trim() ? String(appNum).trim() : '-');

  const status = mapRowStatus(r, commission);

  const commissionPctLabel = formatApplicationCommissionPctLabel(
    storedPctRaw,
    crPctRaw,
    derivedPct,
  );

  return {
    id,
    dealDisplayId,
    merchant,
    funded: fundedAmount,
    iso: getIsoNameFromApplication(app),
    base,
    net,
    commissionPctLabel,
    status,
    month,
    monthKey,
    activityAtMs,
  };
}

export function aggregateStatsFromRows(rows: DealRow[]) {
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
