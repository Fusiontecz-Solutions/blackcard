import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { dealLabelForWalletDescription } from '../services/applicationDealLabel';

const toNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toPositiveNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const toLoosePositiveIntOrNull = (value: unknown): number | null => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.trunc(value);
  const s = String(value).trim();
  if (!s) return null;
  const m = /^(\d+)/.exec(s);
  if (!m) return null;
  const parsed = Number.parseInt(m[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

class ApplicationSyndicatorController {
  /** Syndication allocations for one syndicator (admin syndicator detail view). */
  async listBySyndicator(req: Request, res: Response) {
    try {
      const syndicatorId = Number(req.params.syndicatorId);
      if (!Number.isFinite(syndicatorId)) {
        return res.status(400).json({ success: false, message: 'syndicatorId is required' });
      }

      const pageRaw = req.query.page;
      const usePaging =
        pageRaw !== undefined && pageRaw !== null && String(pageRaw).trim() !== '';

      const page = usePaging ? Math.max(1, Number.parseInt(String(pageRaw), 10) || 1) : 1;
      const pageSize = usePaging
        ? Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize ?? '10'), 10) || 10))
        : 10;
      const q = String(req.query.q ?? '').trim();

      let where: Prisma.ApplicationSyndicatorDetailsWhereInput = { syndicatorId };

      if (usePaging && q) {
        const orFilters: Prisma.ApplicationSyndicatorDetailsWhereInput[] = [
          { merchantName: { contains: q, mode: 'insensitive' } },
        ];

        const appsByName = await prisma.application.findMany({
          where: {
            OR: [
              { dealDisplayName: { contains: q, mode: 'insensitive' } },
              { client: { businessName: { contains: q, mode: 'insensitive' } } },
            ],
          },
          select: { id: true },
        });
        const idsFromName = appsByName.map((a) => a.id);
        if (idsFromName.length > 0) {
          orFilters.push({ applicationId: { in: idsFromName } });
        }

        const appsByDealId = await prisma.application.findMany({
          where: { dealId: { contains: q, mode: 'insensitive' } },
          select: { id: true },
        });
        const idsFromDealId = appsByDealId.map((a) => a.id);
        if (idsFromDealId.length > 0) {
          orFilters.push({ applicationId: { in: idsFromDealId } });
        }

        const dealIdNum = Number.parseInt(q, 10);
        if (Number.isFinite(dealIdNum) && dealIdNum > 0) {
          const byAppId = await prisma.application.findFirst({
            where: { applicationId: dealIdNum },
            select: { id: true },
          });
          if (byAppId) {
            orFilters.push({ applicationId: byAppId.id });
          }
        }

        where = {
          syndicatorId,
          OR: orFilters,
        };
      }

      let details: Awaited<ReturnType<typeof prisma.applicationSyndicatorDetails.findMany>>;
      let total = 0;

      if (!usePaging) {
        details = await prisma.applicationSyndicatorDetails.findMany({
          where: { syndicatorId },
          orderBy: { id: 'desc' },
        });
      } else {
        const [rows, count] = await prisma.$transaction([
          prisma.applicationSyndicatorDetails.findMany({
            where,
            orderBy: { id: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          }),
          prisma.applicationSyndicatorDetails.count({ where }),
        ]);
        details = rows;
        total = count;
      }

      const appIds = [...new Set(details.map((d) => d.applicationId).filter(Boolean))];
      let appMap = new Map<
        string,
        {
          id: string;
          dealId: string | null;
          dealDisplayName: string | null;
          applicationId: number | null;
          businessName: string | null;
          fundingDate: string | null;
          /** Latest terms / offer frequency — used to turn `termLength` (periods) into a calendar end date. */
          repaymentFrequency: string | null;
        }
      >();
      if (appIds.length > 0) {
        const apps = await prisma.application.findMany({
          where: { id: { in: appIds } },
          select: {
            id: true,
            dealId: true,
            dealDisplayName: true,
            applicationId: true,
            client: { select: { businessName: true } },
            fundings: { select: { fundingDate: true } },
            OfferDecision: { select: { frequency: true } },
            termsOffers: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { frequency: true },
            },
          },
        });
        appMap = new Map(
          apps.map((a) => {
            const latestTerms = a.termsOffers?.[0] ?? null;
            const repaymentFrequency =
              (latestTerms?.frequency && String(latestTerms.frequency).trim()) ||
              (a.OfferDecision?.frequency && String(a.OfferDecision.frequency).trim()) ||
              null;
            return [
              a.id,
              {
                id: a.id,
                dealId: a.dealId,
                dealDisplayName: a.dealDisplayName,
                applicationId: a.applicationId,
                businessName: a.client?.businessName ?? null,
                fundingDate: a.fundings?.fundingDate
                  ? new Date(a.fundings.fundingDate).toISOString()
                  : null,
                repaymentFrequency,
              },
            ];
          }),
        );
      }
      const data = details.map((d) => ({
        ...d,
        application: appMap.get(d.applicationId) ?? null,
      }));

      if (!usePaging) {
        return res.status(200).json({ success: true, data });
      }

      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      return res.status(200).json({
        success: true,
        data,
        meta: {
          total,
          page,
          pageSize,
          totalPages,
        },
      });
    } catch (error) {
      console.error('Application syndicator list by syndicator error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async listByApplication(req: Request, res: Response) {
    try {
      const applicationId = String(req.params.applicationId ?? '').trim();
      if (!applicationId) {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }
      const data = await prisma.applicationSyndicatorDetails.findMany({
        where: { applicationId },
        orderBy: { id: 'asc' },
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      console.error('Application syndicator list error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** All syndications grouped by deal — powers the internal dashboard drill-down. */
  async listAllGroupedByDeal(req: Request, res: Response) {
    try {
      const statusFilter = String(req.query.status ?? '').trim().toLowerCase();
      const q = String(req.query.q ?? '').trim().toLowerCase();

      const rows = await prisma.applicationSyndicatorDetails.findMany({ orderBy: { id: 'desc' } });
      const appIds = [...new Set(rows.map((r) => r.applicationId).filter(Boolean))];
      const apps = appIds.length
        ? await prisma.application.findMany({
            where: { id: { in: appIds } },
            select: {
              id: true,
              dealId: true,
              applicationId: true,
              client: { select: { businessName: true } },
              fundings: { select: { fundingDate: true } },
            },
          })
        : [];
      const appMap = new Map(apps.map((a) => [a.id, a]));

      type DealSyndicator = {
        id: number;
        syndicatorId: number;
        syndicatorName: string | null;
        percentageSyndicated: number;
        amountSyndicated: number;
        paybackAmountSyndicated: number;
        collectedAmount: number;
        remainingAmount: number;
        commissionAmount: number;
        status: string | null;
      };
      type DealGroup = {
        applicationId: string;
        dealId: string | null;
        merchantName: string | null;
        businessName: string | null;
        fundingDate: string | null;
        syndicatorCount: number;
        amountSyndicated: number;
        paybackAmountSyndicated: number;
        collectedAmount: number;
        remainingAmount: number;
        commissionAmount: number;
        statuses: Set<string>;
        syndicators: DealSyndicator[];
      };

      const groups = new Map<string, DealGroup>();
      for (const r of rows) {
        const app = appMap.get(r.applicationId);
        let g = groups.get(r.applicationId);
        if (!g) {
          g = {
            applicationId: r.applicationId,
            dealId: app?.dealId ?? null,
            merchantName: r.merchantName ?? app?.client?.businessName ?? null,
            businessName: app?.client?.businessName ?? null,
            fundingDate: app?.fundings?.fundingDate
              ? new Date(app.fundings.fundingDate).toISOString()
              : null,
            syndicatorCount: 0,
            amountSyndicated: 0,
            paybackAmountSyndicated: 0,
            collectedAmount: 0,
            remainingAmount: 0,
            commissionAmount: 0,
            statuses: new Set<string>(),
            syndicators: [],
          };
          groups.set(r.applicationId, g);
        }
        g.syndicatorCount += 1;
        g.amountSyndicated += toNumber(r.amountSyndicated);
        g.paybackAmountSyndicated += toNumber(r.paybackAmountSyndicated);
        g.collectedAmount += toNumber(r.collectedAmount);
        g.remainingAmount += toNumber(r.remainingAmount);
        g.commissionAmount += toNumber(r.commissionAmount);
        if (r.status) g.statuses.add(r.status);
        g.syndicators.push({
          id: r.id,
          syndicatorId: r.syndicatorId,
          syndicatorName: r.syndicatorName,
          percentageSyndicated: toNumber(r.percentageSyndicated),
          amountSyndicated: toNumber(r.amountSyndicated),
          paybackAmountSyndicated: toNumber(r.paybackAmountSyndicated),
          collectedAmount: toNumber(r.collectedAmount),
          remainingAmount: toNumber(r.remainingAmount),
          commissionAmount: toNumber(r.commissionAmount),
          status: r.status ?? null,
        });
      }

      let data = [...groups.values()].map((g) => {
        const { statuses, ...rest } = g;
        const pctCollected =
          g.paybackAmountSyndicated > 0
            ? Math.round((g.collectedAmount / g.paybackAmountSyndicated) * 100)
            : 0;
        const status =
          g.remainingAmount <= 0.5
            ? 'Paid off'
            : [...statuses][0] || (g.collectedAmount > 0 ? 'Active' : 'Open');
        return { ...rest, status, pctCollected };
      });

      if (q) {
        data = data.filter(
          (d) =>
            (d.merchantName ?? '').toLowerCase().includes(q) ||
            (d.dealId ?? '').toLowerCase().includes(q) ||
            (d.businessName ?? '').toLowerCase().includes(q),
        );
      }
      if (statusFilter) {
        data = data.filter(
          (d) =>
            (d.status ?? '').toLowerCase().includes(statusFilter) ||
            d.syndicators.some((s) => (s.status ?? '').toLowerCase().includes(statusFilter)),
        );
      }

      const totals = data.reduce(
        (a, d) => ({
          deals: a.deals + 1,
          syndications: a.syndications + d.syndicatorCount,
          amountSyndicated: a.amountSyndicated + d.amountSyndicated,
          paybackAmountSyndicated: a.paybackAmountSyndicated + d.paybackAmountSyndicated,
          collectedAmount: a.collectedAmount + d.collectedAmount,
          remainingAmount: a.remainingAmount + d.remainingAmount,
        }),
        {
          deals: 0,
          syndications: 0,
          amountSyndicated: 0,
          paybackAmountSyndicated: 0,
          collectedAmount: 0,
          remainingAmount: 0,
        },
      );

      return res.status(200).json({ success: true, data, totals });
    } catch (error) {
      console.error('Application syndications grouped list error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const applicationId = String(req.params.applicationId ?? '').trim();
      if (!applicationId) {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }
      const body = req.body ?? {};
      const syndicatorId = Number(body.syndicatorId);
      if (!Number.isFinite(syndicatorId)) {
        return res.status(400).json({ success: false, message: 'Valid syndicatorId is required' });
      }

      const rawAmountSyndicated = toNumber(body.amountSyndicated);
      const termsOffer = await prisma.termsOffer.findFirst({
        where: { applicationId },
        orderBy: { createdAt: 'desc' },
        select: {
          approvedAmount: true,
          paybackAmount: true,
          paymentAmount: true,
          numberOfPayments: true,
          termLength: true,
          factorRate: true,
        },
      });
      const offerDecision = await prisma.offerDecision.findUnique({
        where: { applicationId },
        select: {
          offer: true,
          rate: true,
          term: true,
          repayPerPeriod: true,
        },
      });

      const fundedAmount =
        toPositiveNumberOrNull(body.fundedAmount) ??
        toPositiveNumberOrNull(offerDecision?.offer) ??
        toPositiveNumberOrNull(termsOffer?.approvedAmount) ??
        toPositiveNumberOrNull(rawAmountSyndicated) ??
        0;

      const amountSyndicated =
        toPositiveNumberOrNull(rawAmountSyndicated) ??
        (fundedAmount > 0 && toPositiveNumberOrNull(body.percentageSyndicated) != null
          ? round2((fundedAmount * Number(body.percentageSyndicated)) / 100)
          : 0);

      const repaymentFromSchedule =
        toPositiveNumberOrNull(offerDecision?.repayPerPeriod) != null &&
        toPositiveNumberOrNull(offerDecision?.term) != null
          ? round2(Number(offerDecision?.repayPerPeriod) * Number(offerDecision?.term))
          : toPositiveNumberOrNull(termsOffer?.paymentAmount) != null &&
              toPositiveNumberOrNull(termsOffer?.numberOfPayments) != null
            ? round2(Number(termsOffer?.paymentAmount) * Number(termsOffer?.numberOfPayments))
          : null;

      // Preserve exact deal payback (terms/body) and only derive as a last fallback.
      const paybackAmount =
        (toPositiveNumberOrNull(offerDecision?.rate) != null
          ? round2(
              (toPositiveNumberOrNull(offerDecision?.offer) ?? fundedAmount) *
                Number(offerDecision?.rate),
            )
          : null) ??
        toPositiveNumberOrNull(body.paybackAmount) ??
        toPositiveNumberOrNull(termsOffer?.paybackAmount) ??
        repaymentFromSchedule ??
        (toPositiveNumberOrNull(termsOffer?.factorRate) != null && fundedAmount > 0
          ? round2(fundedAmount * Number(termsOffer?.factorRate))
          : 0);

      const percentageSyndicated =
        toPositiveNumberOrNull(body.percentageSyndicated) ??
        (fundedAmount > 0 && amountSyndicated > 0 ? (amountSyndicated / fundedAmount) * 100 : 0);

      const paybackAmountSyndicated =
        toPositiveNumberOrNull(body.paybackAmountSyndicated) ??
        (paybackAmount > 0 && fundedAmount > 0 && amountSyndicated > 0
          ? round2((paybackAmount / fundedAmount) * amountSyndicated)
          : paybackAmount > 0 && percentageSyndicated > 0
            ? round2((paybackAmount * percentageSyndicated) / 100)
            : 0);

      const termLength =
        toLoosePositiveIntOrNull(body.termLength) ??
        toLoosePositiveIntOrNull(offerDecision?.term) ??
        toLoosePositiveIntOrNull(termsOffer?.termLength) ??
        toLoosePositiveIntOrNull((termsOffer as any)?.numberOfPayments) ??
        0;

      const syndicatorExists = await prisma.syndicator.count({ where: { id: syndicatorId } });
      if (!syndicatorExists) {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }

      const commissionAmount = Math.max(0, round2(toNumber(body.commissionAmount)));
      const managementFeeToDate = Math.max(0, round2(toNumber(body.managementFeeToDate)));

      const created = await prisma.$transaction(async (tx) => {
        const fresh = await tx.syndicator.findUnique({
          where: { id: syndicatorId },
          select: { id: true, currentBalance: true, firstName: true },
        });
        if (!fresh) {
          throw new Error('SYNDICATOR_NOT_FOUND');
        }

        const detail = await tx.applicationSyndicatorDetails.create({
          data: {
            applicationId,
            syndicatorId,
            syndicatorName: body.syndicatorName ?? fresh.firstName,
            amountSyndicated: new Prisma.Decimal(amountSyndicated),
            fundedAmount: new Prisma.Decimal(fundedAmount),
            paybackAmount: new Prisma.Decimal(paybackAmount),
            paybackAmountSyndicated: new Prisma.Decimal(paybackAmountSyndicated),
            percentageSyndicated: new Prisma.Decimal(percentageSyndicated),
            commissionAmount: new Prisma.Decimal(commissionAmount),
            managementFeeToDate: new Prisma.Decimal(managementFeeToDate),
            termLength,
            merchantName: body.merchantName ? String(body.merchantName).trim() : null,
            syndicationCalculationLogic: body.syndicationCalculationLogic
              ? String(body.syndicationCalculationLogic).trim()
              : null,
            collectedAmount: new Prisma.Decimal(0),
            remainingAmount: new Prisma.Decimal(paybackAmountSyndicated),
          },
        });

        let runningBalance = toNumber(fresh.currentBalance);

        const dealLabel = await dealLabelForWalletDescription(tx, applicationId);

        const postDebit = async (amount: number, description: string, paymentType: string) => {
          if (amount <= 0) return;
          const prevBalance = runningBalance;
          runningBalance = round2(runningBalance - amount);
          await tx.syndicatorWalletTransaction.create({
            data: {
              syndicatorId,
              amount: new Prisma.Decimal(amount),
              prevBalance: new Prisma.Decimal(prevBalance),
              description,
              merchantName: detail.merchantName ?? undefined,
              applicationId,
              date: new Date(),
              paymentType,
            },
          });
        };

        await postDebit(amountSyndicated, `Syndication allocation for deal ${dealLabel}`, 'DEBIT');
        await postDebit(
          commissionAmount,
          `Commission for deal ${dealLabel}`,
          'SYNDICATION_COMMISSION',
        );
        await postDebit(
          managementFeeToDate,
          `Management fee for deal ${dealLabel}`,
          'SYNDICATION_MANAGEMENT_FEE',
        );

        await tx.syndicator.update({
          where: { id: syndicatorId },
          data: { currentBalance: new Prisma.Decimal(runningBalance) },
        });

        return detail;
      });

      return res.status(201).json({ success: true, data: created });
    } catch (error) {
      if (error instanceof Error && error.message === 'SYNDICATOR_NOT_FOUND') {
        return res.status(404).json({ success: false, message: 'Syndicator not found' });
      }
      console.error('Application syndicator create error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, message: 'Invalid id' });
      }
      await prisma.applicationSyndicatorDetails.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'Syndication removed successfully' });
    } catch (error) {
      console.error('Application syndicator remove error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export default new ApplicationSyndicatorController();
