import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { reconcileStaleContractReinitiationFlags } from './contractReinitiationService';
import {
    contractCancelledStrictMatchWhere,
    contractGeneratedStrictMatchWhere,
    contractPendingStrictMatchWhere,
    contractSentStrictMatchWhere,
    excludeSoftDeletedWhere,
    reinitiateContractMatchWhere,
    signedContractsStrictMatchWhere,
} from './operationsStatusFilter';

export type ContractAnalyticsDateRange = {
    from?: Date;
    to?: Date;
};

export type StageMetric = {
    count: number;
    percentageOfFunnel: number;
    percentageOfTotalApplications: number;
};

export type RateMetric = {
    percentage: number;
    numerator: number;
    denominator: number;
};

export type ContractStatusBreakdown = {
    status: string;
    count: number;
    percentage: number;
    approvedAmountTotal: number;
    totalAmountTotal: number;
};

export type ContractAnalyticsPayload = {
    totalApplications: number;
    contractFunnelTotal: number;
    applicationsWithContract: number;
    stages: {
        contractPending: StageMetric;
        contractGenerated: StageMetric;
        contractSent: StageMetric;
        contractSigned: StageMetric;
        contractCancelled: StageMetric;
        reinitiateContract: StageMetric;
    };
    rates: {
        contractGenerationPercentage: RateMetric;
        contractSignedProbabilityPercentage: RateMetric;
        funnelCloseRatePercentage: RateMetric;
        applicationsWithContractPercentage: RateMetric;
        cancellationRatePercentage: RateMetric;
    };
    contractRecords: {
        total: number;
        byStatus: ContractStatusBreakdown[];
        totals: {
            approvedAmount: number;
            totalAmount: number;
            averageApprovedAmount: number;
            averageTotalAmount: number;
        };
    };
    amounts: {
        pendingApprovedAmount: number;
        generatedApprovedAmount: number;
        sentApprovedAmount: number;
        signedApprovedAmount: number;
        cancelledApprovedAmount: number;
    };
    computedAt: string;
};

/** percentage = round((numerator / denominator) * 10000) / 100; 0 when denominator is 0 */
export function roundPercentage(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    return Math.round((numerator / denominator) * 10000) / 100;
}

function rateMetric(numerator: number, denominator: number): RateMetric {
    return {
        percentage: roundPercentage(numerator, denominator),
        numerator,
        denominator,
    };
}

function stageMetric(
    count: number,
    funnelTotal: number,
    totalApplications: number,
): StageMetric {
    return {
        count,
        percentageOfFunnel: roundPercentage(count, funnelTotal),
        percentageOfTotalApplications: roundPercentage(count, totalApplications),
    };
}

function combineWhere(
    ...parts: Array<Prisma.ApplicationWhereInput | undefined>
): Prisma.ApplicationWhereInput {
    const defined = parts.filter(Boolean) as Prisma.ApplicationWhereInput[];
    if (defined.length === 0) return {};
    if (defined.length === 1) return defined[0];
    return { AND: defined };
}

function applicationDateWhere(
    range?: ContractAnalyticsDateRange,
): Prisma.ApplicationWhereInput | undefined {
    if (!range?.from && !range?.to) return undefined;
    return {
        updatedAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
        },
    };
}

function contractDateWhere(
    range?: ContractAnalyticsDateRange,
): Prisma.ContractWhereInput | undefined {
    if (!range?.from && !range?.to) return undefined;
    return {
        createdAt: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
        },
    };
}

function applicationBaseWhere(
    range?: ContractAnalyticsDateRange,
): Prisma.ApplicationWhereInput {
    return combineWhere(excludeSoftDeletedWhere(), applicationDateWhere(range));
}

async function countApplications(
    stageWhere: Prisma.ApplicationWhereInput,
    range?: ContractAnalyticsDateRange,
): Promise<number> {
    return prisma.application.count({
        where: combineWhere(applicationBaseWhere(range), stageWhere),
    });
}

/** Sum Contract.approvedAmount for applications in a pipeline stage (app date filter). */
async function sumContractApprovedForStage(
    stageWhere: Prisma.ApplicationWhereInput,
    range?: ContractAnalyticsDateRange,
): Promise<number> {
    const result = await prisma.contract.aggregate({
        where: {
            application: {
                is: combineWhere(applicationBaseWhere(range), stageWhere),
            },
        },
        _sum: { approvedAmount: true },
    });
    return result._sum.approvedAmount ?? 0;
}

/**
 * Pending stage amount: application.loanAmount when no Contract row exists yet.
 */
async function sumPendingApprovedAmount(
    range?: ContractAnalyticsDateRange,
): Promise<number> {
    const result = await prisma.application.aggregate({
        where: combineWhere(
            applicationBaseWhere(range),
            contractPendingStrictMatchWhere(),
            { contract: { is: null } },
        ),
        _sum: { loanAmount: true },
    });
    return result._sum.loanAmount ?? 0;
}

/**
 * Live Super Admin contract funnel analytics.
 * Stage counts use the same strict pipeline matchers as operations status filters.
 */
