"use client";

import { useMemo, memo } from "react";
import { toPng } from "html-to-image";
import {
  ResponsiveContainer,
  CartesianGrid, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
} from "recharts";
import { formatNumberUS } from "../utils/dateUtils";
import { parseMonthLabelToYYYYMM } from "../utils/calculateMonthlyNetCredit";

const MONTH_ORDER = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseNum(str) {
  if (str == null || str === "") return NaN;
  if (typeof str === "number") return Number.isFinite(str) ? str : NaN;
  if (typeof str === "object") {
    if (str.$numberDecimal != null) return parseNum(str.$numberDecimal);
    if (typeof str.toJSON === "function") {
      try {
        return parseNum(str.toJSON());
      } catch {
        /* ignore */
      }
    }
  }
  const asText = String(str).trim();
  if (!asText || asText === "[object Object]") return NaN;
  return Number(asText.replace(/[^0-9.-]+/g, ""));
}

function monthNameToIndex(name) {
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

function isSummaryMonthRow(row) {
  const t = String(row?.month ?? "").trim().toLowerCase();
  if (!t) return true;
  if (t === "average" || t === "total") return true;
  if (t.includes("average")) return true;
  if (t === "bank total" || t.startsWith("total ")) return true;
  return false;
}

function periodKeyFromMonthLabel(monthRaw) {
  const raw = String(monthRaw || "").trim();
  const lower = raw.toLowerCase();
  const isMtd = lower.includes("mtd");
  const withoutMtd = raw.replace(/mtd/ig, " ").replace(/\s+/g, " ").trim();
  const firstWord = withoutMtd.split(/\s+/)[0] || "";
  const idx = monthNameToIndex(firstWord);
  const yearMatch = raw.match(/\b(20\d{2}|19\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : "";
  if (idx >= 0) return `${MONTH_ORDER[idx]}|${year}|${isMtd ? "mtd" : "full"}`;
  return lower;
}

function displayLabelFromMonth(monthRaw) {
  const raw = String(monthRaw || "").trim();
  const isMtd = raw.toLowerCase().includes("mtd");
  const withoutMtd = raw.replace(/mtd/ig, " ").replace(/\s+/g, " ").trim();
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

function isBankAnalysisDataRow(row) {
  if (!row || typeof row !== "object") return false;
  if (isSummaryMonthRow(row)) return false;
  const monthRaw = row.month != null ? String(row.month).trim() : "";
  if (!monthRaw) return false;
  if (Object.prototype.hasOwnProperty.call(row, "lender") && !Object.prototype.hasOwnProperty.call(row, "totalCredits")) {
    return false;
  }
  return true;
}

function fundingAmtFromBankRow(row, bankIndex, allocByBankAndMonth, privateRoleFundingLoanRule) {
  const stored = parseNum(row?.loan);
  const baseSafe = Number.isNaN(stored) ? 0 : stored;
  if (!allocByBankAndMonth || typeof allocByBankAndMonth !== "object") return baseSafe;
  const perBank = allocByBankAndMonth[bankIndex];
  if (!perBank || typeof perBank !== "object") return baseSafe;
  const label = row?.month != null ? String(row.month).trim() : "";
  if (!label || !Object.prototype.hasOwnProperty.call(perBank, label)) return baseSafe;
  const extraRaw = perBank[label];
  const extraSafe = Array.isArray(extraRaw)
    ? extraRaw.reduce((sum, n) => sum + (Number(n) || 0), 0)
    : (Number.isNaN(parseNum(extraRaw)) ? 0 : parseNum(extraRaw));
  if (privateRoleFundingLoanRule) return Math.max(baseSafe, extraSafe);
  return baseSafe > 0 ? baseSafe : extraSafe > 0 ? extraSafe : baseSafe;
}

/**
 * Same Net Credit value as the Bank Analysis table cell:
 * Total Credit − (Funding Amt + Transfers + Unverified Deposit + Other).
 * Never reads amountFunded, positions, or stored row.netCredit (which can still
 * be the pre-funding total).
 */
function bankAnalysisTableNetCredit(row, bankIndex, allocByBankAndMonth, privateRoleFundingLoanRule) {
  const totalCredits = parseNum(row?.totalCredits);
  if (Number.isNaN(totalCredits)) return NaN;
  const loan = fundingAmtFromBankRow(row, bankIndex, allocByBankAndMonth, privateRoleFundingLoanRule);
  const transfer = Number.isNaN(parseNum(row?.transfer)) ? 0 : parseNum(row.transfer);
  const deposite = Number.isNaN(parseNum(row?.deposite)) ? 0 : parseNum(row.deposite);
  const other = Number.isNaN(parseNum(row?.other)) ? 0 : parseNum(row.other);
  return totalCredits - (loan + transfer + deposite + other);
}

function accumulateMonthValue(byMonth, monthRaw, amount) {
  if (Number.isNaN(amount)) return;
  const key = periodKeyFromMonthLabel(monthRaw);
  if (!byMonth.has(key)) {
    byMonth.set(key, {
      key,
      label: displayLabelFromMonth(monthRaw),
      value: 0,
      yyyyMm: parseMonthLabelToYYYYMM(monthRaw),
      isMtd: String(monthRaw).toLowerCase().includes("mtd"),
    });
  }
  byMonth.get(key).value += amount;
}

function seriesFromMonthMap(byMonth) {
  return Array.from(byMonth.values())
    .filter((d) => typeof d.value === "number" && !Number.isNaN(d.value))
    .sort(compareChartPeriodsChronologically)
    .map(({ key, label, value, yyyyMm, isMtd }) => ({
      key,
      label,
      value,
      yyyyMm,
      isMtd,
    }));
}

/** Sum Bank Analysis Net Credit across all bank tables for each real month/period. */
export function totalNetCreditByMonth(
  bankTables = [],
  allocByBankAndMonth = null,
  privateRoleFundingLoanRule = false
) {
  const byMonth = new Map();
  (Array.isArray(bankTables) ? bankTables : []).forEach((table, bankIndex) => {
    (Array.isArray(table) ? table : []).forEach((row) => {
      if (!isBankAnalysisDataRow(row)) return;
      const monthRaw = String(row.month).trim();
      const net = bankAnalysisTableNetCredit(
        row,
        bankIndex,
        allocByBankAndMonth,
        privateRoleFundingLoanRule
      );
      accumulateMonthValue(byMonth, monthRaw, net);
    });
  });
  return seriesFromMonthMap(byMonth);
}

/**
 * Sum Bank Analysis / Bank Total "Total Credit" (`row.totalCredits`) across all
 * bank tables for each real month/period. Never reads positions, amount funded,
 * net credit, or other numeric fallbacks.
 */
export function totalCreditByMonth(bankTables = []) {
  const byMonth = new Map();
  (Array.isArray(bankTables) ? bankTables : []).forEach((table) => {
    (Array.isArray(table) ? table : []).forEach((row) => {
      if (!isBankAnalysisDataRow(row)) return;
      const monthRaw = String(row.month).trim();
      accumulateMonthValue(byMonth, monthRaw, parseNum(row?.totalCredits));
    });
  });
  return seriesFromMonthMap(byMonth);
}

/** Sum Bank Analysis Funding Amt (`row.loan`) across all bank tables by month. */
export function totalFundingByMonth(
  bankTables = [],
  allocByBankAndMonth = null,
  privateRoleFundingLoanRule = false
) {
  const byMonth = new Map();
  (Array.isArray(bankTables) ? bankTables : []).forEach((table, bankIndex) => {
    (Array.isArray(table) ? table : []).forEach((row) => {
      if (!isBankAnalysisDataRow(row)) return;
      const monthRaw = String(row.month).trim();
      const loan = fundingAmtFromBankRow(
        row,
        bankIndex,
        allocByBankAndMonth,
        privateRoleFundingLoanRule
      );
      accumulateMonthValue(byMonth, monthRaw, Number.isNaN(loan) ? 0 : loan);
    });
  });
  return seriesFromMonthMap(byMonth);
}

/**
 * Sum Bank Analysis "Transfers & other deductions" across all bank tables by
 * month. That column is stored in `row.deposite` / `row.deposit` (see Bank
 * Analysis table: "`deposit` is Transfers, `other` is Unverified Deposit");
 * `row.transfer` is always 0 here.
 */
export function totalTransfersByMonth(bankTables = []) {
  const byMonth = new Map();
  (Array.isArray(bankTables) ? bankTables : []).forEach((table) => {
    (Array.isArray(table) ? table : []).forEach((row) => {
      if (!isBankAnalysisDataRow(row)) return;
      const monthRaw = String(row.month).trim();
      const direct = parseNum(row?.transfer);
      const deposite = parseNum(row?.deposite);
      const deposit = parseNum(row?.deposit);
      const transfers =
        (Number.isNaN(direct) ? 0 : direct) +
        (Number.isNaN(deposite) ? 0 : deposite || (Number.isNaN(deposit) ? 0 : deposit));
      accumulateMonthValue(byMonth, monthRaw, transfers);
    });
  });
  return seriesFromMonthMap(byMonth);
}

/** Sum Bank Analysis "NSF / Negative days" (`row.nsfNegDays`) by month. */
export function totalNsfDaysByMonth(bankTables = []) {
  const byMonth = new Map();
  (Array.isArray(bankTables) ? bankTables : []).forEach((table) => {
    (Array.isArray(table) ? table : []).forEach((row) => {
      if (!isBankAnalysisDataRow(row)) return;
      const monthRaw = String(row.month).trim();
      const n = parseNum(row?.nsfNegDays);
      accumulateMonthValue(byMonth, monthRaw, Number.isNaN(n) ? 0 : n);
    });
  });
  return seriesFromMonthMap(byMonth);
}

/** Sum Bank Analysis "Low balance days" (`row.lowBlcDays`) by month. */
export function totalLowBalanceDaysByMonth(bankTables = []) {
  const byMonth = new Map();
  (Array.isArray(bankTables) ? bankTables : []).forEach((table) => {
    (Array.isArray(table) ? table : []).forEach((row) => {
      if (!isBankAnalysisDataRow(row)) return;
      const monthRaw = String(row.month).trim();
      const n = parseNum(row?.lowBlcDays ?? row?.lowNegDays);
      accumulateMonthValue(byMonth, monthRaw, Number.isNaN(n) ? 0 : n);
    });
  });
  return seriesFromMonthMap(byMonth);
}

function mergeCreditTrendSeries(
  netRows = [],
  creditRows = [],
  fundingRows = [],
  transferRows = [],
  nsfRows = [],
  lowBlcRows = []
) {
  const byKey = new Map();
  const ensure = (row) => {
    const key = row?.key || row?.label;
    if (!key) return null;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: row.label,
        netCredit: null,
        totalCredit: null,
        fundingAmt: null,
        transfers: null,
        nsfNegDays: null,
        lowBlcDays: null,
        yyyyMm: row.yyyyMm,
        isMtd: row.isMtd,
      });
    }
    return byKey.get(key);
  };
  const apply = (rows, field) => {
    rows.forEach((row) => {
      const entry = ensure(row);
      if (!entry) return;
      if (typeof row.value === "number" && !Number.isNaN(row.value)) {
        entry[field] = row.value;
      }
    });
  };
  apply(netRows, "netCredit");
  apply(creditRows, "totalCredit");
  apply(fundingRows, "fundingAmt");
  apply(transferRows, "transfers");
  apply(nsfRows, "nsfNegDays");
  apply(lowBlcRows, "lowBlcDays");
  return Array.from(byKey.values())
    .filter(
      (d) =>
        d.netCredit != null ||
        d.totalCredit != null ||
        d.fundingAmt != null ||
        d.transfers != null ||
        d.nsfNegDays != null ||
        d.lowBlcDays != null
    )
    .sort(compareChartPeriodsChronologically)
    .map(
      ({ label, netCredit, totalCredit, fundingAmt, transfers, nsfNegDays, lowBlcDays }) => ({
        label,
        netCredit,
        totalCredit,
        fundingAmt,
        transfers,
        nsfNegDays,
        lowBlcDays,
      })
    );
}

function compareChartPeriodsChronologically(a, b) {
  const ka = a?.yyyyMm || "";
  const kb = b?.yyyyMm || "";
  if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
  if (ka && !kb) return -1;
  if (!ka && kb) return 1;
  const aMtd = a?.isMtd ? 1 : 0;
  const bMtd = b?.isMtd ? 1 : 0;
  if (aMtd !== bMtd) return aMtd - bMtd;
  return 0;
}

const BAR_CHART_HEIGHT = 224;
const BAR_COPY_PIXEL_RATIO = 2;
const NET_CREDIT_BAR_COLOR = "#9ce0ab";
const TOTAL_CREDIT_BAR_COLOR = "#0d5c2c";
const FUNDING_BAR_COLOR = "#dc2626";
const TRANSFERS_BAR_COLOR = "#f0a3a8";
const NSF_DAYS_LINE_COLOR = "#f59e0b";

function formatChartCurrency(value) {
  if (value == null || (typeof value === "number" && Number.isNaN(value))) return "—";
  return `$ ${formatNumberUS(value)}`;
}

function CreditTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  const pick = (key, fallback) => payload.find((p) => p.dataKey === key)?.value ?? fallback;
  // Same rows, swatches and layout as the Wd preview's tooltip.
  const rows = [
    { name: "Net Credit", color: NET_CREDIT_BAR_COLOR, value: pick("netCredit", row.netCredit) },
    { name: "Total Credit", color: TOTAL_CREDIT_BAR_COLOR, value: pick("totalCredit", row.totalCredit) },
    { name: "Funding", color: FUNDING_BAR_COLOR, value: pick("fundingAmt", row.fundingAmt) },
    { name: "Transfers", color: TRANSFERS_BAR_COLOR, value: pick("transfers", row.transfers) },
    // NSF is a day count, not money — shown as a plain number.
    { name: "NSF / Neg Days", color: NSF_DAYS_LINE_COLOR, value: pick("nsfNegDays", row.nsfNegDays), isCount: true },
  ];
  return (
    <div
      style={{
        background: "#ffffff",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        padding: "9px 11px",
        fontSize: 12,
        color: "#0f172a",
        boxShadow: "0 8px 20px rgba(15, 23, 42, 0.12)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: r.color, display: "inline-block" }} />
          <span style={{ color: "#64748b" }}>{r.name}:</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {r.isCount
              ? (r.value == null || Number.isNaN(r.value) ? "—" : formatNumberUS(r.value))
              : formatChartCurrency(r.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Copy → Gmail only. Captures the live Total Net Credit Trend bar as a 2x PNG.
 * Do not call from the PDF path.
 */
export async function captureTotalNetCreditBarChartForCopy(container) {
  if (!container || typeof window === "undefined") return null;
  const liveNode = container.querySelector("[data-chart-kind='bar']");
  if (!liveNode) return null;

  const rect = liveNode.getBoundingClientRect();
  const liveWidth = Math.max(1, Math.round(rect.width));
  const liveHeight = Math.max(1, Math.round(rect.height));
  if (rect.width < 2 || rect.height < 2) return null;

  const area = container.querySelector(".chart-capture-area");
  const card = liveNode.closest(".chart-cell");
  const areaRect = area?.getBoundingClientRect?.();
  const cardRect = card?.getBoundingClientRect?.();

  const svgs = [...liveNode.querySelectorAll("svg")];
  const backups = svgs.map((svg) => {
    const svgRect = svg.getBoundingClientRect();
    const backup = {
      width: svg.getAttribute("width"),
      height: svg.getAttribute("height"),
      styleWidth: svg.style.width,
      styleHeight: svg.style.height,
    };
    const sw = Math.max(1, Math.round(svgRect.width || liveWidth));
    const sh = Math.max(1, Math.round(svgRect.height || liveHeight));
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(sw));
    svg.setAttribute("height", String(sh));
    svg.style.width = `${sw}px`;
    svg.style.height = `${sh}px`;
    return backup;
  });

  try {
    // Omit backgroundColor so the PNG keeps alpha; Gmail wrappers are
    // transparent and the watermark must show through the plot area.
    const png = await toPng(liveNode, {
      pixelRatio: BAR_COPY_PIXEL_RATIO,
      cacheBust: true,
      width: liveWidth,
      height: liveHeight,
      canvasWidth: liveWidth * BAR_COPY_PIXEL_RATIO,
      canvasHeight: liveHeight * BAR_COPY_PIXEL_RATIO,
      style: {
        width: `${liveWidth}px`,
        height: `${liveHeight}px`,
        transform: "none",
        background: "transparent",
        backgroundColor: "transparent",
      },
    });
    if (!png) return null;

    return {
      png,
      kind: "bar",
      liveWidth,
      liveHeight,
      pngWidth: liveWidth * BAR_COPY_PIXEL_RATIO,
      pngHeight: liveHeight * BAR_COPY_PIXEL_RATIO,
      displayedWidth: liveWidth,
      displayedHeight: liveHeight,
      width: liveWidth,
      height: liveHeight,
      cardWidth: cardRect ? Math.max(1, Math.round(cardRect.width)) : liveWidth,
      cardHeight: cardRect ? Math.max(1, Math.round(cardRect.height)) : liveHeight,
      rowWidth: areaRect ? Math.max(1, Math.round(areaRect.width)) : liveWidth,
    };
  } catch {
    return null;
  } finally {
    svgs.forEach((svg, i) => {
      const backup = backups[i];
      if (!backup) return;
      if (backup.width == null) svg.removeAttribute("width");
      else svg.setAttribute("width", backup.width);
      if (backup.height == null) svg.removeAttribute("height");
      else svg.setAttribute("height", backup.height);
      svg.style.width = backup.styleWidth;
      svg.style.height = backup.styleHeight;
    });
  }
}

/**
 * Copy → Gmail only. Replaces [data-chart-kind="bar"] with a PNG.
 * Mobile default is width:100%; desktop restores liveWidth via data-gmail-dw.
 * Live Preview is unchanged.
 */
export function replaceCopiedBarChartWithFixedPng(clone, capture) {
  if (!clone || !capture?.png) return;
  const node = clone.querySelector("[data-chart-kind='bar']");
  if (!node) return;

  const W = Math.max(1, Math.round(Number(capture.liveWidth) || Number(capture.width) || 0));
  const H = Math.max(1, Math.round(Number(capture.liveHeight) || Number(capture.height) || 0));
  const img = document.createElement("img");
  img.setAttribute("src", capture.png);
  img.setAttribute("alt", "Total Net Credit Trend");
  img.setAttribute("class", W > 0 ? `gmail-copy-chart gmail-dw-${W}` : "gmail-copy-chart");
  if (W > 0) img.setAttribute("data-gmail-dw", String(W));
  img.setAttribute("width", "100%");
  img.setAttribute("height", String(H));
  img.setAttribute(
    "style",
    "display:block;width:100%;max-width:100%;height:auto;border:0;"
  );
  node.innerHTML = "";
  node.appendChild(img);

  if (typeof console !== "undefined") {
    console.info("[bar-copy]", {
      liveWidth: capture.liveWidth,
      liveHeight: capture.liveHeight,
      pngWidth: capture.pngWidth,
      pngHeight: capture.pngHeight,
      displayedWidth: W,
      displayedHeight: H,
    });
  }
}

const cardStyle = {
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  padding: "14px",
  border: "1px solid #d7dee8",
  borderRadius: "14px",
  backgroundColor: "#ffffff",
  boxSizing: "border-box",
  display: "block",
};

const titleStyle = {
  fontWeight: "bold",
  fontSize: "14px",
  marginBottom: "12px",
  textAlign: "left",
  color: "#0f172a",
};

const legendRowStyle = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 12,
  flex: "0 0 auto",
  fontSize: 11,
  lineHeight: "14px",
  color: "#475569",
  marginBottom: 4,
};

const legendSwatchStyle = (color) => ({
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: "50%",
  backgroundColor: color,
  marginRight: 5,
  verticalAlign: "middle",
});

const legendLineStyle = (color) => ({
  display: "inline-block",
  width: 12,
  height: 0,
  borderTop: `2px solid ${color}`,
  marginRight: 5,
  verticalAlign: "middle",
});

const MonthlyBarChart = memo(function MonthlyBarChart({ data }) {
  if (!data || data.length === 0) return null;

  return (
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
      <style>{`
        [data-chart-kind="bar"] .recharts-wrapper,
        [data-chart-kind="bar"] .recharts-surface {
          overflow: visible !important;
        }
      `}</style>
      <div style={legendRowStyle}>
        <span>
          <span style={legendSwatchStyle(NET_CREDIT_BAR_COLOR)} />
          Net Credit
        </span>
        <span>
          <span style={legendSwatchStyle(TOTAL_CREDIT_BAR_COLOR)} />
          Total Credit
        </span>
        <span>
          <span style={legendSwatchStyle(FUNDING_BAR_COLOR)} />
          Funding
        </span>
        <span>
          <span style={legendSwatchStyle(TRANSFERS_BAR_COLOR)} />
          Transfers
        </span>
        <span>
          <span style={legendLineStyle(NSF_DAYS_LINE_COLOR)} />
          NSF / Neg Days
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 8, right: 8, left: 10, bottom: 4 }}
            barGap={2}
            barCategoryGap="12%"
            barSize={30}
          >
            <defs>
              <linearGradient id="mcaCtNet" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={NET_CREDIT_BAR_COLOR} stopOpacity={1} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={1} />
              </linearGradient>
              <linearGradient id="mcaCtTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TOTAL_CREDIT_BAR_COLOR} stopOpacity={1} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={1} />
              </linearGradient>
              <linearGradient id="mcaCtFunding" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={FUNDING_BAR_COLOR} stopOpacity={1} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={1} />
              </linearGradient>
              <linearGradient id="mcaCtTransfers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={TRANSFERS_BAR_COLOR} stopOpacity={1} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine tickLine={false} />
            <YAxis
              yAxisId="left"
              width={84}
              tickFormatter={formatNumberUS}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine
              tickLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={38}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine
              tickLine={false}
            />
            <Tooltip content={<CreditTrendTooltip />} />
            <Bar
              yAxisId="left"
              dataKey="netCredit"
              name="Total Net Credit"
              fill="url(#mcaCtNet)"
              stroke={NET_CREDIT_BAR_COLOR}
              strokeWidth={1}
              isAnimationActive={false}
              radius={[8, 8, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="totalCredit"
              name="Total Credit"
              fill="url(#mcaCtTotal)"
              stroke={TOTAL_CREDIT_BAR_COLOR}
              strokeWidth={1}
              isAnimationActive={false}
              radius={[8, 8, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="fundingAmt"
              name="Funding"
              fill="url(#mcaCtFunding)"
              stroke={FUNDING_BAR_COLOR}
              strokeWidth={1}
              isAnimationActive={false}
              radius={[8, 8, 0, 0]}
            />
            <Bar
              yAxisId="left"
              dataKey="transfers"
              name="Transfers"
              fill="url(#mcaCtTransfers)"
              stroke={TRANSFERS_BAR_COLOR}
              strokeWidth={1}
              isAnimationActive={false}
              radius={[8, 8, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="nsfNegDays"
              name="NSF / Neg Days"
              stroke={NSF_DAYS_LINE_COLOR}
              strokeWidth={2.5}
              dot={{ r: 3, fill: NSF_DAYS_LINE_COLOR, stroke: "#ffffff", strokeWidth: 1 }}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

function copiedChartImgHtml(imgData) {
  const png = imgData?.png || "";
  const w = Math.max(1, Math.round(Number(imgData?.width) || 0));
  const h = Math.max(1, Math.round(Number(imgData?.height) || 0));
  const dwClass = w > 0 ? ` gmail-dw-${w}` : "";
  const dwAttr = w > 0 ? ` data-gmail-dw="${w}"` : "";
  return (
    `<img class="gmail-copy-chart${dwClass}"${dwAttr} src="${png}" alt="Total Net Credit Trend" width="100%" height="${h}" ` +
    `style="display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`
  );
}

function stampCopiedChartNode(node, imgData) {
  if (!node || !imgData) return;
  const w = Math.max(1, Math.round(Number(imgData.width) || 0));
  const h = Math.max(1, Math.round(Number(imgData.height) || 0));
  node.innerHTML = copiedChartImgHtml(imgData);
  node.setAttribute(
    "style",
    `display:block;width:100%;max-width:100%;min-width:0;height:${h}px;overflow:visible;`
  );
  node.setAttribute("data-copy-chart-w", String(w));
  node.setAttribute("data-copy-chart-h", String(h));
}

function keepCopiedChartImage(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("[data-chart-kind]").forEach((node) => {
    const h = node.getAttribute("data-copy-chart-h");
    node.setAttribute(
      "style",
      `display:block;width:100%;max-width:100%;min-width:0;${h ? `height:${h}px;` : ""}overflow:visible;`
    );
  });
  root.querySelectorAll("img").forEach((img) => {
    const w = parseInt(img.getAttribute("width"), 10);
    const h = parseInt(img.getAttribute("height"), 10);
    const widthPx = Number.isFinite(w) && w > 0 ? w : 0;
    const heightPx = Number.isFinite(h) && h > 0 ? h : 0;
    const sizeStyle =
      widthPx && heightPx
        ? `width:${widthPx}px;height:${heightPx}px;max-width:100%;`
        : "width:100%;max-width:100%;height:auto;";
    img.setAttribute(
      "style",
      `display:block;${sizeStyle}border:0;outline:none;text-decoration:none;`
    );
  });
}

export function replaceCopiedChartWrappers(clone, chartImages) {
  if (!clone || !Array.isArray(chartImages) || chartImages.length === 0) return;
  const unused = [...chartImages];

  clone.querySelectorAll("[data-chart-kind='bar']").forEach((node) => {
    const imgData = unused.find((img) => img?.kind === "bar") || unused[0];
    if (!imgData) return;
    const idx = unused.indexOf(imgData);
    if (idx >= 0) unused.splice(idx, 1);
    stampCopiedChartNode(node, imgData);
  });

  clone.querySelectorAll(".recharts-wrapper").forEach((wrapper) => {
    if (wrapper.querySelector("img[src]") || unused.length === 0) return;
    stampCopiedChartNode(wrapper, unused.shift());
  });

  if (typeof console !== "undefined") {
    const barImg = clone.querySelector("[data-chart-kind='bar'] img, img[alt='Total Net Credit Trend']");
    console.info("[copy-charts] after replaceCopiedChartWrappers", {
      barImgPresent: Boolean(barImg),
      barSrcLen: barImg?.getAttribute("src")?.length || 0,
      barWidth: barImg?.getAttribute("width"),
      barHeight: barImg?.getAttribute("height"),
    });
  }
}

export function applyCopiedChartTableLayout(clone, chartImages = []) {
  if (!clone) return;

  const chartCaptureArea = clone.querySelector(".chart-capture-area");
  const chartCell = chartCaptureArea?.querySelector(".chart-cell");
  if (!chartCaptureArea || !chartCell) return;

  const measured = Math.round(
    Number(chartImages[0]?.rowWidth || chartImages[0]?.cardWidth || 0)
  );
  const table = document.createElement("table");
  table.setAttribute("role", "presentation");
  table.setAttribute("width", "100%");
  table.setAttribute("cellpadding", "0");
  table.setAttribute("cellspacing", "0");
  table.setAttribute("border", "0");
  table.setAttribute(
    "style",
    "width:100%;max-width:100%;border-collapse:collapse;table-layout:fixed;"
  );
  const tr = document.createElement("tr");
  const td = document.createElement("td");
  td.setAttribute("valign", "top");
  td.setAttribute("width", "100%");
  td.setAttribute(
    "style",
    "width:100%;max-width:100%;vertical-align:top;padding:14px;border:1px solid #d7dee8;border-radius:14px;background-color:#ffffff;"
  );
  if (measured > 0) td.setAttribute("data-measured-card-width", String(measured));
  td.innerHTML = chartCell.innerHTML;
  keepCopiedChartImage(td);
  tr.appendChild(td);
  table.appendChild(tr);
  chartCaptureArea.innerHTML = "";
  chartCaptureArea.appendChild(table);
  chartCaptureArea.setAttribute(
    "style",
    "display:block;width:100%;max-width:100%;margin:16px 0 0 0;clear:both;overflow:visible;box-sizing:border-box;"
  );

  if (typeof console !== "undefined") {
    const barImg = chartCaptureArea.querySelector("[data-chart-kind='bar'] img, img[alt='Total Net Credit Trend']");
    console.info("[copy-charts] after applyCopiedChartTableLayout", {
      barImgPresent: Boolean(barImg),
      barSrcLen: barImg?.getAttribute("src")?.length || 0,
      barWidth: barImg?.getAttribute("width"),
      barHeight: barImg?.getAttribute("height"),
      rowWidth: measured,
    });
  }
}

export default memo(function BankMonthlyBarAndPositionsPie({
  bankTables = [],
  loanTransferAllocatedByBankAndMonth = null,
  privateRoleFundingLoanRule = false,
}) {
  const monthlyData = useMemo(() => {
    const netSeries = totalNetCreditByMonth(
      bankTables,
      loanTransferAllocatedByBankAndMonth,
      privateRoleFundingLoanRule
    );
    const creditSeries = totalCreditByMonth(bankTables);
    const fundingSeries = totalFundingByMonth(
      bankTables,
      loanTransferAllocatedByBankAndMonth,
      privateRoleFundingLoanRule
    );
    const transferSeries = totalTransfersByMonth(bankTables);
    const nsfSeries = totalNsfDaysByMonth(bankTables);
    const lowBlcSeries = totalLowBalanceDaysByMonth(bankTables);
    return mergeCreditTrendSeries(
      netSeries,
      creditSeries,
      fundingSeries,
      transferSeries,
      nsfSeries,
      lowBlcSeries
    );
  }, [bankTables, loanTransferAllocatedByBankAndMonth, privateRoleFundingLoanRule]);

  if (!monthlyData.length) return null;

  return (
    <div
      className="chart-capture-area"
      style={{
        display: "block",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <div className="chart-cell" style={cardStyle}>
        <div style={titleStyle}>Credits Trend</div>
        <MonthlyBarChart data={monthlyData} />
      </div>
    </div>
  );
});
