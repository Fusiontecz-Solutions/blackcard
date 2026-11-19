import { createHash } from 'crypto';
import { extractOne } from './clearS2sClient';

type ClearReportKind = 'person' | 'business';

export type ClearLienJudgmentKind = 'lien' | 'judgment';

export type ClearLienJudgmentRecord = {
    source: 'clear';
    kind: ClearLienJudgmentKind;
    groupId: string;
    reportKind: ClearReportKind;
    caseNumber?: string;
    court?: string;
    filingDate?: string;
    amount?: string;
    parties?: string;
    status?: string;
    description?: string;
    /** Uploaded CLEAR PDF URL for this report group, when available. */
    pdfUrl?: string;
};

/** NY Court evidence row written into metadata.judgements / metadata.liens. */
export type ClearNyCourtEvidenceItem = {
    id: string;
    kind: 'record';
    name: string;
    url: string;
    source: 'clear';
    court?: string;
    filingDate?: string;
    amount?: string;
    parties?: string;
    caseNumber?: string;
    status?: string;
};

/**
 * Known CLEAR leaf / record wrappers. Real CLEAR person-report XML often uses
 * Result / Record / Detail style containers instead of bare <Judgment>, so the
 * parser also has a field-driven fallback below.
 */
const RECORD_BLOCK_TAGS = [
    'Judgment',
    'Judgement',
    'CivilJudgment',
    'JudgmentRecord',
    'JudgementRecord',
    'JudgmentDetail',
    'JudgmentInfo',
    'JudgmentLien',
    'Lien',
    'TaxLien',
    'StateTaxLien',
    'FederalTaxLien',
    'TaxWarrant',
    'LienRecord',
    'LienDetail',
    'LienInfo',
    'LienJudgment',
    'LienAndJudgment',
    'LienJudgmentRecord',
    'LienJudgmentDetail',
    'LienJudgmentInfo',
    'LienJudgmentResult',
    'PersonLienJudgment',
    'BusinessLienJudgment',
    'CourtJudgment',
    'CivilCourtJudgment',
] as const;

const SECTION_TAGS = [
    'LienJudgmentSection',
    'LienJudgment',
    'LiensJudgments',
    'LienAndJudgmentSection',
    'LiensAndJudgmentsSection',
    'LienJudgmentsSection',
] as const;

