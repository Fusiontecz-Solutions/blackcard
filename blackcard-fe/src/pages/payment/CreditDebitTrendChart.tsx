import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MoneyFlowPoint } from "@/types/paymentDashboardTypes";
import { formatCurrencyFull, formatCurrencyInt } from "@/lib/utils";
import MoneyFlowFormatSelect from "./MoneyFlowFormatSelect";

type MoneyFlowView = "monthly" | "weekly" | "monthlyInYear" | "yearly";

type CreditDebitTrendChartProps = {
  moneyFlowView: MoneyFlowView;
  onMoneyFlowViewChange: (view: MoneyFlowView) => void;
  yearOptions: number[];
  selectedYear: number;
  onYearChange: (year: number) => void;
  selectedMonth: number | "all";
  onMonthChange: (month: number | "all") => void;
  moneyFlowSubtitle: string;
  moneyFlowXAxisTitle: string;
  chartMoneyFlowData: MoneyFlowPoint[];
  calendarYear: number;
  calendarMonth: number;
  /** First-time payment rows load — show spinner while session cache / bulk API hydrates. */
  chartDataLoading?: boolean;
};

const BAR_CHART_MARGIN = { top: 8, right: 8, left: 4, bottom: 36 } as const;
const MONEY_FLOW_AXIS_LABEL_STYLE = {
  fill: "#94a3b8",
  fontSize: 12,
  fontWeight: 600,
} as const;
const X_AXIS_TICK_STYLE = { fill: "#64748b", fontSize: 12, fontWeight: 600 } as const;
const Y_AXIS_TICK_STYLE = { fill: "#64748b", fontSize: 11 } as const;
const TOOLTIP_CURSOR = { fill: "rgba(39, 109, 156, 0.08)" } as const;
const MONTHLY_BAR_MIN_POINT_SIZE = 3;

function toSafeMoneyValue(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const normalizedValue = value.replaceAll(",", "").trim();
    if (!normalizedValue) return 0;
    const parsedValue = Number(normalizedValue);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }
  const parsedValue = Number(value ?? 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getMoneyFlowBarMinPointSize(value: unknown, view: MoneyFlowView): number {
  if (view !== "monthly") return 0;
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) && numericValue > 0 ? MONTHLY_BAR_MIN_POINT_SIZE : 0;
}

function formatCompactMoney(value: number): string {
  return formatCurrencyInt(value, { fallback: "$0" });
}

