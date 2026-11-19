import { extractOne } from './clearS2sClient';

type ClearReportKind = 'person' | 'business';

export type ClearCorporateAssociationRecord = {
    source: 'clear';
    name: string;
    section?: string;
    groupId: string;
    reportKind: ClearReportKind;
};

/**
 * Only CLEAR "Corporate Filings" / CorporateSection records.
 * Do not pull Work Affiliations, Business Associations, Fictitious/DBA names,
 * or Executive Affiliations — those appear elsewhere in the PDF and are not
 * corporation filings.
 */
const CORPORATE_FILING_SECTION_TAGS = [
    'CorporateSection',
    'CorporateFilingsSection',
    'ForeignCorporateFilingSection',
] as const;

/** Child filing wrappers inside CorporateSection. */
const CORPORATE_FILING_RECORD_TAGS = [
    'Corporation',
    'CorporationRecord',
    'CorporateFiling',
    'ForeignCorporateFiling',
    'Corporate',
] as const;

/**
 * Company-name fields on a filing row. Exclude generic `Name` (often an officer),
 * EmployerName, and DBA/FictitiousBusinessName — those are not filing entity names.
 */
const CORPORATE_FILING_NAME_TAGS = [
    'BusinessName',
    'CompanyName',
    'CorporationName',
    'CorporateName',
    'EntityName',
    'OrganizationName',
    'LegalName',
    'RegisteredName',
] as const;

const EXHIBIT_A_VALUE_COUNT = 10;

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

function normalizeCompanyName(value: string): string {
    return cleanText(value).replace(/\s+/g, ' ').trim();
}

function nameKey(value: string): string {
    return normalizeCompanyName(value).toLowerCase();
}

function extractNamedBlocks(xml: string, tags: readonly string[]): Array<{ tag: string; body: string }> {
    const found: Array<{ tag: string; body: string }> = [];
    for (const tag of tags) {
        const pattern = new RegExp(
            `<(?:[\\w-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${tag}>`,
            'gi',
        );
        for (const match of xml.matchAll(pattern)) {
            found.push({ tag, body: match[1] ?? '' });
        }
    }
    return found;
}

function firstField(block: string, tags: readonly string[]): string {
    for (const tag of tags) {
        const value = cleanText(extractOne(block, tag));
        if (value) return value;
    }
    return '';
}

function collectFilingNamesFromBlock(body: string): string[] {
    const names: string[] = [];
    for (const nameTag of CORPORATE_FILING_NAME_TAGS) {
        const pattern = new RegExp(
            `<(?:[\\w-]+:)?${nameTag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${nameTag}>`,
            'gi',
        );
        for (const match of body.matchAll(pattern)) {
            const name = normalizeCompanyName(match[1] ?? '');
            if (name && name.length >= 2) names.push(name);
        }
    }
    if (names.length === 0) {
        const fallback = firstField(body, CORPORATE_FILING_NAME_TAGS);
        if (fallback) names.push(fallback);
    }
    return names;
}

/**
 * Parse CLEAR person/business report XML for Corporate Filings names only.
 * Matches the PDF "Corporate Filings" section — not work affiliations or DBAs.
 */
export function parseClearCorporateAssociations(
    xml: string,
    meta: { groupId: string; reportKind: ClearReportKind },
): ClearCorporateAssociationRecord[] {
    if (!xml?.trim()) return [];

    const sectionBlocks = extractNamedBlocks(xml, CORPORATE_FILING_SECTION_TAGS);
    // Prefer named filing records inside each section; fall back to section body.
    const filingBlocks: Array<{ tag: string; body: string }> = [];
    for (const section of sectionBlocks) {
        const records = extractNamedBlocks(section.body, CORPORATE_FILING_RECORD_TAGS);
        if (records.length > 0) {
            filingBlocks.push(...records);
        } else if (section.body.trim()) {
            filingBlocks.push(section);
        }
    }

    // Some CLEAR payloads emit Corporation records outside a section wrapper.
    if (filingBlocks.length === 0) {
        filingBlocks.push(...extractNamedBlocks(xml, CORPORATE_FILING_RECORD_TAGS));
    }

    const records: ClearCorporateAssociationRecord[] = [];
    const seen = new Set<string>();

    for (const { tag, body } of filingBlocks) {
        if (!body.trim()) continue;
        for (const rawName of collectFilingNamesFromBlock(body)) {
            const name = normalizeCompanyName(rawName);
            const key = nameKey(name);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            records.push({
                source: 'clear',
                name,
                section: tag,
                groupId: meta.groupId,
                reportKind: meta.reportKind,
            });
        }
    }

    return records;
}

export function uniqueClearCorporateNames(
    records: ClearCorporateAssociationRecord[],
    excludeNames: string[] = [],
): string[] {
    const excluded = new Set(excludeNames.map(nameKey).filter(Boolean));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const record of records) {
        const name = normalizeCompanyName(record.name);
        const key = nameKey(name);
        if (!key || excluded.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

/**
 * Merge CLEAR corporation names into empty Exhibit A slots (`exhibitAValue1`…`10`).
 * Also mirrors into `exhibitCompanyName1`…`10` for books that use those override keys.
 * Existing non-empty slots are preserved; duplicates are skipped.
 */
export function mergeClearNamesIntoExhibitPrefill(
    existingOverrides: Record<string, unknown> | null | undefined,
    clearNames: string[],
): { overrides: Record<string, unknown>; added: number; names: string[] } {
    const base =
        existingOverrides && typeof existingOverrides === 'object' && !Array.isArray(existingOverrides)
            ? { ...existingOverrides }
            : {};

    const current: string[] = [];
    for (let i = 1; i <= EXHIBIT_A_VALUE_COUNT; i++) {
        const fromA = normalizeCompanyName(String(base[`exhibitAValue${i}`] ?? ''));
        const fromCompany = normalizeCompanyName(String(base[`exhibitCompanyName${i}`] ?? ''));
        current.push(fromA || fromCompany);
    }

    const occupied = new Set(current.map(nameKey).filter(Boolean));
    const toAdd = clearNames
        .map(normalizeCompanyName)
        .filter((name) => {
            const key = nameKey(name);
            if (!key || occupied.has(key)) return false;
            occupied.add(key);
            return true;
        });

    let added = 0;
    let addIndex = 0;
    for (let i = 0; i < EXHIBIT_A_VALUE_COUNT && addIndex < toAdd.length; i++) {
        if (current[i]) continue;
        current[i] = toAdd[addIndex++];
        added += 1;
    }

    for (let i = 0; i < EXHIBIT_A_VALUE_COUNT; i++) {
        const value = current[i] || '';
        base[`exhibitAValue${i + 1}`] = value;
        base[`exhibitCompanyName${i + 1}`] = value;
    }

    return {
        overrides: base,
        added,
        names: current.filter(Boolean),
    };
}
