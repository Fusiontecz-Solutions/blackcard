import prisma from '../../config/prismaClient';
import { renderHtmlToA4PdfBuffer } from './letterHtmlToPdf.service';
import { appendPdfBuffersToBase64 } from '../docusign/utils/merge-layout-pdfs';
import type { DocumentLayoutPlacement } from '../docusign/utils/convert-docusign-template-export';
import type { DocumentLayoutWithBase64 } from '../docusign/utils/platform-layout-envelope';
import {
  REVERSE_DISBURSEMENT_COLUMNS,
  REVERSE_DISBURSEMENT_SUMMARY_FIELDS,
  type ReverseDisbursementScheduleData,
  type ReverseDisbursementScheduleRow,
  type ReverseDisbursementScheduleSummary,
} from './reverseDisbursementSchedule.types';
import {
  isAllianceBridgeFunder,
  isTexasFundingGroupFunder,
} from '../docusign/utils/resolve-main-contract-layout';
import { isWoodmereFunderProfile } from '../../utils/funderProfileResolver';

/** Default Woodmere brand logo on the disbursement schedule page. */
const DEFAULT_WOODMERE_LOGO_URL =
  'https://res.cloudinary.com/oqok4ng8/image/upload/v1787242509/black_logo.svg';

/** Texas Funding Group falls back to the book's own logo (no other-book branding). */
const DEFAULT_TEXAS_FUNDING_GROUP_LOGO_URL = DEFAULT_WOODMERE_LOGO_URL;

/** DocuSign Sign Here tab on the appended disbursement schedule page. */
const REVERSE_DISBURSEMENT_SIGNATURE_X = '495';
const REVERSE_DISBURSEMENT_SIGNATURE_Y = '748';
const REVERSE_DISBURSEMENT_SIGNATURE_PLACEMENT_ID = 'reverse_disbursement_signature';

/** Matches "Day 1" / "Week 1" schedule period rows. */
const PERIOD_ROW_START_REGEX = /^(?:day|week)\s/i;
const PERIOD_RANGE_SPLIT_REGEX =
  /\s+(?=(?:Day|Week)\s+\d+\s*-\s*(?:Day|Week)\s+\d+)/gi;

async function getPdfPageCountFromBase64(base64: string): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(Buffer.from(base64, 'base64'));
  return pdf.getPageCount();
}

