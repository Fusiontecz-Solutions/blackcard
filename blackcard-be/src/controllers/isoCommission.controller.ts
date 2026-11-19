import type { Request, Response } from 'express';
import { IsoApplicationPayoutStatus } from '@prisma/client';
import prisma from '../config/prismaClient';

type PayoutStatusApi = 'paid' | 'pending' | 'clawbacks';

const mapPayoutToApi = (st: IsoApplicationPayoutStatus): PayoutStatusApi => {
  if (st === IsoApplicationPayoutStatus.PAID) return 'paid';
  if (st === IsoApplicationPayoutStatus.CLAWBACKS) return 'clawbacks';
  return 'pending';
};

const parsePayoutStatus = (raw: unknown): IsoApplicationPayoutStatus | null => {
  const lower = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (lower === 'paid') return IsoApplicationPayoutStatus.PAID;
  if (lower === 'pending') return IsoApplicationPayoutStatus.PENDING;
  if (lower === 'clawbacks' || lower === 'clawback') return IsoApplicationPayoutStatus.CLAWBACKS;
  return null;
};

const parseOptionalDate = (raw: unknown): Date | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
};

async function assertIso(isoId: string) {
  const iso = await prisma.iso.findUnique({ where: { id: isoId }, select: { id: true } });
  return iso;
}

async function assertApplicationUnderIso(isoId: string, applicationId: string) {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, isoId: true },
  });
  if (!app) return { ok: false as const, message: 'Application not found' };
  if (app.isoId !== isoId) {
    return { ok: false as const, message: 'Application is not linked to this ISO' };
  }
  return { ok: true as const, app };
}

