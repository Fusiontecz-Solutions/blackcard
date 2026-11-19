import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { updateContract } from "@/redux/actions/contractActions";
import { axiosPost } from "@/redux/axios";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    EMPTY_REVERSE_DISBURSEMENT_ROW,
    EMPTY_REVERSE_DISBURSEMENT_SUMMARY,
    REVERSE_DISBURSEMENT_COLUMN_LABELS,
    REVERSE_DISBURSEMENT_SUMMARY_FIELDS,
    parsePastedReverseDisbursementTable,
    parseReverseDisbursementSummaryFromPaste,
    scheduleDataFromContract,
    type ReverseDisbursementScheduleData,
    type ReverseDisbursementScheduleRow,
    type ReverseDisbursementScheduleSummary,
} from "./contractdata/reverseDisbursementSchedule";

type ReverseDisbursementScheduleSectionProps = {
    contractId: number | null;
    fetchedContract: Record<string, unknown> | null;
    readOnly?: boolean;
    isDark?: boolean;
    onSaved?: () => void | Promise<void>;
};

export default function ReverseDisbursementScheduleSection({
    contractId,
    fetchedContract,
    readOnly = false,
    isDark = false,
    onSaved,
}: ReverseDisbursementScheduleSectionProps) {
    const dispatch = useDispatch<AppDispatch>();
    const initial = useMemo(
        () => scheduleDataFromContract(fetchedContract),
        [fetchedContract],
    );

    const [enabled, setEnabled] = useState(initial.enabled);
    const [summary, setSummary] = useState<ReverseDisbursementScheduleSummary>(
        initial.schedule?.summary ?? EMPTY_REVERSE_DISBURSEMENT_SUMMARY(),
    );
    const [rows, setRows] = useState<ReverseDisbursementScheduleRow[]>(
        initial.schedule?.rows?.length
            ? initial.schedule.rows
            : [EMPTY_REVERSE_DISBURSEMENT_ROW()],
    );
    const [pasteText, setPasteText] = useState("");
    const [saving, setSaving] = useState(false);
    const [previewing, setPreviewing] = useState(false);

    useEffect(() => {
        setEnabled(initial.enabled);
        setSummary(initial.schedule?.summary ?? EMPTY_REVERSE_DISBURSEMENT_SUMMARY());
        setRows(
            initial.schedule?.rows?.length
                ? initial.schedule.rows
                : [EMPTY_REVERSE_DISBURSEMENT_ROW()],
        );
    }, [initial.enabled, initial.schedule]);

    const cardClass = isDark
        ? "bg-[#1F2021] border-[#374151]"
        : "bg-white border-[#D1D5DB]";

    const updateRow = useCallback(
        (index: number, key: keyof ReverseDisbursementScheduleRow, value: string) => {
            setRows((prev) =>
                prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)),
            );
        },
        [],
    );

    const updateSummaryField = useCallback(
        (key: keyof ReverseDisbursementScheduleSummary, value: string) => {
            setSummary((prev) => ({ ...prev, [key]: value }));
        },
        [],
    );

    const handlePasteIntoTable = () => {
        const parsed = parsePastedReverseDisbursementTable(pasteText);
        const parsedSummary = parseReverseDisbursementSummaryFromPaste(pasteText);
        const hasSummary = Object.keys(parsedSummary).length > 0;

        if (!parsed.length && !hasSummary) {
            toast.error(
                "Could not parse rows. Paste the schedule table from the PDF (lines starting with Day 1… or Week 1…) or copy cells from Google Sheets.",
            );
            return;
        }
        if (parsed.length) {
            setRows(parsed);
        }
        if (hasSummary) {
            setSummary((prev) => ({ ...prev, ...parsedSummary }));
        }
        const parts = [];
        if (parsed.length) parts.push(`${parsed.length} row(s)`);
        if (hasSummary) parts.push("summary fields");
        toast.success(`Loaded ${parts.join(" and ")} from paste area.`);
    };

    const buildSchedulePayload = (): ReverseDisbursementScheduleData => {
        const cleanedRows = rows
            .map((row) => ({
                period: row.period.trim(),
                netDailysCredit: row.netDailysCredit.trim(),
                dailysCreditInclFees: row.dailysCreditInclFees.trim(),
                totalPeriodCredits: row.totalPeriodCredits.trim(),
                receivablesPurchased: row.receivablesPurchased.trim(),
            }))
            .filter(
                (row) =>
                    row.period ||
                    row.netDailysCredit ||
                    row.dailysCreditInclFees ||
                    row.totalPeriodCredits ||
                    row.receivablesPurchased,
            );

        const cleanedSummary = Object.fromEntries(
            REVERSE_DISBURSEMENT_SUMMARY_FIELDS.map(({ key }) => [key, summary[key]?.trim() ?? ""]),
        ) as ReverseDisbursementScheduleSummary;
        const hasSummaryValue = Object.values(cleanedSummary).some(Boolean);

        return {
            fixedDailyDebit: cleanedSummary.dailyDebit || undefined,
            summary: hasSummaryValue ? cleanedSummary : undefined,
            rows: cleanedRows,
        };
    };

    const handleSave = async () => {
        if (!contractId) {
            toast.error("Generate a contract before saving the disbursement schedule.");
            return;
        }
        if (enabled) {
            const payload = buildSchedulePayload();
            if (!payload.rows.length) {
                toast.error("Paste or enter at least one schedule row.");
                return;
            }
        }

        setSaving(true);
        try {
            const schedule = enabled ? buildSchedulePayload() : null;
            await dispatch(
                updateContract({
                    id: contractId,
                    data: {
                        reverseDisbursementEnabled: enabled,
                        reverseDisbursementSchedule: schedule,
                    },
                }),
            ).unwrap();
            toast.success("Disbursement schedule saved.");
            await onSaved?.();
        } catch (err) {
            console.error(err);
            toast.error("Failed to save disbursement schedule.");
        } finally {
            setSaving(false);
        }
    };

    const handlePreview = async () => {
        if (!contractId) {
            toast.error("Generate a contract before previewing.");
            return;
        }
        const schedule = buildSchedulePayload();
        if (!schedule.rows.length) {
            toast.error("Add at least one row before previewing.");
            return;
        }

        setPreviewing(true);
        try {
            const response = await axiosPost(
                `/contract/${contractId}/reverse-disbursement/preview`,
                { reverseDisbursementSchedule: schedule },
                { responseType: "blob" },
            );
            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch (err) {
            console.error(err);
            toast.error("Failed to generate preview.");
        } finally {
            setPreviewing(false);
        }
    };

    if (!contractId) {
        return null;
    }

    return (
        <div className={`rounded-lg border p-6 ${cardClass}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3
                        className={`text-base font-semibold ${isDark ? "text-gray-200" : "text-[#374151]"}`}
                    >
                        Reverse Disbursement Schedule
                    </h3>
                </div>
                <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                        checked={enabled}
                        onCheckedChange={(checked: boolean | "indeterminate") =>
                            setEnabled(checked === true)
                        }
                        disabled={readOnly}
                    />
                    <span className={isDark ? "text-gray-200" : "text-[#374151]"}>
                        Enable reverse schedule
                    </span>
                </label>
            </div>

            {enabled ? (
                <div className="space-y-4">
                    <div
                        className={`overflow-hidden rounded-lg border max-w-md ${isDark ? "border-[#374151]" : "border-[#D1D5DB]"}`}
                    >
                        {REVERSE_DISBURSEMENT_SUMMARY_FIELDS.map(({ key, label }, idx) => (
                            <div
                                key={key}
                                className={`flex items-center gap-3 px-3 py-1.5 ${
                                    idx > 0 ? (isDark ? "border-t border-[#374151]" : "border-t border-[#E5E7EB]") : ""
                                } ${isDark ? "even:bg-[#111827]" : "even:bg-[#F9FAFB]"}`}
                            >
                                <Label
                                    className={`w-44 shrink-0 text-xs font-medium ${isDark ? "text-gray-300" : "text-[#374151]"}`}
                                >
                                    {label}:
                                </Label>
                                <Input
                                    value={summary[key]}
                                    onChange={(e) => updateSummaryField(key, e.target.value)}
                                    disabled={readOnly}
                                    className="h-8 text-xs"
                                />
                            </div>
                        ))}
                    </div>

                    {!readOnly ? (
                        <div className="space-y-2">
                            <Label className={isDark ? "text-gray-400" : "text-[#687182]"}>
                                Paste table from PDF / Google Sheet
                            </Label>
                            <Textarea
                                value={pasteText}
                                onChange={(e) => setPasteText(e.target.value)}
                                placeholder="Paste from PDF (Day 1 - Day 16… or Week 1 - Week 10…) or copy rows from Google Sheets."
                                rows={4}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handlePasteIntoTable}
                            >
                                Load pasted rows into table
                            </Button>
                        </div>
                    ) : null}

                    <div className="overflow-x-auto rounded-lg border border-[#D1D5DB] dark:border-[#374151]">
                        <table className="min-w-full text-xs">
                            <thead>
                                <tr className={isDark ? "bg-[#111827]" : "bg-[#F3F4F6]"}>
                                    {REVERSE_DISBURSEMENT_COLUMN_LABELS.map((label) => (
                                        <th
                                            key={label}
                                            className={`px-2 py-2 text-left font-semibold ${isDark ? "text-gray-200" : "text-[#374151]"}`}
                                        >
                                            {label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, rowIndex) => (
                                    <tr
                                        key={`schedule-row-${rowIndex}`}
                                        className="border-t border-[#E5E7EB] dark:border-[#374151]"
                                    >
                                        <td className="p-1">
                                            <Input
                                                value={row.period}
                                                onChange={(e) =>
                                                    updateRow(rowIndex, "period", e.target.value)
                                                }
                                                disabled={readOnly}
                                                className="h-8 text-xs"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <Input
                                                value={row.netDailysCredit}
                                                onChange={(e) =>
                                                    updateRow(
                                                        rowIndex,
                                                        "netDailysCredit",
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={readOnly}
                                                className="h-8 text-xs"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <Input
                                                value={row.dailysCreditInclFees}
                                                onChange={(e) =>
                                                    updateRow(
                                                        rowIndex,
                                                        "dailysCreditInclFees",
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={readOnly}
                                                className="h-8 text-xs"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <Input
                                                value={row.totalPeriodCredits}
                                                onChange={(e) =>
                                                    updateRow(
                                                        rowIndex,
                                                        "totalPeriodCredits",
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={readOnly}
                                                className="h-8 text-xs"
                                            />
                                        </td>
                                        <td className="p-1">
                                            <Input
                                                value={row.receivablesPurchased}
                                                onChange={(e) =>
                                                    updateRow(
                                                        rowIndex,
                                                        "receivablesPurchased",
                                                        e.target.value,
                                                    )
                                                }
                                                disabled={readOnly}
                                                className="h-8 text-xs"
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {!readOnly ? (
                        <div className="flex flex-wrap gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                    setRows((prev) => [...prev, EMPTY_REVERSE_DISBURSEMENT_ROW()])
                                }
                            >
                                Add row
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={handlePreview}
                                disabled={previewing}
                            >
                                {previewing ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Previewing…
                                    </span>
                                ) : (
                                    "Preview page"
                                )}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => void handleSave()}
                                disabled={saving}
                            >
                                {saving ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Saving…
                                    </span>
                                ) : (
                                    "Save schedule"
                                )}
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : !readOnly ? (
                <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                </Button>
            ) : null}
        </div>
    );
}
