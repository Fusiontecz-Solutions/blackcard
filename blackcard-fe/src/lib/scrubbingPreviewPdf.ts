import jsPDF from "jspdf";
import { formatNumberUS, parseNumberUS } from "@/lib/utils";

export type ScrubbingPdfOffer = {
  decision: "approved" | "declined" | null;
  declinedReason?: string;
  offer: string;
  rate: string;
  term: string;
  fees: string;
  frequency: string;
  repayPerPeriod: string;
  monthlyPayment: string;
  ourRemit: string;
  position: string;
  notes: string;
};

export type ScrubbingPdfBankRow = {
  month: string;
  totalCredit: number;
  fundingAmt: number;
  transfers: number;
  netCredit: number;
  avgDailyBlc: number;
  nsfNegDays: number;
};

export type ScrubbingPdfBank = {
  accountNumber: string;
  rows: ScrubbingPdfBankRow[];
};

export type ScrubbingPdfPosition = {
  lender: string;
  status: string;
  frequency: string;
  amountFunded: number;
  installment: number;
  monthlyMcaPmts: number;
  mcaRemit: number;
  mcaPercentPaid: number;
  fundingDateLabel: string;
  lastPaymentLabel: string;
  monthLabel: string;
};

export type ScrubbingPdfPayload = {
  clientName: string;
  displayDate: string;
  signedBy?: string;
  offer: ScrubbingPdfOffer;
  banks: ScrubbingPdfBank[];
  positions: ScrubbingPdfPosition[];
  metrics: {
    activeCount: number;
    existingRemit: number;
    totalMonthly: number;
    totalDaily: number;
    existingActivePositionsCount: number;
    ourRemitNum: number;
    totalRemit: number;
    avgNetCredit: number;
    recentMonthLeverage: number | null;
  };
};

type PdfCell = {
  text: string;
  bold?: boolean;
  color?: [number, number, number];
  bg?: [number, number, number];
  align?: "left" | "center" | "right";
  fontSize?: number;
};

function money(value: unknown): string {
  const n = typeof value === "number" ? value : parseNumberUS(value);
  if (!Number.isFinite(n)) return "-";
  return `$ ${formatNumberUS(n)}`;
}

function pct(value: unknown, digits = 2): string {
  const n = typeof value === "number" ? value : parseNumberUS(value);
  if (!Number.isFinite(n)) return "-";
  return `${n.toFixed(digits)}%`;
}

/**
 * Programmatic Preview PDF matching modal/copy layout (no html2canvas).
 */