function formatMoneyFlowMonthlyDateLabel(value: string | number, year: number, monthIndex: number): string {
  const day = Number.parseInt(String(value), 10);
  if (!Number.isFinite(day) || day < 1) return String(value);
  return new Date(year, monthIndex, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMoneyFlowMonthlyDayTick(value: string | number): string {
  const day = Number.parseInt(String(value), 10);
  if (!Number.isFinite(day) || day < 1) return String(value);
  return String(day);
}

type MoneyOutflowTooltipProps = {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: unknown; name?: string }>;
  label?: string | number;
  labelFormatter?: (value: string | number) => string;
};

function MoneyOutflowTooltip({ active, payload, label, labelFormatter }: MoneyOutflowTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const sumPaidOutflow = Number(payload.find((item) => item.dataKey === "outflow")?.value ?? 0) || 0;
  const sumRepaidInflow = Number(payload.find((item) => item.dataKey === "inflow")?.value ?? 0) || 0;
  if (sumPaidOutflow <= 0 && sumRepaidInflow <= 0) return null;
  const formattedLabel = label != null ? (labelFormatter ? labelFormatter(label) : String(label)) : "";

  return (
    <div
      className="rounded-[10px] border bg-white p-3 text-xs shadow-[0_8px_30px_rgba(15,23,42,0.12)]"
      style={{ borderColor: "rgba(39,109,156,0.2)" }}
    >
      <p className="mb-2 text-sm font-bold text-slate-900">{formattedLabel}</p>
      <p className="font-semibold text-[#64748B]">Debit amount: {formatCurrencyFull(sumPaidOutflow)}</p>
      <p className="font-semibold text-[var(--brand)]">Credit amount: {formatCurrencyFull(sumRepaidInflow)}</p>
    </div>
  );
}

function moneyOutflowLegendFormatter(value: unknown) {
  return <span className="text-xs font-semibold text-muted-foreground">{String(value)}</span>;
}

export default function CreditDebitTrendChart({
  moneyFlowView,
  onMoneyFlowViewChange,
  yearOptions,
  selectedYear,
  onYearChange,
  selectedMonth,
  onMonthChange,
  moneyFlowSubtitle,
  moneyFlowXAxisTitle,
  chartMoneyFlowData,
  calendarYear,
  calendarMonth,
  chartDataLoading = false,
}: CreditDebitTrendChartProps) {
  const monthOptions = [
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
  ];
  const moneyFlowMonthlyTickFormatter = (value: string | number) =>
    formatMoneyFlowMonthlyDateLabel(value, calendarYear, calendarMonth);
  const moneyFlowMonthlyDayTickFormatter = (value: string | number) => formatMoneyFlowMonthlyDayTick(value);
  const isYearOverYearMode = moneyFlowView === "yearly" && selectedMonth === "all";
  const safeChartMoneyFlowData = useMemo(
    () =>
      chartMoneyFlowData.map((point) => ({
        ...point,
        label: typeof point?.label === "string" || typeof point?.label === "number" ? String(point.label) : "",
        inflow: toSafeMoneyValue(point?.inflow),
        outflow: toSafeMoneyValue(point?.outflow),
      })),
    [chartMoneyFlowData],
  );
  const hasNegativeMoneyFlow = safeChartMoneyFlowData.some((point) => point.inflow < 0 || point.outflow < 0);

  return (
    <div className="mt-2 rounded-2xl border border-border/70 bg-card/90 p-5 shadow-lg ring-1 ring-inset ring-border/40 dark:border-white/10 dark:bg-white/[0.03] dark:ring-white/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Credit vs debit trend</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isYearOverYearMode ? (
            <button
              type="button"
              className="h-9 min-w-[110px] cursor-default rounded-md border border-border bg-muted/50 px-3 text-sm text-muted-foreground"
              aria-label="Year scope"
              title="Year over year compares all available years"
            >
              All years
            </button>
          ) : (
            <select
              className="h-9 min-w-[92px] rounded-md border border-border bg-background px-2 text-sm"
              value={selectedYear}
              onChange={(e) => onYearChange(Number(e.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          )}
          <select
            className="h-9 min-w-[120px] rounded-md border border-border bg-background px-2 text-sm"
            value={selectedMonth === "all" ? "all" : String(selectedMonth)}
            onChange={(e) =>
              onMonthChange(e.target.value === "all" ? "all" : Number.parseInt(e.target.value, 10))
            }
          >
            <option value="all">All months</option>
            {monthOptions.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </select>
          <MoneyFlowFormatSelect
            moneyFlowView={moneyFlowView}
            selectedMonth={selectedMonth}
            onMoneyFlowViewChange={onMoneyFlowViewChange}
            className="h-9 min-w-[170px] rounded-md border border-border bg-background px-2 text-sm"
          />
        </div>
      </div>
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{moneyFlowSubtitle}</p>

      <div
        className="relative h-[320px] w-full"
        aria-busy={chartDataLoading}
        aria-label={chartDataLoading ? "Loading chart data" : undefined}
      >
        {chartDataLoading ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-card/85 backdrop-blur-[1px]">
            <Loader2 className="size-8 animate-spin text-[var(--brand)]" aria-hidden />
            <span className="text-xs font-medium text-muted-foreground">Loading transactions…</span>
          </div>
        ) : null}
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={safeChartMoneyFlowData} barCategoryGap={0} barGap={4} margin={BAR_CHART_MARGIN}>
            <CartesianGrid strokeDasharray="4 4" stroke="rgba(148, 163, 184, 0.2)" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "#94a3b8" }}
              interval={0}
              tickFormatter={moneyFlowView === "monthly" ? moneyFlowMonthlyDayTickFormatter : undefined}
              minTickGap={0}
              tick={X_AXIS_TICK_STYLE}
              label={{
                value: moneyFlowXAxisTitle,
                position: "bottom",
                offset: 2,
                style: MONEY_FLOW_AXIS_LABEL_STYLE,
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCompactMoney}
              width={88}
              scale={moneyFlowView === "monthly" && !hasNegativeMoneyFlow ? "sqrt" : "auto"}
              tick={Y_AXIS_TICK_STYLE}
            />
            <Tooltip
              cursor={TOOLTIP_CURSOR}
              content={
                <MoneyOutflowTooltip
                  labelFormatter={moneyFlowView === "monthly" ? moneyFlowMonthlyTickFormatter : undefined}
                />
              }
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="square"
              iconSize={10}
              formatter={moneyOutflowLegendFormatter}
            />
            <Bar
              dataKey="outflow"
              name="Debit amount"
              fill="#64748B"
              barSize={moneyFlowView === "monthly" ? 8 : 18}
              minPointSize={(value) => getMoneyFlowBarMinPointSize(value, moneyFlowView)}
              isAnimationActive={false}
            >
              {safeChartMoneyFlowData.map((entry) => (
                <Cell key={`out-${entry.label}`} fill="#64748B" />
              ))}
            </Bar>
            <Bar
              dataKey="inflow"
              name="Credit amount"
              fill="var(--brand)"
              barSize={moneyFlowView === "monthly" ? 8 : 18}
              minPointSize={(value) => getMoneyFlowBarMinPointSize(value, moneyFlowView)}
              isAnimationActive={false}
            >
              {safeChartMoneyFlowData.map((entry) => (
                <Cell key={`in-${entry.label}`} fill="var(--brand)" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
