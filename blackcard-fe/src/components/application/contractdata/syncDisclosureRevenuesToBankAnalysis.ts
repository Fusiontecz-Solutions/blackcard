import { axiosPost } from "@/redux/axios";
import {
    listBankAnalysisRevenueRowTargets,
    type BankAnalysisRevenueRowTarget,
} from "./disclosureAprCalculator";

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
] as const;

function defaultMonthLabelForIndex(index: number): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const name = MONTH_NAMES[d.getMonth()];
    const year = d.getFullYear();
    return index === 0 ? `${name} MTD` : `${name} ${year}`;
}

function buildRowUpsertPayload(
    target: Pick<
        BankAnalysisRevenueRowTarget,
        | "rowId"
        | "loanTransfer"
        | "deposit"
        | "other"
        | "nsfNegDays"
        | "lowBlcDays"
    > &
        Partial<Pick<BankAnalysisRevenueRowTarget, "monthLabel" | "monthDate">>,
    revenue: number,
    monthLabelOverride?: string,
) {
    const deductions = target.loanTransfer + target.deposit + target.other;
    const totalCredit = Math.max(0, revenue + deductions);
    const monthLabel = monthLabelOverride ?? target.monthLabel;
    return {
        rowId: target.rowId,
        monthLabel: monthLabel || defaultMonthLabelForIndex(0),
        monthDate: target.monthDate ?? new Date().toISOString(),
        totalCredit,
        loanTransfer: target.loanTransfer,
        deposit: target.deposit,
        other: target.other,
        nsfNegDays: target.nsfNegDays,
        lowBlcDays: target.lowBlcDays,
        avgDailyBlc: revenue > 0 ? revenue / 30 : 0,
    };
}

function resolvePrimaryBankAnalysis(
    analyses: unknown,
): { bankAnalysisId: string; accountNumber: string } | null {
    if (!Array.isArray(analyses) || analyses.length === 0) return null;

    let best = analyses[0] as {
        _id?: string;
        id?: string;
        accountNumber?: string;
        rows?: unknown[];
    };
    for (const analysis of analyses) {
        const candidate = analysis as { rows?: unknown[]; accountNumber?: string };
        if ((candidate.rows?.length ?? 0) > (best.rows?.length ?? 0)) {
            best = candidate as typeof best;
        }
    }

    const bankAnalysisId = best._id ?? best.id;
    if (!bankAnalysisId) return null;
    return {
        bankAnalysisId: String(bankAnalysisId),
        accountNumber: String(best.accountNumber ?? "").trim(),
    };
}

/**
 * Persists disclosure calculator monthly revenues back to bank analysis rows
 * (net credit = total credit minus loan transfer, deposit, and other).
 */
export async function syncMonthlyRevenuesToBankAnalyses(args: {
    analyses: unknown;
    monthlyRevenues: number[];
    applicationId: string;
}): Promise<{ updated: number; created: number }> {
    const revenues = args.monthlyRevenues.filter((value) => Number.isFinite(value) && value > 0);
    if (!revenues.length) return { updated: 0, created: 0 };

    const targets = listBankAnalysisRevenueRowTargets(args.analyses);
    let updated = 0;
    let created = 0;

    for (let index = 0; index < Math.min(revenues.length, targets.length); index += 1) {
        const target = targets[index];
        const revenue = revenues[index];
        if (Math.abs(target.netCredit - revenue) < 0.005) continue;

        await axiosPost(`/bank-analysis/${target.bankAnalysisId}/rows`, {
            ...buildRowUpsertPayload(target, revenue),
        });
        updated += 1;
    }

    if (revenues.length <= targets.length) {
        return { updated, created };
    }

    const primary = resolvePrimaryBankAnalysis(args.analyses);
    if (!primary) {
        const rows = revenues.map((revenue, index) =>
            buildRowUpsertPayload(
                {
                    loanTransfer: 0,
                    deposit: 0,
                    other: 0,
                    nsfNegDays: 0,
                    lowBlcDays: 0,
                },
                revenue,
                defaultMonthLabelForIndex(index),
            ),
        );
        await axiosPost("/bank-analysis", {
            application: args.applicationId,
            accountNumber: "",
            rows,
        });
        return { updated, created: revenues.length };
    }

    for (let index = targets.length; index < revenues.length; index += 1) {
        await axiosPost(`/bank-analysis/${primary.bankAnalysisId}/rows`, {
            ...buildRowUpsertPayload(
                {
                    loanTransfer: 0,
                    deposit: 0,
                    other: 0,
                    nsfNegDays: 0,
                    lowBlcDays: 0,
                },
                revenues[index],
                defaultMonthLabelForIndex(index),
            ),
        });
        created += 1;
    }

    return { updated, created };
}
