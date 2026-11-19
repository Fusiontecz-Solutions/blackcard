import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import type { AuthenticatedUser } from './applicationService';
import {
    approvedPredicate,
    buildStatsWhereSql,
    buildUnderwriterStatsClaimSql,
    fundedPredicate,
    primaryWorkflowQueueForRole,
    rejectedPredicate,
    applicationDealAmountSelectSql,
} from './applicationStatsService';

export type PipelineFunnelSnapshot = {
    submit: number;
    inProgress: number;
    waitingForDocuments: number;
    decisionMade: number;
    conversionRate: {
        percentage: number;
        numerator: number;
        denominator: number;
    };
};

export type DashboardTrendChartPoint = {
    name: string;
    approved: number;
    funded: number;
    declined: number;
    dateKey: string;
};

const FUNNEL_IN_PROGRESS_QUEUES = new Set([
    'New',
    'Agent',
    'Review',
    'Underwriting',
    'Scrubbing',
    'Final Review',
    'Underwriter',
]);
const FUNNEL_WAITING_QUEUES = new Set(['On Hold', 'Waiting for Documents']);
const FUNNEL_DECISION_QUEUES = new Set([
    'Approved',
    'Declined',
    'Contracted',
    'Contract Out',
    'Contracts Out',
]);

function buildPipelineFunnelSnapshot(
    rows: { createdAt: Date; currentQueue: string | null }[],
    periodStart: Date,
    periodEnd: Date,
): PipelineFunnelSnapshot {
    const filtered = rows.filter((r) => r.createdAt >= periodStart && r.createdAt <= periodEnd);
    const submit = filtered.length;
    let inProgress = 0;
    let waitingForDocuments = 0;
    let decisionMade = 0;

    for (const app of filtered) {
        const q = app.currentQueue;
        if (q && FUNNEL_IN_PROGRESS_QUEUES.has(q)) inProgress += 1;
        if (q && FUNNEL_WAITING_QUEUES.has(q)) waitingForDocuments += 1;
        if (q && FUNNEL_DECISION_QUEUES.has(q)) decisionMade += 1;
    }

    const pct = submit > 0 ? (decisionMade / submit) * 100 : 0;
    return {
        submit,
        inProgress,
        waitingForDocuments,
        decisionMade,
        conversionRate: {
            percentage: Math.round(pct),
            numerator: decisionMade,
            denominator: submit,
        },
    };
}

/** Pipeline funnel (weekly / monthly / yearly) — same rules as admin dashboard, lightweight row fetch. */
export async function aggregateDashboardPipelineFunnel(): Promise<{
    weekly: PipelineFunnelSnapshot;
    monthly: PipelineFunnelSnapshot;
    yearly: PipelineFunnelSnapshot;
}> {
    const now = new Date();
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    yearStart.setHours(0, 0, 0, 0);

    const funnelFetchStart = new Date(
        Math.min(weekStart.getTime(), monthStart.getTime(), yearStart.getTime()),
    );

    const funnelRows = await prisma.application.findMany({
        where: {
            createdAt: { gte: funnelFetchStart, lte: endOfToday },
        },
        select: {
            createdAt: true,
            currentQueue: true,
        },
    });

    return {
        weekly: buildPipelineFunnelSnapshot(funnelRows, weekStart, endOfToday),
        monthly: buildPipelineFunnelSnapshot(funnelRows, monthStart, endOfToday),
        yearly: buildPipelineFunnelSnapshot(funnelRows, yearStart, endOfToday),
    };
}

type TrendAggRow = {
    period_key: string;
    approved: number | null;
    funded: number | null;
    declined: number | null;
};

function parseDateOnly(value: string | null): Date | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function formatYmd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Approved / funded / declined amounts by period — aligns with `/applications/stats` predicates.
 */