function buildReverseDisbursementSignaturePlacement(
  pageNumber: string,
  documentId: string,
): DocumentLayoutPlacement {
  return {
    id: REVERSE_DISBURSEMENT_SIGNATURE_PLACEMENT_ID,
    type: 'signature',
    slot: `signature_p${pageNumber}_${REVERSE_DISBURSEMENT_SIGNATURE_X}_${REVERSE_DISBURSEMENT_SIGNATURE_Y}`,
    documentId,
    pageNumber,
    x: REVERSE_DISBURSEMENT_SIGNATURE_X,
    y: REVERSE_DISBURSEMENT_SIGNATURE_Y,
    signerRole: 'Signer',
    optional: false,
    sourceTabLabel: 'Disbursement schedule signature',
    signerParty: 'primary',
  };
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitPastedLine(line: string): string[] {
  const trimmed = String(line || '').trim();
  if (!trimmed) return [];
  if (trimmed.includes('\t')) {
    return trimmed.split('\t').map((c) => c.trim());
  }
  if (trimmed.includes('|')) {
    return trimmed.split('|').map((c) => c.trim());
  }
  return trimmed.split(/\s{2,}/).map((c) => c.trim());
}

const CURRENCY_TOKEN_REGEX = /(?:\(\s*)?\$\s*([\d,]+(?:\.\d{1,2})?)\s*\)?/g;

function formatCurrencyToken(raw: string, digits: string): string {
  const negative = /\(/.test(raw);
  return negative ? `($ ${digits})` : `$ ${digits}`;
}

function extractCurrencyTokens(line: string): { values: string[]; firstIndex: number } {
  const values: string[] = [];
  let firstIndex = -1;
  const regex = new RegExp(CURRENCY_TOKEN_REGEX.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    if (firstIndex < 0) firstIndex = match.index;
    values.push(formatCurrencyToken(match[0], match[1]));
  }
  return { values, firstIndex };
}

function isHeaderOrSummaryLine(line: string): boolean {
  const trimmed = line.trim();
  if (PERIOD_ROW_START_REGEX.test(trimmed)) return false;

  const lower = trimmed.toLowerCase();
  if (
    lower.includes('deposit disbursement') &&
    (lower.includes('net dailys') || lower.includes('receivables purchased'))
  ) {
    return true;
  }
  if (lower.includes('receivables purchased') && lower.includes('total period')) {
    return true;
  }

  const summaryKeywords = [
    'total funding amount',
    'net funding amount',
    'daily debit',
    'fixed daily debit',
    'factor rate',
    'origination fee',
    'term length',
    'reduction on daily',
  ];
  return summaryKeywords.some((keyword) => lower.includes(keyword));
}

function parsePdfStyleDisbursementLine(line: string): ReverseDisbursementScheduleRow | null {
  const trimmed = line.trim();
  if (!PERIOD_ROW_START_REGEX.test(trimmed)) return null;

  const { values, firstIndex } = extractCurrencyTokens(trimmed);
  if (values.length < 4 || firstIndex < 0) return null;

  const period = trimmed.slice(0, firstIndex).trim().replace(/\s+/g, ' ');
  return {
    period,
    netDailysCredit: values[0] || '',
    dailysCreditInclFees: values[1] || '',
    totalPeriodCredits: values[2] || '',
    receivablesPurchased: values[3] || '',
  };
}

export function parseFixedDailyDebitFromPaste(text: string): string | undefined {
  const match = String(text || '').match(
    /(?:fixed\s+)?daily\s+debit\s*:?\s*(?:\(\s*)?\$\s*([\d,]+(?:\.\d{1,2})?)\s*\)?/i,
  );
  if (!match?.[1]) return undefined;
  return `$ ${match[1]}`;
}

/**
 * When copied from a PDF, each "Day/Week X - Day/Week Y ..." row is sometimes pasted
 * as one continuous line. Insert a line break before every period range marker.
 */
function splitConcatenatedPeriodRows(text: string): string {
  return String(text || '').replace(PERIOD_RANGE_SPLIT_REGEX, '\n');
}

export function parsePastedReverseDisbursementTable(
  pastedText: string,
): ReverseDisbursementScheduleRow[] {
  const lines = splitConcatenatedPeriodRows(pastedText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows: ReverseDisbursementScheduleRow[] = [];
  for (const line of lines) {
    if (isHeaderOrSummaryLine(line)) continue;

    if (line.includes('\t') || line.includes('|')) {
      const cols = splitPastedLine(line);
      if (cols.length < 2) continue;
      while (cols.length < 5) cols.push('');
      rows.push({
        period: cols[0] || '',
        netDailysCredit: cols[1] || '',
        dailysCreditInclFees: cols[2] || '',
        totalPeriodCredits: cols[3] || '',
        receivablesPurchased: cols[4] || '',
      });
      continue;
    }

    const pdfRow = parsePdfStyleDisbursementLine(line);
    if (pdfRow) {
      rows.push(pdfRow);
      continue;
    }

    const cols = splitPastedLine(line);
    if (cols.length >= 2 && PERIOD_ROW_START_REGEX.test(cols[0] || '')) {
      while (cols.length < 5) cols.push('');
      rows.push({
        period: cols[0] || '',
        netDailysCredit: cols[1] || '',
        dailysCreditInclFees: cols[2] || '',
        totalPeriodCredits: cols[3] || '',
        receivablesPurchased: cols[4] || '',
      });
    }
  }
  return rows;
}

export function normalizeReverseDisbursementScheduleData(
  raw: unknown,
): ReverseDisbursementScheduleData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const rowsRaw = Array.isArray(obj.rows) ? obj.rows : [];
  const rows: ReverseDisbursementScheduleRow[] = rowsRaw
    .map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
      const r = row as Record<string, unknown>;
      const period = String(r.period ?? '').trim();
      const netDailysCredit = String(r.netDailysCredit ?? '').trim();
      const dailysCreditInclFees = String(r.dailysCreditInclFees ?? '').trim();
      const totalPeriodCredits = String(r.totalPeriodCredits ?? '').trim();
      const receivablesPurchased = String(r.receivablesPurchased ?? '').trim();
      if (
        !period &&
        !netDailysCredit &&
        !dailysCreditInclFees &&
        !totalPeriodCredits &&
        !receivablesPurchased
      ) {
        return null;
      }
      return {
        period,
        netDailysCredit,
        dailysCreditInclFees,
        totalPeriodCredits,
        receivablesPurchased,
      };
    })
    .filter((row): row is ReverseDisbursementScheduleRow => row != null);

  if (!rows.length) return null;

  const fixedDailyDebit = String(obj.fixedDailyDebit ?? '').trim() || undefined;

  const summaryRaw =
    obj.summary && typeof obj.summary === 'object' && !Array.isArray(obj.summary)
      ? (obj.summary as Record<string, unknown>)
      : null;
  let summary: ReverseDisbursementScheduleSummary | undefined;
  if (summaryRaw) {
    const entries = REVERSE_DISBURSEMENT_SUMMARY_FIELDS.map(({ key }) => [
      key,
      String(summaryRaw[key] ?? '').trim(),
    ]).filter(([, value]) => Boolean(value));
    if (entries.length) {
      summary = Object.fromEntries(entries) as ReverseDisbursementScheduleSummary;
    }
  }
  if (fixedDailyDebit && !summary?.dailyDebit) {
    summary = { ...summary, dailyDebit: fixedDailyDebit };
  }

  return { fixedDailyDebit, summary, rows };
}

