/**
 * Standalone CLEAR person lookup.
 *
 * The application background check runs CLEAR against a merchant on file. This
 * runs the same searches for an arbitrary person typed into the Person Lookup
 * screen — no application, no client record, nothing persisted.
 *
 * It deliberately mirrors the orchestration in backgroundCheckService (search →
 * reports → parse lien/judgment and corporate associations) so the two produce
 * the same shaped metadata and the frontend can render them identically. The
 * one difference is storage: the application flow uploads report PDFs to
 * Cloudinary and attaches them to the check, whereas this returns them inline
 * as base64 so a lookup leaves nothing behind.
 */
import {
    fetchClearReportPdfsForSearch,
    inventoryClearLienJudgmentTags,
    parseClearCorporateAssociations,
    parseClearLienJudgmentRecords,
    searchClearPerson,
    selectClearReportGroupIds,
    type ClearCorporateAssociationRecord,
    type ClearLienJudgmentRecord,
    type ClearPersonSearchResult,
} from './backgroundCheckRunners';

export interface ClearPersonLookupInput {
    firstName: string;
    lastName: string;
    /** Optional extra filter. CLEAR ANDs criteria, so a wrong SSN yields zero hits. */
    ssn?: string | null;
    /** Skip report generation when only the match list is wanted. */
    includeReports?: boolean;
}

export interface ClearLookupReportFile {
    kind: 'person' | 'business';
    groupId: string;
    reportId: string;
    fileName: string;
    /** Base64 PDF — returned inline because nothing about this lookup is stored. */
    pdfBase64: string;
}

export interface ClearPersonLookupResult {
    provider: string;
    searchedAt: string;
    groupCount: number;
    personSearches: ClearPersonSearchResult[];
    clearLienJudgments: ClearLienJudgmentRecord[];
    clearCorporateAssociations: ClearCorporateAssociationRecord[];
    reports: {
        attached: ClearLookupReportFile[];
        errors: Array<{ kind: string; groupId: string; error: string }>;
    };
}

/** Reference string CLEAR echoes back; capped at 35 chars by their API. */
function buildReference(input: ClearPersonLookupInput): string {
    const name = `${input.firstName} ${input.lastName}`.trim().replace(/\s+/g, ' ');
    return `Ocean Lookup ${name}`.slice(0, 35);
}

export async function runClearPersonLookup(
    input: ClearPersonLookupInput,
): Promise<ClearPersonLookupResult> {
    const firstName = String(input.firstName ?? '').trim();
    const lastName = String(input.lastName ?? '').trim();

    if (!firstName || !lastName) {
        throw Object.assign(new Error('First name and last name are required.'), {
            statusCode: 400,
        });
    }

    const ssn = String(input.ssn ?? '').replace(/\D/g, '');

    const search = await searchClearPerson(
        { firstName, lastName, ssn: ssn || null },
        buildReference({ firstName, lastName }),
    );

    const personSearches: ClearPersonSearchResult[] = [
        { ...search, ownerName: `${firstName} ${lastName}`.trim() },
    ];

    const result: ClearPersonLookupResult = {
        provider: 'Thomson Reuters CLEAR',
        searchedAt: new Date().toISOString(),
        groupCount: search.groupCount,
        personSearches,
        clearLienJudgments: [],
        clearCorporateAssociations: [],
        reports: { attached: [], errors: [] },
    };

    if (input.includeReports === false) return result;

    // Reports are best-effort: a failure here must not discard the match list
    // the user already paid a CLEAR search for.
    try {
        const metadata = { personSearches } as never;
        const selected = selectClearReportGroupIds(metadata);
        if (selected.personGroupIds.length === 0) return result;

        const batch = await fetchClearReportPdfsForSearch(metadata, 'lookup');
        result.reports.errors.push(...batch.errors);

        for (const report of batch.attached) {
            result.reports.attached.push({
                kind: report.kind,
                groupId: report.groupId,
                reportId: report.reportId,
                fileName: report.fileName,
                pdfBase64: report.pdf.toString('base64'),
            });

            if (report.xmlError) {
                result.reports.errors.push({
                    kind: report.kind,
                    groupId: report.groupId,
                    error: `CLEAR report XML: ${report.xmlError}`.slice(0, 500),
                });
            }
            if (!report.xml) continue;

            try {
                const liens = parseClearLienJudgmentRecords(report.xml, {
                    groupId: report.groupId,
                    reportKind: report.kind,
                });
                result.clearLienJudgments.push(...liens);

                // Same diagnostic the application flow records: XML that talks
                // about liens but parses to nothing means the parser missed a
                // tag shape, which is worth surfacing rather than showing "none".
                if (liens.length === 0 && /Lien|Judg|Warrant/i.test(report.xml)) {
                    const tags = inventoryClearLienJudgmentTags(report.xml).slice(0, 40);
                    result.reports.errors.push({
                        kind: report.kind,
                        groupId: report.groupId,
                        error: `CLEAR Lien/Judgment parse: 0 rows from XML that mentions liens/judgments; tags=${tags.join(',') || 'none'}`.slice(0, 500),
                    });
                }
            } catch (error: unknown) {
                result.reports.errors.push({
                    kind: report.kind,
                    groupId: report.groupId,
                    error: `CLEAR Lien/Judgment parse: ${String((error as Error)?.message || error)}`.slice(0, 500),
                });
            }

            try {
                result.clearCorporateAssociations.push(
                    ...parseClearCorporateAssociations(report.xml, {
                        groupId: report.groupId,
                        reportKind: report.kind,
                    }),
                );
            } catch (error: unknown) {
                result.reports.errors.push({
                    kind: report.kind,
                    groupId: report.groupId,
                    error: `CLEAR Corporate parse: ${String((error as Error)?.message || error)}`.slice(0, 500),
                });
            }
        }
    } catch (error: unknown) {
        result.reports.errors.push({
            kind: 'person',
            groupId: '',
            error: `CLEAR reports: ${String((error as Error)?.message || error)}`.slice(0, 500),
        });
    }

    return result;
}
