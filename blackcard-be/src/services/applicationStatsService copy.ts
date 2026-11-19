import { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import type { AuthenticatedUser } from './applicationService';

export type ApplicationStatsBucket = {
    count: number;
    totalAmount: number;
};

export type ApplicationStatsPayload = {
    funded: ApplicationStatsBucket;
    approved: ApplicationStatsBucket;
    rejected: ApplicationStatsBucket;
    pending: ApplicationStatsBucket;
    inProcess: ApplicationStatsBucket;
    underwriting: ApplicationStatsBucket;
    /** Agent queue and/or workflow state Pending (same scope as list visibility). */
    workflowPending: ApplicationStatsBucket;
    /** Underwriter queue and/or workflow state In Progress (same scope as list visibility). */
    workflowInProgress: ApplicationStatsBucket;
    /** Distinct apps in stats scope (each row once — avoids summing overlapping bucket predicates). */
    totalDealsPicked: ApplicationStatsBucket;
    /** Apps whose `currentQueue` matches the viewer’s primary workflow queue (Agent / Underwriter / Final Underwriter). */
    roleQueueAssigned: ApplicationStatsBucket;
};

function normalizeRoleKey(role: string | null | undefined): string {
    return String(role || '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

/** `currentQueue` label for “assigned to my role” dashboard card (must match DB values). */
export function primaryWorkflowQueueForRole(roleRaw: string | null | undefined): string | null {
    const r = normalizeRoleKey(roleRaw);
    if (r === 'AGENT') return 'Agent';
    if (r === 'UNDERWRITER') return 'Underwriter';
    if (r === 'FINAL_UNDERWRITER') return 'Final Underwriter';
    return null;
}

/** Normalizes DB `currentState` string to an uppercase underscore token (SUBMITTED, IN_PROGRESS, …). */
const stateNorm = Prisma.sql`UPPER(REPLACE(TRIM(COALESCE("currentState", '')), ' ', '_'))`;

/**
 * Normalized `currentQueue` for comparisons (spaces, hyphens, underscores stripped).
 * Aligns with `toWorkflowApiState` queue tokens (e.g. Funding Call / FundingCall → fundingcall).
 */
const queueNorm = Prisma.sql`LOWER(REGEXP_REPLACE(TRIM(COALESCE("currentQueue", '')), '[^a-zA-Z0-9]+', '', 'g'))`;

/** Funded: terminal funded marker by queue (normalized) or state (aligned with workflow + legacy Approved+COMPLETED). */
export const fundedPredicate = Prisma.sql`(
  (${queueNorm}) = 'funded'
  OR (${stateNorm}) IN ('FUNDED', 'COMPLETED')
  OR ((${queueNorm}) = 'approved' AND (${stateNorm}) = 'COMPLETED')
)`;

/** Approved card: `currentState` only — literal approved (API/DB), not CONTRACTS_OUT or other post-approval states. */
export const approvedPredicate = Prisma.sql`(
  (${stateNorm}) = 'APPROVED'
  OR LOWER(TRIM(COALESCE("currentState", ''))) = 'approved'
)`;

export const rejectedPredicate = Prisma.sql`(${queueNorm}) = 'declined'`;

/**
 * Pending pipeline: **currentQueue only** (normalized). Aligns with workflow stages that map to
 * Pending / In Progress / Approved / FINAL / FUNDING CALL / DISBURSEMENT in the API — excluding terminal Declined & Funded.
 * Does not use `currentState` so counts stay consistent with the queue shown on the application.
 */
const pendingPredicate = Prisma.sql`(
  (${queueNorm}) IN (
    'new',
    'agent',
    'onhold',
    'contracted',
    'review',
    'underwriting',
    'underwriter',
    'finalreview',
    'finalunderwriter',
    'final',
    'fundingcall',
    'disbursement',
    'disbursment'
  )
  AND (${queueNorm}) NOT IN ('declined', 'funded')
)`;

const inProcessPredicate = Prisma.sql`(${queueNorm}) IN (
  'new',
  'agent',
  'review',
  'finalreview',
  'finalunderwriter'
)`;

const underwritingPredicate = Prisma.sql`(${queueNorm}) IN ('underwriting', 'underwriter')`;

/** Deal workflow: Agent queue ↔ Pending; Underwriter queue ↔ In Progress (matches API `currentState`). */
const workflowPendingPredicate = Prisma.sql`((${queueNorm}) = 'agent' OR (${stateNorm}) = 'PENDING')`;
const workflowInProgressPredicate = Prisma.sql`((${queueNorm}) = 'underwriter' OR (${stateNorm}) = 'IN_PROGRESS')`;

/** Matches `underwriterClaim` list scope (`currentQueue` = Underwriter literal). */
const uwInboxQueueNorms = Prisma.sql`(${queueNorm}) = 'underwriter'`;

/**
 * When UNDERWRITER stats are scoped by `underwriterClaim`, Agent-centric workflow predicates are wrong:
 * `(queue)=underwriter` matches the entire pool so "In Progress" equals all rows.
 * Pending / In Progress cards instead split **Underwriter-queue** rows by claim row + backlog vs active workflow state.
 */
function buildUwInboxWorkflowBucketPredicatesSql(
    claim: 'unclaimed' | 'mine',
    viewerId: string,
): { pendingSql: Prisma.Sql; inProgressSql: Prisma.Sql } {
    const claimSql =
        claim === 'unclaimed'
            ? Prisma.sql`("claimedByUnderwriterId" IS NULL)`
            : Prisma.sql`("claimedByUnderwriterId" = ${viewerId})`;
    /** Backlog paperwork (not actively IN_PROGRESS yet). Matches list drill-down buckets. */
    const backlogStates = Prisma.sql`(${stateNorm}) IN ('SUBMITTED', 'PENDING')`;
    const activeStates = Prisma.sql`(${stateNorm}) IN ('IN_PROGRESS')`;
    return {
        pendingSql: Prisma.sql`(${uwInboxQueueNorms}) AND (${claimSql}) AND (${backlogStates})`,
        inProgressSql: Prisma.sql`(${uwInboxQueueNorms}) AND (${claimSql}) AND (${activeStates})`,
    };
}

/** Optional scope for UNDERWRITER “Queue” vs “My deals” dashboards (matches list `underwriterClaim`). */
export function buildUnderwriterStatsClaimSql(
    roleRaw: string | null | undefined,
    underwriterClaim: 'unclaimed' | 'mine' | null | undefined,
    viewerId: string | null | undefined,
): Prisma.Sql {
    const r = normalizeRoleKey(roleRaw);
    if (
        (underwriterClaim === 'unclaimed' || underwriterClaim === 'mine') &&
        r === 'UNDERWRITER' &&
        viewerId
    ) {
        if (underwriterClaim === 'unclaimed') {
            return Prisma.sql`(a."currentQueue" = 'Underwriter' AND a."claimedByUnderwriterId" IS NULL)`;
        }
        return Prisma.sql`(a."currentQueue" = 'Underwriter' AND a."claimedByUnderwriterId" = ${viewerId})`;
    }
    return Prisma.sql`TRUE`;
}

export function buildStatsWhereSql(
    _roleRaw: string | null | undefined,
    start: Date | null,
    end: Date | null,
    /** When joining `Application` as `a`, qualify date columns to avoid ambiguity. */
    applicationTableAlias?: 'a',
): Prisma.Sql {
    const parts: Prisma.Sql[] = [];
    const createdAt = applicationTableAlias
        ? Prisma.sql`a."createdAt"`
        : Prisma.sql`"createdAt"`;

    if (start) {
        parts.push(Prisma.sql`${createdAt} >= ${start}`);
    }
    if (end) {
        parts.push(Prisma.sql`${createdAt} <= ${end}`);
    }

    if (parts.length === 0) {
        return Prisma.sql`TRUE`;
    }
    return Prisma.join(parts, ' AND ');
}

/**
 * Amount used for dashboard totals when `loanAmount` is unset (common on funded deals
 * where the number lives on `OfferDecision.offer` or `Contract.approvedAmount`).
 */
export const applicationDealAmountSelectSql = Prisma.sql`
  COALESCE(
    a."loanAmount",
    od."offer"::double precision,
    ct."approvedAmount"
  ) AS "dealAmount",
  a."currentQueue" AS "currentQueue",
  a."currentState" AS "currentState",
  a."claimedByUnderwriterId" AS "claimedByUnderwriterId"
`;

type StatsRow = {
    funded_count: bigint;
    funded_sum: number | null;
    approved_count: bigint;
    approved_sum: number | null;
    rejected_count: bigint;
    rejected_sum: number | null;
    pending_count: bigint;
    pending_sum: number | null;
    in_process_count: bigint;
    in_process_sum: number | null;
    underwriting_count: bigint;
    underwriting_sum: number | null;
    workflow_pending_count: bigint;
    workflow_pending_sum: number | null;
    workflow_in_progress_count: bigint;
    workflow_in_progress_sum: number | null;
    deals_picked_count: bigint;
    deals_picked_sum: number | null;
    assigned_to_role_count: bigint;
    assigned_to_role_sum: number | null;
};

/**
 * Single round-trip aggregation for dashboard stat cards.
 * **Pending** (and in-process / underwriting splits) use normalized `currentQueue` only.
 * Funded / rejected combine queue + state; **approved** uses `currentState` = Approved only (see `approvedPredicate`).
 */
export async function aggregateApplicationStats(params: {
    authUser: AuthenticatedUser | null;
    role: string | null | undefined;
    startDate: Date | null;
    endDate: Date | null;
    underwriterClaim?: 'unclaimed' | 'mine' | null;
}): Promise<ApplicationStatsPayload> {
    const whereScopedBase = buildStatsWhereSql(params.role, params.startDate, params.endDate, 'a');
    const uwClaimPred = buildUnderwriterStatsClaimSql(
        params.role,
        params.underwriterClaim,
        params.authUser?.id ?? null,
    );
    const whereScoped = Prisma.sql`(${whereScopedBase}) AND (${uwClaimPred})`;
    const whereWorkflow = whereScoped;
    const assignedQueueLabel = primaryWorkflowQueueForRole(params.role);
    const assignedCountExpr =
        assignedQueueLabel != null
            ? Prisma.sql`COALESCE((SELECT COUNT(*)::bigint FROM scoped WHERE LOWER(TRIM("currentQueue")) = LOWER(${assignedQueueLabel})), 0)::bigint`
            : Prisma.sql`0::bigint`;
    const assignedSumExpr =
        assignedQueueLabel != null
            ? Prisma.sql`COALESCE((SELECT SUM("dealAmount")::float FROM scoped WHERE LOWER(TRIM("currentQueue")) = LOWER(${assignedQueueLabel})), 0)::float`
            : Prisma.sql`0::float`;

    const uwTab = params.underwriterClaim;
    const uwViewerId = params.authUser?.id;
    let uwWf: { pendingSql: Prisma.Sql; inProgressSql: Prisma.Sql } | null = null;
    if (
        normalizeRoleKey(params.role) === 'UNDERWRITER' &&
        uwViewerId &&
        (uwTab === 'unclaimed' || uwTab === 'mine')
    ) {
        uwWf = buildUwInboxWorkflowBucketPredicatesSql(uwTab, uwViewerId);
    }
    const wfPendingPred = uwWf ? uwWf.pendingSql : workflowPendingPredicate;
    const wfIpPred = uwWf ? uwWf.inProgressSql : workflowInProgressPredicate;

    const query = Prisma.sql`
    WITH scoped AS (
      SELECT ${applicationDealAmountSelectSql}
      FROM "Application" a
      LEFT JOIN "OfferDecision" od ON od."applicationId" = a.id
      LEFT JOIN "Contract" ct ON ct."applicationId" = a.id
      WHERE ${whereScoped}
    ),
    workflow_base AS (
      SELECT ${applicationDealAmountSelectSql}
      FROM "Application" a
      LEFT JOIN "OfferDecision" od ON od."applicationId" = a.id
      LEFT JOIN "Contract" ct ON ct."applicationId" = a.id
      WHERE ${whereWorkflow}
    )
    SELECT
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${fundedPredicate}) FROM scoped), 0)::bigint AS funded_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${fundedPredicate}) FROM scoped), 0)::float AS funded_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${approvedPredicate}) FROM scoped), 0)::bigint AS approved_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${approvedPredicate}) FROM scoped), 0)::float AS approved_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${rejectedPredicate}) FROM scoped), 0)::bigint AS rejected_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${rejectedPredicate}) FROM scoped), 0)::float AS rejected_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${pendingPredicate}) FROM scoped), 0)::bigint AS pending_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${pendingPredicate}) FROM scoped), 0)::float AS pending_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${inProcessPredicate}) FROM scoped), 0)::bigint AS in_process_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${inProcessPredicate}) FROM scoped), 0)::float AS in_process_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${underwritingPredicate}) FROM scoped), 0)::bigint AS underwriting_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${underwritingPredicate}) FROM scoped), 0)::float AS underwriting_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${wfPendingPred}) FROM workflow_base), 0)::bigint AS workflow_pending_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${wfPendingPred}) FROM workflow_base), 0)::float AS workflow_pending_sum,
      COALESCE((SELECT COUNT(*) FILTER (WHERE ${wfIpPred}) FROM workflow_base), 0)::bigint AS workflow_in_progress_count,
      COALESCE((SELECT SUM("dealAmount") FILTER (WHERE ${wfIpPred}) FROM workflow_base), 0)::float AS workflow_in_progress_sum,
      COALESCE((SELECT COUNT(*)::bigint FROM scoped), 0)::bigint AS deals_picked_count,
      COALESCE((SELECT SUM("dealAmount")::float FROM scoped), 0)::float AS deals_picked_sum,
      ${assignedCountExpr} AS assigned_to_role_count,
      ${assignedSumExpr} AS assigned_to_role_sum
  `;

    const rows = await prisma.$queryRaw<StatsRow[]>(query);
    const r = rows[0]!;

    const bucket = (c: bigint, s: number | null): ApplicationStatsBucket => ({
        count: Number(c),
        totalAmount: s ?? 0,
    });

    return {
        funded: bucket(r.funded_count, r.funded_sum),
        approved: bucket(r.approved_count, r.approved_sum),
        rejected: bucket(r.rejected_count, r.rejected_sum),
        pending: bucket(r.pending_count, r.pending_sum),
        inProcess: bucket(r.in_process_count, r.in_process_sum),
        underwriting: bucket(r.underwriting_count, r.underwriting_sum),
        workflowPending: bucket(r.workflow_pending_count, r.workflow_pending_sum),
        workflowInProgress: bucket(r.workflow_in_progress_count, r.workflow_in_progress_sum),
        totalDealsPicked: bucket(r.deals_picked_count, r.deals_picked_sum),
        roleQueueAssigned: bucket(r.assigned_to_role_count, r.assigned_to_role_sum),
    };
}

type TrendRow = {
    month_index: number;
    funded: number | null;
    approved: number | null;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/**
 * Monthly approved/funded amounts by calendar month of `createdAt` (same shape as prior API).
 * One SQL aggregation instead of loading all rows.
 */
export async function aggregateApplicationMonthlyTrend(params: {
    authUser: AuthenticatedUser | null;
    role: string | null | undefined;
    startDate: Date | null;
    endDate: Date | null;
}): Promise<Array<{ name: string; approved: number; funded: number }>> {
    const whereSql = buildStatsWhereSql(params.role, params.startDate, params.endDate, 'a');

    const query = Prisma.sql`
    WITH base AS (
      SELECT
        ${applicationDealAmountSelectSql},
        a."createdAt" AS "createdAt"
      FROM "Application" a
      LEFT JOIN "OfferDecision" od ON od."applicationId" = a.id
      LEFT JOIN "Contract" ct ON ct."applicationId" = a.id
      WHERE ${whereSql}
    )
    SELECT
      (EXTRACT(MONTH FROM "createdAt")::int - 1) AS month_index,
      COALESCE(SUM("dealAmount") FILTER (WHERE ${fundedPredicate}), 0)::float AS funded,
      COALESCE(SUM("dealAmount") FILTER (WHERE ${approvedPredicate}), 0)::float AS approved
    FROM base
    GROUP BY month_index
    ORDER BY month_index ASC
  `;

    const rows = await prisma.$queryRaw<TrendRow[]>(query);

    const byMonth = new Map<number, { approved: number; funded: number }>();
    for (const row of rows) {
        const mi = Number(row.month_index);
        if (mi >= 0 && mi <= 11) {
            byMonth.set(mi, {
                funded: row.funded ?? 0,
                approved: row.approved ?? 0,
            });
        }
    }

    return MONTH_NAMES.map((name, idx) => ({
        name,
        approved: byMonth.get(idx)?.approved ?? 0,
        funded: byMonth.get(idx)?.funded ?? 0,
    }));
}
