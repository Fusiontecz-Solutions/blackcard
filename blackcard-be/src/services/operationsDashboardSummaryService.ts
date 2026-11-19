import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import {
    mergeApplicationVisibilityWhere,
    type AuthenticatedUser,
} from './applicationService';
import {
    buildOperationsStatusFilterWhere,
    excludeSoftDeletedWhere,
    normalizeOperationsStatusKey,
    resolveOperationsListFilterMode,
    type OperationsStatusFilterMode,
} from './operationsStatusFilter';
import { aggregateQueueMetricsByCurrentQueue } from './operationsDashboardQueueMetricsService';
import { excludeNotAApplicationWhere, excludeOldNotScrubbedWhere } from './declineSplitFilter';
import { reconcileStaleContractReinitiationFlags } from './contractReinitiationService';

function buildRoleDefaultWhere(authUser: AuthenticatedUser | null): Prisma.ApplicationWhereInput {
    if (!authUser) {
        return { id: '00000000-0000-0000-0000-000000000000' };
    }
    return {};
}

function combineWhere(
    base: Prisma.ApplicationWhereInput,
    extra?: Prisma.ApplicationWhereInput,
): Prisma.ApplicationWhereInput {
    if (!extra) return base;
    return { AND: [base, extra] };
}

async function countApplicationsForPipelineStage(
    authUser: AuthenticatedUser | null,
    operationsStatus: string,
): Promise<number> {
    const visibilityBase = mergeApplicationVisibilityWhere(
        authUser ? {} : { id: '00000000-0000-0000-0000-000000000000' },
        authUser,
    );
    const mode = resolveOperationsListFilterMode(authUser?.role ?? null);
    const stageWhere = buildOperationsStatusFilterWhere(operationsStatus, mode);
    const canonical = normalizeOperationsStatusKey(operationsStatus);
    const excludeDeleted =
        canonical === 'Recently_Deleted' ? undefined : excludeSoftDeletedWhere();
    // Parked buckets never count toward another stage. Stage matchers also match
    // on currentState, so a parked deal whose state is still e.g. IN_PROGRESS
    // would otherwise inflate Scrubbing.
    const parkedExclusions: Prisma.ApplicationWhereInput[] = [];
    if (canonical !== 'Not_A_Application' && canonical !== 'Fake_Application') {
        parkedExclusions.push(excludeNotAApplicationWhere());
    }
    if (canonical !== 'Old_Not_Scrubbed') {
        parkedExclusions.push(excludeOldNotScrubbedWhere());
    }
    return prisma.application.count({
        where: combineWhere(
            combineWhere(combineWhere(visibilityBase, stageWhere), excludeDeleted),
            parkedExclusions.length ? { AND: parkedExclusions } : undefined,
        ),
    });
}

function viewerMode(authUser: AuthenticatedUser | null): OperationsStatusFilterMode {
    return resolveOperationsListFilterMode(authUser?.role ?? null);
}

function isSuperAdminRole(role: string | null | undefined): boolean {
    const normalized = String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    return normalized === 'SUPER_ADMIN' || normalized === 'SUPERADMIN';
}

export type OperationsDashboardSummaryPayload = {
    summaryCounts: {
        totalCases: number;
        contractPending: number;
        contractGenerated: number;
        contractsOut: number;
        signedContracts: number;
        fundingCall: number;
        disbursment: number;
        funded: number;
    };
    summaryAmounts: {
        contractPending: number;
        contractsOut: number;
        signedContracts: number;
        fundingCall: number;
        disbursment: number;
        funded: number;
    };
    caseStageCounts: Record<string, number>;
    caseStageAmounts: Record<string, number>;
    /** How pipeline filters were applied (for debugging / future UI). */
    operationsMetricsMode: OperationsStatusFilterMode;
};

export type OperationsDashboardRecentCasePayload = Array<{
    _id: string;
    applicationId: number | null;
    client: {
        _id: string;
        clientId: number | null;
        business: { name: string; email: string };
        owner: { firstName: string; lastName: string; email: string };
    } | null;
    loanAmount: number | null;
    currentQueue: string | null;
    currentState: string | null;
    createdAt: Date;
    updatedAt: Date;
}>;