export function downloadScrubbingPreviewPdf(
  payload: ScrubbingPdfPayload,
  fileName: string,
): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const M = 32;
  const CW = PAGE_W - M * 2;
  let y = M;

  const INK: [number, number, number] = [15, 23, 42];
  const MUTED: [number, number, number] = [100, 116, 139];
  const HAIR: [number, number, number] = [148, 163, 184];
  const GREEN: [number, number, number] = [16, 185, 129];
  const RED: [number, number, number] = [239, 68, 68];
  const OFFER_HDR: [number, number, number] = [85, 153, 85];
  const BLUE_HDR: [number, number, number] = [174, 214, 239];
  const VALUE_BLUE: [number, number, number] = [61, 92, 134];
  const OFFER_GREEN: [number, number, number] = [12, 170, 70];
  const AMBER: [number, number, number] = [186, 141, 20];
  const NET_BG: [number, number, number] = [235, 243, 255];
  const NSF_BG: [number, number, number] = [255, 241, 242];
  const ZEBRA: [number, number, number] = [243, 244, 246];
  const WHITE: [number, number, number] = [255, 255, 255];

  const ensure = (space: number) => {
    if (y + space > PAGE_H - M) {
      doc.addPage();
      y = M;
      return true;
    }
    return false;
  };

  const measureLines = (text: string, width: number, fontSize: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(String(text || "-"), Math.max(12, width - 8)) as string[];
  };

  const drawSectionHeader = (
    title: string,
    bg: [number, number, number],
    fg: [number, number, number] = WHITE,
    rightText?: string,
  ) => {
    const h = 24;
    ensure(h + 8);
    doc.setFillColor(...bg);
    doc.rect(M, y, CW, h, "F");
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.6);
    doc.rect(M, y, CW, h, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...fg);
    doc.text(title.toUpperCase(), M + 10, y + 16);
    if (rightText) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(rightText, M + CW - 10, y + 16, { align: "right" });
    }
    y += h;
  };

  /** Modal-style bordered grid. Cells can span via colSpan on widths array by merging. */
  const drawRows = (
    rows: PdfCell[][],
    colWidths: number[],
  ) => {
    const padX = 5;
    const padY = 5;
    const lineH = 10;

    rows.forEach((cells) => {
      // Normalize: if fewer cells than cols, last cell may be intended colspan —
      // we only support exact cell count matching widths length OR 2 cells where second spans rest.
      let widths = [...colWidths];
      let rowCells = [...cells];
      if (rowCells.length === 2 && colWidths.length === 4) {
        // Notes row style: label | value spanning 3
        widths = [colWidths[0], colWidths[1] + colWidths[2] + colWidths[3]];
      } else if (rowCells.length === 4 && colWidths.length === 6) {
        // leverage row2/3: label|value(span2)|label|value(span2)
        widths = [
          colWidths[0],
          colWidths[1] + colWidths[2],
          colWidths[3],
          colWidths[4] + colWidths[5],
        ];
      }

      const lineSets = rowCells.map((cell, i) => {
        const fs = cell.fontSize ?? (cell.bold ? 9 : 8);
        return measureLines(cell.text, widths[i], fs, !!cell.bold);
      });
      const maxLines = Math.max(1, ...lineSets.map((l) => l.length));
      const rowH = Math.max(20, padY * 2 + maxLines * lineH);

      ensure(rowH + 2);

      // background + outer border
      doc.setDrawColor(...HAIR);
      doc.setLineWidth(0.5);
      let x = M;
      rowCells.forEach((cell, i) => {
        const w = widths[i];
        if (cell.bg) {
          doc.setFillColor(...cell.bg);
          doc.rect(x, y, w, rowH, "F");
        }
        doc.setDrawColor(...HAIR);
        doc.rect(x, y, w, rowH, "S");
        x += w;
      });

      x = M;
      rowCells.forEach((cell, i) => {
        const w = widths[i];
        const fs = cell.fontSize ?? (cell.bold ? 9 : 8);
        const lines = lineSets[i];
        doc.setFont("helvetica", cell.bold ? "bold" : "normal");
        doc.setFontSize(fs);
        doc.setTextColor(...(cell.color || INK));
        const textY = y + padY + 8;
        lines.forEach((line, li) => {
          const ly = textY + li * lineH;
          if (cell.align === "right") {
            doc.text(line, x + w - padX, ly, { align: "right" });
          } else if (cell.align === "center") {
            doc.text(line, x + w / 2, ly, { align: "center" });
          } else {
            doc.text(line, x + padX, ly);
          }
        });
        x += w;
      });

      y += rowH;
    });
  };

  const drawDataTable = (
    headers: string[],
    rows: string[][],
    colWeights: number[],
    headerBgs?: Array<[number, number, number] | undefined>,
  ) => {
    const weightSum = colWeights.reduce((a, b) => a + b, 0);
    const widths = colWeights.map((w) => (CW * w) / weightSum);

    const headerCells: PdfCell[] = headers.map((h, i) => ({
      text: h,
      bold: true,
      fontSize: 7.5,
      color: MUTED,
      bg: headerBgs?.[i] || ([241, 245, 249] as [number, number, number]),
    }));
    drawRows([headerCells], widths);

    rows.forEach((row, ri) => {
      const cells: PdfCell[] = row.map((text, i) => {
        const isStatus = headers[i]?.toLowerCase() === "status";
        const upper = String(text).toUpperCase();
        return {
          text,
          fontSize: 7.5,
          bold: isStatus && upper === "ACTIVE",
          color:
            isStatus && upper === "ACTIVE"
              ? ([21, 128, 61] as [number, number, number])
              : INK,
          bg: ri % 2 === 1 ? ZEBRA : WHITE,
        };
      });
      drawRows([cells], widths);
    });
  };

  const {
    clientName,
    displayDate,
    offer,
    banks,
    positions,
    metrics,
    signedBy,
  } = payload;
  const isDeclined = offer.decision === "declined";
  const isApproved = offer.decision === "approved";

  // ── Header (matches modal body: Client Name / Date + Approved pill) ──
  ensure(36);
  {
    const metaY = y + 12;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("CLIENT NAME:", M, metaY);
    let x = M + doc.getTextWidth("CLIENT NAME: ") + 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(clientName || "-", x, metaY);

    x += doc.getTextWidth(clientName || "-") + 28;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("DATE:", x, metaY);
    x += doc.getTextWidth("DATE: ") + 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(displayDate || "-", x, metaY);

    if (isApproved || isDeclined) {
      const badge = isDeclined ? "Declined" : "Approved";
      const badgeW = 86;
      const badgeH = 18;
      doc.setFillColor(...(isDeclined ? RED : GREEN));
      doc.rect(M + CW - badgeW, y + 2, badgeW, badgeH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text(badge, M + CW - badgeW / 2, y + 14, { align: "center" });
    }
    y += 28;
  }

  if (isDeclined && offer.declinedReason) {
    ensure(24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...RED);
    doc.text("Decline Reason:", M, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(offer.declinedReason, CW - 95) as string[];
    doc.text(lines, M + 90, y);
    y += Math.max(16, lines.length * 11 + 4);
  }

  // Column widths matching modal 4-col Offer table
  const offerCols = [CW * 0.22, CW * 0.28, CW * 0.22, CW * 0.28];
  // Leverage 6-col like modal
  const levCols = [
    CW * 0.18,
    CW * 0.15,
    CW * 0.18,
    CW * 0.15,
    CW * 0.18,
    CW * 0.16,
  ];

  // ── Offer ──
  if (isApproved) {
    const offerNum = parseNumberUS(offer.offer);
    const rateNum = parseNumberUS(offer.rate);
    const repaymentTotal =
      Number.isFinite(offerNum) && Number.isFinite(rateNum) && rateNum > 0
        ? offerNum * rateNum
        : NaN;
    const frequencyRepay =
      offer.frequency && offer.repayPerPeriod
        ? `${offer.frequency} / $ ${offer.repayPerPeriod}`
        : offer.frequency || "-";

    drawSectionHeader("Offer", OFFER_HDR);
    drawRows(
      [
        [
          { text: "Offer", fontSize: 8 },
          {
            text: money(offer.offer),
            bold: true,
            color: OFFER_GREEN,
            fontSize: 10,
          },
          { text: "Repayment", fontSize: 8 },
          {
            text: Number.isFinite(repaymentTotal) ? money(repaymentTotal) : "-",
            bold: true,
            color: VALUE_BLUE,
            fontSize: 10,
          },
        ],
        [
          { text: "Rate", fontSize: 8 },
          { text: offer.rate || "-", bold: true, color: VALUE_BLUE, fontSize: 10 },
          { text: "Our Position", fontSize: 8 },
          {
            // Our Position = outstanding positions + 1, always derived.
            // `offer.position` is a stored field that goes stale, and
            // activeCount counts PIF / ONE TIME / REVERSE rows too.
            text: String(metrics.existingActivePositionsCount + 1),
            bold: true,
            color: VALUE_BLUE,
            fontSize: 10,
          },
        ],
        [
          { text: "Frequency / Repay", fontSize: 8 },
          { text: frequencyRepay, bold: true, color: VALUE_BLUE, fontSize: 9 },
          { text: "Monthly payment", fontSize: 8 },
          {
            text: offer.monthlyPayment ? money(offer.monthlyPayment) : "-",
            bold: true,
            color: VALUE_BLUE,
            fontSize: 10,
          },
        ],
        [
          { text: "Term", fontSize: 8 },
          { text: offer.term || "-", bold: true, color: VALUE_BLUE, fontSize: 10 },
          { text: "Fees", fontSize: 8 },
          {
            text: offer.fees || "10%",
            bold: true,
            color: VALUE_BLUE,
            fontSize: 10,
          },
        ],
        [
          { text: "Notes:", fontSize: 8 },
          { text: offer.notes || "-", bold: true, color: VALUE_BLUE, fontSize: 9 },
        ],
      ],
      offerCols,
    );
    y += 12;
  }

  // ── Leverage ──
  {
    drawSectionHeader("Leverage", BLUE_HDR, [51, 65, 85]);
    const ourRemitValue =
      Number.isFinite(metrics.ourRemitNum) && metrics.ourRemitNum > 0
        ? metrics.ourRemitNum.toFixed(2)
        : "0";
    const ourMonthly = parseNumberUS(offer.monthlyPayment) || 0;
    const existingMonthly = metrics.totalMonthly;
    const totalMonthly = ourMonthly + existingMonthly;
    const daysWeeks = parseNumberUS(offer.repayPerPeriod);
    const ourDaily =
      offer.frequency === "Daily"
        ? Number.isFinite(daysWeeks) && daysWeeks > 0
          ? daysWeeks
          : 0
        : ourMonthly > 0
          ? ourMonthly / 22
          : 0;
    const totalDaily = metrics.totalDaily + ourDaily;
    const highTotal = metrics.totalRemit > 60;

    const ourLevg = isDeclined
      ? "0% / $ 0.00"
      : `${ourRemitValue}% / ${money(ourMonthly)}`;
    const curLevg = `${metrics.existingRemit > 0 ? `${metrics.existingRemit.toFixed(2)}%` : "0%"} / ${money(existingMonthly)}`;
    const totLevg = isDeclined
      ? "0% / $ 0.00"
      : `${metrics.totalRemit > 0 ? `${metrics.totalRemit.toFixed(2)}%` : "0%"} / ${money(totalMonthly)}`;

    drawRows(
      [
        [
          { text: "Our Levg / Repay", fontSize: 7.5 },
          { text: ourLevg, bold: true, color: OFFER_GREEN, fontSize: 8 },
          { text: "Current Levg / Repay", fontSize: 7.5 },
          { text: curLevg, bold: true, color: VALUE_BLUE, fontSize: 8 },
          { text: "Total Levg / Repay", fontSize: 7.5 },
          {
            text: totLevg,
            bold: true,
            color: highTotal ? RED : AMBER,
            fontSize: 8,
          },
        ],
        [
          { text: "Current Monthly / Daily Repay", fontSize: 7.5 },
          {
            text: `${money(existingMonthly)} / ${money(metrics.totalDaily)}`,
            bold: true,
            color: VALUE_BLUE,
            fontSize: 8,
          },
          { text: "Total Monthly / Daily Repay", fontSize: 7.5 },
          {
            text: `${money(totalMonthly)} / ${money(totalDaily)}`,
            bold: true,
            color: VALUE_BLUE,
            fontSize: 8,
          },
        ],
        [
          { text: "Existing Active Positions", fontSize: 7.5 },
          {
            text: String(metrics.existingActivePositionsCount),
            bold: true,
            color: [59, 130, 246],
            fontSize: 10,
            align: "center",
          },
          { text: "Recent month Leverage", fontSize: 7.5 },
          {
            text:
              metrics.recentMonthLeverage != null
                ? `${formatNumberUS(metrics.recentMonthLeverage)} %`
                : "-",
            bold: true,
            color: VALUE_BLUE,
            fontSize: 9,
          },
        ],
      ],
      levCols,
    );
    y += 12;
  }

  // ── Bank Analysis ──
  if (!banks.length || banks.every((b) => !b.rows.length)) {
    ensure(18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("No bank analysis data.", M, y);
    y += 14;
  } else {
    banks.forEach((bank, bi) => {
      if (!bank.rows.length) return;
      const last4 = String(bank.accountNumber || "")
        .replace(/\D/g, "")
        .slice(-4);
      drawSectionHeader(
        `Bank Analysis ${bi + 1}`,
        BLUE_HDR,
        [51, 65, 85],
        last4 ? `A/C ending: ${last4}` : undefined,
      );
      const bankWeights = [1.4, 1.2, 1.1, 1.15, 1.2, 1.1, 0.85];
      const headerBgs: Array<[number, number, number] | undefined> = [
        undefined,
        NET_BG,
        undefined,
        undefined,
        undefined,
        undefined,
        NSF_BG,
      ];
      drawDataTable(
        [
          "Month",
          "Net Credit",
          "Funding Amt",
          "Transfers & other",
          "Total Credit",
          "Avg Daily Blc",
          "NSF/Neg days",
        ],
        bank.rows.map((r) => [
          r.month,
          money(r.netCredit),
          money(r.fundingAmt),
          money(r.transfers),
          money(r.totalCredit),
          money(r.avgDailyBlc),
          String(r.nsfNegDays ?? 0),
        ]),
        bankWeights,
        headerBgs,
      );

      // AVERAGE row (exclude MTD)
      const nonMtd = bank.rows.filter(
        (r) => !String(r.month).toLowerCase().includes("mtd"),
      );
      if (nonMtd.length) {
        const avg = (key: keyof ScrubbingPdfBankRow) =>
          nonMtd.reduce((s, r) => s + (Number(r[key]) || 0), 0) / nonMtd.length;
        drawRows(
          [
            [
              { text: "AVERAGE (MTD Not counted)", bold: true, fontSize: 7, bg: ZEBRA },
              { text: money(avg("netCredit")), bold: true, fontSize: 7.5, bg: NET_BG },
              { text: money(avg("fundingAmt")), bold: true, fontSize: 7.5, bg: ZEBRA },
              { text: money(avg("transfers")), bold: true, fontSize: 7.5, bg: ZEBRA },
              { text: money(avg("totalCredit")), bold: true, fontSize: 7.5, bg: ZEBRA },
              { text: money(avg("avgDailyBlc")), bold: true, fontSize: 7.5, bg: ZEBRA },
              {
                text: String(Math.round(avg("nsfNegDays") || 0)),
                bold: true,
                fontSize: 7.5,
                bg: NSF_BG,
              },
            ],
          ],
          bankWeights.map((w) => (CW * w) / bankWeights.reduce((a, b) => a + b, 0)),
        );
      }
      y += 10;
    });
  }

  // ── Positions ──
  drawSectionHeader("Positions", BLUE_HDR, [51, 65, 85]);
  if (!positions.length) {
    ensure(18);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("No positions.", M, y + 2);
    y += 16;
  } else {
    drawDataTable(
      [
        "Month",
        "Start Date",
        "Lender",
        "Amount Funded",
        "Status",
        "Frequency",
        "Repayment",
        "Last Payment",
        "Est. MCA %",
      ],
      positions.map((p) => [
        p.monthLabel || "-",
        p.fundingDateLabel || "-",
        p.lender || "-",
        money(p.amountFunded),
        p.status || "-",
        p.frequency || "-",
        money(p.installment),
        p.lastPaymentLabel || "-",
        // Print 0.00% rather than "-" - a stored zero is a real value, and
        // blanking it made the PDF disagree with the preview table.
        Number.isFinite(p.mcaPercentPaid) ? pct(p.mcaPercentPaid) : "-",
      ]),
      [1.0, 1.1, 1.4, 1.15, 0.9, 0.9, 1.0, 1.05, 0.9],
    );

    const amountFunded = positions.reduce((s, p) => s + (p.amountFunded || 0), 0);
    const repayment = positions
      .filter((p) => p.status.toUpperCase() !== "PIF")
      .reduce((s, p) => s + (p.installment || 0), 0);
    ensure(20);
    doc.setFillColor(...ZEBRA);
    doc.rect(M, y, CW, 18, "F");
    doc.setDrawColor(...HAIR);
    doc.rect(M, y, CW, 18, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...INK);
    doc.text(
      `TOTAL    Amount Funded: ${money(amountFunded)}     Repayment: ${money(repayment)}`,
      M + 8,
      y + 12,
    );
    y += 22;
  }

  if (signedBy) {
    ensure(28);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...MUTED);
    doc.text(`Signed by: ${signedBy}`, M, y);
  }

  const safeName = fileName.toLowerCase().endsWith(".pdf")
    ? fileName
    : `${fileName}.pdf`;
  doc.save(safeName);
}
