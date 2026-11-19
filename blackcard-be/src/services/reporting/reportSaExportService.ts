/**
 * Super-Admin report export endpoints.
 *
 * Admin reports sync scrapes these instead of the thin UI list APIs so facts
 * include real funding/contract dates and collection balances.
 */
import prisma from '../../config/prismaClient';
import { getBalancesForApplicationIds } from '../collectionPaymentFinancials';

type Row = Record<string, unknown>;

const PAGE_SIZE = Math.min(500, Math.max(50, Number(process.env.REPORT_SYNC_PAGE_SIZE || 200)));
const MAX_PAGES = Math.max(1, Number(process.env.REPORT_SYNC_MAX_PAGES || 300));

const userSelect = { id: true, firstName: true, lastName: true, email: true } as const;

function serialize(row: unknown): Row {
  return JSON.parse(JSON.stringify(row)) as Row;
}

function parseSince(raw: unknown): Date | null {
  if (!raw) return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parsePage(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function parseLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return PAGE_SIZE;
  return Math.min(PAGE_SIZE, Math.floor(n));
}

/** Enrich local applications for admin report sync. */
export async function exportApplicationsForSaSync(query: {
  page?: unknown;
  limit?: unknown;
  since?: unknown;
}): Promise<{ data: Row[]; pagination: { page: number; limit: number; hasMore: boolean } }> {
  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);
  const since = parseSince(query.since);
  if (page > MAX_PAGES) {
    return { data: [], pagination: { page, limit, hasMore: false } };
  }

  const rows = await prisma.application.findMany({
    where: since ? { updatedAt: { gte: since } } : undefined,
    include: {
      client: true,
      iso: true,
      termsOffers: { orderBy: { createdAt: 'desc' }, take: 3 },
      OfferDecision: true,
      referringAgent: { select: userSelect },
      claimedByUnderwriter: { select: userSelect },
      approvedByUnderwriter: { select: userSelect },
      assignedUnderwriter: { select: userSelect },
      fundings: true,
      contract: {
        include: {
          docuSignEnvelopes: {
            orderBy: { updatedAt: 'desc' },
            take: 5,
            select: { sentAt: true, completedAt: true, status: true, updatedAt: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const balRows =
    rows.length > 0 ? await getBalancesForApplicationIds(prisma, rows.map((r) => r.id)) : [];
  const balMap = new Map(balRows.map((b) => [b.applicationId, b]));

  const data = rows.map((app) => {
    const plain = serialize(app);
    const funding = app.fundings;
    const envelopes = app.contract?.docuSignEnvelopes ?? [];
    const sentAt =
      envelopes.map((e) => e.sentAt).find((d): d is Date => !!d) ??
      app.contract?.createdAt ??
      null;
    const signedAt =
      envelopes.map((e) => e.completedAt).find((d): d is Date => !!d) ??
      null;

    if (funding) {
      plain.fundedAt = funding.fundingDate;
      plain.fundedAmount = funding.fundedAmount;
      plain.disbursedAt = funding.fundingDate;
    }
    if (sentAt) {
      plain.contractSentAt = sentAt;
      plain.contractsOutAt = sentAt;
    }
    if (signedAt) {
      plain.contractSignedAt = signedAt;
      plain.signedAt = signedAt;
    }

    const bal = balMap.get(app.id);
    if (bal) {
      plain.collectionBalanceDue = bal.balanceDue;
      plain.collectionSumOfRepaid = bal.sumOfRepaid;
      plain.collectionPaybackAmount = bal.paybackAmount;
      plain.collectionGrossRepaidDealEconomics = bal.grossRepaidDealEconomics;
    }

    // Keep list-shaped ids for admin mapTenantApplication.
    plain._id = app.id;
    return plain;
  });

  return {
    data,
    pagination: { page, limit, hasMore: rows.length === limit && page < MAX_PAGES },
  };
}

/** Bulk collection payments for admin report sync. */
export async function exportPaymentsForSaSync(query: {
  page?: unknown;
  limit?: unknown;
  since?: unknown;
}): Promise<{ data: Row[]; pagination: { page: number; limit: number; hasMore: boolean } }> {
  const page = parsePage(query.page);
  const limit = parseLimit(query.limit);
  const since = parseSince(query.since);
  if (page > MAX_PAGES) {
    return { data: [], pagination: { page, limit, hasMore: false } };
  }

  const rows = await prisma.collectionPayment.findMany({
    where: since ? { updatedAt: { gte: since } } : undefined,
    include: {
      Application: {
        include: { client: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });

  const data = rows.map((r) => {
    const plain = serialize(r);
    if (plain.Application && !plain.application) plain.application = plain.Application;
    plain.applicationId = r.applicationId;
    return plain;
  });

  return {
    data,
    pagination: { page, limit, hasMore: rows.length === limit && page < MAX_PAGES },
  };
}
