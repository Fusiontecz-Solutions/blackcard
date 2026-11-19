import { renderLetterHtmlToPdfBuffer } from './letterHtmlToPdf.service';
import fs from 'fs';
import path from 'path';
import { BRAND_DISPLAY_NAME, BRAND_LOGO_URL } from '../../constants/brand';

const BRAND_LOGO_PATH = path.resolve(__dirname, '..', '..', '..', 'public', 'white_logo.svg');

let cachedLogoDataUri: string | undefined;

function resolveBackgroundCheckLogoSrc(): string {
  const override =
    process.env.BACKGROUND_CHECK_REPORT_LOGO_URL?.trim() ||
    process.env.BACKGROUND_CHECK_REPORT_LOGO_MARK_URL?.trim() ||
    BRAND_LOGO_URL;
  if (override) return override;

  if (!cachedLogoDataUri) {
    if (!fs.existsSync(BRAND_LOGO_PATH)) {
      throw new Error(`Brand logo not found at ${BRAND_LOGO_PATH}`);
    }
    const svg = fs.readFileSync(BRAND_LOGO_PATH, 'utf8');
    cachedLogoDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  return cachedLogoDataUri;
}

function buildHeaderLogoHtml(): string {
  const logoSrc = resolveBackgroundCheckLogoSrc();
  return `
    <div style="display:flex;align-items:center;min-width:0;">
      <img src="${esc(logoSrc)}" alt="${esc(BRAND_DISPLAY_NAME)}" style="height:34px;width:auto;display:block;max-width:240px;" />
    </div>`;
}

const NAVY = '#13314f';
const BRAND = '#276D9C';

const CHECK_RESOURCES = [
  { id: 'datamerch', title: 'DataMerch', description: 'Industry default database' },
  { id: 'opencorporates', title: 'OpenCorporates', description: 'Entity registration & status' },
  { id: 'sos', title: 'Secretary of State', description: 'State business registration' },
  { id: 'nyscef', title: 'NY Court', description: 'Civil court case search' },
  { id: 'google', title: 'Google Search', description: 'Open-web reputation' },
  { id: 'tlo', title: 'Thomson Reuters CLEAR', description: 'Identity and background screening' },
] as const;

type CheckStatus = 'completed' | 'pending';

type CheckRisk = 'high' | 'medium' | 'low';

type AttachmentPreview = {
  dataUrl: string;
  kind: 'image' | 'pdf';
};

type ClearLienJudgmentRecord = {
  source?: string;
  kind?: 'lien' | 'judgment' | string;
  groupId?: string;
  reportKind?: 'person' | 'business' | string;
  caseNumber?: string;
  court?: string;
  filingDate?: string;
  amount?: string;
  parties?: string;
  status?: string;
  description?: string;
  pdfUrl?: string;
};

type ClearCorporateAssociationRecord = {
  source?: string;
  name?: string;
  section?: string;
  groupId?: string;
  reportKind?: 'person' | 'business' | string;
};

export type ClearReportMetadata = {
  clearLienJudgments?: ClearLienJudgmentRecord[];
  clearCorporateAssociations?: ClearCorporateAssociationRecord[];
};

type CheckItemState = {
  notes?: string;
  status?: CheckStatus | string;
  risk?: CheckRisk | string;
  optional?: boolean;
  attachmentName?: string;
  attachmentUrl?: string;
  noteImages?: Array<{ id: string; name: string; url: string; publicId?: string }>;
  savedAt?: string;
  clearMetadata?: ClearReportMetadata | null;
};

type DataMerchRecord = {
  category?: string;
  note?: string;
  notes?: string;
  createdAt?: string;
  created_at?: string;
  addedBy?: string;
  funder?: string;
  added_by?: string;
};

type DataMerchMerchant = {
  legalName?: string;
  legal_name?: string;
  name?: string;
  business_name?: string;
  fein?: string;
  ein?: string;
  city?: string;
  state?: string;
  dba?: string;
  address?: string;
  street1?: string;
  street2?: string;
  industry?: string;
  businessStartDate?: string;
  businessPhone?: string;
  records?: DataMerchRecord[];
  notes?: DataMerchRecord[];
};

export type BackgroundCheckReportPayload = {
  merchantName: string;
  ownerName: string;
  ownerSsn?: string;
  offerAmount: string;
  ein: string;
  dealId: string;
  checks: Record<string, CheckItemState>;
  datamerch?: {
    merchants?: DataMerchMerchant[];
    searchType?: string;
    searchQuery?: string;
    businessName?: string;
    ein?: string | null;
  } | null;
  datamerchSearchedAt?: string | null;
  /** CLEAR Application match blocks (built by FE from ClearPanel comparison rows). */
  clearMatchSections?: ClearPdfMatchSection[] | null;
  attachmentPreviews?: Record<string, AttachmentPreview | null>;
};

export type ClearPdfMatchStatus = 'match' | 'mismatch' | 'neutral';

export type ClearPdfMatchRow = {
  label?: string;
  applicationValue?: string;
  clearValue?: string;
  status?: ClearPdfMatchStatus | string;
};

export type ClearPdfMatchSection = {
  kind?: 'business' | 'person' | string;
  title?: string;
  subtitle?: string;
  ownerLabel?: string;
  rows?: ClearPdfMatchRow[];
};



const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  completed: { bg: '#dcfce7', fg: '#15803d', label: 'COMPLETED' },
  pending: { bg: '#f1f5f9', fg: '#64748b', label: 'PENDING' },
};

