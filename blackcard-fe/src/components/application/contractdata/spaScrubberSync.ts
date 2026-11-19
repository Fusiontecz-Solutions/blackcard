import { axiosPost, axiosPut } from "@/redux/axios";
import {
    createPosition,
    getPositions,
    updatePosition,
} from "@/redux/actions/positionActions";
import type { AppDispatch } from "@/redux/store";
import type {
    SpaBankMonthContribution,
    SpaMonthlyPaymentRow,
    SpaMonthlyRevenueRow,
} from "@/lib/scrubbingSpecifiedPercent";

export const SPA_SCRUBBER_SYNCED_EVENT = "woodmere:spa-scrubber-synced";

export type SpaBankApiRecord = {
    _id?: string;
    id?: string;
    accountNumber?: string;
    rows?: Array<Record<string, unknown>>;
};

function parseAmount(value: unknown): number {
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    const n = Number.parseFloat(raw.replace(/[$,%\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
}

function paymentRowKey(row: SpaMonthlyPaymentRow): string {
    if (row.source === "positions_total") return "positions:total";
    return row.source === "offer"
        ? "offer:monthly"
        : `position:${row.positionId ?? row.label}`;
}

function amountsEqual(a: number, b: number): boolean {
    return Math.abs(a - b) < 0.005;
}

function distributeNetCredit(
    targetNetCredit: number,
    contributions: SpaBankMonthContribution[],
): SpaBankMonthContribution[] {
    if (!contributions.length) return [];
    const sum = contributions.reduce((s, row) => s + row.netCredit, 0);
    if (!(targetNetCredit >= 0)) return contributions;

    return contributions.map((contrib, index) => {
        const ratio =
            sum > 0
                ? contrib.netCredit / sum
                : 1 / contributions.length;
        const newNetCredit =
            sum > 0 || index === 0
                ? targetNetCredit * ratio
                : 0;
        const newTotalCredit =
            newNetCredit + contrib.loanTransfer + contrib.deposit + contrib.other;
        return {
            ...contrib,
            netCredit: newNetCredit,
            totalCredit: newTotalCredit,
        };
    });
}

function cloneBanks(banks: SpaBankApiRecord[]): SpaBankApiRecord[] {
    return banks.map((bank) => ({
        ...bank,
        rows: Array.isArray(bank.rows) ? bank.rows.map((row) => ({ ...row })) : [],
    }));
}

function applyRevenueEditsToBanks(
    banks: SpaBankApiRecord[],
    revenueEdits: Array<{
        month: string;
        netCredit: number;
        bankContributions?: SpaBankMonthContribution[];
    }>,
): SpaBankApiRecord[] {
    const next = cloneBanks(banks);
    for (const edit of revenueEdits) {
        const contributions = edit.bankContributions ?? [];
        if (!contributions.length) continue;
        const adjusted = distributeNetCredit(edit.netCredit, contributions);
        for (const contrib of adjusted) {
            const bank = next.find(
                (item) =>
                    String(item._id ?? item.id ?? "").trim() === contrib.bankBackendId,
            );
            if (!bank || !Array.isArray(bank.rows)) continue;
            const row = bank.rows.find((r) => {
                const rowId = String(r._id ?? r.id ?? "").trim();
                const monthLabel = String(r.monthLabel ?? r.month ?? "").trim();
                if (contrib.rowBackendId && rowId) {
                    return rowId === contrib.rowBackendId;
                }
                return monthLabel === edit.month;
            });
            if (!row) continue;
            row.totalCredit = contrib.totalCredit;
        }
    }
    return next;
}

function buildBankRowsPayload(
    rows: Array<Record<string, unknown>> | undefined,
): Array<Record<string, unknown>> {
    return (rows ?? [])
        .map((row) => {
            const monthLabel = String(row.monthLabel ?? row.month ?? "").trim();
            const totalCredit = parseAmount(row.totalCredit);
            const loanTransfer = parseAmount(row.loanTransfer);
            const deposit = parseAmount(row.deposit);
            const other = parseAmount(row.other);
            const hasValue =
                monthLabel &&
                (totalCredit !== 0 ||
                    loanTransfer !== 0 ||
                    deposit !== 0 ||
                    other !== 0 ||
                    parseAmount(row.nsfNegDays) !== 0 ||
                    parseAmount(row.lowBlcDays) !== 0 ||
                    parseAmount(row.avgDailyBlc) !== 0);
            if (!hasValue) return null;
            const rowBackendId = String(row._id ?? row.id ?? "").trim();
            return {
                _id: rowBackendId || undefined,
                id: rowBackendId || undefined,
                monthLabel,
                monthDate: new Date().toISOString(),
                totalCredit,
                loanTransfer,
                deposit,
                other,
                nsfNegDays: parseAmount(row.nsfNegDays),
                lowBlcDays: parseAmount(row.lowBlcDays),
                avgDailyBlc: parseAmount(row.avgDailyBlc),
            };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;
}

async function saveBankRecord(bank: SpaBankApiRecord): Promise<void> {
    const bankId = String(bank._id ?? bank.id ?? "").trim();
    if (!bankId) return;

    await axiosPut(`/bank-analysis/${bankId}`, {
        accountNumber: bank.accountNumber ?? "",
        rows: buildBankRowsPayload(bank.rows),
    });
}

export function notifySpaScrubberSynced(applicationUuid: string): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(SPA_SCRUBBER_SYNCED_EVENT, {
            detail: { applicationUuid },
        }),
    );
}

export async function persistSpaEditsToScrubber(args: {
    dispatch: AppDispatch;
    applicationUuid: string;
    banks: SpaBankApiRecord[];
    initialPayments: SpaMonthlyPaymentRow[];
    currentPayments: SpaMonthlyPaymentRow[];
    initialRevenues: SpaMonthlyRevenueRow[];
    currentRevenues: SpaMonthlyRevenueRow[];
}): Promise<void> {
    const appKey = String(args.applicationUuid ?? "").trim();
    if (!appKey) return;

    const initialPaymentMap = new Map(
        args.initialPayments.map((row) => [paymentRowKey(row), row.amount]),
    );
    const positionUpdates: Array<{ id: string; ach: number }> = [];
    let createRepaymentAmount: number | null = null;

    for (const row of args.currentPayments) {
        const key = paymentRowKey(row);
        const before = initialPaymentMap.get(key) ?? 0;
        if (amountsEqual(before, row.amount)) continue;

        if (row.source === "position" && row.positionId) {
            positionUpdates.push({ id: row.positionId, ach: row.amount });
            continue;
        }

        // Empty scrubber: user entered a total repayment in SPA — create a position.
        if (row.source === "positions_total" && row.amount > 0) {
            createRepaymentAmount = row.amount;
        }
    }

    const initialRevenueMap = new Map(
        args.initialRevenues.map((row) => [row.month, row.netCredit]),
    );
    const revenueEdits: Array<{
        month: string;
        netCredit: number;
        bankContributions?: SpaBankMonthContribution[];
    }> = [];
    for (const row of args.currentRevenues) {
        const before = initialRevenueMap.get(row.month) ?? 0;
        if (amountsEqual(before, row.netCredit)) continue;
        revenueEdits.push({
            month: row.month,
            netCredit: row.netCredit,
            bankContributions: row.bankContributions,
        });
    }

    if (
        !positionUpdates.length &&
        createRepaymentAmount == null &&
        !revenueEdits.length
    ) {
        return;
    }

    for (const update of positionUpdates) {
        await args
            .dispatch(
                updatePosition({
                    id: update.id,
                    data: { ach: String(update.ach) },
                }),
            )
            .unwrap();
    }

    if (createRepaymentAmount != null) {
        const fundingDate = ""; // no date entered — leave empty, never default to today
        // Backend treats 0 as missing for required numeric fields (!fundedAmount).
        const fundedAmount = createRepaymentAmount;
        const paybackAmount = Number((createRepaymentAmount * 1.49).toFixed(2));
        await args
            .dispatch(
                createPosition({
                    position: "Position 1",
                    factorRate: "1.49",
                    ach: String(createRepaymentAmount),
                    percentOfGross: "1",
                    funder: "SPA Calculator",
                    paybackAmount,
                    fundingDate,
                    activeStatus: true,
                    fundedAmount,
                    frequency: "Daily",
                    closeDate: fundingDate,
                    application: appKey,
                    status: "ACTIVE",
                }),
            )
            .unwrap();
    }

    if (revenueEdits.length > 0) {
        const editsWithContributions = revenueEdits.filter(
            (edit) => (edit.bankContributions ?? []).length > 0,
        );
        const editsWithoutContributions = revenueEdits.filter(
            (edit) => !(edit.bankContributions ?? []).length,
        );

        if (editsWithContributions.length > 0 && args.banks.length > 0) {
            const banksToSave = applyRevenueEditsToBanks(
                args.banks,
                editsWithContributions,
            );
            const changedBankIds = new Set(
                editsWithContributions.flatMap((edit) =>
                    (edit.bankContributions ?? []).map((c) => c.bankBackendId),
                ),
            );
            for (const bank of banksToSave) {
                const bankId = String(bank._id ?? bank.id ?? "").trim();
                if (!bankId || !changedBankIds.has(bankId)) continue;
                await saveBankRecord(bank);
            }
        }

        // No bank contributions (empty scrubber or seeded months): create / append bank rows.
        if (editsWithoutContributions.length > 0) {
            const existingBank = args.banks[0];
            const existingBankId = String(
                existingBank?._id ?? existingBank?.id ?? "",
            ).trim();
            const mergedRows = new Map<string, Record<string, unknown>>();

            for (const row of existingBank?.rows ?? []) {
                const monthLabel = String(row.monthLabel ?? row.month ?? "").trim();
                if (monthLabel) mergedRows.set(monthLabel, { ...row });
            }
            for (const edit of editsWithoutContributions) {
                const prev = mergedRows.get(edit.month) ?? {
                    monthLabel: edit.month,
                };
                mergedRows.set(edit.month, {
                    ...prev,
                    monthLabel: edit.month,
                    totalCredit: edit.netCredit,
                    loanTransfer: parseAmount(prev.loanTransfer),
                    deposit: parseAmount(prev.deposit),
                    other: parseAmount(prev.other),
                    nsfNegDays: parseAmount(prev.nsfNegDays),
                    lowBlcDays: parseAmount(prev.lowBlcDays),
                    avgDailyBlc: parseAmount(prev.avgDailyBlc),
                });
            }

            const rowsPayload = buildBankRowsPayload([...mergedRows.values()]);
            if (existingBankId) {
                await axiosPut(`/bank-analysis/${existingBankId}`, {
                    accountNumber: existingBank?.accountNumber ?? "",
                    rows: rowsPayload,
                });
            } else {
                await axiosPost("/bank-analysis", {
                    application: appKey,
                    accountNumber: existingBank?.accountNumber ?? "",
                    rows: rowsPayload,
                });
            }
        }
    }

    await args.dispatch(getPositions({ application: appKey, force: true }));
    notifySpaScrubberSynced(appKey);
}
