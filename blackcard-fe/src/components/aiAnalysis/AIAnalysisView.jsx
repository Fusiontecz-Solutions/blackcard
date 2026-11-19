import { useState, useEffect, useRef, Fragment, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { getApplicationByApplicationId } from "@/redux/actions/applicationActions";
import { getPositions } from "@/redux/actions/positionActions";
import { axiosGet, axiosPost, axiosPut, axiosDelete, axiosPostFormData } from "@/redux/axios";
import { SPA_SCRUBBER_SYNCED_EVENT } from "@/components/application/contractdata/spaScrubberSync";
import { toast } from "react-toastify";
import jsPDF from "jspdf";
import { FUSIONTECZ_LOGO_PNG } from "./reportLogo";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";

const formatNumberUS = (n) => {
  if (n == null || Number.isNaN(Number(n))) return "0.00";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const TAB = { DOCUMENTS: "documents", BANK_ANALYSIS: "bank-analysis" };

// Arrow-shaped tab for DOCUMENTS when active: flat left, right-pointing tip
const ARROW_PX = 24;
const DOC_ACTIVE_SHAPE = `polygon(0 0, calc(100% - ${ARROW_PX}px) 0, 100% 50%, calc(100% - ${ARROW_PX}px) 100%, 0 100%)`;
// Ribbon shape for BANK ANALYSIS when active: left notch + right-pointing tip
const BANK_ACTIVE_SHAPE = `polygon(0 50%, 0px 0, calc(100% - ${ARROW_PX}px) 0, 100% 50%, calc(100% - ${ARROW_PX}px) 100%, 0px 100%)`;

const ACTIVE_BG = "#1e3a5f";
const INACTIVE_BG = "#e6e7e8";
const INACTIVE_TEXT = "#1e293b";

function mapApplicationFileToDoc(file) {
  return {
    fileName: file.originalName || file.fileName || "Document",
    url: file.url || "",
    publicId: file.publicId || "",
    contentType: file.mimeType || file.contentType || "",
    size: file.size,
    source: "application",
    applicationFileId: file._id || file.id,
  };
}

function isAiSupported(file) {
  const mime = String(file.contentType || "").toLowerCase();
  const name = String(file.fileName || "").toLowerCase();
  if (mime.includes("pdf") || mime.startsWith("image/")) return true;
  return name.endsWith(".pdf") || /\.(png|jpe?g|tiff?|gif|bmp|webp)$/i.test(name);
}

function parseNum(str) {
  if (str == null || String(str).trim() === "") return NaN;
  return Number(String(str).replace(/[^0-9.-]+/g, ""));
}

function money(n) {
  const v = typeof n === "number" ? n : parseNum(n);
  if (Number.isNaN(v) || v == null) return "-";
  return `$ ${formatNumberUS(v)}`;
}

const round2 = (n) => Math.round(n * 100) / 100;
const pctOf = (part, whole) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

// Estimated monthly repayment = repayment amount × payments-per-month, from Module 8 of
// the underwriting guide (Daily ×21, Weekly ×4.33, Bi-weekly ×2.17).
const FREQ_PER_MONTH = { Daily: 21, Weekly: 4.33, "Bi-weekly": 2.17, Monthly: 1 };
function estMonthly(installment, frequency) {
  const inst = Number(installment) || 0;
  const mult = FREQ_PER_MONTH[frequency] || 0;
  return round2(inst * mult);
}

// "YYYY-MM" → "Jun 2026". Falls back to the raw string on bad input.
function monthLabel(m) {
  if (!m || !/^\d{4}-\d{2}$/.test(m)) return m || "";
  const [y, mm] = m.split("-");
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(mm) - 1] || mm} ${y}`;
}

const BANK_MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const BANK_MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Normalize AI month labels to Bank Analysis table labels (`June 2026`). */
function toBankMonthLabel(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const ymd = s.match(/^(\d{4})-(\d{2})$/);
  if (ymd) {
    const idx = Number(ymd[2]) - 1;
    if (idx >= 0 && idx < 12) return `${BANK_MONTH_FULL[idx]} ${ymd[1]}`;
  }
  const named = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (named) {
    const token = named[1];
    let idx = BANK_MONTH_FULL.findIndex((m) => m.toLowerCase() === token.toLowerCase());
    if (idx < 0) idx = BANK_MONTH_SHORT.findIndex((m) => m.toLowerCase() === token.toLowerCase());
    if (idx >= 0) return `${BANK_MONTH_FULL[idx]} ${named[2]}`;
  }
  return s;
}

function monthDateFromBankLabel(label) {
  const named = String(label || "").trim().match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!named) return new Date().toISOString();
  let idx = BANK_MONTH_FULL.findIndex((m) => m.toLowerCase() === named[1].toLowerCase());
  if (idx < 0) idx = BANK_MONTH_SHORT.findIndex((m) => m.toLowerCase() === named[1].toLowerCase());
  if (idx < 0) return new Date().toISOString();
  return new Date(Date.UTC(Number(named[2]), idx, 1)).toISOString();
}

function notifyManualAnalysisRefreshed(applicationUuid) {
  if (typeof window === "undefined") return;
  const id = String(applicationUuid || "").trim();
  if (!id) return;
  window.dispatchEvent(
    new CustomEvent(SPA_SCRUBBER_SYNCED_EVENT, {
      detail: { applicationUuid: id },
    }),
  );
}

/* What is NOT customer revenue.
 *
 * The analysis now ships its own list, derived from the underwriting
 * policy, and that one wins. This is the fallback for analyses saved
 * before that field existed.
 *
 * It previously held only transfers, mcaCredits and nsf — so owner
 * injections, tax refunds, PPP, loan proceeds and line-of-credit draws
 * were all counted as revenue. Every omission here inflates true revenue
 * and sizes the offer too high, which is the expensive direction.
 */
const FALLBACK_NON_REVENUE = [
  "transfers",
  "mcaCredits",
  "loanInflow",
  "loanProceeds",
  "locDraw",
  "factoring",
  "ownerInjection",
  "returnsReversals",
  "nsf",
  "bankCorrection",
  "feeRefund",
  "taxRefund",
  "governmentFunds",
  "insuranceSettlement",
  "gambling",
  "crypto",
];

const nonRevenueSet = (analysis) =>
  new Set(
    Array.isArray(analysis?.nonRevenueCategories) && analysis.nonRevenueCategories.length
      ? analysis.nonRevenueCategories
      : FALLBACK_NON_REVENUE
  );

const NON_REVENUE_CREDIT = new Set(FALLBACK_NON_REVENUE);

// Per-month Gross vs Net revenue from the transaction list (credits only; suspect mis-reads
// excluded, mirroring the summary math). Gross = all deposits; Net excludes transfers,
// financing inflows and returns. Sorted chronologically for a left→right trend.
function computeRevenueTrend(txns) {
  const byMonth = {};
  for (const t of txns || []) {
    if (t.direction !== "credit" || t.suspectAmount) continue;
    const m = t.month || (t.date ? String(t.date).slice(0, 7) : "");
    if (!m) continue;
    if (!byMonth[m]) byMonth[m] = { month: m, gross: 0, net: 0 };
    byMonth[m].gross += t.amount || 0;
    if (!NON_REVENUE_CREDIT.has(t.category)) byMonth[m].net += t.amount || 0;
  }
  return Object.values(byMonth)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((x) => ({ month: x.month, label: monthLabel(x.month), gross: round2(x.gross), net: round2(x.net) }));
}

// Compact USD for chart axes: $1.2k / $3.4M.
function shortUsd(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v}`;
}

