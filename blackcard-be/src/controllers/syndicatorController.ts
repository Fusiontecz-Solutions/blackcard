import type { Request, Response } from 'express';
import {
  AccountType,
  CollectionPaymentSource,
  CollectionPaymentStatus,
  PaymentFrequency,
  PaymentMethod,
  PaymentProcessor,
  Prisma,
  RepaymentMethod,
  RepaymentProcessor,
} from '@prisma/client';
import prisma from '../config/prismaClient';
import { deleteSyndicatorCascadeUser } from '../services/syndicatorDeletionService';
import {
  sumFailedCollectionSyndicatorShareForSyndicator,
  sumFailedCollectionSyndicatorSharePortfolio,
} from '../services/syndicatorFailedExposureFromCollections';
import {
  applyStrictTransactionFiltering,
  filterCollectionPaymentsForApplicationDeal,
} from '../services/collectionPaymentFinancials';

/**
 * Prisma delegate for `SyndicatorWithdrawalRequest` (typed loosely so the project compiles
 * before `prisma generate` picks up the new model).
 */
type SyndicatorWithdrawalRequestDelegate = {
  aggregate(args: {
    where: { syndicatorId: number; status: string };
    _sum: { amount: true };
  }): Promise<{ _sum: { amount: unknown | null } }>;
  create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  findFirst(args: unknown): Promise<Record<string, unknown> | null>;
  update(args: { where: { id: number }; data: Record<string, unknown> }): Promise<Record<string, unknown>>;
};

function withdrawalDb(db: unknown): { syndicatorWithdrawalRequest: SyndicatorWithdrawalRequestDelegate } {
  return db as { syndicatorWithdrawalRequest: SyndicatorWithdrawalRequestDelegate };
}

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const decimalSum = (value: unknown): number =>
  value == null || value === undefined ? 0 : toNumber(value);

/**
 * Normalize Prisma payloads for JSON so clients never receive opaque Decimal/object
 * instances (which break dashboards and stringify as "[object Object]").
 */
function serializeExtendedSyndicatorPayload<T extends Record<string, unknown>>(payload: T): T {
  return JSON.parse(
    JSON.stringify(payload, (_key, value) => {
      if (typeof value === 'bigint') return value.toString();
      if (value instanceof Prisma.Decimal) return value.toString();
      if (
        typeof value === 'object' &&
        value !== null &&
        Object.getPrototypeOf(value)?.constructor?.name === 'Decimal' &&
        typeof (value as { toFixed?: () => string }).toFixed === 'function'
      ) {
        return (value as { toFixed: () => string }).toFixed();
      }
      return value;
    }),
  ) as T;
}

const PAYMENT_METHOD_VALUES = new Set<string>(Object.values(PaymentMethod));
const PAYMENT_PROCESSOR_VALUES = new Set<string>(Object.values(PaymentProcessor));
const REPAYMENT_METHOD_VALUES = new Set<string>(Object.values(RepaymentMethod));
const REPAYMENT_PROCESSOR_VALUES = new Set<string>(Object.values(RepaymentProcessor));
const PAYMENT_FREQUENCY_VALUES = new Set<string>(Object.values(PaymentFrequency));
const ACCOUNT_TYPE_VALUES = new Set<string>(Object.values(AccountType));

/** Pragmatic single-address check (aligned with admin UI). */
const NOTIFICATION_RECIPIENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTIFICATION_RECIPIENTS = 30;

function parseNotificationRecipients(
  input: unknown,
): { ok: true; list: string[] } | { ok: false; message: string } {
  let rawList: string[];
  if (Array.isArray(input)) {
    rawList = input.map((e) => String(e ?? '').trim().toLowerCase()).filter(Boolean);
  } else if (typeof input === 'string') {
    if (!input.trim()) {
      rawList = [];
    } else {
      rawList = input
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    }
  } else {
    return { ok: false, message: 'Invalid notificationRecipients' };
  }

  const seen = new Set<string>();
  const list: string[] = [];
  for (const email of rawList) {
    if (!NOTIFICATION_RECIPIENT_EMAIL_RE.test(email)) {
      return { ok: false, message: `Invalid notification email: ${email}` };
    }
    if (seen.has(email)) continue;
    seen.add(email);
    list.push(email);
    if (list.length > MAX_NOTIFICATION_RECIPIENTS) {
      return {
        ok: false,
        message: `At most ${MAX_NOTIFICATION_RECIPIENTS} notification recipients allowed`,
      };
    }
  }
  return { ok: true, list };
}

function parsePaymentMethod(raw: unknown, fallback: PaymentMethod): PaymentMethod {
  const s = String(raw ?? '').trim();
  return PAYMENT_METHOD_VALUES.has(s) ? (s as PaymentMethod) : fallback;
}

function parsePaymentProcessor(raw: unknown): PaymentProcessor | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  return PAYMENT_PROCESSOR_VALUES.has(s) ? (s as PaymentProcessor) : null;
}

function parseRepaymentMethod(raw: unknown, fallback: RepaymentMethod): RepaymentMethod {
  const s = String(raw ?? '').trim();
  return REPAYMENT_METHOD_VALUES.has(s) ? (s as RepaymentMethod) : fallback;
}

function parseRepaymentProcessor(raw: unknown): RepaymentProcessor | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  return REPAYMENT_PROCESSOR_VALUES.has(s) ? (s as RepaymentProcessor) : null;
}

function parsePaymentFrequency(raw: unknown): PaymentFrequency | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const s = String(raw).trim();
  return PAYMENT_FREQUENCY_VALUES.has(s) ? (s as PaymentFrequency) : null;
}

function toOptDecimal(raw: unknown): Prisma.Decimal | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return new Prisma.Decimal(n);
}

function toOptInt(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : null;
}

function toOptBoolean(raw: unknown): boolean | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return null;
}

const SYNDICATOR_PAYOUT_COLLECTION_STATUSES: CollectionPaymentStatus[] = [
  CollectionPaymentStatus.PAID,
  CollectionPaymentStatus.FAILED,
  CollectionPaymentStatus.MANUAL,
  CollectionPaymentStatus.CREDIT,
  CollectionPaymentStatus.DEBIT,
];

function collectionStatusLabelForPayout(status: CollectionPaymentStatus): string {
  switch (status) {
    case CollectionPaymentStatus.PAID:
      return 'Paid';
    case CollectionPaymentStatus.FAILED:
      return 'Failed';
    case CollectionPaymentStatus.MANUAL:
      return 'Manual';
    case CollectionPaymentStatus.CREDIT:
      return 'Paid';
    case CollectionPaymentStatus.DEBIT:
      return 'Debit';
    default:
      return String(status);
  }
}

function collectionTransactionTypeForPayout(status: CollectionPaymentStatus): string {
  if (status === CollectionPaymentStatus.DEBIT) return 'Debit';
  return 'Repayment';
}