function toYmd(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function toIsoString(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

const DEFAULT_DEALS_LIMIT = 10;
const MAX_DEALS_LIMIT = 100;

function parseDealsPage(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function parseDealsLimit(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_DEALS_LIMIT;
  return Math.min(n, MAX_DEALS_LIMIT);
}

type DealRowOut = {
  applicationId: string;
  dealId: string | null;
  applicationNumber: number;
  merchant: string;
  offerApprovedAmount: number | null;
  commissionAmount: number;
  commissionRequestStatus: string | null;
  payoutStatus: PayoutStatusApi;
  scheduledPayDate: string | null;
  paidAt: string | null;
};

function dealMatchesSearch(deal: DealRowOut, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const haystack = [
    deal.merchant,
    deal.dealId ?? '',
    String(deal.applicationNumber),
    deal.payoutStatus,
    deal.commissionRequestStatus ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(s);
}

type PortalDealStatus = 'submitted' | 'approved' | 'funded' | 'declined';

function portalDealStatus(currentState: string | null | undefined, decision: string | null | undefined): PortalDealStatus {
  const state = String(currentState ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const dec = String(decision ?? '').trim().toUpperCase();
  if (state === 'FUNDED') return 'funded';
  if (/DECLIN|REJECT|CANCEL/.test(state) || /DECLIN|REJECT/.test(dec)) return 'declined';
  if (/APPROV|CONTRACT|DISBURS|FINAL|FUNDING/.test(state)) return 'approved';
  return 'submitted';
}

class IsoCommissionController {
  /** Every ISO with all linked deals (status, amount, commission, payout) for the ISO portal. */
  async getPortalOverview(_req: Request, res: Response) {
    try {
      const [isos, apps, plans, settings] = await Promise.all([
        prisma.iso.findMany({
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            status: true,
            commissionPercentage: true,
            createdAt: true,
            agreementAcceptedAt: true,
            documents: true,
            tierId: true,
            contactName: true,
            managerName: true,
            missingDocs: true,
            agreementEmail: true,
            agreementSentAt: true,
            agreementViewedAt: true,
            tierOverride: true,
            badges: true,
          },
        }),
        prisma.application.findMany({
          where: { isoId: { not: null }, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            applicationId: true,
            dealId: true,
            isoId: true,
            currentState: true,
            commissionAmount: true,
            commissionPercentage: true,
            createdAt: true,
            client: { select: { businessName: true } },
          },
        }),
        prisma.isoCommissionPlan.findMany({ orderBy: { createdAt: 'asc' } }),
        prisma.isoPortalSetting.findUnique({ where: { id: 'default' } }),
      ]);

      const appIds = apps.map((a) => a.id);
      const [offers, payouts] = appIds.length
        ? await Promise.all([
            prisma.offerDecision.findMany({
              where: { applicationId: { in: appIds } },
              select: { applicationId: true, offer: true, decision: true },
            }),
            prisma.isoApplicationPayout.findMany({
              where: { applicationId: { in: appIds } },
              select: {
                isoId: true,
                applicationId: true,
                payoutStatus: true,
                paidAt: true,
                scheduledPayDate: true,
                updatedAt: true,
                approvedAt: true,
              },
            }),
          ])
        : [[], []];

      const offerByApp = new Map(offers.map((o) => [o.applicationId, o]));
      const payoutByKey = new Map(payouts.map((p) => [`${p.isoId}|${p.applicationId}`, p]));

      const deals = apps.map((app) => {
        const offer = offerByApp.get(app.id);
        const amount = offer?.offer != null ? Number(offer.offer) : 0;
        const commission =
          app.commissionAmount != null && Number.isFinite(app.commissionAmount)
            ? app.commissionAmount
            : (amount * (app.commissionPercentage ?? 0)) / 100;
        const payout = payoutByKey.get(`${app.isoId}|${app.id}`);
        return {
          applicationId: app.id,
          isoId: app.isoId as string,
          dealId: app.dealId ?? null,
          applicationNumber: app.applicationId,
          merchant: app.client?.businessName?.trim() || '—',
          currentState: app.currentState,
          status: portalDealStatus(app.currentState, offer?.decision),
          amount,
          commission: Math.round(commission * 100) / 100,
          createdAt: toIsoString(app.createdAt),
          payoutStatus: payout ? mapPayoutToApi(payout.payoutStatus) : null,
          paidAt: toIsoString(payout?.paidAt ?? null),
          scheduledPayDate: toYmd(payout?.scheduledPayDate ?? null),
          payoutUpdatedAt: toIsoString(payout?.updatedAt ?? null),
          payoutApprovedAt: toIsoString(payout?.approvedAt ?? null),
        };
      });

      return res.status(200).json({
        success: true,
        data: {
          isos: isos.map((iso) => ({
            id: iso.id,
            name: iso.name,
            email: iso.email,
            phone: iso.phone,
            status: iso.status,
            commissionPercentage: iso.commissionPercentage,
            createdAt: toIsoString(iso.createdAt),
            agreementAcceptedAt: toIsoString(iso.agreementAcceptedAt),
            documentCount: Array.isArray(iso.documents) ? iso.documents.length : 0,
            planId: iso.tierId,
            contactName: iso.contactName,
            managerName: iso.managerName,
            missingDocs: iso.missingDocs,
            agreementEmail: iso.agreementEmail,
            agreementSentAt: toIsoString(iso.agreementSentAt),
            agreementViewedAt: toIsoString(iso.agreementViewedAt),
            tierOverride: iso.tierOverride,
            badges: iso.badges ?? [],
          })),
          deals,
          plans: plans.map((p) => ({
            id: p.id,
            name: p.name,
            pointsPct: p.pointsPct,
            basis: p.basis,
            renewalPct: p.renewalPct,
            capAmount: p.capAmount,
          })),
          scoring: settings?.scoring ?? null,
        },
      });
    } catch (error) {
      console.error('ISO portal overview error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** All applications for an ISO with offer-approved amount, commission, and payout fields. */
  async getMyDeals(req: Request, res: Response) {
    try {
      const isoId = String(req.params.id ?? '').trim();
      if (!isoId) {
        return res.status(400).json({ success: false, message: 'ISO id is required' });
      }
      const iso = await assertIso(isoId);
      if (!iso) {
        return res.status(404).json({ success: false, message: 'ISO not found' });
      }

      const apps = await prisma.application.findMany({
        where: { isoId },
        orderBy: { applicationId: 'desc' },
        select: {
          id: true,
          applicationId: true,
          dealId: true,
          commissionPercentage: true,
          client: { select: { businessName: true } },
        },
      });

      const searchRaw = String(req.query.search ?? '').trim();
      const page = parseDealsPage(req.query.page);
      const limit = parseDealsLimit(req.query.limit);

      if (apps.length === 0) {
        return res.status(200).json({
          success: true,
          data: {
            deals: [],
            total: 0,
            page: 1,
            limit,
            totalPages: 0,
            linkedApplicationCount: 0,
            summary: { totalEarned: 0, totalPaid: 0, pendingPayout: 0 },
          },
        });
      }

      const appIds = apps.map((a) => a.id);

      const [termsOffers, commissionRequests, payouts, offerDecisions] = await Promise.all([
        prisma.termsOffer.findMany({
          where: { applicationId: { in: appIds } },
          orderBy: { createdAt: 'desc' },
          select: {
            applicationId: true,
            approvedAmount: true,
            createdAt: true,
          },
        }),
        prisma.commissionRequest.findMany({
          where: { applicationId: { in: appIds } },
          orderBy: { createdAt: 'desc' },
          select: {
            applicationId: true,
            fundingAmount: true,
            commissionPercentage: true,
            status: true,
            createdAt: true,
          },
        }),
        prisma.isoApplicationPayout.findMany({
          where: { isoId, applicationId: { in: appIds } },
        }),
        prisma.offerDecision.findMany({
          where: { applicationId: { in: appIds } },
          select: { applicationId: true, offer: true },
        }),
      ]);

      const latestTermsByApp = new Map<string, number>();
      for (const t of termsOffers) {
        if (!latestTermsByApp.has(t.applicationId)) {
          latestTermsByApp.set(t.applicationId, t.approvedAmount);
        }
      }

      const latestCrByApp = new Map<
        string,
        { fundingAmount: number; commissionPercentage: number; status: string }
      >();
      for (const cr of commissionRequests) {
        if (!latestCrByApp.has(cr.applicationId)) {
          latestCrByApp.set(cr.applicationId, {
            fundingAmount: cr.fundingAmount,
            commissionPercentage: cr.commissionPercentage,
            status: cr.status,
          });
        }
      }

      const offerByApp = new Map<string, number>();
      for (const o of offerDecisions) {
        if (o.offer != null && !offerByApp.has(o.applicationId)) {
          offerByApp.set(o.applicationId, Number(o.offer));
        }
      }

      const payoutByApp = new Map<string, (typeof payouts)[0]>();
      for (const p of payouts) {
        payoutByApp.set(p.applicationId, p);
      }

      const deals: DealRowOut[] = apps.map((app) => {
        const merchant = app.client?.businessName?.trim() || '—';
        const offerApproved =
          latestTermsByApp.get(app.id) ?? offerByApp.get(app.id) ?? null;

        const cr = latestCrByApp.get(app.id);
        const payout = payoutByApp.get(app.id);
        let commissionAmount = 0;
        if (cr) {
          commissionAmount = (cr.fundingAmount * cr.commissionPercentage) / 100;
        } else if (offerApproved != null) {
          commissionAmount = (offerApproved * (app.commissionPercentage ?? 0)) / 100;
        }

        const commissionRequestStatus = cr?.status ?? null;

        const payoutStatus = payout ? mapPayoutToApi(payout.payoutStatus) : 'pending';
        const scheduledPayDate = toYmd(payout?.scheduledPayDate ?? null);
        const paidAt = toIsoString(payout?.paidAt ?? null);

        return {
          applicationId: app.id,
          dealId: app.dealId ?? null,
          applicationNumber: app.applicationId,
          merchant,
          offerApprovedAmount: offerApproved,
          commissionAmount,
          commissionRequestStatus,
          payoutStatus,
          scheduledPayDate,
          paidAt,
        };
      });

      const linkedApplicationCount = deals.length;
      const filtered = searchRaw
        ? deals.filter((d) => dealMatchesSearch(d, searchRaw))
        : deals;

      let totalEarned = 0;
      let totalPaid = 0;
      let pendingPayout = 0;
      for (const d of filtered) {
        totalEarned += d.commissionAmount;
        if (d.payoutStatus === 'paid') totalPaid += d.commissionAmount;
        else if (d.payoutStatus === 'pending') pendingPayout += d.commissionAmount;
      }

      const total = filtered.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
      const safePage = totalPages === 0 ? 1 : Math.min(page, totalPages);
      const start = (safePage - 1) * limit;
      const pageDeals = filtered.slice(start, start + limit);

      return res.status(200).json({
        success: true,
        data: {
          deals: pageDeals,
          total,
          page: safePage,
          limit,
          totalPages,
          linkedApplicationCount,
          summary: { totalEarned, totalPaid, pendingPayout },
        },
      });
    } catch (error) {
      console.error('ISO my-deals error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async upsertApplicationPayout(req: Request, res: Response) {
    try {
      const isoId = String(req.params.id ?? '').trim();
      const { applicationId, payoutStatus, scheduledPayDate, paidAt } = req.body ?? {};

      if (!isoId || !String(applicationId ?? '').trim()) {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }

      const appId = String(applicationId).trim();
      const st = parsePayoutStatus(payoutStatus);
      if (!st) {
        return res.status(400).json({
          success: false,
          message: 'payoutStatus must be paid, pending, or clawbacks',
        });
      }

      const iso = await assertIso(isoId);
      if (!iso) {
        return res.status(404).json({ success: false, message: 'ISO not found' });
      }

      const check = await assertApplicationUnderIso(isoId, appId);
      if (!check.ok) {
        return res.status(400).json({ success: false, message: check.message });
      }

      const schedParsed =
        scheduledPayDate === undefined
          ? undefined
          : scheduledPayDate === null || scheduledPayDate === ''
            ? null
            : parseOptionalDate(scheduledPayDate);

      let paidParsed =
        paidAt === undefined
          ? undefined
          : paidAt === null || paidAt === ''
            ? null
            : parseOptionalDate(paidAt);

      if (st === IsoApplicationPayoutStatus.PAID && paidParsed === undefined) {
        paidParsed = new Date();
      }

      const row = await prisma.isoApplicationPayout.upsert({
        where: {
          isoId_applicationId: { isoId, applicationId: appId },
        },
        create: {
          isoId,
          applicationId: appId,
          payoutStatus: st,
          scheduledPayDate: schedParsed === undefined ? null : schedParsed,
          paidAt: st === IsoApplicationPayoutStatus.PAID ? paidParsed ?? new Date() : null,
        },
        update: {
          payoutStatus: st,
          ...(schedParsed !== undefined ? { scheduledPayDate: schedParsed } : {}),
          ...(st === IsoApplicationPayoutStatus.PAID
            ? { paidAt: paidParsed ?? new Date() }
            : { paidAt: null }),
        },
      });

      const out = row;

      return res.status(200).json({
        success: true,
        data: {
          applicationId: out.applicationId,
          payoutStatus: mapPayoutToApi(out.payoutStatus),
          scheduledPayDate: toYmd(out.scheduledPayDate),
          paidAt: toIsoString(out.paidAt),
        },
      });
    } catch (error) {
      console.error('ISO application payout upsert error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Approve (or un-approve) unpaid deal payouts of one ISO; creates PENDING rows where missing. */
  async setPayoutApproval(req: Request, res: Response) {
    try {
      const isoId = String(req.params.id ?? '').trim();
      const { applicationIds, approved } = req.body ?? {};
      if (!Array.isArray(applicationIds) || applicationIds.length === 0) {
        return res.status(400).json({ success: false, message: 'applicationIds must be a non-empty array' });
      }
      const ids = [...new Set(applicationIds.map((v: unknown) => String(v ?? '').trim()).filter(Boolean))];
      if (!(await assertIso(isoId))) {
        return res.status(404).json({ success: false, message: 'ISO not found' });
      }
      const linked = await prisma.application.findMany({
        where: { id: { in: ids }, isoId },
        select: { id: true },
      });
      if (linked.length !== ids.length) {
        return res.status(400).json({ success: false, message: 'Some applications are not linked to this ISO' });
      }

      const approvedAt = approved === false ? null : new Date();
      await prisma.$transaction(
        ids.map((applicationId) =>
          prisma.isoApplicationPayout.upsert({
            where: { isoId_applicationId: { isoId, applicationId } },
            create: { isoId, applicationId, payoutStatus: IsoApplicationPayoutStatus.PENDING, approvedAt },
            update: { approvedAt },
          }),
        ),
      );
      return res.status(200).json({ success: true, data: { count: ids.length, approvedAt: toIsoString(approvedAt) } });
    } catch (error) {
      console.error('ISO payout approval error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async createPlan(req: Request, res: Response) {
    try {
      const data = parsePlanInput(req.body ?? {}, true);
      if ('error' in data) return res.status(400).json({ success: false, message: data.error });
      const plan = await prisma.isoCommissionPlan.create({ data: data.value as PlanCreate });
      return res.status(201).json({ success: true, data: plan });
    } catch (error) {
      console.error('ISO plan create error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async updatePlan(req: Request, res: Response) {
    try {
      const id = String(req.params.planId ?? '').trim();
      const data = parsePlanInput(req.body ?? {}, false);
      if ('error' in data) return res.status(400).json({ success: false, message: data.error });
      const exists = await prisma.isoCommissionPlan.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return res.status(404).json({ success: false, message: 'Plan not found' });
      const plan = await prisma.isoCommissionPlan.update({ where: { id }, data: data.value });
      return res.status(200).json({ success: true, data: plan });
    } catch (error) {
      console.error('ISO plan update error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async deletePlan(req: Request, res: Response) {
    try {
      const id = String(req.params.planId ?? '').trim();
      const exists = await prisma.isoCommissionPlan.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return res.status(404).json({ success: false, message: 'Plan not found' });
      await prisma.$transaction([
        prisma.iso.updateMany({ where: { tierId: id }, data: { tierId: null } }),
        prisma.isoCommissionPlan.delete({ where: { id } }),
      ]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('ISO plan delete error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async updateScoring(req: Request, res: Response) {
    try {
      const scoring = parseScoring(req.body?.scoring);
      if (!scoring) return res.status(400).json({ success: false, message: 'Invalid scoring rules' });
      const row = await prisma.isoPortalSetting.upsert({
        where: { id: 'default' },
        create: { id: 'default', scoring },
        update: { scoring },
      });
      return res.status(200).json({ success: true, data: { scoring: row.scoring } });
    } catch (error) {
      console.error('ISO scoring update error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

type PlanCreate = { name: string; pointsPct: number; basis: string; renewalPct: number; capAmount: number };

function parsePlanInput(
  body: Record<string, unknown>,
  requireAll: boolean,
): { value: Partial<PlanCreate> } | { error: string } {
  const out: Partial<PlanCreate> = {};
  if (body.name !== undefined || requireAll) {
    const name = String(body.name ?? '').trim();
    if (!name) return { error: 'name is required' };
    out.name = name.slice(0, 120);
  }
  const pct = (key: 'pointsPct' | 'renewalPct', required: boolean) => {
    if (body[key] === undefined && !required) return null;
    const n = Number(body[key] ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 100) return `${key} must be between 0 and 100`;
    out[key] = Math.round(n * 100) / 100;
    return null;
  };
  const e1 = pct('pointsPct', requireAll);
  if (e1) return { error: e1 };
  const e2 = pct('renewalPct', false);
  if (e2) return { error: e2 };
  if (body.capAmount !== undefined) {
    const n = Number(body.capAmount);
    if (!Number.isFinite(n) || n < 0) return { error: 'capAmount must be 0 or more' };
    out.capAmount = n;
  }
  if (body.basis !== undefined) {
    const b = String(body.basis);
    if (b !== 'upfront' && b !== 'on_collection') return { error: 'basis must be upfront or on_collection' };
    out.basis = b;
  }
  return { value: out };
}

function parseScoring(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, Record<string, unknown> | unknown>;
  const w = (r.weights ?? {}) as Record<string, unknown>;
  const t = (r.thresholds ?? {}) as Record<string, unknown>;
  const n = (v: unknown, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : null;
  };
  const weights = {
    volume: n(w.volume, 0, 100),
    conversion: n(w.conversion, 0, 100),
    quality: n(w.quality, 0, 100),
    profit: n(w.profit, 0, 100),
    submission: n(w.submission, 0, 100),
  };
  const thresholds = { platinum: n(t.platinum, 0, 100), gold: n(t.gold, 0, 100), silver: n(t.silver, 0, 100) };
  const minFunded = n(r.minFunded, 0, 1000);
  if (Object.values(weights).some((v) => v === null) || Object.values(thresholds).some((v) => v === null) || minFunded === null) {
    return null;
  }
  return { weights, thresholds, minFunded } as { weights: Record<string, number>; thresholds: Record<string, number>; minFunded: number };
}

const isoCommissionController = new IsoCommissionController();
export default isoCommissionController;
