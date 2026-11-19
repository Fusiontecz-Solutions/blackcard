import { ArrowUp, ArrowDown } from "lucide-react";
// Wd-preview look for the themed cards; imported here so it loads on every
// screen that renders this table, not only the Scrubbing tab.
import "@/styles/scrubbingPreviewTheme.css";

export type BankTotalTableRow = {
  month: string;
  totalCredit: string;
  loanTransfer: string;
  deposit: string;
  other: string;
  netCredit: string;
  avgDailyBal: string;
  nsfNegDays: string;
  lowBalDays: string;
};

export type BankTotalTableAverageCells = Omit<BankTotalTableRow, "month">;

const monthCellClass =
  "min-w-[140px] whitespace-nowrap px-4 py-2 text-[12px] font-medium text-slate-700 dark:text-slate-200";

const valueCellClass =
  "min-w-[140px] px-4 py-3 text-left text-[13px] tabular-nums text-slate-800 dark:text-slate-200";

const netCreditColClass = "scrub-net-cell bg-[#ebf3ff] dark:bg-sky-950/40";

/** Cells arrive pre-formatted ("$ 1,234.00"), so read the number back out. */
function parseMoney(value: string): number | null {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Month-on-month direction for Net Credit, matching the per-bank table and the
 * preview: each row is compared with the one below it, which is the previous
 * month, and the oldest row has nothing to compare against.
 */
function netCreditTrend(
  rows: BankTotalTableRow[],
  index: number,
): "up" | "down" | "none" {
  if (index >= rows.length - 1) return "none";
  const current = parseMoney(rows[index].netCredit);
  const previous = parseMoney(rows[index + 1].netCredit);
  if (current == null || previous == null) return "none";
  if (current === previous) return "none";
  return current > previous ? "up" : "down";
}
const alertColClass = "scrub-alert-cell bg-[rgba(146,39,39,0.08)] dark:bg-rose-950/30";

export type BankTotalTableProps = {
  rows: BankTotalTableRow[];
  /** Pre-formatted cells; use "-" when averages do not apply (e.g. no divisor months). */
  average: BankTotalTableAverageCells;
  /** When set, labels the average row as last N months (scrubbing window). */
  averageMonthWindow?: number;
  /** When set without averageMonthWindow, labels as all N months. */
  averageMonthCount?: number;
};

export default function BankTotalTable({
  rows,
  average,
  averageMonthWindow,
  averageMonthCount: _averageMonthCount,
}: BankTotalTableProps) {
  // Preview prints a bare "(MTD Not counted)"; only an explicit scrubbing
  // window earns the longer form, since that carries information the preview
  // has no equivalent for.
  let averageSubtitle = "(MTD Not counted)";
  if (averageMonthWindow != null && averageMonthWindow > 0) {
    averageSubtitle = `(last ${averageMonthWindow} months, MTD not counted)`;
  }
  return (
    <div
      data-scrubbing-preview-theme
      className="w-full overflow-hidden scrub-merged-card rounded-[14px] border border-[#e2e2e2] bg-white shadow-sm dark:border-slate-700 dark:bg-[#141517]"
    >
      <div
        className="scrub-merged-bar px-4 py-1.5 text-center dark:border-slate-700 dark:bg-[#2A2B2F]"
      >
        <h2 className="scrub-merged-title text-[16px] font-bold uppercase text-slate-700 dark:text-slate-100">
          Bank Total
        </h2>
      </div>
      <div className="overflow-x-auto rounded-b-xl">
        <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-[11px]">
          <thead>
            {/* Columns match ScrubbingPreviewModal's Bank Total table exactly.
                "Other" and "Low Bal. Days" are not shown — the preview has no
                such columns and this table is display-only, so nothing is lost. */}
            <tr className="scrub-merged-head border-b border-[#E2E8F0] text-[12px] font-semibold uppercase tracking-wide text-[#475569] dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
              <th className="min-w-[140px] px-4 py-3">Month</th>
              <th className={`min-w-[140px] px-4 py-3 text-left ${netCreditColClass}`}>
                Net Credit
              </th>
              <th className="min-w-[140px] px-4 py-3 text-left">Funding Amt</th>
              <th className="min-w-[140px] px-4 py-3 text-left">
                Transfers &amp; other deductions
              </th>
              <th className="min-w-[140px] px-4 py-3 text-left">Total Credit</th>
              <th className="min-w-[140px] px-4 py-3 text-left">Avg Daily Blc.</th>
              <th className={`min-w-[140px] px-4 py-3 text-left ${alertColClass}`}>
                NSF/Neg days
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row, rowIdx) => (
              <tr
                key={row.month}
                className={
                  rowIdx % 2 === 0 ? "bg-white dark:bg-[#141517]" : "bg-slate-50/40 dark:bg-slate-900/35"
                }
              >
                <td className={monthCellClass}>{row.month}</td>
                <td className={`${valueCellClass} ${netCreditColClass}`}>
                  <span className="inline-flex items-center gap-1">
                    <span>{row.netCredit}</span>
                    {(() => {
                      const trend = netCreditTrend(rows, rowIdx);
                      if (trend === "none") return null;
                      // Same icons, size and colours as the preview.
                      return trend === "up" ? (
                        <ArrowUp className="inline h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <ArrowDown className="inline h-3.5 w-3.5 text-red-500" />
                      );
                    })()}
                  </span>
                </td>
                <td className={valueCellClass}>{row.loanTransfer}</td>
                <td className={valueCellClass}>{row.deposit}</td>
                <td className={valueCellClass}>{row.totalCredit}</td>
                <td className={valueCellClass}>{row.avgDailyBal}</td>
                <td className={`${valueCellClass} ${alertColClass}`}>{row.nsfNegDays}</td>
              </tr>
            ))}
            <tr className="scrub-summary-row bg-slate-100/80 text-sm font-semibold text-slate-800 dark:bg-slate-800/80 dark:text-slate-100">
              <td className="px-4 py-3 align-middle bg-inherit">
                <div className="flex flex-col leading-snug">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-900 dark:text-slate-100">
                    Average
                  </span>
                  <span className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-sky-300">
                    {averageSubtitle}
                  </span>
                </div>
              </td>
              <td className={`px-4 py-3 text-left tabular-nums ${netCreditColClass}`}>
                {average.netCredit}
              </td>
              <td className="px-4 py-3 text-left tabular-nums">{average.loanTransfer}</td>
              <td className="px-4 py-3 text-left tabular-nums">{average.deposit}</td>
              <td className="px-4 py-3 text-left tabular-nums">{average.totalCredit}</td>
              <td className="px-4 py-3 text-left tabular-nums">{average.avgDailyBal}</td>
              <td className={`px-4 py-3 text-left tabular-nums ${alertColClass}`}>
                {average.nsfNegDays}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
