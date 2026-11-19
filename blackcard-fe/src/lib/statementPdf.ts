import { jsPDF } from 'jspdf';

export type StatementColumn = { label: string; width: number; align?: 'left' | 'right' };

export type StatementSection = {
  title?: string;
  subtitle?: string;
  /** Short "label value" pairs shown under the section title. */
  facts?: { label: string; value: string }[];
  columns: StatementColumn[];
  rows: string[][];
  /** Row indexes drawn in grey (e.g. failed payments). */
  mutedRows?: number[];
  totalRow?: string[];
  emptyText?: string;
};

export type StatementPdfInput = {
  fileName: string;
  title: string;
  /** Lines under the title (account holder, account number, …). */
  headerLines: string[];
  /** Right-aligned header lines (balance, generated date, …). */
  headerRight: string[];
  summary?: { label: string; value: string }[];
  sections: StatementSection[];
  footerNote?: string;
};

const MARGIN = 14;
const ROW_H = 6.5;
const SLATE_900: [number, number, number] = [15, 23, 42];
const SLATE_500: [number, number, number] = [100, 116, 139];
const SLATE_300: [number, number, number] = [203, 213, 225];
const SLATE_100: [number, number, number] = [241, 245, 249];

/** The built-in PDF fonts only cover WinAnsi; swap characters they can't draw. */
function pdfText(v: string): string {
  return v.replace(/\u2212/g, '-').replace(/[\u2192]/g, '->').replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '');
}

function fitText(pdf: jsPDF, text: string, maxWidth: number): string {
  const t = pdfText(text);
  if (pdf.getTextWidth(t) <= maxWidth) return t;
  let out = t;
  while (out.length > 1 && pdf.getTextWidth(`${out}…`) > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/** Build a text-based, multi-page A4 statement and trigger the download. */
export async function downloadStatementPdf(input: StatementPdfInput): Promise<void> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const bottom = pageH - 16;
  let y = MARGIN;

  // Header
  pdf.setTextColor(...SLATE_900);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(pdfText(input.title), MARGIN, y + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...SLATE_500);
  let leftY = y + 9;
  for (const line of input.headerLines) {
    pdf.text(fitText(pdf, line, contentW * 0.6), MARGIN, leftY);
    leftY += 4.5;
  }
  let rightY = y + 4;
  for (const line of input.headerRight) {
    pdf.text(pdfText(line), pageW - MARGIN, rightY, { align: 'right' });
    rightY += 4.5;
  }
  y = Math.max(leftY, rightY) + 2;
  pdf.setDrawColor(...SLATE_300);
  pdf.line(MARGIN, y, pageW - MARGIN, y);
  y += 6;

  // Summary tiles
  if (input.summary?.length) {
    const n = input.summary.length;
    const gap = 3;
    const tileW = (contentW - gap * (n - 1)) / n;
    input.summary.forEach((s, i) => {
      const x = MARGIN + i * (tileW + gap);
      pdf.setFillColor(...SLATE_100);
      pdf.roundedRect(x, y, tileW, 14, 1.5, 1.5, 'F');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...SLATE_500);
      pdf.text(fitText(pdf, s.label.toUpperCase(), tileW - 6), x + 3, y + 5);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.setTextColor(...SLATE_900);
      pdf.text(fitText(pdf, s.value, tileW - 6), x + 3, y + 11);
      pdf.setFont('helvetica', 'normal');
    });
    y += 20;
  }

  const ensureSpace = (needed: number): boolean => {
    if (y + needed <= bottom) return false;
    pdf.addPage();
    y = MARGIN;
    return true;
  };

  for (const section of input.sections) {
    const totalWeight = section.columns.reduce((a, c) => a + c.width, 0) || 1;
    const widths = section.columns.map((c) => (c.width / totalWeight) * contentW);
    const xs = widths.map((_, i) => MARGIN + widths.slice(0, i).reduce((a, w) => a + w, 0));

    const drawCells = (cells: string[], opts: { bold?: boolean; color?: [number, number, number]; fill?: [number, number, number] }) => {
      if (opts.fill) {
        pdf.setFillColor(...opts.fill);
        pdf.rect(MARGIN, y, contentW, ROW_H, 'F');
      }
      pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...(opts.color ?? SLATE_900));
      cells.forEach((cell, i) => {
        const col = section.columns[i];
        if (!col) return;
        const w = widths[i]! - 3;
        const text = fitText(pdf, cell ?? '', w);
        if (col.align === 'right') pdf.text(text, xs[i]! + widths[i]! - 1.5, y + 4.4, { align: 'right' });
        else pdf.text(text, xs[i]! + 1.5, y + 4.4);
      });
      pdf.setDrawColor(...SLATE_300);
      pdf.line(MARGIN, y + ROW_H, pageW - MARGIN, y + ROW_H);
      y += ROW_H;
    };
    const drawHeader = () => drawCells(section.columns.map((c) => c.label), { bold: true, color: SLATE_500, fill: SLATE_100 });

    const titleBlock = (section.title ? 7 : 0) + (section.subtitle ? 5 : 0) + (section.facts?.length ? 6 : 0);
    ensureSpace(titleBlock + ROW_H * 3);
    if (section.title) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...SLATE_900);
      pdf.text(fitText(pdf, section.title, contentW), MARGIN, y + 4);
      y += 7;
    }
    if (section.subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...SLATE_500);
      pdf.text(fitText(pdf, section.subtitle, contentW), MARGIN, y + 2);
      y += 5;
    }
    if (section.facts?.length) {
      pdf.setFontSize(8.5);
      let x = MARGIN;
      for (const f of section.facts) {
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(...SLATE_500);
        const label = `${pdfText(f.label)} `;
        pdf.text(label, x, y + 2);
        x += pdf.getTextWidth(label);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(...SLATE_900);
        const value = pdfText(f.value);
        pdf.text(value, x, y + 2);
        x += pdf.getTextWidth(value) + 8;
      }
      y += 6;
    }

    drawHeader();
    if (!section.rows.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...SLATE_500);
      pdf.text(pdfText(section.emptyText ?? 'No rows.'), MARGIN + 1.5, y + 4.4);
      y += ROW_H;
    }
    const muted = new Set(section.mutedRows ?? []);
    section.rows.forEach((row, i) => {
      if (ensureSpace(ROW_H)) drawHeader();
      drawCells(row, { color: muted.has(i) ? SLATE_500 : SLATE_900 });
    });
    if (section.totalRow) {
      if (ensureSpace(ROW_H)) drawHeader();
      drawCells(section.totalRow, { bold: true, fill: SLATE_100 });
    }
    y += 8;
  }

  if (input.footerNote) {
    ensureSpace(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE_500);
    pdf.text(pdf.splitTextToSize(pdfText(input.footerNote), contentW) as string[], MARGIN, y);
  }

  const pages = pdf.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...SLATE_500);
    pdf.text(`Page ${p} of ${pages}`, pageW - MARGIN, pageH - 8, { align: 'right' });
  }

  pdf.save(input.fileName.toLowerCase().endsWith('.pdf') ? input.fileName : `${input.fileName}.pdf`);
}