function formatCurrencyCell(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (raw.includes('$')) return raw;
  const normalized = raw.replace(/,/g, '');
  const n = Number(normalized);
  if (!Number.isFinite(n)) return raw;
  return `$ ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function resolveFallbackLogoUrl(funderName?: string | null): string {
  const name = String(funderName ?? '').trim();
  const isTexasOrAlliance =
    isTexasFundingGroupFunder(name) || isAllianceBridgeFunder(name);
  const isWoodmere = isWoodmereFunderProfile({ name });

  const envLogoUrl = isTexasOrAlliance
    ? process.env.REVERSE_DISBURSEMENT_TEXAS_FUNDING_GROUP_LOGO_URL
    : process.env.REVERSE_DISBURSEMENT_LOGO_URL;

  if (String(envLogoUrl || '').trim()) {
    return String(envLogoUrl).trim();
  }

  if (isTexasOrAlliance && !isWoodmere) {
    return DEFAULT_TEXAS_FUNDING_GROUP_LOGO_URL;
  }

  return DEFAULT_WOODMERE_LOGO_URL;
}

async function resolveFunderLogoUrl(funderName?: string | null): Promise<string> {
  const name = String(funderName ?? '').trim();
  if (name) {
    const profile = await prisma.funderProfile.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { displayName: { equals: name, mode: 'insensitive' } },
          { organization: { equals: name, mode: 'insensitive' } },
          { legalName: { equals: name, mode: 'insensitive' } },
        ],
      },
      select: { logoUrl: true },
    });
    const uploadedLogoUrl = String(profile?.logoUrl || '').trim();
    if (uploadedLogoUrl) return uploadedLogoUrl;
  }
  return resolveFallbackLogoUrl(name);
}

function formatSummaryValue(
  key: keyof ReverseDisbursementScheduleSummary,
  value: string,
): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (key === 'totalFundingAmount' || key === 'netFundingAmount' || key === 'dailyDebit') {
    return formatCurrencyCell(raw);
  }
  if (key === 'reductionOnDailyRate' || key === 'originationFeePercent') {
    return raw.includes('%') ? raw : `${raw}%`;
  }
  return raw;
}

export function buildReverseDisbursementScheduleHtml(
  data: ReverseDisbursementScheduleData,
  options?: { funderName?: string | null; logoUrl?: string | null },
): string {
  const logoUrl =
    String(options?.logoUrl || '').trim() ||
    resolveFallbackLogoUrl(options?.funderName ?? null);
  const headerCells = REVERSE_DISBURSEMENT_COLUMNS.map(
    (col) => `<th>${escapeHtml(col.label)}</th>`,
  ).join('');

  const bodyRows = data.rows
    .map((row) => {
      const cells = REVERSE_DISBURSEMENT_COLUMNS.map((col) => {
        const value =
          col.key === 'period' ? row.period : formatCurrencyCell(row[col.key]);
        const align = col.key === 'period' ? 'left' : 'right';
        return `<td style="text-align:${align}">${escapeHtml(value)}</td>`;
      }).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const summary = data.summary ?? {};
  const summaryRows = REVERSE_DISBURSEMENT_SUMMARY_FIELDS.map(({ key, label }) => {
    const value = formatSummaryValue(key, summary[key] ?? '');
    if (!value) return '';
    return `<tr><td class="summary-label">${escapeHtml(label)}</td><td class="summary-value">${escapeHtml(value)}</td></tr>`;
  })
    .filter(Boolean)
    .join('');
  const summaryHtml = summaryRows
    ? `<table class="summary-table"><tbody>${summaryRows}</tbody></table>`
    : '';

  return `
<div class="reverse-schedule-root">
  <div class="logo-wrap">
    <img src="${escapeHtml(logoUrl)}" alt="Logo" class="logo" />
  </div>
  <h1 class="title">DISBURSEMENT SCHEDULE</h1>
  ${summaryHtml}
  <table class="schedule-table">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>
<style>
  .reverse-schedule-root {
    font-family: Arial, Helvetica, sans-serif;
    color: #111827;
    padding: 28px 32px 36px;
    max-width: 760px;
    margin: 0 auto;
  }
  .logo-wrap {
    text-align: center;
    margin-bottom: 18px;
  }
  .logo {
    max-width: 220px;
    max-height: 90px;
    height: auto;
    width: auto;
    display: inline-block;
  }
  .title {
    text-align: center;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.04em;
    margin: 0 auto 22px;
    padding: 6px 14px;
    display: table;
    background: #d9ead3;
    color: #111827;
  }
  .summary-table {
    border-collapse: collapse;
    font-size: 12px;
    margin: 0 0 22px;
    width: auto;
  }
  .summary-table td {
    border: 1px solid #9ca3af;
    padding: 5px 10px;
    vertical-align: top;
  }
  .summary-label {
    font-weight: 700;
    min-width: 190px;
    white-space: nowrap;
  }
  .summary-value {
    min-width: 110px;
    text-align: right;
  }
  .schedule-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    table-layout: fixed;
  }
  .schedule-table th,
  .schedule-table td {
    border: 1px solid #9ca3af;
    padding: 6px 8px;
    vertical-align: top;
    word-break: break-word;
  }
  .schedule-table th {
    background: #f3f4f6;
    font-weight: 700;
    text-align: left;
  }