// ─── Full-report PDF (programmatic jsPDF; no html2canvas — Tailwind v4 oklch breaks it) ──
function downloadReportPdf(analysis, revenueTrend, statements = []) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const M = 40; // margin
  const CW = PAGE_W - M * 2; // content width
  let y = M;

  // Refined report palette (dark-blue theme).
  const NAVY = [28, 60, 108];      // MAIN headings / titles / table headers — dark blue
  const SUB_BLUE = [86, 125, 180];  // SUB headings — medium blue
  const ACCENT = [28, 60, 108];    // dark blue accent
  const INK = [30, 41, 59];       // body text
  const MUTED = [100, 116, 139];  // secondary text
  const HAIR = [226, 232, 240];   // hairlines / borders
  const ZEBRA = [247, 250, 252];  // alternating row fill
  const SLATE = MUTED;            // legacy alias used by older sections
  const usd = (n) => (typeof n === "number" && !Number.isNaN(n) ? `$${formatNumberUS(n)}` : "-");

  function ensure(space) {
    if (y + space > PAGE_H - M) { doc.addPage(); y = M; return true; }
    return false;
  }
  // Section heading: a rounded dark-blue "glass" pill with a soft shadow, a lighter gloss
  // band across the top, and clean letter-spaced white text.
  // Horizontal color gradient inside a rounded rect (clipped so the corners stay round).
  // `gamma` biases the blend — >1 keeps the start color for longer (so left-aligned white
  // titles stay on the darker part and remain readable).
  function gradRoundRect(x, y0, w, h, r, c1, c2, gamma = 1) {
    doc.saveGraphicsState();
    doc.roundedRect(x, y0, w, h, r, r);
    doc.clip();
    doc.discardPath();
    const steps = Math.min(110, Math.max(40, Math.ceil(w / 5))); // capped for smaller file size
    for (let i = 0; i < steps; i++) {
      const t = Math.pow(i / (steps - 1), gamma);
      doc.setFillColor(
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t)
      );
      doc.rect(x + (w * i) / steps, y0, w / steps + 0.8, h, "F");
    }
    doc.restoreGraphicsState();
  }

  // Main heading — dark-blue → white gradient bar, white title on the (dark) left.
  function heading(text, sub) {
    const h = 24, r = 6;
    ensure(h + 26);
    y += 12;
    doc.setFillColor(...HAIR);
    doc.roundedRect(M + 2, y + 3, CW, h, r, r, "F"); // shadow
    gradRoundRect(M, y, CW, h, r, NAVY, [236, 240, 252], 1.7);
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.7);
    doc.roundedRect(M, y, CW, h, r, r, "S");
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.setCharSpace(0.4);
    doc.text(String(text), M + 14, y + h / 2 + 3.5);
    doc.setCharSpace(0);
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...NAVY);
      doc.text(String(sub), M + CW - 12, y + h / 2 + 3, { align: "right" });
    }
    y += h + 14;
  }
  // Sub heading — light-blue → white gradient, shorter (secondary labels).
  function subheading(text, sub) {
    const h = 18, r = 5;
    ensure(h + 16);
    y += 6;
    doc.setFillColor(...HAIR);
    doc.roundedRect(M + 1.5, y + 2.5, CW, h, r, r, "F"); // shadow
    gradRoundRect(M, y, CW, h, r, SUB_BLUE, [248, 247, 242], 1.3); // fades to off-white after the month name
    doc.setDrawColor(...SUB_BLUE);
    doc.setLineWidth(0.6);
    doc.roundedRect(M, y, CW, h, r, r, "S");
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.setCharSpace(0.3);
    doc.text(String(text), M + 12, y + h / 2 + 3);
    doc.setCharSpace(0);
    if (sub) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...NAVY);
      doc.text(String(sub), M + CW - 10, y + h / 2 + 2.5, { align: "right" });
    }
    y += h + 8;
  }
  // Clean table: navy header (white text), zebra rows, generous padding, no vertical rules.
  // Header repeats after every page break.
  function table(columns, rows) {
    const rowH = 17;
    const PAD = 7;
    const totalW = columns.reduce((s, c) => s + c.width, 0);
    const drawHeader = () => {
      // navy header with rounded top corners (bottom flattened to meet the rows)
      doc.setFillColor(...NAVY);
      doc.roundedRect(M, y, totalW, rowH, 4, 4, "F");
      doc.rect(M, y + rowH / 2, totalW, rowH / 2, "F");
      // subtle gloss band across the top
      doc.setFillColor(66, 104, 160);
      doc.rect(M + 4, y + 2, totalW - 8, rowH / 2 - 3, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      doc.setCharSpace(0.3);
      let x = M;
      for (const c of columns) {
        const tx = c.align === "right" ? x + c.width - PAD : x + PAD;
        doc.text(String(c.header), tx, y + 11.5, { align: c.align === "right" ? "right" : "left" });
        x += c.width;
      }
      doc.setCharSpace(0);
      y += rowH;
    };
    ensure(rowH * 2);
    drawHeader();
    let zebra = false;
    for (const row of rows) {
      if (ensure(rowH)) { drawHeader(); zebra = false; }
      if (zebra) { doc.setFillColor(...ZEBRA); doc.rect(M, y, totalW, rowH, "F"); }
      zebra = !zebra;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...INK);
      let x = M;
      for (let i = 0; i < columns.length; i++) {
        const c = columns[i];
        const cell = row[i] == null ? "" : String(row[i]);
        const tx = c.align === "right" ? x + c.width - PAD : x + PAD;
        const line = doc.splitTextToSize(cell, c.width - PAD * 2)[0] || "";
        doc.text(line, tx, y + 11.5, { align: c.align === "right" ? "right" : "left" });
        x += c.width;
      }
      y += rowH;
    }
    // Close the table with a hairline.
    doc.setDrawColor(...HAIR);
    doc.line(M, y, M + totalW, y);
    y += 16;
  }
  // KPI cards for the summary — a clean 3-across grid instead of a plain metric table.
  function kpiCards(a) {
    const s = a.summary || {};
    const cards = [
      ["Total Credits", usd(s.totalCredits)],
      ["Total Debits", usd(s.totalDebits)],
      ["Net Cash Flow", usd(s.netCashFlow)],
      ["Avg Daily Balance", usd(a.dailyAverageBalance)],
      ["Opening Balance", usd(a.startingBalance)],
      ["Positions", String((a.positions || []).length)],
    ];
    const perRow = 3, gap = 10, cardW = (CW - gap * (perRow - 1)) / perRow, cardH = 40;
    let i = 0;
    while (i < cards.length) {
      ensure(cardH + gap);
      for (let col = 0; col < perRow && i < cards.length; col++, i++) {
        const cx = M + col * (cardW + gap);
        doc.setFillColor(249, 251, 253);
        doc.setDrawColor(...HAIR);
        doc.roundedRect(cx, y, cardW, cardH, 4, 4, "FD");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(String(cards[i][0]).toUpperCase(), cx + 10, y + 15);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...NAVY);
        doc.text(String(cards[i][1]), cx + 10, y + 31);
      }
      y += cardH + gap;
    }
    y += 2;
  }

  // ── reusable report sections (work on any analysis object) ──
  function summarySection(a, label) {
    heading(label || "Summary");
    kpiCards(a);
  }
  function trendSection(trend) {
    if (!trend || !trend.length) return;
    heading("Revenue Trend — Gross vs Net");
    const maxV = Math.max(...trend.map((r) => Math.max(r.gross, r.net)), 1);
    const chartH = 96;
    const labelGap = 16;
    ensure(chartH + labelGap + 40);
    const plotTop = y;
    const baseY = plotTop + chartH;
    // horizontal gridlines (4 divisions) with muted value labels
    doc.setFontSize(6.5);
    for (let g = 0; g <= 4; g++) {
      const gy = baseY - (chartH * g) / 4;
      doc.setDrawColor(...HAIR);
      doc.line(M + 44, gy, M + CW, gy);
      doc.setTextColor(...MUTED);
      doc.text(shortUsd((maxV * g) / 4), M + 40, gy + 2, { align: "right" });
    }
    // grouped bars within the plot area (offset for the y-axis labels)
    const plotX = M + 48, plotW = CW - 48;
    const groupW = plotW / trend.length;
    const barW = Math.max(5, Math.min(26, (groupW - 14) / 2));
    trend.forEach((r, i) => {
      const cx = plotX + i * groupW + groupW / 2;
      const gh = Math.max(0, (r.gross / maxV) * chartH);
      const nh = Math.max(0, (r.net / maxV) * chartH);
      doc.setFillColor(37, 99, 156); doc.rect(cx - barW - 1, baseY - gh, barW, gh, "F"); // gross = blue
      doc.setFillColor(5, 150, 105); doc.rect(cx + 1, baseY - nh, barW, nh, "F"); // net = green
      doc.setFontSize(6.5); doc.setTextColor(...MUTED);
      doc.text(String(r.label), cx, baseY + labelGap - 4, { align: "center" });
    });
    doc.setDrawColor(...MUTED); doc.line(M + 48, baseY, M + CW, baseY);
    // legend
    const legY = baseY + labelGap + 4;
    doc.setFontSize(7.5);
    doc.setFillColor(37, 99, 156); doc.rect(M + 48, legY, 8, 8, "F");
    doc.setTextColor(...MUTED); doc.text("Gross Revenue", M + 60, legY + 7);
    doc.setFillColor(5, 150, 105); doc.rect(M + 150, legY, 8, 8, "F");
    doc.text("Net Revenue", M + 162, legY + 7);
    y = legY + 22;
    table(
      [
        { header: "Month", width: CW * 0.34 },
        { header: "Gross Revenue", width: CW * 0.33, align: "right" },
        { header: "Net Revenue", width: CW * 0.33, align: "right" },
      ],
      trend.map((r) => [r.label, usd(r.gross), usd(r.net)])
    );
  }
  // Shared detected-positions table (same columns as the on-screen PositionsTable).
  function positionsTable(positions) {
    table(
      [
        { header: "Lender", width: CW * 0.16 },
        { header: "Type", width: CW * 0.07 },
        { header: "Status", width: CW * 0.1 },
        { header: "Funded Amount", width: CW * 0.13, align: "right" },
        { header: "Freq", width: CW * 0.08 },
        { header: "Repayment", width: CW * 0.12, align: "right" },
        { header: "Pmts", width: CW * 0.05, align: "right" },
        { header: "Last Pmt", width: CW * 0.1 },
        { header: "Est. Monthly", width: CW * 0.11, align: "right" },
        { header: "Conf.", width: CW * 0.08 },
      ],
      positions.map((p) => [
        p.lender || "-",
        p.type || "MCA",
        p.repayStatus || "Active",
        p.amountFunded ? usd(Number(p.amountFunded)) : "—",
        p.frequency || "-",
        usd(Number(p.installment)),
        String(p.occurrences ?? "-"),
        p.lastDate || "—",
        usd(estMonthly(p.installment, p.frequency)),
        p.confidence || "-",
      ])
    );
  }
  // Standalone "Detected Positions" table (matches the on-screen collapsed positions table).
  // Per-position transactions appear in All Transactions, so they are not repeated here.
  function positionsSection(a) {
    const positions = a.positions || [];
    if (!positions.length) return;
    heading(`Detected Positions (${positions.length})`);
    positionsTable(positions);
  }
  // Positions by month — identical layout to the on-screen "Positions by Month" table.
  function positionsByMonthSection(a) {
    const positions = a.positions || [];
    if (positions.length === 0) return;
    const mos = Array.isArray(a.months) ? a.months : [];
    heading("Positions by Month");
    if (mos.length === 0) { positionsTable(positions); return; } // no month data → all positions
    for (const m of mos) {
      const monthPositions = positions
        .map((p) => positionForMonth(p, m.month))
        .filter(Boolean)
        .sort((x, z) => z.totalPaidInStatement - x.totalPaidInStatement);
      subheading(m.label, `${monthPositions.length} position(s)`);
      if (monthPositions.length) positionsTable(monthPositions);
      else {
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(148, 163, 184);
        ensure(12); doc.text("No positions this month.", M + 6, y + 8); y += 16;
      }
    }
  }
  // Category tables split by direction (matches on-screen Credit/Debit Categories).
  function categoriesSection(a) {
    const cats = a.categoryTotals || [];
    if (!cats.length) return;
    const build = (dir) => cats
      .filter((c) => (dir === "credit" ? c.creditCount > 0 : c.debitCount > 0))
      .map((c) => ({
        label: c.label || c.category,
        count: dir === "credit" ? c.creditCount : c.debitCount,
        total: dir === "credit" ? (c.creditTotal ?? c.total) : (c.debitTotal ?? c.total),
        pct: dir === "credit" ? (c.creditPct ?? 0) : (c.debitPct ?? 0),
      }))
      .sort((x, z) => z.total - x.total);
    const credit = build("credit"), debit = build("debit");
    if (credit.length) { heading("Credit Categories"); categoryBarTable(credit, "credit", [5, 150, 105]); }
    if (debit.length) { heading("Debit Categories"); categoryBarTable(debit, "debit", [220, 38, 38]); }
  }
  // Category rows where the "Share" column is a 0–100% progress bar instead of a number.
  function categoryBarTable(rows, dir, barColor) {
    const rowH = 17, PAD = 7, totalW = CW;
    const cols = [
      { header: "Category", w: CW * 0.4, align: "left" },
      { header: "Count", w: CW * 0.11, align: "right" },
      { header: "Total", w: CW * 0.22, align: "right" },
      { header: `Share of ${dir === "credit" ? "credits" : "debits"}`, w: CW * 0.27, align: "left" },
    ];
    const drawHeader = () => {
      doc.setFillColor(...NAVY);
      doc.roundedRect(M, y, totalW, rowH, 4, 4, "F");
      doc.rect(M, y + rowH / 2, totalW, rowH / 2, "F");
      doc.setFillColor(66, 104, 160); doc.rect(M + 4, y + 2, totalW - 8, rowH / 2 - 3, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255); doc.setCharSpace(0.3);
      let x = M;
      for (const c of cols) { const tx = c.align === "right" ? x + c.w - PAD : x + PAD; doc.text(c.header, tx, y + 11.5, { align: c.align === "right" ? "right" : "left" }); x += c.w; }
      doc.setCharSpace(0); y += rowH;
    };
    ensure(rowH * 2); drawHeader();
    let zebra = false;
    for (const r of rows) {
      if (ensure(rowH)) { drawHeader(); zebra = false; }
      if (zebra) { doc.setFillColor(...ZEBRA); doc.rect(M, y, totalW, rowH, "F"); }
      zebra = !zebra;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...INK);
      doc.text(doc.splitTextToSize(String(r.label), cols[0].w - PAD * 2)[0] || "", M + PAD, y + 11.5);
      doc.text(`${r.count}x`, M + cols[0].w + cols[1].w - PAD, y + 11.5, { align: "right" });
      doc.text(usd(Number(r.total)), M + cols[0].w + cols[1].w + cols[2].w - PAD, y + 11.5, { align: "right" });
      // progress bar (track + fill) with a small % label
      const bx = M + cols[0].w + cols[1].w + cols[2].w + PAD;
      const pct = Math.max(0, Math.min(100, Number(r.pct) || 0));
      const bw = cols[3].w - PAD * 2 - 26;
      const by = y + rowH / 2 - 2.5;
      doc.setFillColor(...HAIR); doc.roundedRect(bx, by, bw, 5, 2.5, 2.5, "F");
      if (pct > 0) { doc.setFillColor(...barColor); doc.roundedRect(bx, by, Math.max(2, bw * pct / 100), 5, 2.5, 2.5, "F"); }
      doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text(`${pct}%`, bx + bw + 4, y + 11.5);
      y += rowH;
    }
    doc.setDrawColor(...HAIR); doc.line(M, y, M + totalW, y);
    y += 16;
  }
  function recurringSection(a) {
    const rec = Array.isArray(a.recurringTransactions) ? a.recurringTransactions : [];
    if (!rec.length) return;
    heading(`Recurring Transactions (${rec.length})`);
    table(
      [
        { header: "Payee", width: CW * 0.28 },
        { header: "Category", width: CW * 0.16 },
        { header: "Flow", width: CW * 0.1 },
        { header: "Frequency", width: CW * 0.14 },
        { header: "Amount", width: CW * 0.12, align: "right" },
        { header: "Times", width: CW * 0.08, align: "right" },
        { header: "Total", width: CW * 0.12, align: "right" },
      ],
      rec.map((r) => [r.payee || "-", r.categoryLabel || r.category || "-", r.direction === "credit" ? "Credit" : "Debit", r.frequency || "-", usd(Number(r.amount)), String(r.occurrences ?? "-"), usd(Number(r.total))])
    );
  }
  function flagsSection(a) {
    const risk = a.riskFlags || [];
    const alt = a.alterationFlags || [];
    if (!risk.length && !alt.length) return;
    heading("Risk Flags");
    if (alt.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(185, 28, 28);
      ensure(15); doc.text("Possible Statement Alteration", M, y + 8); y += 15;
      doc.setFont("helvetica", "normal"); doc.setTextColor(127, 29, 29);
      for (const f of alt) for (const ln of doc.splitTextToSize(`•  ${f}`, CW - 8)) { ensure(12); doc.text(ln, M + 8, y + 8); y += 12; }
      y += 6;
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...INK);
    for (const f of risk) for (const ln of doc.splitTextToSize(`•  ${f}`, CW - 8)) { ensure(12); doc.text(ln, M + 8, y + 8); y += 12; }
    y += 6;
  }
  function transactionsSection(a, label) {
    const txns = Array.isArray(a.transactions) ? a.transactions : [];
    if (!txns.length) return;
    const sorted = [...txns].sort((x, z) => String(x.date || "").localeCompare(String(z.date || "")));
    heading(label || "All Transactions", `${sorted.length} transactions`);
    table(
      [
        { header: "Date", width: CW * 0.12 },
        { header: "Description", width: CW * 0.44 },
        { header: "Category", width: CW * 0.16 },
        { header: "Amount", width: CW * 0.14, align: "right" },
        { header: "Balance", width: CW * 0.14, align: "right" },
      ],
      sorted.map((t) => {
        const amt = Number(t.amount) || 0;
        const signed = t.direction === "credit" ? amt : -amt;
        return [
          t.date || "-",
          t.rawDescription || t.description || "-",
          t.categoryLabel || t.category || "-",
          (signed < 0 ? "-$" : "$") + formatNumberUS(Math.abs(signed)),
          t.runningBalance != null ? usd(Number(t.runningBalance)) : "-",
        ];
      })
    );
  }

  // ── Title band (page 1) ──
  const isCombined = !!analysis.combined;
  const sources = Array.isArray(analysis.sources) ? analysis.sources : [];
  const bandH = 66;
  // Dark-blue → lighter-blue gradient band (full width, no clip needed for a plain rect).
  {
    const c1 = NAVY, c2 = [66, 104, 160], steps = 130;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      doc.setFillColor(
        Math.round(c1[0] + (c2[0] - c1[0]) * t),
        Math.round(c1[1] + (c2[1] - c1[1]) * t),
        Math.round(c1[2] + (c2[2] - c1[2]) * t)
      );
      doc.rect((PAGE_W * i) / steps, 0, PAGE_W / steps + 1, bandH, "F");
    }
  }
  doc.setFillColor(...ACCENT);
  doc.rect(0, bandH, PAGE_W, 3, "F"); // accent strip under the band
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(isCombined ? "Combined Bank Statements Report" : "Bank Statement Analysis Report", M, 30);
  const subParts = [
    isCombined ? `${analysis.sourceCount || sources.length} statements combined` : (analysis.bankName || null),
    !isCombined && analysis.fileName ? analysis.fileName : null,
    (analysis.statementPeriod?.start || analysis.statementPeriod?.end)
      ? `${analysis.statementPeriod?.start || "?"} – ${analysis.statementPeriod?.end || "?"}` : null,
  ].filter(Boolean);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(221, 229, 250);
  if (subParts.length) doc.text(subParts.join("    •    "), M, 48);
  doc.setFontSize(7.5);
  doc.setTextColor(202, 214, 246);
  doc.text(`Generated ${new Date().toLocaleString()}`, M + CW, 48, { align: "right" });
  y = bandH + 24;

  // ── Body ──
  if (isCombined) {
    // Overall (merged) view first — full detail…
    summarySection(analysis, "Combined Summary");
    trendSection(revenueTrend);
    positionsByMonthSection(analysis);
    categoriesSection(analysis);
    recurringSection(analysis);
    flagsSection(analysis);
    // …then each statement separately: its own summary, positions, categories & transactions.
    (statements || []).filter(Boolean).forEach((st, i) => {
      doc.addPage(); y = M;
      const name = st.fileName || `Statement ${i + 1}`;
      const period = st.statementPeriod?.start ? `${st.statementPeriod.start} → ${st.statementPeriod.end || "?"}` : "";
      heading(`Statement ${i + 1}: ${name}`, period);
      summarySection(st, "Statement Summary");
      positionsByMonthSection(st);
      categoriesSection(st);
      flagsSection(st);
      transactionsSection(st, "Statement Transactions");
    });
  } else {
    summarySection(analysis);
    trendSection(revenueTrend);
    positionsByMonthSection(analysis);
    categoriesSection(analysis);
    recurringSection(analysis);
    flagsSection(analysis);
    transactionsSection(analysis, "All Transactions");
  }

  // Per-page: faint centered Fusiontecz logo watermark + footer.
  const pages = doc.internal.getNumberOfPages();
  const WM = 300, WMH = WM * (224 / 228); // logo is 228x224
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    // Watermark (very low opacity so it never obscures content).
    try {
      if (doc.saveGraphicsState) doc.saveGraphicsState();
      if (doc.GState) doc.setGState(new doc.GState({ opacity: 0.05 }));
      doc.addImage(FUSIONTECZ_LOGO_PNG, "PNG", (PAGE_W - WM) / 2, (PAGE_H - WMH) / 2, WM, WMH, "fusionteczwm", "FAST");
      if (doc.restoreGraphicsState) doc.restoreGraphicsState();
    } catch { /* watermark is best-effort */ }
    // Footer: small crisp logo + page number.
    try {
      doc.addImage(FUSIONTECZ_LOGO_PNG, "PNG", M, PAGE_H - 28, 14, 14 * (224 / 228), "fusionteczwm", "FAST");
    } catch { /* ignore */ }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text("Fusiontecz · MCA Underwriting", M + 20, PAGE_H - 19);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 19, { align: "right" });
  }

  if (isCombined) {
    doc.save(`MCA-Combined-Report-${analysis.sourceCount || sources.length}-statements.pdf`);
  } else {
    const safeName = (analysis.fileName || analysis.bankName || "bank-analysis").replace(/[^a-z0-9]+/gi, "-").slice(0, 40);
    doc.save(`MCA-Report-${safeName}.pdf`);
  }
}

