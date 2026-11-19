import React, { useMemo } from "react";
import { formatNumberUS, parseNumberUS } from "@/lib/utils";
import {
  computePositionMetrics,
  getExistingActivePositionsCount,
  recentMonthLeverageRatio,
  type BankTotalRow,
} from "@/lib/positionMetrics";
import "@/styles/scrubbingPreviewTheme.css";

/** Wd preview's WHITE_VEIL (sectionBarStyles.js), laid over the #aed6ef section bar. */
const SCRUB_WHITE_VEIL =
  "linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.14) 58%, rgba(255,255,255,0.34) 72%, rgba(255,255,255,0.62) 84%, rgba(255,255,255,0.86) 93%, rgba(255,255,255,1) 100%)";

type Frequency = "Daily" | "Weekly" | "Bi-Weekly" | "Monthly" | "";

function computeFallbackAvgNetCredit(
  bankTables?: Array<{ rows?: Array<{ netCredit?: number | string | null }> }>,
): number | null {
  if (!Array.isArray(bankTables) || bankTables.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const table of bankTables) {
    if (!Array.isArray(table?.rows)) continue;
    for (const row of table.rows) {
      const n = parseNumberUS(row?.netCredit);
      if (!Number.isNaN(n) && n > 0) {
        sum += n;
        count += 1;
      }
    }
  }
  if (count === 0) return null;
  return sum / count;
}

export interface ApprovedOfferDisplayProps {
  offer?: string | number;
  rate?: string | number;
  term?: string | number;
  frequency?: Frequency | string;
  monthlyPayment?: string | number;
  daysWeeks?: string | number;
  bankTotalAvgNetCredit?: number | string;
  bankTables?: Array<{ rows?: Array<{ netCredit?: number | string | null }> }>;
  bankTotalRows?: BankTotalRow[];
  positions?: any[];
  activeCount?: number;
  existingRemit?: number;
  totalMonthlyFromPositions?: number;
  totalDailyFromPositions?: number;
  showLeverageTable?: boolean;
}