class SyndicatorController {
  /**
   * Aggregate metrics across all syndicators and syndicated deals (admin / operations).
   * Cash-flow series is derived from wallet transactions (CREDIT = inflow, DEBIT = outflow).
   */
  async adminSummary(_req: Request, res: Response) {
    try {
      const totalSyndicators = await prisma.syndicator.count();

      const totals = await prisma.applicationSyndicatorDetails.aggregate({
        _sum: {
          amountSyndicated: true,
          commissionAmount: true,
          paybackAmountSyndicated: true,
          managementFeeToDate: true,
          remainingAmount: true,
          collectedAmount: true,
        },
      });

      const defaultedAgg = await prisma.applicationSyndicatorDetails.aggregate({
        _sum: { remainingAmount: true },
        where: {
          status: { contains: 'default', mode: 'insensitive' },
        },
      });

      /** Recent wallet transactions for repayment vs funding chart series. */
      const chartSince = new Date();
      chartSince.setMonth(chartSince.getMonth() - 14);

      const walletChartRows = await prisma.syndicatorWalletTransaction.findMany({
        where: { date: { gte: chartSince } },
        // Only include transactions that are linked to a deal (so wallet-only credits/withdrawals don't
        // affect inflow/payout charts).
        select: { amount: true, date: true, paymentType: true, applicationId: true },
        orderBy: { date: 'asc' },
      });

      const REPAYMENT: { date: string; amount: string }[] = [];
      const Funding: { date: string; amount: string }[] = [];

      for (const row of walletChartRows) {
        if (!row.applicationId) continue;
        const pt = String(row.paymentType ?? '').toUpperCase();
        const iso = new Date(row.date).toISOString();
        const amt = String(decimalSum(row.amount));
        if (pt === 'CREDIT' || pt === 'WALLET_CREDIT' || pt === 'PAID' || pt === 'MANUAL') {
          // Inflows from deal repayments only.
          REPAYMENT.push({ date: iso, amount: amt });
        } else if (pt === 'DEBIT') {
          // Outflows tied to deal funding / allocations.
          // Admin or syndicator wallet withdrawals (WITHDRAW) are excluded from this series.
          Funding.push({ date: iso, amount: amt });
        }
      }

      const defaultedFromAllocationStatus = decimalSum(defaultedAgg._sum.remainingAmount);
      const defaultedFromFailedCollections = await sumFailedCollectionSyndicatorSharePortfolio(prisma);
      const defaultedAmount = defaultedFromAllocationStatus + defaultedFromFailedCollections;

      const sum = totals._sum;

      return res.status(200).json({
        success: true,
        data: {
          totalSyndicators,
          amountSyndicated: decimalSum(sum.amountSyndicated),
          commissionAmount: decimalSum(sum.commissionAmount),
          paybackAmountSyndicated: decimalSum(sum.paybackAmountSyndicated),
          managementFeeToDate: decimalSum(sum.managementFeeToDate),
          remainingAmount: decimalSum(sum.remainingAmount),
          collectedAmount: decimalSum(sum.collectedAmount),
          defaultedAmount,
          REPAYMENT,
          Funding,
        },
      });
    } catch (error) {
      console.error('Syndicator admin summary error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async list(_req: Request, res: Response) {
    try {
      const data = await prisma.syndicator.findMany({
        orderBy: { createdAt: 'desc' },
      });

      // Per-syndicator deal aggregates so the list can surface real portfolio
      // numbers (deal count, amount syndicated, collected, remaining) instead of
      // empty balance columns. Grouped once and merged onto each row by id.
      const grouped = await prisma.applicationSyndicatorDetails.groupBy({
        by: ['syndicatorId'],
        _count: { _all: true },
        _sum: {
          amountSyndicated: true,
          paybackAmountSyndicated: true,
          collectedAmount: true,
          remainingAmount: true,
          commissionAmount: true,
        },
      });

      const aggById = new Map<number, (typeof grouped)[number]>();
      for (const g of grouped) aggById.set(g.syndicatorId, g);

      const enriched = data.map((row) => {
        const agg = aggById.get(row.id);
        return {
          ...row,
          dealCount: agg?._count._all ?? 0,
          amountSyndicated: decimalSum(agg?._sum.amountSyndicated),
          paybackAmountSyndicated: decimalSum(agg?._sum.paybackAmountSyndicated),
          collectedAmount: decimalSum(agg?._sum.collectedAmount),
          remainingAmount: decimalSum(agg?._sum.remainingAmount),
          commissionAmount: decimalSum(agg?._sum.commissionAmount),
        };
      });

      return res.status(200).json({ success: true, data: enriched });
    } catch (error) {
      console.error('Syndicator list error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }
      const extended =
        req.query.extended === '1' ||
        req.query.extended === 'true' ||
        String(req.query.extended ?? '').toLowerCase() === 'yes';

      const data = await prisma.syndicator.findUnique({
        where: { id },
        include: extended
          ? {
              SyndicatorBankInformation: true,
              SyndicatorSetting: true,
              SyndicatorPaymentSetting: { include: { repaymentPlan: true } },
            }
          : undefined,
      });

      if (!data) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }
      const outbound = extended ? serializeExtendedSyndicatorPayload(data as Record<string, unknown>) : data;
      return res.status(200).json({ success: true, data: outbound });
    } catch (error) {
      console.error('Syndicator get error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Resolve the syndicator profile linked to the authenticated user.
   * Used by the syndicator-role dashboard to bootstrap pages without exposing other syndicators.
   * Restricted to callers whose JWT role is `SYNDICATOR` so admin/operations users never accidentally
   * receive a syndicator-scoped payload from this endpoint.
   */
  async getMe(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (req.user?.role !== 'SYNDICATOR') {
        return res.status(403).json({
          success: false,
          message: 'Only syndicators can access this resource',
        });
      }

      const syndicator = await prisma.syndicator.findFirst({
        where: { userId },
      });
      if (!syndicator) {
        return res.status(404).json({
          success: false,
          message: 'No syndicator profile is linked to this account',
        });
      }

      return res.status(200).json({ success: true, data: syndicator });
    } catch (error) {
      console.error('Syndicator me error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Aggregate dashboard payload for the authenticated syndicator:
   * - allocation totals (invested / RTR / commission / collected / remaining / defaulted / slow-pay)
   * - repayment & funding wallet series (last 14 months) for the trend chart
   * - recent allocations w/ application + latest terms offer details for the "Recent applications" table
   */
  async mySummary(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      // Hard-gate: this dashboard payload is for the logged-in syndicator only. Any non-syndicator
      // caller (admin, operations, agent, etc.) should never see another syndicator's aggregates,
      // even if a Syndicator row happens to be linked to their userId via test data.
      if (req.user?.role !== 'SYNDICATOR') {
        return res.status(403).json({
          success: false,
          message: 'Only syndicators can access this resource',
        });
      }

      const syndicator = await prisma.syndicator.findFirst({
        where: { userId },
        select: { id: true, firstName: true, lastName: true, currentBalance: true },
      });
      if (!syndicator) {
        return res.status(404).json({
          success: false,
          message: 'No syndicator profile is linked to this account',
        });
      }

      const totalsAgg = await prisma.applicationSyndicatorDetails.aggregate({
        where: { syndicatorId: syndicator.id },
        _sum: {
          fundedAmount: true,
          amountSyndicated: true,
          paybackAmountSyndicated: true,
          commissionAmount: true,
          managementFeeToDate: true,
          collectedAmount: true,
          remainingAmount: true,
        },
        _count: { _all: true },
      });

      const defaultedAgg = await prisma.applicationSyndicatorDetails.aggregate({
        where: {
          syndicatorId: syndicator.id,
          status: { contains: 'default', mode: 'insensitive' },
        },
        _sum: { remainingAmount: true },
      });

      const slowPayAgg = await prisma.applicationSyndicatorDetails.aggregate({
        where: {
          syndicatorId: syndicator.id,
          status: { contains: 'slow', mode: 'insensitive' },
        },
        _sum: { remainingAmount: true },
      });

      const chartSince = new Date();
      chartSince.setMonth(chartSince.getMonth() - 14);

      const walletChartRows = await prisma.syndicatorWalletTransaction.findMany({
        where: { syndicatorId: syndicator.id, date: { gte: chartSince } },
        // Only include transactions that are linked to a deal (so wallet-only credits/withdrawals don't
        // affect inflow/payout charts).
        select: { amount: true, date: true, paymentType: true, applicationId: true },
        orderBy: { date: 'asc' },
      });

      const REPAYMENT: { date: string; amount: string }[] = [];
      const Funding: { date: string; amount: string }[] = [];
      for (const row of walletChartRows) {
        if (!row.applicationId) continue;
        const pt = String(row.paymentType ?? '').toUpperCase();
        const iso = new Date(row.date).toISOString();
        const amt = String(decimalSum(row.amount));
        if (pt === 'CREDIT' || pt === 'WALLET_CREDIT' || pt === 'PAID' || pt === 'MANUAL') {
          // Inflows from deal repayments only.
          REPAYMENT.push({ date: iso, amount: amt });
        } else if (pt === 'DEBIT') {
          // Outflows tied to deal funding / allocations.
          // Admin or syndicator wallet withdrawals (WITHDRAW) are excluded from this series.
          Funding.push({ date: iso, amount: amt });
        }
      }

      const recentRows = await prisma.applicationSyndicatorDetails.findMany({
        where: { syndicatorId: syndicator.id },
        orderBy: { id: 'desc' },
        take: 10,
      });

      const recentAppIds = [...new Set(recentRows.map((r) => r.applicationId).filter(Boolean))];

      const recentApps = recentAppIds.length
        ? await prisma.application.findMany({
            where: { id: { in: recentAppIds } },
            select: {
              id: true,
              dealId: true,
              applicationId: true,
              dealDisplayName: true,
              currentState: true,
              currentQueue: true,
              createdAt: true,
              client: { select: { businessName: true } },
              fundings: { select: { fundingDate: true } },
              OfferDecision: { select: { frequency: true } },
              termsOffers: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: {
                  factorRate: true,
                  frequency: true,
                  paymentAmount: true,
                  numberOfPayments: true,
                  termLength: true,
                },
              },
            },
          })
        : [];
      const appById = new Map(recentApps.map((a) => [a.id, a]));

      const recentApplications = recentRows.map((r) => {
        const app = appById.get(r.applicationId);
        const latestTerms = app?.termsOffers?.[0] ?? null;
        const repaymentFrequency =
          (latestTerms?.frequency && String(latestTerms.frequency).trim()) ||
          (app?.OfferDecision?.frequency && String(app.OfferDecision.frequency).trim()) ||
          null;
        const paybackSyndicated = decimalSum(r.paybackAmountSyndicated);
        const collected = decimalSum(r.collectedAmount);
        const percentPaid =
          paybackSyndicated > 0 ? Math.min(100, (collected / paybackSyndicated) * 100) : 0;

        return {
          allocationId: r.id,
          applicationUuid: r.applicationId,
          dealId: app?.dealId ?? null,
          applicationId: app?.applicationId ?? null,
          dealDisplayName: app?.dealDisplayName ?? r.merchantName ?? app?.client?.businessName ?? null,
          merchantName: r.merchantName ?? null,
          businessName: app?.client?.businessName ?? null,
          fundingDate: app?.fundings?.fundingDate
            ? new Date(app.fundings.fundingDate).toISOString()
            : null,
          repaymentFrequency,
          status: r.status ?? app?.currentState ?? null,
          currentQueue: app?.currentQueue ?? null,
          createdAt: r.createdAt,
          fundedAmount: decimalSum(r.fundedAmount),
          paybackAmount: decimalSum(r.paybackAmount),
          amountSyndicated: decimalSum(r.amountSyndicated),
          paybackAmountSyndicated: paybackSyndicated,
          commissionAmount: decimalSum(r.commissionAmount),
          managementFeeToDate: decimalSum(r.managementFeeToDate),
          collectedAmount: collected,
          remainingAmount: decimalSum(r.remainingAmount),
          percentageSyndicated: decimalSum(r.percentageSyndicated),
          termLength: r.termLength,
          factorRate: latestTerms?.factorRate ?? null,
          frequency: latestTerms?.frequency ?? null,
          paymentAmount: latestTerms?.paymentAmount ?? null,
          numberOfPayments: latestTerms?.numberOfPayments ?? null,
          percentPaid,
        };
      });

      const syndicatedDetailsForPayouts = await prisma.applicationSyndicatorDetails.findMany({
        where: { syndicatorId: syndicator.id },
        select: { applicationId: true, percentageSyndicated: true },
      });
      const syndicatorPctByApplicationId = new Map<string, number>();
      for (const row of syndicatedDetailsForPayouts) {
        const aid = row.applicationId;
        syndicatorPctByApplicationId.set(
          aid,
          (syndicatorPctByApplicationId.get(aid) ?? 0) + decimalSum(row.percentageSyndicated),
        );
      }
      const syndicatedAppIdsForCollections = [...syndicatorPctByApplicationId.keys()];

      let recentPayoutCollections: Array<{
        id: string;
        trsDate: string;
        amount: number;
        syndicatorAmount: number;
        status: string;
        paymentStatusLabel: string;
        transactionType: string;
        source: string;
        notes: string | null;
        referenceNumber: string | null;
        applicationId: string;
        dealId: string | null;
        applicationDealId: string | null;
        applicationNumericId: number | null;
        dealDisplayName: string | null;
        businessName: string | null;
        pairedReversal: boolean;
      }> = [];

      if (syndicatedAppIdsForCollections.length > 0) {
        const collectionRows = await prisma.collectionPayment.findMany({
          where: {
            applicationId: { in: syndicatedAppIdsForCollections },
            status: { in: SYNDICATOR_PAYOUT_COLLECTION_STATUSES },
          },
          include: {
            Application: {
              select: {
                dealId: true,
                applicationId: true,
                dealDisplayName: true,
                client: { select: { businessName: true } },
              },
            },
          },
          orderBy: [{ updatedAt: 'desc' }, { scheduledDate: 'desc' }],
          take: 400,
        });

        const byApp = new Map<string, typeof collectionRows>();
        for (const p of collectionRows) {
          const list = byApp.get(p.applicationId) ?? [];
          list.push(p);
          byApp.set(p.applicationId, list);
        }

        for (const [, appRows] of byApp) {
          if (!appRows.length) continue;
          const applicationId = appRows[0].applicationId;
          const pct = syndicatorPctByApplicationId.get(applicationId) ?? 0;
          if (pct <= 0) continue;

          const dealId = appRows[0]?.Application?.dealId ?? null;
          const scoped = filterCollectionPaymentsForApplicationDeal(appRows, dealId);
          const pairedReversalDebitIds = new Set<string>();
          const strict = applyStrictTransactionFiltering(scoped, {
            pairedReversalDebitPaymentIdsOut: pairedReversalDebitIds,
          });

          for (const p of strict) {
            const gross = decimalSum(p.amount);
            const isPairedReversal =
              p.status === CollectionPaymentStatus.FAILED && pairedReversalDebitIds.has(p.id);
            const syndicatorAmount = Number(((gross * pct) / 100).toFixed(2));
            const app = p.Application;
            const trs = p.processedDate ?? p.Date ?? p.scheduledDate ?? p.updatedAt;
            recentPayoutCollections.push({
              id: p.id,
              trsDate: new Date(trs).toISOString(),
              amount: gross,
              syndicatorAmount,
              status: p.status,
              paymentStatusLabel: isPairedReversal
                ? 'Failed'
                : collectionStatusLabelForPayout(p.status),
              transactionType: isPairedReversal ? 'Reversal' : collectionTransactionTypeForPayout(p.status),
              source: p.source,
              notes: p.notes,
              referenceNumber: p.referenceNumber,
              applicationId: p.applicationId,
              dealId: p.dealId ?? app?.dealId ?? null,
              applicationDealId: app?.dealId ?? null,
              applicationNumericId: app?.applicationId ?? null,
              dealDisplayName: app?.dealDisplayName ?? null,
              businessName: app?.client?.businessName ?? null,
              pairedReversal: isPairedReversal,
            });
          }
        }

        recentPayoutCollections.sort((a, b) => (a.trsDate < b.trsDate ? 1 : a.trsDate > b.trsDate ? -1 : 0));
        recentPayoutCollections = recentPayoutCollections.slice(0, 50);
      }

      const sum = totalsAgg._sum;
      const fundedAmount = decimalSum(sum.fundedAmount);
      const amountSyndicated = decimalSum(sum.amountSyndicated);
      const paybackAmountSyndicated = decimalSum(sum.paybackAmountSyndicated);
      const commissionAmount = decimalSum(sum.commissionAmount);
      const managementFeeToDate = decimalSum(sum.managementFeeToDate);
      const collectedAmount = decimalSum(sum.collectedAmount);
      const remainingAmount = decimalSum(sum.remainingAmount);
      const defaultedFromAllocationStatus = decimalSum(defaultedAgg._sum.remainingAmount);
      const defaultedFromFailedCollections = await sumFailedCollectionSyndicatorShareForSyndicator(
        prisma,
        syndicator.id,
      );
      const defaultedAmount = defaultedFromAllocationStatus + defaultedFromFailedCollections;
      const slowPayAmount = decimalSum(slowPayAgg._sum.remainingAmount);
      const allocationsCount = totalsAgg._count?._all ?? 0;

      return res.status(200).json({
        success: true,
        data: {
          syndicator: {
            id: syndicator.id,
            firstName: syndicator.firstName,
            lastName: syndicator.lastName,
            currentBalance: decimalSum(syndicator.currentBalance),
          },
          totals: {
            fundedAmount,
            amountSyndicated,
            paybackAmountSyndicated,
            commissionAmount,
            managementFeeToDate,
            collectedAmount,
            remainingAmount,
            defaultedAmount,
            slowPayAmount,
            allocationsCount,
          },
          trend: { REPAYMENT, Funding },
          recentApplications,
          recentPayoutCollections,
        },
      });
    } catch (error) {
      console.error('Syndicator my summary error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Wallet ledger for one syndicator (admin transaction tab + syndicator-role activity). */
  async walletTransactions(req: Request, res: Response) {
    try {
      const syndicatorId = Number(req.params.id);
      if (!Number.isFinite(syndicatorId)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }

      const exists = await prisma.syndicator.count({ where: { id: syndicatorId } });
      if (!exists) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      // Syndicators may only view their own ledger.
      if (req.user?.role === 'SYNDICATOR') {
        const ownProfile = await prisma.syndicator.findFirst({
          where: { userId: req.user.id },
          select: { id: true },
        });
        if (!ownProfile || ownProfile.id !== syndicatorId) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      }

      const rows = await prisma.syndicatorWalletTransaction.findMany({
        where: { syndicatorId },
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
      });

      const appUuids = [
        ...new Set(rows.map((r) => r.applicationId).filter((v): v is string => Boolean(v))),
      ];
      let appMap = new Map<
        string,
        { id: string; dealId: string | null; applicationId: number | null; dealDisplayName: string | null }
      >();
      if (appUuids.length > 0) {
        const apps = await prisma.application.findMany({
          where: { id: { in: appUuids } },
          select: { id: true, dealId: true, applicationId: true, dealDisplayName: true },
        });
        appMap = new Map(apps.map((a) => [a.id, a]));
      }

      const data = rows.map((r) => ({
        ...r,
        application: r.applicationId ? appMap.get(r.applicationId) ?? null : null,
      }));

      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Syndicator wallet list error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Authenticated syndicator: list their withdrawal requests (any status). */
  async listMyWithdrawalRequests(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (req.user?.role !== 'SYNDICATOR') {
        return res.status(403).json({ success: false, message: 'Only syndicators can access this resource' });
      }

      const profile = await prisma.syndicator.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!profile) {
        return res.status(404).json({ success: false, message: 'No syndicator profile is linked to this account' });
      }

      const rows = await withdrawalDb(prisma).syndicatorWithdrawalRequest.findMany({
        where: { syndicatorId: profile.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return res.status(200).json({
        success: true,
        data: serializeExtendedSyndicatorPayload({ rows } as Record<string, unknown>).rows,
      });
    } catch (error) {
      console.error('Syndicator withdrawal list (me) error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Authenticated syndicator: submit a wallet withdrawal request for admin approval. */
  async createMyWithdrawalRequest(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }
      if (req.user?.role !== 'SYNDICATOR') {
        return res.status(403).json({ success: false, message: 'Only syndicators can access this resource' });
      }

      const body = req.body ?? {};
      const amount = toNumber(body.amount);
      if (amount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
      }

      const comment =
        body.comment != null && String(body.comment).trim() !== '' ? String(body.comment).trim() : null;
      const transactionType =
        body.transactionType != null && String(body.transactionType).trim() !== ''
          ? String(body.transactionType).trim()
          : null;

      let payoutDate: Date | null = null;
      if (body.payoutDate != null && String(body.payoutDate).trim() !== '') {
        const d = new Date(String(body.payoutDate));
        if (!Number.isNaN(d.getTime())) payoutDate = d;
      }

      const created = await prisma.$transaction(async (tx) => {
        const profile = await tx.syndicator.findFirst({
          where: { userId },
          select: { id: true, currentBalance: true },
        });
        if (!profile) {
          return null;
        }

        const pendingAgg = await withdrawalDb(tx).syndicatorWithdrawalRequest.aggregate({
          where: { syndicatorId: profile.id, status: 'PENDING' },
          _sum: { amount: true },
        });
        const pendingTotal = decimalSum(pendingAgg._sum.amount);
        const balance = toNumber(profile.currentBalance);
        const available = balance - pendingTotal;
        if (amount > available + 0.0001) {
          throw new Error('INSUFFICIENT_AVAILABLE');
        }

        return withdrawalDb(tx).syndicatorWithdrawalRequest.create({
          data: {
            syndicatorId: profile.id,
            amount: new Prisma.Decimal(amount),
            comment,
            transactionType,
            payoutDate,
            status: 'PENDING',
          },
        });
      });

      if (!created) {
        return res.status(404).json({ success: false, message: 'No syndicator profile is linked to this account' });
      }

      return res.status(201).json({
        success: true,
        data: serializeExtendedSyndicatorPayload(created as unknown as Record<string, unknown>),
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_AVAILABLE') {
        return res.status(400).json({
          success: false,
          message: 'Amount exceeds available wallet balance (including other pending requests)',
        });
      }
      console.error('Syndicator withdrawal create error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Staff: list withdrawal requests for a syndicator (admin withdrawals tab). */
  async listWithdrawalRequestsBySyndicatorId(req: Request, res: Response) {
    try {
      if (req.user?.role === 'SYNDICATOR') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const syndicatorId = Number(req.params.id);
      if (!Number.isFinite(syndicatorId)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }

      const exists = await prisma.syndicator.count({ where: { id: syndicatorId } });
      if (!exists) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      const rows = await withdrawalDb(prisma).syndicatorWithdrawalRequest.findMany({
        where: { syndicatorId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      return res.status(200).json({
        success: true,
        data: serializeExtendedSyndicatorPayload({ rows } as Record<string, unknown>).rows,
      });
    } catch (error) {
      console.error('Syndicator withdrawal list (admin) error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Staff: approve or decline a pending withdrawal; approve posts a WITHDRAW wallet transaction. */
  async reviewWithdrawalRequest(req: Request, res: Response) {
    try {
      if (req.user?.role === 'SYNDICATOR') {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const syndicatorId = Number(req.params.id);
      const requestId = Number(req.params.requestId);
      if (!Number.isFinite(syndicatorId) || !Number.isFinite(requestId)) {
        return res.status(400).json({ success: false, message: 'Invalid id' });
      }

      const decision = String((req.body as { decision?: string })?.decision ?? '')
        .trim()
        .toUpperCase();
      if (decision !== 'APPROVE' && decision !== 'DECLINE') {
        return res.status(400).json({ success: false, message: 'decision must be APPROVE or DECLINE' });
      }

      const reviewerId = req.user?.id ?? null;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const row = await withdrawalDb(tx).syndicatorWithdrawalRequest.findFirst({
            where: { id: requestId, syndicatorId },
          });
          if (!row) {
            return { kind: 'NOT_FOUND' as const };
          }
          if (String(row.status) !== 'PENDING') {
            return { kind: 'NOT_PENDING' as const };
          }

          if (decision === 'DECLINE') {
            const updated = await withdrawalDb(tx).syndicatorWithdrawalRequest.update({
              where: { id: requestId },
              data: {
                status: 'DECLINED',
                reviewedAt: new Date(),
                reviewedByUserId: reviewerId,
              },
            });
            return { kind: 'OK' as const, row: updated };
          }

          const syndicator = await tx.syndicator.findUnique({
            where: { id: syndicatorId },
            select: { currentBalance: true },
          });
          if (!syndicator) {
            return { kind: 'NOT_FOUND' as const };
          }

          const amount = toNumber(row.amount);
          const prevBalance = toNumber(syndicator.currentBalance);
          if (amount > prevBalance + 0.0001) {
            throw new Error('INSUFFICIENT_BALANCE');
          }
          const newBalance = prevBalance - amount;

          const descParts = [`Withdrawal approved (request #${row.id})`];
          if (row.comment && String(row.comment).trim() !== '') {
            descParts.push(`— ${String(row.comment)}`);
          }
          const description = descParts.join(' ');

          await tx.syndicatorWalletTransaction.create({
            data: {
              syndicatorId,
              amount: new Prisma.Decimal(amount),
              prevBalance: new Prisma.Decimal(prevBalance),
              description,
              paymentType: 'WITHDRAW',
              date:
              row.payoutDate != null && row.payoutDate !== ''
                ? new Date(String(row.payoutDate))
                : new Date(),
              merchantName: null,
              applicationId: null,
            },
          });

          await tx.syndicator.update({
            where: { id: syndicatorId },
            data: { currentBalance: new Prisma.Decimal(newBalance) },
          });

          const updated = await withdrawalDb(tx).syndicatorWithdrawalRequest.update({
            where: { id: requestId },
            data: {
              status: 'APPROVED',
              reviewedAt: new Date(),
              reviewedByUserId: reviewerId,
            },
          });
          return { kind: 'OK' as const, row: updated };
        });

        if (result.kind === 'NOT_FOUND') {
          return res.status(404).json({ success: false, message: 'Withdrawal request not found' });
        }
        if (result.kind === 'NOT_PENDING') {
          return res.status(409).json({ success: false, message: 'Request is no longer pending' });
        }
        if (result.kind !== 'OK') {
          return res.status(500).json({ success: false, message: 'Unexpected review result' });
        }

        return res.status(200).json({
          success: true,
          data: serializeExtendedSyndicatorPayload(result.row as unknown as Record<string, unknown>),
        });
      } catch (inner) {
        if (inner instanceof Error && inner.message === 'INSUFFICIENT_BALANCE') {
          return res.status(400).json({
            success: false,
            message: 'Syndicator wallet balance is insufficient to approve this request',
          });
        }
        throw inner;
      }
    } catch (error) {
      console.error('Syndicator withdrawal review error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Manual wallet adjustment (admin) — Fidi-style: Wallet credit / Withdraw (+ optional DEBIT alias).
   */
  async creditWalletBalance(req: Request, res: Response) {
    try {
      if (req.user?.role === 'SYNDICATOR') {
        return res.status(403).json({
          success: false,
          message: 'Syndicators cannot post direct wallet adjustments. Use withdrawal requests instead.',
        });
      }

      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }

      const body = req.body ?? {};
      const amount = toNumber(body.amount);
      if (amount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be greater than zero' });
      }

      const paymentTypeRaw = String(body.paymentType ?? '').trim().toUpperCase();
      const isCredit =
        paymentTypeRaw === 'CREDIT' ||
        paymentTypeRaw === 'WALLET_CREDIT' ||
        paymentTypeRaw === 'WALLET CREDIT';
      const isDebit = paymentTypeRaw === 'DEBIT' || paymentTypeRaw === 'WITHDRAW';
      if (!isCredit && !isDebit) {
        return res.status(400).json({
          success: false,
          message: 'Transaction type must be wallet credit or withdraw',
        });
      }

      const description = String(body.description ?? '').trim() || (isCredit ? 'Wallet credit' : 'Withdrawal');
      const dateRaw = body.date != null && body.date !== '' ? new Date(body.date as string) : new Date();
      if (Number.isNaN(dateRaw.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date' });
      }

      const merchantName =
        body.merchantName != null && String(body.merchantName).trim() !== ''
          ? String(body.merchantName).trim()
          : null;

      const updated = await prisma.$transaction(async (tx) => {
        const syndicator = await tx.syndicator.findUnique({ where: { id } });
        if (!syndicator) {
          return null;
        }

        const prevBalance = toNumber(syndicator.currentBalance);
        let newBalance: number;
        let pt: string;
        if (isCredit) {
          newBalance = prevBalance + amount;
          pt = paymentTypeRaw === 'CREDIT' ? 'CREDIT' : 'WALLET_CREDIT';
        } else {
          newBalance = prevBalance - amount;
          if (newBalance < -0.0001) {
            throw new Error('INSUFFICIENT_BALANCE');
          }
          pt = 'WITHDRAW';
        }

        await tx.syndicatorWalletTransaction.create({
          data: {
            syndicatorId: id,
            amount: new Prisma.Decimal(amount),
            prevBalance: new Prisma.Decimal(prevBalance),
            description,
            paymentType: pt,
            date: dateRaw,
            merchantName,
            applicationId: null,
          },
        });

        await tx.syndicator.update({
          where: { id },
          data: { currentBalance: new Prisma.Decimal(newBalance) },
        });

        const fresh = await tx.syndicator.findUnique({
          where: { id },
          select: { id: true, currentBalance: true },
        });
        return fresh;
      });

      if (!updated) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      return res.status(200).json({
        success: true,
        message: 'Wallet balance updated',
        data: {
          syndicatorId: updated.id,
          currentBalance:
            updated.currentBalance != null ? String(updated.currentBalance) : String(0),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({
          success: false,
          message: 'Insufficient wallet balance for this withdrawal',
        });
      }
      console.error('Syndicator wallet adjustment error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const body = req.body ?? {};
      const firstName = String(body.firstName ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      if (!firstName || !email) {
        return res.status(400).json({ success: false, message: 'firstName and email are required' });
      }

      const created = await prisma.syndicator.create({
        data: {
          firstName,
          lastName: body.lastName ? String(body.lastName).trim() : null,
          email,
          phone: body.phone ? String(body.phone).trim() : null,
          companyName: body.companyName ? String(body.companyName).trim() : null,
          role: body.role ?? 'PARTICIPANT',
          address1: String(body.address1 ?? 'N/A'),
          city: String(body.city ?? 'N/A'),
          state: String(body.state ?? 'N/A'),
          zip: String(body.zip ?? 'N/A'),
          userId: body.userId ? String(body.userId) : null,
          currentBalance: new Prisma.Decimal(toNumber(body.currentBalance)),
        },
      });
      return res.status(201).json({ success: true, data: created });
    } catch (error) {
      console.error('Syndicator create error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }
      const body = req.body ?? {};
      const updated = await prisma.syndicator.update({
        where: { id },
        data: {
          firstName: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          companyName: body.companyName,
          email: body.email ? String(body.email).trim().toLowerCase() : undefined,
          address1: body.address1,
          address2: body.address2,
          city: body.city,
          state: body.state,
          zip: body.zip,
          currentBalance:
            body.currentBalance !== undefined
              ? new Prisma.Decimal(toNumber(body.currentBalance))
              : undefined,
        },
      });
      return res.status(200).json({ success: true, data: updated });
    } catch (error) {
      console.error('Syndicator update error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Upsert fee / ACH preferences (admin syndicator detail → Settings tab).
   */
  async upsertSyndicatorSetting(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }
      const syndicator = await prisma.syndicator.findUnique({ where: { id } });
      if (!syndicator) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      const body = req.body ?? {};
      const ALLOWED_CALC = new Set(['PRINCIPAL_SYNDICATED_AMOUNT', 'DISBURSED_SYNDICATED_AMOUNT']);

      const feeDec = toOptDecimal(body.feePercentage);
      let calculationLogic: string | null | undefined =
        body.calculationLogic !== undefined ? String(body.calculationLogic).trim() : undefined;
      if (
        calculationLogic !== undefined &&
        calculationLogic !== '' &&
        !ALLOWED_CALC.has(calculationLogic)
      ) {
        return res.status(400).json({ success: false, message: 'Invalid calculationLogic' });
      }
      if (calculationLogic === '') calculationLogic = null;

      let frequency =
        body.frequency !== undefined && body.frequency !== null && body.frequency !== ''
          ? String(body.frequency).trim()
          : undefined;
      if (
        frequency !== undefined &&
        !PAYMENT_FREQUENCY_VALUES.has(frequency as PaymentFrequency)
      ) {
        return res.status(400).json({
          success: false,
          message: 'frequency must be DAILY, WEEKLY, or BIWEEKLY',
        });
      }

      let automaticACH: boolean | undefined;
      const achParsed = toOptBoolean(body.automaticACH);
      if (achParsed !== null) automaticACH = achParsed;
      else if (body.automaticACH !== undefined && body.automaticACH !== '') {
        return res.status(400).json({ success: false, message: 'Invalid automaticACH' });
      }

      let notificationRecipients: string[] | undefined;
      if (body.notificationRecipients !== undefined) {
        const parsed = parseNotificationRecipients(body.notificationRecipients);
        if (!parsed.ok) {
          return res.status(400).json({ success: false, message: parsed.message });
        }
        notificationRecipients = parsed.list;
      }

      let paymentDays: string[] | undefined;
      if (Array.isArray(body.paymentDays)) {
        paymentDays = body.paymentDays.map((d: unknown) => String(d ?? '').trim()).filter(Boolean);
      } else if (typeof body.paymentDays === 'string' && body.paymentDays.trim()) {
        paymentDays = body.paymentDays
          .split(/[,;\s]+/)
          .map((d: string) => d.trim())
          .filter(Boolean);
      } else if (body.paymentDays !== undefined) {
        return res.status(400).json({ success: false, message: 'Invalid paymentDays' });
      }

      const existing = await prisma.syndicatorSetting.findUnique({
        where: { syndicatorId: id },
      });

      await prisma.syndicatorSetting.upsert({
        where: { syndicatorId: id },
        create: {
          syndicatorId: id,
          feePercentage: feeDec ?? new Prisma.Decimal(0),
          calculationLogic:
            calculationLogic ?? existing?.calculationLogic ?? 'PRINCIPAL_SYNDICATED_AMOUNT',
          frequency: frequency ?? existing?.frequency ?? 'DAILY',
          automaticACH: automaticACH ?? existing?.automaticACH ?? false,
          notificationRecipients:
            notificationRecipients ?? existing?.notificationRecipients ?? [],
          paymentDays: paymentDays ?? existing?.paymentDays ?? [],
        },
        update: {
          ...(body.feePercentage !== undefined
            ? { feePercentage: feeDec ?? new Prisma.Decimal(0) }
            : {}),
          ...(calculationLogic !== undefined ? { calculationLogic } : {}),
          ...(frequency !== undefined ? { frequency } : {}),
          ...(automaticACH !== undefined ? { automaticACH } : {}),
          ...(notificationRecipients !== undefined ? { notificationRecipients } : {}),
          ...(paymentDays !== undefined ? { paymentDays } : {}),
        },
      });

      const data = await prisma.syndicator.findUnique({
        where: { id },
        include: {
          SyndicatorBankInformation: true,
          SyndicatorSetting: true,
          SyndicatorPaymentSetting: { include: { repaymentPlan: true } },
        },
      });

      const outbound = serializeExtendedSyndicatorPayload(data as Record<string, unknown>);
      return res.status(200).json({ success: true, data: outbound });
    } catch (error) {
      console.error('Syndicator setting upsert error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Upsert payment rails + repayment plan (admin syndicator detail → Billing tab).
   */
  async upsertSyndicatorPaymentSetting(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }
      const syndicator = await prisma.syndicator.findUnique({ where: { id } });
      if (!syndicator) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      const body = req.body ?? {};
      const existingPay = await prisma.syndicatorPaymentSetting.findUnique({
        where: { syndicatorId: id },
        include: { repaymentPlan: true },
      });

      const paymentMethod = parsePaymentMethod(body.paymentMethod, PaymentMethod.ACH);
      const repaymentMethod = parseRepaymentMethod(body.repaymentMethod, RepaymentMethod.ACH);

      let mergedProcessor: PaymentProcessor | null = existingPay?.paymentProcessor ?? null;
      if ('paymentProcessor' in body) {
        mergedProcessor = parsePaymentProcessor(body.paymentProcessor);
      }
      let mergedRepProc: RepaymentProcessor | null = existingPay?.repaymentProcessor ?? null;
      if ('repaymentProcessor' in body) {
        mergedRepProc = parseRepaymentProcessor(body.repaymentProcessor);
      }

      const currencyRaw =
        body.paymentCurrency !== undefined && body.paymentCurrency !== null
          ? String(body.paymentCurrency).trim()
          : undefined;
      const paymentCurrency =
        currencyRaw !== undefined ? (currencyRaw === '' ? null : currencyRaw) : undefined;

      let autoRepayEnabled: boolean | undefined;
      const ar = toOptBoolean(body.autoRepayEnabled);
      if (ar !== null) autoRepayEnabled = ar;
      else if (body.autoRepayEnabled !== undefined && body.autoRepayEnabled !== '') {
        return res.status(400).json({ success: false, message: 'Invalid autoRepayEnabled' });
      }

      const interestRate =
        body.interestRate !== undefined ? toOptDecimal(body.interestRate) : undefined;
      const gracePeriodDays =
        body.gracePeriodDays !== undefined ? toOptInt(body.gracePeriodDays) : undefined;
      const lateFeeAmount =
        body.lateFeeAmount !== undefined ? toOptDecimal(body.lateFeeAmount) : undefined;
      const maxOutstandingAmount =
        body.maxOutstandingAmount !== undefined
          ? toOptDecimal(body.maxOutstandingAmount)
          : undefined;
      const minMonthlyPayment =
        body.minMonthlyPayment !== undefined ? toOptDecimal(body.minMonthlyPayment) : undefined;
      const transactionLimit =
        body.transactionLimit !== undefined ? toOptDecimal(body.transactionLimit) : undefined;
      const paymentDueDay =
        body.paymentDueDay !== undefined ? toOptInt(body.paymentDueDay) : undefined;

      let paymentDetails: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;
      if ('paymentDetails' in body) {
        if (body.paymentDetails === null || body.paymentDetails === '') {
          paymentDetails = Prisma.JsonNull;
        } else if (
          typeof body.paymentDetails === 'object' ||
          typeof body.paymentDetails === 'string' ||
          typeof body.paymentDetails === 'number'
        ) {
          if (typeof body.paymentDetails === 'string') {
            try {
              paymentDetails = JSON.parse(body.paymentDetails) as Prisma.InputJsonValue;
            } catch {
              return res.status(400).json({
                success: false,
                message: 'paymentDetails must be valid JSON',
              });
            }
          } else {
            paymentDetails = body.paymentDetails as Prisma.InputJsonValue;
          }
        } else {
          return res.status(400).json({ success: false, message: 'Invalid paymentDetails' });
        }
      }

      const createdOrUpdated = await prisma.syndicatorPaymentSetting.upsert({
        where: { syndicatorId: id },
        create: {
          syndicatorId: id,
          paymentMethod,
          repaymentMethod,
          paymentProcessor: mergedProcessor,
          repaymentProcessor: mergedRepProc,
          paymentCurrency: (paymentCurrency ?? 'USD') as string | null,
          autoRepayEnabled: autoRepayEnabled ?? false,
          interestRate: interestRate ?? null,
          ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
          lateFeeAmount: lateFeeAmount ?? null,
          maxOutstandingAmount: maxOutstandingAmount ?? null,
          minMonthlyPayment: minMonthlyPayment ?? null,
          transactionLimit: transactionLimit ?? null,
          ...(paymentDueDay !== undefined ? { paymentDueDay } : {}),
          ...(paymentDetails !== undefined ? { paymentDetails } : {}),
        },
        update: {
          paymentMethod,
          repaymentMethod,
          ...(body.paymentProcessor !== undefined ? { paymentProcessor: mergedProcessor } : {}),
          ...(body.repaymentProcessor !== undefined ? { repaymentProcessor: mergedRepProc } : {}),
          ...(paymentCurrency !== undefined ? { paymentCurrency } : {}),
          ...(autoRepayEnabled !== undefined ? { autoRepayEnabled } : {}),
          ...(interestRate !== undefined ? { interestRate } : {}),
          ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
          ...(lateFeeAmount !== undefined ? { lateFeeAmount } : {}),
          ...(maxOutstandingAmount !== undefined ? { maxOutstandingAmount } : {}),
          ...(minMonthlyPayment !== undefined ? { minMonthlyPayment } : {}),
          ...(transactionLimit !== undefined ? { transactionLimit } : {}),
          ...(paymentDueDay !== undefined ? { paymentDueDay } : {}),
          ...(paymentDetails !== undefined ? { paymentDetails } : {}),
        },
      });

      const settingId = createdOrUpdated.id;

      if (body.repaymentPlan === null) {
        await prisma.repaymentPlan.deleteMany({
          where: { syndicatorPaymentSettingId: settingId },
        });
      } else if (body.repaymentPlan !== undefined && typeof body.repaymentPlan === 'object') {
        const plan = body.repaymentPlan as Record<string, unknown>;

        let bankIdResolved: number | null = null;
        if (
          plan.bankId !== null &&
          plan.bankId !== undefined &&
          String(plan.bankId).trim() !== ''
        ) {
          const n = Number(plan.bankId);
          if (!Number.isFinite(n)) {
            return res.status(400).json({ success: false, message: 'Invalid repaymentPlan.bankId' });
          }
          const bk = await prisma.syndicatorBankInformation.findFirst({
            where: { id: n, syndicatorId: id },
          });
          if (!bk) {
            return res.status(400).json({
              success: false,
              message: 'repaymentPlan.bankId must belong to this syndicator',
            });
          }
          bankIdResolved = n;
        }

        let planDays: string[] | undefined;
        if (Array.isArray(plan.paymentDays)) {
          planDays = plan.paymentDays.map((d: unknown) => String(d ?? '').trim()).filter(Boolean);
        } else if (typeof plan.paymentDays === 'string' && String(plan.paymentDays).trim()) {
          planDays = String(plan.paymentDays)
            .split(/[,;\s]+/)
            .map((d) => d.trim())
            .filter(Boolean);
        } else if (plan.paymentDays !== undefined) {
          return res.status(400).json({
            success: false,
            message: 'repaymentPlan.paymentDays must be an array or comma-separated string',
          });
        }

        const freq = parsePaymentFrequency(plan.frequency);
        const planRepayMethod = parseRepaymentMethod(
          plan.repaymentMethod,
          createdOrUpdated.repaymentMethod as RepaymentMethod,
        );
        const existingPlanProc = parseRepaymentProcessor(existingPay?.repaymentPlan?.repaymentProcessor);

        await prisma.repaymentPlan.upsert({
          where: { syndicatorPaymentSettingId: settingId },
          create: {
            syndicatorPaymentSettingId: settingId,
            frequency: freq,
            repaymentMethod: planRepayMethod,
            repaymentProcessor:
              parseRepaymentProcessor(plan.repaymentProcessor) ?? mergedRepProc ?? existingPlanProc,
            paymentDays: planDays ?? [],
            bankId: bankIdResolved,
          },
          update: {
            frequency: freq,
            repaymentMethod: planRepayMethod,
            repaymentProcessor:
              parseRepaymentProcessor(plan.repaymentProcessor) ?? mergedRepProc ?? existingPlanProc,
            paymentDays: planDays ?? [],
            bankId: bankIdResolved,
          },
        });
      }

      const data = await prisma.syndicator.findUnique({
        where: { id },
        include: {
          SyndicatorBankInformation: true,
          SyndicatorSetting: true,
          SyndicatorPaymentSetting: { include: { repaymentPlan: true } },
        },
      });

      const outbound = serializeExtendedSyndicatorPayload(data as Record<string, unknown>);
      return res.status(200).json({ success: true, data: outbound });
    } catch (error) {
      console.error('Syndicator payment setting upsert error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Create syndicator-linked bank row (admin billing → bank dropdown). */
  async createBankAccount(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }
      const syndicator = await prisma.syndicator.findUnique({ where: { id } });
      if (!syndicator) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      const body = req.body ?? {};
      const bankName = String(body.bankName ?? '').trim();
      const routingNumber = String(body.routingNumber ?? '').trim();
      const accountNumber = String(body.accountNumber ?? '').trim();
      if (!bankName || !routingNumber || !accountNumber) {
        return res.status(400).json({
          success: false,
          message: 'bankName, routingNumber, and accountNumber are required',
        });
      }

      let accountType: AccountType = AccountType.SAVINGS;
      if (body.accountType !== undefined && body.accountType !== null && body.accountType !== '') {
        const at = String(body.accountType).trim();
        if (!ACCOUNT_TYPE_VALUES.has(at)) {
          return res.status(400).json({ success: false, message: 'Invalid accountType' });
        }
        accountType = at as AccountType;
      }

      const optStr = (k: string): string | null => {
        if (body[k] === undefined || body[k] === null) return null;
        const s = String(body[k]).trim();
        return s === '' ? null : s;
      };

      const created = await prisma.syndicatorBankInformation.create({
        data: {
          syndicatorId: id,
          bankName,
          routingNumber,
          accountNumber,
          branch: optStr('branch'),
          dda: optStr('dda'),
          nameOnVoidedCheck: optStr('nameOnVoidedCheck'),
          accountType,
        },
      });

      return res.status(201).json({
        success: true,
        data: serializeExtendedSyndicatorPayload(created as unknown as Record<string, unknown>),
      });
    } catch (error) {
      console.error('Syndicator bank create error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid syndicator id' });
      }
      await deleteSyndicatorCascadeUser(id);
      return res.status(200).json({ success: true, message: 'Syndicator deleted successfully' });
    } catch (error: unknown) {
      const err = error as { statusCode?: number; message?: string };
      if (err?.statusCode === 404) {
        return res.status(404).json({ success: false, message: err.message ?? 'Syndicator not found' });
      }
      console.error('Syndicator delete error:', error);
      return res.status(500).json({
        success: false,
        message:
          process.env.NODE_ENV === 'development' ? (err.message ?? 'Internal server error') : 'Internal server error',
      });
    }
  }
}

export default new SyndicatorController();