// Recompute category totals + summary from a (possibly month-filtered) transaction list.
// Mirrors the backend so month tabs work without another server round-trip. Suspect
// (mis-read) amounts are excluded from the sums, like the backend.
function computeView(txns) {
  const map = {};
  let totalCredits = 0, totalDebits = 0, creditCount = 0, debitCount = 0;
  for (const t of txns) {
    const c = t.category || "other";
    if (!map[c]) map[c] = { category: c, label: t.categoryLabel || c, creditTotal: 0, creditCount: 0, debitTotal: 0, debitCount: 0, count: 0 };
    const m = map[c];
    m.count += 1;
    if (t.direction === "credit") {
      m.creditCount += 1; creditCount += 1;
      if (!t.suspectAmount) { m.creditTotal += t.amount; totalCredits += t.amount; }
    } else {
      m.debitCount += 1; debitCount += 1;
      if (!t.suspectAmount) { m.debitTotal += t.amount; totalDebits += t.amount; }
    }
  }
  const categoryTotals = Object.values(map).map((m) => ({
    ...m,
    total: round2(m.creditTotal + m.debitTotal),
    creditTotal: round2(m.creditTotal),
    debitTotal: round2(m.debitTotal),
    creditPct: pctOf(m.creditTotal, totalCredits),
    debitPct: pctOf(m.debitTotal, totalDebits),
  }));
  return {
    categoryTotals,
    totalCredits: round2(totalCredits),
    totalDebits: round2(totalDebits),
    netCashFlow: round2(totalCredits - totalDebits),
    creditTxnCount: creditCount,
    debitTxnCount: debitCount,
    transactionCount: txns.length,
  };
}

const FIELD_LABELS = ["Month", "Total Credit", "Loan/Transfer", "Deposit", "Other", "Net Credit", "NSF/Neg days", "Low Blc. Days", "Avg Daily Blc."];
const FIELD_KEYS = ["month", "totalCredits", "loanTransfer", "deposite", "other", "netCredit", "nsfNegDays", "lowNegDays", "averageDailyBalance"];
const CURRENCY_KEYS = ["totalCredits", "loanTransfer", "deposite", "other", "netCredit", "averageDailyBalance"];

function cellDisplay(key, value) {
  if (value == null || String(value).trim() === "") return "-";
  if (CURRENCY_KEYS.includes(key)) {
    const n = parseNum(value);
    return Number.isNaN(n) ? String(value) : `$ ${formatNumberUS(n)}`;
  }
  return String(value);
}

// MCA / No-MCA toggle for a transaction row. A single learned override is shared with the
// category selector, so tagging MCA clears any category override and vice-versa.
function McaToggle({ tag, disabled, onPick }) {
  const btn = (val, label, activeBg, activeColor) => {
    const active = tag === val;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onPick(val, tag); }}
        className="px-2 py-0.5 rounded text-[10px] font-semibold focus:outline-none disabled:opacity-50"
        style={{
          backgroundColor: active ? activeBg : "#f1f5f9",
          color: active ? activeColor : "#64748b",
          border: active ? `1px solid ${activeColor}` : "1px solid #e2e8f0",
        }}
        title={active ? "Click to clear" : `Tag as ${label}`}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="flex gap-1 justify-center">
      {btn("mca", "MCA", "#fae8ff", "#86198f")}
      {btn("not_mca", "No", "#e2e8f0", "#334155")}
    </div>
  );
}

// Per-row category selector (categories only). Value is the learned override when it is a
// category key; picking one persists + relearns. "Auto" clears the override.
function CategorySelect({ value, disabled, options, onPick }) {
  // Only reflect the dropdown value when the override is an actual category (not mca/not_mca).
  const catValue = value && value !== "mca" && value !== "not_mca" ? value : "";
  return (
    <select
      value={catValue}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onPick(e.target.value)}
      className="text-[10px] rounded border px-1 py-0.5 focus:outline-none disabled:opacity-50 bg-white"
      style={{ borderColor: "#cbd5e1", color: "#334155", maxWidth: "150px" }}
      title="Change / lock this transaction's category"
    >
      <option value="">Auto</option>
      {options.map((o) => (
        <option key={o.key} value={o.key}>{o.label}</option>
      ))}
    </select>
  );
}