/**
 * Operations dashboard totals: counts and funded amounts grouped by `Application.currentQueue`.
 * Amounts use `Position.fundedAmount` (sum per application), with `loanAmount` fallback.
 */
export async function aggregateOperationsDashboardSummary(
    authUser: AuthenticatedUser | null,
): Promise<OperationsDashboardSummaryPayload> {
    const mode = viewerMode(authUser);
    try {
        await reconcileStaleContractReinitiationFlags();
    } catch (reconcileErr) {
        console.error('[operationsDashboard] reconcile stale reinitiation flags failed:', reconcileErr);
    }
    const queueMetrics = await aggregateQueueMetricsByCurrentQueue(authUser);
    const { counts, amounts, totalCases } = queueMetrics;

    const [
        agentCount,
        scrubbingCount,
        underwriterCount,
        approvedByUwCount,
        approvalSentCount,
        approvedByIsoCount,
        finalApprovalCount,
        finalCount,
        reinitiateContractCount,
        contractPendingCount,
        contractSentCount,
        signedContractCount,
        onHoldCount,
        missingDocumentsCount,
        recentlyDeletedCount,
        declineRequestCount,
        declinedByScrubberCount,
        declinedByUnderwriterCount,
        declinedByAdminCount,
        notAApplicationCount,
        oldNotScrubbedCount,
    ] = await Promise.all([
        countApplicationsForPipelineStage(authUser, 'Agent'),
        countApplicationsForPipelineStage(authUser, 'Scrubbing'),
        countApplicationsForPipelineStage(authUser, 'Underwriter'),
        countApplicationsForPipelineStage(authUser, 'Approved_By_UW'),
        countApplicationsForPipelineStage(authUser, 'Approval_Sent'),
        countApplicationsForPipelineStage(authUser, 'Approved_By_ISO'),
        countApplicationsForPipelineStage(authUser, 'Final_Approval'),
        countApplicationsForPipelineStage(authUser, 'Final'),
        countApplicationsForPipelineStage(authUser, 'Reinitiate_Contract'),
        countApplicationsForPipelineStage(authUser, 'Contract_Pending'),
        countApplicationsForPipelineStage(authUser, 'Contract_Sent'),
        countApplicationsForPipelineStage(authUser, 'Contract_Signed'),
        countApplicationsForPipelineStage(authUser, 'On_Hold'),
        countApplicationsForPipelineStage(authUser, 'Missing_Documents'),
        countApplicationsForPipelineStage(authUser, 'Recently_Deleted'),
        countApplicationsForPipelineStage(authUser, 'Decline_Request'),
        countApplicationsForPipelineStage(authUser, 'Declined_By_Scrubber'),
        countApplicationsForPipelineStage(authUser, 'Declined_By_Underwriter'),
        countApplicationsForPipelineStage(authUser, 'Declined_By_Admin'),
        countApplicationsForPipelineStage(authUser, 'Not_A_Application'),
        countApplicationsForPipelineStage(authUser, 'Old_Not_Scrubbed'),
    ]);

    // Use the same strict pipeline matchers as GET /applications?operationsStatus=…
    // so sidebar badges match the filtered list (queue-only metrics can over-count).
    const contractPending = contractPendingCount;
    const contractsOut = contractSentCount;
    const signedContracts = signedContractCount;
    const fundingCall = counts['Funding Call'];
    const disbursment = counts.Disbursment;
    const funded = counts.Funded;

    return {
        summaryCounts: {
            totalCases,
            contractPending,
            contractGenerated: 0,
            contractsOut,
            signedContracts,
            fundingCall,
            disbursment,
            funded,
        },
        summaryAmounts: {
            contractPending: amounts.Contract_Pending,
            contractsOut: amounts.Contract_Sent,
            signedContracts: amounts.Contract_Signed,
            fundingCall: amounts['Funding Call'],
            disbursment: amounts.Disbursment,
            funded: amounts.Funded,
        },
        caseStageCounts: {
            Agent: agentCount,
            Scrubbing: scrubbingCount,
            'Underwriter': underwriterCount,
            Approved_By_UW: approvedByUwCount,
            Approval_Sent: approvalSentCount,
            Approved_By_ISO: approvedByIsoCount,
            Final_Approval: finalApprovalCount,
            Contracted: signedContracts,
            'Contract_Pending': contractPending,
            Contract_Sent: contractsOut,
            Contract_Signed: signedContracts,
            Reinitiate_Contract: reinitiateContractCount,
            Final: finalCount,
            'Funding Call': fundingCall,
            On_Hold: onHoldCount,
            Missing_Documents: missingDocumentsCount,
            Disbursment: disbursment,
            Funded: funded,
            Declined: counts.Declined,
            Decline_Request: declineRequestCount,
            Declined_By_Scrubber: declinedByScrubberCount,
            Declined_By_Underwriter: declinedByUnderwriterCount,
            Declined_By_Admin: declinedByAdminCount,
            Not_A_Application: notAApplicationCount,
            Old_Not_Scrubbed: oldNotScrubbedCount,
            Recently_Deleted: recentlyDeletedCount,
        },
        caseStageAmounts: {
            Agent: amounts.Agent,
            Scrubbing: amounts.Scrubbing,
            'Underwriter': amounts['Underwriter'],
            Contracted: amounts.Contract_Signed,
            'Contract_Pending': amounts.Contract_Pending,
            Contract_Sent: amounts.Contract_Sent,
            Contract_Signed: amounts.Contract_Signed,
            Final: amounts.Final,
            'Funding Call': amounts['Funding Call'],
            Disbursment: amounts.Disbursment,
            Funded: amounts.Funded,
            Declined: amounts.Declined,
        },
        operationsMetricsMode: mode,
    };
}