const RISK_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  high: { bg: '#fee2e2', fg: '#b91c1c', label: 'HIGH' },
  medium: { bg: '#fef9c3', fg: '#a16207', label: 'MEDIUM' },
  low: { bg: '#dcfce7', fg: '#15803d', label: 'LOW' },
};

const BAR_COLOR: Record<string, string> = {
  completed: '#16a34a',
  pending: '#94a3b8',
  high: '#dc2626',
  medium: '#eab308',
  low: '#16a34a',
};

const LEGACY_COMPLETED_STATUSES = new Set(['pass', 'fail', 'flag', 'na']);

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTimestamp(iso?: string | null): string {
  if (!iso) return '';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return dt.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtEin(ein: string): string {
  const digits = String(ein || '').replace(/\D/g, '');
  if (digits.length !== 9) return ein || '—';
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

function fmtSsn(ssn: string): string {
  const digits = String(ssn || '').replace(/\D/g, '');
  if (digits.length !== 9) return ssn.trim() || '—';
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function normalizeCheckStatus(status?: string | null): CheckStatus {
  if (status === 'completed' || status === 'pending') return status;
  if (status && LEGACY_COMPLETED_STATUSES.has(status)) return 'completed';
  return 'pending';
}

function normalizeCheckRisk(risk?: string | null): CheckRisk | null {
  if (risk === 'high' || risk === 'medium' || risk === 'low') return risk;
  return null;
}

function statusBadgeHtml(status?: string | null): string {
  const key = normalizeCheckStatus(status);
  const s = STATUS_STYLE[key];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:9px;font-weight:700;line-height:1.15;letter-spacing:0.2px;background:${s.bg};color:${s.fg};white-space:nowrap;">${s.label}</span>`;
}

function riskBadgeHtml(risk?: string | null): string {
  const key = normalizeCheckRisk(risk);
  if (!key) {
    return '<span style="color:#cbd5e1;font-style:italic;font-size:11px;">—</span>';
  }
  const s = RISK_STYLE[key];
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:9px;font-weight:700;line-height:1.15;letter-spacing:0.2px;background:${s.bg};color:${s.fg};white-space:nowrap;">${s.label}</span>`;
}

function summaryChip(count: number, kind: 'completed' | 'pending'): string {
  if (count <= 0) return '';
  const s = STATUS_STYLE[kind];
  return `<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:9px;font-weight:700;line-height:1.15;background:${s.bg};color:${s.fg};white-space:nowrap;">${count} ${s.label}</span>`;
}

function countByStatus(
  checks: Record<string, CheckItemState>,
  checkIds: string[],
  status: CheckStatus,
): number {
  return checkIds.filter((id) => normalizeCheckStatus(checks[id]?.status) === status).length;
}

function countByRisk(
  checks: Record<string, CheckItemState>,
  checkIds: string[],
  risk: CheckRisk,
): number {
  return checkIds.filter((id) => normalizeCheckRisk(checks[id]?.risk) === risk).length;
}

function formatFindings(
  notes: string | undefined,
  noteImages?: CheckItemState['noteImages'],
): string {
  const trimmed = String(notes || '').trim();
  const textHtml = trimmed ? `<div>${esc(trimmed).replace(/\n/g, '<br/>')}</div>` : '';
  const images = (noteImages ?? [])
    .map(
      (image) => `
        <div style="margin-top:6px;">
          <a href="${esc(image.url)}" style="color:#2563eb;text-decoration:underline;font-size:10px;">${esc(image.name)}</a>
          <div style="margin-top:4px;border:1px solid #e2e8f0;border-radius:6px;padding:6px;background:#fff;">
            <img src="${esc(image.url)}" alt="${esc(image.name)}" style="display:block;width:100%;max-height:260px;object-fit:contain;object-position:top center;" />
          </div>
        </div>`,
    )
    .join('');

  if (textHtml || images) return `${textHtml}${images}`;
  return '—';
}

function buildClearLienJudgmentListHtml(
  title: string,
  records: ClearLienJudgmentRecord[],
): string {
  const rows =
    records.length > 0
      ? records
          .map((record) => {
            const heading =
              String(record.description ?? '').trim() ||
              String(record.parties ?? '').trim() ||
              `${title.replace(/s$/, '')} record`;
            const details = [
              record.caseNumber ? `Case: ${record.caseNumber}` : '',
              record.court ? `Court: ${record.court}` : '',
              record.filingDate ? `Filed: ${record.filingDate}` : '',
              record.amount ? `Amount: ${record.amount}` : '',
              record.parties && heading !== record.parties ? `Parties: ${record.parties}` : '',
              record.status ? `Status: ${record.status}` : '',
              record.reportKind ? `Report: ${record.reportKind}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const reportLink = String(record.pdfUrl ?? '').trim()
              ? ` <a href="${esc(record.pdfUrl)}" style="color:#2563eb;text-decoration:underline;font-size:9px;">CLEAR PDF</a>`
              : '';
            return `<li style="margin:0 0 6px;font-size:10px;">
              <div style="color:#0f172a;font-weight:600;">${esc(heading)}${reportLink}</div>
              ${details ? `<div style="color:#64748b;margin-top:2px;">${esc(details)}</div>` : ''}
            </li>`;
          })
          .join('')
      : '<li style="font-size:10px;color:#94a3b8;font-style:italic;">None</li>';

  return `<div style="margin-top:8px;">
    <div style="font-size:8px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">${esc(title)}</div>
    <ul style="margin:0;padding-left:16px;">${rows}</ul>
  </div>`;
}

function buildClearCorporationsHtml(records: ClearCorporateAssociationRecord[]): string {
  const rows =
    records.length > 0
      ? records
          .map((record) => {
            const details = [
              record.section ? `Section: ${record.section}` : '',
              record.reportKind ? `Report: ${record.reportKind}` : '',
            ]
              .filter(Boolean)
              .join(' · ');
            return `<li style="margin:0 0 6px;font-size:10px;">
              <div style="color:#0f172a;font-weight:600;">${esc(record.name || 'Corporation')}</div>
              ${details ? `<div style="color:#64748b;margin-top:2px;">${esc(details)}</div>` : ''}
            </li>`;
          })
          .join('')
      : '<li style="font-size:10px;color:#94a3b8;font-style:italic;">None</li>';

  return `<div style="margin-top:8px;">
    <div style="font-size:8px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;margin-bottom:4px;">Corporate filings</div>
    <ul style="margin:0;padding-left:16px;">${rows}</ul>
  </div>`;
}


function clearMatchStatusMeta(status?: string | null): { label: string; color: string; bg: string } {
  if (status === 'match') return { label: '✓', color: '#15803d', bg: '#dcfce7' };
  if (status === 'mismatch') return { label: '≠', color: '#b45309', bg: '#fef3c7' };
  return { label: '·', color: '#64748b', bg: '#f1f5f9' };
}

function isWideClearMatchRow(row: ClearPdfMatchRow): boolean {
  const label = String(row.label ?? '').trim().toLowerCase();
  return label === 'address';
}

function buildClearMatchCellHtml(row: ClearPdfMatchRow | null, wide = false): string {
  if (!row) {
    return `<td style="width:33.33%;padding:2px;vertical-align:top;"></td>`;
  }
  const meta = clearMatchStatusMeta(row.status);
  const width = wide ? '100%' : '33.33%';
  const colspan = wide ? ' colspan="3"' : '';
  return `<td${colspan} style="width:${width};padding:2px;vertical-align:top;">
    <div style="border:1px solid #e5e7eb;border-radius:3px;background:#fff;padding:3px 5px;">
      <div style="display:flex;align-items:center;gap:4px;margin-bottom:1px;">
        <span style="display:inline-block;min-width:12px;height:12px;line-height:12px;text-align:center;border-radius:999px;font-size:8px;font-weight:700;background:${meta.bg};color:${meta.color};">${esc(meta.label)}</span>
        <span style="font-size:8px;font-weight:700;color:#0f172a;line-height:1.15;">${esc(row.label || 'Field')}</span>
      </div>
      <div style="font-size:7.5px;color:#64748b;line-height:1.25;word-break:break-word;">
        <span style="font-weight:700;color:#374151;">App:</span> ${esc(row.applicationValue || '—')}
      </div>
      <div style="font-size:7.5px;color:#64748b;line-height:1.25;word-break:break-word;">
        <span style="font-weight:700;color:#374151;">CLEAR:</span> ${esc(row.clearValue || '—')}
      </div>
    </div>
  </td>`;
}

/** Pack match fields into compact 3-column rows (address spans full width). */
function buildClearMatchRowsHtml(rows: ClearPdfMatchRow[]): string {
  if (!rows.length) {
    return '<tr><td style="font-size:9px;color:#94a3b8;font-style:italic;padding:2px;">No comparison rows.</td></tr>';
  }

  const normal: ClearPdfMatchRow[] = [];
  const wide: ClearPdfMatchRow[] = [];
  for (const row of rows) {
    if (isWideClearMatchRow(row)) wide.push(row);
    else normal.push(row);
  }

  const trs: string[] = [];
  for (let i = 0; i < normal.length; i += 3) {
    const chunk = [normal[i] ?? null, normal[i + 1] ?? null, normal[i + 2] ?? null];
    trs.push(
      `<tr>${chunk.map((row) => buildClearMatchCellHtml(row)).join('')}</tr>`,
    );
  }
  for (const row of wide) {
    trs.push(`<tr>${buildClearMatchCellHtml(row, true)}</tr>`);
  }
  return trs.join('');
}

export function buildClearMatchSectionsHtml(
  sections: ClearPdfMatchSection[] | null | undefined,
): string {
  if (!Array.isArray(sections) || sections.length === 0) return '';

  const blocks = sections
    .map((section) => {
      const rows = Array.isArray(section.rows) ? section.rows : [];
      const ownerBit = String(section.ownerLabel ?? '').trim();
      const subtitleBit = String(section.subtitle ?? '').trim();
      const metaLine = [ownerBit, subtitleBit].filter(Boolean).join(' · ');
      return `<div style="margin-top:5px;border:1px solid #e5e7eb;border-radius:4px;background:#f9fafb;padding:5px 6px;">
        <div style="font-size:9px;font-weight:700;color:#0f172a;line-height:1.2;">${esc(section.title || 'CLEAR match')}</div>
        ${metaLine ? `<div style="font-size:7.5px;color:#64748b;margin-top:1px;line-height:1.2;">${esc(metaLine)}</div>` : ''}
        <table style="width:100%;border-collapse:separate;border-spacing:0;margin-top:3px;table-layout:fixed;">
          ${buildClearMatchRowsHtml(rows)}
        </table>
      </div>`;
    })
    .join('');

  return `<div style="margin-top:6px;padding-top:6px;border-top:1px solid #e8edf3;">
    <div style="font-size:7.5px;font-weight:700;letter-spacing:0.35px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">Application match</div>
    ${blocks}
  </div>`;
}

export function buildClearReportSectionsHtml(
  metadata: ClearReportMetadata | null | undefined,
  matchSections?: ClearPdfMatchSection[] | null,
): string {
  const matchHtml = buildClearMatchSectionsHtml(matchSections);
  if (!metadata && !matchHtml) return '';

  if (!metadata) return matchHtml;

  const lienJudgments = Array.isArray(metadata.clearLienJudgments)
    ? metadata.clearLienJudgments
    : [];
  const corporations = Array.isArray(metadata.clearCorporateAssociations)
    ? metadata.clearCorporateAssociations
    : [];
  const judgements = lienJudgments.filter((record) => record?.kind === 'judgment');
  const liens = lienJudgments.filter((record) => record?.kind === 'lien');

  return `${matchHtml}<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e8edf3;">
    ${buildClearLienJudgmentListHtml('Judgements', judgements)}
    ${buildClearLienJudgmentListHtml('Liens', liens)}
    ${buildClearCorporationsHtml(corporations)}
  </div>`;
}

function merchantRecords(merchant: DataMerchMerchant): DataMerchRecord[] {
  if (Array.isArray(merchant.records)) return merchant.records;
  if (Array.isArray(merchant.notes)) return merchant.notes;
  return [];
}

function recordText(record: DataMerchRecord): string {
  return String(record.note ?? record.notes ?? '').trim() || '—';
}

function fmtDataMerchDate(raw?: string | null): string | null {
  const value = String(raw ?? '').trim();
  if (!value || value === '0001-01-01') return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function merchantDisplayName(merchant: DataMerchMerchant): string {
  return String(
    merchant.legalName ?? merchant.legal_name ?? merchant.name ?? merchant.business_name ?? '',
  ).trim() || 'Unknown merchant';
}

function merchantEin(merchant: DataMerchMerchant, fallback?: string): string {
  return String(merchant.fein ?? merchant.ein ?? fallback ?? '').trim();
}

function merchantAddress(merchant: DataMerchMerchant): string | null {
  const parts = [
    merchant.address,
    merchant.street1,
    merchant.street2,
    [merchant.city, merchant.state].filter(Boolean).join(', '),
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  return unique.length > 0 ? unique.join(' · ') : null;
}

function recordFunder(record: DataMerchRecord): string | null {
  const value = record.addedBy ?? record.funder ?? record.added_by;
  return value != null && String(value).trim() ? String(value).trim() : null;
}

function buildDataMerchFindingsHtml(
  notes: string | undefined,
  status: string | undefined,
  noteImages: CheckItemState['noteImages'],
  datamerch?: BackgroundCheckReportPayload['datamerch'] | null,
): string {
  const trimmed = String(notes || '').trim();
  if (trimmed || (noteImages && noteImages.length > 0)) {
    return formatFindings(notes, noteImages);
  }
  if (!datamerch) {
    if (normalizeCheckStatus(status) === 'completed') {
      return 'Not listed in DataMerch default database.';
    }
    return '—';
  }
  const totalRecords = (datamerch.merchants ?? []).reduce(
    (sum, merchant) => sum + merchantRecords(merchant).length,
    0,
  );
  if (totalRecords > 0) {
    const merchantCount = datamerch.merchants?.length ?? 0;
    return esc(
      `${totalRecords} record${totalRecords !== 1 ? 's' : ''} found across ${merchantCount} merchant${merchantCount !== 1 ? 's' : ''}.`,
    );
  }
  if (normalizeCheckStatus(status) === 'completed') {
    return 'Not listed in DataMerch default database.';
  }
  return '—';
}

function buildDataMerchMerchantHtml(merchant: DataMerchMerchant, fallbackEin?: string): string {
  const name = esc(merchantDisplayName(merchant));
  const ein = fmtEin(merchantEin(merchant, fallbackEin));
  const location = [merchant.city, merchant.state].filter(Boolean).join(', ');
  const einLine = `EIN ${esc(ein)}${location ? ` · ${esc(location)}` : ''}`;
  const address = merchantAddress(merchant);
  const startDate = fmtDataMerchDate(merchant.businessStartDate);

  const detailParts = [
    merchant.dba ? `DBA: ${esc(String(merchant.dba))}` : null,
    address ? `Address: ${esc(address)}` : null,
    merchant.industry ? `Industry: ${esc(String(merchant.industry))}` : null,
    startDate ? `Started: ${esc(startDate)}` : null,
    merchant.businessPhone ? `Phone: ${esc(String(merchant.businessPhone))}` : null,
  ].filter(Boolean);

  const detailRow = detailParts.length
    ? `<div style="margin-top:3px;font-size:9px;color:#6b7280;line-height:1.45;">${detailParts.join(' · ')}</div>`
    : '';

  const records = merchantRecords(merchant);
  const recordBlocks = records.length
    ? records
        .map((record) => {
          const category = esc(String(record.category ?? 'Record'));
          const date = fmtDataMerchDate(record.createdAt ?? record.created_at);
          const funder = recordFunder(record);
          return `
          <div class="dm-record" style="border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;padding:8px 10px;margin-top:6px;break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid;">
            <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
              <tr>
                <td style="font-size:9px;font-weight:600;color:#374151;text-transform:uppercase;vertical-align:top;">${category}</td>
                <td style="font-size:9px;color:#6b7280;text-align:right;vertical-align:top;white-space:nowrap;">${date ? `Reported: ${esc(date)}` : ''}</td>
              </tr>
            </table>
            <div style="font-size:10px;color:#111827;margin-top:4px;line-height:1.45;white-space:pre-wrap;">${esc(recordText(record))}</div>
            ${funder ? `<div style="font-size:9px;color:#6b7280;margin-top:4px;">Funder: ${esc(funder)}</div>` : ''}
          </div>`;
        })
        .join('')
    : `<div style="font-size:10px;color:#6b7280;margin-top:6px;">No funder reports on file for this match.</div>`;

  return `
    <div class="dm-merchant" style="margin-bottom:10px;">
      <div class="dm-merchant-header" style="border:1px solid #e5e7eb;border-radius:6px;background:#fff;padding:10px 12px;margin-bottom:6px;break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid;">
        <div style="font-size:12px;font-weight:600;color:#111827;line-height:1.3;">${name}</div>
        <div style="font-size:10px;color:#6b7280;margin-top:2px;">${einLine}</div>
        ${detailRow}
      </div>
      ${recordBlocks}
    </div>`;
}

function buildDataMerchHtml(
  datamerch: NonNullable<BackgroundCheckReportPayload['datamerch']>,
  searchedAt?: string | null,
  fallbackEin?: string,
): string {
  const totalRecords = (datamerch.merchants ?? []).reduce(
    (sum, merchant) => sum + merchantRecords(merchant).length,
    0,
  );
  const merchantCount = datamerch.merchants?.length ?? 0;
  const hasRecords = totalRecords > 0;

  const summaryTitle = hasRecords
    ? `<div style="font-size:11px;font-weight:600;color:${hasRecords ? '#92400e' : '#166534'};">${totalRecords} record${totalRecords !== 1 ? 's' : ''} found across ${merchantCount} merchant${merchantCount !== 1 ? 's' : ''}</div>`
    : `<div style="font-size:11px;font-weight:600;color:#166534;">No DataMerch records found</div>`;

  const matchLine = hasRecords
    ? datamerch.searchType === 'both'
      ? `Matched using EIN and business name: ${esc(fmtEin(datamerch.ein ?? ''))} / ${esc(datamerch.businessName ?? datamerch.searchQuery ?? '')}`
      : datamerch.searchType === 'ein'
        ? `Matched using EIN: ${esc(fmtEin(datamerch.searchQuery ?? ''))}`
        : `Matched using business name: ${esc(datamerch.searchQuery ?? '')}`
    : datamerch.searchType === 'both'
      ? `Searched by EIN ${esc(fmtEin(datamerch.ein ?? ''))} and business name "${esc(datamerch.businessName ?? '')}"`
      : datamerch.searchType === 'ein'
        ? `Searched by EIN ${esc(fmtEin(datamerch.searchQuery ?? ''))}`
        : `No exact match for business name "${esc(datamerch.businessName ?? datamerch.searchQuery ?? '')}"`;

  const summaryBg = hasRecords ? '#fffbeb' : '#f0fdf4';
  const summaryBorder = hasRecords ? '#fde68a' : '#bbf7d0';
  const summaryColor = hasRecords ? '#92400e' : '#166534';

  const merchants = (datamerch.merchants ?? [])
    .map((merchant) => buildDataMerchMerchantHtml(merchant, fallbackEin))
    .join('');

  return `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid #e8edf3;">
      ${searchedAt ? `<div style="font-size:9px;color:#6b7280;margin:0 0 6px;">Last searched ${esc(fmtTimestamp(searchedAt))}</div>` : ''}
      <div style="border:1px solid ${summaryBorder};background:${summaryBg};border-radius:6px;padding:8px 10px;margin-bottom:6px;color:${summaryColor};">
        ${summaryTitle}
        <div style="font-size:10px;margin-top:3px;line-height:1.4;">${matchLine}</div>
      </div>
      ${merchants}
    </div>`;
}

function isImageAttachment(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}

function buildAttachmentsCell(state: CheckItemState): string {
  if (!state.attachmentName) {
    return '<span style="color:#cbd5e1;font-style:italic;">None</span>';
  }
  const name = esc(state.attachmentName);
  if (state.attachmentUrl) {
    return `<a href="${esc(state.attachmentUrl)}" style="color:#2563eb;text-decoration:underline;">${name}</a>`;
  }
  return name;
}

function buildAttachmentPreviewHtml(
  state: CheckItemState,
  preview?: AttachmentPreview | null,
): string {
  const src =
    preview?.dataUrl ||
    (state.attachmentUrl && isImageAttachment(state.attachmentName ?? '')
      ? state.attachmentUrl
      : null);
  if (!src) return '';

  const kindLabel =
    preview?.kind === 'pdf'
      ? 'PDF · first page preview'
      : preview?.kind === 'image' || isImageAttachment(state.attachmentName ?? '')
        ? 'Image preview'
        : 'Attachment preview';

  return `
    <div style="margin-top:8px;border:1px solid #e2e8f0;border-radius:6px;padding:8px;background:#fff;">
      <img src="${esc(src)}" alt="${esc(state.attachmentName ?? 'Attachment')}" style="display:block;width:100%;max-height:300px;object-fit:contain;object-position:top center;" />
      <div style="font-size:9px;color:#64748b;margin-top:4px;">${kindLabel}</div>
    </div>`;
}

function buildCheckCardHtml(
  index: number,
  title: string,
  description: string,
  state: CheckItemState,
  preview?: AttachmentPreview | null,
  extraContent = '',
  findingsOverride?: string,
): string {
  const displayTitle = state.optional ? `${title} (optional)` : title;
  const findings = findingsOverride ?? formatFindings(state.notes, state.noteImages);
  const reviewed = fmtDate(state.savedAt);
  const attachments = buildAttachmentsCell(state);
  const attachmentPreview = buildAttachmentPreviewHtml(state, preview);
  const statusBadges = `${statusBadgeHtml(state.status)}${state.risk ? ` <span style="display:inline-block;width:4px;"></span> ${riskBadgeHtml(state.risk)}` : ''}`;

  const coreSection = `
      <div style="background:#eef2f7;padding:10px 12px;border-radius:7px 7px 0 0;border-bottom:2px solid #cbd5e1;">
        <table style="width:100%;border-collapse:collapse;margin:0;" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width:30px;padding:0 8px 0 0;vertical-align:middle;">
              <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:50%;background:${NAVY};color:#fff;font-size:11px;font-weight:700;">${index}</span>
            </td>
            <td style="vertical-align:middle;padding:0;">
              <div style="font-size:13px;font-weight:700;color:${NAVY};line-height:1.2;">${esc(displayTitle)}</div>
              <div style="font-size:10px;color:#94a3b8;margin-top:1px;line-height:1.2;">${esc(description)}</div>
            </td>
            <td style="width:1%;white-space:nowrap;text-align:right;vertical-align:middle;padding:0 0 0 8px;">
              ${statusBadges}
            </td>
          </tr>
        </table>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width:92px;padding:5px 9px;font-size:8px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;vertical-align:top;background:#f8fafc;border-right:1px solid #f1f5f9;">FINDINGS</td>
          <td style="padding:5px 9px;font-size:11px;color:#334155;line-height:1.35;">${findings}</td>
        </tr>
        <tr>
          <td style="width:92px;padding:5px 9px;border-top:1px solid #f1f5f9;font-size:8px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;vertical-align:top;background:#f8fafc;border-right:1px solid #f1f5f9;">REVIEWED</td>
          <td style="padding:5px 9px;border-top:1px solid #f1f5f9;font-size:11px;color:#334155;">${esc(reviewed)}</td>
        </tr>
        <tr>
          <td style="width:92px;padding:5px 9px;border-top:1px solid #f1f5f9;font-size:8px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;color:#94a3b8;vertical-align:top;background:#f8fafc;border-right:1px solid #f1f5f9;">ATTACHMENTS</td>
          <td style="padding:5px 9px;border-top:1px solid #f1f5f9;font-size:11px;color:#334155;">${attachments}</td>
        </tr>
      </table>`;

  const pageBreakGuard =
    'break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid;';
  const attachmentBlock = attachmentPreview
    ? `<div style="padding:0 9px 9px;">${attachmentPreview}</div>`
    : '';
  const extraBlock = extraContent
    ? `<div style="padding:0 9px 9px;">${extraContent}</div>`
    : '';
  const allowInnerBreak = Boolean(extraContent);

  if (allowInnerBreak) {
    return `
    <div class="bc-check-card-allow-break" style="border:1px solid #e8edf3;border-radius:8px;background:#fff;margin:0 0 7px;">
      <div class="bc-check-core" style="${pageBreakGuard}">
        ${coreSection}
      </div>
      ${attachmentBlock}
      ${extraBlock}
    </div>`;
  }

  return `
    <div class="bc-check-card" style="border:1px solid #e8edf3;border-radius:8px;background:#fff;margin:0 0 7px;${pageBreakGuard}">
      ${coreSection}
      ${attachmentBlock}
    </div>`;
}

function buildGraphsHtml(
  checks: Record<string, CheckItemState>,
  checkIds: string[],
  merchantName: string,
): string {
  const total = checkIds.length;
  const completed = checkIds.filter(
    (id) => normalizeCheckStatus(checks[id]?.status) === 'completed',
  ).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const offset = 264 - (percent / 100) * 264;

  const statusBars = (['completed', 'pending'] as const)
    .map((status) => {
      const count = countByStatus(checks, checkIds, status);
      const width = total > 0 ? Math.max((count / total) * 100, count > 0 ? 12 : 0) : 0;
      const label = status === 'completed' ? 'Completed' : 'Pending';
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:56px;font-size:10px;color:#374151;">${label}</span>
        <div style="flex:1;height:7px;background:#e5e7eb;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${width}%;background:${BAR_COLOR[status]};border-radius:999px;"></div>
        </div>
        <span style="width:12px;text-align:right;font-size:10px;font-weight:600;">${count}</span>
      </div>`;
    })
    .join('');

  const riskBars = (['high', 'medium', 'low'] as const)
    .map((risk) => {
      const count = countByRisk(checks, checkIds, risk);
      const width = total > 0 ? Math.max((count / total) * 100, count > 0 ? 12 : 0) : 0;
      const label = risk === 'high' ? 'High' : risk === 'medium' ? 'Medium' : 'Low';
      return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="width:56px;font-size:10px;color:#374151;">${label}</span>
        <div style="flex:1;height:7px;background:#e5e7eb;border-radius:999px;overflow:hidden;">
          <div style="height:100%;width:${width}%;background:${BAR_COLOR[risk]};border-radius:999px;"></div>
        </div>
        <span style="width:12px;text-align:right;font-size:10px;font-weight:600;">${count}</span>
      </div>`;
    })
    .join('');

  return `
    <div class="bc-graphs-section" style="margin:14px 0 0;break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid;">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;break-inside:avoid;page-break-inside:avoid;" cellspacing="0" cellpadding="0">
        <tr>
          <td style="width:50%;vertical-align:top;padding-right:5px;">
            <div style="border:1px solid #e5e7eb;border-radius:8px;background:#fff;padding:11px;height:100%;box-sizing:border-box;">
              <div style="font-size:12px;font-weight:600;margin-bottom:8px;color:#111827;">Completion Progress</div>
              <div style="width:96px;height:96px;margin:0 auto 6px;">
                <svg viewBox="0 0 108 108" style="width:96px;height:96px;display:block;" aria-hidden="true">
                  <g transform="rotate(-90 54 54)">
                    <circle cx="54" cy="54" r="42" fill="none" stroke="#E5E7EB" stroke-width="10" />
                    <circle cx="54" cy="54" r="42" fill="none" stroke="${BRAND}" stroke-width="10" stroke-linecap="round" stroke-dasharray="264" stroke-dashoffset="${offset}" />
                  </g>
                  <text x="54" y="58" text-anchor="middle" fill="#111827" font-size="18" font-weight="700" font-family="Arial, Helvetica, sans-serif">${percent}%</text>
                </svg>
              </div>
              <div style="text-align:center;font-size:11px;font-weight:700;color:#111827;">${esc((merchantName || 'Merchant').toUpperCase())}</div>
              <div style="text-align:center;font-size:10px;color:#6b7280;margin-top:2px;">${completed} of ${total} complete</div>
            </div>
          </td>
          <td style="width:50%;vertical-align:top;padding-left:5px;">
            <div style="border:1px solid #e5e7eb;border-radius:8px;background:#fff;padding:11px;height:100%;box-sizing:border-box;">
              <div style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.04em;margin-bottom:8px;">STATUS</div>
              ${statusBars}
              <div style="font-size:10px;font-weight:700;color:#6b7280;letter-spacing:0.04em;margin:10px 0 8px;">RISK</div>
              ${riskBars}
            </div>
          </td>
        </tr>
      </table>
    </div>`;
}

function buildHtml(payload: BackgroundCheckReportPayload): string {
  const checkIds = CHECK_RESOURCES.map((r) => r.id).filter((id) => !payload.checks[id]?.optional);
  const generatedAt = fmtTimestamp(new Date().toISOString());
  const reportDate = fmtDate(new Date().toISOString());
  const dealLabel = [payload.merchantName, payload.dealId].filter(Boolean).join(' — ') || '—';

  const chips =
    summaryChip(countByStatus(payload.checks, checkIds, 'completed'), 'completed') +
    summaryChip(countByStatus(payload.checks, checkIds, 'pending'), 'pending');

  let index = 0;
  const cards = CHECK_RESOURCES.map((resource) => {
    index += 1;
    const state = payload.checks[resource.id] ?? { notes: '' };
    const preview = payload.attachmentPreviews?.[resource.id] ?? null;
    if (resource.id === 'datamerch' && payload.datamerch) {
      const dmFindings = buildDataMerchFindingsHtml(
        state.notes,
        state.status,
        state.noteImages,
        payload.datamerch,
      );
      const dmContent = buildDataMerchHtml(
        payload.datamerch,
        payload.datamerchSearchedAt,
        payload.ein,
      );
      return buildCheckCardHtml(
        index,
        resource.title,
        resource.description,
        state,
        preview,
        dmContent,
        dmFindings,
      );
    }
    if (resource.id === 'tlo') {
      const clearExtra = buildClearReportSectionsHtml(
        state.clearMetadata,
        payload.clearMatchSections,
      );
      return buildCheckCardHtml(
        index,
        resource.title,
        resource.description,
        state,
        preview,
        clearExtra,
      );
    }
    return buildCheckCardHtml(index, resource.title, resource.description, state, preview);
  }).join('');

  return `
    <style>
      .bc-check-core {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
      }
      .bc-check-card {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
      }
      .bc-check-card-allow-break {
        break-inside: auto;
        page-break-inside: auto;
      }
      .dm-merchant-header,
      .dm-record {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
      }
      .bc-graphs-section,
      .bc-report-footer,
      .bc-summary-tail {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-column-break-inside: avoid;
      }
      @media print {
        .dm-record,
        .dm-merchant-header,
        .bc-check-core,
        .bc-check-card,
        .bc-graphs-section,
        .bc-summary-tail {
          break-inside: avoid;
          page-break-inside: avoid;
        }
      }
    </style>
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff;font-size:12px;line-height:1.35;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(90deg,${NAVY} 0%,${BRAND} 100%);color:#fff;padding:14px 22px;">
        ${buildHeaderLogoHtml()}
        <div style="text-align:right;">
          <div style="font-size:22px;font-weight:800;letter-spacing:1.5px;line-height:1.1;">COMPLIANCE REPORT</div>
          <div style="font-size:10px;letter-spacing:0.4px;opacity:0.9;margin-top:3px;">BACKGROUND CHECK · DUE-DILIGENCE SUMMARY</div>
        </div>
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 22px;border-bottom:1px solid #e8edf3;font-size:11px;color:#64748b;">
        <span>${checkIds.length} checks reviewed</span>
        <span style="display:inline-flex;align-items:center;gap:5px;">${chips || '<span style="font-size:10px;color:#94a3b8;">No results recorded yet</span>'}</span>
      </div>

      <div style="margin:12px 22px 0;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;">
        <div style="background:#eaf1fa;color:${NAVY};text-align:center;font-size:10px;font-weight:700;letter-spacing:0.8px;padding:5px 10px;">DEAL OVERVIEW</div>
        <table style="width:100%;border-collapse:collapse;" cellspacing="0" cellpadding="0">
          <tr>
            <td style="width:50%;border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">DEAL</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${esc(dealLabel)}</div>
            </td>
            <td style="width:50%;border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">APPROVED AMOUNT</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${esc(payload.offerAmount || '—')}</div>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">EIN</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${esc(fmtEin(payload.ein))}</div>
            </td>
            <td style="border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">OWNER</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${esc(payload.ownerName || '—')}</div>
            </td>
          </tr>
          <tr>
            <td style="border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">SSN</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${esc(fmtSsn(payload.ownerSsn ?? ''))}</div>
            </td>
            <td style="border:1px solid #e2e8f0;padding:6px 10px;vertical-align:top;">
              <div style="font-size:8px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#94a3b8;margin-bottom:2px;">REPORT DATE</div>
              <div style="font-size:12px;font-weight:700;color:#0f172a;">${esc(reportDate)}</div>
            </td>
          </tr>
        </table>
      </div>

      <div style="margin:14px 22px 0;">
        <div style="font-size:12px;font-weight:700;color:${NAVY};margin:0 0 5px;">BACKGROUND CHECKS</div>
        <div style="height:2px;background:${NAVY};margin-bottom:8px;"></div>
      </div>

      <div style="padding:0 22px;">
        ${cards}
        <div class="bc-summary-tail" style="break-inside:avoid;page-break-inside:avoid;-webkit-column-break-inside:avoid;">
          ${buildGraphsHtml(payload.checks, checkIds, payload.merchantName)}
          <div class="bc-report-footer" style="margin:12px 0 0;padding:8px 0 14px;border-top:1px solid #e8edf3;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between;text-transform:uppercase;letter-spacing:0.2px;">
            <span>Confidential — for internal underwriting use only.</span>
            <span>Generated ${esc(generatedAt)}</span>
          </div>
        </div>
      </div>
    </div>`;
}

export function buildBackgroundCheckReportFilename(merchantName: string): string {
  const safeName = String(merchantName || 'merchant')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `Compliance-Report-${safeName || 'merchant'}.pdf`;
}

export async function generateBackgroundCheckReportPdf(
  payload: BackgroundCheckReportPayload,
): Promise<{ buffer: Buffer; filename: string }> {
  const html = buildHtml(payload);
  const buffer = await renderLetterHtmlToPdfBuffer(html);
  return {
    buffer,
    filename: buildBackgroundCheckReportFilename(payload.merchantName),
  };
}
