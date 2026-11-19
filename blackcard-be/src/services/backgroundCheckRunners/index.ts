/**
 * Adapter seam for automated background-check runs.
 *
 * THIS PASS IS MANUAL ENTRY ONLY — every runner throws. When wiring real
 * providers later (OpenCorporates, DataMerch, CLEAR, …), implement the matching
 * runner and have the controller call `runCheck(checkType, item)` instead of
 * (or alongside) the manual update path. The return shape maps straight onto
 * a BackgroundCheckItem update: { result, notes, raw }.
 */
import type { CheckType } from '../backgroundCheckService';
import { createClearS2sRunner } from './clearS2sRunner';

export {
    CLEAR_S2S_BASE_URLS,
    getClearS2sConfig,
    getClearS2sClientConfig,
    resolveClearS2sConfig,
    resolveClearS2sClientConfig,
} from './clearS2sConfig';
export type {
    ClearS2sClientConfig,
    ClearS2sConfig,
    ClearS2sEnvironment,
} from './clearS2sConfig';
export type {
    ClearBusinessHit,
    ClearBusinessSearchResult,
    ClearBusinessSearchSubject,
    ClearPersonHit,
    ClearPersonSearchResult,
    ClearPersonSearchSubject,
} from './clearS2sClient';
export {
    buildBusinessSearchXml,
    buildPersonSearchXml,
    parseClearBusinessHits,
    parseClearPersonHits,
    searchClearBusiness,
    searchClearPerson,
} from './clearS2sClient';
export {
    buildBusinessReportXml,
    buildPersonReportXml,
    clearReportFileName,
    createAndFetchBusinessReportPdf,
    createAndFetchPersonReportPdf,
    fetchClearReportPdfsForSearch,
    selectClearReportGroupIds,
} from './clearS2sReports';
export type {
    ClearReportFailure,
    ClearReportPdfResult,
    ClearReportsBatchResult,
} from './clearS2sReports';
export {
    mergeClearNyCourtEvidence,
    inventoryClearLienJudgmentTags,
    parseClearLienJudgmentRecords,
    toNyCourtEvidenceItem,
} from './clearS2sLienJudgment';
export type {
    ClearLienJudgmentKind,
    ClearLienJudgmentRecord,
    ClearNyCourtEvidenceItem,
} from './clearS2sLienJudgment';
export {
    mergeClearNamesIntoExhibitPrefill,
    parseClearCorporateAssociations,
    uniqueClearCorporateNames,
} from './clearS2sCorporateAssociations';
export type { ClearCorporateAssociationRecord } from './clearS2sCorporateAssociations';

export type RunnerResult = {
    result: 'PASS' | 'FAIL' | 'FLAG' | 'NA';
    notes?: string;
    raw?: unknown;
};

export interface BackgroundCheckRunner {
    runCheck(item: { checkType: CheckType; [k: string]: unknown }): Promise<RunnerResult>;
}

const manualOnly = (provider: string): BackgroundCheckRunner => ({
    async runCheck() {
        throw new Error(`${provider} automated check not wired yet — enter results manually.`);
    },
});

/** Registry keyed by checkType. Replace entries with real adapters later. */
export const runners: Record<CheckType, BackgroundCheckRunner> = {
    // Keep TLO as the persisted key so existing background-check records remain compatible.
    TLO: createClearS2sRunner(),
    OPENCORPORATES: manualOnly('OpenCorporates'),
    SOS: manualOnly('Secretary of State'),
    NY_COURT: manualOnly('NY Court'),
    DATAMERCH: manualOnly('DataMerch'),
    GOOGLE: manualOnly('Google'),
};

export async function runCheck(checkType: CheckType, item: any): Promise<RunnerResult> {
    const runner = runners[checkType];
    if (!runner) throw new Error(`No runner for check type ${checkType}`);
    return runner.runCheck({ checkType, ...item });
}