export const ApprovedOfferDisplay: React.FC<ApprovedOfferDisplayProps> = ({
  frequency,
  monthlyPayment,
  daysWeeks,
  bankTotalAvgNetCredit,
  bankTables,
  bankTotalRows = [],
  positions = [],
  existingRemit: existingRemitProp,
  totalMonthlyFromPositions: totalMonthlyProp,
  totalDailyFromPositions: totalDailyProp,
  showLeverageTable = true,
}) => {
  const avgNetCredit = useMemo(() => {
    const direct = parseNumberUS(bankTotalAvgNetCredit);
    if (Number.isFinite(direct) && direct > 0) return direct;
    return computeFallbackAvgNetCredit(bankTables) ?? NaN;
  }, [bankTotalAvgNetCredit, bankTables]);

  const leverage = useMemo(() => {
    const fromPositions = computePositionMetrics(positions);
    const existingRemit =
      Array.isArray(positions) && positions.length > 0
        ? fromPositions.existingRemit
        : Number.isFinite(existingRemitProp)
          ? (existingRemitProp as number)
          : fromPositions.existingRemit;
    const totalMonthlyFromPositions =
      Array.isArray(positions) && positions.length > 0
        ? fromPositions.totalMonthlyFromPositions
        : Number.isFinite(totalMonthlyProp)
          ? (totalMonthlyProp as number)
          : fromPositions.totalMonthlyFromPositions;
    const totalDailyFromPositions =
      Array.isArray(positions) && positions.length > 0
        ? fromPositions.totalDailyFromPositions
        : Number.isFinite(totalDailyProp)
          ? (totalDailyProp as number)
          : fromPositions.totalDailyFromPositions;

    const currentOfferMonthly = parseNumberUS(monthlyPayment) || 0;
    const daysWeeksNum = parseNumberUS(daysWeeks);
    const currentOfferDaily =
      frequency === "Daily"
        ? Number.isFinite(daysWeeksNum) && daysWeeksNum > 0
          ? daysWeeksNum
          : 0
        : currentOfferMonthly > 0
          ? currentOfferMonthly / 22
          : 0;

    const ourHoldPct =
      Number.isFinite(currentOfferMonthly) &&
      currentOfferMonthly > 0 &&
      Number.isFinite(avgNetCredit) &&
      avgNetCredit > 0
        ? (currentOfferMonthly / avgNetCredit) * 100
        : 0;
    const existingHoldPct = Number.isFinite(existingRemit) ? existingRemit : 0;
    const totalHoldPct = ourHoldPct + existingHoldPct;

    const totalMonthly = totalMonthlyFromPositions + currentOfferMonthly;
    const totalDaily = totalDailyFromPositions + currentOfferDaily;

    return {
      ourHoldPct,
      ourRepay: currentOfferMonthly,
      existingHoldPct,
      existingRepay: totalMonthlyFromPositions,
      totalHoldPct,
      totalRepay: totalMonthly,
      existingDailyRepay: totalDailyFromPositions,
      totalDailyRepay: totalDaily,
      existingActivePositionsCount: getExistingActivePositionsCount(positions),
      recentMonthLeverage: recentMonthLeverageRatio(positions, bankTotalRows),
    };
  }, [
    positions,
    bankTotalRows,
    monthlyPayment,
    daysWeeks,
    frequency,
    avgNetCredit,
    existingRemitProp,
    totalMonthlyProp,
    totalDailyProp,
  ]);

  const {
    ourHoldPct,
    ourRepay,
    existingHoldPct,
    existingRepay,
    totalHoldPct,
    totalRepay,
    existingDailyRepay,
    totalDailyRepay,
    existingActivePositionsCount,
    recentMonthLeverage,
  } = leverage;

  if (!showLeverageTable) return null;

  const money = (n: number) =>
    `$ ${n > 0 ? formatNumberUS(n) : "0.00"}`;

  return (
    <div data-scrub-type className="w-full overflow-hidden rounded-xl border border-slate-400 shadow-sm">
      <div
        className="flex flex-wrap items-center justify-center gap-4 border-slate-400 px-4 py-1.5"
        style={{ backgroundColor: "#aed6ef", backgroundImage: SCRUB_WHITE_VEIL }}
      >
        <span className="text-[16px] font-bold uppercase text-slate-700">
          Leverage
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-[13px]">
          <colgroup>
            <col style={{ width: "18%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "16%" }} />
          </colgroup>
          <tbody>
            <tr className="border-b border-slate-400 bg-white">
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Our Levg / Repay
              </td>
              <td className="whitespace-nowrap border-r border-slate-400 px-3 py-1.5 text-[13px] font-bold" style={{ color: "#0caa46" }}>
                {ourHoldPct > 0 ? `${ourHoldPct.toFixed(2)}` : "0"} % /{" "}
                {money(ourRepay)}
              </td>
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Current Levg / Repay
              </td>
              <td className="whitespace-nowrap border-r border-slate-400 px-3 py-1.5 text-[13px] font-bold text-[#3d5c86]">
                {`${existingHoldPct > 0 ? `${existingHoldPct.toFixed(2)}%` : "0%"} / ${money(existingRepay)}`}
              </td>
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Total Levg / Repay
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-[13px] font-bold" style={{ color: totalHoldPct > 60 ? "#ef4444" : "#ba8d14" }}>
                {`${totalHoldPct > 0 ? `${totalHoldPct.toFixed(2)}%` : "0%"} / ${money(totalRepay)}`}
              </td>
            </tr>
            <tr className="border-b border-slate-400 bg-white">
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Current Monthly / Daily Repay
              </td>
              <td
                colSpan={2}
                className="whitespace-nowrap border-r border-slate-400 px-3 py-1.5 text-[13px] font-bold text-[#3d5c86]"
              >
                {money(existingRepay)} / {money(existingDailyRepay)}
              </td>
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Total Monthly / Daily Repay
              </td>
              <td
                colSpan={2}
                className="whitespace-nowrap px-3 py-1.5 text-[13px] font-bold text-[#3d5c86]"
              >
                {money(totalRepay)} / {money(totalDailyRepay)}
              </td>
            </tr>
            <tr className="border-slate-400 bg-white">
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Existing Active Positions
              </td>
              <td
                colSpan={2}
                className="border-r border-slate-400 px-3 py-1.5 text-center text-[13px] font-bold text-blue-500"
              >
                {existingActivePositionsCount}
              </td>
              <td className="border-r border-slate-400 px-3 py-1.5 font-bold text-[#143c2e]">
                Recent month Leverage
              </td>
              <td
                colSpan={2}
                className="whitespace-nowrap px-3 py-1.5 text-[13px] font-bold text-[#3d5c86]"
              >
                {recentMonthLeverage != null
                  ? `${formatNumberUS(recentMonthLeverage)} %`
                  : "-"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