export async function listOperationsDashboardRecentCases(
    authUser: AuthenticatedUser | null,
    limit = 200,
): Promise<OperationsDashboardRecentCasePayload> {
    const roleBase = buildRoleDefaultWhere(authUser);
    const visibilityBase = mergeApplicationVisibilityWhere(roleBase, authUser);
    const mode = viewerMode(authUser);
    const filterMode: OperationsStatusFilterMode = mode === 'queue' ? 'queue' : 'legacy';
    const isSuperAdmin = isSuperAdminRole(authUser?.role);
    const roleUpper = String(authUser?.role ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    const isOperations = roleUpper === 'OPERATIONS';
    const recentDealsWhere = isSuperAdmin
        ? {
              OR: [
                  buildOperationsStatusFilterWhere('Funded', filterMode),
                  buildOperationsStatusFilterWhere('Disbursment', filterMode),
              ],
          }
        : isOperations
          ? buildOperationsStatusFilterWhere('Contract_Signed', filterMode)
          : buildOperationsStatusFilterWhere('Contracted', filterMode);
    const where = combineWhere(
        combineWhere(visibilityBase, recentDealsWhere),
        excludeSoftDeletedWhere(),
    );
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 500) : 200;

    const rows = await prisma.application.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: safeLimit,
        select: {
            id: true,
            applicationId: true,
            loanAmount: true,
            currentQueue: true,
            currentState: true,
            createdAt: true,
            updatedAt: true,
            client: {
                select: {
                    id: true,
                    clientId: true,
                    businessName: true,
                    businessEmail: true,
                    ownerFirstName: true,
                    ownerLastName: true,
                    ownerEmail: true,
                },
            },
        },
    });

    return rows.map((row) => ({
        _id: row.id,
        applicationId: row.applicationId ?? null,
        client: row.client
            ? {
                _id: row.client.id,
                clientId: row.client.clientId ?? null,
                business: {
                    name: row.client.businessName || '-',
                    email: row.client.businessEmail || '-',
                },
                owner: {
                    firstName: row.client.ownerFirstName || '',
                    lastName: row.client.ownerLastName || '',
                    email: row.client.ownerEmail || '',
                },
            }
            : null,
        loanAmount: row.loanAmount ?? null,
        currentQueue: row.currentQueue ?? null,
        currentState: row.currentState ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }));
}
