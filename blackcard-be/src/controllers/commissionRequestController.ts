// @ts-nocheck
import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import sendMail from '../config/nodemailer';
import {
  aggregateFundedDeals,
  emptyFundedDealsSummary,
  fetchEnrichedFundedDealsForUser,
} from '../services/commissionFundedDealsService';

const normalizeRole = (role: unknown): string =>
  String(role ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');

// Resolve application by numeric applicationId or UUID id
const findApplication = async (applicationIdOrUuid: unknown) => {
  const raw = Array.isArray(applicationIdOrUuid) ? applicationIdOrUuid[0] : applicationIdOrUuid;
  const str = raw != null && typeof raw !== 'object' ? String(raw) : '';
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    return prisma.application.findUnique({ where: { applicationId: Number(str) } });
  }
  return prisma.application.findUnique({ where: { id: str } });
};

const parseNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]+/g, '');
    return parseFloat(cleaned) || 0;
  }
  return 0;
};

const mapCommissionRequestToApi = (cr: any) => {
  if (!cr) return cr;

  const { id, applicationId, agentId, syndicatorId, ...rest } = cr;

  return {
    ...rest,
    _id: id,
    id,
    // Maintain backwards‑compatible property names for the frontend
    application: applicationId,
    agent: agentId,
    syndicator: syndicatorId,
  };
};

const ymdKeyLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const parseLocalDayStart = (ymd: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
};

const parseLocalDayEnd = (ymd: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || '').trim());
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
};

