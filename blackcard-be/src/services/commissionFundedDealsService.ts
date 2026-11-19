import prisma from '../config/prismaClient';
import { isFundedOrPayoutPipelineForCommissionHistory } from './applicationStatsPredicates';

const normalizeRole = (role: unknown): string =>
  String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');

export const emptyFundedDealsSummary = () => ({
  totals: {
    dealsFunded: 0,
    totalFunded: 0,
    commissionTotal: 0,
    paid: 0,
    processing: 0,
    approved: 0,
    clawback: 0,
    pendingCommission: 0,
  },
  byBroker: [] as Array<Record<string, unknown>>,
});

export const computeFundedDealMetrics = (applicationDto: any, commissionDto: any) => {
  const loanAmount = Number(applicationDto?.loanAmount) || 0;
  const appCommissionPct = Number(applicationDto?.commissionPercentage) || 0;
  let base = 0;
  if (
    commissionDto &&
    commissionDto.fundingAmount != null &&
    commissionDto.commissionPercentage != null
  ) {
    base = Math.round(
      (Number(commissionDto.fundingAmount) * Number(commissionDto.commissionPercentage)) / 100,
    );
  } else if (loanAmount > 0 && appCommissionPct > 0) {
    base = Math.round((loanAmount * appCommissionPct) / 100);
  }
  const net = base;

  const fundedPrincipal =
    commissionDto != null &&
    commissionDto.fundingAmount != null &&
    commissionDto.fundingAmount !== ''
      ? Number(commissionDto.fundingAmount) || 0
      : loanAmount;

  const crStatus = commissionDto?.status != null ? String(commissionDto.status) : '';
  const queue = String(applicationDto?.currentQueue || '').trim();
  const state = String(applicationDto?.currentState || '').trim();
  const ql = queue.toLowerCase();
  const sl = state.toLowerCase();

  let dealStatus = 'PROCESSING';
  if (crStatus === 'Rejected') dealStatus = 'CLAWBACK';
  else if (queue === 'Declined' || ql === 'declined') dealStatus = 'CLAWBACK';
  else if (ql === 'funded' || sl === 'funded') dealStatus = 'PAID';
  else if (queue === 'Approved' && (state === 'Completed' || sl === 'completed')) dealStatus = 'PAID';
  else if (queue === 'Approved' || ql === 'approved') dealStatus = 'APPROVED';

  const isFunded = isFundedOrPayoutPipelineForCommissionHistory(queue, state);

  const created = applicationDto?.createdAt ? new Date(applicationDto.createdAt) : null;
  const monthKey =
    created && !Number.isNaN(created.getTime())
      ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}`
      : 'unknown';

  const agent = applicationDto?.agent;
  const brokerId = agent?.id ?? null;
  const brokerName =
    [agent?.firstName, agent?.lastName].filter(Boolean).join(' ').trim() ||
    String(agent?.email || '') ||
    '—';

  return {
    net,
    funded: loanAmount,
    fundedPrincipal,
    dealStatus,
    monthKey,
    brokerId,
    brokerName,
    isFunded,
  };
};

export const aggregateFundedDeals = (enriched: Array<{ metrics: ReturnType<typeof computeFundedDealMetrics> }>) => {
  const totals = {
    dealsFunded: 0,
    totalFunded: 0,
    commissionTotal: 0,
    paid: 0,
    processing: 0,
    approved: 0,
    clawback: 0,
    pendingCommission: 0,
  };
  const brokerMap = new Map<string, Record<string, unknown>>();

  for (const { metrics } of enriched) {
    if (metrics.isFunded) {
      totals.dealsFunded += 1;
      totals.totalFunded += metrics.fundedPrincipal ?? metrics.funded;
      totals.commissionTotal += metrics.net;
    }

    if (metrics.dealStatus === 'PAID') totals.paid += metrics.net;
    if (metrics.dealStatus === 'PROCESSING') totals.processing += metrics.net;
    if (metrics.dealStatus === 'APPROVED') totals.approved += metrics.net;
    if (metrics.dealStatus === 'CLAWBACK') totals.clawback += metrics.net;

    const bid = metrics.brokerId || '__none__';
    if (!brokerMap.has(bid)) {
      brokerMap.set(bid, {
        brokerId: metrics.brokerId,
        brokerName: metrics.brokerName,
        dealsFunded: 0,
        totalFunded: 0,
        totalCommission: 0,
        paidCommission: 0,
        pendingCommission: 0,
        processingCommission: 0,
        approvedCommission: 0,
        clawbackCommission: 0,
      });
    }
    const b = brokerMap.get(bid)!;
    if (metrics.isFunded) {
      b.dealsFunded = (b.dealsFunded as number) + 1;
      b.totalFunded = (b.totalFunded as number) + (metrics.fundedPrincipal ?? metrics.funded);
      b.totalCommission = (b.totalCommission as number) + metrics.net;
    }
    if (metrics.dealStatus === 'PAID') b.paidCommission = (b.paidCommission as number) + metrics.net;
    if (metrics.dealStatus === 'PROCESSING') {
      b.processingCommission = (b.processingCommission as number) + metrics.net;
    }
    if (metrics.dealStatus === 'APPROVED') {
      b.approvedCommission = (b.approvedCommission as number) + metrics.net;
    }
    if (metrics.dealStatus === 'CLAWBACK') {
      b.clawbackCommission = (b.clawbackCommission as number) + metrics.net;
    }
  }

  totals.pendingCommission = totals.approved + totals.processing;
  for (const b of brokerMap.values()) {
    b.pendingCommission = (b.approvedCommission as number) + (b.processingCommission as number);
  }

  return {
    totals,
    byBroker: Array.from(brokerMap.values()),
  };
};

export async function fetchEnrichedFundedDealsForUser(user: { id?: string; role?: string } | null) {
  const role = normalizeRole(user?.role);

  const offers = await prisma.termsOffer.findMany({
    select: { applicationId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const seenOffer = new Set<string>();
  const offerAppIds: string[] = [];
  for (const o of offers) {
    if (!seenOffer.has(o.applicationId)) {
      seenOffer.add(o.applicationId);
      offerAppIds.push(o.applicationId);
    }
  }

  const crWhere = role === 'AGENT' && user?.id ? { agentId: String(user.id) } : undefined;
  const crDistinct = await prisma.commissionRequest.groupBy({
    by: ['applicationId'],
    ...(crWhere ? { where: crWhere } : {}),
  });
  const crAppIds = crDistinct.map((r) => r.applicationId);

  let scopedAppIds: string[];

  if (role === 'AGENT' && user?.id) {
    const uid = String(user.id);
    const referredInOffers = await prisma.application.findMany({
      where: { id: { in: offerAppIds }, referringAgentId: uid },
      select: { id: true },
    });
    const idSet = new Set<string>();
    referredInOffers.forEach((r) => idSet.add(r.id));
    crAppIds.forEach((id) => idSet.add(id));
    scopedAppIds = Array.from(idSet);
  } else {
    const idSet = new Set<string>();
    offerAppIds.forEach((id) => idSet.add(id));
    crAppIds.forEach((id) => idSet.add(id));
    scopedAppIds = Array.from(idSet);
  }

  if (!scopedAppIds.length) return [];

  const applications = await prisma.application.findMany({
    where: { id: { in: scopedAppIds } },
    include: {
      client: true,
      referringAgent: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  const commissionRequests = await prisma.commissionRequest.findMany({
    where: { applicationId: { in: scopedAppIds } },
    orderBy: { createdAt: 'desc' },
  });

  const latestByApplication = new Map<string, (typeof commissionRequests)[number]>();
  for (const cr of commissionRequests) {
    if (!latestByApplication.has(cr.applicationId)) {
      latestByApplication.set(cr.applicationId, cr);
    }
  }

  const latestOfferByApp = new Map<string, Date>();
  const offerRowsForApps = await prisma.termsOffer.findMany({
    where: { applicationId: { in: scopedAppIds } },
    orderBy: { createdAt: 'desc' },
    select: { applicationId: true, createdAt: true },
  });
  for (const o of offerRowsForApps) {
    if (!latestOfferByApp.has(o.applicationId)) {
      latestOfferByApp.set(o.applicationId, o.createdAt);
    }
  }

  const rows = applications.map((app) => {
    const latest = latestByApplication.get(app.id);
    const agent = app.referringAgent;
    const client = app.client;

    const applicationDto = {
      id: app.id,
      applicationId: app.applicationId,
      createdAt: app.createdAt,
      loanAmount: app.loanAmount,
      commissionPercentage: (app as { commissionPercentage?: number }).commissionPercentage ?? 0,
      currentQueue: (app as { currentQueue?: string | null }).currentQueue ?? null,
      currentState: (app as { currentState?: string | null }).currentState ?? null,
      agent: agent
        ? {
            id: agent.id,
            firstName: agent.firstName,
            lastName: agent.lastName,
            email: agent.email,
          }
        : null,
      client: client
        ? {
            businessName: client.businessName,
          }
        : null,
    };

    const commissionDto = latest
      ? {
          id: latest.id,
          status: latest.status,
          reason: (latest as { reason?: string }).reason ?? '',
          createdAt: latest.createdAt,
          fundingAmount: (latest as { fundingAmount?: unknown }).fundingAmount,
          commissionPercentage: (latest as { commissionPercentage?: unknown }).commissionPercentage,
        }
      : null;

    return {
      application: applicationDto,
      commission: commissionDto,
    };
  });

  return rows.map((row) => {
    const app = row.application;
    const cr = row.commission;
    const offerAt = latestOfferByApp.get(app.id);
    const times: number[] = [];
    if (app.createdAt) {
      const t = new Date(app.createdAt).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
    if (cr?.createdAt) {
      const t = new Date(cr.createdAt).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
    if (offerAt) {
      const t = new Date(offerAt).getTime();
      if (!Number.isNaN(t)) times.push(t);
    }
    let activityAt: Date;
    if (times.length > 0) {
      activityAt = new Date(Math.max(...times));
    } else if (app.createdAt) {
      activityAt = new Date(app.createdAt);
    } else {
      activityAt = new Date(0);
    }

    return {
      row,
      metrics: computeFundedDealMetrics(row.application, row.commission),
      activityAt,
    };
  });
}