/** Tags that are fields, not filing records. */
const FIELD_TAG_NAMES = new Set(
    [
        'CaseNumber',
        'CaseNo',
        'DocketNumber',
        'DocketNo',
        'FilingNumber',
        'FileNumber',
        'DocumentNumber',
        'ControlNumber',
        'VendorNumber',
        'Number',
        'Court',
        'CourtName',
        'CourtLocation',
        'CourtCounty',
        'FilingCounty',
        'FilingOffice',
        'Jurisdiction',
        'County',
        'FilingDate',
        'FileDate',
        'DateFiled',
        'JudgmentDate',
        'JudgementDate',
        'RecordDate',
        'ReportedDate',
        'SatisfactionDate',
        'ExpirationDate',
        'CollectionDate',
        'StatusDate',
        'Date',
        'Amount',
        'JudgmentAmount',
        'JudgementAmount',
        'AwardAmount',
        'LienAmount',
        'TotalAmount',
        'OriginalAmount',
        'PrincipalAmount',
        'CreditorAmount',
        'Status',
        'CaseStatus',
        'JudgmentStatus',
        'Disposition',
        'ReleaseStatus',
        'Description',
        'DocumentType',
        'FilingType',
        'Type',
        'RecordType',
        'LienType',
        'JudgmentType',
        'JudgementType',
        'ActionTaken',
        'Creditor',
        'CreditorName',
        'Plaintiff',
        'PlaintiffName',
        'Debtor',
        'DebtorName',
        'Defendant',
        'DefendantName',
        'Parties',
        'PartyNames',
        'Party',
        'Name',
        'Role',
        'Address',
        'Street',
        'City',
        'State',
        'ZipCode',
        'GLB',
        'DPPA',
        'VOTER',
        'StatusCode',
        'SubStatusCode',
        'Message',
        'Reference',
        'GroupID',
        'GroupId',
    ].map((tag) => tag.toLowerCase()),
);

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function cleanText(value: string | undefined | null): string {
    return decodeXmlEntities(String(value ?? ''))
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function firstField(block: string, tags: string[]): string {
    for (const tag of tags) {
        const value = cleanText(extractOne(block, tag));
        if (value) return value;
    }
    return '';
}

function extractNamedBlocks(xml: string, tags: readonly string[]): Array<{ tag: string; body: string }> {
    const found: Array<{ tag: string; body: string }> = [];
    for (const tag of tags) {
        const pattern = new RegExp(
            `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,
            'gi',
        );
        for (const match of xml.matchAll(pattern)) {
            found.push({ tag, body: match[1] ?? '' });
        }
    }
    return found;
}

/** Inventory of Lien/Judgment-related element names for empty-parse diagnostics. */
export function inventoryClearLienJudgmentTags(xml: string): string[] {
    if (!xml?.trim()) return [];
    const found = new Set<string>();
    const pattern = /<\/?(?:[\w.-]+:)?([A-Za-z][\w.-]*)\b[^>]*>/g;
    for (const match of xml.matchAll(pattern)) {
        const tag = match[1] ?? '';
        if (/lien|judg|warrant|docket|filing|creditor|debtor/i.test(tag)) {
            found.add(tag);
        }
    }
    return [...found].sort((a, b) => a.localeCompare(b));
}

function classifyRecord(tag: string, block: string): ClearLienJudgmentKind {
    const typeText = [
        tag,
        firstField(block, [
            'DocumentType',
            'FilingType',
            'Type',
            'RecordType',
            'LienType',
            'JudgmentType',
            'JudgementType',
            'Description',
            'ActionTaken',
        ]),
    ]
        .join(' ')
        .toLowerCase();

    if (
        /\bliens?\b|\btax\s*lien\b|\btax\s*warrant\b|\bucc\b|\bcertificate of debt\b/.test(typeText) &&
        !/\bjudg(?:e)?ments?\b/.test(typeText)
    ) {
        return 'lien';
    }
    if (/\bjudg(?:e)?ments?\b/.test(typeText) && !/\bliens?\b/.test(typeText)) {
        return 'judgment';
    }
    if (/^lien|taxlien|taxwarrant|warrant/i.test(tag)) return 'lien';
    if (/judg/i.test(tag)) return 'judgment';
    if (/lien/i.test(typeText) && !/judg/i.test(typeText)) return 'lien';
    return 'judgment';
}

function buildParties(block: string): string {
    const creditor = firstField(block, ['Creditor', 'CreditorName', 'Plaintiff', 'PlaintiffName']);
    const debtor = firstField(block, ['Debtor', 'DebtorName', 'Defendant', 'DefendantName']);
    const parties = firstField(block, ['Parties', 'PartyNames', 'Party']);
    if (creditor && debtor) return `${creditor} v. ${debtor}`;
    if (parties) return parties;
    return [creditor, debtor].filter(Boolean).join(' / ');
}

function parseRecordBlock(
    tag: string,
    block: string,
    meta: { groupId: string; reportKind: ClearReportKind },
): ClearLienJudgmentRecord | null {
    const caseNumber = firstField(block, [
        'CaseNumber',
        'CaseNo',
        'DocketNumber',
        'DocketNo',
        'FilingNumber',
        'FileNumber',
        'DocumentNumber',
        'ControlNumber',
        'VendorNumber',
        'Number',
    ]);
    const court = firstField(block, [
        'Court',
        'CourtName',
        'CourtLocation',
        'CourtCounty',
        'FilingCounty',
        'FilingOffice',
        'Jurisdiction',
        'County',
    ]);
    const filingDate = firstField(block, [
        'FilingDate',
        'FileDate',
        'DateFiled',
        'JudgmentDate',
        'JudgementDate',
        'RecordDate',
        'ReportedDate',
        'CollectionDate',
        'Date',
    ]);
    const amount = firstField(block, [
        'Amount',
        'JudgmentAmount',
        'JudgementAmount',
        'AwardAmount',
        'LienAmount',
        'TotalAmount',
        'OriginalAmount',
        'PrincipalAmount',
        'CreditorAmount',
    ]);
    const status = firstField(block, [
        'Status',
        'CaseStatus',
        'JudgmentStatus',
        'Disposition',
        'ReleaseStatus',
    ]);
    const description = firstField(block, [
        'Description',
        'DocumentType',
        'FilingType',
        'Type',
        'LienType',
        'JudgmentType',
        'JudgementType',
        'ActionTaken',
    ]);
    const parties = buildParties(block);

    if (!caseNumber && !court && !filingDate && !amount && !parties && !description) {
        return null;
    }

    // Avoid treating tiny wrappers / address snippets as filings.
    const signalCount = [caseNumber, court, filingDate, amount, parties, description].filter(Boolean)
        .length;
    if (signalCount < 2 && !/lien|judg|warrant/i.test(`${tag} ${description}`)) {
        return null;
    }

    return {
        source: 'clear',
        kind: classifyRecord(tag, block),
        groupId: meta.groupId,
        reportKind: meta.reportKind,
        caseNumber: caseNumber || undefined,
        court: court || undefined,
        filingDate: filingDate || undefined,
        amount: amount || undefined,
        parties: parties || undefined,
        status: status || undefined,
        description: description || undefined,
    };
}

function looksLikeFilingRecord(tag: string, body: string): boolean {
    if (!body.trim()) return false;
    if (FIELD_TAG_NAMES.has(tag.toLowerCase())) return false;
    if (/section$/i.test(tag)) return false;

    const hasId = Boolean(
        firstField(body, [
            'CaseNumber',
            'CaseNo',
            'DocketNumber',
            'DocketNo',
            'FilingNumber',
            'FileNumber',
            'DocumentNumber',
            'ControlNumber',
            'VendorNumber',
        ]),
    );
    const hasAmount = Boolean(
        firstField(body, [
            'Amount',
            'JudgmentAmount',
            'JudgementAmount',
            'AwardAmount',
            'LienAmount',
            'TotalAmount',
            'OriginalAmount',
            'PrincipalAmount',
        ]),
    );
    const hasType = Boolean(
        firstField(body, [
            'DocumentType',
            'FilingType',
            'Type',
            'RecordType',
            'LienType',
            'JudgmentType',
            'JudgementType',
            'ActionTaken',
        ]),
    );
    const hasParty = Boolean(
        firstField(body, [
            'Creditor',
            'CreditorName',
            'Plaintiff',
            'PlaintiffName',
            'Debtor',
            'DebtorName',
            'Defendant',
            'DefendantName',
        ]),
    );
    const hasCourtOrDate = Boolean(
        firstField(body, [
            'Court',
            'CourtName',
            'FilingOffice',
            'FilingDate',
            'FileDate',
            'DateFiled',
            'JudgmentDate',
            'JudgementDate',
        ]),
    );

    const signalScore =
        Number(hasId) + Number(hasAmount) + Number(hasType) + Number(hasParty) + Number(hasCourtOrDate);
    if (signalScore < 2) return false;

    // Prefer blocks that are clearly lien/judgment-related when the tag is generic
    // (Result, Record, Detail, Document, Info, …).
    if (/lien|judg|warrant|docket/i.test(tag)) return true;
    if (hasType || hasAmount || (hasId && hasParty)) return true;
    return signalScore >= 3;
}

/**
 * Fallback when CLEAR nests filings under generic Result/Record/Detail tags.
 * Walks every element in the section and keeps blocks that look like filings.
 */
function extractFieldDrivenFilingBlocks(xml: string): Array<{ tag: string; body: string }> {
    const found: Array<{ tag: string; body: string }> = [];
    const pattern =
        /<(?:[\w.-]+:)?([A-Za-z][\w.-]*)\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?\1>/gi;
    for (const match of xml.matchAll(pattern)) {
        const tag = match[1] ?? '';
        const body = match[2] ?? '';
        if (!looksLikeFilingRecord(tag, body)) continue;
        found.push({ tag, body });
    }
    return found;
}

/**
 * Parse CLEAR person/business report XML for Lien / Judgment rows.
 * Tolerant of tag naming variance across CLEAR report schemas.
 */
export function parseClearLienJudgmentRecords(
    xml: string,
    meta: { groupId: string; reportKind: ClearReportKind },
): ClearLienJudgmentRecord[] {
    if (!xml?.trim()) return [];

    const sectionBodies = extractNamedBlocks(xml, SECTION_TAGS).map((entry) => entry.body);
    const searchXml = sectionBodies.length > 0 ? sectionBodies.join('\n') : xml;

    let blocks = extractNamedBlocks(searchXml, RECORD_BLOCK_TAGS);
    // CLEAR often uses generic Result/Record wrappers inside LienJudgmentSection.
    if (blocks.length === 0) {
        blocks = extractFieldDrivenFilingBlocks(searchXml);
    } else {
        // Keep known tags, but also pick up sibling Result-style filings CLEAR nests nearby.
        const extras = extractFieldDrivenFilingBlocks(searchXml).filter(
            (block) => !RECORD_BLOCK_TAGS.some((tag) => tag.toLowerCase() === block.tag.toLowerCase()),
        );
        blocks = [...blocks, ...extras];
    }

    const records: ClearLienJudgmentRecord[] = [];
    const seen = new Set<string>();

    for (const { tag, body } of blocks) {
        if (!body.trim()) continue;
        // Prefer leaf records; skip wrappers that only nest other known lien/judgment blocks.
        const nestedChildren = extractNamedBlocks(
            body,
            RECORD_BLOCK_TAGS.filter((childTag) => childTag.toLowerCase() !== tag.toLowerCase()),
        );
        if (nestedChildren.length > 0) continue;

        const record = parseRecordBlock(tag, body, meta);
        if (!record) continue;
        const key = [
            record.kind,
            record.caseNumber ?? '',
            record.court ?? '',
            record.filingDate ?? '',
            record.amount ?? '',
            record.parties ?? '',
            record.description ?? '',
        ].join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        records.push(record);
    }

    return records;
}

export function clearLienJudgmentTitle(record: ClearLienJudgmentRecord): string {
    const kindLabel = record.kind === 'lien' ? 'Lien' : 'Judgment';
    const parts = [kindLabel, record.amount, record.court || record.caseNumber].filter(Boolean);
    return parts.join(' · ');
}

function stableEvidenceId(record: ClearLienJudgmentRecord): string {
    const raw = [
        record.kind,
        record.groupId,
        record.caseNumber ?? '',
        record.court ?? '',
        record.filingDate ?? '',
        record.amount ?? '',
        record.parties ?? '',
    ].join('|');
    const hash = createHash('sha1').update(raw).digest('hex').slice(0, 12);
    return `clear-${record.kind}-${hash}`;
}

export function toNyCourtEvidenceItem(
    record: ClearLienJudgmentRecord,
    pdfUrl?: string,
): ClearNyCourtEvidenceItem {
    return {
        id: stableEvidenceId(record),
        kind: 'record',
        name: clearLienJudgmentTitle(record),
        url: pdfUrl?.trim() || '',
        source: 'clear',
        court: record.court,
        filingDate: record.filingDate,
        amount: record.amount,
        parties: record.parties,
        caseNumber: record.caseNumber,
        status: record.status,
    };
}

function isClearSourcedEvidence(item: unknown): boolean {
    if (!item || typeof item !== 'object') return false;
    const row = item as { source?: string; id?: string };
    return row.source === 'clear' || String(row.id ?? '').startsWith('clear-');
}

/**
 * Keep manual evidence; replace prior CLEAR-sourced rows with the latest parse.
 */
export function mergeClearNyCourtEvidence(
    existing: unknown,
    clearRecords: ClearLienJudgmentRecord[],
    pdfUrlByGroupId: Map<string, string>,
): ClearNyCourtEvidenceItem[] {
    const prior = Array.isArray(existing) ? existing : [];
    const manual = prior.filter((item) => !isClearSourcedEvidence(item)) as ClearNyCourtEvidenceItem[];
    const fromClear = clearRecords.map((record) =>
        toNyCourtEvidenceItem(record, pdfUrlByGroupId.get(record.groupId)),
    );
    return [...manual, ...fromClear];
}

/** Re-export helper used by callers that only need tag probes. */
export function clearReportHasLienJudgmentMarkers(xml: string): boolean {
    return /LienJudgment|Judg(?:e)?ment|TaxLien|TaxWarrant|<Lien[\s>]/i.test(xml);
}
