import { useMemo, memo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { formatNumberUS, parseNumberUS } from "@/lib/utils";

const BAR_CHART_HEIGHT = 224;
const NET_CREDIT_BAR_COLOR = "#22c55e";
const TOTAL_CREDIT_BAR_COLOR = "#15803d";

const MONTH_ORDER = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export type CreditsTrendBankRow = {
  month: string;
  totalCredit: number;
  fundingAmt: number;
  transfers: number;
  netCredit: number;
};

function monthNameToIndex(name: string): number {
  if (!name) return -1;
  const n = String(name).trim().toLowerCase();
  const idx = MONTH_ORDER.indexOf(n);
  if (idx >= 0) return idx;
  const short = n.slice(0, 3);
  for (let i = 0; i < MONTH_ORDER.length; i++) {
    if (MONTH_ORDER[i].startsWith(short)) return i;
  }
  return -1;
}

function displayLabelFromMonth(monthRaw: string): string {
  const raw = String(monthRaw || "").trim();
  const isMtd = raw.toLowerCase().includes("mtd");
  const withoutMtd = raw.replace(/mtd/gi, " ").replace(/\s+/g, " ").trim();
  const firstWord = withoutMtd.split(/\s+/)[0] || "";
  const idx = monthNameToIndex(firstWord);
  const yearMatch = raw.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : "";
  if (idx >= 0) {
    const short = SHORT_MONTHS[idx];
    if (isMtd) return year ? `${short} ${year} MTD` : `${short} MTD`;
    return year ? `${short} ${year}` : short;
  }
  return raw;
}

function periodKeyFromMonthLabel(monthRaw: string): string {
  const raw = String(monthRaw || "").trim();
  const lower = raw.toLowerCase();
  const isMtd = lower.includes("mtd");
  const withoutMtd = raw.replace(/mtd/gi, " ").replace(/\s+/g, " ").trim();
  const firstWord = withoutMtd.split(/\s+/)[0] || "";
  const idx = monthNameToIndex(firstWord);
  const yearMatch = raw.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : "";
  if (idx >= 0) return `${MONTH_ORDER[idx]}|${year}|${isMtd ? "mtd" : "full"}`;
  return lower;
}

function yyyyMmFromLabel(monthRaw: string): string {
  const raw = String(monthRaw || "").trim();
  const yearMatch = raw.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : "";
  const withoutMtd = raw.replace(/mtd/gi, " ").replace(/\s+/g, " ").trim();
  const firstWord = withoutMtd.split(/\s+/)[0] || "";
  const idx = monthNameToIndex(firstWord);
  if (year && idx >= 0) {
    return `${year}-${String(idx + 1).padStart(2, "0")}`;
  }
  return "";
}

function buildTrendData(bankTables: CreditsTrendBankRow[][]) {
  const byKey = new Map<
    string,
    {
      key: string;
      label: string;
      netCredit: number;
      totalCredit: number;
      yyyyMm: string;
      isMtd: boolean;
    }
  >();

  for (const table of bankTables) {
    for (const row of table) {
      const monthRaw = String(row.month || "").trim();
      if (!monthRaw) continue;
      const lower = monthRaw.toLowerCase();
      if (lower === "average" || lower === "total" || lower.includes("average")) {
        continue;
      }
      const key = periodKeyFromMonthLabel(monthRaw);
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          label: displayLabelFromMonth(monthRaw),
          netCredit: 0,
          totalCredit: 0,
          yyyyMm: yyyyMmFromLabel(monthRaw),
          isMtd: lower.includes("mtd"),
        });
      }
      const entry = byKey.get(key)!;
      const net = Number.isFinite(row.netCredit)
        ? row.netCredit
        : Number(
            (row.totalCredit || 0) - (row.fundingAmt || 0) - (row.transfers || 0),
          );
      entry.netCredit += Number.isFinite(net) ? net : 0;
      entry.totalCredit += Number.isFinite(row.totalCredit) ? row.totalCredit : 0;
    }
  }

  return Array.from(byKey.values())
    .filter((d) => d.netCredit !== 0 || d.totalCredit !== 0)
    .sort((a, b) => {
      if (a.yyyyMm && b.yyyyMm && a.yyyyMm !== b.yyyyMm) {
        return a.yyyyMm < b.yyyyMm ? -1 : 1;
      }
      if (a.yyyyMm && !b.yyyyMm) return -1;
      if (!a.yyyyMm && b.yyyyMm) return 1;
      if (a.isMtd !== b.isMtd) return a.isMtd ? 1 : -1;
      return 0;
    })
    .map(({ label, netCredit, totalCredit }) => ({
      label,
      netCredit,
      totalCredit,
    }));
}