// Small reusable transactions table (position detail + category drill-down + raw list).
// When `onTag` + `categoryOptions` are provided, each row gets a category selector and
// shows the raw description. When `showBalance` is true, a running Balance column is shown
// (the last transaction of each day is that day's closing balance).
function TxnMiniTable({ rows, showCategory = false, maxHeight, onTag, tagging = false, categoryOptions = [], showBalance = false }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-400 px-3 py-2">No transactions.</p>;
  }
  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="min-w-full text-xs text-left">
        <thead className="uppercase text-[10px] font-semibold sticky top-0" style={{ backgroundColor: "#f1f5f9", color: "#64748b" }}>
          <tr>
            <th className="px-3 py-1.5">Date</th>
            <th className="px-3 py-1.5">Description</th>
            {showCategory && <th className="px-3 py-1.5">Category</th>}
            <th className="px-3 py-1.5 text-center">Type</th>
            <th className="px-3 py-1.5 text-right">Amount</th>
            {showBalance && <th className="px-3 py-1.5 text-right">Balance</th>}
            {onTag && <th className="px-3 py-1.5 text-center">MCA?</th>}
            {onTag && <th className="px-3 py-1.5 text-center">Category</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const isMca = t.category === "mcaDebits" || t.category === "loanInflow";
            return (
            <tr key={i} className="border-t" style={{ borderColor: "#f1f5f9", backgroundColor: isMca ? "#fdf4ff" : undefined, borderLeft: isMca ? "3px solid #a21caf" : undefined }}>
              <td className="px-3 py-1 whitespace-nowrap text-slate-500">{t.date || "-"}</td>
              <td className="px-3 py-1 text-slate-800">
                {isMca && <span className="mr-1 px-1.5 py-0.5 rounded text-[9px] font-bold align-middle" style={{ backgroundColor: "#a21caf", color: "#fff" }}>MCA</span>}
                {t.rawDescription || t.description || "-"}
              </td>
              {showCategory && (
                <td className="px-3 py-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: isMca ? "#fae8ff" : "#eef2ff", color: isMca ? "#86198f" : "#3730a3" }}>
                    {t.categoryLabel || t.category}
                  </span>
                </td>
              )}
              <td className="px-3 py-1 text-center">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: t.direction === "credit" ? "#dcfce7" : "#fee2e2", color: t.direction === "credit" ? "#166534" : "#b91c1c" }}>
                  {t.direction === "credit" ? "Credit" : "Debit"}
                </span>
              </td>
              <td className={`px-3 py-1 text-right ${t.direction === "credit" ? "text-green-700" : "text-red-600"}`}>
                {t.suspectAmount && (
                  <span title="Amount looks mis-read by OCR — excluded from totals & balance" className="mr-1 text-amber-500">⚠</span>
                )}
                {money(t.amount)}
              </td>
              {showBalance && (
                <td className={`px-3 py-1 text-right font-medium ${t.runningBalance < 0 ? "text-red-600" : "text-slate-700"}`}>
                  {t.runningBalance != null ? money(t.runningBalance) : "-"}
                </td>
              )}
              {onTag && (
                <td className="px-3 py-1">
                  <McaToggle
                    tag={t.mcaTag}
                    disabled={tagging}
                    onPick={(decision, current) => onTag(t.rawDescription || t.description, decision, current)}
                  />
                </td>
              )}
              {onTag && (
                <td className="px-3 py-1 text-center">
                  <CategorySelect
                    value={t.mcaTag}
                    disabled={tagging}
                    options={categoryOptions}
                    onPick={(decision) => onTag(t.rawDescription || t.description, decision, t.mcaTag)}
                  />
                </td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Chevron = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>
    <polyline points="9 6 15 12 9 18" />
  </svg>
);

// One direction's category breakdown (credit or debit) with % of that direction's total.
// Click a row to reveal the matching transactions.
function CategoryGroup({ title, direction, categories, allTxns, accent }) {
  const [open, setOpen] = useState(null);
  const rowsFor = categories
    .filter((c) => (direction === "credit" ? c.creditCount > 0 : c.debitCount > 0))
    .map((c) => ({
      category: c.category,
      label: c.label,
      count: direction === "credit" ? c.creditCount : c.debitCount,
      total: direction === "credit" ? (c.creditTotal ?? c.total) : (c.debitTotal ?? c.total),
      pct: direction === "credit" ? (c.creditPct ?? 0) : (c.debitPct ?? 0),
    }))
    .sort((a, b) => b.total - a.total);
  if (rowsFor.length === 0) return null;

  return (
    <div className="rounded-lg border bg-white mb-4" style={{ borderColor: "#e2e8f0" }}>
      <p className="text-xs font-bold px-3 py-2 border-b" style={{ borderColor: "#e2e8f0", color: accent }}>
        {title} — click to view transactions
      </p>
      <table className="min-w-full text-xs text-left">
        <tbody>
          {rowsFor.map((c) => {
            const isOpen = open === c.category;
            const txRows = allTxns.filter((t) => t.category === c.category && t.direction === direction);
            return (
              <Fragment key={c.category}>
                <tr
                  className="border-t cursor-pointer hover:bg-slate-50"
                  style={{ borderColor: "#f1f5f9" }}
                  onClick={() => setOpen(isOpen ? null : c.category)}
                >
                  <td className="px-3 py-2 w-6 text-slate-400"><Chevron open={isOpen} /></td>
                  <td className="px-3 py-2 text-slate-700 font-medium">{c.label}</td>
                  <td className="px-3 py-2 text-slate-500 text-right pr-3">{c.count}×</td>
                  <td className="px-3 py-2 font-medium text-slate-800 text-right">{money(c.total)}</td>
                  <td className="px-3 py-2 text-right w-20">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-slate-500">{c.pct}%</span>
                      <span className="inline-block h-1.5 rounded-full" style={{ width: `${Math.max(3, Math.min(100, c.pct))}px`, backgroundColor: accent, opacity: 0.5 }} />
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5} className="p-0" style={{ backgroundColor: "#f8fafc" }}>
                      <TxnMiniTable rows={txRows} maxHeight="260px" />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Recurring (non-MCA) transactions — same payee + same amount on a regular cadence.
// Click a row to reveal all of that recurring item's transactions.
function RecurringTable({ items }) {
  const [open, setOpen] = useState(null);
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border bg-white mb-4" style={{ borderColor: "#e2e8f0" }}>
      <p className="text-xs font-bold text-slate-800 px-3 py-2 border-b" style={{ borderColor: "#e2e8f0" }}>
        Recurring Transactions ({items.length}) — same amount on a regular schedule, not an MCA position · click to expand
      </p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs text-left">
          <thead className="uppercase text-[11px] font-semibold" style={{ backgroundColor: "#f1f5f9", color: "#475569" }}>
            <tr>
              <th className="px-2 py-2 w-6"></th>
              <th className="px-3 py-2">Payee</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Flow</th>
              <th className="px-3 py-2">Frequency</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right">Times</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r, i) => {
              const isOpen = open === i;
              return (
                <Fragment key={i}>
                  <tr className="border-t cursor-pointer hover:bg-slate-50" style={{ borderColor: "#f1f5f9" }} onClick={() => setOpen(isOpen ? null : i)}>
                    <td className="px-2 py-2 text-slate-400"><Chevron open={isOpen} /></td>
                    <td className="px-3 py-2 font-medium text-slate-800">{r.payee || "-"}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ backgroundColor: "#eef2ff", color: "#3730a3" }}>
                        {r.categoryLabel || r.category}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={r.direction === "credit" ? "text-green-700" : "text-red-600"}>
                        {r.direction === "credit" ? "Credit" : "Debit"}
                      </span>
                    </td>
                    <td className="px-3 py-2">{r.frequency || "-"}</td>
                    <td className="px-3 py-2 text-right">{money(r.amount)}</td>
                    <td className="px-3 py-2 text-right">{r.occurrences}</td>
                    <td className="px-3 py-2 text-right font-medium">{money(r.total)}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={8} className="p-0" style={{ backgroundColor: "#f8fafc" }}>
                        <TxnMiniTable
                          rows={(r.transactions || []).map((x) => ({ ...x, direction: r.direction }))}
                          maxHeight="260px"
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Build a month-specific view of a position (same shape as a detected position, but with
// that month's installment/payments/paid so it renders in the identical table format).
function positionForMonth(p, month) {
  const txns = (p.transactions || []).filter((t) => (t.date || "").startsWith(month));
  if (!txns.length) return null;
  const amts = txns.map((t) => t.amount).filter((a) => a < 1000000);
  const counts = {};
  amts.forEach((a) => { const k = a.toFixed(2); counts[k] = (counts[k] || 0) + 1; });
  let inst = 0, best = 0;
  for (const k in counts) if (counts[k] > best) { best = counts[k]; inst = Number(k); }
  if (!inst && amts.length) inst = amts[0];
  const total = txns.reduce((s, t) => s + (t.amount || 0), 0);
  const dates = txns.map((t) => t.date).filter(Boolean).sort();
  return {
    ...p,
    installment: inst ? String(round2(inst)) : "",
    occurrences: txns.length,
    totalPaidInStatement: round2(total),
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
    transactions: txns,
  };
}

// Colour + label for a position's repayment status.
//   Active · Lower · Paid in Full · Stop · One Time
function repayStatusStyle(status) {
  const s = String(status || "Active");
  switch (s) {
    case "Lower": return { label: "Lower", bg: "#fef3c7", fg: "#92400e" };
    case "Paid in Full": return { label: "Paid in Full", bg: "#dbeafe", fg: "#1e40af" };
    case "Stop": return { label: "Stop", bg: "#fee2e2", fg: "#b91c1c" };
    case "One Time": return { label: "One Time", bg: "#e0e7ff", fg: "#3730a3" };
    case "Active":
    default: return { label: "Active", bg: "#dcfce7", fg: "#166534" };
  }
}

// Reusable detected-positions table (used for the main table and the per-month breakdown).
function PositionsTable({ positions, onTrust, tagging }) {
  const [openPos, setOpenPos] = useState(() => new Set());
  const toggle = (i) => setOpenPos((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const colCount = onTrust ? 12 : 11;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs text-left">
        <thead className="uppercase text-[11px] font-semibold" style={{ backgroundColor: "#f1f5f9", color: "#475569" }}>
          <tr>
            <th className="px-2 py-2 w-6"></th>
            <th className="px-3 py-2">Lender</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Funded Amount</th>
            <th className="px-3 py-2">Frequency</th>
            <th className="px-3 py-2">Repayment</th>
            <th className="px-3 py-2">Payments</th>
            <th className="px-3 py-2">Last Payment</th>
            <th className="px-3 py-2">Est. Monthly</th>
            <th className="px-3 py-2">Confidence</th>
            {onTrust && <th className="px-3 py-2 text-center">MCA Trust</th>}
          </tr>
        </thead>
        <tbody>
          {positions.length > 0 ? (
            positions.map((p, i) => {
              const open = openPos.has(i);
              return (
                <Fragment key={i}>
                  <tr className="border-t cursor-pointer hover:bg-slate-50" style={{ borderColor: "#e2e8f0" }} onClick={() => toggle(i)}>
                    <td className="px-2 py-2 text-slate-400"><Chevron open={open} /></td>
                    <td className="px-3 py-2 font-medium text-slate-800">{p.lender || "-"}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: p.type === "LOAN" ? "#e0e7ff" : "#fae8ff", color: p.type === "LOAN" ? "#3730a3" : "#86198f" }}>
                        {p.type || "MCA"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {(() => { const s = repayStatusStyle(p.repayStatus); return (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap" style={{ backgroundColor: s.bg, color: s.fg }}>{s.label}</span>
                      ); })()}
                    </td>
                    <td className="px-3 py-2 font-medium" style={{ color: p.amountFunded ? "#166534" : "#94a3b8" }}>{p.amountFunded ? money(p.amountFunded) : "—"}</td>
                    <td className="px-3 py-2">{p.frequency || "-"}</td>
                    <td className="px-3 py-2">{money(p.installment)}</td>
                    <td className="px-3 py-2">{p.occurrences ?? "-"}</td>
                    <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{p.lastDate || "—"}</td>
                    <td className="px-3 py-2">{money(estMonthly(p.installment, p.frequency))}</td>
                    <td className="px-3 py-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ backgroundColor: p.confidence === "high" ? "#dcfce7" : p.confidence === "medium" ? "#fef9c3" : "#f1f5f9", color: p.confidence === "high" ? "#166534" : p.confidence === "medium" ? "#854d0e" : "#475569" }}>
                        {p.confidence || "low"}
                      </span>
                    </td>
                    {onTrust && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1 justify-center">
                          <button type="button" disabled={tagging} onClick={(e) => { e.stopPropagation(); onTrust(p, "mca"); }}
                            className="px-2 py-0.5 rounded text-[10px] font-bold focus:outline-none disabled:opacity-50"
                            style={{ backgroundColor: p.mcaTag === "mca" ? "#16a34a" : "#f1f5f9", color: p.mcaTag === "mca" ? "#ffffff" : "#64748b", border: "1px solid " + (p.mcaTag === "mca" ? "#16a34a" : "#e2e8f0") }}
                            title="Yes — confirm this is an MCA (remembered for future statements)">Yes</button>
                          <button type="button" disabled={tagging} onClick={(e) => { e.stopPropagation(); onTrust(p, "not_mca"); }}
                            className="px-2 py-0.5 rounded text-[10px] font-bold focus:outline-none disabled:opacity-50"
                            style={{ backgroundColor: "#f1f5f9", color: "#b91c1c", border: "1px solid #fecaca" }}
                            title="No — this is not an MCA (removes it and remembers)">No</button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={colCount} className="p-0" style={{ backgroundColor: "#f8fafc" }}>
                        <TxnMiniTable rows={p.transactions} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          ) : (
            <tr>
              <td colSpan={colCount} className="px-3 py-4 text-center text-slate-400">No financing positions detected</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---- Real AI analysis result panel (Google Document AI) ----
// Display keyword for a learned tag: "kw:capital" → "capital", "lender:spartan cap" → "spartan cap".
function tagKeyword(t) {
  const raw = String(t?.key || "");
  if (raw.startsWith("kw:")) return raw.slice(3);
  return raw.replace(/^(lender|payee):/, "");
}
const MCA_DECISIONS = new Set(["mca", "mcaCredits", "mcaDebits", "loanInflow"]);

// ─── MCA Training panel ──────────────────────────────────────────────────────
// Surfaces the GLOBAL learned rules and lets the user train a keyword so it is always
// detected as MCA (or never) across every future statement.
function TrainingPanel({ tags = [], onTrain, onUntrain, busy }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");

  const mcaTags = tags.filter((t) => MCA_DECISIONS.has(t.decision));
  const notTags = tags.filter((t) => t.decision === "not_mca");

  const submit = (decision) => {
    const kw = draft.trim();
    if (!kw) return;
    onTrain(kw, decision);
    setDraft("");
  };

  const Chip = ({ t, color, bg }) => (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: bg, color }}>
      {t.key?.startsWith("kw:") && <span title="Trained keyword" className="opacity-60">🎓</span>}
      {tagKeyword(t)}
      <button type="button" disabled={busy} onClick={() => onUntrain(t.key)} title="Remove this rule"
        className="ml-0.5 leading-none hover:opacity-70 disabled:opacity-40" style={{ color }}>×</button>
    </span>
  );

  return (
    <div className="rounded-lg border bg-white mb-4" style={{ borderColor: "#e2e8f0" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 focus:outline-none">
        <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
          🎓 MCA Training
          <span className="text-[10px] font-medium text-slate-400">
            {mcaTags.length} MCA · {notTags.length} not-MCA keyword{mcaTags.length + notTags.length === 1 ? "" : "s"}
          </span>
        </span>
        <span className="text-slate-400 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t" style={{ borderColor: "#eef2f7" }}>
          <p className="text-[11px] text-slate-500 my-2">
            Train a keyword and it is <b>always</b> detected as MCA (or never) on every statement going forward.
            Tagging a transaction as MCA also learns its payee here automatically.
          </p>

          {/* Add keyword */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit("mca"); }}
              placeholder="e.g. capital, funding, spartan…"
              className="flex-1 min-w-[160px] text-xs rounded border px-2 py-1.5 focus:outline-none"
              style={{ borderColor: "#cbd5e1" }}
            />
            <button type="button" disabled={busy || !draft.trim()} onClick={() => submit("mca")}
              className="text-[11px] font-semibold px-3 py-1.5 rounded text-white disabled:opacity-50"
              style={{ background: "#276D9C" }}>
              {busy ? "…" : "Train as MCA"}
            </button>
            <button type="button" disabled={busy || !draft.trim()} onClick={() => submit("not_mca")}
              className="text-[11px] font-semibold px-3 py-1.5 rounded border disabled:opacity-50"
              style={{ borderColor: "#cbd5e1", color: "#334155", background: "#fff" }}>
              Never MCA
            </button>
          </div>

          {/* Learned MCA keywords */}
          <div className="mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Always MCA</p>
            {mcaTags.length === 0 ? (
              <p className="text-[11px] text-slate-400">None yet. Train a keyword or tag a transaction as MCA.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {mcaTags.map((t) => <Chip key={t.key} t={t} color="#86198f" bg="#fae8ff" />)}
              </div>
            )}
          </div>

          {/* Learned not-MCA keywords */}
          {notTags.length > 0 && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Never MCA</p>
              <div className="flex flex-wrap gap-1.5">
                {notTags.map((t) => <Chip key={t.key} t={t} color="#334155" bg="#e2e8f0" />)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The balance-identity verdict, shown above the figures it governs.
 *
 * The last day's closing balance must equal the statement's own closing
 * balance. When it doesn't, the transactions behind every number on this
 * screen are wrong, so the banner sits above them rather than beside them —
 * an underwriter who prices off a wrong average daily balance has no way of
 * knowing they did.
 *
 * Three states, and "unverified" is deliberately not treated as mild: it
 * means the statement's own opening or closing balance could not be read,
 * so nothing was checked at all.
 */
function BalanceCheckBanner({ check }) {
  if (!check) {
    return (
      <div
        className="mb-3 rounded border px-3 py-2 text-[11px]"
        style={{ borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}
      >
        <span className="font-semibold">Balances not verified.</span> This analysis was run
        before the balance check existed. Re-run it to confirm the daily balances and the
        average.
      </div>
    );
  }

  const status = check.status || "unverified";
  // Balances proved sound from the statement's own daily-balance table, but
  // the extracted rows behind them don't add up. The figures on screen are
  // right; the transaction detail is short. Shown in amber, not red — red
  // here would say "don't trust the average", which would be false.
  const detailGap = status === "ok" && check.transactionsReconcile === false;
  const tone =
    detailGap
      ? { border: "#fde68a", bg: "#fffbeb", text: "#92400e", title: "Balances confirmed · transaction detail incomplete" }
      : status === "ok"
      ? { border: "#bbf7d0", bg: "#f0fdf4", text: "#166534", title: "Balances reconcile" }
      : status === "mismatch"
      ? { border: "#fca5a5", bg: "#fef2f2", text: "#b91c1c", title: "Reconciliation error" }
      : { border: "#fde68a", bg: "#fffbeb", text: "#92400e", title: "Balances not verified" };

  const m = (n) =>
    n == null
      ? "-"
      : (n < 0 ? "-$" : "$") +
        Math.abs(Number(n)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rows =
    detailGap
      ? [
          ["Daily balances", "from the statement", "verified against its closing balance"],
          ["Statement closes at", m(check.statedEnding), ""],
          ["Extracted rows reach", m(check.computedEnding), `${check.daysInPeriod || 0} days`],
          ["Detail short by", m(check.extractionDifference), "affects categories, not the average"],
        ]
      : status === "ok"
      ? []
      : [
          ["Opening balance", m(check.openingBalance), check.openingSource === "stated" ? "from statement" : check.openingSource === "derived" ? "worked back from closing" : "assumed zero"],
          ["Daily walk ends at", m(check.computedEnding), `${check.daysInPeriod || 0} days`],
          ["Statement closes at", m(check.statedEnding), ""],
          ["Difference", m(check.difference), check.difference ? "must be $0.00" : ""],
        ];

  return (
    <div
      className="mb-3 rounded border px-3 py-2"
      style={{ borderColor: tone.border, background: tone.bg, color: tone.text }}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm leading-5">
          {detailGap ? "!" : status === "ok" ? "✓" : status === "mismatch" ? "✕" : "!"}
        </span>
        <div className="flex-1">
          <p className="text-xs font-semibold">{tone.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed">{check.message}</p>

          {rows.length ? (
            <div className="mt-2 grid gap-x-4 gap-y-1 text-[11px]" style={{ gridTemplateColumns: "auto auto 1fr" }}>
              {rows.map(([label, value, note]) => (
                <Fragment key={label}>
                  <span className="opacity-80">{label}</span>
                  <span className="font-mono font-semibold tabular-nums">{value}</span>
                  <span className="opacity-70">{note}</span>
                </Fragment>
              ))}
            </div>
          ) : null}

          {/* A printed day that disagrees names the exact date to go and look at,
              which a single period-end difference cannot. */}
          {check.dayMismatchCount > 0 ? (
            <div className="mt-2 text-[11px]">
              <p className="font-semibold">
                {check.dayMismatchCount} day{check.dayMismatchCount === 1 ? "" : "s"} disagree with
                the statement&rsquo;s printed balances:
              </p>
              <ul className="mt-1 space-y-0.5">
                {(check.dayMismatches || []).map((d) => (
                  <li key={d.date} className="font-mono tabular-nums">
                    {d.date} — statement {m(d.printed)}, computed {m(d.computed)} (
                    {d.difference > 0 ? "+" : ""}
                    {m(d.difference)})
                  </li>
                ))}
              </ul>
              {check.dayMismatchCount > (check.dayMismatches || []).length ? (
                <p className="mt-1 opacity-70">
                  …and {check.dayMismatchCount - (check.dayMismatches || []).length} more.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AiResultPanel({ analysis, onApply, applying, applied, onTag, onSetOpening, onSetTotals, onTrust, tagging, trustOverride = {}, categoryOptions = [], learnedTags = [], onTrain, onUntrain, trainBusy, statements = [] }) {
  const [openPos, setOpenPos] = useState(() => new Set());
  const [showRaw, setShowRaw] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(null); // null = All
  const [txnPage, setTxnPage] = useState(0);
  const [txnShowAll, setTxnShowAll] = useState(false);
  const [obDraft, setObDraft] = useState("");
  const [tcDraft, setTcDraft] = useState("");
  const [tdDraft, setTdDraft] = useState("");
  // recharts measures width on the client; guard against a 0-width SSR/first paint.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!analysis) return null;
  // Apply optimistic MCA-Trust choices instantly while backend recompute runs.
  const rawPositions = Array.isArray(analysis.positions) ? analysis.positions : [];
  const positions = rawPositions
    .filter((p) => trustOverride[p.lender] !== "not_mca")
    .map((p) => {
      const ov = trustOverride[p.lender];
      if (ov === "mca") return { ...p, mcaTag: "mca" };
      if (ov === "__clear__") return { ...p, mcaTag: "" };
      return p;
    });
  const riskFlags = Array.isArray(analysis.riskFlags) ? analysis.riskFlags : [];
  const alterationFlags = Array.isArray(analysis.alterationFlags) ? analysis.alterationFlags : [];
  const rawTxns = Array.isArray(analysis.transactions) ? analysis.transactions : [];
  const months = Array.isArray(analysis.months) ? analysis.months : [];
  // Revenue trend spans the whole statement (all months), independent of the month filter.
  const revenueTrend = computeRevenueTrend(rawTxns);
  const allDailyBalances = Array.isArray(analysis.dailyBalances) ? analysis.dailyBalances : [];

  // Month filter: null → whole statement; else only that month's rows / balances.
  const inMonth = (t) => !selectedMonth || t.month === selectedMonth;
  const allTxns = rawTxns.filter(inMonth); // for category drill-down (source order)
  const dailyBalances = selectedMonth
    ? allDailyBalances.filter((d) => (d.date || "").startsWith(selectedMonth))
    : allDailyBalances;

  // Recompute summary + category split for the current view (all or one month).
  const view = computeView(allTxns);
  const s = selectedMonth ? view : (analysis.summary || {});
  const categories = view.categoryTotals;
  const avgDaily = dailyBalances.length
    ? round2(dailyBalances.reduce((a, d) => a + d.closing, 0) / dailyBalances.length)
    : (analysis.dailyAverageBalance ?? null);
  // Positions active in the selected month (a position with ≥1 payment that month).
  const viewPositions = selectedMonth
    ? positions.filter((p) => (p.transactions || []).some((x) => (x.date || "").startsWith(selectedMonth)))
    : positions;
  const recurring = Array.isArray(analysis.recurringTransactions) ? analysis.recurringTransactions : [];
  const viewRecurring = selectedMonth
    ? recurring.filter((r) => (r.transactions || []).some((x) => (x.date || "").startsWith(selectedMonth)))
    : recurring;

  // Date-sorted copy for the "All Transactions" list (empty dates sink to the end).
  const sortedTxns = [...allTxns].sort((a, b) => {
    const da = a.date || "", db = b.date || "";
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
  });

  const togglePos = (i) =>
    setOpenPos((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const openingBalance = analysis.startingBalance;
  const GREEN = { grad: "#bbf7d0", color: "#166534" };
  const RED = { grad: "#fecaca", color: "#b91c1c" };
  const netCF = Number(s.netCashFlow) || 0;
  const nsfCount = selectedMonth
    ? allTxns.filter((t) => t.category === "nsf").length
    : (s.nsfCount ?? 0);
  // Counted from the first day the account actually moved: an account that
  // opens the period overdrawn and sits untouched for three weeks is dormant,
  // not in distress, and counting those days reads as the latter. `counted` is
  // set by the backend; analyses saved before it existed have no flag, so they
  // fall back to counting every day as they always did.
  const negativeDays = dailyBalances.filter(
    (d) => d.counted !== false && Number(d.closing) < 0
  ).length;
  const dormantDays = dailyBalances.filter((d) => d.counted === false).length;
  const summaryCards = [
    { label: "Total Credits", value: money(s.totalCredits), ...GREEN },
    { label: "Total Debits", value: money(s.totalDebits), ...RED },
    ...(analysis.combined
      ? [
          { label: "Avg Total Credit", value: s.avgTotalCredits != null ? money(s.avgTotalCredits) : "-", ...GREEN },
          { label: "Avg Total Debit", value: s.avgTotalDebits != null ? money(s.avgTotalDebits) : "-", ...RED },
        ]
      : []),
    { label: "Net Cash Flow", value: money(s.netCashFlow), ...(netCF >= 0 ? GREEN : RED) },
    // Marked when the walk behind it does not reconcile — the figure is still
    // shown (hiding it would just prompt a hand calculation off the same bad
    // transactions) but never as though it were sound.
    {
      label: analysis.balanceCheck && analysis.balanceCheck.status !== "ok"
        ? "Avg Daily Balance ⚠"
        : "Avg Daily Balance",
      value: avgDaily != null ? money(avgDaily) : "-",
      ...(analysis.balanceCheck && analysis.balanceCheck.status === "mismatch" ? RED : {}),
    },
    { label: "NSF / Returned", value: nsfCount, ...(nsfCount > 0 ? RED : {}) },
    {
      label: dormantDays > 0 ? `Negative Days (of ${dailyBalances.length - dormantDays} active)` : "Negative Days",
      value: negativeDays,
      ...(negativeDays > 0 ? RED : {}),
    },
    { label: "Positions", value: viewPositions.length },
  ];

  return (
    <div className="p-4 text-left" style={{ backgroundColor: "#f8fafc", borderTop: "1px solid var(--ledgerx-border)" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-800">
            AI Statement Summary
            {analysis.fileName ? <span className="ml-2 font-normal text-slate-500">— {analysis.fileName}</span> : null}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {analysis.bankName ? `${analysis.bankName} · ` : ""}
            {analysis.statementPeriod?.start || analysis.statementPeriod?.end
              ? `Period: ${analysis.statementPeriod?.start || "?"} → ${analysis.statementPeriod?.end || "?"} · `
              : ""}
            Powered by Google Document AI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => downloadReportPdf(analysis, revenueTrend, statements)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium shadow-sm hover:bg-slate-50 focus:outline-none border"
            style={{ borderColor: "#cbd5e1", color: "#334155", background: "#ffffff" }}
            title="Download the full analysis as a PDF report"
          >
            ⬇ Download PDF
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={applying}
            className="inline-flex items-center px-4 py-1.5 rounded text-xs font-medium text-white shadow-sm hover:opacity-95 focus:outline-none disabled:opacity-60"
            style={{ background: "#1e3a5f" }}
          >
            {applying ? "Applying…" : applied ? "Applied ✓ (re-apply)" : "Apply to Manual Analysis"}
          </button>
        </div>
      </div>

      {/* The balance check governs every figure below, so it goes above them all.
          Shown for the statement as a whole even when one month is selected —
          extraction integrity is not a per-month property. */}
      <BalanceCheckBanner check={analysis.balanceCheck} />

      {/* Month tabs — shown only for multi-month statements */}
      {months.length > 1 && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          <span className="text-[11px] text-slate-500 mr-1">View:</span>
          {[{ month: null, label: "All months" }, ...months].map((m) => {
            const active = selectedMonth === m.month;
            return (
              <button
                key={m.month || "all"}
                type="button"
                onClick={() => setSelectedMonth(m.month)}
                className="px-3 py-1 rounded-full text-[11px] font-semibold focus:outline-none transition-colors"
                style={{
                  backgroundColor: active ? "#1e3a5f" : "#eef2f7",
                  color: active ? "#ffffff" : "#475569",
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Editable opening balance — anchors the daily running-balance calc */}
      {!selectedMonth && (
        <div className="rounded-lg border p-3 mb-4 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }}>
          <div>
            <p className="text-[11px] text-slate-600">Opening Balance (used for daily balance calc)</p>
            <p className="text-sm font-bold" style={{ color: "#1e40af" }}>
              {openingBalance != null ? money(openingBalance) : "not detected"}
            </p>
          </div>
          {onSetOpening && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500">Correct it:</span>
              <input
                type="number"
                step="0.01"
                value={obDraft}
                onChange={(e) => setObDraft(e.target.value)}
                placeholder={openingBalance != null ? String(openingBalance) : "0.00"}
                className="w-32 text-xs rounded border px-2 py-1 focus:outline-none"
                style={{ borderColor: "#cbd5e1" }}
              />
              <button
                type="button"
                disabled={tagging || obDraft === "" || Number.isNaN(Number(obDraft))}
                onClick={() => { onSetOpening(Number(obDraft)); setObDraft(""); }}
                className="text-[11px] font-medium px-3 py-1 rounded text-white focus:outline-none disabled:opacity-50"
                style={{ background: "#1e3a5f" }}
              >
                {tagging ? "…" : "Recalculate"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editable Total Credits / Total Debits — type them from the statement's printed summary */}
      {onSetTotals && !selectedMonth && !analysis.combined && (
        <div className="rounded-lg border p-3 mb-4 flex items-center justify-between flex-wrap gap-3" style={{ backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" }}>
          <div>
            <p className="text-[11px] text-slate-600">
              Total Credits / Total Debits
              <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
                style={{ backgroundColor: s.totalsSource === "manual" ? "#dcfce7" : s.totalsSource === "stated" ? "#e0e7ff" : "#fef9c3", color: s.totalsSource === "manual" ? "#166534" : s.totalsSource === "stated" ? "#3730a3" : "#854d0e" }}>
                {s.totalsSource === "manual" ? "manual" : s.totalsSource === "stated" ? "from statement" : "estimated"}
              </span>
            </p>
            <p className="text-sm font-bold" style={{ color: "#166534" }}>
              {money(s.totalCredits)} <span className="text-slate-400 font-normal">credits</span> · {money(s.totalDebits)} <span className="text-slate-400 font-normal">debits</span>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500">Enter from statement:</span>
            <input type="number" step="0.01" value={tcDraft} onChange={(e) => setTcDraft(e.target.value)}
              placeholder="Total Credits" className="w-32 text-xs rounded border px-2 py-1 focus:outline-none" style={{ borderColor: "#cbd5e1" }} />
            <input type="number" step="0.01" value={tdDraft} onChange={(e) => setTdDraft(e.target.value)}
              placeholder="Total Debits" className="w-32 text-xs rounded border px-2 py-1 focus:outline-none" style={{ borderColor: "#cbd5e1" }} />
            <button type="button" disabled={tagging || (tcDraft === "" && tdDraft === "")}
              onClick={() => {
                onSetTotals({
                  totalCredits: tcDraft === "" ? undefined : Number(tcDraft),
                  totalDebits: tdDraft === "" ? undefined : Number(tdDraft),
                });
                setTcDraft(""); setTdDraft("");
              }}
              className="text-[11px] font-medium px-3 py-1 rounded text-white focus:outline-none disabled:opacity-50" style={{ background: "#16a34a" }}>
              {tagging ? "…" : "Apply"}
            </button>
            {s.totalsSource === "manual" && (
              <button type="button" disabled={tagging} onClick={() => onSetTotals({ clearTotals: true })}
                className="text-[11px] font-medium px-2 py-1 rounded border focus:outline-none disabled:opacity-50"
                style={{ borderColor: "#cbd5e1", color: "#64748b", background: "#fff" }} title="Clear the manual override">
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      {/* Summary cards (left) + revenue trend chart (right) — side by side to use space well */}
      <div className={`grid grid-cols-1 ${revenueTrend.length > 0 ? "lg:grid-cols-2" : ""} gap-3 mb-4 items-stretch`}>
        <div className="grid grid-cols-2 gap-2 content-start">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded-lg border p-3"
              style={{
                background: card.grad ? `linear-gradient(120deg, ${card.grad} 0%, #ffffff 92%)` : "#f1f5f9",
                borderColor: card.grad ? "transparent" : "#e2e8f0",
              }}>
              <p className="text-[11px] mb-0.5" style={{ color: card.color ? card.color : "#475569", opacity: card.color ? 0.9 : 1 }}>{card.label}</p>
              <p className="text-sm font-bold" style={{ color: card.color || "#1e40af" }}>{card.value}</p>
            </div>
          ))}
        </div>

        {revenueTrend.length > 0 && (
          <div className="rounded-lg border bg-white p-3 flex flex-col" style={{ borderColor: "#e2e8f0" }}>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
              <p className="text-xs font-bold text-slate-800">Revenue Trend — Gross vs Net</p>
              <p className="text-[10px] text-slate-400">Net excl. transfers, financing &amp; returns</p>
            </div>
            <div style={{ width: "100%", flex: 1, minHeight: 230 }}>
              {mounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={revenueTrend} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                    <YAxis tickFormatter={shortUsd} tick={{ fontSize: 10, fill: "#64748b" }} tickLine={false} axisLine={false} width={48} />
                    <ReTooltip
                      formatter={(v, name) => [money(v), name]}
                      labelStyle={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="gross" name="Gross Revenue" fill="#276D9C" radius={[3, 3, 0, 0]} maxBarSize={40} />
                    <Line dataKey="net" name="Net Revenue" type="monotone" stroke="#059669" strokeWidth={2.5} dot={{ r: 3, fill: "#059669" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MCA Training — global learned keywords */}
      {onTrain && (
        <TrainingPanel tags={learnedTags} onTrain={onTrain} onUntrain={onUntrain} busy={trainBusy} />
      )}

      {/* Detected positions — collapsed; click a row to see its transactions */}
      <div className="rounded-lg border bg-white mb-4" style={{ borderColor: "#e2e8f0" }}>
        <p className="text-xs font-bold text-slate-800 px-3 py-2 border-b" style={{ borderColor: "#e2e8f0" }}>
          Detected Positions ({viewPositions.length}){selectedMonth ? " — active this month" : ""} — click to expand
        </p>
        <PositionsTable positions={viewPositions} onTrust={onTrust} tagging={tagging} />
      </div>

      {/* Positions by month — which position appeared in which month (multi-month / combined) */}
      {months.length >= 2 && positions.length > 0 && (
        <div className="rounded-lg border bg-white mb-4" style={{ borderColor: "#e2e8f0" }}>
          <p className="text-xs font-bold text-slate-800 px-3 py-2 border-b" style={{ borderColor: "#e2e8f0" }}>
            Positions by Month
          </p>
          <div className="p-3 space-y-4">
            {months.map((m) => {
              const monthPositions = positions
                .map((p) => positionForMonth(p, m.month))
                .filter(Boolean)
                .sort((a, b) => b.totalPaidInStatement - a.totalPaidInStatement);
              return (
                <div key={m.month} className="rounded-lg border overflow-hidden" style={{ borderColor: "#eef2f7" }}>
                  <p className="text-[11px] font-bold px-3 py-1.5" style={{ backgroundColor: "#eff6ff", color: "#1e40af" }}>
                    {m.label} — {monthPositions.length} position(s)
                  </p>
                  <PositionsTable positions={monthPositions} onTrust={onTrust} tagging={tagging} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Categories split by direction, each with % of that direction's total */}
      <div className="grid grid-cols-2 gap-4">
        <CategoryGroup title="Credit Categories" direction="credit" categories={categories} allTxns={allTxns} accent="#166534" />
        <CategoryGroup title="Debit Categories" direction="debit" categories={categories} allTxns={allTxns} accent="#b91c1c" />
      </div>

      {/* Recurring (non-MCA) transactions — expandable */}
      <RecurringTable items={viewRecurring} />

      {/* Risk flags */}
      <div className="rounded-lg border p-3 bg-white mb-4" style={{ borderColor: "#e2e8f0" }}>
        <p className="text-xs font-bold text-slate-800 mb-2">Risk Flags</p>

        {/* Statement-alteration / tampering flags — surfaced prominently at the top. */}
        {alterationFlags.length > 0 && (
          <div className="mb-3 rounded-md border p-2.5" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5 flex items-center gap-1.5" style={{ color: "#b91c1c" }}>
              <span aria-hidden>⚠</span> Possible Statement Alteration
            </p>
            <ul className="text-xs space-y-1.5" style={{ color: "#7f1d1d" }}>
              {alterationFlags.map((flag, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold shrink-0 mt-0.5" style={{ backgroundColor: "#b91c1c" }}>!</span>
                  <span>{flag}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {riskFlags.length > 0 ? (
          <ul className="text-xs text-slate-700 space-y-1.5">
            {riskFlags.map((flag, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="flex items-center justify-center w-4 h-4 rounded-full text-white text-[10px] font-bold shrink-0" style={{ backgroundColor: "#dc2626" }}>!</span>
                {flag}
              </li>
            ))}
          </ul>
        ) : alterationFlags.length === 0 ? (
          <p className="text-xs text-green-700">No risk flags raised.</p>
        ) : null}
      </div>

      {/* Full raw transactions list (collapsible) — date-sortable, running Balance column */}
      <div className="rounded-lg border bg-white" style={{ borderColor: "#e2e8f0" }}>
        <div className="w-full flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "#e2e8f0" }}>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="flex items-center gap-2 text-xs font-bold text-slate-800 focus:outline-none hover:opacity-80"
          >
            <Chevron open={showRaw} />
            All Statement Transactions ({allTxns.length}) — tag MCA / change category per row
          </button>
          {showRaw && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTxnShowAll((v) => !v)}
                className="text-[11px] font-medium px-2 py-1 rounded border focus:outline-none hover:bg-slate-50"
                style={{ borderColor: "#e2e8f0", color: "#475569" }}
                title="Show all transactions on one page vs. 50 per page"
              >
                {txnShowAll ? "Show 50 / page" : "Show all"}
              </button>
              <button
                type="button"
                onClick={() => setSortAsc((v) => !v)}
                className="text-[11px] font-medium px-2 py-1 rounded border focus:outline-none hover:bg-slate-50"
                style={{ borderColor: "#e2e8f0", color: "#475569" }}
                title="Toggle date order"
              >
                Date {sortAsc ? "▲ oldest first" : "▼ newest first"}
              </button>
            </div>
          )}
        </div>
        {showRaw &&
          (sortedTxns.length > 0 ? (
            (() => {
              const PAGE = 100;
              if (txnShowAll || sortedTxns.length <= PAGE) {
                return (
                  <>
                    <TxnMiniTable rows={sortedTxns} showCategory maxHeight="72vh" onTag={onTag} tagging={tagging} categoryOptions={categoryOptions} showBalance />
                    <div className="px-3 py-2 border-t text-[11px] text-slate-600" style={{ borderColor: "#e2e8f0" }}>
                      Showing all {sortedTxns.length} transactions
                    </div>
                  </>
                );
              }
              const totalPages = Math.ceil(sortedTxns.length / PAGE);
              const page = Math.min(txnPage, totalPages - 1);
              const start = page * PAGE;
              const pageRows = sortedTxns.slice(start, start + PAGE);
              return (
                <>
                  <TxnMiniTable rows={pageRows} showCategory maxHeight="72vh" onTag={onTag} tagging={tagging} categoryOptions={categoryOptions} showBalance />
                  <div className="flex items-center justify-between px-3 py-2 border-t text-[11px] text-slate-600" style={{ borderColor: "#e2e8f0" }}>
                    <span>Showing {start + 1}–{Math.min(start + PAGE, sortedTxns.length)} of {sortedTxns.length}</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={page <= 0}
                        onClick={() => setTxnPage(Math.max(0, page - 1))}
                        className="px-2 py-1 rounded border focus:outline-none disabled:opacity-40 hover:bg-slate-50"
                        style={{ borderColor: "#e2e8f0" }}
                      >
                        ◀ Prev
                      </button>
                      <span>Page {page + 1} / {totalPages}</span>
                      <button
                        type="button"
                        disabled={page >= totalPages - 1}
                        onClick={() => setTxnPage(Math.min(totalPages - 1, page + 1))}
                        className="px-2 py-1 rounded border focus:outline-none disabled:opacity-40 hover:bg-slate-50"
                        style={{ borderColor: "#e2e8f0" }}
                      >
                        Next ▶
                      </button>
                    </div>
                  </div>
                </>
              );
            })()
          ) : (
            <p className="text-xs text-slate-400 px-3 py-3">
              No transaction list stored for this analysis. Click “Re-run AI” on the document above to generate it.
            </p>
          ))}
      </div>
    </div>
  );
}

export default function AIAnalysisView({ bankAnalysisId: bankAnalysisIdProp = null, applicationId: applicationIdProp = null, onApplied = null }) {
  const dispatch = useDispatch();
  const { data: applicationData } = useSelector((state) => state.applicationDetail || {});
  const [activeTab, setActiveTab] = useState(TAB.DOCUMENTS);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [analyzingKey, setAnalyzingKey] = useState(null);
  const [batchProgress, setBatchProgress] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [applyingKey, setApplyingKey] = useState(null);
  const [appliedKeys, setAppliedKeys] = useState(() => new Set());
  const [taggingKey, setTaggingKey] = useState(null);
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [learnedTags, setLearnedTags] = useState([]);
  const [trainBusy, setTrainBusy] = useState(false);
  const [combined, setCombined] = useState(null);
  const [combinedLoading, setCombinedLoading] = useState(false);
  const [resultTab, setResultTab] = useState(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [localError, setLocalError] = useState("");
  const fileInputRef = useRef(null);

  const [localDocuments, setLocalDocuments] = useState([]);
  const [aiAnalyses, setAiAnalyses] = useState([]);
  const [bankAnalysisLoading, setBankAnalysisLoading] = useState(false);
  const [bankAnalysisError, setBankAnalysisError] = useState("");
  const [analyzeError, setAnalyzeError] = useState("");
  const [resolvedBankAnalysisId, setResolvedBankAnalysisId] = useState(bankAnalysisIdProp);
  const [bankAnalysisInitLoading, setBankAnalysisInitLoading] = useState(false);
  const [manualBankRows, setManualBankRows] = useState([]);
  const [manualBankMeta, setManualBankMeta] = useState({ bankName: "", accountNumber: "" });
  const [trustOverrides, setTrustOverrides] = useState({});

  const applicationDocuments = useMemo(() => {
    const files = Array.isArray(applicationData?.files) ? applicationData.files : [];
    return files.map(mapApplicationFileToDoc).filter((d) => d.url);
  }, [applicationData?.files]);

  const documents = useMemo(
    () => [...applicationDocuments, ...localDocuments],
    [applicationDocuments, localDocuments],
  );

  // Load application files from Documents tab
  useEffect(() => {
    if (!applicationIdProp) return;
    dispatch(getApplicationByApplicationId(String(applicationIdProp)));
  }, [applicationIdProp, dispatch]);

  // Resolve or auto-create bank analysis for AI runs
  useEffect(() => {
    if (bankAnalysisIdProp) {
      setResolvedBankAnalysisId(bankAnalysisIdProp);
      return;
    }
    if (!applicationIdProp) return;
    let active = true;
    setBankAnalysisInitLoading(true);
    (async () => {
      try {
        const res = await axiosGet(`/bank-analysis?application=${applicationIdProp}`);
        const banks = res?.data?.data || res?.data;
        if (Array.isArray(banks) && banks.length > 0) {
          if (active) setResolvedBankAnalysisId(banks[0].id || banks[0]._id);
          return;
        }
        const createRes = await axiosPost("/bank-analysis", {
          application: applicationIdProp,
          accountNumber: "—",
          bankName: null,
        });
        const created = createRes?.data?.data;
        if (active && created) setResolvedBankAnalysisId(created.id || created._id);
      } catch (e) {
        if (active) setBankAnalysisError(e.response?.data?.message || e.message || "Could not initialize bank analysis");
      } finally {
        if (active) setBankAnalysisInitLoading(false);
      }
    })();
    return () => { active = false; };
  }, [bankAnalysisIdProp, applicationIdProp]);

  const bankAnalysisId = resolvedBankAnalysisId;

  // Load applied bank-analysis rows for the in-AI Bank Analysis tab preview.
  useEffect(() => {
    if (!bankAnalysisId) {
      setManualBankRows([]);
      setManualBankMeta({ bankName: "", accountNumber: "" });
      return;
    }
    const appId = String(applicationIdProp || applicationData?._id || applicationData?.id || "").trim();
    if (!appId) return;
    let active = true;
    (async () => {
      try {
        const res = await axiosGet(`/bank-analysis?application=${encodeURIComponent(appId)}`);
        const list = res?.data?.data ?? res?.data ?? [];
        const banks = Array.isArray(list) ? list : [];
        const ba =
          banks.find((b) => String(b.id || b._id) === String(bankAnalysisId)) ||
          banks[0] ||
          null;
        if (!active || !ba) return;
        const rows = Array.isArray(ba.rows) ? ba.rows : [];
        setManualBankRows(rows);
        setManualBankMeta({
          bankName: ba.bankName || "",
          accountNumber: ba.accountNumber || "",
        });
      } catch (e) {
        if (active) setBankAnalysisError(e.response?.data?.message || e.message || "Failed to load bank analysis");
      }
    })();
    return () => { active = false; };
  }, [bankAnalysisId, applicationIdProp, applicationData?._id, applicationData?.id, appliedKeys.size]);


  // Fetch existing AI analyses for this bank analysis
  useEffect(() => {
    if (!bankAnalysisId) return;
    let active = true;
    setBankAnalysisLoading(true);
    axiosGet(`/ai-analysis/${bankAnalysisId}/ai-analyses`)
      .then((res) => {
        if (active && res?.data?.data) {
          setAiAnalyses(res.data.data);
        }
      })
      .catch((e) => { if (active) setBankAnalysisError(e.response?.data?.message || e.message); })
      .finally(() => { if (active) setBankAnalysisLoading(false); });
    return () => { active = false; };
  }, [bankAnalysisId]);

  // Load category options
  useEffect(() => {
    let active = true;
    axiosGet("/ai-analysis/categories")
      .then((res) => { if (active && res?.data?.data) setCategoryOptions(res.data.data); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Load learned tags
  const refreshTags = async () => {
    try {
      const res = await axiosGet("/ai-analysis/mca-tags");
      if (res?.data?.data) setLearnedTags(res.data.data);
    } catch { /* non-fatal */ }
  };
  useEffect(() => { refreshTags(); }, []);

  // Refresh AI analyses list
  const refreshAnalyses = async () => {
    try {
      const res = await axiosGet(`/ai-analysis/${bankAnalysisId}/ai-analyses`);
      if (res?.data?.data) setAiAnalyses(res.data.data);
    } catch { /* non-fatal */ }
  };

  const handleTrainKeyword = async (keyword, decision) => {
    const kw = String(keyword || "").trim();
    if (!kw) return;
    setTrainBusy(true);
    setLocalError("");
    try {
      await axiosPost("/ai-analysis/mca-tags", { keyword: kw, decision });
      if (bankAnalysisId) {
        await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize-all`);
        await refreshAnalyses();
      }
      await refreshTags();
    } catch (e) {
      setLocalError(e.response?.data?.message || "Failed to save training keyword");
    }
    setTrainBusy(false);
  };
  const handleUntrain = async (tagKey) => {
    if (!tagKey) return;
    setTrainBusy(true);
    setLocalError("");
    try {
      await axiosPost("/ai-analysis/mca-tags", { key: tagKey, removeTag: true });
      if (bankAnalysisId) {
        await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize-all`);
        await refreshAnalyses();
      }
      await refreshTags();
    } catch (e) {
      setLocalError(e.response?.data?.message || "Failed to remove training keyword");
    }
    setTrainBusy(false);
  };

  const isDocumentsActive = activeTab === TAB.DOCUMENTS;
  const isBankAnalysisActive = activeTab === TAB.BANK_ANALYSIS;

  const doc = { documents, aiAnalyses };
  const docId = bankAnalysisId;
  const isDocForCurrentId = !!bankAnalysisId;
  const bankTables = (() => {
    if (!manualBankRows.length) return [];
    const mapped = manualBankRows.map((row) => {
      const totalCredits = Number(row.totalCredit) || 0;
      const loanTransfer = Number(row.loanTransfer) || 0;
      const deposite = Number(row.deposit) || 0;
      const other = Number(row.other) || 0;
      return {
        month: row.monthLabel || row.month || "",
        totalCredits,
        loanTransfer,
        deposite,
        other,
        netCredit: Math.max(0, totalCredits - loanTransfer - deposite - other),
        nsfNegDays: row.nsfNegDays ?? "",
        lowNegDays: row.lowBlcDays ?? "",
        averageDailyBalance: row.avgDailyBlc ?? "",
      };
    });
    return [mapped];
  })();
  const bankAccountNumbers = manualBankMeta.accountNumber ? [manualBankMeta.accountNumber] : [];

  const docKey = (file) => file.publicId || file.url || file.applicationFileId || file.fileName;
  const analysisForDoc = (file) => {
    const key = docKey(file);
    const entry = aiAnalyses.find(
      (a) => {
        const r = a.result || a;
        return (file.publicId && (r.documentPublicId === file.publicId || a.documentPublicId === file.publicId)) ||
          (file.url && (r.documentUrl === file.url || a.documentUrl === file.url)) ||
          (r.fileName === key || a.fileName === key);
      }
    );
    if (!entry) return null;
    return entry.result || entry;
  };

  const analyzedDocs = documents.filter((f) => analysisForDoc(f));
  const hasDocuments = documents.length > 0;
  const showUpload = manageOpen || !hasDocuments;
  const analysesSig = aiAnalyses.map((a) => `${a.documentPublicId || a.documentUrl}:${a.processedAt}`).join("|");

  // Fetch the combined (all-statements) analysis when 2+ statements are analyzed.
  useEffect(() => {
    if (!bankAnalysisId || analyzedDocs.length < 2) { setCombined(null); return; }
    let active = true;
    setCombinedLoading(true);
    axiosGet(`/ai-analysis/${bankAnalysisId}/ai-combined`)
      .then((res) => { if (active) setCombined(res?.data?.data || null); })
      .catch(() => { if (active) setCombined(null); })
      .finally(() => { if (active) setCombinedLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bankAnalysisId, analysesSig, analyzedDocs.length]);

  // Default the results tab: combined when multiple statements, else the single statement.
  useEffect(() => {
    if (analyzedDocs.length >= 2) setResultTab((prev) => prev || "combined");
    else if (analyzedDocs.length === 1) setResultTab(docKey(analyzedDocs[0]));
    else setResultTab(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzedDocs.length, analysesSig]);

  const handleFilesSelected = (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setSelectedFiles(Array.from(fileList));
  };
  const handleFileInputChange = (e) => handleFilesSelected(e.target.files);
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) handleFilesSelected(e.dataTransfer.files);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleSubmitDocuments = async () => {
    setLocalError("");
    if (!bankAnalysisId) {
      setLocalError(bankAnalysisInitLoading ? "Preparing bank analysis…" : "Bank analysis is not ready yet. Please try again in a moment.");
      return;
    }
    if (!selectedFiles.length) {
      setLocalError("Choose a file to upload first.");
      return;
    }
    // Enforce the 10 MB per-document cap before uploading.
    const MAX = 10 * 1024 * 1024;
    const tooBig = selectedFiles.filter((f) => f.size > MAX);
    if (tooBig.length) {
      setLocalError(
        `These files exceed the 10 MB limit: ${tooBig.map((f) => `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`).join(", ")}`
      );
      return;
    }
    setUploading(true);
    try {
      const appId = String(applicationIdProp || applicationData?._id || applicationData?.id || "").trim();
      if (appId) {
        // Persist to application documents (Cloudinary) so analyses survive refresh.
        const formData = new FormData();
        selectedFiles.forEach((file) => formData.append("files", file));
        await axiosPostFormData(`/applications/${appId}/files`, formData);
        await dispatch(getApplicationByApplicationId(String(appId)));
      } else {
        // Fallback: keep as local data-URL docs when no application context.
        for (const file of selectedFiles) {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Failed to read file"));
            reader.readAsDataURL(file);
          });
          setLocalDocuments((prev) => [...prev, { fileName: file.name, url: dataUrl, contentType: file.type, size: file.size, source: "local" }]);
        }
      }
      setSelectedFiles([]);
    } catch (e) {
      setLocalError(e.response?.data?.message || e.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleAnalyze = async (file) => {
    if (!bankAnalysisId) {
      setLocalError(bankAnalysisInitLoading ? "Preparing bank analysis…" : "Bank analysis is not ready yet.");
      return;
    }
    if (!isAiSupported(file)) {
      setLocalError(`"${file.fileName || "File"}" is not a supported format for AI analysis. Use PDF or image files.`);
      return;
    }
    const existing = analysisForDoc(file);
    if (existing && !window.confirm("Are you sure you wanna re run ai?")) {
      return;
    }
    setLocalError("");
    const key = docKey(file);
    setAnalyzingKey(key);
    try {
      const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/ai-analyze`, {
        file: file.url || undefined,
        documentUrl: file.url || undefined,
        documentPublicId: file.publicId || undefined,
        fileName: file.fileName || undefined,
      }, { timeout: 180000 });
      if (res?.data?.data) {
        setAiAnalyses((prev) => {
          const idx = prev.findIndex((a) => a.id === res.data.data.id);
          if (idx >= 0) { const next = [...prev]; next[idx] = res.data.data; return next; }
          return [...prev, res.data.data];
        });
      }
    } catch (e) {
      setLocalError(e.response?.data?.message || "Analysis failed");
    }
    setAnalyzingKey(null);
  };

  const handleAnalyzeAll = async (mode = "pending") => {
    if (!bankAnalysisId) {
      setLocalError(bankAnalysisInitLoading ? "Preparing bank analysis…" : "Bank analysis is not ready yet.");
      return;
    }
    const supported = documents.filter(isAiSupported);
    const targets = mode === "all" ? supported : supported.filter((f) => !analysisForDoc(f));
    if (!targets.length) return;
    if (
      mode === "all" &&
      targets.some((f) => analysisForDoc(f)) &&
      !window.confirm("Are you sure you wanna re run ai?")
    ) {
      return;
    }
    setLocalError("");
    for (let i = 0; i < targets.length; i++) {
      const f = targets[i];
      setBatchProgress({ done: i, total: targets.length, name: f.fileName || "document" });
      setAnalyzingKey(docKey(f));
      try {
        const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/ai-analyze`, {
          file: f.url || undefined,
          documentUrl: f.url || undefined,
          documentPublicId: f.publicId || undefined,
          fileName: f.fileName || undefined,
        }, { timeout: 180000 });
        if (res?.data?.data) {
          setAiAnalyses((prev) => {
            const idx = prev.findIndex((a) => a.id === res.data.data.id);
            if (idx >= 0) { const next = [...prev]; next[idx] = res.data.data; return next; }
            return [...prev, res.data.data];
          });
        }
      } catch (e) {
        setLocalError(`Failed on "${f.fileName}": ${e.response?.data?.message || "error"}`);
      }
    }
    setAnalyzingKey(null);
    setBatchProgress(null);
  };

  const handleDelete = async (file) => {
    if (!window.confirm(`Delete "${file.fileName || "this document"}"?`)) return;
    setLocalError("");
    const key = docKey(file);
    setDeletingKey(key);
    try {
      // Remove matching AI analysis row(s) from DB when present.
      const matches = aiAnalyses.filter((a) => {
        const r = a.result || a;
        return (
          (file.publicId && (a.documentPublicId === file.publicId || r.documentPublicId === file.publicId)) ||
          (file.url && (a.documentUrl === file.url || r.documentUrl === file.url)) ||
          (a.fileName === file.fileName || r.fileName === file.fileName)
        );
      });
      for (const a of matches) {
        if (a.id && bankAnalysisId) {
          try {
            await axiosDelete(`/ai-analysis/${bankAnalysisId}/ai-analyses/${a.id}`);
          } catch { /* continue */ }
        }
      }
      setAiAnalyses((prev) => prev.filter((a) => !matches.some((m) => m.id === a.id)));

      if (file.source === "application" && file.applicationFileId) {
        const appId = String(applicationIdProp || applicationData?._id || applicationData?.id || "").trim();
        if (appId) {
          await axiosDelete(`/applications/${appId}/files/${file.applicationFileId}`);
          await dispatch(getApplicationByApplicationId(String(appId)));
        }
      } else {
        setLocalDocuments((prev) => prev.filter((d) => docKey(d) !== key));
      }
    } catch (e) {
      setLocalError(e.response?.data?.message || e.message || "Failed to delete document");
    }
    setDeletingKey(null);
  };

  // Apply the AI analysis into editable positions + the bank analysis month table.
  const handleApply = async (file, analysis) => {
    if (!bankAnalysisId || !analysis) return;
    const key = docKey(file);
    setApplyingKey(key);
    setLocalError("");

    const applicationRef =
      String(applicationData?._id || applicationData?.id || applicationIdProp || "").trim();

    // 1) Positions — map AI detections into Position create payloads.
    const detected = (analysis.positions || []).map((p) => ({
      lender: String(p.lender || "").trim(),
      frequency: p.frequency === "One-time" ? "Monthly" : (p.frequency || "Weekly"),
      installment: p.installment != null ? Number(p.installment) : NaN,
      amountFunded: p.amountFunded != null ? Number(p.amountFunded) : NaN,
      status: String(p.status || "ACTIVE").toUpperCase() === "ACTIVE" ? "ACTIVE" : String(p.status || "ACTIVE"),
      startingDate: p.firstDate || "",
      dateOfLastPymt: p.lastDate || "",
      totalRepayments: p.totalPaidInStatement != null ? Number(p.totalPaidInStatement) : NaN,
      monthlyMcaPmts: p.monthlyMcaPmts != null ? Number(p.monthlyMcaPmts) : NaN,
    })).filter((p) => p.lender);

    // 2) Bank analysis rows — API expects rows[] with BankAnalysisRow column names.
    const allTx = Array.isArray(analysis.transactions) ? analysis.transactions : [];
    const summary = analysis.summary || {};
    const monthList = Array.isArray(analysis.months) && analysis.months.length > 0
      ? analysis.months
      : [{
          month: analysis.statementPeriod?.start
            ? String(analysis.statementPeriod.start).slice(0, 7)
            : "",
          label: analysis.statementPeriod?.start
            ? monthLabel(String(analysis.statementPeriod.start).slice(0, 7))
            : "Statement",
        }];
    const dailyBals = Array.isArray(analysis.dailyBalances) ? analysis.dailyBalances : [];
    const catVal = (cats, cat, dir) => {
      const c = (cats || []).find((x) => x.category === cat);
      if (!c) return 0;
      return dir === "credit" ? (c.creditTotal || 0) : (c.debitTotal || 0);
    };

    const bankApiRows = monthList.map((m) => {
      const mtx = m.month ? allTx.filter((t) => t.month === m.month) : allTx;
      const v = mtx.length > 0
        ? computeView(mtx)
        : {
            categoryTotals: [],
            totalCredits: Number(summary.totalCredits) || 0,
            totalDebits: Number(summary.totalDebits) || 0,
          };
      const c = v.categoryTotals || [];
      const mbals = dailyBals.filter((d) => !m.month || (d.date || "").startsWith(m.month));
      const avgFromDaily = mbals.length
        ? round2(mbals.reduce((a, d) => a + d.closing, 0) / mbals.length)
        : null;
      const avg =
        avgFromDaily != null
          ? avgFromDaily
          : (analysis.dailyAverageBalance != null ? Number(analysis.dailyAverageBalance) : 0);
      const negDays = mbals.filter((d) => d.closing < 0).length;
      const loan = catVal(c, "loanInflow", "credit");
      const transfer = catVal(c, "transfers", "credit") + catVal(c, "wires", "credit");
      const deposit = catVal(c, "cashDeposit", "credit");
      const other =
        catVal(c, "zelle", "credit") +
        catVal(c, "cashApp", "credit") +
        catVal(c, "venmo", "credit") +
        catVal(c, "other", "credit");
      const label = toBankMonthLabel(m.label || m.month || "Statement");
      return {
        monthLabel: label,
        monthDate: monthDateFromBankLabel(label),
        totalCredit: round2(v.totalCredits || 0),
        loanTransfer: round2(loan + transfer),
        deposit: round2(deposit),
        other: round2(other),
        nsfNegDays:
          (c.find((x) => x.category === "nsf")?.count || 0) +
          (c.find((x) => x.category === "overdraft")?.count || 0),
        lowBlcDays: negDays,
        avgDailyBlc: Number.isFinite(avg) ? round2(avg) : 0,
      };
    });

    try {
      // Prefer merging into existing month rows so Apply does not wipe other banks' months.
      let existingRows = [];
      try {
        const existingRes = await axiosGet(
          `/bank-analysis?${new URLSearchParams({
            application: String(applicationIdProp || applicationData?._id || ""),
          }).toString()}`,
        );
        const list = existingRes?.data?.data ?? existingRes?.data ?? [];
        const match = Array.isArray(list)
          ? list.find((b) => String(b._id || b.id) === String(bankAnalysisId)) || list[0]
          : null;
        existingRows = Array.isArray(match?.rows) ? match.rows : [];
      } catch {
        existingRows = [];
      }

      const byMonth = new Map();
      for (const row of existingRows) {
        const label = toBankMonthLabel(row.monthLabel || row.month || "");
        if (!label) continue;
        byMonth.set(label.toLowerCase(), {
          monthLabel: label,
          monthDate: row.monthDate
            ? new Date(row.monthDate).toISOString()
            : monthDateFromBankLabel(label),
          totalCredit: Number(row.totalCredit) || 0,
          loanTransfer: Number(row.loanTransfer) || 0,
          deposit: Number(row.deposit) || 0,
          other: Number(row.other) || 0,
          nsfNegDays: Number(row.nsfNegDays) || 0,
          lowBlcDays: Number(row.lowBlcDays) || 0,
          avgDailyBlc: Number(row.avgDailyBlc) || 0,
        });
      }
      for (const row of bankApiRows) {
        byMonth.set(String(row.monthLabel).toLowerCase(), row);
      }
      const mergedRows = Array.from(byMonth.values());

      // Bank table: PUT (not POST) — update endpoint owns rows replacement.
      await axiosPut(`/bank-analysis/${bankAnalysisId}`, {
        rows: mergedRows,
      });

      let positionsCreated = 0;
      if (applicationRef && detected.length > 0) {
        let existing = [];
        try {
          const posRes = await axiosGet(
            `/positions?${new URLSearchParams({ application: applicationRef }).toString()}`,
          );
          const payload = posRes?.data?.data ?? posRes?.data;
          existing = Array.isArray(payload) ? payload : (payload?.positions || []);
        } catch {
          existing = [];
        }

        const existingSigs = new Set(
          existing.map((r) => {
            const lender = String(r.funder || r.lender || "").trim().toLowerCase();
            const installment = parseNum(r.ach ?? r.installment) || "";
            return `${lender}|${installment}`;
          }),
        );


        for (let i = 0; i < detected.length; i += 1) {
          const p = detected[i];
          const installment = Number.isFinite(p.installment) && p.installment > 0 ? p.installment : 0;
          const funded =
            Number.isFinite(p.amountFunded) && p.amountFunded > 0
              ? p.amountFunded
              : installment > 0
                ? installment
                : 0;
          if (!funded) {
            continue;
          }
          const sig = `${p.lender.toLowerCase()}|${installment || ""}`;
          if (existingSigs.has(sig)) {
            continue;
          }

          const fundingDate = p.startingDate || ""; // blank stays empty, never today
          const payback =
            Number.isFinite(p.totalRepayments) && p.totalRepayments > 0
              ? p.totalRepayments
              : round2(funded * 1.49);

          await axiosPost("/positions", {
            position: `Position ${existing.length + positionsCreated + 1}`,
            factorRate: "1.49",
            ach: String(installment || funded),
            percentOfGross: "0",
            funder: p.lender,
            paybackAmount: payback,
            fundingDate,
            activeStatus: String(p.status || "").toUpperCase() === "ACTIVE",
            fundedAmount: funded,
            frequency: p.frequency || "Weekly",
            closeDate: fundingDate,
            application: applicationRef,
            status: p.status || "ACTIVE",
            loanAmount: funded,
            monthlyMcaPmts: Number.isFinite(p.monthlyMcaPmts) ? p.monthlyMcaPmts : undefined,
            mcaRemit: 0,
            lastPaymentDate: p.dateOfLastPymt || undefined,
          });
          existingSigs.add(sig);
          positionsCreated += 1;
        }

        await dispatch(getPositions({ application: applicationRef }));
      }

      notifyManualAnalysisRefreshed(applicationIdProp);
      notifyManualAnalysisRefreshed(applicationData?._id);
      notifyManualAnalysisRefreshed(applicationData?.id);
      notifyManualAnalysisRefreshed(applicationData?.applicationId);

      setApplyingKey(null);
      setAppliedKeys((prev) => new Set(prev).add(key));
      toast.success(
        positionsCreated > 0
          ? `Applied to manual analysis (${positionsCreated} position${positionsCreated === 1 ? "" : "s"}).`
          : "Applied AI bank totals to manual analysis.",
      );
      if (onApplied) onApplied();
    } catch (e) {
      setApplyingKey(null);
      const msg = e.response?.data?.message || e.message || "Failed to apply";
      setLocalError(msg);
      toast.error(msg);
    }
  };

  const handleSetOpening = async (file, openingBalance) => {
    if (!bankAnalysisId) return;
    setLocalError("");
    setTaggingKey(docKey(file));
    try {
      const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize`, {
        documentPublicId: file.publicId || undefined,
        documentUrl: file.url || undefined,
        openingBalance,
      });
      if (res?.data?.data) {
        setAiAnalyses((prev) => prev.map((a) => a.id === res.data.data.id ? res.data.data : a));
      }
    } catch (e) {
      setLocalError(e.response?.data?.message || "Failed to update opening balance");
    }
    setTaggingKey(null);
  };

  // Override Total Credits / Total Debits from the printed statement summary (no OCR).
  const handleSetTotals = async (file, payload = {}) => {
    if (!bankAnalysisId) return;
    setLocalError("");
    setTaggingKey(docKey(file));
    try {
      const res = await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize`, {
        documentPublicId: file.publicId || undefined,
        documentUrl: file.url || undefined,
        ...payload,
      });
      if (res?.data?.data) {
        setAiAnalyses((prev) => prev.map((a) => a.id === res.data.data.id ? res.data.data : a));
      }
    } catch (e) {
      setLocalError(e.response?.data?.message || "Failed to update totals");
    }
    setTaggingKey(null);
  };


  const handleTag = async (file, description, decision, current) => {
    if (!bankAnalysisId || !description) return;
    setLocalError("");
    setTaggingKey(docKey(file));
    const removeTag = !decision || current === decision;
    try {
      await axiosPost("/ai-analysis/mca-tags", { description, decision, removeTag });
      await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize-all`);
      await refreshAnalyses();
      await refreshTags();
    } catch (e) {
      setLocalError(e.response?.data?.message || "Failed to save tag");
    }
    setTaggingKey(null);
  };

  const handleCombinedTag = async (description, decision, current) => {
    if (!bankAnalysisId || !description) return;
    setLocalError("");
    setTaggingKey("combined-tag");
    const removeTag = !decision || current === decision;
    try {
      await axiosPost("/ai-analysis/mca-tags", { description, decision, removeTag });
      await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize-all`);
      await refreshAnalyses();
      await refreshTags();
    } catch (e) {
      setLocalError(e.response?.data?.message || "Failed to save tag");
    }
    setTaggingKey(null);
  };

  const handleTrustPosition = async (position, decision) => {
    if (!bankAnalysisId || !position || !decision) return;
    const desc = position?.transactions?.[0]?.description || position?.lender || "";
    if (!desc) return;
    const lender = position.lender || "";
    const removeTag = position.mcaTag === decision;
    // Optimistic UI — reflect Yes/No instantly while recompute runs.
    setTrustOverrides((prev) => ({
      ...prev,
      [lender]: removeTag ? "__clear__" : decision,
    }));
    setLocalError("");
    setTaggingKey("trust");
    try {
      await axiosPost("/ai-analysis/mca-tags", { description: desc, decision, removeTag });
      await axiosPost(`/ai-analysis/${bankAnalysisId}/recategorize-all`);
      await refreshAnalyses();
      await refreshTags();
      setTrustOverrides((prev) => {
        const next = { ...prev };
        delete next[lender];
        return next;
      });
    } catch (e) {
      setTrustOverrides((prev) => {
        const next = { ...prev };
        delete next[lender];
        return next;
      });
      setLocalError(e.response?.data?.message || "Failed to update MCA Trust");
    }
    setTaggingKey(null);
  };

  return (
    <div className="flex-1 overflow-auto min-h-0">
      <div className="space-y-4">
        <div className="flex items-center mt-4" style={{ gap: 0 }}>
          <button
            type="button"
            onClick={() => setActiveTab(TAB.DOCUMENTS)}
            className="inline-flex items-center justify-center py-3 px-6 text-sm font-bold tracking-wide focus:outline-none transition-colors min-w-[160px]"
            style={{
              clipPath: DOC_ACTIVE_SHAPE,
              background: isDocumentsActive ? ACTIVE_BG : INACTIVE_BG,
              color: isDocumentsActive ? "#ffffff" : INACTIVE_TEXT,
              marginLeft: 0,
              zIndex: 50,
              position: "relative",
              letterSpacing: "0.05em",
            }}
          >
            DOCUMENTS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab(TAB.BANK_ANALYSIS)}
            className="inline-flex items-center justify-center py-3 px-6 text-sm font-bold tracking-wide focus:outline-none transition-colors min-w-[180px]"
            style={{
              clipPath: BANK_ACTIVE_SHAPE,
              marginLeft: `-${ARROW_PX}px`,
              background: isBankAnalysisActive ? ACTIVE_BG : INACTIVE_BG,
              color: isBankAnalysisActive ? "#ffffff" : INACTIVE_TEXT,
              zIndex: 1,
              position: "relative",
              letterSpacing: "0.05em",
            }}
          >
            BANK ANALYSIS
          </button>
        </div>

        <div className="mt-2">
          {activeTab === TAB.DOCUMENTS && (
            <>
              {bankAnalysisInitLoading && (
                <p className="mt-2 text-sm text-slate-500">Preparing bank analysis for AI…</p>
              )}
              {!bankAnalysisInitLoading && !bankAnalysisId && bankAnalysisError && (
                <p className="mt-2 text-sm text-red-600">{bankAnalysisError}</p>
              )}

              <div className="space-y-3">
                {/* Compact, collapsible upload bar (minimized by default to free space for analysis) */}
                <div>
                  <button
                    type="button"
                    onClick={() => setManageOpen((v) => !v)}
                    className="flex items-center gap-2 text-sm font-semibold text-slate-800 focus:outline-none hover:opacity-80"
                  >
                    <Chevron open={showUpload} />
                    Upload Documents{hasDocuments ? ` (${documents.length})` : ""}
                  </button>
                  {showUpload && (
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <div
                        className="border-2 border-dashed rounded-lg bg-slate-50/60 flex items-center gap-2 cursor-pointer px-3 py-2"
                        style={{ borderColor: "#d4d7dd" }}
                        role="button"
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragOver}
                        onDrop={handleDrop}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 12v6"/><path d="m15 15-3-3-3 3"/></svg>
                        <span className="text-xs text-slate-500">Drop files or click — any format, max 10&nbsp;MB each</span>
                        {selectedFiles.length > 0 && <span className="text-xs font-medium text-slate-700">· {selectedFiles.length} selected</span>}
                      </div>
                      <input ref={fileInputRef} type="file" multiple onChange={handleFileInputChange} className="hidden" />
                      <button
                        type="button"
                        onClick={handleSubmitDocuments}
                        disabled={uploading}
                        className="inline-flex items-center px-4 py-1.5 rounded text-xs font-medium text-white shadow-sm hover:opacity-95 focus:outline-none disabled:opacity-60"
                        style={{ background: "#1e3a5f" }}
                      >
                        {uploading ? "Uploading…" : "Upload"}
                      </button>
                    </div>
                  )}
                </div>

                {(localError || analyzeError) && (
                  <p className="text-sm text-red-600">{localError || analyzeError}</p>
                )}

                <div className="pt-4">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <h4 className="text-sm font-semibold text-slate-800">
                      Application Documents
                      {documents.length > 0 ? ` (${documents.length})` : ""}
                    </h4>
                    {Array.isArray(documents) && documents.length > 0 && (
                      <div className="flex items-center gap-2">
                        {batchProgress && (
                          <span className="text-[11px] text-slate-500">
                            Analyzing {batchProgress.done + 1}/{batchProgress.total}: {batchProgress.name}…
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAnalyzeAll("pending")}
                          disabled={!!batchProgress || !!analyzingKey || documents.filter(isAiSupported).every((f) => analysisForDoc(f))}
                          className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium text-white shadow-sm hover:opacity-95 focus:outline-none disabled:opacity-50"
                          style={{ background: "#1e3a5f" }}
                          title="Run AI on every not-yet-analyzed statement"
                        >
                          {batchProgress ? "Running…" : `Run AI on all (${documents.filter(isAiSupported).filter((f) => !analysisForDoc(f)).length})`}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnalyzeAll("all")}
                          disabled={!!batchProgress || !!analyzingKey}
                          className="inline-flex items-center px-3 py-1.5 rounded text-xs font-medium focus:outline-none border disabled:opacity-50 hover:bg-slate-50"
                          style={{ borderColor: "#cbd5e1", color: "#475569" }}
                          title="Re-run AI on all statements (overwrites existing analyses)"
                        >
                          Re-run all
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "#e2e8f0" }}>
                    <table className="min-w-full text-xs text-left">
                      <thead className="uppercase text-[12px] font-semibold" style={{ backgroundColor: "#f1f5f9", color: "#475569" }}>
                        <tr>
                          <th className="px-4 py-2">File Name</th>
                          <th className="px-4 py-2">Content Type</th>
                          <th className="px-4 py-2">File Size</th>
                          <th className="px-4 py-2">AI Status</th>
                          <th className="px-4 py-2">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(documents) && documents.length > 0 ? (
                          documents.map((file, idx) => {
                            const key = docKey(file);
                            const analysis = analysisForDoc(file);
                            const supported = isAiSupported(file);
                            const isAnalyzing = analyzingKey === key;
                            return (
                              <tr key={file.publicId || file.url || file.applicationFileId || idx} className="border-t" style={{ borderColor: "#e2e8f0" }}>
                                <td className="px-4 py-2">
                                  <div className="flex flex-col">
                                    <span>{file.fileName || "Document"}</span>
                                    {file.source === "application" && (
                                      <span className="text-[10px] text-slate-400 uppercase tracking-wide">From Documents tab</span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-2">{file.contentType || "-"}</td>
                                <td className="px-4 py-2">{file.size ? `${(file.size / 1024).toFixed(1)} KB` : "-"}</td>
                                <td className="px-4 py-2">
                                  {analysis ? (
                                    <span className="text-green-700 font-medium">Analyzed</span>
                                  ) : !supported ? (
                                    <span className="text-slate-400">Not supported</span>
                                  ) : (
                                    <span className="text-slate-400">Not analyzed</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-xs">
                                  <div className="flex items-center gap-3">
                                    {file.url && (
                                      <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        View
                                      </a>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleAnalyze(file)}
                                      disabled={!supported || isAnalyzing || deletingKey === key || bankAnalysisInitLoading}
                                      className="rounded px-3 py-1 text-[11px] font-medium text-white focus:outline-none hover:opacity-90 disabled:opacity-60"
                                      style={{ background: "#1e3a5f" }}
                                      title={!supported ? "Only PDF and image files can be analyzed" : undefined}
                                    >
                                      {isAnalyzing ? "Analyzing…" : analysis ? "Re-run AI" : "Run AI"}
                                    </button>
                                    {file.source !== "application" && (
                                      <button
                                        type="button"
                                        onClick={() => handleDelete(file)}
                                        disabled={deletingKey === key || isAnalyzing}
                                        className="rounded px-3 py-1 text-[11px] font-medium focus:outline-none hover:opacity-90 disabled:opacity-60"
                                        style={{ background: "#fee2e2", color: "#b91c1c" }}
                                      >
                                        {deletingKey === key ? "Deleting…" : "Delete"}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td className="px-4 py-6 text-center text-slate-400" colSpan={5}>
                              No documents found. Upload files on the Documents tab first.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* AI results — per statement, with a Combined (all statements) tab */}
                {analyzedDocs.length > 0 && (
                  <div>
                    {analyzedDocs.length >= 2 && (
                      <div className="flex items-center gap-1 mb-3 flex-wrap">
                        <span className="text-[11px] text-slate-500 mr-1">Result:</span>
                        <button
                          type="button"
                          onClick={() => setResultTab("combined")}
                          className="px-3 py-1 rounded-t text-xs font-bold focus:outline-none"
                          style={{ background: resultTab === "combined" ? "#1e3a5f" : "#e6e7e8", color: resultTab === "combined" ? "#fff" : "#334155" }}
                        >
                          Combined ({analyzedDocs.length})
                        </button>
                        {analyzedDocs.map((file, i) => {
                          const k = docKey(file);
                          const active = resultTab === k;
                          return (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setResultTab(k)}
                              className="px-3 py-1 rounded-t text-xs font-semibold focus:outline-none max-w-[180px] truncate"
                              style={{ background: active ? "#1e3a5f" : "#e6e7e8", color: active ? "#fff" : "#334155" }}
                              title={file.fileName}
                            >
                              {file.fileName || `Statement ${i + 1}`}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Combined view */}
                    {resultTab === "combined" && (
                      <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
                        {combinedLoading && !combined ? (
                          <p className="text-sm text-slate-500 p-4">Building combined analysis…</p>
                        ) : combined ? (
                          <AiResultPanel
                            analysis={combined}
                            statements={analyzedDocs.map((f) => analysisForDoc(f)).filter(Boolean)}
                            onApply={() => handleApply({ publicId: "__combined__", fileName: "Combined" }, combined)}
                            applying={applyingKey === "__combined__"}
                            applied={appliedKeys.has("__combined__")}
                            onTag={handleCombinedTag}
                            onTrust={handleTrustPosition}
                            tagging={taggingKey === "combined-tag" || taggingKey === "trust"}
                            categoryOptions={categoryOptions}
                            learnedTags={learnedTags}
                            onTrain={handleTrainKeyword}
                            onUntrain={handleUntrain}
                            trainBusy={trainBusy}
                          />
                        ) : (
                          <p className="text-sm text-slate-500 p-4">Combined analysis unavailable.</p>
                        )}
                      </div>
                    )}

                    {/* Per-statement views */}
                    {analyzedDocs.map((file) => {
                      const key = docKey(file);
                      if (resultTab !== key) return null;
                      const analysis = analysisForDoc(file);
                      if (!analysis) return null;
                      return (
                        <div key={`ai-${key}`} className="rounded-lg border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
                          <AiResultPanel
                            analysis={analysis}
                            onApply={() => handleApply(file, analysis)}
                            applying={applyingKey === key}
                            applied={appliedKeys.has(key)}
                            onTag={(description, decision, current) => handleTag(file, description, decision, current)}
                            onSetOpening={(ob) => handleSetOpening(file, ob)}
                            onSetTotals={(payload) => handleSetTotals(file, payload)}
                            onTrust={handleTrustPosition}
                            trustOverride={trustOverrides}
                            tagging={taggingKey === key || taggingKey === "trust"}
                            categoryOptions={categoryOptions}
                            learnedTags={learnedTags}
                            onTrain={handleTrainKeyword}
                            onUntrain={handleUntrain}
                            trainBusy={trainBusy}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === TAB.BANK_ANALYSIS && (
            <>
              <h3 className="text-lg font-semibold text-slate-800">Bank Analysis</h3>

              {!bankAnalysisId && (
                <p className="mt-2 text-sm text-slate-500">
                  Apply an AI analysis to Manual Analysis to populate this preview, or edit months on the Manual Analysis tab.
                </p>
              )}

              {bankAnalysisId && bankAnalysisLoading && (
                <p className="mt-2 text-sm text-slate-500">Loading bank analysis…</p>
              )}

              {bankAnalysisId && bankAnalysisError && (
                <p className="mt-2 text-sm text-red-600">{String(bankAnalysisError)}</p>
              )}

              {bankAnalysisId && !bankAnalysisLoading && doc && isDocForCurrentId && (
                <div className="mt-4 space-y-6">
                  {bankTables.length > 0 ? (
                    bankTables.map((rows, bankIndex) => (
                      <div key={bankIndex} className="rounded-lg border overflow-hidden bg-white/90" style={{ borderColor: "var(--ledgerx-border)" }}>
                        <div className="px-2 py-2 text-base font-semibold text-slate-700" style={{ backgroundColor: "#aed6efbf" }}>
                          {manualBankMeta.bankName || `Bank Analysis ${bankIndex + 1}`}
                          {bankAccountNumbers[bankIndex] != null && String(bankAccountNumbers[bankIndex]).trim() !== "" && String(bankAccountNumbers[bankIndex]) !== "—" && (
                            <span className="ml-2 text-slate-600">Account: ****{String(bankAccountNumbers[bankIndex]).slice(-4)}</span>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs border-collapse" style={{ borderColor: "var(--ledgerx-border)" }}>
                            <thead>
                              <tr className="border-b font-semibold text-slate-500 uppercase text-[13px]" style={{ borderColor: "var(--ledgerx-border)", background: "var(--ledgerx-content-bg)" }}>
                                {FIELD_LABELS.map((l) => <th key={l} className="px-2 py-2 text-left">{l}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(rows) ? rows : []).map((row, rIdx) => (
                                <tr key={rIdx} className="border-b text-slate-800" style={{ borderColor: "var(--ledgerx-border)" }}>
                                  {FIELD_KEYS.map((key) => (
                                    <td key={key} className="px-2 py-1.5">{cellDisplay(key, row[key])}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border overflow-hidden bg-white/90" style={{ borderColor: "var(--ledgerx-border)" }}>
                      <div className="px-4 py-2 text-base font-semibold text-slate-700" style={{ backgroundColor: "#aed6efbf" }}>Bank Analysis</div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs border-collapse" style={{ borderColor: "var(--ledgerx-border)" }}>
                          <thead>
                            <tr className="border-b font-semibold text-slate-500 uppercase text-[11px]" style={{ borderColor: "var(--ledgerx-border)", background: "var(--ledgerx-content-bg)" }}>
                              {FIELD_LABELS.map((l) => <th key={l} className="px-2 py-1.5 text-left">{l}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="px-4 py-6 text-center text-slate-400" colSpan={FIELD_LABELS.length}>No bank table data available</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Full AI analysis preview (same panel as Documents tab) */}
                  {aiAnalyses.length > 0 && (
                    <div className="space-y-6">
                      <h4 className="text-base font-semibold text-slate-800">Full AI Analysis</h4>
                      {Array.isArray(documents) &&
                        documents.map((file, idx) => {
                          const analysis = analysisForDoc(file);
                          if (!analysis) return null;
                          const key = docKey(file);
                          return (
                            <div key={`ba-ai-${file.publicId || file.url || idx}`} className="rounded-lg border overflow-hidden" style={{ borderColor: "#e2e8f0" }}>
                              <AiResultPanel
                                analysis={analysis}
                                onApply={() => handleApply(file, analysis)}
                                applying={applyingKey === key}
                                applied={appliedKeys.has(key)}
                                onTag={(description, decision, current) => handleTag(file, description, decision, current)}
                                onSetOpening={(ob) => handleSetOpening(file, ob)}
                                onSetTotals={(payload) => handleSetTotals(file, payload)}
                                onTrust={handleTrustPosition}
                                trustOverride={trustOverrides}
                                tagging={taggingKey === key || taggingKey === "trust"}
                                categoryOptions={categoryOptions}
                                learnedTags={learnedTags}
                                onTrain={handleTrainKeyword}
                                onUntrain={handleUntrain}
                                trainBusy={trainBusy}
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