export async function aggregateApplicationTrendChart(params: {
    authUser: AuthenticatedUser | null;
    role: string | null | undefined;
    startDate: Date | null;
    endDate: Date | null;
    trendView: 'monthly' | 'weekly' | 'yearly';
    underwriterClaim?: import('./applicationStatsService').UnderwriterClaimScope | null;
}): Promise<DashboardTrendChartPoint[]> {
    const whereScopedBase = buildStatsWhereSql(params.role, params.startDate, params.endDate, 'a');
    const uwClaimPred = buildUnderwriterStatsClaimSql(
        params.role,
        params.underwriterClaim,
        params.authUser?.id ?? null,
    );
    const whereScoped = Prisma.sql`(${whereScopedBase}) AND (${uwClaimPred})`;

    /** Week buckets start on Sunday (matches dashboard UI). */
    const trunc =
        params.trendView === 'yearly'
            ? Prisma.sql`to_char(a."createdAt", 'YYYY-MM')`
            : params.trendView === 'weekly'
              ? Prisma.sql`to_char(
                  (a."createdAt"::date - (EXTRACT(DOW FROM a."createdAt")::int * INTERVAL '1 day')),
                  'YYYY-MM-DD'
                )`
              : Prisma.sql`to_char(a."createdAt"::date, 'YYYY-MM-DD')`;

    const query = Prisma.sql`
    WITH base AS (
      SELECT
        ${trunc} AS period_key,
        ${applicationDealAmountSelectSql}
      FROM "Application" a
      LEFT JOIN "OfferDecision" od ON od."applicationId" = a.id
      LEFT JOIN "Contract" ct ON ct."applicationId" = a.id
      WHERE ${whereScoped}
    )
    SELECT
      period_key,
      COALESCE(SUM("dealAmount") FILTER (WHERE ${approvedPredicate}), 0)::float AS approved,
      COALESCE(SUM("dealAmount") FILTER (WHERE ${fundedPredicate}), 0)::float AS funded,
      COALESCE(SUM("dealAmount") FILTER (WHERE ${rejectedPredicate}), 0)::float AS declined
    FROM base
    GROUP BY period_key
    ORDER BY period_key ASC
  `;

    const aggRows = await prisma.$queryRaw<TrendAggRow[]>(query);
    const aggByKey = new Map<string, { approved: number; funded: number; declined: number }>();
    for (const row of aggRows) {
        const key = String(row.period_key ?? '');
        if (!key) continue;
        aggByKey.set(key, {
            approved: row.approved ?? 0,
            funded: row.funded ?? 0,
            declined: row.declined ?? 0,
        });
    }

    const now = new Date();
    const fallbackStart = new Date(now.getFullYear(), now.getMonth(), 1);
    fallbackStart.setHours(0, 0, 0, 0);
    const fallbackEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    fallbackEnd.setHours(23, 59, 59, 999);

    const startIso = params.startDate
        ? `${params.startDate.getFullYear()}-${String(params.startDate.getMonth() + 1).padStart(2, '0')}-${String(params.startDate.getDate()).padStart(2, '0')}`
        : null;
    const endIso = params.endDate
        ? `${params.endDate.getFullYear()}-${String(params.endDate.getMonth() + 1).padStart(2, '0')}-${String(params.endDate.getDate()).padStart(2, '0')}`
        : null;

    const rangeStart = parseDateOnly(startIso) ?? fallbackStart;
    const rangeEnd = (() => {
        const e = parseDateOnly(endIso) ?? fallbackEnd;
        const normalized = new Date(e);
        normalized.setHours(23, 59, 59, 999);
        return normalized;
    })();

    const periodData: Record<
        string,
        { name: string; approved: number; funded: number; declined: number; dateKey: string }
    > = {};

    const sameMonth =
        rangeStart.getFullYear() === rangeEnd.getFullYear() &&
        rangeStart.getMonth() === rangeEnd.getMonth();

    if (params.trendView === 'monthly') {
        const d = new Date(rangeStart);
        d.setHours(0, 0, 0, 0);
        while (d <= rangeEnd) {
            const periodKey = formatYmd(d);
            const label = sameMonth
                ? String(d.getDate())
                : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            periodData[periodKey] = {
                name: label,
                approved: 0,
                funded: 0,
                declined: 0,
                dateKey: periodKey,
            };
            d.setDate(d.getDate() + 1);
        }
    } else if (params.trendView === 'weekly') {
        const d = new Date(rangeStart);
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        while (d <= rangeEnd) {
            const weekStart = new Date(d);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            const periodKey = formatYmd(weekStart);
            const periodLabel = `${weekStart.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            })} - ${weekEnd.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
            })}`;
            periodData[periodKey] = {
                name: periodLabel,
                approved: 0,
                funded: 0,
                declined: 0,
                dateKey: periodKey,
            };
            d.setDate(d.getDate() + 7);
        }
    } else {
        const d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
        d.setHours(0, 0, 0, 0);
        const endMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1);
        endMonth.setHours(0, 0, 0, 0);
        while (d <= endMonth) {
            const periodKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const periodLabel = d.toLocaleDateString('en-US', { month: 'short' });
            periodData[periodKey] = {
                name: periodLabel,
                approved: 0,
                funded: 0,
                declined: 0,
                dateKey: periodKey,
            };
            d.setMonth(d.getMonth() + 1);
        }
    }

    for (const [periodKey, bucket] of Object.entries(periodData)) {
        let aggKey = periodKey;
        if (params.trendView === 'weekly') {
            aggKey = periodKey;
        } else if (params.trendView === 'yearly') {
            aggKey = periodKey;
        }
        const agg = aggByKey.get(aggKey);
        if (agg) {
            bucket.approved = agg.approved;
            bucket.funded = agg.funded;
            bucket.declined = agg.declined;
        }
    }

    return Object.values(periodData).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

function normalizeRoleKey(role: string | null | undefined): string {
    return String(role || '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

/** Recent applications for dashboard table (role-scoped where applicable). */
export async function listDashboardRecentApplications(params: {
    authUser: AuthenticatedUser | null;
    role: string | null | undefined;
    limit?: number;
}): Promise<{ applications: unknown[]; totalItems: number }> {
    const limit = Math.min(Math.max(1, params.limit ?? 10), 50);
    const role = normalizeRoleKey(params.role);
    const viewerId = params.authUser?.id ?? null;

    let where: Prisma.ApplicationWhereInput = {};

    if (role === 'AGENT' && viewerId) {
        where = { referringAgentId: viewerId };
    } else {
        const queueLabel = primaryWorkflowQueueForRole(params.role);
        if (queueLabel) {
            where = { currentQueue: queueLabel };
        }
    }

    const [apps, total] = await Promise.all([
        prisma.application.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: { client: true },
        }),
        prisma.application.count({ where }),
    ]);

    return { applications: apps, totalItems: total };
}