export async function getContractAnalyticsForSuperAdmin(
    range?: ContractAnalyticsDateRange,
): Promise<ContractAnalyticsPayload> {
    try {
        await reconcileStaleContractReinitiationFlags();
    } catch (reconcileErr) {
        console.error(
            '[contractAnalytics] reconcile stale reinitiation flags failed:',
            reconcileErr,
        );
    }

    const appBase = applicationBaseWhere(range);
    const contractCreatedFilter = contractDateWhere(range);

    const [
        totalApplications,
        contractPendingCount,
        contractGeneratedCount,
        contractSentCount,
        contractSignedCount,
        contractCancelledCount,
        reinitiateContractCount,
        applicationsWithContract,
        pendingApprovedAmount,
        generatedApprovedAmount,
        sentApprovedAmount,
        signedApprovedAmount,
        cancelledApprovedAmount,
        contractByStatus,
        contractTotals,
    ] = await Promise.all([
        prisma.application.count({ where: appBase }),
        countApplications(contractPendingStrictMatchWhere(), range),
        countApplications(contractGeneratedStrictMatchWhere(), range),
        countApplications(contractSentStrictMatchWhere(), range),
        countApplications(signedContractsStrictMatchWhere(), range),
        countApplications(contractCancelledStrictMatchWhere(), range),
        countApplications(reinitiateContractMatchWhere(), range),
        prisma.application.count({
            where: combineWhere(appBase, { contract: { isNot: null } }),
        }),
        sumPendingApprovedAmount(range),
        sumContractApprovedForStage(contractGeneratedStrictMatchWhere(), range),
        sumContractApprovedForStage(contractSentStrictMatchWhere(), range),
        sumContractApprovedForStage(signedContractsStrictMatchWhere(), range),
        sumContractApprovedForStage(contractCancelledStrictMatchWhere(), range),
        prisma.contract.groupBy({
            by: ['status'],
            where: contractCreatedFilter,
            _count: { _all: true },
            _sum: { approvedAmount: true, totalAmount: true },
            orderBy: { status: 'asc' },
        }),
        prisma.contract.aggregate({
            where: contractCreatedFilter,
            _count: { _all: true },
            _sum: { approvedAmount: true, totalAmount: true },
            _avg: { approvedAmount: true, totalAmount: true },
        }),
    ]);

    const contractFunnelTotal =
        contractPendingCount +
        contractGeneratedCount +
        contractSentCount +
        contractSignedCount +
        contractCancelledCount;

    const generationNumerator =
        contractGeneratedCount + contractSentCount + contractSignedCount;
    const signedProbabilityDenominator = contractSentCount + contractSignedCount;

    const contractTotal = contractTotals._count._all;
    const approvedAmountTotal = contractTotals._sum.approvedAmount ?? 0;
    const totalAmountTotal = contractTotals._sum.totalAmount ?? 0;

    const byStatus: ContractStatusBreakdown[] = contractByStatus.map((row) => ({
        status: row.status,
        count: row._count._all,
        percentage: roundPercentage(row._count._all, contractTotal),
        approvedAmountTotal: row._sum.approvedAmount ?? 0,
        totalAmountTotal: row._sum.totalAmount ?? 0,
    }));

    return {
        totalApplications,
        contractFunnelTotal,
        applicationsWithContract,
        stages: {
            contractPending: stageMetric(
                contractPendingCount,
                contractFunnelTotal,
                totalApplications,
            ),
            contractGenerated: stageMetric(
                contractGeneratedCount,
                contractFunnelTotal,
                totalApplications,
            ),
            contractSent: stageMetric(
                contractSentCount,
                contractFunnelTotal,
                totalApplications,
            ),
            contractSigned: stageMetric(
                contractSignedCount,
                contractFunnelTotal,
                totalApplications,
            ),
            contractCancelled: stageMetric(
                contractCancelledCount,
                contractFunnelTotal,
                totalApplications,
            ),
            reinitiateContract: stageMetric(
                reinitiateContractCount,
                contractFunnelTotal,
                totalApplications,
            ),
        },
        rates: {
            contractGenerationPercentage: rateMetric(
                generationNumerator,
                contractFunnelTotal,
            ),
            contractSignedProbabilityPercentage: rateMetric(
                contractSignedCount,
                signedProbabilityDenominator,
            ),
            funnelCloseRatePercentage: rateMetric(
                contractSignedCount,
                contractFunnelTotal,
            ),
            applicationsWithContractPercentage: rateMetric(
                applicationsWithContract,
                totalApplications,
            ),
            cancellationRatePercentage: rateMetric(
                contractCancelledCount,
                contractFunnelTotal,
            ),
        },
        contractRecords: {
            total: contractTotal,
            byStatus,
            totals: {
                approvedAmount: approvedAmountTotal,
                totalAmount: totalAmountTotal,
                averageApprovedAmount: contractTotals._avg.approvedAmount ?? 0,
                averageTotalAmount: contractTotals._avg.totalAmount ?? 0,
            },
        },
        amounts: {
            pendingApprovedAmount,
            generatedApprovedAmount,
            sentApprovedAmount,
            signedApprovedAmount,
            cancelledApprovedAmount,
        },
        computedAt: new Date().toISOString(),
    };
}
