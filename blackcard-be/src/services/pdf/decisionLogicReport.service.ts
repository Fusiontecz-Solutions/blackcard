import { renderHtmlToA4PdfBuffer } from './letterHtmlToPdf.service';
import { pickBestDecisionLogicReportRow } from '../../utils/decisionLogicReportStatus';

const NAVY = '#13314f';
const BRAND = '#276D9C';

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function formatDate(value: unknown): string {
  if (value == null || value === '') return '—';
  const dt = new Date(String(value));
  if (Number.isNaN(dt.getTime())) return displayValue(value);
  return dt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function parseJsonArray(value: unknown): Record<string, unknown>[] {
  let raw: unknown = value;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is Record<string, unknown> =>
      row != null && typeof row === 'object' && !Array.isArray(row),
  );
}

function toTitle(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldCell(label: string, value: unknown): string {
  return `
    <td style="width:25%;border:1px solid #e2e8f0;padding:6px 8px;vertical-align:top;">
      <div style="font-size:7.5px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">${esc(label)}</div>
      <div style="font-size:11px;font-weight:600;color:#0f172a;word-break:break-word;">${esc(displayValue(value))}</div>
    </td>`;
}

function fieldsTable(pairs: Array<[string, unknown]>): string {
  const rows: string[] = [];
  for (let i = 0; i < pairs.length; i += 4) {
    const slice = pairs.slice(i, i + 4);
    while (slice.length < 4) slice.push(['', '']);
    rows.push(`<tr>${slice
      .map(([label, value]) =>
        label ? fieldCell(label, value) : '<td style="width:25%;border:1px solid #e2e8f0;padding:6px 8px;"></td>',
      )
      .join('')}</tr>`);
  }
  return `<table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">${rows.join('')}</table>`;
}

function section(title: string, body: string, badge?: string): string {
  const badgeHtml = badge
    ? `<span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;border:1px solid #cbd5e1;background:#f8fafc;font-size:9px;font-weight:700;color:#334155;vertical-align:middle;">${esc(badge)}</span>`
    : '';
  return `
    <div style="margin:14px 0 0;">
      <div style="font-size:12px;font-weight:700;color:${NAVY};margin:0 0 5px;">
        ${esc(title)}${badgeHtml}
      </div>
      <div style="height:2px;background:${NAVY};margin-bottom:8px;"></div>
      ${body}
    </div>`;
}

function dataTable(rows: Record<string, unknown>[], emptyLabel: string): string {
  if (!rows.length) {
    return `<div style="font-size:11px;color:#94a3b8;font-style:italic;padding:6px 0;">${esc(emptyLabel)}</div>`;
  }
  const keys = Object.keys(rows[0] ?? {});
  if (!keys.length) {
    return `<div style="font-size:11px;color:#94a3b8;font-style:italic;padding:6px 0;">${esc(emptyLabel)}</div>`;
  }
  const head = keys
    .map(
      (key) =>
        `<th style="border:1px solid #e2e8f0;background:#eaf1fa;color:${NAVY};font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;padding:5px 6px;text-align:left;">${esc(toTitle(key))}</th>`,
    )
    .join('');
  const body = rows
    .map((row) => {
      const cells = keys
        .map(
          (key) =>
            `<td style="border:1px solid #e2e8f0;padding:4px 6px;font-size:9px;color:#334155;vertical-align:top;word-break:break-word;">${esc(displayValue(row[key]))}</td>`,
        )
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `
    <div style="overflow:hidden;border:1px solid #e2e8f0;border-radius:4px;">
      <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function safeFilenamePart(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'report';
}

function buildHtml(row: Record<string, unknown>): string {
  const generatedAt = new Date().toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const entered = fieldsTable([
    ['Request Code', row.requestCode],
    ['Customer Id', row.customerIdentifier],
    ['Name Entered', row.nameEntered],
    ['Email Address', row.emailAddress],
    ['Institution Name', row.institutionName],
    ['Routing Number Entered', row.routingNumberEntered],
    ['Account Number Entered', row.accountNumberEntered],
  ]);

  const returned = fieldsTable([
    ['Name', row.nameFound],
    ['Account Name', row.accountName],
    ['Account Type', row.accountType],
    ['Routing Number', row.routingNumberReturned || 'N/A'],
    ['Account Number', row.accountNumberFound],
  ]);

  const summary = fieldsTable([
    ['Available Balance', row.availableBalance],
    ['Average Balance', row.averageBalance],
    ['Average Balance Recent', row.averageBalanceRecent],
    ['Total Credits', row.totalCredits],
    ['Total Debits', row.totalDebits],
    ['Current Balance', row.currentBalance],
    ['As of Date', formatDate(row.asOfDate)],
  ]);

  const transactionSummaries = parseJsonArray(row.transactionSummaries);
  const transactionAnalysis = parseJsonArray(row.transactionAnalysisSummaries);
  const accountExpenses = parseJsonArray(row.accountExpenses);

  const titleName =
    displayValue(row.nameFound) !== '—'
      ? displayValue(row.nameFound)
      : displayValue(row.nameEntered) !== '—'
        ? displayValue(row.nameEntered)
        : displayValue(row.accountName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }
</style>
</head>
<body>
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.35;padding:0 0 18px;">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(90deg,${NAVY} 0%,${BRAND} 100%);color:#fff;padding:14px 22px;">
      <div style="min-width:0;">
        <div style="font-size:11px;letter-spacing:0.6px;opacity:0.9;text-transform:uppercase;">Bank Verification</div>
        <div style="font-size:20px;font-weight:800;letter-spacing:0.8px;line-height:1.15;margin-top:2px;">DECISION LOGIC REPORT</div>
      </div>
      <div style="text-align:right;font-size:10px;opacity:0.95;">
        <div style="font-weight:700;">${esc(titleName)}</div>
        <div style="margin-top:3px;">${esc(displayValue(row.statusText))}</div>
      </div>
    </div>

    <div style="padding:0 22px;">
      ${section('Information Entered', entered)}
      ${section('Information Returned By Bank', returned, displayValue(row.statusText))}
      ${section('Account Summary', summary)}
      ${section('Transaction Summaries', dataTable(transactionSummaries, 'No transaction summaries available.'))}
      ${section('Transaction Analysis Summaries', dataTable(transactionAnalysis, 'No transaction analysis summaries available.'))}
      ${section('Account Expenses', dataTable(accountExpenses, 'No account expenses available.'))}

      <div style="margin:16px 0 0;padding:8px 0 4px;border-top:1px solid #e8edf3;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:0.2px;">
        <span>Confidential — for internal underwriting use only.</span>
        <span>Generated ${esc(generatedAt)}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export async function generateDecisionLogicReportPdf(
  reportsDetails: unknown,
): Promise<{ buffer: Buffer; filename: string }> {
  const row = pickBestDecisionLogicReportRow(reportsDetails);
  if (!row) {
    throw new Error('No Decision Logic report data available to generate a PDF.');
  }

  const html = buildHtml(row);
  const buffer = await renderHtmlToA4PdfBuffer(html);

  const namePart = safeFilenamePart(
    String(row.nameFound || row.nameEntered || row.accountName || row.requestCode || 'report'),
  );
  const filename = `Decision-Logic-Report-${namePart}.pdf`;

  return { buffer, filename };
}