const appCreatedAt = (row: any): Date | null => {
  const raw = row?.application?.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Dashboard / trend: use latest relevant timestamp so deals aren’t dropped when the app is old but terms/commission moved this month. */
const activityAtFromEnriched = (e: any): Date | null => {
  if (e?.activityAt != null) {
    const d = e.activityAt instanceof Date ? e.activityAt : new Date(e.activityAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return appCreatedAt(e?.row);
};

function filterEnrichedByActivityAtRange(enriched: any[], start: Date, end: Date) {
  return enriched.filter((e) => {
    const c = activityAtFromEnriched(e);
    if (!c) return false;
    return c >= start && c <= end;
  });
}

/** Min/max activity timestamps for trend buckets when no date filter is applied. */
function getActivityDateBounds(enriched: any[]): { start: Date; end: Date } | null {
  let minT = Infinity;
  let maxT = -Infinity;
  for (const e of enriched) {
    const c = activityAtFromEnriched(e);
    if (!c) continue;
    const t = c.getTime();
    if (t < minT) minT = t;
    if (t > maxT) maxT = t;
  }
  if (minT === Infinity) return null;
  const start = new Date(minT);
  start.setHours(0, 0, 0, 0);
  const end = new Date(maxT);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function sumNetCommission(enriched: any[]) {
  let n = 0;
  for (const { metrics } of enriched) n += metrics.net;
  return n;
}

function countClawbackDeals(enriched: any[]) {
  let n = 0;
  for (const { metrics } of enriched) {
    if (metrics.dealStatus === 'CLAWBACK') n += 1;
  }
  return n;
}

function countPaidDeals(enriched: any[]) {
  let n = 0;
  for (const { metrics } of enriched) {
    if (metrics.dealStatus === 'PAID') n += 1;
  }
  return n;
}

function buildDashboardTrend(
  enriched: any[],
  view: string,
  rangeStart: Date,
  rangeEnd: Date,
): { name: string; value: number; paid: number; pending: number; clawback: number }[] {
  const v = String(view || 'monthly').toLowerCase();
  const periodData: Record<
    string,
    { name: string; value: number; paid: number; pending: number; clawback: number }
  > = {};

  const addBucket = (key: string, name: string) => {
    if (!periodData[key]) {
      periodData[key] = { name, value: 0, paid: 0, pending: 0, clawback: 0 };
    }
  };

  if (v === 'monthly') {
    const d = new Date(rangeStart.getTime());
    d.setHours(0, 0, 0, 0);
    const end = new Date(rangeEnd.getTime());
    while (d <= end) {
      const key = ymdKeyLocal(d);
      const sameMonth =
        d.getFullYear() === rangeStart.getFullYear() && d.getMonth() === rangeStart.getMonth();
      const label = sameMonth
        ? String(d.getDate())
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      addBucket(key, label);
      d.setDate(d.getDate() + 1);
    }
  } else if (v === 'yearly') {
    const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    const endYm = rangeEnd.getFullYear() * 12 + rangeEnd.getMonth();
    while (d.getFullYear() * 12 + d.getMonth() <= endYm) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      addBucket(key, label);
      d.setMonth(d.getMonth() + 1);
    }
  } else {
    const cursor = new Date(rangeStart.getTime());
    cursor.setHours(0, 0, 0, 0);
    const dow = cursor.getDay();
    cursor.setDate(cursor.getDate() - dow);
    const end = new Date(rangeEnd.getTime());
    while (cursor <= end) {
      const weekStart = new Date(cursor.getTime());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const key = ymdKeyLocal(weekStart);
      const label = `${weekStart.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      addBucket(key, label);
      cursor.setDate(cursor.getDate() + 7);
    }
  }

  for (const e of enriched) {
    const c = activityAtFromEnriched(e);
    if (!c || c < rangeStart || c > rangeEnd) continue;
    let periodKey = '';
    if (v === 'monthly') {
      periodKey = ymdKeyLocal(c);
    } else if (v === 'yearly') {
      periodKey = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}`;
    } else {
      const ws = new Date(c.getFullYear(), c.getMonth(), c.getDate());
      ws.setDate(ws.getDate() - ws.getDay());
      ws.setHours(0, 0, 0, 0);
      periodKey = ymdKeyLocal(ws);
    }
    if (!periodData[periodKey]) {
      periodData[periodKey] = {
        name: v === 'monthly' ? String(c.getDate()) : periodKey,
        value: 0,
        paid: 0,
        pending: 0,
        clawback: 0,
      };
    }
    const pt = periodData[periodKey];
    const net = e.metrics.net;
    const ds = e.metrics.dealStatus as string;
    if (ds === 'PAID') {
      pt.paid += net;
    } else if (ds === 'APPROVED' || ds === 'PROCESSING') {
      pt.pending += net;
    } else if (ds === 'CLAWBACK') {
      pt.clawback += net;
    }
    pt.value += net;
  }

  return Object.keys(periodData)
    .sort()
    .map((k) => {
      const row = periodData[k];
      return {
        name: row.name,
        value: row.value,
        paid: row.paid,
        pending: row.pending,
        clawback: row.clawback,
      };
    });
}

function buildTopIsosFromEnriched(enriched: any[], limit: number) {
  const isoMap = new Map<string, { name: string; amount: number; deals: number }>();
  for (const { row, metrics } of enriched) {
    if (!metrics.isFunded) continue;
    const agent = row.application?.agent;
    const name =
      [agent?.firstName, agent?.lastName].filter(Boolean).join(' ').trim() ||
      String(agent?.email || '') ||
      'Unknown Agent';
    const amt = Number(metrics.fundedPrincipal ?? metrics.funded ?? 0);
    const cur = isoMap.get(name);
    if (cur) {
      cur.amount += amt;
      cur.deals += 1;
    } else {
      isoMap.set(name, { name, amount: amt, deals: 1 });
    }
  }
  return Array.from(isoMap.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function buildRecentActivityRows(enriched: any[], limit: number) {
  const funded = enriched.filter((e) => e.metrics.isFunded);
  funded.sort((a, b) => {
    const ca = activityAtFromEnriched(a)?.getTime() ?? 0;
    const cb = activityAtFromEnriched(b)?.getTime() ?? 0;
    return cb - ca;
  });
  const slice = funded.slice(0, limit);
  return slice.map((e, idx) => {
    const app = e.row.application || {};
    const commission = e.row.commission || null;
    const agent = app.agent || {};
    const client = app.client || {};
    const act = activityAtFromEnriched(e);
    const date =
      act && !Number.isNaN(act.getTime()) ? act.toLocaleDateString('en-US') : '—';
    const agentName =
      [agent.firstName, agent.lastName].filter(Boolean).join(' ').trim() || agent.email || '—';
    const dealName =
      client.businessName || (app.applicationId != null ? `Application #${app.applicationId}` : '—');
    return {
      id: app.id || idx,
      date,
      agentName,
      dealName,
      applicationId: app.applicationId ?? null,
      fundedAmount: Number(app.loanAmount || 0),
      commissionAmount: e.metrics.net,
      commissionStatus: commission?.status != null ? String(commission.status) : 'Not Requested',
      commissionReason:
        commission?.status === 'Rejected' ? String(commission?.reason || '—') : '—',
      commissionId: commission?.id || null,
    };
  });
}

class CommissionRequestController {
  // Create a new commission request (Agents only)
  async create(req: Request, res: Response) {
    try {
      const {
        applicationId,
        companyDeal,
        firstName,
        lastName,
        phoneNumber,
        email,
        fundingAmount,
        syndicatorId,
        commissionPercentage,
        date,
      } = req.body;

      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const role = normalizeRole(user.role);
      if (role !== 'AGENT') {
        return res.status(403).json({
          success: false,
          message: 'Only agents can create commission requests',
        });
      }

      if (
        !applicationId ||
        !companyDeal ||
        !firstName ||
        !lastName ||
        !email ||
        fundingAmount === undefined ||
        fundingAmount === null ||
        !commissionPercentage
      ) {
        return res.status(400).json({
          success: false,
          message:
            'applicationId, company/deal, first name, last name, email, funding amount, and commission % are required',
        });
      }

      const application = await findApplication(applicationId);
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const fundingAmountNum = parseNumber(fundingAmount);
      const commissionPercentNum = parseNumber(commissionPercentage);

      if (commissionPercentNum <= 0 || commissionPercentNum > 100) {
        return res.status(400).json({
          success: false,
          message: 'Commission % must be between 0 and 100',
        });
      }

      let requestedDate: Date | null = null;
      if (date) {
        const d = new Date(date);
        if (!isNaN(d.getTime())) {
          requestedDate = d;
        }
      }

      const agentId = String(user.id);

      const created = await prisma.commissionRequest.create({
        data: {
          applicationId: application.id,
          agentId,
          companyDeal: String(companyDeal).trim(),
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          phoneNumber: phoneNumber ? String(phoneNumber).trim() : null,
          email: String(email).trim().toLowerCase(),
          fundingAmount: fundingAmountNum,
          syndicatorId: syndicatorId ? String(syndicatorId) : null,
          commissionPercentage: commissionPercentNum,
          // status defaults to "Pending"
          ...(requestedDate ? { createdAt: requestedDate } : {}),
        },
      });

      // Notify admins about new commission request
      try {
        const admins = await prisma.user.findMany({
          where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
          select: { id: true, email: true, firstName: true, lastName: true },
        });

        if (admins.length > 0) {
          const applicationNumericId = (application as any).applicationId ?? 'N/A';
          const agentName =
            [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown Agent';

          const notificationMessage = `New Commission Request submitted by ${agentName} for Application ID ${applicationNumericId}.`;

          // Create notifications
          const notificationData = {
            title: 'New Commission Request',
            message: notificationMessage,
            type: 'commission_request',
            category: 'others',
            applicationId: application.id,
            createdById: agentId,
          };

          await Promise.all(
            admins.map((admin) =>
              prisma.notification.create({
                data: {
                  ...notificationData,
                  recipientId: admin.id,
                },
              }),
            ),
          );

          // Send email notifications (fire-and-forget)
          const adminEmails = admins.map((a) => a.email).filter(Boolean);
          if (adminEmails.length > 0) {
            const subject = 'New Commission Request Submitted';
            const body = `
              <h2>New Commission Request</h2>
              <p>${notificationMessage}</p>
              <p><strong>Company / Deal:</strong> ${created.companyDeal}</p>
              <p><strong>Commission %:</strong> ${created.commissionPercentage}</p>
            `;

            setImmediate(() => {
              adminEmails.forEach((to) => {
                void sendMail(to, subject, body).catch((err) => {
                  // eslint-disable-next-line no-console
                  console.error('Failed to send commission request email:', err);
                });
              });
            });
          }
        }
      } catch (notificationError: any) {
        // Log but do not fail the request
        // eslint-disable-next-line no-console
        console.error('Failed to create admin notifications for commission request:', notificationError);
      }

      return res.status(201).json({
        success: true,
        message: 'Commission request created successfully',
        data: mapCommissionRequestToApi(created),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Create commission request error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  // Admin: get all commission requests (optional filters by status or applicationId)
  async getAll(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const role = normalizeRole(user.role);
      const { status, applicationId } = req.query as { status?: string; applicationId?: string };

      const where: any = {};

      if (status) {
        where.status = String(status);
      }

      if (applicationId) {
        const application = await findApplication(applicationId);
        if (!application) {
          return res.status(200).json({
            success: true,
            data: [],
          });
        }
        where.applicationId = application.id;
      }

      // Agents only see their own requests
      if (role === 'AGENT') {
        where.agentId = String(user.id);
      }

      const requests = await prisma.commissionRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      // Load numeric applicationId for display (App#X) without duplicating records
      const applicationIds = Array.from(
        new Set<string>(requests.map((r: any) => r.applicationId).filter(Boolean)),
      );

      let applicationMetaById = new Map<string, { applicationId: number }>();

      if (applicationIds.length > 0) {
        const applications = await prisma.application.findMany({
          where: { id: { in: applicationIds } },
          select: { id: true, applicationId: true },
        });

        applicationMetaById = new Map(
          applications.map((app) => [app.id, { applicationId: app.applicationId }]),
        );
      }

      // Load agent details (User) so frontend can show correct agent name
      const agentIds = Array.from(
        new Set<string>(requests.map((r: any) => r.agentId).filter(Boolean)),
      );

      let agentMetaById = new Map<string, { id: string; firstName: string | null; lastName: string | null; email: string | null }>();

      if (agentIds.length > 0) {
        const agents = await prisma.user.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        });

        agentMetaById = new Map(
          agents.map((u) => [u.id, { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email }]),
        );
      }

      const data = requests.map((cr: any) => {
        const base = mapCommissionRequestToApi(cr);
        const appMeta = applicationMetaById.get(cr.applicationId);
        const agentMeta = agentMetaById.get(cr.agentId);

        const agent =
          agentMeta
            ? {
                id: agentMeta.id,
                firstName: agentMeta.firstName,
                lastName: agentMeta.lastName,
                email: agentMeta.email,
              }
            : base.agent;

        const agentName =
          agentMeta
            ? [agentMeta.firstName, agentMeta.lastName].filter(Boolean).join(' ').trim() ||
              agentMeta.email ||
              ''
            : '';

        return {
          ...base,
          applicationNumericId: appMeta?.applicationId ?? null,
          agent,
          agentName,
        };
      });

      return res.status(200).json({
        success: true,
        data,
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Get commission requests error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  // Commission history: applications with at least one terms offer and/or commission request,
  // plus latest commission request (if any) per application.
  async getFundedDeals(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const enriched = await fetchEnrichedFundedDealsForUser(user);

      if (!enriched.length) {
        return res.status(200).json({
          success: true,
          data: [],
          summary: emptyFundedDealsSummary(),
        });
      }

      const month = String(req.query.month || 'all').trim();
      const statusQ = String(req.query.status || 'all').trim().toUpperCase();
      const brokerIdQ = String(req.query.brokerId || 'all').trim();

      const filtered = enriched.filter(({ metrics }) => {
        if (month !== 'all' && metrics.monthKey !== month) return false;
        if (statusQ !== 'all' && metrics.dealStatus !== statusQ) return false;
        if (brokerIdQ !== 'all') {
          const id = metrics.brokerId || '';
          if (brokerIdQ === '__none__') {
            if (metrics.brokerId) return false;
          } else if (id !== brokerIdQ) {
            return false;
          }
        }
        return true;
      });

      const summary = aggregateFundedDeals(filtered);
      const data = filtered.map((e) => e.row);

      return res.status(200).json({
        success: true,
        data,
        summary,
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Get funded deals error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  /** Aggregated commission portal dashboard: optional date filter; KPIs, trend, top ISOs, recent activity (server-side). */
  async getCommissionPortalDashboard(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const trendRaw = String(req.query.trendView || 'monthly').toLowerCase();
      const trendView = ['monthly', 'weekly', 'yearly'].includes(trendRaw) ? trendRaw : 'monthly';

      const startQ = String(req.query.startDate || '').trim();
      const endQ = String(req.query.endDate || '').trim();
      const hasDateFilter = startQ.length > 0 && endQ.length > 0;

      const enriched = await fetchEnrichedFundedDealsForUser(user);

      let filtered: any[];
      let rangeStart: Date;
      let rangeEnd: Date;

      if (hasDateFilter) {
        const rs = parseLocalDayStart(startQ);
        const re = parseLocalDayEnd(endQ);
        if (!rs || !re) {
          return res.status(400).json({
            success: false,
            message: 'Invalid startDate or endDate (expected YYYY-MM-DD)',
          });
        }
        rangeStart = rs;
        rangeEnd = re;
        filtered = filterEnrichedByActivityAtRange(enriched, rangeStart, rangeEnd);
      } else {
        filtered = enriched;
        const bounds = getActivityDateBounds(filtered);
        if (bounds) {
          rangeStart = bounds.start;
          rangeEnd = bounds.end;
        } else {
          const now = new Date();
          const y = now.getFullYear();
          const mo = now.getMonth();
          rangeStart = new Date(y, mo, 1, 0, 0, 0, 0);
          rangeEnd = new Date(y, mo + 1, 0, 23, 59, 59, 999);
        }
      }

      const summary = aggregateFundedDeals(filtered);
      const netCommission = sumNetCommission(filtered);
      const totalFunded = summary.totals.totalFunded;
      const commissionTotalFunded = summary.totals.commissionTotal;
      const commissionToFundedPercent =
        totalFunded > 0 ? Math.round((commissionTotalFunded / totalFunded) * 1000) / 10 : 0;

      const dashboardCards = {
        fundedVolume: totalFunded,
        netCommission,
        paid: summary.totals.paid,
        pending: summary.totals.pendingCommission,
        clawback: summary.totals.clawback,
        fundedDealsCount: summary.totals.dealsFunded,
        paidDealsCount: countPaidDeals(filtered),
        clawbackDealsCount: countClawbackDeals(filtered),
        commissionToFundedPercent,
      };

      const commissionTrend = buildDashboardTrend(filtered, trendView, rangeStart, rangeEnd);
      const topIsos = buildTopIsosFromEnriched(filtered, 5);
      const recentActivity = buildRecentActivityRows(filtered, 8);

      return res.status(200).json({
        success: true,
        dateFilterActive: hasDateFilter,
        range: hasDateFilter
          ? {
              start: ymdKeyLocal(rangeStart),
              end: ymdKeyLocal(rangeEnd),
            }
          : null,
        trendView,
        summary,
        dashboardCards,
        commissionTrend,
        topIsos,
        recentActivity,
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Get commission portal dashboard error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  // Admin: update commission request status (Pending / Approved / Rejected) and optional reason
  async updateStatus(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const role = normalizeRole(user.role);
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can update commission request status',
        });
      }

      const { id } = req.params;
      const { status, reason } = req.body as { status?: string; reason?: string };

      const allowedStatuses = ['Pending', 'Approved', 'Rejected'];
      if (!status || !allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Allowed values: ${allowedStatuses.join(', ')}`,
        });
      }

      // Backend validation: rejection must include a reason
      if (status === 'Rejected' && (!reason || !String(reason).trim())) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required when setting status to Rejected',
        });
      }

      const existing = await prisma.commissionRequest.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Commission request not found',
        });
      }

      const now = new Date();

      const data: any = {
        status,
      };

      if (status === 'Approved') {
        // Clear any previous rejection reason and set approved timestamp
        data.reason = null;
        data.approvedAt = now;
        data.rejectedAt = null;
      } else if (status === 'Rejected') {
        // Store rejection reason and timestamp, clear approved timestamp
        data.reason = String(reason);
        data.rejectedAt = now;
        data.approvedAt = null;
      } else if (reason !== undefined) {
        // For Pending or other statuses, allow explicitly updating reason if provided
        data.reason = String(reason);
      }

      const updated = await prisma.commissionRequest.update({
        where: { id },
        data,
      });

      // Notify agent on status change
      try {
        const app = await prisma.application.findUnique({
          where: { id: existing.applicationId },
          select: { id: true, applicationId: true },
        });
        const agent = await prisma.user.findUnique({
          where: { id: existing.agentId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });

        const applicationNumericId = app?.applicationId ?? 'N/A';
        const agentId = agent?.id ? String(agent.id) : '';
        const agentEmail = agent?.email;
        const agentName =
          [agent?.firstName, agent?.lastName].filter(Boolean).join(' ') || 'Agent';

        if (agentId) {
          const baseMessage =
            updated.status === 'Approved'
              ? `Your commission request for Application ID ${applicationNumericId} has been approved.`
              : updated.status === 'Rejected'
                ? `Your commission request for Application ID ${applicationNumericId} has been rejected.`
                : `Your commission request for Application ID ${applicationNumericId} has been updated.`;

          const fullMessage =
            updated.status === 'Rejected' && updated.reason
              ? `${baseMessage} Reason: ${updated.reason}`
              : baseMessage;

          await prisma.notification.create({
            data: {
              title:
                updated.status === 'Approved'
                  ? 'Commission Request Approved'
                  : updated.status === 'Rejected'
                    ? 'Commission Request Rejected'
                    : 'Commission Request Updated',
              message: fullMessage,
              type: 'commission_request_update',
              category: 'others',
              recipientId: agentId,
              applicationId: app?.id,
              createdById: String(user.id),
            },
          });

          if (agentEmail) {
            const subject =
              updated.status === 'Approved'
                ? 'Your Commission Request Has Been Approved'
                : updated.status === 'Rejected'
                  ? 'Your Commission Request Has Been Rejected'
                  : 'Your Commission Request Has Been Updated';

            const body = `
              <h2>Hello ${agentName},</h2>
              <p>${fullMessage}</p>
            `;

            setImmediate(() => {
              void sendMail(agentEmail, subject, body).catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Failed to send commission status email:', err);
              });
            });
          }
        }
      } catch (notifyErr: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to send commission status notification/email:', notifyErr);
      }

      return res.status(200).json({
        success: true,
        message: 'Commission request status updated successfully',
        data: mapCommissionRequestToApi(updated),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Update commission request status error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  // Agent: regenerate a rejected commission request (update % and reset status)
  async regenerate(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const role = normalizeRole(user.role);
      if (role !== 'AGENT') {
        return res.status(403).json({
          success: false,
          message: 'Only agents can regenerate commission requests',
        });
      }

      const { id } = req.params;
      const { commissionPercentage } = req.body as { commissionPercentage?: string | number };

      if (commissionPercentage === undefined || commissionPercentage === null) {
        return res.status(400).json({
          success: false,
          message: 'commissionPercentage is required to regenerate a request',
        });
      }

      const existing = await prisma.commissionRequest.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Commission request not found',
        });
      }

      // Ensure the logged-in agent owns this request
      if (String(existing.agentId) !== String(user.id)) {
        return res.status(403).json({
          success: false,
          message: 'You are not allowed to modify this commission request',
        });
      }

      // Only allow regenerate from Rejected status
      if (existing.status !== 'Rejected') {
        return res.status(400).json({
          success: false,
          message: 'Only rejected commission requests can be regenerated',
        });
      }

      const commissionPercentNum = parseNumber(commissionPercentage as any);
      if (commissionPercentNum <= 0 || commissionPercentNum > 100) {
        return res.status(400).json({
          success: false,
          message: 'Commission % must be between 0 and 100',
        });
      }

      const updated = await prisma.commissionRequest.update({
        where: { id },
        data: {
          commissionPercentage: commissionPercentNum,
          status: 'Pending',
          reason: '',
          rejectedAt: null,
          approvedAt: null,
        },
      });

      return res.status(200).json({
        success: true,
        message: 'Commission request regenerated successfully',
        data: mapCommissionRequestToApi(updated),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Regenerate commission request error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }

  // Admin: delete a commission request and notify the agent
  async delete(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User authentication required',
        });
      }

      const role = normalizeRole(user.role);
      if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can delete commission requests',
        });
      }

      const { id } = req.params;

      const existing = await prisma.commissionRequest.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Commission request not found',
        });
      }

      const deleted = await prisma.commissionRequest.delete({
        where: { id },
      });

      // Notify agent that the request was deleted
      try {
        const app = await prisma.application.findUnique({
          where: { id: deleted.applicationId },
          select: { id: true, applicationId: true },
        });
        const agent = await prisma.user.findUnique({
          where: { id: deleted.agentId },
          select: { id: true, firstName: true, lastName: true, email: true },
        });

        const applicationNumericId = app?.applicationId ?? 'N/A';
        const agentId = agent?.id ? String(agent.id) : '';
        const agentEmail = agent?.email;
        const agentName =
          [agent?.firstName, agent?.lastName].filter(Boolean).join(' ') || 'Agent';

        const message = `Your commission request for Application ID ${applicationNumericId} has been deleted by an administrator.`;

        if (agentId) {
          await prisma.notification.create({
            data: {
              title: 'Commission Request Deleted',
              message,
              type: 'commission_request_delete',
              category: 'others',
              recipientId: agentId,
              applicationId: app?.id,
              createdById: String(user.id),
            },
          });
        }

        if (agentEmail) {
          const subject = 'Your Commission Request Has Been Deleted';
          const body = `
            <h2>Hello ${agentName},</h2>
            <p>${message}</p>
          `;

          setImmediate(() => {
            void sendMail(agentEmail, subject, body).catch((err) => {
              // eslint-disable-next-line no-console
              console.error('Failed to send commission delete email:', err);
            });
          });
        }
      } catch (notifyErr: any) {
        // eslint-disable-next-line no-console
        console.error('Failed to send commission delete notification/email:', notifyErr);
      }

      return res.status(200).json({
        success: true,
        message: 'Commission request deleted successfully',
        data: mapCommissionRequestToApi(deleted),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Delete commission request error:', error);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Internal server error',
      });
    }
  }
}

const commissionRequestController = new CommissionRequestController();
export default commissionRequestController;