</style>`;
}

export async function renderReverseDisbursementSchedulePdf(
  data: ReverseDisbursementScheduleData,
  funderName?: string | null,
): Promise<Buffer> {
  const logoUrl = await resolveFunderLogoUrl(funderName);
  const html = buildReverseDisbursementScheduleHtml(data, { funderName, logoUrl });
  return renderHtmlToA4PdfBuffer(html);
}

export async function loadContractReverseDisbursementConfig(contractId: number): Promise<{
  enabled: boolean;
  schedule: ReverseDisbursementScheduleData | null;
  funderName: string | null;
}> {
  const row = await prisma.contract.findUnique({
    where: { id: contractId },
    select: {
      reverseDisbursementEnabled: true,
      reverseDisbursementSchedule: true,
      funderName: true,
    },
  });
  if (!row) {
    return { enabled: false, schedule: null, funderName: null };
  }
  return {
    enabled: row.reverseDisbursementEnabled === true,
    schedule: normalizeReverseDisbursementScheduleData(row.reverseDisbursementSchedule),
    funderName: row.funderName,
  };
}

export async function maybeAppendReverseDisbursementToMainContractLayout(
  layout: DocumentLayoutWithBase64,
  contractId: number,
): Promise<DocumentLayoutWithBase64> {
  const { enabled, schedule, funderName } =
    await loadContractReverseDisbursementConfig(contractId);
  if (!enabled) {
    return layout;
  }
  if (!schedule?.rows?.length) {
    throw new Error(
      'Reverse disbursement schedule is enabled but no table rows are saved. Paste the schedule table and save before sending.',
    );
  }

  const schedulePdf = await renderReverseDisbursementSchedulePdf(schedule, funderName);
  const documentBase64 = await appendPdfBuffersToBase64(layout.documentBase64, [schedulePdf]);
  const pageCount = await getPdfPageCountFromBase64(documentBase64);
  const documentId = String(layout.document?.documentId || '1');
  const disbursementSignature = buildReverseDisbursementSignaturePlacement(
    String(pageCount),
    documentId,
  );
  const placements = [
    ...layout.placements.filter((p) => p.id !== REVERSE_DISBURSEMENT_SIGNATURE_PLACEMENT_ID),
    disbursementSignature,
  ];
  return {
    ...layout,
    documentBase64,
    document: {
      ...layout.document,
      pageCount,
    },
    placements,
  };
}