function formatChartCurrency(value: unknown): string {
  const n = typeof value === "number" ? value : parseNumberUS(value);
  if (!Number.isFinite(n)) return "—";
  return `$ ${formatNumberUS(n)}`;
}

function CreditTrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string; value?: number; payload?: Record<string, number> }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const net =
    payload.find((p) => p.dataKey === "netCredit")?.value ?? row.netCredit;
  const credit =
    payload.find((p) => p.dataKey === "totalCredit")?.value ?? row.totalCredit;
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: "8px 10px",
        fontSize: 12,
        color: "#0f172a",
        boxShadow: "0 4px 12px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div>Net Credit: {formatChartCurrency(net)}</div>
      <div>Total Credit: {formatChartCurrency(credit)}</div>
    </div>
  );
}

export type CreditsTrendChartProps = {
  bankTables: CreditsTrendBankRow[][];
};

/**
 * MCA WD-style Credits Trend grouped bar chart (Net Credit vs Total Credit).
 */
export const CreditsTrendChart = memo(function CreditsTrendChart({
  bankTables,
}: CreditsTrendChartProps) {
  const data = useMemo(() => buildTrendData(bankTables), [bankTables]);

  if (!data.length) return null;

  return (
    <div className="chart-capture-area" style={{ width: "100%", margin: "4px 0 8px" }}>
      <div
        className="chart-cell"
        style={{
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
          padding: 14,
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          backgroundColor: "#ffffff",
          boxSizing: "border-box",
          display: "block",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            fontSize: 14,
            marginBottom: 12,
            textAlign: "left",
            color: "#0f172a",
          }}
        >
          Credits Trend
        </div>
        <div
          data-chart-kind="bar"
          style={{
            width: "100%",
            height: BAR_CHART_HEIGHT,
            minWidth: 0,
            overflow: "visible",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 12,
              fontSize: 11,
              lineHeight: "14px",
              color: "#475569",
              marginBottom: 4,
            }}
          >
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: NET_CREDIT_BAR_COLOR,
                  marginRight: 5,
                  verticalAlign: "middle",
                }}
              />
              Net Credit
            </span>
            <span>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: TOTAL_CREDIT_BAR_COLOR,
                  marginRight: 5,
                  verticalAlign: "middle",
                }}
              />
              Total Credit
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                margin={{ top: 8, right: 8, left: 10, bottom: 4 }}
                barGap={3}
                barCategoryGap="28%"
                barSize={22}
              >
                <defs>
                  <linearGradient id="ctNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={NET_CREDIT_BAR_COLOR} stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0.9} />
                  </linearGradient>
                  <linearGradient id="ctTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={TOTAL_CREDIT_BAR_COLOR} stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity={0.9} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine
                  tickLine={false}
                />
                <YAxis
                  width={84}
                  tickFormatter={(v) => formatNumberUS(v)}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine
                  tickLine={false}
                />
                <Tooltip content={<CreditTrendTooltip />} />
                <Bar
                  dataKey="netCredit"
                  name="Net Credit"
                  fill="url(#ctNet)"
                  stroke={NET_CREDIT_BAR_COLOR}
                  strokeWidth={0.75}
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="totalCredit"
                  name="Total Credit"
                  fill="url(#ctTotal)"
                  stroke={TOTAL_CREDIT_BAR_COLOR}
                  strokeWidth={0.75}
                  isAnimationActive={false}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CreditsTrendChart;
