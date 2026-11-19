import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import uploadService from '../services/uploadService';
import pdfExtractionService from '../services/pdfExtractionService';
import * as fs from 'fs';
import path from 'path';
import {
    mergeApplicationVisibilityWhere,
    getApplicationForUser,
    createClientAndApplicationFromPDFBuffer,
    InsufficientParsedPdfError,
    assertReadyToCreateNewClientFromPdf,
    applyPdfExtractToApplicationFromStoredFile,
    resolveExistingPdfCreateIfDuplicate,
    stampPdfCreateIdempotency,
    type AuthenticatedUser,
} from '../services/applicationService';
import { sha256PdfContent } from '../services/gmailAutoCreateProcessedStore';
import { allocateNextDealId, withAllocatedDealId } from '../services/nextDealIdService';
import { resolveFinalApprovalUnderwriterTarget } from '../services/finalApprovalTargetService';
import { mapClientToApi, resolveClientOwners } from '../utils/clientMapper';
import { getUnderwriterClaimMutationDenial } from '../services/underwriterClaimGuard';
import {
    buildUnderwriterPipelineWhere,
    countUnderwriterPipelineDeals,
    SCRUBBER_PIPELINE_FILTERS,
    normalizeUnderwriterPipelineParam,
} from '../services/underwriterPipelineFilter';
import {
    declineActionForRole,
    declineAllMatchWhere,
    declineRequestMatchWhere,
    declinedByScrubberMatchWhere,
    declinedByAdminMatchWhere,
    declinedByUnderwriterMatchWhere,
} from '../services/declineSplitFilter';
import { getApplicationStageAccessForUser } from '../services/applicationStageAccess';
import { routeApplicationIfInUnderwriterQueue } from '../services/underwriterRoutingService';
import {
    aggregateApplicationStats,
    aggregateApplicationMonthlyTrend,
    type UnderwriterClaimScope,
} from '../services/applicationStatsService';
import { classifyFundedApprovedRejected } from '../services/applicationStatsPredicates';
import {
    getApplicationStatsCache,
    setApplicationStatsCache,
    invalidateAllApplicationStatsCache,
} from '../services/applicationStatsCache';
import { DashboardCacheKind, withDashboardCache } from '../services/dashboardCache';
import {
    aggregateDashboardPipelineFunnel,
    aggregateApplicationTrendChart,
    listDashboardRecentApplications,
} from '../services/dashboardAggregatesService';
import {
    aggregateOperationsDashboardSummary,
    listOperationsDashboardRecentCases,
} from '../services/operationsDashboardSummaryService';
import {
    buildOperationsStatusFilterWhere,
    applySoftDeleteListScope,
    excludeSoftDeletedWhere,
    normalizeOperationsStatusKey,
    resolveOperationsListFilterMode,
    dashboardStateQueueAliases,
    isContractedOpsKey,
} from '../services/operationsStatusFilter';
import {
    buildApplicationStatsBucketWhere,
    type ApplicationStatsBucketWhereOptions,
} from '../services/applicationStatsBucketWhere';
import { getBalancesForApplicationIds } from '../services/collectionPaymentFinancials';
import { invalidateDealPortfolioCache } from '../services/dealPortfolioService';
import {
    applyContractCompletedSyncToApplicationRecord,
} from '../services/contractApplicationWorkflowSync';
import {
    APPLICATION_QUEUE_APPROVAL_SENT,
    APPLICATION_STATE_APPROVAL_SENT,
} from '../services/applicationApprovalEmailValues';
import {
    reinitiateContractForApplication,
    reconcileStaleContractReinitiationFlags,
} from '../services/contractReinitiationService';
import {
    buildApplicationApprovedEmailInjectValues,
    injectApplicationApprovalEmailValues,
    sendApplicationApprovalEmail,
    sendApplicationRejectionEmail,
    resolveMerchantContactForOfferEmail,
    sendApplicationOfferUpdatedEmail,
    sendUnderwriterNewApplicationEmail,
} from '../services/emailService';
import { resolveIsoApprovalEmailHtml } from '../services/applicationApprovalEmailRenderService';
import { recordCommunicationAudit } from '../services/systemActivityLogService';
import { storeSgMessageIdOnOutbound } from '../services/outboundCommunicationService';
import {
    findHistoricalSamePdfFileApplications,
    findSamePdfFileApplications,
    gmailAutoCreateMessageNote,
    parseGmailMessageIdFromApplicationNote,
    pickPrimaryPdfFile,
    readPdfFileDedupeDays,
} from '../services/pdfFileDedupeService';
import {
    findApplicationsMatchingEinOrSsn,
    syncDuplicateFlagForApplication,
    syncDuplicateFlagsForEinOrSsn,
    usableDedupeEin,
} from '../services/applicationIdentityDedupeService';
import { applyDuplicateOfferDecision } from '../services/applyDuplicateOfferDecisionService';
import {
    buildApplicationRejectionEmailSubject,
    resolveApplicationSubmissionThreadContext,
} from '../services/applicationRejectionThreadService';
import {
    sendScrubberRecommendationUwThreadEmail,
    previewScrubberRecommendationMailRecipients,
    getSubmissionsInboxEmails,
} from '../services/scrubberRecommendationUwMailService';
import { sanitizeScrubbingPreviewHtml, appendBelowEmailBody } from '../utils/scrubbingPreviewHtml';
import { isDefaultCcRemoved } from '../config/mandatoryCc';
import { getApplicationSubmissionMailParticipants } from '../services/applicationGmailThreadMailService';
import { sendIsoApprovalEmailAfterUnderwriterApprove } from '../services/underwriterApproveIsoThreadMailService';
import { buildApprovalOfferTermsHtml, fillApprovalOfferTerms } from '../services/approvalOfferTerms';
import {
    buildPublicApprovalPortalUrl,
    resolveCrmFrontendBaseUrl,
} from '../utils/crmFrontendUrl';
import { applicationCreateUncheckedData } from '../utils/prisma/applicationCreateUncheckedData';
import {
    CANONICAL_WORKFLOW_QUEUES,
    normalizeStoredWorkflowQueue,
    normalizeStoredWorkflowState,
} from '../utils/workflowQueueStorage';
import {
    resolveApplicationAttributedUserId,
    resolveTenantUserId,
} from '../middleware/authMiddleware';
import { createPublicPortalToken } from '../services/publicPortalTokenService';
import { syncTermsOfferFromOfferDecision } from '../services/syncTermsOfferFromOfferDecision';
import { fetchPaginatedApplicationsForList } from '../services/applicationListSort';
import { buildApplicationListSearchWhere } from '../services/applicationListSearch';
import {
    createApplicationActivityLog,
    getApplicationActivityLogsForUser,
    type ApplicationActivityActionType,
} from '../services/applicationActivityLogService';
import { recordApplicationUpdateActivityLog } from '../services/applicationUpdateActivityLog';
import {
    listPaymentMailLogs,
    enrichPaymentMailLogsForApi,
    createPaymentMailLog as persistPaymentMailLog,
    fromPrismaMailLogStatus,
} from '../services/paymentMailLogService';
import { extractPdfPlainTextForParsing } from '../services/pdfIngestionService';
import { normalizeOcrTextForParsing } from '../services/ocrFieldExtraction';
import { parseBusinessData } from "../services/parseBusinessData";
import { formatOcrBusinessBlock } from "../services/ocrLineParser";
import { toCanonicalApplicationJson } from "../services/canonicalApplicationJson";
import { attachBufferAsApplicationFile } from '../services/applicationPdfAttachService';
import { convertToCSV, logExtractedBusinessDataCsv } from "../services/csvConverter";
import {
    processApplicationBulkExcelBuffer,
    parseApplicationBulkSheet,
    ingestApplicationBulkRows,
    type BulkImportRowError,
    type BulkImportSummary,
} from '../services/applicationBulkExcelIngestService';
import { approveApplication } from '../services/business/applicationApprovalService';
import {
    scheduleApplicationStageNotification,
    notifyApplicationRejected,
    notifyAdminAssignedApplicationToUnderwriter,
    notifyUnderwriterReturnedApplicationToScrubber,
} from '../services/applicationStageNotificationService';
import { sendReturnToScrubberEmail } from '../services/returnToScrubberMailService';
import { sendMissingDocumentsSuperAdminEmail } from '../services/missingDocumentsMailService';
import {
    buildMissingDocumentItems,
    isMissingDocumentsQueue,
    resolveMissingDocumentsForApplication,
} from '../services/missingDocumentsResolveService';
import { blockIfNoOffer, isDecisionQueueMove } from '../services/applicationOfferGuard';

type ApplicationState =
    | 'DRAFT'
    | 'PENDING'
    | 'SUBMITTED'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'CONTRACT_PENDING'
    | 'CONTRACTS_OUT'
    | 'SIGNED_CONTRACTS'
    | 'FUNDING_CALL'
    | 'DISBURSMENT'
    | 'FUNDED'
    | 'FINAL';

const ApplicationState = {
    DRAFT: 'DRAFT',
    /** Agent / intake queue: waiting on agent or next action (distinct from active underwriting work). */
    PENDING: 'PENDING',
    SUBMITTED: 'SUBMITTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
    CONTRACT_PENDING: 'CONTRACT_PENDING',
    CONTRACTS_OUT: 'CONTRACTS_OUT',
    SIGNED_CONTRACTS: 'SIGNED_CONTRACTS',
    FUNDING_CALL: 'FUNDING_CALL',
    DISBURSMENT: 'DISBURSMENT',
    FUNDED: 'FUNDED',
    FINAL: 'FINAL',
} as const;

type BulkUploadJobStatus = 'processing' | 'completed' | 'failed';
type BulkUploadJob = {
    id: string;
    createdAtMs: number;
    /**
     * Refreshed every time the job state changes (progress tick, completion, failure).
     * Used by `cleanupExpiredBulkUploadJobs` to skip jobs that are still making progress and to
     * give completed jobs a long enough window for the UI to fetch the final result.
     */
    updatedAtMs: number;
    status: BulkUploadJobStatus;
    totalRows: number;
    processedRows: number;
    successCount: number;
    /** Rows that updated an existing application by matching deal id. */
    updatedCount: number;
    failedCount: number;
    currentExcelRowNumber?: number;
    message?: string;
    errors: BulkImportRowError[];
    warnings: BulkImportRowError[];
    createdSyndicators: string[];
    result?: BulkImportSummary;
};

const bulkUploadJobs = new Map<string, BulkUploadJob>();

/**
 * How long to retain a completed/failed job in memory after its last update so the polling UI can
 * read the final result. Generously sized (4h) to survive long sheets and brief client absences.
 */
const BULK_UPLOAD_TERMINAL_JOB_TTL_MS = 1000 * 60 * 60 * 4;
/**
 * Idle threshold for a `processing` job. If nothing has been touched in this window we treat the
 * job as orphaned (e.g. the server restarted between polls) and reap it. Otherwise running jobs
 * are kept alive indefinitely, which is required for sheets with thousands of rows.
 */
const BULK_UPLOAD_PROCESSING_IDLE_TTL_MS = 1000 * 60 * 60 * 6;

function cleanupExpiredBulkUploadJobs(nowMs = Date.now()) {
    for (const [jobId, job] of bulkUploadJobs.entries()) {
        const lastTouched = job.updatedAtMs || job.createdAtMs;
        const ttl =
            job.status === 'processing'
                ? BULK_UPLOAD_PROCESSING_IDLE_TTL_MS
                : BULK_UPLOAD_TERMINAL_JOB_TTL_MS;
        if (nowMs - lastTouched > ttl) {
            bulkUploadJobs.delete(jobId);
        }
    }
}

/** Stamp the job's last-touched timestamp so the cleanup sweep treats it as alive. */
function touchBulkUploadJob(job: BulkUploadJob): void {
    job.updatedAtMs = Date.now();
}

function createBulkUploadJobId(): string {
    return `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Human-friendly summary line shown in toasts / progress for bulk upload outcomes. */
function buildBulkUploadCompletionMessage(insertedCount: number, updatedCount: number): string {
    if (insertedCount === 0 && updatedCount === 0) {
        return 'No applications were imported.';
    }
    const parts: string[] = [];
    if (insertedCount > 0) {
        parts.push(`Inserted ${insertedCount} application(s)`);
    }
    if (updatedCount > 0) {
        parts.push(`updated ${updatedCount} application(s)`);
    }
    return `${parts.join(' and ')}.`;
}

export const normalizePDFText = (text: string) => {
    return text
        // add space between lowercase and uppercase letters
        .replace(/([a-z])([A-Z])/g, "$1 $2")

        // add space between letters and numbers
        .replace(/([A-Za-z])(\d)/g, "$1 $2")

        // add space between numbers and letters
        .replace(/(\d)([A-Za-z])/g, "$1 $2")

        // normalize whitespace
        .replace(/\s+/g, " ")
        .trim();
};

// Utility to process a PDF file (Claude hybrid extraction G?? parse, CSV export)
export const processPDF = async (filePath: string) => {
    const buffer = fs.readFileSync(filePath);
    const name = path.basename(filePath) || 'application.pdf';
    // Extraction + parsing run outside any DB transaction (see createClientAndApplicationFromPDFBuffer / autoCreateFromPDF).
    const textRaw = await extractPdfPlainTextForParsing(buffer, name, filePath);
    const previewLen = Math.max(200, Number(process.env.PDF_EXTRACT_DEBUG_PREVIEW_CHARS || 800));
    console.log(
        '[processPDF] Synthetic extract text preview (first chars):\n',
        (textRaw || '').length > previewLen ? `${(textRaw || '').slice(0, previewLen)}G?` : textRaw || '',
    );
    const text = normalizeOcrTextForParsing(textRaw);

    const parsedData = parseBusinessData(text);

    console.log(
        '[processPDF] Business (5-field) preview:',
        JSON.stringify(formatOcrBusinessBlock(parsedData.business), null, 2),
    );
    console.log(
        '[processPDF] Canonical application JSON:',
        JSON.stringify(toCanonicalApplicationJson(parsedData as { business: Record<string, unknown>; owner: Record<string, unknown> }), null, 2),
    );
    console.log('[processPDF] Parsed structured data:', JSON.stringify(parsedData, null, 2));

    logExtractedBusinessDataCsv(parsedData, { tag: "[processPDF]", fileName: name });
    convertToCSV(parsedData);

    return parsedData;
};

const applicationStateApiToPrisma: Record<string, ApplicationState> = {
    Draft: 'DRAFT' as ApplicationState,
    New: 'DRAFT' as ApplicationState,
    Submitted: 'SUBMITTED' as ApplicationState,
    'In Progress': 'IN_PROGRESS' as ApplicationState,
    In_Progress: 'IN_PROGRESS' as ApplicationState,
    IN_PROGRESS: 'IN_PROGRESS' as ApplicationState,
    Pending: 'PENDING' as ApplicationState,
    Completed: 'COMPLETED' as ApplicationState,
    Approved: 'COMPLETED' as ApplicationState,
    Cancelled: 'CANCELLED' as ApplicationState,
    Contract_Pending: 'CONTRACT_PENDING' as ApplicationState,
    Contracts_Out: 'CONTRACTS_OUT' as ApplicationState,
    /** Legacy spelling G?? still accepted on input. */
    'Contracts Out': 'CONTRACTS_OUT' as ApplicationState,
    /** Alias for UI label "Contracted" (same DB value as Contracts_Out). */
    Contracted: 'CONTRACTS_OUT' as ApplicationState,
    Signed_Contracts: 'SIGNED_CONTRACTS' as ApplicationState,
    'Funding Call': 'FUNDING_CALL' as ApplicationState,
    Disbursment: 'DISBURSMENT' as ApplicationState,
    Disbursement: 'DISBURSMENT' as ApplicationState,
    DISBURSEMENT: 'DISBURSMENT' as ApplicationState,
    Funded: 'FUNDED' as ApplicationState,
    FUNDED: 'FUNDED' as ApplicationState,
    FINAL: 'FINAL' as ApplicationState,
    Final: 'FINAL' as ApplicationState,
};

/** API input G?? verbatim `Application.currentState` string (not a Prisma workflow enum). */
const verbatimApplicationStateByInput: Record<string, string> = {
    Approved: 'Approved',
    'Underwriter Approved': 'Underwriter Approved',
    Underwriter_Approved: 'Underwriter Approved',
    'Final Approval': 'Final Approval',
    Final_Approval: 'Final Approval',
    'Approval Sent': 'Approval Sent',
    Approval_Sent: 'Approval Sent',
    'ISO Approved': 'ISO Approved',
    ISO_Approved: 'ISO Approved',
    Approved_By_ISO: 'ISO Approved',
    'Contract Out': 'Contract Out',
    'On Hold': 'On Hold',
    On_Hold: 'On Hold',
    Contract_Generated: 'CONTRACT_GENERATED',
    CONTRACT_GENERATED: 'CONTRACT_GENERATED',
    'Contract Generated': 'CONTRACT_GENERATED',
};

const applicationStatePrismaToApi: Record<ApplicationState, string> = {
    [ApplicationState.DRAFT]: 'Draft',
    [ApplicationState.PENDING]: 'Pending',
    [ApplicationState.SUBMITTED]: 'Submitted',
    [ApplicationState.IN_PROGRESS]: 'In Progress',
    [ApplicationState.COMPLETED]: 'Completed',
    [ApplicationState.CANCELLED]: 'Cancelled',
    [ApplicationState.CONTRACT_PENDING]: 'Contract_Pending',
    [ApplicationState.CONTRACTS_OUT]: 'Contract Sent',
    [ApplicationState.SIGNED_CONTRACTS]: 'Signed_Contracts',
    [ApplicationState.FUNDING_CALL]: 'Funding Call',
    [ApplicationState.DISBURSMENT]: 'Disbursment',
    [ApplicationState.FUNDED]: 'Funded',
    [ApplicationState.FINAL]: 'FINAL',
};

const toPrismaApplicationState = (value: unknown): ApplicationState | undefined => {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
    const normalizedKey = trimmed.replace(/[\s-]+/g, '_');
    const canonicalized =
        normalizedKey
            .split('_')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
            .join('_');

    if (upper === 'FUNDING_CALL' || upper === 'FUNDINGCALL') return ApplicationState.FUNDING_CALL;
    if (upper === 'DISBURSMENT' || upper === 'DISBURSEMENT') return ApplicationState.DISBURSMENT;
    if (upper === 'PENDING') return ApplicationState.PENDING;
    if (upper === 'IN_PROGRESS') return ApplicationState.IN_PROGRESS;

    return (
        applicationStateApiToPrisma[trimmed] ||
        applicationStateApiToPrisma[normalizedKey] ||
        applicationStateApiToPrisma[canonicalized]
    );
};

const normalizeContractSentWorkflowLabel = (value: string): string | null => {
    const compact = value.trim().replace(/[\s_-]+/g, '').toLowerCase();
    if (
        compact === 'contractout' ||
        compact === 'contractsout' ||
        compact === 'contractsent' ||
        value.trim() === 'CONTRACT_SENT' ||
        value.trim() === 'Contract_Sent'
    ) {
        return 'Contract Sent';
    }
    return null;
};

const toApiApplicationState = (value: ApplicationState | string | null | undefined): string | undefined => {
    if (!value) return undefined;
    const asString = String(value);
    const contractSentLabel = normalizeContractSentWorkflowLabel(asString);
    if (contractSentLabel) return contractSentLabel;
    if (value in applicationStatePrismaToApi) {
        return applicationStatePrismaToApi[value as ApplicationState];
    }
    return asString;
};

const normalizeWorkflowQueueForApi = (queue: string | null | undefined): string | undefined => {
    if (!queue) return undefined;
    const trimmed = String(queue).trim();
    const contractSentLabel = normalizeContractSentWorkflowLabel(trimmed);
    return contractSentLabel ?? trimmed;
};

const WORKFLOW_QUEUES = CANONICAL_WORKFLOW_QUEUES;

/** Delimiter for stored underwriter correction reasons (matches scrubber decline reasons). */
const RETURN_REASON_DELIMITER = '|||';

/** Stored when a Underwriter approves G?? both queue and state use this label. */
const FINAL_UNDERWRITER_APPROVED_STATE = 'Underwriter Approved' as const;
const FINAL_UNDERWRITER_APPROVED_QUEUE = 'Underwriter Approved' as const;
const FINAL_APPROVAL_QUEUE = 'Final Approval' as const;
const FINAL_APPROVAL_STATE = 'Final Approval' as const;
/** Scrubber flagged missing documents — parked with Super Admin, out of the scrubbing pool. */
const MISSING_DOCUMENTS_QUEUE = 'Missing Documents' as const;
const MISSING_DOCUMENTS_STATE = 'Missing Documents' as const;
/** Application.note marker line holding the missing-documents list (`|||` delimited). */
const MISSING_DOCUMENTS_NOTE_PREFIX = 'MISSING_DOCUMENTS:';

/**
 * Canonical labels persisted on `Application.underwriterAction` so the deal carries
 * a record of the last action the Underwriter took (surfaced in lists / dashboards).
 */
const UNDERWRITER_ACTION_APPROVED = 'Approved By UW' as const;
const UNDERWRITER_ACTION_DECLINED = 'Decline by UW' as const;
const UNDERWRITER_ACTION_FINAL_APPROVED = 'Final Approved by UW' as const;

/** Stored when Super Admin / FUW sends the approval email to the linked ISO. */
const APPROVAL_SENT_STATE = APPLICATION_STATE_APPROVAL_SENT;
const APPROVAL_SENT_QUEUE = APPLICATION_QUEUE_APPROVAL_SENT;

const isUnderwriterApprovedToken = (value: unknown): boolean =>
    normalizeQueueToken(value) === 'UNDERWRITER_APPROVED';

const PENDING_QUEUES = [
    'New',
    WORKFLOW_QUEUES.AGENT,
    'On Hold',
    'Contracted',
    'Contract Out',
    'Contracts Out',
    'Review',
    'Underwriting',
    WORKFLOW_QUEUES.SCRUBBING,
    'Final Review',
    WORKFLOW_QUEUES.UNDERWRITER,
];

type WorkflowTransition = {
    queue: string;
    state?:
        | ApplicationState
        | typeof FINAL_UNDERWRITER_APPROVED_STATE
        | typeof APPROVAL_SENT_STATE
        | typeof FINAL_APPROVAL_STATE
        | 'ISO Approved'
        | 'On Hold';
    action?: 'SEND_TO_UNDERWRITER' | 'SEND_TO_FINAL_UNDERWRITER' | 'SEND_FOR_FINAL_APPROVAL' | 'APPROVED';
};

const normalizeQueueToken = (value: unknown): string => {
    if (typeof value !== 'string') return '';
    return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
};

/** Clear exclusive scrubbing claim when a deal (re-)enters the Scrubbing queue. */
const patchClearUnderwriterClaimIfQueueChanged = (
    previousQueue: string | null | undefined,
    nextQueue: string | null | undefined,
): Pick<Prisma.ApplicationUpdateInput, 'claimedByUnderwriter' | 'claimedAt'> | undefined => {
    const prevIs = normalizeQueueToken(previousQueue ?? '') === 'SCRUBBING';
    const nextIs = normalizeQueueToken(nextQueue ?? '') === 'SCRUBBING';
    // Preserve who claimed/scrubbed the deal when it advances past Scrubbing (ops list "Scrubber" column).
    if (!nextIs || prevIs) return undefined;
    return {
        claimedByUnderwriter: { disconnect: true },
        claimedAt: null,
    };
};

/**
 * Record who scrubbed the deal when a Scrubbing user advances it out of the
 * Scrubbing queue (mirrors how the Underwriter is captured). Only sets the
 * scrubber when the actor holds the SCRUBBING role and no scrubber claim is
 * recorded yet G?? never overwrites an existing explicit claim.
 */
const patchRecordScrubberClaimOnAdvance = (
    authUser: AuthenticatedUser | null | undefined,
    application: { claimedByUnderwriterId?: string | null },
    previousQueue: string | null | undefined,
    nextQueue: string | null | undefined,
): Pick<Prisma.ApplicationUpdateInput, 'claimedByUnderwriter' | 'claimedAt'> | undefined => {
    if (!authUser?.id) return undefined;
    const roleUpper = String(authUser.role || '').toUpperCase().replace(/-/g, '_');
    if (roleUpper !== 'SCRUBBING') return undefined;
    // Only when the deal is leaving the Scrubbing queue for a different queue.
    const prevIs = normalizeQueueToken(previousQueue ?? '') === 'SCRUBBING';
    const nextIs = normalizeQueueToken(nextQueue ?? '') === 'SCRUBBING';
    if (!prevIs || nextIs) return undefined;
    // Preserve an existing scrubber claim (e.g. someone explicitly claimed it).
    if (application.claimedByUnderwriterId) return undefined;
    return {
        claimedByUnderwriter: { connect: { id: authUser.id } },
        claimedAt: new Date(),
    };
};

const APPLICATION_USER_LITE_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    role: true,
} as const;

const APPLICATION_DETAIL_INCLUDE = {
    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    client: {
        include: {
            owners: {
                orderBy: { sortOrder: 'asc' as const },
            },
        },
    },
    iso: true,
    files: true,
    claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
    approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
    assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
    /** Underwriter who sent the deal back for correction (scrubbing banner). */
    returnedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
    /** Latest active main-contract DocuSign Document (1:1 on application). */
    document: {
        select: {
            id: true,
            envelopeId: true,
            status: true,
            sentAt: true,
            completedAt: true,
            updatedAt: true,
        },
    },
} as const satisfies Prisma.ApplicationInclude;

const isUnderwriterApproverRole = (role?: string | null): boolean => {
    const normalizedRole = String(role || '')
        .toUpperCase()
        .replace(/-/g, '_');
    return normalizedRole === 'UNDERWRITER' || normalizedRole === 'SCRUBBING';
};

/** Resolve who should be credited as the approving underwriter (not Super Admin / Operations). */
const resolveUnderwriterApproverId = (
    authUser: AuthenticatedUser | null | undefined,
    application: {
        assignedUnderwriterId?: string | null;
        claimedByUnderwriterId?: string | null;
        approvedByUnderwriterId?: string | null;
    },
): string | undefined => {
    const actorId = authUser?.id;
    if (!actorId) return undefined;

    if (isUnderwriterApproverRole(authUser?.role)) {
        return actorId;
    }

    const assignedId = String(application.assignedUnderwriterId ?? '').trim();
    if (assignedId) return assignedId;

    const claimedId = String(application.claimedByUnderwriterId ?? '').trim();
    if (claimedId) return claimedId;

    const existingId = String(application.approvedByUnderwriterId ?? '').trim();
    if (existingId) return undefined;

    return undefined;
};

/** Record which underwriter approved the deal (queue/state G?? Underwriter Approved). */
const patchRecordUnderwriterApproval = (
    authUser: AuthenticatedUser | null | undefined,
    application: {
        assignedUnderwriterId?: string | null;
        claimedByUnderwriterId?: string | null;
        approvedByUnderwriterId?: string | null;
    },
): Pick<Prisma.ApplicationUpdateInput, 'approvedByUnderwriter' | 'approvedAt' | 'underwriterAction'> | undefined => {
    const approverId = resolveUnderwriterApproverId(authUser, application);
    // No identifiable approver (e.g. an admin approving): still replace a stale
    // decline label, or the deal keeps showing "Decline by admin" after approval.
    if (!approverId) return { underwriterAction: UNDERWRITER_ACTION_APPROVED };
    return {
        approvedByUnderwriter: { connect: { id: approverId } },
        approvedAt: new Date(),
        underwriterAction: UNDERWRITER_ACTION_APPROVED,
    };
};

const shouldRecordUnderwriterApproval = (
    queue: string | null | undefined,
    state?: string | null | undefined,
): boolean =>
    isUnderwriterApprovedToken(queue) ||
    isUnderwriterApprovedToken(state) ||
    (typeof state === 'string' && state.trim().toLowerCase() === 'approved');

const resolveWorkflowQueueTransition = (targetQueue: string, actorRole?: string | null): WorkflowTransition => {
    const normalizedQueue = normalizeQueueToken(targetQueue);
    const normalizedRole = normalizeQueueToken(actorRole || '');

    const isUnderwriterTarget = normalizedQueue === 'UNDERWRITING' || normalizedQueue === 'SCRUBBING';
    if (isUnderwriterTarget) {
        return {
            queue: WORKFLOW_QUEUES.SCRUBBING,
            state: ApplicationState.IN_PROGRESS,
            action: 'SEND_TO_UNDERWRITER',
        };
    }

    const isFinalUnderwriterTarget = normalizedQueue === 'FINAL_REVIEW' || normalizedQueue === 'UNDERWRITER';
    if (isFinalUnderwriterTarget) {
        return {
            queue: WORKFLOW_QUEUES.UNDERWRITER,
            state: ApplicationState.IN_PROGRESS,
            action: 'SEND_TO_FINAL_UNDERWRITER',
        };
    }

    if (normalizedQueue === 'FINAL_APPROVAL') {
        return {
            queue: FINAL_APPROVAL_QUEUE,
            state: FINAL_APPROVAL_STATE,
            action: 'SEND_FOR_FINAL_APPROVAL',
        };
    }

    const isFinalUnderwriterActor =
        normalizedRole === 'UNDERWRITER' ||
        normalizedRole === 'FINALUNDERWRITER' ||
        normalizedRole === 'SUPER_ADMIN' ||
        normalizedRole === 'ADMIN' ||
        normalizedRole === 'OPERATIONS';
    if (
        (normalizedQueue === 'APPROVED' || normalizedQueue === 'UNDERWRITER_APPROVED') &&
        isFinalUnderwriterActor
    ) {
        return {
            queue: FINAL_UNDERWRITER_APPROVED_QUEUE,
            state: FINAL_UNDERWRITER_APPROVED_STATE,
            action: 'APPROVED',
        };
    }

    if (normalizedQueue === 'AGENT') {
        return { queue: WORKFLOW_QUEUES.AGENT, state: ApplicationState.PENDING };
    }
    if (normalizedQueue === 'NEW') {
        return { queue: 'New', state: ApplicationState.PENDING };
    }

    /** Operations deal pipeline (matches GET /applications filters and `toWorkflowApiState`). */
    if (normalizedQueue === 'FINAL') {
        return { queue: 'Final', state: ApplicationState.FINAL };
    }
    if (normalizedQueue === 'FUNDING_CALL' || normalizedQueue === 'FUNDINGCALL') {
        return { queue: 'Funding Call', state: ApplicationState.FUNDING_CALL };
    }
    if (normalizedQueue === 'DISBURSMENT' || normalizedQueue === 'DISBURSEMENT') {
        return { queue: 'Disbursment', state: ApplicationState.DISBURSMENT };
    }
    if (normalizedQueue === 'FUNDED') {
        return { queue: 'Funded', state: ApplicationState.FUNDED };
    }

    if (normalizedQueue === 'APPROVAL_SENT') {
        return { queue: APPROVAL_SENT_QUEUE, state: APPROVAL_SENT_STATE };
    }
    if (normalizedQueue === 'ISO_APPROVED' || normalizedQueue === 'APPROVED_BY_ISO') {
        return { queue: 'ISO Approved', state: 'ISO Approved' };
    }

    if (normalizedQueue === 'UNDERWRITER_APPROVED') {
        return {
            queue: FINAL_UNDERWRITER_APPROVED_QUEUE,
            state: FINAL_UNDERWRITER_APPROVED_STATE,
            action: 'APPROVED',
        };
    }

    if (normalizedQueue === 'CONTRACT_PENDING' || normalizedQueue === 'CONTRACTPENDING') {
        return { queue: 'Contract Pending', state: ApplicationState.CONTRACT_PENDING };
    }

    if (normalizedQueue === 'ON_HOLD' || normalizedQueue === 'ONHOLD') {
        return { queue: 'On Hold', state: 'On Hold' };
    }

    return { queue: targetQueue };
};

const toWorkflowApiState = (queue: string | null | undefined, state: ApplicationState | string | null | undefined): string | undefined => {
    const normalizedQueue = normalizeQueueToken(queue || '');
    const mappedState = toApiApplicationState(state);
    const rawState = typeof state === 'string' ? state.trim() : '';
    const rawStateUpper = rawState.toUpperCase().replace(/[\s-]+/g, '_');

    // Operations pipeline: API `currentState` mirrors the deal stage (uppercase labels).
    if (normalizedQueue === 'FINAL') return 'FINAL';
    if (normalizedQueue === 'FUNDING_CALL' || normalizedQueue === 'FUNDINGCALL') return 'FUNDING CALL';
    if (normalizedQueue === 'DISBURSEMENT') return 'DISBURSEMENT';
    if (normalizedQueue === 'FUNDED') return 'FUNDED';

    if (normalizedQueue === 'UNDERWRITER_APPROVED') {
        if (normalizeQueueToken(rawState) === 'FINAL_APPROVAL') {
            return FINAL_APPROVAL_STATE;
        }
        return FINAL_UNDERWRITER_APPROVED_STATE;
    }

    if (normalizedQueue === 'FINAL_APPROVAL') {
        return FINAL_APPROVAL_STATE;
    }

    if (normalizedQueue === 'APPROVAL_SENT') {
        return APPROVAL_SENT_STATE;
    }

    if (normalizedQueue === 'ISO_APPROVED' || normalizedQueue === 'APPROVED_BY_ISO') {
        return 'ISO Approved';
    }

    if (normalizedQueue === 'APPROVED') {
        if (state === ApplicationState.COMPLETED) return mappedState;
        return 'Approved';
    }

    if (normalizedQueue === 'AGENT' || normalizedQueue === 'NEW') return 'Pending';

    if (normalizedQueue === 'SCRUBBING' || normalizedQueue === 'UNDERWRITING' || normalizedQueue === 'REVIEW') {
        return 'In Progress';
    }

    if (normalizedQueue === 'UNDERWRITER' || normalizedQueue === 'FINAL_REVIEW') {
        const stateLower = typeof state === 'string' ? state.trim().toLowerCase() : '';
        if (
            state === ApplicationState.COMPLETED ||
            stateLower === 'approved' ||
            isUnderwriterApprovedToken(state)
        ) {
            return FINAL_UNDERWRITER_APPROVED_STATE;
        }
        return 'In Progress';
    }

    if (
        rawStateUpper === 'FUNDING_CALL' ||
        rawStateUpper === 'FUNDINGCALL' ||
        state === ApplicationState.FUNDING_CALL
    ) {
        return 'FUNDING CALL';
    }
    if (
        rawStateUpper === 'DISBURSMENT' ||
        rawStateUpper === 'DISBURSEMENT' ||
        state === ApplicationState.DISBURSMENT
    ) {
        return 'DISBURSEMENT';
    }
    if (rawStateUpper === 'FUNDED' || state === ApplicationState.FUNDED) {
        return 'FUNDED';
    }
    if (rawStateUpper === 'FINAL' || state === ApplicationState.FINAL) {
        return 'FINAL';
    }

    return mappedState;
};

/** Normalize deal-pipeline queue labels for comparison (matches funding-call controller pattern). */
const normalizeWorkflowQueueKeyForDisbursement = (queue: string | null | undefined) =>
    String(queue ?? '')
        .trim()
        .replace(/[\s_-]+/g, '')
        .toLowerCase();

const QUEUES_THAT_CAN_MOVE_TO_DISBURSEMENT = new Set([
    'agent',
    'scrubbing',
    'underwriter',
    'contracted',
    'contractpending',
    'contractgenerated',
    'contractsent',
    'contractout',
    'contractsout',
    'contractsigned',
    'signedcontracts',
    'finalapproval',
    'final',
    'fundingcall',
]);

const shouldSetApplicationQueueToDisbursement = (currentQueue: string | null | undefined) =>
    QUEUES_THAT_CAN_MOVE_TO_DISBURSEMENT.has(normalizeWorkflowQueueKeyForDisbursement(currentQueue));

// Helper to map Prisma Application (with includes) to the API shape previously returned by Mongoose
export const mapApplicationToApi = (app: any) => {
    if (!app) return app;

    const {
        id,
        applicationId,
        priority,
        type,
        loanAmount,
        note,
        currentQueue,
        currentState,
        createdAt,
        updatedAt,
        referringAgent,
        salesRepresentative,
        createdBy,
        client,
        iso,
        isoApplicationPayouts,
        files,
        claimedByUnderwriterId,
        claimedAt,
        claimedByUnderwriter,
        deletedAt,
        deletedById,
        approvedByUnderwriterId,
        approvedAt,
        approvedByUnderwriter,
        assignedUnderwriterId,
        assignedUnderwriter,
        needsContractReinitiation,
        isoUpdatedOfferApproved,
        isoQueryResolved,
        isDuplicate,
        ...rest
    } = app;

    const mapUserLite = (u: any) =>
        u
            ? {
                _id: u.id,
                id: u.id,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                ...(u.role != null ? { role: u.role } : {}),
            }
            : undefined;

    const owners = client ? resolveClientOwners(client) : [];
    const primaryOwner = owners[0];

    const mappedClient =
        client &&
        ({
            ...client,
            _id: client.id,
            id: client.id,
            clientId: client.clientId,
            business: {
                name: client.businessName,
                email: client.businessEmail || '',
                number: client.businessNumber || '',
                website: client.businessWebsite || '',
                incorporationDate: client.businessIncorporationDate,
                incorporationState: client.businessIncorporationState || '',
                businessEntityType: client.businessEntityType || '',
                einNumber: client.businessEinNumber || '',
                annualRevenue: client.businessAnnualRevenue ?? undefined,
                monthlyRevenue: client.businessMonthlyRevenue ?? undefined,
                address: {
                    address1: client.businessAddress1 || '',
                    address2: client.businessAddress2 || '',
                    city: client.businessCity || '',
                    state: client.businessState || '',
                    zipCode: client.businessZipCode || '',
                },
            },
            owner: primaryOwner ?? {
                firstName: client.ownerFirstName,
                middleName: client.ownerMiddleName || '',
                lastName: client.ownerLastName,
                email: client.ownerEmail || '',
                mobileNumber: client.ownerMobileNumber || '',
                dateOfBirth: client.ownerDateOfBirth,
                ssn: client.ownerSsn || '',
                ficoScore: client.ownerFicoScore ?? undefined,
                ownershipStartDate: client.ownerOwnershipStartDate,
                ownershipPercentage: client.ownerOwnershipPercentage ?? undefined,
                address: {
                    address1: client.ownerAddress1 || '',
                    address2: client.ownerAddress2 || '',
                    city: client.ownerCity || '',
                    state: client.ownerState || '',
                    zipCode: client.ownerZipCode || '',
                },
            },
            owners,
        } as any);

    // files in Mongo were subdocuments with _id; here we synthesize _id from id
    const mappedFiles =
        files?.map((f: any) => ({
            _id: f.id,
            id: f.id,
            url: f.url,
            publicId: f.publicId,
            originalName: f.originalName,
            mimeType: f.mimeType,
            size: f.size,
            uploadedAt: f.uploadedAt,
            requestedDocumentSlug: f.requestedDocumentSlug,
            documentType: f.requestedDocumentSlug,
        })) || [];

    /** Matches ISO portal `/iso/:id/application-payout-status` (IsoApplicationPayout). */
    let isoCommissionPayout: {
        payoutStatus: 'paid' | 'pending' | 'clawbacks';
        scheduledPayDate: string | null;
        paidAt: string | null;
    } | null = null;
    const appIsoId = (app as { isoId?: string | null }).isoId;
    if (
        appIsoId &&
        Array.isArray(isoApplicationPayouts) &&
        isoApplicationPayouts.length > 0
    ) {
        const row =
            isoApplicationPayouts.find((p: any) => String(p?.isoId) === String(appIsoId)) ??
            isoApplicationPayouts[0];
        if (row && row.payoutStatus != null) {
            const schedRaw = row.scheduledPayDate;
            const paidRaw = row.paidAt;
            isoCommissionPayout = {
                payoutStatus: (() => {
                    const u = String(row.payoutStatus).toUpperCase();
                    if (u === 'PAID') return 'paid' as const;
                    if (u === 'CLAWBACKS') return 'clawbacks' as const;
                    return 'pending' as const;
                })(),
                scheduledPayDate:
                    schedRaw instanceof Date
                        ? schedRaw.toISOString().slice(0, 10)
                        : schedRaw
                            ? String(schedRaw).slice(0, 10)
                            : null,
                paidAt:
                    paidRaw instanceof Date
                        ? paidRaw.toISOString()
                        : paidRaw
                            ? String(paidRaw)
                            : null,
            };
        }
    }

    return {
        ...rest,
        _id: id,
        id,
        applicationId,
        priority,
        type,
        loanAmount: loanAmount ?? undefined,
        note,
        currentQueue: normalizeWorkflowQueueForApi(currentQueue) ?? currentQueue,
        currentState: toWorkflowApiState(currentQueue, currentState),
        /** DB `currentState` before workflow API mapping G?? use for dashboard buckets matching `/applications/stats`. */
        statsCurrentState: currentState,
        createdAt,
        updatedAt,
        referringAgent: mapUserLite(referringAgent),
        salesRepresentative: mapUserLite(salesRepresentative),
        createdBy: mapUserLite(createdBy),
        claimedByUnderwriterId: claimedByUnderwriterId ?? undefined,
        claimedAt:
            claimedAt instanceof Date
                ? claimedAt.toISOString()
                : claimedAt
                    ? String(claimedAt)
                    : undefined,
        claimedByUnderwriter: mapUserLite(claimedByUnderwriter),
        deletedAt:
            deletedAt instanceof Date
                ? deletedAt.toISOString()
                : deletedAt
                    ? String(deletedAt)
                    : undefined,
        deletedById: deletedById ?? undefined,
        approvedByUnderwriterId: approvedByUnderwriterId ?? undefined,
        approvedAt:
            approvedAt instanceof Date
                ? approvedAt.toISOString()
                : approvedAt
                    ? String(approvedAt)
                    : undefined,
        approvedByUnderwriter: mapUserLite(approvedByUnderwriter),
        assignedUnderwriterId: assignedUnderwriterId ?? undefined,
        assignedUnderwriter: mapUserLite(assignedUnderwriter),
        needsContractReinitiation: needsContractReinitiation === true,
        isoUpdatedOfferApproved: isoUpdatedOfferApproved === true,
        isoQueryResolved: isoQueryResolved === true,
        isDuplicate: isDuplicate === true,
        client: mappedClient,
        iso: iso
            ? {
                ...iso,
                _id: iso.id,
                id: iso.id,
            }
            : null,
        isoCommissionPayout,
        files: mappedFiles,
    };
};

const getAuthenticatedUser = (req: Request): AuthenticatedUser | null => {
    const user = req.user;
    if (!user) return null;
    return {
        id: user.id,
        role: user.role as any,
        viaSuperAdminProxy: Boolean((req as any).isSuperAdminProxy),
    };
};

/** @returns true when the response was already sent (403). */
const blockIfUnderwriterUnclaimedDeal = (
    res: Response,
    authUser: AuthenticatedUser | null,
    app:
        | {
              currentQueue: string;
              claimedByUnderwriterId?: string | null;
              assignedUnderwriterId?: string | null;
              returnedToScrubberAt?: Date | string | null;
          }
        | null,
): boolean => {
    const deny = getUnderwriterClaimMutationDenial(authUser, app);
    if (!deny) return false;
    res.status(deny.status).json({ success: false, message: deny.message });
    return true;
};

/** PUT body only sets `isoId` G?? allowed on overview without an scrubbing claim. */
const isApplicationIsoLinkOnlyBody = (body: Record<string, unknown>): boolean => {
    const keys = Object.keys(body ?? {}).filter((k) => body[k] !== undefined);
    return keys.length === 1 && keys[0] === 'isoId';
};

/**
 * Returns 403 when a workflow role (Agent/Scrubbing/Underwriter) tries to
 * mutate an application that has advanced past their stage. Non-workflow roles
 * (Operations/Admin/Super Admin/Accountant/etc.) always pass through.
 *
 * Returns `true` when the request handler should `return` after the helper
 * sent the 403 response.
 */
const sendPreviewOnlyForbidden = (
    res: Response,
    user: AuthenticatedUser | null | undefined,
    application:
        | {
            currentQueue?: string | null;
            currentState?: string | null;
            claimedByUnderwriterId?: string | null;
            assignedUnderwriterId?: string | null;
            underwriterAction?: string | null;
        }
        | null
        | undefined,
): boolean => {
    if (!application) return false;
    const access = getApplicationStageAccessForUser(user, application);
    if (access.isPreview) {
        res.status(403).json({
            success: false,
            message:
                access.reason ||
                'This deal has moved past your stage and is read-only for your role.',
            code: 'STAGE_PREVIEW_ONLY',
            stageAccess: {
                stageKey: access.stageKey,
                nextStageLabel: access.nextStageLabel,
                roleKey: access.roleKey,
            },
        });
        return true;
    }
    return false;
};

const APPLICATION_ROUTE_ID_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resolveApplicationWhere = (
    idParam: string,
): Prisma.ApplicationWhereUniqueInput | null => {
    const ref = String(idParam ?? '').trim();
    if (!ref) return null;
    if (/^\d+$/.test(ref)) {
        const numericId = Number(ref);
        return Number.isFinite(numericId) ? { applicationId: numericId } : null;
    }
    if (!APPLICATION_ROUTE_ID_UUID.test(ref)) return null;
    return { id: ref };
};

class ApplicationController {
    // Create a new application
    async create(req: Request, res: Response) {
        try {
            const { priority, type, referringAgent, salesRepresentative, client, note, loanAmount, isoId } = req.body;

            // Validate required fields
            if (!priority || !type || !salesRepresentative || !client) {
                return res.status(400).json({
                    success: false,
                    message: 'Priority, application type, sales representative, and client are required',
                });
            }

            // Verify client exists; body `client` may be a UUID (id) or numeric clientId
            let clientRecord = null;
            if (typeof client === 'number' || (typeof client === 'string' && /^\d+$/.test(client))) {
                clientRecord = await prisma.client.findUnique({
                    where: { clientId: Number(client) },
                });
            } else {
                clientRecord = await prisma.client.findUnique({
                    where: { id: String(client) },
                });
            }
            if (!clientRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Client not found',
                });
            }

            let normalizedIsoId: string | null = null;
            let commissionPercentageFromIso = 0;
            if (isoId !== undefined && isoId !== null && String(isoId).trim() !== '') {
                normalizedIsoId = String(isoId).trim();
                const isoRecord = await (prisma as any).iso.findUnique({
                    where: { id: normalizedIsoId },
                    select: { id: true, commissionPercentage: true },
                });
                if (!isoRecord) {
                    return res.status(404).json({
                        success: false,
                        message: 'ISO not found',
                    });
                }
                commissionPercentageFromIso = Number(isoRecord.commissionPercentage ?? 0);
            }

            // Process uploaded files if any
            const uploadedFiles: any[] = [];
            const reqFiles = (req as any).files;

            // Check if files exist in the request (files field from FormData)
            if (reqFiles && reqFiles.files) {
                let filesToUpload = reqFiles.files;

                // Handle both single file and multiple files
                if (!Array.isArray(filesToUpload)) {
                    filesToUpload = [filesToUpload];
                }

                const folder = 'ih-crm/applications';
                const uploadResults = await uploadService.uploadMultipleFiles(filesToUpload, folder);

                for (const result of uploadResults) {
                    if (result.success && result.data) {
                        uploadedFiles.push({
                            url: result.data.secure_url,
                            publicId: result.data.public_id,
                            originalName: result.fileName,
                            mimeType: result.data.format,
                            size: result.data.bytes,
                            uploadedAt: new Date(),
                        });
                    }
                }
            }

            const authUser = getAuthenticatedUser(req);
            const createdById = resolveTenantUserId(req);
            // When an AGENT creates an application, set referringAgentId to them so they see it in their list
            const effectiveReferringAgentId = referringAgent
                ? String(referringAgent)
                : (authUser && String(authUser.role).toUpperCase() === 'AGENT' ? authUser.id : null);

            const loanAmountNum = loanAmount !== undefined && loanAmount !== '' && loanAmount !== null
                ? (typeof loanAmount === 'number' ? loanAmount : parseFloat(String(loanAmount).replace(/[^0-9.-]+/g, '')))
                : null;
            const roleUpper = String(authUser?.role || '').toUpperCase();
            const creationQueue = roleUpper === 'AGENT' ? WORKFLOW_QUEUES.AGENT : undefined;
            const creationState = roleUpper === 'AGENT' ? ApplicationState.PENDING : undefined;

            const application = await withAllocatedDealId((dealId, tx) =>
                tx.application.create({
                    data: applicationCreateUncheckedData({
                        priority,
                        type,
                        salesRepresentativeId: String(salesRepresentative),
                        clientId: clientRecord.id,
                        note: note || '',
                        loanAmount: !isNaN(loanAmountNum as number) ? (loanAmountNum as number) : null,
                        commissionPercentage: commissionPercentageFromIso,
                        createdById,
                        referringAgentId: effectiveReferringAgentId,
                        isoId: normalizedIsoId,
                        currentQueue: creationQueue,
                        currentState: creationState,
                        dealId,
                        files: uploadedFiles.length
                            ? {
                                createMany: {
                                    data: uploadedFiles.map((f) => ({
                                        url: f.url,
                                        publicId: f.publicId,
                                        originalName: f.originalName,
                                        mimeType: f.mimeType,
                                        size: f.size,
                                        uploadedAt: f.uploadedAt,
                                    })),
                                },
                            }
                            : undefined,
                    }),
                    include: {
                        referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                        salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                        client: true,
                        iso: true,
                        files: true,
                    },
                }),
            );

            const populatedApplication = mapApplicationToApi(application);

            try {
                (populatedApplication as any).isDuplicate =
                    await syncDuplicateFlagForApplication(application.id);
            } catch (dedupeErr) {
                console.warn('Failed to sync isDuplicate after create:', dedupeErr);
            }

            // Best-effort activity log (do not block main response)
            try {
                const authUserForLog = getAuthenticatedUser(req);
                const roleLabel = authUserForLog?.role
                    ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                    : 'User';
                const actorName = (req as any).user?.name || '';
                const actionDescription = `${roleLabel} ${actorName}`.trim() + ' created the application.';

                await createApplicationActivityLog({
                    applicationId: application.id,
                    user: authUserForLog,
                    req,
                    actionType: 'CREATE_APPLICATION' as ApplicationActivityActionType,
                    actionDescription,
                    previousStatus: null,
                    currentStatus: `${application.currentQueue} / ${application.currentState}`,
                    metadata: {
                        queue: application.currentQueue,
                        state: application.currentState,
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for application creation:', logError);
            }

            scheduleApplicationStageNotification({
                application: application as any,
                transitionAction: 'CREATED',
                actorId: createdById,
                actorName: (req as any).user?.name || '',
                actorRole: authUser?.role || null,
            });

            invalidateAllApplicationStatsCache();

            return res.status(201).json({
                success: true,
                message: 'Application created successfully',
                data: populatedApplication,
            });
        } catch (error) {
            console.error('Create application error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Add files to existing application
    async addFiles(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);

            const whereUnique: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(id)
                ? { applicationId: Number(id) }
                : { id };

            const { application, forbidden } = await getApplicationForUser(
                whereUnique,
                authUser,
                { files: true }
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, application)) {
                return;
            }

            // Process uploaded files
            const reqFiles = (req as any).files;
            if (!reqFiles || !reqFiles.files) {
                return res.status(400).json({
                    success: false,
                    message: 'No files uploaded',
                });
            }

            let filesToUpload = reqFiles.files;
            // Handle both single and multiple files
            if (!Array.isArray(filesToUpload)) {
                filesToUpload = [filesToUpload];
            }

            console.log(`Uploading ${filesToUpload.length} file(s) for application ${application.id}`);

            const folder = 'ih-crm/applications';
            const uploadResults = await uploadService.uploadMultipleFiles(filesToUpload, folder);

            const newFiles: any[] = [];
            const failedUploads: string[] = [];

            for (let i = 0; i < uploadResults.length; i++) {
                const result = uploadResults[i];
                const fileName = filesToUpload[i]?.name || 'unknown';

                if (result.success && result.data) {
                    newFiles.push({
                        url: result.data.secure_url,
                        publicId: result.data.public_id,
                        originalName: result.fileName || fileName,
                        mimeType: result.data.format,
                        size: result.data.bytes,
                        uploadedAt: new Date(),
                    });
                } else {
                    console.error(`Failed to upload file ${fileName}:`, result.error || result.message);
                    failedUploads.push(fileName);
                }
            }

            if (newFiles.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: `Failed to upload all files. ${failedUploads.length > 0 ? `Failed files: ${failedUploads.join(', ')}` : ''}`,
                });
            }

            const requestedDocumentSlug = String(
                (req.body as { requestedDocumentSlug?: string; documentType?: string })?.requestedDocumentSlug ||
                    // ISO approval-portal uploads tag the file with a documentType (driving_license / voided_check / other).
                    (req.body as { documentType?: string })?.documentType ||
                    '',
            )
                .trim()
                .toLowerCase();

            // Add new files to database
            try {
                await prisma.applicationFile.createMany({
                    data: newFiles.map((f) => ({
                        applicationId: application.id,
                        url: f.url,
                        publicId: f.publicId,
                        originalName: f.originalName,
                        mimeType: f.mimeType,
                        size: f.size,
                        uploadedAt: f.uploadedAt,
                        ...(requestedDocumentSlug ? { requestedDocumentSlug } : {}),
                    })),
                });
            } catch (dbError: any) {
                console.error('Database error while saving files:', dbError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to save files to database',
                });
            }

            // Fetch updated application with all relations
            const applicationIdForLookup = /^\d+$/.test(id) ? { applicationId: Number(id) } : { id };
            const updatedApplicationRecord = await prisma.application.findUnique({
                where: applicationIdForLookup,
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    files: true,
                },
            });

            if (!updatedApplicationRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found after upload',
                });
            }

            const updatedApplication = mapApplicationToApi(updatedApplicationRecord);

            const responseMessage = failedUploads.length > 0
                ? `Successfully uploaded ${newFiles.length} file(s). Failed: ${failedUploads.join(', ')}`
                : `Successfully uploaded ${newFiles.length} file(s)`;

            // Best-effort activity log for file upload
            try {
                const authUserForLog = getAuthenticatedUser(req);
                const roleLabel = authUserForLog?.role
                    ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                    : 'User';
                const actorName = (req as any).user?.name || '';

                await createApplicationActivityLog({
                    applicationId: updatedApplicationRecord.id,
                    user: authUserForLog,
                    req,
                    actionType: 'FILE_UPLOADED' as ApplicationActivityActionType,
                    actionDescription:
                        `${roleLabel} ${actorName}`.trim() + ` uploaded ${newFiles.length} file(s) to the application.`,
                    previousStatus: `${(application as any).currentQueue} / ${(application as any).currentState}`,
                    currentStatus: `${updatedApplicationRecord.currentQueue} / ${updatedApplicationRecord.currentState}`,
                    metadata: {
                        filesUploaded: newFiles.map((f) => ({
                            originalName: f.originalName,
                            url: f.url,
                            size: f.size,
                        })),
                        failedUploads,
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for file upload:', logError);
            }

            if (requestedDocumentSlug && authUser?.id) {
                try {
                    const { notifyRequestersDocumentReceived } = await import(
                        '../services/documentRequestFulfillmentService'
                    );
                    await notifyRequestersDocumentReceived({
                        applicationUuid: application.id,
                        documentSlug: requestedDocumentSlug,
                        uploadedByUserId: String(authUser.id),
                    });
                } catch (notifyErr) {
                    console.error('Failed to notify document request fulfillment:', notifyErr);
                }
            }

            return res.status(200).json({
                success: true,
                message: responseMessage,
                data: updatedApplication,
                ...(failedUploads.length > 0 && { failedFiles: failedUploads }),
            });
        } catch (error: any) {
            console.error('Add files error:', error);
            console.error('Error stack:', error?.stack);

            // Handle database connection errors
            if (error?.code === 'ECONNRESET' || error?.code === '08P01' || error?.cause?.code === '08P01') {
                return res.status(503).json({
                    success: false,
                    message: 'Database connection error. Please try again later.',
                });
            }

            // Handle Prisma errors
            if (error?.code === 'P2025') {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    // Tag an uploaded file with a document-request slug (used when matching CRM uploads to requests).
    async updateFileDocumentType(req: Request, res: Response) {
        try {
            const { id, fileId } = req.params;
            const requestedDocumentSlug = String(
                (req.body as { requestedDocumentSlug?: string | null })?.requestedDocumentSlug ?? '',
            )
                .trim()
                .toLowerCase();

            if (!fileId || !id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID is required',
                });
            }

            const { getDocumentRequestConfig } = await import('../constants/documentRequestTypes');
            if (requestedDocumentSlug && !getDocumentRequestConfig(requestedDocumentSlug)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid document type',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const { application, forbidden } = await getApplicationForUser(
                { id },
                authUser,
                { files: true },
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, application)) {
                return;
            }

            const file = application.files?.find((f: { id: string }) => f.id === fileId);
            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found',
                });
            }

            if (requestedDocumentSlug) {
                await prisma.applicationFile.updateMany({
                    where: {
                        applicationId: application.id,
                        requestedDocumentSlug,
                        NOT: { id: fileId },
                    },
                    data: { requestedDocumentSlug: null },
                });
            }

            await prisma.applicationFile.update({
                where: { id: fileId },
                data: {
                    requestedDocumentSlug: requestedDocumentSlug || null,
                },
            });

            if (requestedDocumentSlug && authUser?.id) {
                try {
                    const { notifyRequestersDocumentReceived } = await import(
                        '../services/documentRequestFulfillmentService'
                    );
                    await notifyRequestersDocumentReceived({
                        applicationUuid: application.id,
                        documentSlug: requestedDocumentSlug,
                        uploadedByUserId: String(authUser.id),
                    });
                } catch (notifyErr) {
                    console.error('Failed to notify document request fulfillment:', notifyErr);
                }
            }

            const applicationIdForLookup = /^\d+$/.test(id) ? { applicationId: Number(id) } : { id };
            const updatedApplicationRecord = await prisma.application.findUnique({
                where: applicationIdForLookup,
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    files: true,
                },
            });

            return res.status(200).json({
                success: true,
                message: requestedDocumentSlug
                    ? 'Document type assigned successfully'
                    : 'Document type cleared',
                data: updatedApplicationRecord ? mapApplicationToApi(updatedApplicationRecord) : null,
            });
        } catch (error: unknown) {
            console.error('Update file document type error:', error);
            return res.status(500).json({
                success: false,
                message: error instanceof Error ? error.message : 'Internal server error',
            });
        }
    }

    // Remove file from application
    async removeFile(req: Request, res: Response) {
        try {
            const { id, fileId } = req.params;

            if (!fileId || !id) {
                return res.status(400).json({
                    success: false,
                    message: 'ID is required',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const { application, forbidden } = await getApplicationForUser(
                { id },
                authUser,
                { files: true }
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, application)) {
                return;
            }

            const file = application.files?.find((f: any) => f.id === fileId);
            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found',
                });
            }

            await prisma.applicationFile.delete({ where: { id: fileId } });

            return res.status(200).json({
                success: true,
                message: 'File removed successfully',
            });
        } catch (error: any) {
            console.error('Remove file error:', error);

            // Handle Prisma P2025 error (record not found)
            if (error?.code === 'P2025') {
                return res.status(404).json({
                    success: false,
                    message: 'File not found or already deleted',
                });
            }

            // Handle database connection errors
            if (error?.code === 'ECONNRESET' || error?.code === '08P01' || error?.cause?.code === '08P01') {
                return res.status(503).json({
                    success: false,
                    message: 'Database connection error. Please try again later.',
                });
            }

            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    /** Extract business/owner fields from a stored PDF and merge into the application's client. */
    async fillApplicationFromPdfFile(req: Request, res: Response) {
        try {
            const { id, fileId } = req.params;

            if (!fileId || !id) {
                return res.status(400).json({
                    success: false,
                    message: 'Application id and file id are required',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const { application, forbidden } = await getApplicationForUser(
                { id },
                authUser,
                { client: true, files: true },
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, application)) {
                return;
            }

            const file = application.files?.find((f: { id: string }) => f.id === fileId);
            if (!file) {
                return res.status(404).json({
                    success: false,
                    message: 'File not found on this application',
                });
            }

            const result = await applyPdfExtractToApplicationFromStoredFile(application.id, fileId);

            const populatedApplication = mapApplicationToApi(result.application);
            const mappedClient = mapClientToApi(result.client);

            return res.status(200).json({
                success: true,
                message: 'Application details updated from PDF extraction',
                data: {
                    client: mappedClient,
                    application: populatedApplication,
                    parsedData: result.parsedData,
                },
            });
        } catch (error: unknown) {
            const message =
                error instanceof Error && error.message
                    ? error.message
                    : 'Failed to fill application from PDF';
            console.error('[fillApplicationFromPdfFile] Error:', error);
            return res.status(400).json({
                success: false,
                message,
            });
        }
    }

    // Get all applications with pagination and filters
    async getAll(req: Request, res: Response) {
        try {
            const {
                page = 1,
                limit = 10,
                priority,
                type,
                currentQueue,
                currentState,
                operationsStatus,
                statsBucket,
                client,
                salesRepresentative,
                search,
                sortBy = 'createdAt',
                sortOrder = 'desc',
                lite,
            } = req.query;

            const authUser = getAuthenticatedUser(req);

            const rawUwClaim = req.query.underwriterClaim;
            const uwClaimNorm =
                rawUwClaim != null
                    ? String(Array.isArray(rawUwClaim) ? rawUwClaim[0] : rawUwClaim)
                        .trim()
                        .toLowerCase()
                    : '';
            const underwriterPipelineParam = normalizeUnderwriterPipelineParam(
                req.query.underwriterPipeline,
            );
            const authRoleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';

            const pageNum = Math.max(1, Number(page) || 1);
            const limitNum = Math.min(Math.max(1, Number(limit) || 10), 500);
            const skip = (pageNum - 1) * limitNum;
            const useLitePayload = String(lite ?? '').trim() === '1';

            let where: Prisma.ApplicationWhereInput = {};

            if (currentQueue) {
                where.currentQueue = String(currentQueue);
            }

            if (priority) where.priority = String(priority);

            // Scrubbing pool: deals an Underwriter sent back for correction.
            const returnedForCorrectionRaw = req.query.returnedForCorrection;
            const returnedForCorrection = ['1', 'true', 'yes'].includes(
                String(
                    Array.isArray(returnedForCorrectionRaw)
                        ? returnedForCorrectionRaw[0]
                        : (returnedForCorrectionRaw ?? ''),
                )
                    .trim()
                    .toLowerCase(),
            );
            if (returnedForCorrection) {
                where.returnedToScrubberAt = { not: null };
                // A returned deal is already owned: the scrubber holds the claim and
                // the underwriter keeps the assignment. Scope the view to the owner so
                // it is not offered to the rest of the team as claimable work.
                if (authRoleUpper === 'SCRUBBING' && authUser?.id) {
                    where.claimedByUnderwriterId = authUser.id;
                } else if (authRoleUpper === 'UNDERWRITER' && authUser?.id) {
                    where.assignedUnderwriterId = authUser.id;
                }
            }
            if (type) where.type = { contains: String(type), mode: 'insensitive' };
            if (operationsStatus) {
                const operationsStatusKey = normalizeOperationsStatusKey(String(operationsStatus));
                if (operationsStatusKey === 'Reinitiate_Contract') {
                    try {
                        await reconcileStaleContractReinitiationFlags();
                    } catch (reconcileErr) {
                        console.error(
                            '[applications list] reconcile stale reinitiation flags failed:',
                            reconcileErr,
                        );
                    }
                }
                const operationsFilter = buildOperationsStatusFilterWhere(
                    String(operationsStatus),
                    resolveOperationsListFilterMode(authUser?.role),
                );
                const existingAnd = where.AND
                    ? Array.isArray(where.AND)
                        ? where.AND
                        : [where.AND]
                    : [];
                where = {
                    ...where,
                    AND: [...existingAnd, operationsFilter],
                };
            }
            if (currentState) {
                const rawState = String(currentState).trim();
                const mappedState = isContractedOpsKey(rawState)
                    ? undefined
                    : toPrismaApplicationState(rawState);
                const aliasValues =
                    dashboardStateQueueAliases[rawState] ||
                    dashboardStateQueueAliases[rawState.replace(/\s+/g, '_')] ||
                    dashboardStateQueueAliases[rawState.replace(/_/g, ' ')] ||
                    [];
                const queueFallbackVariants = Array.from(
                    new Set([
                        rawState,
                        rawState.replace(/_/g, ' '),
                        rawState.replace(/\s+/g, '_'),
                        ...aliasValues,
                    ])
                );

                // Some historical records store workflow status in currentQueue.
                // Match either enum state or queue text so dashboard-card filters remain reliable.
                const contractedStateLiterals = [
                    'Contract Out',
                    'CONTRACTS_OUT',
                    'Contracts Out',
                    'Contracted',
                ];
                const stateOrQueueFilter: Prisma.ApplicationWhereInput = mappedState
                    ? {
                        OR: [
                            { currentState: mappedState },
                            { currentQueue: { in: queueFallbackVariants } },
                        ],
                    }
                    : isContractedOpsKey(rawState)
                        ? {
                            OR: [
                                { currentQueue: { in: queueFallbackVariants } },
                                { currentState: { in: contractedStateLiterals } },
                            ],
                        }
                        : {
                            currentQueue: { in: queueFallbackVariants },
                        };

                const existingAnd = where.AND
                    ? Array.isArray(where.AND)
                        ? where.AND
                        : [where.AND]
                    : [];

                where = {
                    ...where,
                    AND: [...existingAnd, stateOrQueueFilter],
                };
            }

            if (statsBucket) {
                let uwBucketOpts: ApplicationStatsBucketWhereOptions | undefined;
                if (
                    (uwClaimNorm === 'unclaimed' ||
                        uwClaimNorm === 'claimed' ||
                        uwClaimNorm === 'mine') &&
                    authRoleUpper === 'SCRUBBING' &&
                    authUser?.id
                ) {
                    uwBucketOpts = {
                        uwInbox: {
                            tab: uwClaimNorm as 'unclaimed' | 'claimed' | 'mine',
                            viewerId: authUser.id,
                            stage: 'scrubbing',
                        },
                    };
                }
                if (
                    (uwClaimNorm === 'unclaimed' || uwClaimNorm === 'mine') &&
                    authRoleUpper === 'UNDERWRITER' &&
                    authUser?.id
                ) {
                    uwBucketOpts = {
                        uwInbox: {
                            tab: uwClaimNorm as 'mine' | 'unclaimed',
                            viewerId: authUser.id,
                            stage: 'underwriter',
                        },
                    };
                }

                const bucketWhere = buildApplicationStatsBucketWhere(String(statsBucket), uwBucketOpts);
                if (bucketWhere) {
                    const existingAnd = where.AND
                        ? Array.isArray(where.AND)
                            ? where.AND
                            : [where.AND]
                        : [];
                    where = {
                        ...where,
                        AND: [...existingAnd, bucketWhere],
                    };
                }
            }

            if (salesRepresentative) {
                where.salesRepresentativeId = String(salesRepresentative);
            }

            if (client) {
                let clientRecord = null;
                if (typeof client === 'string' && /^\d+$/.test(client)) {
                    clientRecord = await prisma.client.findUnique({
                        where: { clientId: Number(client) },
                    });
                } else if (typeof client === 'number') {
                    clientRecord = await prisma.client.findUnique({
                        where: { clientId: client },
                    });
                } else {
                    clientRecord = await prisma.client.findUnique({
                        where: { id: String(client) },
                    });
                }
                if (clientRecord) {
                    where.clientId = clientRecord.id;
                } else {
                    where.clientId = '__non_existing__';
                }
            }

            if (search) {
                const searchWhere = buildApplicationListSearchWhere(String(search));
                if (Object.keys(searchWhere).length > 0) {
                    const existingAnd = where.AND
                        ? Array.isArray(where.AND)
                            ? where.AND
                            : [where.AND]
                        : [];
                    where = {
                        ...where,
                        AND: [...existingAnd, searchWhere],
                    };
                }
            }

            const isScrubberPipelineParam =
                underwriterPipelineParam != null &&
                (SCRUBBER_PIPELINE_FILTERS as readonly string[]).includes(underwriterPipelineParam);
            if (
                underwriterPipelineParam &&
                authUser?.id &&
                (isScrubberPipelineParam
                    ? authRoleUpper === 'SCRUBBING'
                    : authRoleUpper === 'UNDERWRITER')
            ) {
                const existingAnd = where.AND
                    ? Array.isArray(where.AND)
                        ? where.AND
                        : [where.AND]
                    : [];
                where = {
                    ...where,
                    AND: [
                        ...existingAnd,
                        buildUnderwriterPipelineWhere(
                            underwriterPipelineParam,
                            authUser.id,
                        ),
                    ],
                };
            } else if (
                (uwClaimNorm === 'unclaimed' ||
                    uwClaimNorm === 'claimed' ||
                    uwClaimNorm === 'mine') &&
                authRoleUpper === 'SCRUBBING' &&
                authUser?.id
            ) {
                const existingAnd = where.AND
                    ? Array.isArray(where.AND)
                        ? where.AND
                        : [where.AND]
                    : [];
                const scrubbingQueueFilter: Prisma.ApplicationWhereInput = {
                    currentQueue: WORKFLOW_QUEUES.SCRUBBING,
                };
                const pastScrubbingFilter: Prisma.ApplicationWhereInput = {
                    NOT: {
                        currentQueue: {
                            equals: WORKFLOW_QUEUES.SCRUBBING,
                            mode: 'insensitive',
                        },
                    },
                };
                let scrubbingInboxFilters: Prisma.ApplicationWhereInput[];
                if (uwClaimNorm === 'unclaimed') {
                    scrubbingInboxFilters = [
                        scrubbingQueueFilter,
                        { claimedByUnderwriterId: null },
                        { assignedUnderwriterId: null },
                    ];
                } else if (uwClaimNorm === 'claimed') {
                    // Still in Scrubbing and claimed by this scrubber (UW may already be assigned
                    // after routing config — do not require assignedUnderwriterId null).
                    scrubbingInboxFilters = [
                        scrubbingQueueFilter,
                        { claimedByUnderwriterId: authUser.id },
                    ];
                } else {
                    // My Deals: scrubber who worked the deal after it left Scrubbing
                    // (recommend → Underwriter and later stages).
                    scrubbingInboxFilters = [
                        { claimedByUnderwriterId: authUser.id },
                        pastScrubbingFilter,
                    ];
                }
                where = {
                    ...where,
                    AND: [...existingAnd, ...scrubbingInboxFilters],
                };
            } else if (
                (uwClaimNorm === 'unclaimed' || uwClaimNorm === 'mine') &&
                authRoleUpper === 'UNDERWRITER' &&
                authUser?.id
            ) {
                const existingAnd = where.AND
                    ? Array.isArray(where.AND)
                        ? where.AND
                        : [where.AND]
                    : [];
                const claimFilter: Prisma.ApplicationWhereInput =
                    uwClaimNorm === 'unclaimed'
                        ? {
                              assignedUnderwriterId: null,
                              OR: [
                                  { currentQueue: WORKFLOW_QUEUES.UNDERWRITER },
                                  { currentQueue: WORKFLOW_QUEUES.SCRUBBING },
                              ],
                          }
                        : {
                              assignedUnderwriterId: authUser.id,
                              // Deals sent back for correction sit in the Scrubbing
                              // queue but stay in the underwriter's own list.
                              OR: [
                                  { currentQueue: WORKFLOW_QUEUES.UNDERWRITER },
                                  { returnedToScrubberAt: { not: null } },
                              ],
                          };
                where = {
                    ...where,
                    AND: [...existingAnd, claimFilter],
                };
            }

            const canFilterByClaimAssignments =
                authRoleUpper === 'SUPER_ADMIN' ||
                authRoleUpper === 'SUPERADMIN' ||
                authRoleUpper === 'OPERATIONS';
            if (canFilterByClaimAssignments) {
                const rawClaimedByScrubberId = req.query.claimedByUnderwriterId;
                const rawAssignedUnderwriterId = req.query.assignedUnderwriterId;
                const claimedByScrubberId =
                    rawClaimedByScrubberId != null
                        ? String(
                              Array.isArray(rawClaimedByScrubberId)
                                  ? rawClaimedByScrubberId[0]
                                  : rawClaimedByScrubberId,
                          ).trim()
                        : '';
                const assignedUnderwriterFilterId =
                    rawAssignedUnderwriterId != null
                        ? String(
                              Array.isArray(rawAssignedUnderwriterId)
                                  ? rawAssignedUnderwriterId[0]
                                  : rawAssignedUnderwriterId,
                          ).trim()
                        : '';
                if (claimedByScrubberId) {
                    where.claimedByUnderwriterId = claimedByScrubberId;
                }
                if (assignedUnderwriterFilterId) {
                    where.assignedUnderwriterId = assignedUnderwriterFilterId;
                }
            }

            if (
                authRoleUpper === 'UNDERWRITER' &&
                authUser?.id &&
                !underwriterPipelineParam
            ) {
                const existingAnd = where.AND
                    ? Array.isArray(where.AND)
                        ? where.AND
                        : [where.AND]
                    : [];
                where = {
                    ...where,
                    AND: [
                        ...existingAnd,
                        {
                            OR: [
                                {
                                    NOT: {
                                        currentQueue: {
                                            equals: FINAL_APPROVAL_QUEUE,
                                            mode: 'insensitive',
                                        },
                                    },
                                },
                                { assignedUnderwriterId: authUser.id },
                                {
                                    AND: [
                                        { assignedUnderwriterId: null },
                                        { approvedByUnderwriterId: authUser.id },
                                    ],
                                },
                            ],
                        },
                        // A deal assigned to a specific Underwriter is private to them.
                        // Unassigned deals stay visible to every Underwriter (legacy behavior).
                        {
                            OR: [
                                { assignedUnderwriterId: null },
                                { assignedUnderwriterId: authUser.id },
                            ],
                        },
                    ],
                };
            }

            const operationsStatusParam = operationsStatus
                ? String(operationsStatus)
                : undefined;
            const opsStatusCanonical = operationsStatusParam
                ? normalizeOperationsStatusKey(operationsStatusParam)
                : '';
            if (opsStatusCanonical === 'Recently_Deleted') {
                if (
                    authRoleUpper !== 'SUPER_ADMIN' &&
                    authRoleUpper !== 'SUPERADMIN' &&
                    authRoleUpper !== 'OPERATIONS'
                ) {
                    return res.status(403).json({
                        success: false,
                        message:
                            'Only Super Admin or Operations can view Recently Deleted applications',
                    });
                }
            }
            where = applySoftDeleteListScope(
                where,
                operationsStatusParam,
                currentQueue ? String(currentQueue) : undefined,
                // A scrubber's My Deals keeps their "Old - Not Scrubbed" deals.
                { includeOldNotScrubbed: uwClaimNorm === 'mine' && authRoleUpper === 'SCRUBBING' },
            );

            const listInclude: Prisma.ApplicationInclude = useLitePayload
                ? {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                    client: {
                        select: {
                            id: true,
                            clientId: true,
                            businessName: true,
                            businessEmail: true,
                            ownerFirstName: true,
                            ownerLastName: true,
                            ownerEmail: true,
                            businessNumber: true,
                            businessWebsite: true,
                            businessIncorporationDate: true,
                            businessIncorporationState: true,
                            businessEntityType: true,
                            businessEinNumber: true,
                            businessAnnualRevenue: true,
                            businessMonthlyRevenue: true,
                            businessAddress1: true,
                            businessAddress2: true,
                            businessCity: true,
                            businessState: true,
                            businessZipCode: true,
                            ownerMiddleName: true,
                            ownerMobileNumber: true,
                            ownerDateOfBirth: true,
                            ownerSsn: true,
                            ownerFicoScore: true,
                            ownerOwnershipStartDate: true,
                            ownerOwnershipPercentage: true,
                            ownerAddress1: true,
                            ownerAddress2: true,
                            ownerCity: true,
                            ownerState: true,
                            ownerZipCode: true,
                        },
                    },
                    iso: { select: { id: true, name: true, email: true, phone: true } },
                    claimedByUnderwriter: {
                        select: APPLICATION_USER_LITE_SELECT,
                    },
                    assignedUnderwriter: {
                        select: APPLICATION_USER_LITE_SELECT,
                    },
                    approvedByUnderwriter: {
                        select: APPLICATION_USER_LITE_SELECT,
                    },
                    termsOffers: {
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: { approvedAmount: true },
                    },
                    OfferDecision: {
                        select: { offer: true, decision: true, declineReason: true },
                    },
                }
                : {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                    client: true,
                    iso: true,
                    claimedByUnderwriter: {
                        select: APPLICATION_USER_LITE_SELECT,
                    },
                    assignedUnderwriter: {
                        select: APPLICATION_USER_LITE_SELECT,
                    },
                    approvedByUnderwriter: {
                        select: APPLICATION_USER_LITE_SELECT,
                    },
                    isoApplicationPayouts: true,
                    termsOffers: {
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: {
                            approvedAmount: true,
                            factorRate: true,
                            paybackAmount: true,
                            commissionAmount: true,
                        },
                    },
                    OfferDecision: {
                        select: {
                            offer: true,
                            decision: true,
                            declineReason: true,
                            rate: true,
                            fees: true,
                            refinanceAmount: true,
                            totalRemit: true,
                            ourRemit: true,
                            repayPerPeriod: true,
                            monthlyPayment: true,
                            frequency: true,
                        },
                    },
                };

            const { apps, total } = await fetchPaginatedApplicationsForList(prisma, {
                where,
                skip,
                take: limitNum,
                sortBy,
                sortOrder,
                include: listInclude,
            });

            let collectionBalanceByApplicationId = new Map<
                string,
                {
                    balanceDue: number;
                    sumOfRepaid: number;
                    paybackAmount: number;
                    grossRepaidDealEconomics: number;
                }
            >();

            const statsBucketKey =
                statsBucket != null ? String(statsBucket).trim().toLowerCase() : '';
            if (statsBucketKey === 'funded' && apps.length > 0) {
                try {
                    const balRows = await getBalancesForApplicationIds(
                        prisma,
                        apps.map((a) => a.id),
                    );
                    for (const row of balRows) {
                        collectionBalanceByApplicationId.set(row.applicationId, {
                            balanceDue: row.balanceDue,
                            sumOfRepaid: row.sumOfRepaid,
                            paybackAmount: row.paybackAmount,
                            grossRepaidDealEconomics: row.grossRepaidDealEconomics,
                        });
                    }
                } catch (embedErr) {
                    console.error('Embed collection balances (funded list):', embedErr);
                }
            }

            const applications = apps.map((app) => {
                const dto = mapApplicationToApi(app) as Record<string, unknown>;
                const bal = collectionBalanceByApplicationId.get(app.id);
                if (bal) {
                    dto.collectionBalanceDue = bal.balanceDue;
                    dto.collectionSumOfRepaid = bal.sumOfRepaid;
                    dto.collectionPaybackAmount = bal.paybackAmount;
                    dto.collectionGrossRepaidDealEconomics = bal.grossRepaidDealEconomics;
                }
                return dto;
            });

            return res.status(200).json({
                success: true,
                data: applications,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    itemsPerPage: limitNum,
                },
            });
        } catch (error) {
            console.error('Get all applications error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * Get applications by agent ID (referringAgentId).
     * - Frontend may send agentId in query (e.g. ?agentId=uuid).
     * - If logged-in user is AGENT: agentId is ignored and only their own applications are returned.
     * - If logged-in user is ADMIN/SCRUBBING/UNDERWRITER/ACCOUNTANT: applications for the given agentId are returned.
     */
    async getApplicationsByAgentId(req: Request, res: Response) {
        try {
            const raw = req.query;
            const queryAgentId = Array.isArray(raw.agentId) ? raw.agentId[0] : raw.agentId;
            const pageRaw = Array.isArray(raw.page) ? raw.page[0] : raw.page;
            const limitRaw = Array.isArray(raw.limit) ? raw.limit[0] : raw.limit;
            const sortByRaw = Array.isArray(raw.sortBy) ? raw.sortBy[0] : raw.sortBy;
            const sortOrderRaw = Array.isArray(raw.sortOrder) ? raw.sortOrder[0] : raw.sortOrder;

            const authUser = getAuthenticatedUser(req);
            const role = authUser?.role ? String(authUser.role).trim().toUpperCase().replace(/-/g, '_') : '';

            // AGENT can only see their own; ignore frontend agentId to prevent privilege escalation
            const effectiveAgentId =
                role === 'AGENT'
                    ? (authUser?.id ?? '')
                    : (queryAgentId ? String(queryAgentId).trim() : authUser?.id ?? '');

            if (!effectiveAgentId) {
                return res.status(400).json({
                    success: false,
                    message: 'Agent ID is required (or log in as an agent to see your own applications)',
                });
            }

            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(effectiveAgentId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid agent ID format (expected UUID)',
                });
            }

            const pageNum = Math.max(1, parseInt(String(pageRaw), 10) || 1);
            const limitNum = Math.min(Math.max(1, parseInt(String(limitRaw), 10) || 10), 100);
            const skip = (pageNum - 1) * limitNum;

            const where: Prisma.ApplicationWhereInput = {
                referringAgentId: effectiveAgentId,
            };

            const orderByField = sortByRaw === 'applicationId' ? 'applicationId' : 'createdAt';
            const orderDir = String(sortOrderRaw).toLowerCase() === 'asc' ? 'asc' : 'desc';
            const orderBy: Prisma.ApplicationOrderByWithRelationInput = {
                [orderByField]: orderDir,
            };

            const [apps, total] = await Promise.all([
                prisma.application.findMany({
                    where,
                    orderBy,
                    skip,
                    take: limitNum,
                    include: {
                        referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                        salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                        client: true,
                        iso: true,
                    },
                }),
                prisma.application.count({ where }),
            ]);

            const applications = apps.map(mapApplicationToApi);

            return res.status(200).json({
                success: true,
                data: applications,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum) || 1,
                    totalItems: total,
                    itemsPerPage: limitNum,
                },
            });
        } catch (error: unknown) {
            const err = error as Error & { code?: string };
            console.error('Get applications by agent ID error:', err?.message ?? err, err?.stack);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get application stats (counts and total loan amounts by queue/state)
    // Aligns with frontend getApplicationStatus: Pending = New, On Hold, Review, Underwriting, Final Review
    // Supports optional date range filtering via ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    async getStats(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            const currentUserRole = authUser?.role;

            const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

            let start: Date | null = null;
            let end: Date | null = null;

            if (startDate) {
                const d = new Date(startDate);
                if (!isNaN(d.getTime())) {
                    d.setHours(0, 0, 0, 0);
                    start = d;
                }
            }
            if (endDate) {
                const d = new Date(endDate);
                if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    end = d;
                }
            }

            const uwRaw = req.query.underwriterClaim;
            const uwClaimNorm =
                uwRaw != null
                    ? String(Array.isArray(uwRaw) ? uwRaw[0] : uwRaw)
                        .trim()
                        .toLowerCase()
                    : '';
            let underwriterClaimParam: UnderwriterClaimScope | null = null;
            if (
                uwClaimNorm === 'unclaimed' ||
                uwClaimNorm === 'claimed' ||
                uwClaimNorm === 'mine'
            ) {
                const roleUpper = String(currentUserRole ?? '')
                    .trim()
                    .toUpperCase()
                    .replace(/-/g, '_');
                if (roleUpper !== 'SCRUBBING' && roleUpper !== 'UNDERWRITER') {
                    return res.status(403).json({
                        success: false,
                        message: 'underwriterClaim stats are only available for the Scrubbing or Underwriter role',
                    });
                }
                if (roleUpper === 'UNDERWRITER' && uwClaimNorm === 'claimed') {
                    return res.status(400).json({
                        success: false,
                        message: 'underwriterClaim=claimed is only available for the Scrubbing role',
                    });
                }
                if (!authUser?.id) {
                    return res.status(401).json({
                        success: false,
                        message: 'Unauthorized',
                    });
                }
                underwriterClaimParam = uwClaimNorm as UnderwriterClaimScope;
            }

            const cacheKey = [
                authUser?.id ?? 'none',
                String(currentUserRole ?? ''),
                start ? start.toISOString() : '',
                end ? end.toISOString() : '',
                underwriterClaimParam ?? '',
            ].join('|');

            const cached = await getApplicationStatsCache(cacheKey);
            if (cached) {
                res.set('Cache-Control', 'private, max-age=5');
                return res.status(200).json({
                    success: true,
                    data: cached,
                });
            }

            const data = await aggregateApplicationStats({
                authUser,
                role: currentUserRole,
                startDate: start,
                endDate: end,
                underwriterClaim: underwriterClaimParam,
            });

            await setApplicationStatsCache(cacheKey, data);
            res.set('Cache-Control', 'private, max-age=5');

            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error('Get application stats error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /** Underwriter sidebar: per-pipeline deal counts scoped to the logged-in underwriter. */
    async getDeclinePipelineCounts(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            if (!authUser) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }
            const visibility = mergeApplicationVisibilityWhere({}, authUser);
            const [declineRequest, declinedByScrubber, declinedByUnderwriter, declinedAll, declinedByAdmin] =
                await Promise.all([
                    prisma.application.count({
                        where: {
                            AND: [
                                visibility,
                                excludeSoftDeletedWhere(),
                                declineRequestMatchWhere(),
                            ],
                        },
                    }),
                    prisma.application.count({
                        where: {
                            AND: [
                                visibility,
                                excludeSoftDeletedWhere(),
                                declinedByScrubberMatchWhere(),
                            ],
                        },
                    }),
                    prisma.application.count({
                        where: {
                            AND: [
                                visibility,
                                excludeSoftDeletedWhere(),
                                declinedByUnderwriterMatchWhere(),
                            ],
                        },
                    }),
                    prisma.application.count({
                        where: {
                            AND: [
                                visibility,
                                excludeSoftDeletedWhere(),
                                declineAllMatchWhere(),
                            ],
                        },
                    }),
                    prisma.application.count({
                        where: {
                            AND: [
                                visibility,
                                excludeSoftDeletedWhere(),
                                declinedByAdminMatchWhere(),
                            ],
                        },
                    }),
                ]);
            res.set('Cache-Control', 'private, max-age=5');
            return res.status(200).json({
                success: true,
                data: {
                    declined: declinedAll,
                    declineRequest,
                    declinedByScrubber,
                    declinedByUnderwriter,
                    declinedByAdmin,
                },
            });
        } catch (error) {
            console.error('Get decline pipeline counts error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getUnderwriterPipelineCounts(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            if (!authUser?.id) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }
            const roleUpper = String(authUser.role ?? '')
                .trim()
                .toUpperCase()
                .replace(/-/g, '_');
            if (roleUpper !== 'UNDERWRITER' && roleUpper !== 'SCRUBBING') {
                return res.status(403).json({
                    success: false,
                    message: 'Pipeline counts are only available for the Underwriter and Scrubbing roles',
                });
            }

            const counts =
                roleUpper === 'SCRUBBING'
                    ? await countUnderwriterPipelineDeals(prisma, authUser.id, SCRUBBER_PIPELINE_FILTERS)
                    : await countUnderwriterPipelineDeals(prisma, authUser.id);
            res.set('Cache-Control', 'private, max-age=5');
            return res.status(200).json({
                success: true,
                data: counts,
            });
        } catch (error) {
            console.error('Get underwriter pipeline counts error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * Operations / Super Admin dashboard: all pipeline totals in one request (parallel counts, same filters as list).
     */
    async getOperationsDashboardSummary(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            if (!authUser) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }
            const roleKey = String(authUser.role ?? '').trim();
            const opsCacheKey = `${authUser.id}|${roleKey}`;
            const data = await withDashboardCache(
                DashboardCacheKind.OPS_SUMMARY,
                opsCacheKey,
                () => aggregateOperationsDashboardSummary(authUser),
            );
            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error('Get operations dashboard summary error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }


    /**
     * Operations dashboard recent list: backend-filtered contracted pipeline rows.
     */
    async getOperationsDashboardRecentCases(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            if (!authUser) {
                return res.status(401).json({
                    success: false,
                    message: 'Unauthorized',
                });
            }
            const rawLimit = Number(req.query.limit);
            const limit = Number.isFinite(rawLimit) ? rawLimit : 200;
            const roleKey = String(authUser.role ?? '').trim();
            const opsRecentKey = `${authUser.id}|${roleKey}|${limit}`;
            const data = await withDashboardCache(
                DashboardCacheKind.OPS_RECENT,
                opsRecentKey,
                () => listOperationsDashboardRecentCases(authUser, limit),
            );
            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error('Get operations dashboard recent cases error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * Admin dashboard stats
     * Aggregated metrics for the admin overview dashboard.
     */
    async getAdminDashboardStats(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            const adminCached = await withDashboardCache(
                DashboardCacheKind.ADMIN,
                'global',
                async () => this.buildAdminDashboardStatsPayload(authUser),
            );
            return res.status(200).json({
                success: true,
                data: adminCached,
            });
        } catch (error) {
            console.error('Get admin dashboard stats error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /** Heavy admin dashboard aggregation (cached via Redis / memory). */
    private async buildAdminDashboardStatsPayload(authUser: AuthenticatedUser | null) {
            const now = new Date();
            const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            last7Days.setHours(0, 0, 0, 0);
            const endOfToday = new Date(now);
            endOfToday.setHours(23, 59, 59, 999);

            const [lifetimeStats, last7Stats] = await Promise.all([
                aggregateApplicationStats({
                    authUser,
                    role: authUser?.role ?? '',
                    startDate: null,
                    endDate: null,
                }),
                aggregateApplicationStats({
                    authUser,
                    role: authUser?.role ?? '',
                    startDate: last7Days,
                    endDate: endOfToday,
                }),
            ]);

            const funded = lifetimeStats.funded;
            const approved = lifetimeStats.approved;
            const rejected = lifetimeStats.rejected;
            const pending = lifetimeStats.pending;

            const fundedLast7 = last7Stats.funded.count;
            const approvedLast7 = last7Stats.approved.count;
            const rejectedLast7 = last7Stats.rejected.count;
            const pendingLast7 = last7Stats.pending.count;

            // =========================
            // Users & related entities
            // =========================
            const [
                totalUsers,
                agents,
                underwriters,
                finalUnderwriters,
                operations,
                admins,
                totalClients,
                totalSyndicators,
            ] = await Promise.all([
                prisma.user.count(),
                prisma.user.count({ where: { role: 'AGENT' } }),
                prisma.user.count({ where: { role: 'SCRUBBING' } }),
                prisma.user.count({ where: { role: 'UNDERWRITER' } }),
                prisma.user.count({ where: { role: 'OPERATIONS' } }),
                prisma.user.count({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] } } }),
                prisma.client.count(),
                prisma.syndicator.count(),
            ]);

            // =========================
            // Monthly Trend (chart)
            // =========================
            const last12MonthsStart = new Date(now);
            last12MonthsStart.setMonth(now.getMonth() - 11);
            last12MonthsStart.setHours(0, 0, 0, 0);

            // ========= Monthly trend (12 months) =========
            const monthlySource = await prisma.application.findMany({
                where: {
                    createdAt: { gte: last12MonthsStart },
                },
                select: {
                    createdAt: true,
                    currentQueue: true,
                    currentState: true,
                    loanAmount: true,
                },
            });

            const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthlyTrend = monthLabels.map((label) => ({
                period: label,
                approved: 0,
                funded: 0,
                rejected: 0,
            }));

            for (const app of monthlySource) {
                const created = new Date(app.createdAt);
                const monthIndex = created.getMonth(); // 0-11
                const bucket = monthlyTrend[monthIndex];
                const amount = app.loanAmount ?? 0;

                const kind = classifyFundedApprovedRejected(app.currentQueue, app.currentState);
                if (kind === 'funded') bucket.funded += amount;
                else if (kind === 'approved') bucket.approved += amount;
                else if (kind === 'rejected') bucket.rejected += amount;
            }

            // ========= Weekly trend (last 8 weeks) =========
            const last8WeeksStart = new Date(now);
            last8WeeksStart.setDate(now.getDate() - 7 * 7); // ~8 weeks back
            last8WeeksStart.setHours(0, 0, 0, 0);

            const weeklySource = await prisma.application.findMany({
                where: {
                    createdAt: { gte: last8WeeksStart },
                },
                select: {
                    createdAt: true,
                    currentQueue: true,
                    currentState: true,
                    loanAmount: true,
                },
            });

            // Helper: get week label as YYYY-Www (ISO-like)
            const getWeekKey = (date: Date) => {
                const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
                const dayNum = d.getUTCDay() || 7;
                d.setUTCDate(d.getUTCDate() + 4 - dayNum);
                const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
                const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
                return `${d.getUTCFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
            };

            const weeklyBuckets: Record<string, { period: string; approved: number; funded: number; rejected: number }> =
                {};

            for (const app of weeklySource) {
                const created = new Date(app.createdAt);
                const key = getWeekKey(created);
                if (!weeklyBuckets[key]) {
                    weeklyBuckets[key] = { period: key, approved: 0, funded: 0, rejected: 0 };
                }
                const bucket = weeklyBuckets[key];
                const amount = app.loanAmount ?? 0;

                const kind = classifyFundedApprovedRejected(app.currentQueue, app.currentState);
                if (kind === 'funded') bucket.funded += amount;
                else if (kind === 'approved') bucket.approved += amount;
                else if (kind === 'rejected') bucket.rejected += amount;
            }

            // Sort by week and limit to last 8 buckets
            const weeklyTrend = Object.values(weeklyBuckets).sort((a, b) =>
                a.period.localeCompare(b.period),
            ).slice(-8);

            // ========= Yearly trend (by calendar year) =========
            const yearlySource = await prisma.application.findMany({
                select: {
                    createdAt: true,
                    currentQueue: true,
                    currentState: true,
                    loanAmount: true,
                },
            });

            const yearlyBuckets: Record<string, { period: string; approved: number; funded: number; rejected: number }> =
                {};

            for (const app of yearlySource) {
                const created = new Date(app.createdAt);
                const yearKey = created.getFullYear().toString();
                if (!yearlyBuckets[yearKey]) {
                    yearlyBuckets[yearKey] = { period: yearKey, approved: 0, funded: 0, rejected: 0 };
                }
                const bucket = yearlyBuckets[yearKey];
                const amount = app.loanAmount ?? 0;

                const kind = classifyFundedApprovedRejected(app.currentQueue, app.currentState);
                if (kind === 'funded') bucket.funded += amount;
                else if (kind === 'approved') bucket.approved += amount;
                else if (kind === 'rejected') bucket.rejected += amount;
            }

            const yearlyTrend = Object.values(yearlyBuckets).sort((a, b) =>
                a.period.localeCompare(b.period),
            );

            // ==================================
            // Application Pipeline Funnel chart
            // (weekly / monthly / yearly + rolling 12 months G?? matches dashboard dropdown)
            // ==================================
            const buildPipelineFunnelSnapshot = (
                rows: { createdAt: Date; currentQueue: string | null }[],
                periodStart: Date,
                periodEnd: Date,
            ) => {
                const filtered = rows.filter((r) => r.createdAt >= periodStart && r.createdAt <= periodEnd);
                const submit = filtered.length;
                let inProgress = 0;
                let waitingForDocuments = 0;
                let decisionMade = 0;

                const inProgressQueues = [
                    'New',
                    WORKFLOW_QUEUES.AGENT,
                    'Review',
                    'Underwriting',
                    WORKFLOW_QUEUES.SCRUBBING,
                    'Final Review',
                    WORKFLOW_QUEUES.UNDERWRITER,
                ];
                const waitingQueues = ['On Hold', 'Waiting for Documents'];
                const decisionQueues = ['Approved', 'Declined', 'Contracted', 'Contract Out', 'Contracts Out'];

                for (const app of filtered) {
                    const q = app.currentQueue;
                    if (q && inProgressQueues.includes(q)) inProgress += 1;
                    if (q && waitingQueues.includes(q)) waitingForDocuments += 1;
                    if (q && decisionQueues.includes(q)) decisionMade += 1;
                }

                const pct = submit > 0 ? (decisionMade / submit) * 100 : 0;
                return {
                    submit,
                    inProgress,
                    waitingForDocuments,
                    decisionMade,
                    conversionRate: {
                        percentage: Math.round(pct),
                        numerator: decisionMade,
                        denominator: submit,
                    },
                };
            };

            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - now.getDay());
            weekStart.setHours(0, 0, 0, 0);

            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            monthStart.setHours(0, 0, 0, 0);

            const yearStart = new Date(now.getFullYear(), 0, 1);
            yearStart.setHours(0, 0, 0, 0);

            const funnelFetchStart = new Date(
                Math.min(
                    weekStart.getTime(),
                    monthStart.getTime(),
                    yearStart.getTime(),
                    last12MonthsStart.getTime(),
                ),
            );

            const funnelRows = await prisma.application.findMany({
                where: {
                    createdAt: { gte: funnelFetchStart, lte: endOfToday },
                },
                select: {
                    createdAt: true,
                    currentQueue: true,
                },
            });

            const pipelineFunnel = {
                weekly: buildPipelineFunnelSnapshot(funnelRows, weekStart, endOfToday),
                monthly: buildPipelineFunnelSnapshot(funnelRows, monthStart, endOfToday),
                yearly: buildPipelineFunnelSnapshot(funnelRows, yearStart, endOfToday),
                rolling12Months: buildPipelineFunnelSnapshot(funnelRows, last12MonthsStart, endOfToday),
            };

            // =========================
            // Recent applications table
            // =========================
            const recentApplicationsRaw = await prisma.application.findMany({
                orderBy: { createdAt: 'desc' },
                take: 10,
                include: { client: true },
            });

            const recentApplications = recentApplicationsRaw.map((app) => ({
                id: app.id,
                applicationId: app.applicationId,
                date: app.createdAt,
                status: app.currentQueue,
                applicationName: app.client?.businessName || '',
                advanceAmount: app.loanAmount ?? null,
            }));

            return {
                users: {
                    total: totalUsers,
                    agents,
                    underwriters,
                    finalUnderwriters,
                    operations,
                    admins,
                    clients: totalClients,
                    syndicators: totalSyndicators,
                },
                applications: {
                    funded,
                    approved,
                    rejected,
                    pending,
                    last7Days: {
                        funded: fundedLast7,
                        approved: approvedLast7,
                        rejected: rejectedLast7,
                        pending: pendingLast7,
                    },
                },
                charts: {
                    monthlyTrend,
                    weeklyTrend,
                    yearlyTrend,
                    pipelineFunnel,
                },
                recentApplications,
            };
    }

    // Get single application by UUID or numeric applicationId
    async getById(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const where = resolveApplicationWhere(String(id ?? ''));
            if (!where) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid application ID (expected UUID or numeric applicationId).',
                });
            }

            const applicationInclude = APPLICATION_DETAIL_INCLUDE;

            // OPERATIONS / SUPER_ADMIN can fetch any application directly, bypassing visibility filters
            if (authUser?.role === 'OPERATIONS' || authUser?.role === 'SUPER_ADMIN') {
                const applicationRecord = await prisma.application.findUnique({
                    where,
                    include: applicationInclude,
                });

                if (!applicationRecord) {
                    return res.status(404).json({
                        success: false,
                        message: 'Application not found',
                    });
                }

                await applyContractCompletedSyncToApplicationRecord(
                    prisma,
                    applicationRecord,
                    'application.getById.operations',
                );
                const application = mapApplicationToApi(applicationRecord);

                return res.status(200).json({
                    success: true,
                    data: application,
                });
            }

            const { application: applicationRecord, forbidden } = await getApplicationForUser(
                where,
                authUser,
                applicationInclude,
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!applicationRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            await applyContractCompletedSyncToApplicationRecord(
                prisma,
                applicationRecord,
                'application.getById',
            );
            const application = mapApplicationToApi(applicationRecord);

            return res.status(200).json({
                success: true,
                data: application,
            });
        } catch (error) {
            console.error('Get application by ID error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get application by applicationId (numeric ID)
    async getByApplicationId(req: Request, res: Response) {
        try {
            const { applicationId } = req.params;
            const authUser = getAuthenticatedUser(req);

            // OPERATIONS / SUPER_ADMIN can fetch any application by numeric applicationId directly, bypassing visibility filters
            if (authUser?.role === 'OPERATIONS' || authUser?.role === 'SUPER_ADMIN') {
                const numericId = Number(applicationId);
                if (!applicationId || Number.isNaN(numericId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid applicationId (expected numeric value)',
                    });
                }

                const applicationRecord = await prisma.application.findUnique({
                    where: { applicationId: numericId },
                    include: APPLICATION_DETAIL_INCLUDE,
                });

                if (!applicationRecord) {
                    return res.status(404).json({
                        success: false,
                        message: 'Application not found',
                    });
                }

                await applyContractCompletedSyncToApplicationRecord(
                    prisma,
                    applicationRecord,
                    'application.getByApplicationId.operations',
                );
                const application = mapApplicationToApi(applicationRecord);

                return res.status(200).json({
                    success: true,
                    data: application,
                });
            }

            const { application: applicationRecord, forbidden } = await getApplicationForUser(
                { applicationId: Number(applicationId) },
                authUser,
                APPLICATION_DETAIL_INCLUDE,
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!applicationRecord) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            await applyContractCompletedSyncToApplicationRecord(
                prisma,
                applicationRecord,
                'application.getByApplicationId',
            );
            const application = mapApplicationToApi(applicationRecord);

            return res.status(200).json({
                success: true,
                data: application,
            });
        } catch (error: any) {
            console.error('Get application by applicationId error:', error);

            // Handle database connection errors
            if (error?.code === 'ECONNRESET' || error?.code === '08P01' || error?.cause?.code === '08P01') {
                return res.status(503).json({
                    success: false,
                    message: 'Database connection error. Please try again later.',
                });
            }

            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    // Get applications by client
    async getByClient(req: Request, res: Response) {
        try {
            const { clientId } = req.params;
            const { page = 1, limit = 10 } = req.query;

            const pageNum = Number(page);
            const limitNum = Number(limit);
            const skip = (pageNum - 1) * limitNum;

            // clientId is numeric application-level clientId
            const clientRecord = await prisma.client.findUnique({
                where: { clientId: Number(clientId) },
            });
            if (!clientRecord) {
                return res.status(200).json({
                    success: true,
                    data: [],
                    pagination: {
                        currentPage: pageNum,
                        totalPages: 0,
                        totalItems: 0,
                        itemsPerPage: limitNum,
                    },
                });
            }

            const authUser = getAuthenticatedUser(req);
            let where: Prisma.ApplicationWhereInput = { clientId: clientRecord.id };
            where = mergeApplicationVisibilityWhere(where, authUser);

            const [apps, total] = await Promise.all([
                prisma.application.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    skip,
                    take: limitNum,
                    include: {
                        referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                        salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                        client: true,
                        iso: true,
                    },
                }),
                prisma.application.count({ where }),
            ]);

            const applications = apps.map(mapApplicationToApi);

            return res.status(200).json({
                success: true,
                data: applications,
                pagination: {
                    currentPage: pageNum,
                    totalPages: Math.ceil(total / limitNum),
                    totalItems: total,
                    itemsPerPage: limitNum,
                },
            });
        } catch (error) {
            console.error('Get applications by client error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update application
    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const {
                priority,
                type,
                referringAgent,
                salesRepresentative,
                client,
                note,
                currentQueue,
                currentState,
                loanAmount,
                /** CRM-only; not a DB column G?? maps to currentQueue + currentState */
                status,
                isoId,
                commissionPercentage,
                underwriterCommissionPercentage,
                brokerCommissionPercentage,
                commissionAmount,
                underwriterCommissionAmount,
                brokerCommissionAmount,
                brokerName,
                underwriterCommissionName,
                category,
                isoQueryResolved,
            } = req.body;
            const authUser = getAuthenticatedUser(req);

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const activityLogInclude = {
                client: { select: { id: true, businessName: true, clientId: true } },
                iso: { select: { id: true, name: true } },
                referringAgent: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
                salesRepresentative: {
                    select: { id: true, firstName: true, lastName: true, email: true },
                },
            } as const;

            const { application, forbidden } = await getApplicationForUser(
                whereClause,
                authUser,
                activityLogInclude,
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const isoLinkOnlyUpdate = isApplicationIsoLinkOnlyBody(
                (req.body ?? {}) as Record<string, unknown>,
            );

            if (
                !isoLinkOnlyUpdate &&
                blockIfUnderwriterUnclaimedDeal(res, authUser, application)
            ) {
                return;
            }

            const data: any = {};

            if (client !== undefined) {
                let clientRecord = null;
                if (typeof client === 'string' && /^\d+$/.test(client)) {
                    clientRecord = await prisma.client.findUnique({ where: { clientId: Number(client) } });
                } else {
                    clientRecord = await prisma.client.findUnique({ where: { id: String(client) } });
                }
                if (!clientRecord) {
                    return res.status(404).json({
                        success: false,
                        message: 'Client not found',
                    });
                }
                data.client = { connect: { id: clientRecord.id } };
            }

            if (isoId !== undefined) {
                const trimmedIsoId = String(isoId ?? '').trim();
                if (!trimmedIsoId) {
                    data.iso = { disconnect: true };
                    data.commissionPercentage = 0;
                } else {
                    const isoRecord = await (prisma as any).iso.findUnique({
                        where: { id: trimmedIsoId },
                        select: { id: true, commissionPercentage: true },
                    });
                    if (!isoRecord) {
                        return res.status(404).json({
                            success: false,
                            message: 'ISO not found',
                        });
                    }
                    data.iso = { connect: { id: trimmedIsoId } };
                    data.commissionPercentage = Number(isoRecord.commissionPercentage ?? 0);
                }
            }

            if (priority !== undefined) data.priority = priority;
            if (type !== undefined) data.type = type;
            if (referringAgent !== undefined) data.referringAgentId = referringAgent || null;
            if (salesRepresentative !== undefined) data.salesRepresentativeId = salesRepresentative;
            if (note !== undefined) data.note = note;
            if (currentQueue !== undefined) {
                const queueKey = normalizeWorkflowQueueKeyForDisbursement(application.currentQueue);
                if (currentQueue === 'Disbursement') {
                    if (
                        queueKey === 'disbursement' ||
                        shouldSetApplicationQueueToDisbursement(application.currentQueue)
                    ) {
                        data.currentQueue = 'Disbursement';
                        if (currentState === undefined) {
                            data.currentState = ApplicationState.DISBURSMENT;
                        }
                    }
                } else if (currentQueue === 'Funded') {
                    const stateKey = normalizeWorkflowQueueKeyForDisbursement(application.currentState);
                    if (
                        queueKey === 'disbursement' ||
                        queueKey === 'funded' ||
                        stateKey === 'disbursment' ||
                        stateKey === 'disbursement' ||
                        stateKey === 'funded'
                    ) {
                        data.currentQueue = 'Funded';
                        if (currentState === undefined) {
                            data.currentState = ApplicationState.FUNDED;
                        }
                    }
                } else {
                    const normalizedQueue =
                        normalizeStoredWorkflowQueue(String(currentQueue)) ?? String(currentQueue);
                    data.currentQueue = normalizedQueue;
                    if (currentState === undefined) {
                        if (normalizedQueue === 'Final') {
                            data.currentState = ApplicationState.FINAL;
                        } else if (normalizedQueue === 'Funding Call') {
                            data.currentState = ApplicationState.FUNDING_CALL;
                        }
                    }
                }
            }
            if (currentState !== undefined) {
                const trimmedState = String(currentState).trim();
                const queueForStateRaw =
                    currentQueue !== undefined ? String(currentQueue) : String(application.currentQueue || '');
                const queueForState =
                    normalizeStoredWorkflowQueue(queueForStateRaw) ?? queueForStateRaw;
                const stateIsApproved =
                    trimmedState.toLowerCase() === 'approved' ||
                    isUnderwriterApprovedToken(trimmedState);
                const queueIsFinalUw =
                    normalizeQueueToken(queueForState) === 'UNDERWRITER';
                if (stateIsApproved && queueIsFinalUw) {
                    data.currentState = FINAL_UNDERWRITER_APPROVED_STATE;
                    data.currentQueue = FINAL_UNDERWRITER_APPROVED_QUEUE;
                } else if (verbatimApplicationStateByInput[trimmedState] !== undefined) {
                    data.currentState = verbatimApplicationStateByInput[trimmedState];
                } else {
                    const mappedState = toPrismaApplicationState(currentState);
                    if (!mappedState) {
                        return res.status(400).json({
                            success: false,
                            message: `Valid state is required (${Object.keys(applicationStateApiToPrisma).join(', ')}, ${Object.keys(verbatimApplicationStateByInput).join(', ')})`,
                        });
                    }
                    data.currentState = mappedState;
                }
            }

            if (status !== undefined) {
                const roleUpper = String(authUser?.role || '')
                    .toUpperCase()
                    .replace(/-/g, '_');
                const st = String(status).trim().toLowerCase();
                if (st === 'approved') {
                    const canFuApprove = [
                        'UNDERWRITER',
                        'SUPER_ADMIN',
                        'ADMIN',
                        'OPERATIONS',
                    ].includes(roleUpper);
                    if (canFuApprove) {
                        data.currentQueue = FINAL_UNDERWRITER_APPROVED_QUEUE;
                        data.currentState = FINAL_UNDERWRITER_APPROVED_STATE;
                    }
                } else if (st === 'sent to final scrubbing' || st === 'sent to underwriter') {
                    const canSendToFu = [
                        'AGENT',
                        'SCRUBBING',
                        'ADMIN',
                        'SUPER_ADMIN',
                        'OPERATIONS',
                        'UNDERWRITER',
                        'ACCOUNTANT',
                        'ACCOUNTS',
                    ].includes(roleUpper);
                    if (canSendToFu) {
                        data.currentQueue = WORKFLOW_QUEUES.UNDERWRITER;
                        data.currentState = ApplicationState.IN_PROGRESS;
                    }
                }
            }

            if (loanAmount !== undefined) {
                const loanAmountNum = loanAmount === '' || loanAmount === null
                    ? null
                    : (typeof loanAmount === 'number' ? loanAmount : parseFloat(String(loanAmount).replace(/[^0-9.-]+/g, '')));
                data.loanAmount = loanAmountNum !== null && !isNaN(loanAmountNum) ? loanAmountNum : null;
            }

            if (commissionPercentage !== undefined) {
                const raw =
                    typeof commissionPercentage === 'number'
                        ? commissionPercentage
                        : parseFloat(String(commissionPercentage).replace(/[^0-9.-]+/g, ''));
                if (Number.isNaN(raw) || raw < 0 || raw > 100) {
                    return res.status(400).json({
                        success: false,
                        message: 'commissionPercentage must be a number between 0 and 100',
                    });
                }
                data.commissionPercentage = raw;
            }

            if (underwriterCommissionPercentage !== undefined) {
                const raw =
                    typeof underwriterCommissionPercentage === 'number'
                        ? underwriterCommissionPercentage
                        : parseFloat(
                              String(underwriterCommissionPercentage).replace(/[^0-9.-]+/g, ''),
                          );
                if (Number.isNaN(raw) || raw < 0 || raw > 100) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'underwriterCommissionPercentage must be a number between 0 and 100',
                    });
                }
                data.underwriterCommissionPercentage = raw;
            }

            if (brokerCommissionPercentage !== undefined) {
                const raw =
                    typeof brokerCommissionPercentage === 'number'
                        ? brokerCommissionPercentage
                        : parseFloat(
                              String(brokerCommissionPercentage).replace(/[^0-9.-]+/g, ''),
                          );
                if (Number.isNaN(raw) || raw < 0 || raw > 100) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'brokerCommissionPercentage must be a number between 0 and 100',
                    });
                }
                data.brokerCommissionPercentage = raw;
            }

            if (commissionAmount !== undefined) {
                const commissionAmountNum =
                    commissionAmount === '' || commissionAmount === null
                        ? null
                        : typeof commissionAmount === 'number'
                          ? commissionAmount
                          : parseFloat(String(commissionAmount).replace(/[^0-9.-]+/g, ''));
                if (
                    commissionAmountNum !== null &&
                    (Number.isNaN(commissionAmountNum) || commissionAmountNum < 0)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: 'commissionAmount must be a non-negative number',
                    });
                }
                data.commissionAmount = commissionAmountNum;
            }

            if (underwriterCommissionAmount !== undefined) {
                const underwriterCommissionAmountNum =
                    underwriterCommissionAmount === '' || underwriterCommissionAmount === null
                        ? null
                        : typeof underwriterCommissionAmount === 'number'
                          ? underwriterCommissionAmount
                          : parseFloat(
                                String(underwriterCommissionAmount).replace(/[^0-9.-]+/g, ''),
                            );
                if (
                    underwriterCommissionAmountNum !== null &&
                    (Number.isNaN(underwriterCommissionAmountNum) ||
                        underwriterCommissionAmountNum < 0)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: 'underwriterCommissionAmount must be a non-negative number',
                    });
                }
                data.underwriterCommissionAmount = underwriterCommissionAmountNum;
            }

            if (brokerCommissionAmount !== undefined) {
                const brokerCommissionAmountNum =
                    brokerCommissionAmount === '' || brokerCommissionAmount === null
                        ? null
                        : typeof brokerCommissionAmount === 'number'
                          ? brokerCommissionAmount
                          : parseFloat(
                                String(brokerCommissionAmount).replace(/[^0-9.-]+/g, ''),
                            );
                if (
                    brokerCommissionAmountNum !== null &&
                    (Number.isNaN(brokerCommissionAmountNum) ||
                        brokerCommissionAmountNum < 0)
                ) {
                    return res.status(400).json({
                        success: false,
                        message: 'brokerCommissionAmount must be a non-negative number',
                    });
                }
                data.brokerCommissionAmount = brokerCommissionAmountNum;
            }

            if (brokerName !== undefined) {
                const trimmedBrokerName = String(brokerName ?? '').trim();
                data.brokerName = trimmedBrokerName.length > 0 ? trimmedBrokerName : null;
            }

            if (underwriterCommissionName !== undefined) {
                const trimmedUnderwriterCommissionName = String(
                    underwriterCommissionName ?? '',
                ).trim();
                data.underwriterCommissionName =
                    trimmedUnderwriterCommissionName.length > 0
                        ? trimmedUnderwriterCommissionName
                        : null;
            }

            if (category !== undefined) {
                // Payment deal tag (Delinquent, Needs attention, collections labels, etc.).
                if (category === null) {
                    data.category = null;
                } else {
                    const trimmedCategory = String(category).trim();
                    data.category = trimmedCategory.length > 0 ? trimmedCategory : null;
                }
            }

            if (isoQueryResolved !== undefined) {
                const roleUpper = String(authUser?.role || '')
                    .toUpperCase()
                    .replace(/-/g, '_');
                const canResolveIsoQuery = [
                    'UNDERWRITER',
                    'SUPER_ADMIN',
                    'ADMIN',
                    'OPERATIONS',
                ].includes(roleUpper);
                if (!canResolveIsoQuery) {
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to update ISO query resolution.',
                    });
                }
                const resolved = isoQueryResolved === true;
                if (resolved) {
                    const isoCommentCount = await prisma.comment.count({
                        where: {
                            applicationId: application.id,
                            type: 'ISO Comment',
                            isDeleted: false,
                        },
                    });
                    if (isoCommentCount === 0) {
                        return res.status(400).json({
                            success: false,
                            message:
                                'Cannot mark ISO query as resolved without an ISO comment on this application.',
                        });
                    }
                }
                data.isoQueryResolved = resolved;
            }

            if (Object.keys(data).length === 0) {
                const fromQueue = currentQueue !== undefined ? String(currentQueue) : '';
                if (fromQueue === 'Disbursement') {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot move to Disbursement from queue "${application.currentQueue}".`,
                    });
                }
                if (fromQueue === 'Funded') {
                    return res.status(400).json({
                        success: false,
                        message: `Cannot mark as Funded unless the application is in Disbursement (current queue: "${application.currentQueue}").`,
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: 'No valid fields to update.',
                });
            }

            if (data.currentQueue !== undefined) {
                const uwClaimPatch = patchClearUnderwriterClaimIfQueueChanged(
                    application.currentQueue,
                    data.currentQueue,
                );
                if (uwClaimPatch) {
                    Object.assign(data, uwClaimPatch);
                }
            }

            const authUserForUpdate = getAuthenticatedUser(req);
            const resolvedNextQueue =
                data.currentQueue !== undefined
                    ? String(data.currentQueue)
                    : String(application.currentQueue || '');
            const resolvedNextState =
                data.currentState !== undefined
                    ? String(data.currentState)
                    : String(application.currentState || '');
            if (shouldRecordUnderwriterApproval(resolvedNextQueue, resolvedNextState)) {
                Object.assign(
                    data,
                    patchRecordUnderwriterApproval(authUserForUpdate, application),
                );
            }

            if (data.currentQueue !== undefined) {
                const scrubberPatch = patchRecordScrubberClaimOnAdvance(
                    authUserForUpdate,
                    application,
                    application.currentQueue,
                    resolvedNextQueue,
                );
                if (scrubberPatch) {
                    Object.assign(data, scrubberPatch);
                }
            }

            const previousQueue = application.currentQueue;
            const previousState = application.currentState;
            const statusNorm = status !== undefined ? String(status).trim().toLowerCase() : '';
            const statusSentToFu =
                statusNorm === 'sent to final scrubbing' || statusNorm === 'sent to underwriter';

            const updatedRecord = await prisma.application.update({
                where: whereClause,
                data,
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    files: true,
                    claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                },
            });

            const routedUnderwriterId = await routeApplicationIfInUnderwriterQueue(updatedRecord);
            if (routedUnderwriterId) {
                updatedRecord.assignedUnderwriterId = routedUnderwriterId;
            }

            const updatedApplication = mapApplicationToApi(updatedRecord);

            if (
                data.currentQueue !== undefined ||
                data.currentState !== undefined ||
                status !== undefined
            ) {
                const authUserForNotif = getAuthenticatedUser(req);
                scheduleApplicationStageNotification({
                    application: updatedRecord as any,
                    previousQueue,
                    previousState,
                    actorId: authUserForNotif?.id || null,
                    actorName: (req as any).user?.name || '',
                    actorRole: authUserForNotif?.role || null,
                    transitionAction: statusSentToFu ? 'SEND_TO_FINAL_UNDERWRITER' : 'QUEUE_CHANGED',
                });
            }

            try {
                await recordApplicationUpdateActivityLog({
                    req,
                    before: application as any,
                    after: updatedRecord as any,
                    user: authUserForUpdate,
                    actorName: (req as any).user?.name || '',
                });
            } catch (logError) {
                console.error('Failed to create activity log for application update:', logError);
            }

            invalidateAllApplicationStatsCache();
            invalidateDealPortfolioCache();

            return res.status(200).json({
                success: true,
                message: 'Application updated successfully',
                data: updatedApplication,
            });
        } catch (error) {
            console.error('Update application error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Preview scrubber recommend mail recipients + submission attachments
    async getScrubberRecommendationMailPreview(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const applicationStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationStr)
                ? { applicationId: Number(applicationStr) }
                : { id: applicationStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser);
            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }
            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const preview = await previewScrubberRecommendationMailRecipients(application.id);
            if (!preview) {
                return res.status(404).json({
                    success: false,
                    message: 'Could not resolve scrubber mail preview',
                });
            }

            return res.status(200).json({ success: true, data: preview });
        } catch (error) {
            console.error('Scrubber recommendation mail preview error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /** From / Cc on the inbound Gmail that created this deal (overview Linked ISO). */
    async getSubmissionMailParticipants(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const applicationStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationStr)
                ? { applicationId: Number(applicationStr) }
                : { id: applicationStr };

            const { application, forbidden } = await getApplicationForUser(
                whereClause,
                authUser,
                { client: { select: { notes: true } } },
            );
            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }
            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const participants = await getApplicationSubmissionMailParticipants({
                note: application.note,
                createdById: application.createdById,
                client: (application as { client?: { notes?: string | null } | null }).client,
            });

            return res.status(200).json({ success: true, data: participants });
        } catch (error) {
            console.error('Submission mail participants error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update application queue
    async updateQueue(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { currentQueue } = req.body;

            const validQueues = [
                'New',
                'Review',
                'Underwriting',
                'Scrubbing',
                'Final Review',
                'Final Underwriter',
                'Underwriter',
                'Underwriter Approved',
                'Final Approval',
                'Approval Sent',
                'ISO Approved',
                'Approved',
                'Contract Pending',
                'Contract_Pending',
                'Declined',
                'On Hold',
                'Contracted',
                'Contract Out',
                'Contracts Out',
                'Agent',
                'Final',
                'Funding Call',
                'Disbursment',
                'Funded',
                'fake Application',
                'Fake Application',
                'Not A Application',
                'Old Not Scrubbed',
            ];
            if (!currentQueue || !validQueues.includes(currentQueue)) {
                return res.status(400).json({
                    success: false,
                    message: `Valid queue is required (${validQueues.join(', ')})`,
                });
            }

            const authUser = getAuthenticatedUser(req);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(id)
                ? { applicationId: Number(id) }
                : { id };

            const { application: existingApplication, forbidden } = await getApplicationForUser(
                whereClause,
                authUser
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!existingApplication) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, existingApplication)) {
                return;
            }

            // Scrubber / underwriter approval (or Recommend Approval) needs an offer.
            if (
                isDecisionQueueMove(
                    currentQueue,
                    (req.body as { scrubberRecommendation?: unknown })?.scrubberRecommendation,
                ) &&
                (await blockIfNoOffer(res, authUser?.role, existingApplication.id))
            ) {
                return;
            }

            const previousQueue = existingApplication.currentQueue;
            const roleUpper = String((req as any).user?.role || '').toUpperCase();
            const transition = resolveWorkflowQueueTransition(currentQueue, roleUpper);

            const updateData: Prisma.ApplicationUpdateInput = {
                currentQueue: transition.queue,
            };
            if (transition.state) {
                updateData.currentState = transition.state;
            }
            // Scrubber's recommendation captured on the compliance-check modal
            // ("Recommend Approval" / "Recommend Decline"). Persisted alongside the
            // queue advance so the ops list "Scrubber Request" column can show it.
            const rawScrubberRecommendation = (req.body as { scrubberRecommendation?: unknown })
                ?.scrubberRecommendation;
            if (rawScrubberRecommendation != null) {
                const recommendation = String(rawScrubberRecommendation).trim();
                const validRecommendations = ['Recommend Approval', 'Recommend Decline'];
                if (recommendation && validRecommendations.includes(recommendation)) {
                    updateData.scrubberRecommendation = recommendation;
                }
                // Scrubber decline reasons ride on a note marker line so Super Admin's
                // decline modal can preselect them (format read by the frontend).
                const rawReasons = (req.body as { declineReasons?: unknown })?.declineReasons;
                // org-admin writes the note marker itself and sends no reasons — leave its note alone.
                if (recommendation === 'Recommend Decline' && Array.isArray(rawReasons)) {
                    const reasons = Array.isArray(rawReasons)
                        ? rawReasons.map((r) => String(r).trim()).filter(Boolean)
                        : [];
                    const marker = 'SCRUBBER_DECLINE_REASONS:';
                    const keptLines = String(existingApplication.note ?? '')
                        .split('\n')
                        .filter((line) => !line.trim().startsWith(marker));
                    if (reasons.length) keptLines.push(`${marker}${reasons.join('|||')}`);
                    updateData.note = keptLines.join('\n').trim();
                }
                // Super Admin approving a scrubber decline: the old decline reasons no longer apply.
                if (recommendation === 'Recommend Approval') {
                    const marker = 'SCRUBBER_DECLINE_REASONS:';
                    const noteLines = String(existingApplication.note ?? '').split('\n');
                    if (noteLines.some((line) => line.trim().startsWith(marker))) {
                        updateData.note = noteLines
                            .filter((line) => !line.trim().startsWith(marker))
                            .join('\n')
                            .trim();
                    }
                }
            }
            // Scrubber Recommend Decline never enters the Underwriter queue: it waits for
            // Super Admin as "Decline by Scrubber" (Declined queue, no ISO mail).
            const isScrubberDeclineHold = updateData.scrubberRecommendation === 'Recommend Decline';

            const parseCcEmailsFromBody = (): string[] => {
                const ccEmails = (req.body as { ccEmails?: unknown })?.ccEmails;
                if (Array.isArray(ccEmails)) {
                    return ccEmails.map((e: unknown) => String(e || '').trim()).filter(Boolean);
                }
                if (typeof ccEmails === 'string' && ccEmails.trim()) {
                    return ccEmails
                        .split(/[,;]+/)
                        .map((e) => e.trim())
                        .filter(Boolean);
                }
                return [];
            };
            const parseToEmailsFromBody = (): string[] => {
                const collect = (raw: unknown): string[] => {
                    if (Array.isArray(raw)) {
                        return raw.map((e: unknown) => String(e || '').trim()).filter(Boolean);
                    }
                    if (typeof raw === 'string' && raw.trim()) {
                        const trimmed = raw.trim();
                        if (trimmed.startsWith('[')) {
                            try {
                                const parsed = JSON.parse(trimmed) as unknown;
                                if (Array.isArray(parsed)) return collect(parsed);
                            } catch {
                                /* fall through to delimiter split */
                            }
                        }
                        return trimmed
                            .split(/[,;]+/)
                            .map((e) => e.trim())
                            .filter(Boolean);
                    }
                    return [];
                };
                const fromBody = collect((req.body as { toEmails?: unknown })?.toEmails);
                if (fromBody.length) return fromBody;
                const headerRaw =
                    req.headers['x-scrubber-uw-to'] ??
                    req.headers['X-Scrubber-Uw-To'];
                return collect(headerRaw);
            };
            const queueMailCcEmails = parseCcEmailsFromBody();
            const queueMailToEmails = parseToEmailsFromBody();
            const queueMailExplicitTo =
                String(
                    (req.body as { uwToMode?: unknown })?.uwToMode ||
                        req.headers['x-scrubber-uw-to-mode'] ||
                        req.headers['X-Scrubber-Uw-To-Mode'] ||
                        '',
                )
                    .trim()
                    .toLowerCase() === 'explicit' ||
                Object.prototype.hasOwnProperty.call(req.body || {}, 'toEmails') ||
                Boolean(
                    req.headers['x-scrubber-uw-to'] ||
                        req.headers['X-Scrubber-Uw-To'],
                );
            const queueMailIsoEmail = String(
                (req.body as { isoEmail?: unknown })?.isoEmail || '',
            ).trim();
            const claimClear = patchClearUnderwriterClaimIfQueueChanged(previousQueue, transition.queue);
            if (claimClear) {
                Object.assign(updateData, claimClear);
            }
            if (
                transition.action === 'APPROVED' ||
                shouldRecordUnderwriterApproval(transition.queue, transition.state)
            ) {
                Object.assign(
                    updateData,
                    patchRecordUnderwriterApproval(authUser, existingApplication),
                );
            }
            const scrubberClaimPatch = patchRecordScrubberClaimOnAdvance(
                authUser,
                existingApplication,
                previousQueue,
                transition.queue,
            );
            if (scrubberClaimPatch) {
                Object.assign(updateData, scrubberClaimPatch);
            }

            // Scrubber recommend-to-underwriter must always credit this scrubber so My Deals works
            // even if the deal was advanced without a prior claim stamp.
            if (
                transition.action === 'SEND_TO_FINAL_UNDERWRITER' &&
                roleUpper === 'SCRUBBING' &&
                authUser?.id
            ) {
                const existingClaim = String(existingApplication.claimedByUnderwriterId ?? '').trim();
                if (!existingClaim || existingClaim === authUser.id) {
                    updateData.claimedByUnderwriter = { connect: { id: authUser.id } };
                    if (!existingClaim) {
                        updateData.claimedAt = new Date();
                    }
                }
            }

            // Scrubber resending a deal the Underwriter returned for correction:
            // clear the return stamps and route it back to that same underwriter.
            const returnedAtBeforeUpdate = (
                existingApplication as { returnedToScrubberAt?: Date | null }
            ).returnedToScrubberAt;
            const returnedByUnderwriterIdBeforeUpdate = String(
                (existingApplication as { returnedByUnderwriterId?: string | null })
                    .returnedByUnderwriterId ?? '',
            ).trim();
            // Any actor may resend the corrected deal (a Super Admin often does it on
            // the scrubber's behalf), so this is not gated on the SCRUBBING role.
            const isCorrectionResend =
                Boolean(returnedAtBeforeUpdate) &&
                transition.action === 'SEND_TO_FINAL_UNDERWRITER' &&
                !isScrubberDeclineHold;
            let correctionUnderwriter: {
                id: string;
                firstName: string | null;
                lastName: string | null;
                email: string | null;
            } | null = null;
            if (isCorrectionResend) {
                if (returnedByUnderwriterIdBeforeUpdate) {
                    correctionUnderwriter = await prisma.user.findFirst({
                        where: {
                            id: returnedByUnderwriterIdBeforeUpdate,
                            isActive: true,
                            role: 'UNDERWRITER',
                        },
                        select: { id: true, firstName: true, lastName: true, email: true },
                    });
                }
                updateData.returnedToScrubberAt = null;
                updateData.returnedToScrubber = { disconnect: true };
                updateData.returnedByUnderwriter = { disconnect: true };
                updateData.returnReasons = null;
                updateData.returnNote = null;
                if (correctionUnderwriter) {
                    updateData.assignedUnderwriter = {
                        connect: { id: correctionUnderwriter.id },
                    };
                }
            }

            // Only one underwriter on the book: a deal sent on to the Underwriter
            // queue is claimed for that underwriter straight away, so they never
            // have to claim it by hand. With two or more, the deal waits in the
            // queue unclaimed and must be claimed before anyone can act on it.
            let autoClaimedUnderwriterId: string | null = null;
            if (
                transition.action === 'SEND_TO_FINAL_UNDERWRITER' &&
                normalizeQueueToken(transition.queue) === 'UNDERWRITER' &&
                !isScrubberDeclineHold &&
                !updateData.assignedUnderwriter &&
                !String(
                    (existingApplication as { assignedUnderwriterId?: string | null })
                        .assignedUnderwriterId ?? '',
                ).trim()
            ) {
                const activeUnderwriters = await prisma.user.findMany({
                    where: { role: 'UNDERWRITER', isActive: true },
                    select: { id: true },
                    take: 2,
                });
                if (activeUnderwriters.length === 1) {
                    autoClaimedUnderwriterId = activeUnderwriters[0].id;
                    updateData.assignedUnderwriter = {
                        connect: { id: autoClaimedUnderwriterId },
                    };
                }
            }

            // Final approval: Underwriter signs off out of Final Approval G?? either into
            // Contract Pending (Decision Logic path) or Final (Funding Call path).
            const movingToContractPending =
                normalizeQueueToken(transition.queue) === 'CONTRACT_PENDING';
            const movingToFinal = normalizeQueueToken(transition.queue) === 'FINAL';
            const previousWasFinalApproval =
                normalizeQueueToken(previousQueue) === 'FINAL_APPROVAL' ||
                normalizeQueueToken(existingApplication.currentState) === 'FINAL_APPROVAL';
            if (
                (movingToContractPending || movingToFinal) &&
                previousWasFinalApproval &&
                isUnderwriterApproverRole(authUser?.role)
            ) {
                updateData.underwriterAction = UNDERWRITER_ACTION_FINAL_APPROVED;
            }

            // The saved offer's decision outranks the scrubber's recommendation in every
            // "current decision" display, and it defaults to 'approved' — so a scrubber
            // decline on a deal with an offer showed as Approved. Keep the two in step.
            if (updateData.scrubberRecommendation) {
                // A new scrubber recommendation starts a new round: drop the previous round's
                // underwriter decision, which otherwise outranks it (a fresh scrubber decline
                // kept showing "Approved").
                updateData.underwriterAction = null;
                const isDecline = updateData.scrubberRecommendation === 'Recommend Decline';
                const rawReasons = (req.body as { declineReasons?: unknown })?.declineReasons;
                const reasons = Array.isArray(rawReasons)
                    ? rawReasons.map((r) => String(r).trim()).filter(Boolean)
                    : [];
                await prisma.offerDecision.updateMany({
                    where: { applicationId: existingApplication.id },
                    data: isDecline
                        ? {
                              decision: 'declined',
                              ...(reasons.length ? { declineReason: reasons.join('; ') } : {}),
                          }
                        : { decision: 'approved', declineReason: null },
                });
            }
            if (isScrubberDeclineHold) {
                updateData.currentQueue = 'Declined';
                updateData.currentState = ApplicationState.CANCELLED;
                updateData.underwriterAction = declineActionForRole('SCRUBBING');
            }

            const applicationRecord = await prisma.application.update({
                where: whereClause,
                data: updateData,
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    files: true,
                    claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                },
            });

            if (autoClaimedUnderwriterId) {
                try {
                    await createApplicationActivityLog({
                        applicationId: applicationRecord.id,
                        user: authUser,
                        req,
                        actionType: 'UNDERWRITER_CLAIMED',
                        actionDescription:
                            'Claimed automatically for the only underwriter on this book.',
                        previousStatus: `${previousQueue}`,
                        currentStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                        metadata: { assignedUnderwriterId: autoClaimedUnderwriterId, autoClaimed: true },
                    });
                } catch (logErr) {
                    console.error('Failed to log underwriter auto-claim:', logErr);
                }
            }

            const routedUnderwriterId =
                await routeApplicationIfInUnderwriterQueue(applicationRecord);
            if (routedUnderwriterId) {
                applicationRecord.assignedUnderwriterId = routedUnderwriterId;
            }

            const application = mapApplicationToApi(applicationRecord);

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            // Best-effort activity log for queue change
            try {
                const authUserForLog = getAuthenticatedUser(req);
                const roleLabel = authUserForLog?.role
                    ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                    : 'User';
                const actorName = (req as any).user?.name || '';

                let actionType: ApplicationActivityActionType = 'QUEUE_CHANGED';
                let description = `${roleLabel} ${actorName}`.trim() + ` moved application from ${previousQueue} to ${currentQueue}.`;

                const upperQueue = normalizeQueueToken(applicationRecord.currentQueue);
                const roleUpper = String(authUserForLog?.role || '').toUpperCase();

                if (transition.action === 'SEND_TO_UNDERWRITER' && roleUpper === 'AGENT') {
                    actionType = 'SEND_TO_UNDERWRITER';
                    description = `${roleLabel} ${actorName}`.trim() + ' sent the application to Scrubbing.';
                } else if (isScrubberDeclineHold) {
                    description =
                        `${roleLabel} ${actorName}`.trim() +
                        ' recommended a decline (Decline by Scrubber, awaiting Super Admin).';
                } else if (transition.action === 'SEND_TO_FINAL_UNDERWRITER' && roleUpper === 'SCRUBBING') {
                    actionType = 'SEND_TO_FINAL_UNDERWRITER';
                    description = `${roleLabel} ${actorName}`.trim() + ' sent a recommend request for approval.';
                } else if (transition.action === 'APPROVED') {
                    actionType = 'APPROVED';
                    description = `${roleLabel} ${actorName}`.trim() + ' approved the application.';
                }

                await createApplicationActivityLog({
                    applicationId: applicationRecord.id,
                    user: authUserForLog,
                    req,
                    actionType,
                    actionDescription: description,
                    previousStatus: `${previousQueue} / ${existingApplication.currentState}`,
                    currentStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                    metadata: {
                        previousQueue,
                        newQueue: applicationRecord.currentQueue,
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for queue update:', logError);
            }

            // Scrubber recommend approval/decline → notify designated UW(s) only (fresh email)
            const savedScrubberRecommendation = String(
                (applicationRecord as { scrubberRecommendation?: string | null })
                    .scrubberRecommendation || '',
            ).trim();
            if (
                (savedScrubberRecommendation === 'Recommend Approval' ||
                    savedScrubberRecommendation === 'Recommend Decline') &&
                String(rawScrubberRecommendation || '').trim() === savedScrubberRecommendation
            ) {
                const correctionToEmail = String(correctionUnderwriter?.email || '').trim();
                // Scrubbing preview PDF from the Recommend modal (base64), sent as Breakdown.pdf.
                const breakdownPdf = (() => {
                    const raw = String((req.body as { breakdownPdf?: unknown })?.breakdownPdf ?? '')
                        .replace(/^data:[^,]*,/, '')
                        .trim();
                    if (!raw) return undefined;
                    const buffer = Buffer.from(raw, 'base64');
                    // Must be a PDF and stay well under mail attachment limits.
                    return buffer.subarray(0, 5).toString() === '%PDF-' && buffer.length <= 15 * 1024 * 1024
                        ? buffer
                        : undefined;
                })();
                void sendScrubberRecommendationUwThreadEmail({
                    applicationId: applicationRecord.id,
                    breakdownPdf,
                    recommendation: savedScrubberRecommendation as
                        | 'Recommend Approval'
                        | 'Recommend Decline',
                    ccEmails: queueMailCcEmails,
                    // A corrected deal always goes back to the underwriter who returned it.
                    toEmails: correctionToEmail ? [correctionToEmail] : queueMailToEmails,
                    explicitToEmails: correctionToEmail ? true : queueMailExplicitTo,
                    isCorrection: isCorrectionResend,
                    correctionNote: isCorrectionResend
                        ? String(
                              (existingApplication as { returnNote?: string | null }).returnNote ??
                                  '',
                          ).trim() || null
                        : null,
                }).catch((err) => {
                    console.error(
                        '[scrubber-uw-mail] failed after queue update:',
                        applicationRecord.id,
                        err,
                    );
                });
            }

            // Underwriter approve → internal mail to the submissions inbox (CC Mark@) for
            // Super Admin. The ISO is emailed only when Super Admin approves.
            if (transition.action === 'APPROVED') {
                const approverRole = String(authUser?.role || '')
                    .toUpperCase()
                    .replace(/-/g, '_');
                if (approverRole === 'UNDERWRITER' || approverRole === 'FINALUNDERWRITER') {
                    void sendScrubberRecommendationUwThreadEmail({
                        applicationId: applicationRecord.id,
                        recommendation: 'Recommend Approval',
                        stage: 'underwriter',
                        deciderName: String((req as any).user?.name || '').trim() || null,
                        // To / CC as confirmed in the underwriter's Approve popup.
                        toEmails: queueMailToEmails,
                        ccEmails: queueMailCcEmails,
                    }).catch((err) => {
                        console.error(
                            '[uw-decision-mail] approval mail failed after queue update:',
                            applicationRecord.id,
                            err,
                        );
                    });
                }
            }
            // Stage notifications (all queue transitions + realtime push)
            try {
                const authUserForNotif = getAuthenticatedUser(req);
                scheduleApplicationStageNotification({
                    application: applicationRecord as any,
                    previousQueue,
                    previousState: existingApplication.currentState,
                    actorId: authUserForNotif?.id || null,
                    actorName: (req as any).user?.name || '',
                    actorRole: authUserForNotif?.role || null,
                    transitionAction: transition.action ?? 'QUEUE_CHANGED',
                });

                // Best-effort email when Agent sends to Scrubbing (unchanged behaviour)
                const upperQueue = normalizeQueueToken(applicationRecord.currentQueue);
                const roleUpper = String(authUserForNotif?.role || '').toUpperCase();
                if (upperQueue === 'SCRUBBING' && roleUpper === 'AGENT') {
                    const attributedSenderId = await resolveApplicationAttributedUserId(
                        req,
                        applicationRecord,
                    );
                    const senderId = attributedSenderId ? String(attributedSenderId) : '';
                    const senderName = String((req as any).user?.name || 'Agent').trim() || 'Agent';

                    const clientName =
                        (applicationRecord as any)?.client?.businessName ||
                        `${(applicationRecord as any)?.client?.ownerFirstName || ''} ${(applicationRecord as any)?.client?.ownerLastName || ''}`.trim() ||
                        'Client';
                    const appIdNumber = (applicationRecord as any)?.applicationId ?? '';

                    const underwriters = await prisma.user.findMany({
                        where: { role: 'SCRUBBING', isActive: true },
                        select: { id: true, email: true, firstName: true, lastName: true },
                    });

                    const recipients = underwriters
                        .map((u) => ({
                            id: String(u.id),
                            email: String((u as any).email || ''),
                            name: `${(u as any).firstName || ''} ${(u as any).lastName || ''}`.trim(),
                        }))
                        .filter((u) => u.id && u.id !== senderId);

                    const baseUrl = resolveCrmFrontendBaseUrl();
                    const appRouteId =
                        (applicationRecord as any)?.applicationId != null &&
                            String((applicationRecord as any).applicationId).trim() !== ''
                            ? String((applicationRecord as any).applicationId)
                            : String((applicationRecord as any)?.id || applicationRecord.id);
                    const viewApplicationUrl = baseUrl
                        ? `${baseUrl.replace(/\/$/, '')}/application-details/${appRouteId}`
                        : undefined;

                    setImmediate(() => {
                        void Promise.allSettled(
                            recipients
                                .filter((r) => r.email)
                                .map((r) =>
                                    sendUnderwriterNewApplicationEmail({
                                        applicationUuid: applicationRecord.id,
                                        to: r.email,
                                        underwriterName: r.name || r.email,
                                        agentName: senderName,
                                        applicationNumber: appIdNumber,
                                        clientName,
                                        viewApplicationUrl,
                                    })
                                ),
                        );
                    });
                }
            } catch (notifError) {
                console.error('Failed to create stage notification for queue update:', notifError);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application queue updated successfully',
                data: application,
            });
        } catch (error) {
            console.error('Update application queue error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async claimUnderwriterDeal(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role ? String(authUser.role).toUpperCase().replace(/-/g, '_') : '';
            if (roleUpper !== 'SCRUBBING') {
                return res.status(403).json({
                    success: false,
                    message: 'Only underwriters can claim deals',
                });
            }
            const userId = authUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const claimInclude: Prisma.ApplicationInclude = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, claimInclude);

            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            if (normalizeQueueToken(application.currentQueue) !== 'SCRUBBING') {
                return res.status(400).json({
                    success: false,
                    message: 'Only applications in the Scrubbing queue can be claimed',
                });
            }

            const appRow = application as typeof application & {
                claimedByUnderwriterId?: string | null;
                assignedUnderwriterId?: string | null;
            };

            if (appRow.assignedUnderwriterId) {
                return res.status(409).json({
                    success: false,
                    message: 'This deal was claimed by an underwriter',
                });
            }

            if (appRow.claimedByUnderwriterId && appRow.claimedByUnderwriterId === userId) {
                return res.status(200).json({
                    success: true,
                    message: 'Already claimed',
                    data: mapApplicationToApi(application),
                });
            }

            const updated = await prisma.application.updateMany({
                where: {
                    id: application.id,
                    currentQueue: WORKFLOW_QUEUES.SCRUBBING,
                    claimedByUnderwriterId: null,
                    assignedUnderwriterId: null,
                },
                data: {
                    claimedByUnderwriterId: userId,
                    claimedAt: new Date(),
                },
            });

            if (updated.count === 0) {
                const refreshedLost = await prisma.application.findUnique({
                    where: { id: application.id },
                    include: claimInclude,
                });
                if (refreshedLost?.claimedByUnderwriterId === userId) {
                    return res.status(200).json({
                        success: true,
                        message: 'Already claimed',
                        data: mapApplicationToApi(refreshedLost),
                    });
                }
                return res.status(409).json({
                    success: false,
                    message: 'This deal was claimed by another scrubbing',
                });
            }

            const refreshed = await prisma.application.findUnique({
                where: { id: application.id },
                include: claimInclude,
            });
            if (!refreshed) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            try {
                const actorName = String((req as any).user?.name || '').trim() || 'Scrubbing';
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'UNDERWRITER_CLAIMED',
                    actionDescription: `${actorName} claimed this deal for underwriting.`,
                    previousStatus: `${application.currentQueue} / ${application.currentState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: { claimedByUnderwriterId: userId },
                });
            } catch (logErr) {
                console.error('Failed to log scrubbing claim:', logErr);
            }

            return res.status(200).json({
                success: true,
                message: 'Deal claimed',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Claim scrubbing deal error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async claimFinalUnderwriterDeal(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role ? String(authUser.role).toUpperCase().replace(/-/g, '_') : '';
            if (roleUpper !== 'UNDERWRITER') {
                return res.status(403).json({
                    success: false,
                    message: 'Only underwriters can claim deals',
                });
            }
            const userId = authUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const claimInclude: Prisma.ApplicationInclude = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, claimInclude);

            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            const queueToken = normalizeQueueToken(application.currentQueue);
            if (queueToken !== 'UNDERWRITER' && queueToken !== 'SCRUBBING') {
                return res.status(400).json({
                    success: false,
                    message:
                        'Only applications in the Scrubbing or Underwriter queue can be claimed',
                });
            }

            const appRow = application as typeof application & {
                assignedUnderwriterId?: string | null;
                claimedByUnderwriterId?: string | null;
            };

            if (appRow.assignedUnderwriterId && appRow.assignedUnderwriterId === userId) {
                return res.status(200).json({
                    success: true,
                    message: 'Already claimed',
                    data: mapApplicationToApi(application),
                });
            }

            if (queueToken === 'SCRUBBING' && appRow.claimedByUnderwriterId) {
                return res.status(409).json({
                    success: false,
                    message:
                        'This deal is being scrubbed and cannot be claimed until it is sent on',
                });
            }

            const claimingFromScrubbing = queueToken === 'SCRUBBING';
            const updated = await prisma.application.updateMany({
                where: claimingFromScrubbing
                    ? {
                          id: application.id,
                          currentQueue: WORKFLOW_QUEUES.SCRUBBING,
                          assignedUnderwriterId: null,
                          claimedByUnderwriterId: null,
                      }
                    : {
                          id: application.id,
                          currentQueue: WORKFLOW_QUEUES.UNDERWRITER,
                          assignedUnderwriterId: null,
                      },
                data: claimingFromScrubbing
                    ? {
                          assignedUnderwriterId: userId,
                          currentQueue: WORKFLOW_QUEUES.UNDERWRITER,
                          currentState: ApplicationState.IN_PROGRESS,
                      }
                    : {
                          assignedUnderwriterId: userId,
                      },
            });

            if (updated.count === 0) {
                const refreshedLost = await prisma.application.findUnique({
                    where: { id: application.id },
                    include: claimInclude,
                });
                if (refreshedLost?.assignedUnderwriterId === userId) {
                    return res.status(200).json({
                        success: true,
                        message: 'Already claimed',
                        data: mapApplicationToApi(refreshedLost),
                    });
                }
                if (refreshedLost?.claimedByUnderwriterId) {
                    return res.status(409).json({
                        success: false,
                        message:
                            'This deal is being scrubbed and cannot be claimed until it is sent on',
                    });
                }
                return res.status(409).json({
                    success: false,
                    message: 'This application was claimed by another underwriter',
                });
            }

            const refreshed = await prisma.application.findUnique({
                where: { id: application.id },
                include: claimInclude,
            });
            if (!refreshed) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            try {
                const actorName = String((req as any).user?.name || '').trim() || 'Underwriter';
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'UNDERWRITER_CLAIMED',
                    actionDescription: `${actorName} claimed this application for review.`,
                    previousStatus: `${application.currentQueue} / ${application.currentState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: { assignedUnderwriterId: userId },
                });
            } catch (logErr) {
                console.error('Failed to log underwriter claim:', logErr);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application claimed',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Claim underwriter deal error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async releaseUnderwriterDeal(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            const allowedRoles = new Set(['ADMIN', 'SUPER_ADMIN']);
            if (!allowedRoles.has(roleUpper)) {
                return res.status(403).json({
                    success: false,
                    message: 'Only admin can take back a deal from Scrubbing',
                });
            }
            const userId = authUser?.id;
            if (!userId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const claimInclude: Prisma.ApplicationInclude = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, claimInclude);

            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            if (normalizeQueueToken(application.currentQueue) !== 'SCRUBBING') {
                return res.status(400).json({
                    success: false,
                    message: 'Only applications in the Scrubbing queue can be released to the queue',
                });
            }

            const appRow = application as typeof application & {
                claimedByUnderwriterId?: string | null;
            };
            const claimedByUnderwriterId = appRow.claimedByUnderwriterId ?? null;
            if (!claimedByUnderwriterId) {
                return res.status(400).json({
                    success: false,
                    message: 'This deal is not currently claimed by an scrubbing',
                });
            }

            await prisma.application.updateMany({
                where: {
                    id: application.id,
                    currentQueue: WORKFLOW_QUEUES.SCRUBBING,
                    claimedByUnderwriterId,
                },
                data: {
                    claimedByUnderwriterId: null,
                    claimedAt: null,
                },
            });

            const refreshed = await prisma.application.findUnique({
                where: { id: application.id },
                include: claimInclude,
            });
            if (!refreshed) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            try {
                const actorName = String((req as any).user?.name || '').trim() || 'Scrubbing';
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'UNDERWRITER_RELEASED',
                    actionDescription: `${actorName} returned this deal to the scrubbing queue.`,
                    previousStatus: `${application.currentQueue} / ${application.currentState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                });
            } catch (logErr) {
                console.error('Failed to log scrubbing release:', logErr);
            }

            return res.status(200).json({
                success: true,
                message: 'Claim released',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Release scrubbing deal error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /** Super Admin / Scrubbing: assign application to a specific Underwriter and notify them in-app. */
    async assignApplicationToUnderwriter(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { underwriterId } = req.body ?? {};
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            const canAssign =
                roleUpper === 'SUPER_ADMIN' ||
                roleUpper === 'SUPERADMIN' ||
                roleUpper === 'SCRUBBING';
            if (!canAssign) {
                return res.status(403).json({
                    success: false,
                    message: 'You are not allowed to assign applications to an Underwriter',
                });
            }
            const actorId = authUser?.id;
            if (!actorId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }
            const targetUnderwriterId = String(underwriterId ?? '').trim();
            const underwriterEmail = String(
                (req.body as { underwriterEmail?: unknown } | undefined)
                    ?.underwriterEmail ?? '',
            )
                .trim()
                .toLowerCase();
            if (!targetUnderwriterId && !underwriterEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Underwriter is required',
                });
            }

            let targetUser = targetUnderwriterId
                ? await prisma.user.findFirst({
                      where: {
                          id: targetUnderwriterId,
                          role: 'UNDERWRITER',
                          isActive: true,
                      },
                      select: { id: true, firstName: true, lastName: true, email: true },
                  })
                : null;
            // Super Admin panel may send its own user UUID; fall back to email.
            if (!targetUser && underwriterEmail) {
                targetUser = await prisma.user.findFirst({
                    where: {
                        email: underwriterEmail,
                        role: 'UNDERWRITER',
                        isActive: true,
                    },
                    select: { id: true, firstName: true, lastName: true, email: true },
                });
            }
            if (!targetUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected Underwriter was not found or is inactive',
                });
            }
            const resolvedUnderwriterId = targetUser.id;

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const include = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            } satisfies Prisma.ApplicationInclude;

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, include);

            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            const previousQueue = application.currentQueue;
            const previousState = application.currentState;
            const actorName = String((req as any).user?.name || '').trim() || 'Admin';
            const targetName =
                `${targetUser.firstName || ''} ${targetUser.lastName || ''}`.trim() ||
                targetUser.email ||
                'Underwriter';

            const refreshed = await prisma.application.update({
                where: { id: application.id },
                data: {
                    currentQueue: WORKFLOW_QUEUES.UNDERWRITER,
                    currentState: 'Sent to Underwriter',
                    assignedUnderwriter: { connect: { id: resolvedUnderwriterId } },
                },
                include,
            });

            try {
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'QUEUE_CHANGED',
                    actionDescription: `${actorName} assigned application to Underwriter ${targetName}.`,
                    previousStatus: `${previousQueue} / ${previousState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: { assignedUnderwriterId: resolvedUnderwriterId },
                });
            } catch (logErr) {
                console.error('Failed to log underwriter assignment:', logErr);
            }

            try {
                await notifyAdminAssignedApplicationToUnderwriter({
                    application: refreshed as any,
                    recipientId: resolvedUnderwriterId,
                    actorId: String(actorId),
                    actorName,
                });
            } catch (notifErr) {
                console.error('Failed to notify assigned Underwriter:', notifErr);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application assigned to Underwriter',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Assign application to Underwriter error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /** Super Admin / Operations: send an Underwriter Approved deal back to the approving underwriter for final approval. */
    async sendForFinalUnderwriterApproval(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const sourceRaw = (req.body as { source?: unknown } | undefined)?.source;
            const finalApprovalSource =
                sourceRaw === 'Decision Logic' || sourceRaw === 'Funding Call'
                    ? sourceRaw
                    : null;
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            if (
                roleUpper !== 'SUPER_ADMIN' &&
                roleUpper !== 'SUPERADMIN' &&
                roleUpper !== 'OPERATIONS'
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Only Super Admin or Operations can send applications for final Underwriter approval',
                });
            }
            const actorId = authUser?.id;
            if (!actorId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const include = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            } satisfies Prisma.ApplicationInclude;

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, include);

            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            const target = await resolveFinalApprovalUnderwriterTarget(prisma, {
                approvedByUnderwriterId: application.approvedByUnderwriterId,
                assignedUnderwriterId: application.assignedUnderwriterId,
                claimedByUnderwriterId: application.claimedByUnderwriterId,
            });
            if (!target) {
                return res.status(400).json({
                    success: false,
                    message:
                        'No active Underwriter is linked to this application. Assign or record an Underwriter approval before sending for final approval.',
                });
            }
            const approvingUnderwriterId = target.userId;

            const previousQueue = application.currentQueue;
            const previousState = application.currentState;
            const actorName = String((req as any).user?.name || '').trim() || 'Admin';
            const targetName =
                `${target.firstName || ''} ${target.lastName || ''}`.trim() ||
                target.email ||
                'Underwriter';

            const refreshed = await prisma.application.update({
                where: { id: application.id },
                data: {
                    currentQueue: FINAL_APPROVAL_QUEUE,
                    currentState: FINAL_APPROVAL_STATE,
                    assignedUnderwriter: { connect: { id: approvingUnderwriterId } },
                    ...(finalApprovalSource ? { finalApprovalSource } : {}),
                },
                include,
            });

            try {
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'QUEUE_CHANGED',
                    actionDescription: `${actorName} sent application to ${targetName} for final Underwriter approval.`,
                    previousStatus: `${previousQueue} / ${previousState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: {
                        assignedUnderwriterId: approvingUnderwriterId,
                        ...(finalApprovalSource ? { finalApprovalSource } : {}),
                    },
                });
            } catch (logErr) {
                console.error('Failed to log final Underwriter approval send:', logErr);
            }

            try {
                await notifyAdminAssignedApplicationToUnderwriter({
                    application: refreshed as any,
                    recipientId: approvingUnderwriterId,
                    actorId: String(actorId),
                    actorName,
                });
            } catch (notifErr) {
                console.error('Failed to notify approving Underwriter:', notifErr);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: `Application sent to ${targetName} for final approval`,
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Send for final Underwriter approval error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update application state
    async updateState(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { currentState } = req.body;

            const trimmedState = String(currentState ?? '').trim();
            const validStates = [
                ...Object.keys(applicationStateApiToPrisma),
                ...Object.keys(verbatimApplicationStateByInput),
            ];
            const verbatimStored = verbatimApplicationStateByInput[trimmedState];
            const mappedState = verbatimStored ?? toPrismaApplicationState(currentState);
            if (!mappedState) {
                return res.status(400).json({
                    success: false,
                    message: `Valid state is required (${validStates.join(', ')})`,
                });
            }

            const authUser = getAuthenticatedUser(req);
            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const { application: existingApplication, forbidden } = await getApplicationForUser(whereClause, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!existingApplication) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, existingApplication)) {
                return;
            }

            const previousState = existingApplication.currentState;

            const nextState = verbatimStored ?? mappedState;
            const applicationRecord = await prisma.application.update({
                where: whereClause,
                data: { currentState: nextState },
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    files: true,
                },
            });

            const application = mapApplicationToApi(applicationRecord);

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            // Best-effort activity log for state change
            try {
                const authUserForLog = getAuthenticatedUser(req);
                const roleLabel = authUserForLog?.role
                    ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                    : 'User';
                const actorName = (req as any).user?.name || '';

                await createApplicationActivityLog({
                    applicationId: applicationRecord.id,
                    user: authUserForLog,
                    req,
                    actionType: 'STATUS_CHANGED' as ApplicationActivityActionType,
                    actionDescription:
                        `${roleLabel} ${actorName}`.trim() +
                        ` changed application state from ${previousState} to ${currentState}.`,
                    previousStatus: `${applicationRecord.currentQueue} / ${previousState}`,
                    currentStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                    metadata: {
                        previousState,
                        newState: currentState,
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for state update:', logError);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application state updated successfully',
                data: application,
            });
        } catch (error) {
            console.error('Update application state error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Update document checklist (checked document labels)
    async updateDocumentChecklist(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { checkedLabels } = req.body as { checkedLabels?: string[] };

            const labels = Array.isArray(checkedLabels) ? checkedLabels : [];

            const authUser = getAuthenticatedUser(req);
            const { application: existingApplication, forbidden } = await getApplicationForUser({ id }, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!existingApplication) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, existingApplication)) {
                return;
            }

            const previousQueue = existingApplication.currentQueue;
            const previousState = existingApplication.currentState;

            const applicationRecord = await prisma.application.update({
                where: { id },
                data: { documentChecklistChecked: labels } as any,
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    files: true,
                },
            });

            const application = mapApplicationToApi(applicationRecord);

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            // Best-effort activity log for document checklist update
            try {
                const authUserForLog = getAuthenticatedUser(req);
                const roleLabel = authUserForLog?.role
                    ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                    : 'User';
                const actorName = (req as any).user?.name || '';

                await createApplicationActivityLog({
                    applicationId: applicationRecord.id,
                    user: authUserForLog,
                    req,
                    actionType: 'APPLICATION_UPDATED' as ApplicationActivityActionType,
                    actionDescription:
                        `${roleLabel} ${actorName}`.trim() + ' updated the document checklist.',
                    previousStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                    currentStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                    metadata: {
                        documentChecklistChecked: labels,
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for document checklist update:', logError);
            }

            return res.status(200).json({
                success: true,
                message: 'Document checklist updated',
                data: application,
            });
        } catch (error) {
            console.error('Update document checklist error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Reject/Decline application
    async rejectApplication(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const {
                reason,
                additionalComments,
                emailHtml,
                emailSubject,
                isoEmail: isoEmailOverride,
                ccEmails,
                toEmails: declineToEmails,
            } = req.body;
            const authUser = getAuthenticatedUser(req);
            const currentUserRole = authUser?.role;
            const isFinalUnderwriter = currentUserRole === 'UNDERWRITER';

            if (!reason || reason.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Rejection reason is required',
                });
            }

            const additionalCommentsText = additionalComments && additionalComments.trim() ? additionalComments.trim() : '';
            const fullNote = additionalCommentsText
                ? `${reason.trim()}\n\nAdditional comments: ${additionalCommentsText}`
                : reason.trim();

            const applicationStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationStr)
                ? { applicationId: Number(applicationStr) }
                : { id: applicationStr };

            const { application: existingApplication, forbidden } = await getApplicationForUser(
                whereClause,
                authUser,
                { client: { select: { notes: true } } },
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!existingApplication) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, existingApplication)) {
                return;
            }

            const previousQueue = existingApplication.currentQueue;
            const previousState = existingApplication.currentState;

            const clientBusinessName = String(
                (existingApplication as { client?: { businessName?: string | null } | null })
                    .client?.businessName || '',
            ).trim();
            const properRejectionSubject =
                typeof emailSubject === 'string' && emailSubject.trim()
                    ? emailSubject.trim()
                    : buildApplicationRejectionEmailSubject(clientBusinessName);
            const submissionMailSource = {
                note: existingApplication.note,
                createdById: existingApplication.createdById,
                client: (existingApplication as { client?: { notes?: string | null } | null })
                    .client,
            };
            const emailThreadContext = await resolveApplicationSubmissionThreadContext(
                submissionMailSource,
                properRejectionSubject,
            );

            const storedGmailMessageId = parseGmailMessageIdFromApplicationNote(
                existingApplication.note,
            );
            const declineNote = storedGmailMessageId
                ? `${gmailAutoCreateMessageNote(storedGmailMessageId)}\n${fullNote}`
                : fullNote;
            // Underwriter decline is reviewed by Super Admin: keep the underwriter's reasons
            // on a marker line so the Super Admin decline popup can preselect them.
            const underwriterReasonsMarker = isFinalUnderwriter
                ? `\nUNDERWRITER_DECLINE_REASONS:${reason
                      .trim()
                      .split(/\s*,\s*/)
                      .filter(Boolean)
                      .join('|||')}`
                : '';

            const declineUpdateData: Prisma.ApplicationUpdateInput = {
                currentQueue: 'Declined',
                currentState: ApplicationState.CANCELLED,
                note: `${declineNote}${underwriterReasonsMarker}`,
            };
            const declinedByRoleBody = String(
                (req.body as { declinedByRole?: unknown })?.declinedByRole ?? '',
            ).trim();
            declineUpdateData.underwriterAction = declineActionForRole(
                currentUserRole,
                declinedByRoleBody,
            );

            const applicationRecord = await prisma.application.update({
                where: whereClause,
                data: declineUpdateData,
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    files: true,
                },
            });

            const application = mapApplicationToApi(applicationRecord);

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            // Send notification to Agent and Underwriters (when Underwriter rejects)
            try {
                const appRecord = applicationRecord as any;
                const attributedCreatedById = await resolveApplicationAttributedUserId(
                    req,
                    appRecord,
                );

                const recipientIds = new Set<string>();
                const addIfNotSender = (id: string) => {
                    const sid = String(id);
                    if (sid && sid !== String(attributedCreatedById)) recipientIds.add(sid);
                };
                if (appRecord.referringAgentId) addIfNotSender(appRecord.referringAgentId);
                if (appRecord.salesRepresentativeId) addIfNotSender(appRecord.salesRepresentativeId);
                if (isFinalUnderwriter) {
                    const underwriters = await prisma.user.findMany({
                        where: { role: 'SCRUBBING' },
                        select: { id: true },
                    });
                    underwriters.forEach((u) => addIfNotSender(u.id));
                }

                await notifyApplicationRejected({
                    application: appRecord,
                    actorId: attributedCreatedById,
                    reason: fullNote,
                    extraRecipientIds: Array.from(recipientIds),
                });

                if (recipientIds.size === 0) {
                    console.warn('No recipient found for rejection notification. Application:', appRecord.id);
                }
            } catch (notificationError: any) {
                // Log notification error but don't fail the rejection
                console.error('Failed to send rejection notification:', notificationError);
                console.error('Notification error details:', {
                    message: notificationError?.message,
                    stack: notificationError?.stack
                });
            }

            // Best-effort activity log for rejection (skipped when the new decline template email is audited)
            let rejectionCommunicationLogged = false;
            let rejectionEmailDelivery: {
                sent: boolean;
                emailedTo: string[];
                emailedCc: string[];
                ccErrors: string[];
                sgMessageId?: string;
            } = {
                sent: false,
                emailedTo: [],
                emailedCc: [],
                ccErrors: [],
            };
            const authUserForLog = getAuthenticatedUser(req);
            const roleLabel = authUserForLog?.role
                ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                : 'User';
            const actorName = (req as any).user?.name || '';
            const reasonText = reason.trim();

            const parsedCcEmails = (() => {
                if (Array.isArray(ccEmails)) {
                    return ccEmails.map((e: unknown) => String(e || '').trim()).filter(Boolean);
                }
                if (typeof ccEmails === 'string' && ccEmails.trim()) {
                    return ccEmails
                        .split(/[,;]+/)
                        .map((e) => e.trim())
                        .filter(Boolean);
                }
                return [];
            })();
            console.info('[reject] Decline request recipients', {
                applicationId: existingApplication.id,
                isoEmailOverride: typeof isoEmailOverride === 'string' ? isoEmailOverride.trim() : '',
                ccEmails: parsedCcEmails,
            });

            // Best-effort: notify the linked ISO with the branded decline template.
            try {
                const iso = (applicationRecord as any).iso;
                const isoName = String(iso?.name ?? '').trim();
                const linkedIsoEmail = String(iso?.email ?? '').trim();
                const isoEmailOverrideTrimmed =
                    typeof isoEmailOverride === 'string' ? isoEmailOverride.trim() : '';
                const isoEmail = isoEmailOverrideTrimmed || linkedIsoEmail;
                // To list confirmed in the decline popup (chips); falls back to the single ISO email.
                const isoDeclineToList = (() => {
                    const fromBody = Array.isArray(declineToEmails)
                        ? declineToEmails.map((e: unknown) => String(e || '').trim()).filter(Boolean)
                        : [];
                    const list = fromBody.length ? fromBody : isoEmail ? [isoEmail] : [];
                    return list.filter(
                        (e: string, i: number) =>
                            list.findIndex((x: string) => x.toLowerCase() === e.toLowerCase()) === i,
                    );
                })();
                const isoPrimaryTo = isoDeclineToList[0] || '';
                // The ISO decline copies the submissions inbox too (removable in the popup).
                const emailCcList = [
                    ...parsedCcEmails,
                    ...getSubmissionsInboxEmails().filter((e) => !isDefaultCcRemoved(e)),
                ];
                const uniqueCcList = [...new Set(emailCcList.map((e) => e.toLowerCase()))]
                    .map((lower) => emailCcList.find((e) => e.toLowerCase() === lower) || lower)
                    .filter(
                        (e) => !isoDeclineToList.some((to: string) => to.toLowerCase() === e.toLowerCase()),
                    );

                if (uniqueCcList.length > 0) {
                    console.info('[reject] Decline email CC recipients:', {
                        applicationId: applicationRecord.id,
                        to: isoDeclineToList,
                        cc: uniqueCcList,
                    });
                }

                if (isFinalUnderwriter) {
                    // Underwriter decline is not final: no ISO email. Super Admin gets the
                    // decision (with the reasons) in the submissions inbox and makes the call.
                    void sendScrubberRecommendationUwThreadEmail({
                        applicationId: applicationRecord.id,
                        recommendation: 'Recommend Decline',
                        stage: 'underwriter',
                        // To / CC confirmed in the decline popup (To defaults to subs@).
                        toEmails: Array.isArray(declineToEmails)
                            ? declineToEmails.map((e: unknown) => String(e || '').trim()).filter(Boolean)
                            : [],
                        ccEmails: parsedCcEmails,
                        deciderName: String(actorName || '').trim() || null,
                        declineReasons: reasonText
                            .split(/\s*,\s*/)
                            .map((r: string) => r.trim())
                            .filter(Boolean),
                    }).catch((err) => {
                        console.error('[uw-decision-mail] decline mail failed:', applicationRecord.id, err);
                    });
                } else if (isoPrimaryTo) {
                    const clientEmailHtml =
                        typeof emailHtml === 'string' && emailHtml.trim() ? emailHtml.trim() : undefined;
                    const clientEmailSubject =
                        emailThreadContext?.replySubject || properRejectionSubject;
                    const trackingId = randomUUID();

                    try {
                        await recordCommunicationAudit(req, {
                            outboundCommunicationId: trackingId,
                            applicationId: applicationRecord.id,
                            channel: 'EMAIL',
                            recipientType: 'ISO',
                            recipient: isoDeclineToList.join(', '),
                            subject: clientEmailSubject || 'Application Rejected',
                            body: clientEmailHtml,
                            templateName: 'Application declined template',
                            actionType: 'APPLICATION_REJECTED',
                            actionDescription:
                                `${roleLabel} ${actorName}`.trim() +
                                ` rejected the application and sent the decline template to the ISO. Reason: ${reasonText}`,
                            currentStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                            user: authUserForLog,
                            metadata: {
                                reason: reasonText,
                                additionalComments: additionalCommentsText,
                                template: 'rejection',
                                status: 'sent',
                                ccEmails: uniqueCcList,
                                emailThread: emailThreadContext
                                    ? {
                                          gmailMessageId: emailThreadContext.gmailMessageId,
                                          gmailThreadId: emailThreadContext.gmailThreadId,
                                          inReplyTo: emailThreadContext.inReplyTo,
                                      }
                                    : undefined,
                                delivery: {
                                    status: 'sent',
                                    sentAt: new Date().toISOString(),
                                },
                            },
                        });
                        rejectionCommunicationLogged = true;
                    } catch (auditErr) {
                        console.error(
                            'Failed to create communication audit for rejection email:',
                            auditErr,
                        );
                    }

                    rejectionEmailDelivery = await sendApplicationRejectionEmail({
                        to: isoDeclineToList,
                        cc: uniqueCcList.length ? uniqueCcList : undefined,
                        inReplyTo: emailThreadContext?.inReplyTo,
                        references: emailThreadContext?.references,
                        clientName: isoName || isoPrimaryTo,
                        primaryReason: reason.trim(),
                        otherReasons: additionalCommentsText,
                        html: clientEmailHtml,
                        subject: clientEmailSubject,
                        freshSubject: properRejectionSubject,
                        trackingId,
                        submissionApplication: submissionMailSource,
                        gmailThread: emailThreadContext,
                    });

                    if (rejectionEmailDelivery.sent && rejectionEmailDelivery.sgMessageId) {
                        try {
                            await storeSgMessageIdOnOutbound(
                                trackingId,
                                rejectionEmailDelivery.sgMessageId,
                            );
                        } catch (metaErr) {
                            console.error(
                                'Failed to store SendGrid message id for rejection email:',
                                metaErr,
                            );
                        }
                    }
                } else {
                    console.warn(
                        '[reject] Skipped ISO decline email G?? no linked ISO email on application',
                        applicationRecord.id,
                    );
                }
            } catch (rejectionEmailError) {
                console.error('Failed to send ISO rejection email:', rejectionEmailError);
            }

            if (!rejectionCommunicationLogged) {
            try {
                await createApplicationActivityLog({
                    applicationId: applicationRecord.id,
                    user: authUserForLog,
                    req,
                    actionType: 'APPLICATION_REJECTED' as ApplicationActivityActionType,
                    actionDescription:
                        `${roleLabel} ${actorName}`.trim() + ` rejected the application. Reason: ${reasonText}`,
                    previousStatus: `${previousQueue} / ${previousState}`,
                    currentStatus: `${applicationRecord.currentQueue} / ${applicationRecord.currentState}`,
                    metadata: {
                        reason: reasonText,
                        additionalComments: additionalCommentsText,
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for rejection:', logError);
            }
            }

            return res.status(200).json({
                success: true,
                message: 'Application rejected successfully',
                data: application,
                emailSent: rejectionEmailDelivery.sent,
                emailedTo: rejectionEmailDelivery.emailedTo,
                emailedCc: rejectionEmailDelivery.emailedCc,
                ccErrors: rejectionEmailDelivery.ccErrors,
            });
        } catch (error) {
            console.error('Reject application error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Soft-delete application (moves to Recently Deleted)
    async delete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);

            const { application, forbidden } = await getApplicationForUser({ id }, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (sendPreviewOnlyForbidden(res, authUser, application)) return;

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, application)) {
                return;
            }

            const deletedAt = (application as { deletedAt?: Date | null }).deletedAt;
            if (deletedAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Application is already in Recently Deleted',
                });
            }

            const actorId = authUser?.id;
            await prisma.application.update({
                where: { id: application.id },
                data: {
                    deletedAt: new Date(),
                    deletedById: actorId ?? null,
                },
            });

            try {
                const actorName = String((req as any).user?.name || '').trim() || 'User';
                await createApplicationActivityLog({
                    applicationId: application.id,
                    user: authUser,
                    req,
                    actionType: 'STATUS_CHANGED',
                    actionDescription: `${actorName} moved application to Recently Deleted.`,
                    previousStatus: `${application.currentQueue} / ${application.currentState}`,
                    currentStatus: 'Recently Deleted',
                });
            } catch (logErr) {
                console.error('Failed to log soft delete:', logErr);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application moved to Recently Deleted',
            });
        } catch (error) {
            console.error('Delete application error:', error);
            const isDev = process.env.NODE_ENV !== 'production';
            let message = 'Internal server error';
            if (
                typeof error === 'object' &&
                error !== null &&
                'code' in error &&
                typeof (error as { code: unknown }).code === 'string' &&
                (error as { code: string }).code.startsWith('P')
            ) {
                const pe = error as { code: string; message: string; meta?: unknown };
                message = `${pe.code}: ${pe.message}`;
                console.error('Prisma error meta:', pe.meta);
            } else if (isDev && error instanceof Error) {
                message = error.message;
            }
            return res.status(500).json({
                success: false,
                message: isDev ? message : 'Internal server error',
            });
        }
    }

    /** Super Admin / Operations: permanently remove a soft-deleted application. */
    async permanentlyDelete(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            if (
                roleUpper !== 'SUPER_ADMIN' &&
                roleUpper !== 'SUPERADMIN' &&
                roleUpper !== 'OPERATIONS'
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Only Super Admin or Operations can permanently delete applications',
                });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const application = await prisma.application.findUnique({
                where: whereClause,
            });

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (!(application as { deletedAt?: Date | null }).deletedAt) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Only applications in Recently Deleted can be permanently deleted',
                });
            }

            await this.executePermanentApplicationDelete(application.id);

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application permanently deleted',
            });
        } catch (error) {
            console.error('Permanent delete application error:', error);
            const isDev = process.env.NODE_ENV !== 'production';
            let message = 'Internal server error';
            if (isDev && error instanceof Error) {
                message = error.message;
            }
            return res.status(500).json({
                success: false,
                message: isDev ? message : 'Internal server error',
            });
        }
    }

    /** Super Admin / Operations: restore a soft-deleted deal to a scrubber's claimed queue. */
    async restoreApplicationToScrubber(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            if (
                roleUpper !== 'SUPER_ADMIN' &&
                roleUpper !== 'SUPERADMIN' &&
                roleUpper !== 'OPERATIONS'
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Only Super Admin or Operations can restore deleted applications',
                });
            }

            const scrubberId = String(
                (req.body as { scrubberId?: unknown } | undefined)?.scrubberId ?? '',
            ).trim();
            if (!scrubberId) {
                return res.status(400).json({
                    success: false,
                    message: 'scrubberId is required',
                });
            }

            const scrubber = await prisma.user.findFirst({
                where: {
                    id: scrubberId,
                    isActive: true,
                    role: 'SCRUBBING',
                },
                select: { id: true, firstName: true, lastName: true, email: true },
            });
            if (!scrubber) {
                return res.status(400).json({
                    success: false,
                    message: 'Selected scrubber was not found or is inactive',
                });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const include = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            } satisfies Prisma.ApplicationInclude;

            const application = await prisma.application.findUnique({
                where: whereClause,
                include,
            });

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (!(application as { deletedAt?: Date | null }).deletedAt) {
                return res.status(400).json({
                    success: false,
                    message: 'Application is not in Recently Deleted',
                });
            }

            const scrubberName =
                `${scrubber.firstName || ''} ${scrubber.lastName || ''}`.trim() ||
                scrubber.email ||
                'Scrubber';
            const actorName = String((req as any).user?.name || '').trim() || 'Admin';

            const refreshed = await prisma.application.update({
                where: { id: application.id },
                data: {
                    deletedAt: null,
                    deletedById: null,
                    currentQueue: WORKFLOW_QUEUES.SCRUBBING,
                    currentState: ApplicationState.IN_PROGRESS,
                    claimedByUnderwriterId: scrubberId,
                    claimedAt: new Date(),
                    assignedUnderwriterId: null,
                    approvedByUnderwriterId: null,
                    approvedAt: null,
                    underwriterAction: null,
                    scrubberRecommendation: null,
                },
                include,
            });

            try {
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'QUEUE_CHANGED',
                    actionDescription: `${actorName} restored application from Recently Deleted and assigned it to Scrubber ${scrubberName}.`,
                    previousStatus: 'Recently Deleted',
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: { scrubberId, claimedByUnderwriterId: scrubberId },
                });
            } catch (logErr) {
                console.error('Failed to log restore to scrubber:', logErr);
            }

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: `Application restored and assigned to ${scrubberName}`,
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Restore application to scrubber error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    private async executePermanentApplicationDelete(id: string) {
        await prisma.$transaction(
            async (tx: Prisma.TransactionClient) => {
                await tx.scheduledRePayment.deleteMany({ where: { applicationId: id } });

                const months = await tx.month.findMany({
                    where: { applicationId: id },
                    select: { id: true },
                });
                const monthIds = months.map((m) => m.id);
                if (monthIds.length > 0) {
                    await tx.monthlyTransaction.deleteMany({
                        where: { monthId: { in: monthIds } },
                    });
                }
                await tx.month.deleteMany({ where: { applicationId: id } });

                const analyses = await tx.bankAnalysis.findMany({
                    where: { applicationId: id },
                    select: { id: true },
                });
                const analysisIds = analyses.map((a) => a.id);
                if (analysisIds.length > 0) {
                    await tx.bankAnalysisRow.deleteMany({
                        where: { bankAnalysisId: { in: analysisIds } },
                    });
                }
                await tx.bankAnalysis.deleteMany({ where: { applicationId: id } });

                await tx.applicationFile.deleteMany({ where: { applicationId: id } });
                await tx.comment.deleteMany({ where: { applicationId: id } });
                await tx.complianceCheck.deleteMany({ where: { applicationId: id } });
                await tx.note.deleteMany({ where: { applicationId: id } });
                await tx.position.deleteMany({ where: { applicationId: id } });
                await tx.applicationQuestionResponse.deleteMany({
                    where: { applicationId: id },
                });

                await tx.document.deleteMany({ where: { applicationId: id } });
                await tx.fundingInfo.deleteMany({ where: { applicationId: id } });

                await tx.docuSignEnvelope.deleteMany({
                    where: {
                        OR: [
                            { termsOffer: { applicationId: id } },
                            { contract: { applicationId: id } },
                        ],
                    },
                });

                await tx.paymentTerms.deleteMany({
                    where: { contract: { applicationId: id } },
                });

                await tx.termsOffer.deleteMany({ where: { applicationId: id } });

                await tx.termsOffer.updateMany({
                    where: { contracts: { applicationId: id } },
                    data: { contractId: null },
                });
                await tx.aCH.updateMany({
                    where: { contract: { applicationId: id } },
                    data: { contractId: null },
                });
                await tx.ePO.updateMany({
                    where: { contract: { applicationId: id } },
                    data: { contractId: null },
                });
                await tx.addendum.updateMany({
                    where: { contract: { applicationId: id } },
                    data: { contractId: null },
                });

                await tx.funding.deleteMany({ where: { applicationId: id } });
                await tx.disclosure.deleteMany({ where: { applicationId: id } });
                await tx.contract.deleteMany({ where: { applicationId: id } });
                await tx.offerDecision.deleteMany({ where: { applicationId: id } });

                await tx.bankDetail.deleteMany({ where: { applicationId: id } });

                await tx.documentRequest.deleteMany({ where: { applicationId: id } });
                await tx.applicationSyndicatorDetails.deleteMany({ where: { applicationId: id } });
                await tx.commissionRequest.deleteMany({ where: { applicationId: id } });

                await tx.clientBankInfo.updateMany({
                    where: { applicationId: id },
                    data: { applicationId: null },
                });

                await tx.notification.updateMany({
                    where: { applicationId: id },
                    data: { applicationId: null },
                });
                await tx.conversation.updateMany({
                    where: { applicationId: id },
                    data: { applicationId: null },
                });

                await tx.applicationActivityLog.deleteMany({ where: { applicationId: id } });
                await tx.fundingCall.deleteMany({ where: { applicationId: id } });
                await tx.finalAnswer.deleteMany({ where: { applicationId: id } });
                await tx.publicApprovalToken.deleteMany({ where: { applicationId: id } });
                await tx.collectionPayment.deleteMany({ where: { applicationId: id } });
                await tx.offers.deleteMany({ where: { applicationId: id } });
                await tx.skippedActumTransactions.deleteMany({ where: { applicationId: id } });

                const withSyndicators = await tx.application.findUnique({
                    where: { id },
                    select: { syndicator: { select: { id: true } } },
                });
                if (withSyndicators && withSyndicators.syndicator.length > 0) {
                    await tx.application.update({
                        where: { id },
                        data: { syndicator: { set: [] } },
                    });
                }

                await tx.application.delete({ where: { id } });
            },
            {
                maxWait: 15_000,
                timeout: 120_000,
            },
        );
    }

    // Extract information from PDF using Groq API
    // async extractPDFData(req: Request, res: Response) {
    //     try {
    //         const reqFiles = (req as any).files;
    //         if (!reqFiles || !reqFiles.pdf) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: 'No PDF file uploaded. Please upload a PDF file with field name "pdf"',
    //             });
    //         }

    //         const pdfFile = reqFiles.pdf;

    //         // Validate file type
    //         if (pdfFile.mimetype !== 'application/pdf') {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: 'Invalid file type. Please upload a PDF file.',
    //             });
    //         }

    //         // Get the temporary file path
    //         const tempFilePath = pdfFile.tempFilePath || pdfFile.filepath || pdfFile.path;

    //         if (!tempFilePath || !fs.existsSync(tempFilePath)) {
    //             return res.status(400).json({
    //                 success: false,
    //                 message: 'File not found. Please try uploading again.',
    //             });
    //         }

    //         // Extract data from PDF using Groq
    //         const extractedData = await pdfExtractionService.extractFromPDF(tempFilePath);

    //         // Print extracted information to console (for testing)
    //         console.log('='.repeat(80));
    //         console.log('PDF EXTRACTION RESULTS');
    //         console.log('='.repeat(80));
    //         console.log('File Name:', pdfFile.name || 'Unknown');
    //         console.log('File Size:', pdfFile.size, 'bytes');
    //         console.log('Extracted Data:');
    //         console.log(JSON.stringify(extractedData, null, 2));
    //         console.log('='.repeat(80));

    //         // Clean up temporary file
    //         try {
    //             if (fs.existsSync(tempFilePath)) {
    //                 fs.unlinkSync(tempFilePath);
    //             }
    //         } catch (cleanupError) {
    //             console.warn('Failed to cleanup temporary file:', cleanupError);
    //         }

    //         return res.status(200).json({
    //             success: true,
    //             message: 'PDF data extracted successfully. Check server console for extracted information.',
    //             data: extractedData,
    //         });
    //     } catch (error: any) {
    //         const msg = error?.message || 'Failed to extract data from PDF';
    //         console.error('PDF extraction error:', error);
    //         const isInsufficientText = /too little|no text|image-only|scanned|OCR/i.test(msg);
    //         return res.status(isInsufficientText ? 400 : 500).json({
    //             success: false,
    //             message: msg,
    //         });
    //     }
    // }

    /**
     * Underwriter sends a pre-decision deal back to the scrubber for correction.
     * Only while the deal sits in the Underwriter queue with no recorded decision —
     * an approved or declined deal is never reversed to scrubbing.
     */
    async returnApplicationToScrubber(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            if (
                roleUpper !== 'UNDERWRITER' &&
                roleUpper !== 'SUPER_ADMIN' &&
                roleUpper !== 'SUPERADMIN' &&
                roleUpper !== 'ADMIN'
            ) {
                return res.status(403).json({
                    success: false,
                    message:
                        'Only an Underwriter or Super Admin can send a deal back to the scrubber',
                });
            }
            const actorId = authUser?.id;
            if (!actorId) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const rawBody = (req.body ?? {}) as {
                scrubberId?: unknown;
                scrubberEmail?: unknown;
                reasons?: unknown;
                note?: unknown;
            };
            const note = String(rawBody.note ?? '').trim();
            if (!note) {
                return res.status(400).json({
                    success: false,
                    message: 'A correction note is required',
                });
            }
            const reasons = (
                Array.isArray(rawBody.reasons)
                    ? rawBody.reasons
                    : String(rawBody.reasons ?? '').split(RETURN_REASON_DELIMITER)
            )
                .map((reason) => String(reason ?? '').trim())
                .filter(Boolean);

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const include = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            } satisfies Prisma.ApplicationInclude;

            const { application, forbidden } = await getApplicationForUser(
                whereClause,
                authUser,
                include,
            );

            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }

            const returnQueueToken = String(application.currentQueue ?? '')
                .trim()
                .toUpperCase()
                .replace(/[\s-]+/g, '_');
            const isAdminActor = roleUpper !== 'UNDERWRITER';
            // Super Admin may also return a scrubber decline awaiting its review, or
            // hand a deal still in Scrubbing to a scrubber with a correction note.
            const isScrubberDeclineHold =
                returnQueueToken === 'DECLINED' &&
                application.underwriterAction === declineActionForRole('SCRUBBING');
            const isScrubbingDeal = returnQueueToken === 'SCRUBBING';
            if (isAdminActor && (isScrubberDeclineHold || isScrubbingDeal)) {
                // allowed — no underwriting decision exists on these
            } else {
                // A recorded underwriting decision is terminal — never reverse it to scrubbing.
                if (application.underwriterAction || application.approvedByUnderwriterId) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'This deal already has an underwriting decision and can no longer be sent back to the scrubber',
                    });
                }
                if (returnQueueToken !== 'UNDERWRITER') {
                    return res.status(400).json({
                        success: false,
                        message: 'Only a deal in the Underwriter queue can be sent back to the scrubber',
                    });
                }
            }

            // Default to the scrubber who scrubbed the deal; the modal may override.
            const requestedScrubberId = String(rawBody.scrubberId ?? '').trim();
            const requestedScrubberEmail = String(rawBody.scrubberEmail ?? '')
                .trim()
                .toLowerCase();
            const targetScrubberId =
                requestedScrubberId || String(application.claimedByUnderwriterId ?? '').trim();
            if (!targetScrubberId && !requestedScrubberEmail) {
                return res.status(400).json({
                    success: false,
                    message:
                        'No scrubber is linked to this deal. Select a scrubber to send it back to.',
                });
            }

            const scrubberSelect = {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
            } as const;

            let scrubber = targetScrubberId
                ? await prisma.user.findFirst({
                      where: { id: targetScrubberId, isActive: true, role: 'SCRUBBING' },
                      select: scrubberSelect,
                  })
                : null;
            // Super Admin panel may send its own user UUID; fall back to email
            // (same rule as assignApplicationToUnderwriter).
            if (!scrubber && requestedScrubberEmail) {
                scrubber = await prisma.user.findFirst({
                    where: {
                        email: requestedScrubberEmail,
                        isActive: true,
                        role: 'SCRUBBING',
                    },
                    select: scrubberSelect,
                });
            }
            if (!scrubber) {
                return res.status(400).json({
                    success: false,
                    message: requestedScrubberEmail
                        ? `No active Scrubber with the email ${requestedScrubberEmail} exists on this book.`
                        : 'Selected scrubber was not found or is inactive',
                });
            }

            // A Super Admin may return the deal on the underwriter's behalf: the corrected
            // deal must still go back to the underwriter holding it, not to the admin.
            // With no underwriter on the deal yet (scrubber decline / Scrubbing), the
            // corrected deal goes to the normal underwriter queue on resend.
            const correctionReturnUnderwriterId =
                String(application.assignedUnderwriterId ?? '').trim() ||
                (isAdminActor && (isScrubberDeclineHold || isScrubbingDeal) ? null : String(actorId));

            // Drop the scrubber's old decline so the deal no longer reads as declined.
            const clearsScrubberDecline = /recommend\s+decline/i.test(
                String(application.scrubberRecommendation ?? ''),
            );
            if (clearsScrubberDecline) {
                await prisma.offerDecision.updateMany({
                    where: { applicationId: application.id },
                    // 'approved' is the column's normal value for a saved offer.
                    data: { decision: 'approved', declineReason: null },
                });
            }
            const noteWithoutDeclineReasons = String(application.note ?? '')
                .split('\n')
                .filter((line) => !line.trim().startsWith('SCRUBBER_DECLINE_REASONS:'))
                .join('\n')
                .trim();

            const previousQueue = application.currentQueue;
            const previousState = application.currentState;
            const actorName = String((req as any).user?.name || '').trim() || 'Underwriter';
            const scrubberName =
                `${scrubber.firstName || ''} ${scrubber.lastName || ''}`.trim() ||
                scrubber.email ||
                'Scrubber';

            const refreshed = await prisma.application.update({
                where: { id: application.id },
                data: {
                    currentQueue: WORKFLOW_QUEUES.SCRUBBING,
                    currentState: ApplicationState.IN_PROGRESS,
                    // Back in that scrubber's Claimed list, not the open pool.
                    claimedByUnderwriterId: scrubber.id,
                    claimedAt: new Date(),
                    // The underwriter keeps the deal while it is being corrected:
                    // clearing the assignment would drop it into the unclaimed
                    // pool as a row nobody can claim.
                    returnedToScrubberId: scrubber.id,
                    returnedByUnderwriterId: correctionReturnUnderwriterId,
                    returnedToScrubberAt: new Date(),
                    returnReasons: reasons.join(RETURN_REASON_DELIMITER),
                    returnNote: note,
                    ...(clearsScrubberDecline
                        ? {
                              scrubberRecommendation: null,
                              underwriterAction: null,
                              note: noteWithoutDeclineReasons || null,
                          }
                        : {}),
                },
                include,
            });

            const reasonSummary = reasons.length > 0 ? reasons.join(', ') : note;

            try {
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'QUEUE_CHANGED',
                    actionDescription: `${actorName} sent the application back to Scrubber ${scrubberName} for correction. ${reasonSummary}`,
                    previousStatus: `${previousQueue} / ${previousState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: {
                        returnedToScrubberId: scrubber.id,
                        returnedByUnderwriterId: correctionReturnUnderwriterId,
                        returnReasons: reasons,
                        returnNote: note,
                    },
                });
            } catch (logErr) {
                console.error('Failed to log return to scrubber:', logErr);
            }

            try {
                await notifyUnderwriterReturnedApplicationToScrubber({
                    application: refreshed as any,
                    recipientId: scrubber.id,
                    actorId: String(actorId),
                    actorName,
                    reasonSummary,
                });
            } catch (notifErr) {
                console.error('Failed to notify scrubber of returned deal:', notifErr);
            }

            // Email the scrubber on the deal's mail thread. Fire-and-forget: the
            // deal has already moved, and a mail failure must not fail the action.
            void sendReturnToScrubberEmail({
                applicationId: refreshed.id,
                scrubberEmail: String(scrubber.email || ''),
                scrubberName,
                underwriterName: actorName,
                reasons,
                note,
            }).catch((mailErr) => {
                console.error(
                    '[return-to-scrubber-mail] failed after return:',
                    refreshed.id,
                    mailErr,
                );
            });

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Application sent back to the scrubber for correction',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Return application to scrubber error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Process an uploaded application PDF coming from the frontend
    /**
     * Scrubber flags a deal as Missing Documents: moves it out of the scrubbing
     * pool into the Missing Documents queue (Super Admin works it), stores the
     * list as a `MISSING_DOCUMENTS:` marker line on Application.note and emails
     * every active Super Admin.
     */
    async flagMissingDocuments(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            if (roleUpper !== 'SCRUBBING' && roleUpper !== 'SUPER_ADMIN' && roleUpper !== 'SUPERADMIN') {
                return res.status(403).json({
                    success: false,
                    message: 'Only a Scrubber or Super Admin can flag missing documents',
                });
            }
            if (!authUser?.id) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }

            const rawBody = (req.body ?? {}) as { documents?: unknown; otherDocuments?: unknown };
            const documents = (Array.isArray(rawBody.documents) ? rawBody.documents : [])
                .map((d) => String(d ?? '').replace(/\|\|\|/g, ' ').replace(/[\r\n]+/g, ' ').trim())
                .filter(Boolean);
            // Each line of the free-text box is its own missing document.
            const otherDocuments = String(rawBody.otherDocuments ?? '')
                .split(/[\r\n]+/)
                .map((d) => d.replace(/\|\|\|/g, ' ').trim())
                .filter(Boolean);
            const allDocuments = [...new Set([...documents, ...otherDocuments])];
            if (allDocuments.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Select at least one document or describe the missing documents',
                });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const include = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            } satisfies Prisma.ApplicationInclude;

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, include);
            if (forbidden) {
                return res.status(403).json({ success: false, message: 'Forbidden' });
            }
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }
            // Already in Missing Documents: the scrubber is updating / adding to the list.
            const isUpdate =
                normalizeQueueToken(application.currentQueue) ===
                normalizeQueueToken(MISSING_DOCUMENTS_QUEUE);
            // A scrubber can flag any deal they have claimed, whatever its queue
            // (claimed scrubbing deals are not always in the "Scrubbing" queue).
            const claimedById = (application as { claimedByUnderwriterId?: string | null }).claimedByUnderwriterId;
            if (roleUpper === 'SCRUBBING' && claimedById !== authUser.id) {
                return res.status(403).json({
                    success: false,
                    message: 'Claim this deal before flagging missing documents',
                });
            }

            const noteWithoutMarker = String(application.note ?? '')
                .split('\n')
                .filter((line) => !line.trim().startsWith(MISSING_DOCUMENTS_NOTE_PREFIX))
                .join('\n')
                .trim();
            const markerLine = `${MISSING_DOCUMENTS_NOTE_PREFIX}${allDocuments.join(RETURN_REASON_DELIMITER)}`;
            const nextNote = noteWithoutMarker ? `${noteWithoutMarker}\n${markerLine}` : markerLine;

            const refreshed = await prisma.application.update({
                where: { id: application.id },
                data: {
                    currentQueue: MISSING_DOCUMENTS_QUEUE,
                    currentState: MISSING_DOCUMENTS_STATE,
                    note: nextNote,
                },
                include,
            });

            const actorName = String((req as any).user?.name || '').trim() || 'Scrubber';
            try {
                await createApplicationActivityLog({
                    applicationId: refreshed.id,
                    user: authUser,
                    req,
                    actionType: 'QUEUE_CHANGED',
                    actionDescription: isUpdate
                        ? `${actorName} updated the missing documents: ${allDocuments.join(', ')}.`
                        : `${actorName} flagged this deal as Missing Documents: ${allDocuments.join(', ')}.`,
                    previousStatus: `${application.currentQueue} / ${application.currentState}`,
                    currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
                    metadata: { missingDocuments: allDocuments },
                });
            } catch (logErr) {
                console.error('Failed to log missing documents flag:', logErr);
            }

            // Fire-and-forget: the deal has already moved, a mail failure must not fail the action.
            void sendMissingDocumentsSuperAdminEmail({
                applicationId: refreshed.id,
                flaggedByName: actorName,
                documents: allDocuments,
            }).catch((mailErr) => {
                console.error('[missing-documents-mail] failed after flag:', refreshed.id, mailErr);
            });

            invalidateAllApplicationStatsCache();

            return res.status(200).json({
                success: true,
                message: 'Deal moved to Missing Documents',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Flag missing documents error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    /**
     * Super Admin: per-document status for a Missing Documents hold (same data
     * the public upload page gets) — drives the CRM Missing Documents panel.
     */
    async getMissingDocumentsStatus(req: Request, res: Response) {
        try {
            const idStr = String(req.params.id ?? '');
            const application = await prisma.application.findUnique({
                where: /^\d+$/.test(idStr) ? { applicationId: Number(idStr) } : { id: idStr },
                select: { id: true, note: true, currentQueue: true },
            });
            if (!application) {
                return res.status(404).json({ success: false, message: 'Application not found' });
            }
            const active = isMissingDocumentsQueue(application.currentQueue);
            const status = active
                ? await buildMissingDocumentItems(application)
                : { heldSince: null, items: [] };
            return res.status(200).json({ success: true, data: { active, ...status } });
        } catch (error) {
            console.error('Get missing documents status error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    /**
     * Super Admin: documents are in — return a Missing Documents deal to the
     * Scrubbing queue UNCLAIMED so any scrubber can claim it again.
     */
    async resolveMissingDocuments(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const roleUpper = authUser?.role
                ? String(authUser.role).toUpperCase().replace(/-/g, '_')
                : '';
            if (roleUpper !== 'SUPER_ADMIN' && roleUpper !== 'SUPERADMIN') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Super Admin can send a Missing Documents deal back to Scrubber',
                });
            }

            const idStr = String(id ?? '');
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                ? { applicationId: Number(idStr) }
                : { id: idStr };

            const include = {
                referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                createdBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
                client: true,
                iso: true,
                claimedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                approvedByUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
                assignedUnderwriter: { select: APPLICATION_USER_LITE_SELECT },
            } satisfies Prisma.ApplicationInclude;

            const actorName = String((req as any).user?.name || '').trim() || 'Super Admin';
            const result = await resolveMissingDocumentsForApplication({
                where: whereClause,
                include,
                user: authUser,
                req,
                actionDescription: `${actorName} resolved Missing Documents and returned this deal to the open Scrubbing queue.`,
            });
            if (!result.ok) {
                return res.status(result.status).json({ success: false, message: result.message });
            }
            const refreshed = result.application;

            return res.status(200).json({
                success: true,
                message: 'Deal sent back to the Scrubbing queue',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error) {
            console.error('Resolve missing documents error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }

    async processPDFUpload(req: Request, res: Response) {
        try {
            const reqFiles = (req as any).files;
            if (!reqFiles || !reqFiles.pdf) {
                return res.status(400).json({
                    success: false,
                    message: 'No PDF file uploaded. Please upload a PDF file with field name "pdf"',
                });
            }

            const pdfFile = reqFiles.pdf;
            const tempFilePath = pdfFile.tempFilePath || pdfFile.filepath || pdfFile.path;

            if (!tempFilePath || !fs.existsSync(tempFilePath)) {
                return res.status(400).json({
                    success: false,
                    message: 'File not found. Please try uploading again.',
                });
            }

            let parsedData: any;
            try {
                parsedData = await processPDF(tempFilePath);
            } finally {
                // Best-effort cleanup of temporary file
                try {
                    if (tempFilePath && fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                } catch {
                    // ignore cleanup errors
                }
            }

            return res.status(200).json({
                success: true,
                message: 'PDF processed successfully',
                data: parsedData,
            });
        } catch (error: any) {
            console.error('Process application PDF error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Failed to process application PDF',
            });
        }
    }

    /**
     * POST multipart field `pdf` (multer): Claude hybrid PDF extraction G?? parseBusinessData G??
     * existing `createClientAndApplicationFromPDFBuffer` (same persistence as Gmail / PDF buffer flow).
     */
    async uploadApplicationPdfOcrCreate(req: Request, res: Response) {
        try {
            const uploaded = (req as any).file as { buffer?: Buffer; originalname?: string } | undefined;
            if (!uploaded?.buffer?.length) {
                return res.status(400).json({
                    success: false,
                    message: 'No PDF uploaded. Use multipart field "pdf".',
                });
            }

            const pdfBuffer = uploaded.buffer;
            const pdfOriginalName =
                String(uploaded.originalname || 'application.pdf').trim() || 'application.pdf';

            const syntheticText = await extractPdfPlainTextForParsing(
                pdfBuffer,
                pdfOriginalName,
            );
            const previewLen = Math.max(200, Number(process.env.PDF_EXTRACT_DEBUG_PREVIEW_CHARS || 800));
            console.log(
                '[PDF upload] Synthetic parse text preview:\n',
                syntheticText.length > previewLen
                    ? `${syntheticText.slice(0, previewLen)}G?`
                    : syntheticText,
            );

            const normalized = normalizeOcrTextForParsing(syntheticText);
            const parsedData = parseBusinessData(normalized);
            console.log('[PDF upload] Parsed structured data:', JSON.stringify(parsedData, null, 2));
            logExtractedBusinessDataCsv(parsedData, {
                tag: "[PDF upload]",
                fileName: pdfOriginalName,
            });

            if (!parsedData || typeof parsedData !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to parse Claude-extracted text into business/owner fields',
                });
            }

            const currentUserId = (req as any).user?.id;
            if (!currentUserId) {
                return res.status(401).json({
                    success: false,
                    message: 'User authentication required',
                });
            }

            const requestedIsoIdRaw = (req as any).body?.isoId;
            const isoFromBody =
                typeof requestedIsoIdRaw === 'string' ? requestedIsoIdRaw.trim() : '';

            let result: Awaited<ReturnType<typeof createClientAndApplicationFromPDFBuffer>>;
            try {
                result = await createClientAndApplicationFromPDFBuffer(pdfBuffer, currentUserId, {
                    originalFileName: pdfOriginalName,
                    isoId: isoFromBody || null,
                    preParsedData: parsedData,
                });
            } catch (createErr) {
                if (createErr instanceof InsufficientParsedPdfError) {
                    return res.status(400).json({
                        success: false,
                        message: createErr.message,
                    });
                }
                throw createErr;
            }

            const populatedApplication = mapApplicationToApi(result.application);
            const mappedClient = mapClientToApi(result.client);
            console.log('[PDF upload] Created client:', JSON.stringify(mappedClient, null, 2));
            console.log('[PDF upload] Created application:', JSON.stringify(populatedApplication, null, 2));

            return res.status(200).json({
                success: true,
                message: result.existingClient
                    ? 'Client already existed; application created from PDF extraction.'
                    : 'Client and application created from PDF extraction.',
                data: {
                    client: mappedClient,
                    application: populatedApplication,
                    existingClient: result.existingClient,
                },
            });
        } catch (error: any) {
            console.error('[PDF upload] Error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Failed PDF upload pipeline',
            });
        }
    }

    // Auto-create Client + Application from uploaded PDF with SSN-based duplicate handling
    async autoCreateFromPDF(req: Request, res: Response) {
        try {
            const reqFiles = (req as any).files;
            if (!reqFiles || !reqFiles.pdf) {
                return res.status(400).json({
                    success: false,
                    message: 'No PDF file uploaded. Please upload a PDF file with field name "pdf"',
                });
            }

            const pdfFile = reqFiles.pdf;
            const tempFilePath = pdfFile.tempFilePath || pdfFile.filepath || pdfFile.path;

            if (!tempFilePath || !fs.existsSync(tempFilePath)) {
                return res.status(400).json({
                    success: false,
                    message: 'File not found. Please try uploading again.',
                });
            }

            const pdfBuffer = fs.readFileSync(tempFilePath);
            const pdfOriginalName = String(pdfFile.name || 'application.pdf').trim() || 'application.pdf';
            const pdfContentHash = sha256PdfContent(pdfBuffer);
            const gmailMessageId = String((req as any).body?.gmailMessageId || '').trim();

            const currentUserIdEarly = (req as any).user?.id;
            if (!currentUserIdEarly) {
                return res.status(401).json({
                    success: false,
                    message: 'User authentication required',
                });
            }

            const reusedExisting = await resolveExistingPdfCreateIfDuplicate({
                userId: currentUserIdEarly,
                fileName: pdfOriginalName,
                pdfContentHash,
                gmailMessageId: gmailMessageId || null,
            });
            if (reusedExisting) {
                const populatedApplication = mapApplicationToApi(reusedExisting.application);
                const mappedClient = mapClientToApi(reusedExisting.client);
                return res.status(200).json({
                    success: true,
                    message: 'Application already exists for this PDF.',
                    data: {
                        client: mappedClient,
                        application: populatedApplication,
                        existingClient: true,
                        alreadyExisted: true,
                    },
                });
            }

            // Extract structured business/owner data from PDF
            let parsedData: any;
            try {
                parsedData = await processPDF(tempFilePath);
            } finally {
                // Best-effort cleanup of temporary file
                try {
                    if (tempFilePath && fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                } catch {
                    // ignore cleanup errors
                }
            }

            if (!parsedData || typeof parsedData !== 'object') {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to extract structured data from PDF',
                });
            }

            console.log(
                '[autoCreateFromPDF] Parsed structured data (extract/parse complete; DB transaction next):',
                JSON.stringify(parsedData, null, 2),
            );

            const business = parsedData.business || {};
            const owner = parsedData.owner || {};

            // Helper to normalize SSN (digits only)
            const normalizeSsn = (ssn: string | null | undefined) =>
                ssn ? String(ssn).replace(/\D/g, '') : null;

            // Helper to parse numeric amounts like "$12,345.67"
            const parseNumericAmount = (value: string | number | null | undefined): number | null => {
                if (value === null || value === undefined) return null;
                const str = String(value).replace(/[$,\s]/g, '').trim();
                if (!str) return null;
                const num = parseFloat(str);
                return isNaN(num) ? null : num;
            };

            // Helper to parse ISO-like date strings into Date objects
            const parseDate = (dateStr: string | null | undefined): Date | null => {
                if (!dateStr) return null;

                const parsed = new Date(dateStr);
                return isNaN(parsed.getTime()) ? null : parsed;
            };

            const ownerSsnRaw =
                owner.owner_ssn ||
                owner.ownerSsn ||
                owner.ssn ||
                null;
            const ownerSsnNorm = normalizeSsn(ownerSsnRaw);

            const currentUserId = currentUserIdEarly;

            const pdfRoleUpper = String((req as any).user?.role || '').toUpperCase();
            // Same as Gmail PDF auto-create (`createClientAndApplicationFromPDFBuffer`): always land in Scrubbing.
            const pdfAgentCreationQueue = WORKFLOW_QUEUES.SCRUBBING;
            const pdfAgentCreationState = ApplicationState.IN_PROGRESS;
            const gmailNote = gmailMessageId ? gmailAutoCreateMessageNote(gmailMessageId) : '';
            const requestedApplicationTypeRaw = (req as any).body?.applicationType;
            const requestedIsoIdRaw = (req as any).body?.isoId;
            const requestedApplicationType = String(requestedApplicationTypeRaw || '')
                .trim()
                .replace(/-/g, '_')
                .toUpperCase();
            const requestedIsoId = String(requestedIsoIdRaw || '').trim();
            let validatedIsoId: string | null = null;
            let commissionPercentageFromIso = 0;
            if (requestedIsoId) {
                const isoRecord = await (prisma as any).iso.findUnique({
                    where: { id: requestedIsoId },
                    select: { id: true, commissionPercentage: true },
                });
                if (!isoRecord) {
                    return res.status(404).json({
                        success: false,
                        message: 'ISO not found',
                    });
                }
                validatedIsoId = isoRecord.id;
                commissionPercentageFromIso = Number(isoRecord.commissionPercentage ?? 0);
            }
            const applicationTypeForCreate =
                pdfRoleUpper === 'OPERATIONS' && requestedApplicationType === 'BYPASS'
                    ? 'Bypass'
                    : 'New';

            // Try to find existing client by SSN (full match or last 4 digits)
            let clientRecord: any | null = null;
            let existingClient = false;

            if (ownerSsnNorm && ownerSsnNorm.length >= 4) {
                const ssnLast4 = ownerSsnNorm.slice(-4);
                const clientsWithSsn = await prisma.client.findMany({
                    where: { ownerSsn: { not: null } },
                    orderBy: { createdAt: 'desc' },
                    take: 200,
                });
                clientRecord =
                    clientsWithSsn.find((c) => {
                        const cNorm = normalizeSsn(c.ownerSsn);
                        return cNorm && (cNorm === ownerSsnNorm || cNorm.slice(-4) === ssnLast4);
                    }) || null;

                if (clientRecord) {
                    existingClient = true;
                }
            }

            // Parse requested loan amount from business_requested_amount (or fallback aliases)
            const requestedAmountRaw =
                business.business_requested_amount ||
                business.requested_amount ||
                null;
            const loanAmountNum = parseNumericAmount(requestedAmountRaw);

            // Parse Gross Annual Sales and calculate monthly revenue (annual ++ 12)
            const grossAnnualRaw = business.business_monthly_revenue; // parsed from "Gross Annual Sales"
            const annualRevenue = parseNumericAmount(grossAnnualRaw);
            const monthlyRevenue =
                annualRevenue != null ? Math.round((annualRevenue / 12) * 100) / 100 : null;

            let createdClient: any;
            let createdApplication: any;

            if (clientRecord) {
                // Case 1: Client already exists G?? create application only
                createdClient = clientRecord;

                createdApplication = await withAllocatedDealId((dealId, tx) =>
                    tx.application.create({
                        data: applicationCreateUncheckedData({
                            priority: 'High',
                            type: applicationTypeForCreate,
                            salesRepresentativeId: currentUserId,
                            referringAgentId: currentUserId,
                            clientId: createdClient.id,
                            isoId: validatedIsoId,
                            commissionPercentage: commissionPercentageFromIso,
                            loanAmount: !isNaN(loanAmountNum as number) ? (loanAmountNum as number) : null,
                            createdById: currentUserId,
                            currentQueue: pdfAgentCreationQueue,
                            currentState: pdfAgentCreationState,
                            note: gmailNote || undefined,
                            dealId,
                        }),
                        include: {
                            referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                            salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                            client: true,
                            iso: true,
                            files: true,
                        },
                    }),
                );

                await attachBufferAsApplicationFile(createdApplication.id, pdfBuffer, pdfOriginalName);
                const applicationAfterPdf = await prisma.application.findUnique({
                    where: { id: createdApplication.id },
                    include: {
                        referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                        salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                        client: true,
                        iso: true,
                        files: true,
                    },
                });
                const populatedApplication = mapApplicationToApi(applicationAfterPdf || createdApplication);
                try {
                    (populatedApplication as any).isDuplicate =
                        await syncDuplicateFlagForApplication(createdApplication.id);
                } catch (dedupeErr) {
                    console.warn('Failed to sync isDuplicate after PDF create:', dedupeErr);
                }
                await stampPdfCreateIdempotency({
                    userId: currentUserId,
                    applicationId: createdApplication.id,
                    pdfContentHash,
                    gmailMessageId: gmailMessageId || null,
                });
                const mappedClient = mapClientToApi(createdClient);

                console.log(
                    '[autoCreateFromPDF] Final DB response (existing client):',
                    JSON.stringify(
                        { client: mappedClient, application: populatedApplication, existingClient: true },
                        null,
                        2,
                    ),
                );

                scheduleApplicationStageNotification({
                    application: (applicationAfterPdf || createdApplication) as any,
                    transitionAction: 'CREATED',
                    actorId: currentUserId,
                    actorName: (req as any).user?.name || '',
                });

                return res.status(200).json({
                    success: true,
                    message: 'Client already exists. Application has been created for the existing client.',
                    data: {
                        client: mappedClient,
                        application: populatedApplication,
                        existingClient: true,
                    },
                });
            }

            try {
                assertReadyToCreateNewClientFromPdf(parsedData, clientRecord);
            } catch (assertErr) {
                if (assertErr instanceof InsufficientParsedPdfError) {
                    return res.status(400).json({
                        success: false,
                        message: assertErr.message,
                    });
                }
                throw assertErr;
            }

            // Case 2: Client does not exist G?? create client + application atomically
            const result = await prisma.$transaction(async (tx) => {
                const dealId = await allocateNextDealId(tx);

                const newClient = await tx.client.create({
                    data: {
                        businessName: business.business_name || business.dba_name || null,
                        businessEmail: business.business_email || null,
                        businessNumber: business.phone_number || null,
                        businessWebsite: business.business_website || null,
                        businessIncorporationDate: parseDate(business.business_incorporation_date),
                        businessIncorporationState:
                            business.business_incorporation_state || business.business_state || null,
                        businessEntityType: business.business_type_of_entity || null,
                        businessEinNumber: business.business_ein_number || null,
                        businessAnnualRevenue: annualRevenue ?? null,
                        businessMonthlyRevenue: monthlyRevenue ?? null,
                        businessAddress1: business.business_address1 || null,
                        businessAddress2: business.business_address2 || null,
                        businessCity: business.business_city || null,
                        businessState: business.business_state || null,
                        businessZipCode: business.business_zip_code || null,
                        ownerFirstName: owner.owner_first_name || null,
                        ownerMiddleName: owner.owner_middle_name || null,
                        ownerLastName: owner.owner_last_name || null,
                        ownerEmail: owner.owner_email || null,
                        ownerMobileNumber: owner.owner_mobile_number || null,
                        ownerDateOfBirth: parseDate(owner.owner_date_of_birth),
                        ownerSsn: ownerSsnNorm || null,
                        ownerFicoScore: owner.owner_fico_score
                            ? Number(owner.owner_fico_score)
                            : null,
                        ownerOwnershipStartDate: null,
                        ownerOwnershipPercentage: owner.owner_ownership_percentage
                            ? Number(owner.owner_ownership_percentage)
                            : null,
                        ownerAddress1: owner.owner_address1 || null,
                        ownerAddress2: null,
                        ownerCity: owner.owner_city || null,
                        ownerState: owner.owner_state || null,
                        ownerZipCode: owner.owner_zip_code || null,
                        createdById: currentUserId,
                    },
                });

                const newApplication = await tx.application.create({
                    data: applicationCreateUncheckedData({
                        priority: 'High',
                        type: applicationTypeForCreate,
                        salesRepresentativeId: currentUserId,
                        referringAgentId: currentUserId,
                        clientId: newClient.id,
                        isoId: validatedIsoId,
                        commissionPercentage: commissionPercentageFromIso,
                        loanAmount: !isNaN(loanAmountNum as number) ? (loanAmountNum as number) : null,
                        createdById: currentUserId,
                        currentQueue: pdfAgentCreationQueue,
                        currentState: pdfAgentCreationState,
                        note: gmailNote || undefined,
                        dealId,
                    }),
                    include: {
                        referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                        salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                        client: true,
                        iso: true,
                        files: true,
                    },
                });

                return { newClient, newApplication };
            }, { maxWait: 20_000, timeout: 120_000 });

            createdClient = result.newClient;
            createdApplication = result.newApplication;

            await attachBufferAsApplicationFile(createdApplication.id, pdfBuffer, pdfOriginalName);
            const applicationAfterPdf = await prisma.application.findUnique({
                where: { id: createdApplication.id },
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    files: true,
                },
            });
            const populatedApplication = mapApplicationToApi(applicationAfterPdf || createdApplication);
            try {
                (populatedApplication as any).isDuplicate =
                    await syncDuplicateFlagForApplication(createdApplication.id);
            } catch (dedupeErr) {
                console.warn('Failed to sync isDuplicate after PDF create:', dedupeErr);
            }
            await stampPdfCreateIdempotency({
                userId: currentUserId,
                applicationId: createdApplication.id,
                pdfContentHash,
                gmailMessageId: gmailMessageId || null,
            });
            const mappedClient = mapClientToApi(createdClient);

            console.log(
                '[autoCreateFromPDF] Final DB response (new client):',
                JSON.stringify(
                    { client: mappedClient, application: populatedApplication, existingClient: false },
                    null,
                    2,
                ),
            );

            scheduleApplicationStageNotification({
                application: (applicationAfterPdf || createdApplication) as any,
                transitionAction: 'CREATED',
                actorId: currentUserId,
                actorName: (req as any).user?.name || '',
            });

            return res.status(200).json({
                success: true,
                message: 'Client created successfully and application generated.',
                data: {
                    client: mappedClient,
                    application: populatedApplication,
                    existingClient: false,
                },
            });
        } catch (error: any) {
            console.error('Auto-create from PDF error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Failed to auto-create client and application from PDF',
            });
        }
    }

    // Extract business and owner details from PDF using Groq API
    //     async extractBusinessDetails(req: Request, res: Response) {
    //         try {
    //             console.log('[extractBusinessDetails] Request received');
    //             const reqFiles = (req as any).files;
    //             if (!reqFiles || !reqFiles.pdf) {
    //                 console.log('[extractBusinessDetails] Status: FAILED - No PDF file in request (field name must be "pdf")');
    //                 return res.status(400).json({
    //                     success: false,
    //                     message: 'No PDF file uploaded. Please upload a PDF file with field name "pdf"',
    //                 });
    //             }

    //             const pdfFile = reqFiles.pdf;
    //             console.log('[extractBusinessDetails] Status: PDF file received from frontend', {
    //                 name: pdfFile.name,
    //                 size: pdfFile.size,
    //                 mimetype: pdfFile.mimetype,
    //             });

    //             // Validate file type
    //             if (pdfFile.mimetype !== 'application/pdf') {
    //                 console.log('[extractBusinessDetails] Status: FAILED - Invalid file type:', pdfFile.mimetype);
    //                 return res.status(400).json({
    //                     success: false,
    //                     message: 'Invalid file type. Please upload a PDF file.',
    //                 });
    //             }

    //             // Get the temporary file path
    //             const tempFilePath = pdfFile.tempFilePath || pdfFile.filepath || pdfFile.path;

    //             if (!tempFilePath || !fs.existsSync(tempFilePath)) {
    //                 console.log('[extractBusinessDetails] Status: FAILED - Temp file not found at path:', tempFilePath);
    //                 return res.status(400).json({
    //                     success: false,
    //                     message: 'File not found. Please try uploading again.',
    //                 });
    //             }

    //             console.log('[extractBusinessDetails] Status: PDF successfully received and saved on backend', { tempFilePath });

    //             // Custom prompt for business and owner details extraction (matching form fields)
    //             const prompt = `Read the business application form and extract ONLY the fields listed below.

    // Rules:
    // - Return ONLY valid JSON. No explanations or extra text.
    // - Map values to the exact field names below. Do not mix or duplicate values.
    // - If a field is not found, use null.
    // - Use smart matching: map similar labels to the correct field (e.g. "Company Name" G?? business_name, "FICO Score" G?? fico_score).
    // - Combine Address 1 and Address 2 (if present) into a single address field, separated by comma or newline.
    // - Return a single JSON object with two keys: "business" and "owner", each containing only these fields:

    // business (object with exactly these keys):
    // - business_name (map from "Business Name", "Company Name")
    // - email (map from "Email", "Business Email")
    // - telephone (map from "Phone Number", "Phone", "Business Phone")
    // - website (map from "Website", "Web Address")
    // - incorporation_date (map from "Incorporation Date", format: dd-mm-yyyy or yyyy-mm-dd)
    // - incorporation_state (map from "Incorporation State", e.g. "FL", "NY")
    // - type_of_entity (map from "Type of Business Entity", "Entity Type")
    // - ein_number (map from "EIN Number", "EIN", "Federal Tax ID")
    // - gross_annual_sales (map from "Gross Annual Sales", "Annual Revenue", "Annual Sales", numeric value without $ symbol or commas)
    // - requested_amount (map from "Requested Amount", "Loan Amount", "Amount Requested", numeric value without $ symbol)
    // - business_address (combine "Address 1" and "Address 2" if both exist)
    // - city (map from "City")
    // - state (map from "State" - business address state)
    // - zip (map from "Zip Code", "ZIP Code")

    // owner (object with exactly these keys):
    // - owner_first_name (map from "First Name")
    // - owner_middle_name (map from "Middle Name" - optional, use null if not found)
    // - owner_last_name (map from "Last Name")
    // - owner_email (map from "Email", "Owner Email")
    // - phone (map from "Mobile Number", "Phone", "Cell Phone")
    // - date_of_birth (map from "Date of Birth", format: dd-mm-yyyy or yyyy-mm-dd)
    // - ssn (map from "Social Security Number", "SSN", format: XXX-XX-XXXX)
    // - fico_score (map from "FICO Score", "Credit Score", numeric value 300-850)
    // - ownership_start_date (map from "Ownership Start Date", format: dd-mm-yyyy or yyyy-mm-dd)
    // - ownership_percentage (map from "Ownership Percentage", numeric value 0-100, without % symbol)
    // - owner_home_address (combine "Address 1" and "Address 2" if both exist)
    // - owner_city (map from "City")
    // - owner_state (map from "State")
    // - owner_zip (map from "Zip Code", "ZIP Code")

    // Example structure: {"business":{"business_name":"ABC Corp","email":"info@abc.com","telephone":"(555) 123-4567",...},"owner":{"owner_first_name":"John","owner_last_name":"Doe",...}}`;

    //             // Extract data from PDF using Groq with custom prompt
    //             console.log('[extractBusinessDetails] Status: Starting PDF extraction (Groq)...');
    //             let extractedData: any;
    //             try {
    //                 extractedData = await pdfExtractionService.extractFromPDF(tempFilePath, prompt);
    //                 console.log('[extractBusinessDetails] Status: PDF extraction completed successfully');
    //             } catch (extractionError: any) {
    //                 console.error('PDF extraction service error:', {
    //                     message: extractionError?.message || extractionError,
    //                     stack: extractionError?.stack,
    //                 });
    //                 throw new Error(`PDF extraction failed: ${extractionError?.message || 'Unknown error'}`);
    //             }

    //             // Validate extracted data structure
    //             if (!extractedData || typeof extractedData !== 'object') {
    //                 throw new Error('Invalid extracted data structure. Expected {business: {...}, owner: {...}}');
    //             }
    //             if (!extractedData.business || typeof extractedData.business !== 'object') {
    //                 extractedData.business = {};
    //             }
    //             if (!extractedData.owner || typeof extractedData.owner !== 'object') {
    //                 extractedData.owner = {};
    //             }

    //             // Normalize keys: AI may return camelCase or mixed; ensure snake_case for expected fields
    //             const pickFirst = (obj: any, keys: string[]): any => {
    //                 if (!obj) return null;
    //                 for (const k of keys) {
    //                     const v = obj[k];
    //                     if (v != null && String(v).trim() !== '') return v;
    //                 }
    //                 return null;
    //             };
    //             // Pick from business, then fallback to root (in case AI put fields at top level)
    //             const pickBusiness = (keys: string[]): any =>
    //                 pickFirst(extractedData.business, keys) ?? pickFirst(extractedData, keys);
    //             const pickOwner = (keys: string[]): any =>
    //                 pickFirst(extractedData.owner, keys) ?? pickFirst(extractedData, keys);
    //             // Split "FirstName LastName" or "LastName, FirstName" into first and last
    //             const splitFullName = (full: string | null | undefined): { first: string | null; last: string | null } => {
    //                 if (!full || typeof full !== 'string') return { first: null, last: null };
    //                 const s = full.trim();
    //                 if (!s) return { first: null, last: null };
    //                 if (s.includes(',')) {
    //                     const [last, ...firstParts] = s.split(',').map((p) => p.trim());
    //                     return { first: firstParts.join(' ').trim() || null, last: last || null };
    //                 }
    //                 const parts = s.split(/\s+/).filter((p) => p);
    //                 if (parts.length === 1) return { first: parts[0], last: null };
    //                 return { first: parts[0], last: parts.slice(1).join(' ') };
    //             };

    //             const businessData: Record<string, any> = {
    //                 business_name: pickBusiness(['business_name', 'businessName', 'name', 'companyName', 'company_name']),
    //                 email: pickBusiness(['email']),
    //                 telephone: pickBusiness(['telephone', 'phone']),
    //                 website: pickBusiness(['website']),
    //                 incorporation_date: pickBusiness(['incorporation_date', 'incorporationDate']),
    //                 incorporation_state: pickBusiness(['incorporation_state', 'incorporationState']),
    //                 type_of_entity: pickBusiness(['type_of_entity', 'typeOfEntity']),
    //                 ein_number: pickBusiness(['ein_number', 'einNumber']),
    //                 gross_annual_sales: pickBusiness(['gross_annual_sales', 'grossAnnualSales']),
    //                 requested_amount: pickBusiness(['requested_amount', 'requestedAmount']),
    //                 business_address: pickBusiness(['business_address', 'businessAddress']),
    //                 city: pickBusiness(['city']),
    //                 state: pickBusiness(['state']),
    //                 zip: pickBusiness(['zip', 'zipCode']),
    //             };
    //             const ownerFirst = pickOwner(['owner_first_name', 'ownerFirstName', 'firstName', 'first_name']);
    //             const ownerLast = pickOwner(['owner_last_name', 'ownerLastName', 'lastName', 'last_name']);
    //             const ownerFullName = pickOwner(['owner_name', 'ownerName', 'name', 'full_name', 'fullName']);
    //             const { first: splitFirst, last: splitLast } = splitFullName(ownerFullName);
    //             const ownerData: Record<string, any> = {
    //                 owner_first_name: ownerFirst ?? splitFirst,
    //                 owner_middle_name: pickOwner(['owner_middle_name', 'ownerMiddleName', 'middleName', 'middle_name']),
    //                 owner_last_name: ownerLast ?? splitLast,
    //                 owner_email: pickOwner(['owner_email', 'ownerEmail', 'email']),
    //                 phone: pickOwner(['phone', 'mobileNumber']),
    //                 date_of_birth: pickOwner(['date_of_birth', 'dateOfBirth']),
    //                 ssn: pickOwner(['ssn']),
    //                 fico_score: pickOwner(['fico_score', 'ficoScore']),
    //                 ownership_start_date: pickOwner(['ownership_start_date', 'ownershipStartDate']),
    //                 ownership_percentage: pickOwner(['ownership_percentage', 'ownershipPercentage']),
    //                 owner_home_address: pickOwner(['owner_home_address', 'ownerHomeAddress']),
    //                 owner_city: pickOwner(['owner_city', 'ownerCity', 'city']),
    //                 owner_state: pickOwner(['owner_state', 'ownerState', 'state']),
    //                 owner_zip: pickOwner(['owner_zip', 'ownerZip', 'zip']),
    //             };
    //             extractedData.business = businessData;
    //             extractedData.owner = ownerData;
    //             const requiredStr = (v: any) => (v != null && String(v).trim() !== '' ? String(v).trim() : null);
    //             const hasRequiredFields = !!(
    //                 requiredStr(businessData.business_name) &&
    //                 requiredStr(ownerData.owner_first_name) &&
    //                 requiredStr(ownerData.owner_last_name)
    //             );

    //             // If required fields are missing, return partial extraction (200) so frontend can show extracted data
    //             if (!hasRequiredFields) {
    //                 console.log('[extractBusinessDetails] Status: Partial extraction - missing required fields', {
    //                     business_name: !!requiredStr(businessData.business_name),
    //                     owner_first_name: !!requiredStr(ownerData.owner_first_name),
    //                     owner_last_name: !!requiredStr(ownerData.owner_last_name),
    //                     normalized: { business_name: businessData.business_name, owner_first_name: ownerData.owner_first_name, owner_last_name: ownerData.owner_last_name },
    //                 });
    //                 try {
    //                     if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    //                 } catch (_) {}
    //                 return res.status(200).json({
    //                     success: true,
    //                     message: 'Partial extraction: some required fields (business name, owner first/last name) could not be extracted. Please complete and submit manually.',
    //                     data: {
    //                         business: businessData,
    //                         owner: ownerData,
    //                         extractedData: { business: businessData, owner: ownerData },
    //                         partialExtraction: true,
    //                     },
    //                 });
    //             }

    //             // Get current logged-in user
    //             const currentUserId = (req as any).user?.id;
    //             if (!currentUserId) {
    //                 throw new Error('User authentication required');
    //             }

    //             // Helper function to parse address (split combined address into address1 and address2)
    //             const parseAddress = (address: string | null | undefined): { address1: string; address2: string } => {
    //                 if (!address) return { address1: '', address2: '' };
    //                 const parts = address.split(/[,\n]/).map(p => p.trim()).filter(p => p);
    //                 return {
    //                     address1: parts[0] || '',
    //                     address2: parts.slice(1).join(', ') || '',
    //                 };
    //             };

    //             // Helper to parse numeric amount (remove commas, spaces, $, etc.)
    //             const parseNumericAmount = (value: string | number | null | undefined): number | null => {
    //                 if (value === null || value === undefined) return null;
    //                 const str = String(value).replace(/[$,\s]/g, '').trim();
    //                 if (!str) return null;
    //                 const num = parseFloat(str);
    //                 return isNaN(num) ? null : num;
    //             };

    //             // Parse Gross Annual Sales and calculate monthly revenue (annual ++ 12)
    //             const grossAnnualRaw = businessData.gross_annual_sales;
    //             const annualRevenue = parseNumericAmount(grossAnnualRaw);
    //             const monthlyRevenue = annualRevenue != null ? Math.round((annualRevenue / 12) * 100) / 100 : null;

    //             // Helper function to parse date string to Date object
    //             const parseDate = (dateStr: string | null | undefined): Date | null => {
    //                 if (!dateStr) return null;
    //                 try {
    //                     // Try common date formats: dd-mm-yyyy, yyyy-mm-dd, mm/dd/yyyy
    //                     const formats = [
    //                         /^(\d{2})-(\d{2})-(\d{4})$/, // dd-mm-yyyy
    //                         /^(\d{4})-(\d{2})-(\d{2})$/, // yyyy-mm-dd
    //                         /^(\d{2})\/(\d{2})\/(\d{4})$/, // mm/dd/yyyy
    //                     ];

    //                     for (const format of formats) {
    //                         const match = dateStr.match(format);
    //                         if (match) {
    //                             if (format === formats[0]) {
    //                                 // dd-mm-yyyy
    //                                 return new Date(`${match[3]}-${match[2]}-${match[1]}`);
    //                             } else if (format === formats[1]) {
    //                                 // yyyy-mm-dd
    //                                 return new Date(dateStr);
    //                             } else if (format === formats[2]) {
    //                                 // mm/dd/yyyy
    //                                 return new Date(`${match[3]}-${match[1]}-${match[2]}`);
    //                             }
    //                         }
    //                     }
    //                     // Fallback: try direct Date parsing
    //                     const parsed = new Date(dateStr);
    //                     return isNaN(parsed.getTime()) ? null : parsed;
    //                 } catch {
    //                     return null;
    //                 }
    //             };

    //             // Transform extracted data to client creation format
    //             const businessAddress = parseAddress(businessData.business_address);
    //             const ownerAddress = parseAddress(ownerData.owner_home_address);

    //             // Normalize for comparison: EIN = digits only (last 9), SSN = digits only (last 4 or full 9)
    //             const normalizeEin = (ein: string | null | undefined) =>
    //                 ein ? String(ein).replace(/\D/g, '').slice(-9) : null;
    //             const normalizeSsn = (ssn: string | null | undefined) =>
    //                 ssn ? String(ssn).replace(/\D/g, '') : null;

    //             // Avoid duplicate client: find existing by EIN, then business name + email, then owner SSN + business name
    //             let createdClient: any;
    //             let existingClient = false;
    //             const einNormalized = normalizeEin(businessData.ein_number);
    //             const businessNameNorm = businessData.business_name?.trim() || '';
    //             const businessEmailNorm = businessData.email?.trim().toLowerCase() || '';
    //             const ownerSsnNorm = normalizeSsn(ownerData.ssn);

    //             // 1) Match by EIN (strongest)
    //             if (einNormalized) {
    //                 const clientsWithEin = await prisma.client.findMany({
    //                     where: { businessEinNumber: { not: null } },
    //                     orderBy: { createdAt: 'desc' },
    //                     take: 500,
    //                 });
    //                 const existingByEin = clientsWithEin.find(
    //                     (c) => normalizeEin(c.businessEinNumber) === einNormalized
    //                 );
    //                 if (existingByEin) {
    //                     createdClient = existingByEin;
    //                     existingClient = true;
    //                     console.log(`G?+n+? Using existing client (matched by EIN): ${createdClient.businessName} (ID: ${createdClient.clientId})`);
    //                 }
    //             }

    //             // 2) Match by business name + business email (case-insensitive)
    //             if (!createdClient && businessNameNorm && businessEmailNorm) {
    //                 const existingByBusiness = await prisma.client.findFirst({
    //                     where: {
    //                         businessName: { equals: businessNameNorm, mode: 'insensitive' },
    //                         businessEmail: { equals: businessEmailNorm, mode: 'insensitive' },
    //                     },
    //                     orderBy: { createdAt: 'desc' },
    //                 });
    //                 if (existingByBusiness) {
    //                     createdClient = existingByBusiness;
    //                     existingClient = true;
    //                     console.log(`G?+n+? Using existing client (matched by business name + email): ${createdClient.businessName} (ID: ${createdClient.clientId})`);
    //                 }
    //             }

    //             // 3) Match by owner SSN + business name (when EIN/email missing or different)
    //             if (!createdClient && ownerSsnNorm && businessNameNorm && ownerSsnNorm.length >= 4) {
    //                 const ssnLast4 = ownerSsnNorm.slice(-4);
    //                 const clientsWithSsn = await prisma.client.findMany({
    //                     where: {
    //                         ownerSsn: { not: null },
    //                         businessName: { equals: businessNameNorm, mode: 'insensitive' },
    //                     },
    //                     orderBy: { createdAt: 'desc' },
    //                     take: 200,
    //                 });
    //                 const existingByOwner = clientsWithSsn.find((c) => {
    //                     const cSsn = normalizeSsn(c.ownerSsn);
    //                     return cSsn && (cSsn === ownerSsnNorm || cSsn.slice(-4) === ssnLast4);
    //                 });
    //                 if (existingByOwner) {
    //                     createdClient = existingByOwner;
    //                     existingClient = true;
    //                     console.log(`G?+n+? Using existing client (matched by owner SSN + business name): ${createdClient.businessName} (ID: ${createdClient.clientId})`);
    //                 }
    //             }

    //             if (!createdClient) {
    //                 // Create client only when no duplicate found
    //                 console.log('\n=??? Creating client automatically...');
    //                 try {
    //                     createdClient = await prisma.client.create({
    //                         data: {
    //                             businessName: businessData.business_name,
    //                             businessEmail: businessData.email || null,
    //                             businessNumber: businessData.telephone || null,
    //                             businessWebsite: businessData.website || null,
    //                             businessIncorporationDate: parseDate(businessData.incorporation_date),
    //                             businessIncorporationState: businessData.incorporation_state || null,
    //                             businessEntityType: businessData.type_of_entity || null,
    //                             businessEinNumber: businessData.ein_number || null,
    //                             businessAnnualRevenue: annualRevenue ?? null,
    //                             businessMonthlyRevenue: monthlyRevenue ?? null,
    //                             businessAddress1: businessAddress.address1 || null,
    //                             businessAddress2: businessAddress.address2 || null,
    //                             businessCity: businessData.city || null,
    //                             businessState: businessData.state || null,
    //                             businessZipCode: businessData.zip || null,
    //                             ownerFirstName: ownerData.owner_first_name,
    //                             ownerMiddleName: ownerData.owner_middle_name || null,
    //                             ownerLastName: ownerData.owner_last_name,
    //                             ownerEmail: ownerData.owner_email || null,
    //                             ownerMobileNumber: ownerData.phone || null,
    //                             ownerDateOfBirth: parseDate(ownerData.date_of_birth),
    //                             ownerSsn: ownerData.ssn || null,
    //                             ownerFicoScore: ownerData.fico_score ? Number(ownerData.fico_score) : null,
    //                             ownerOwnershipStartDate: parseDate(ownerData.ownership_start_date),
    //                             ownerOwnershipPercentage: ownerData.ownership_percentage ? Number(ownerData.ownership_percentage) : null,
    //                             ownerAddress1: ownerAddress.address1 || null,
    //                             ownerAddress2: ownerAddress.address2 || null,
    //                             ownerCity: ownerData.owner_city || null,
    //                             ownerState: ownerData.owner_state || null,
    //                             ownerZipCode: ownerData.owner_zip || null,
    //                             createdById: currentUserId,
    //                         },
    //                     });
    //                     console.log(`G?? Client created successfully: ${createdClient.businessName} (ID: ${createdClient.clientId})`);
    //                 } catch (clientError: any) {
    //                     console.error('Failed to create client:', clientError);
    //                     throw new Error(`Client creation failed: ${clientError?.message || 'Unknown error'}`);
    //                 }
    //             }

    //             // Update existing client with extracted annual/monthly revenue (runs after PDF extraction)
    //             if (createdClient && existingClient && (annualRevenue != null || monthlyRevenue != null)) {
    //                 try {
    //                     createdClient = await prisma.client.update({
    //                         where: { id: createdClient.id },
    //                         data: {
    //                             ...(annualRevenue != null && { businessAnnualRevenue: annualRevenue }),
    //                             ...(monthlyRevenue != null && { businessMonthlyRevenue: monthlyRevenue }),
    //                         },
    //                     });
    //                     console.log(`G?? Updated client revenue from PDF: annual=${annualRevenue}, monthly=${monthlyRevenue}`);
    //                 } catch (updateErr: any) {
    //                     console.warn('Failed to update client revenue:', updateErr?.message);
    //                 }
    //             }

    //             // Transform client to API format (similar to mapClientToApi)
    //             const mapClientToApi = (client: any) => {
    //                 if (!client) return client;
    //                 return {
    //                     _id: client.id,
    //                     id: client.id,
    //                     clientId: client.clientId,
    //                     business: {
    //                         name: client.businessName,
    //                         email: client.businessEmail || '',
    //                         number: client.businessNumber || '',
    //                         website: client.businessWebsite || '',
    //                         incorporationDate: client.businessIncorporationDate,
    //                         incorporationState: client.businessIncorporationState || '',
    //                         businessEntityType: client.businessEntityType || '',
    //                         einNumber: client.businessEinNumber || '',
    //                         annualRevenue: client.businessAnnualRevenue ?? undefined,
    //                         monthlyRevenue: client.businessMonthlyRevenue ?? undefined,
    //                         address: {
    //                             address1: client.businessAddress1 || '',
    //                             address2: client.businessAddress2 || '',
    //                             city: client.businessCity || '',
    //                             state: client.businessState || '',
    //                             zipCode: client.businessZipCode || '',
    //                         },
    //                     },
    //                     owner: {
    //                         firstName: client.ownerFirstName,
    //                         middleName: client.ownerMiddleName || '',
    //                         lastName: client.ownerLastName,
    //                         email: client.ownerEmail || '',
    //                         mobileNumber: client.ownerMobileNumber || '',
    //                         dateOfBirth: client.ownerDateOfBirth,
    //                         ssn: client.ownerSsn || '',
    //                         ficoScore: client.ownerFicoScore ?? undefined,
    //                         ownershipStartDate: client.ownerOwnershipStartDate,
    //                         ownershipPercentage: client.ownerOwnershipPercentage ?? undefined,
    //                         address: {
    //                             address1: client.ownerAddress1 || '',
    //                             address2: client.ownerAddress2 || '',
    //                             city: client.ownerCity || '',
    //                             state: client.ownerState || '',
    //                             zipCode: client.ownerZipCode || '',
    //                         },
    //                     },
    //                     status: client.status,
    //                     notes: client.notes || '',
    //                     createdAt: client.createdAt,
    //                     updatedAt: client.updatedAt,
    //                 };
    //             };

    //             // Upload PDF file to Cloudinary and attach to application
    //             const uploadedFiles: any[] = [];
    //             try {
    //                 const folder = 'ih-crm/applications';
    //                 // Use the temp file for upload (uploadService expects a file object with path)
    //                 const fileToUpload = {
    //                     ...pdfFile,
    //                     tempFilePath: tempFilePath,
    //                     filepath: tempFilePath,
    //                     path: tempFilePath,
    //                 };
    //                 const uploadResult = await uploadService.uploadFile(fileToUpload, folder);
    //                 if (uploadResult.success && uploadResult.data) {
    //                     uploadedFiles.push({
    //                         url: uploadResult.data.secure_url,
    //                         publicId: uploadResult.data.public_id,
    //                         originalName: pdfFile.name,
    //                         mimeType: 'application/pdf',
    //                         size: pdfFile.size,
    //                         uploadedAt: new Date(),
    //                     });
    //                     console.log(`G?? PDF uploaded to Cloudinary: ${uploadResult.data.secure_url}`);
    //                 }
    //             } catch (uploadError) {
    //                 console.warn('Failed to upload PDF to Cloudinary:', uploadError);
    //                 // Continue with application creation even if PDF upload fails
    //             }

    //             // Parse loan amount from requested_amount
    //             const loanAmount = businessData.requested_amount
    //                 ? parseFloat(String(businessData.requested_amount).replace(/[^0-9.-]+/g, ''))
    //                 : null;

    //             // Avoid duplicate application: same client + same user + type New within last 24 hours
    //             let existingApplication = false;
    //             const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    //             let createdApplication: any = await prisma.application.findFirst({
    //                 where: {
    //                     clientId: createdClient.id,
    //                     type: 'New',
    //                     createdById: currentUserId,
    //                     createdAt: { gte: since },
    //                 },
    //                 orderBy: { createdAt: 'desc' },
    //                 include: {
    //                     referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                     salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                     createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                     client: true,
    //                     files: true,
    //                 },
    //             });

    //             if (createdApplication) {
    //                 existingApplication = true;
    //                 console.log(`G?+n+? Using existing application (no duplicate): Application #${createdApplication.applicationId}`);
    //                 if (uploadedFiles.length > 0) {
    //                     try {
    //                         await prisma.applicationFile.createMany({
    //                             data: uploadedFiles.map((f) => ({
    //                                 applicationId: createdApplication.id,
    //                                 url: f.url,
    //                                 publicId: f.publicId,
    //                                 originalName: f.originalName,
    //                                 mimeType: f.mimeType,
    //                                 size: f.size,
    //                                 uploadedAt: f.uploadedAt,
    //                             })),
    //                         });
    //                         const withFiles = await prisma.application.findUnique({
    //                             where: { id: createdApplication.id },
    //                             include: {
    //                                 referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                                 salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                                 createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                                 client: true,
    //                                 files: true,
    //                             },
    //                         });
    //                         if (withFiles) createdApplication = withFiles;
    //                     } catch (e) {
    //                         console.warn('Failed to attach PDF to existing application:', e);
    //                     }
    //                 }
    //             } else {
    //                 // Create application when no recent duplicate
    //                 console.log('\n=??? Creating application automatically...');
    //                 try {
    //                     createdApplication = await prisma.application.create({
    //                         data: {
    //                             priority: 'High', // Priority 1 = High priority
    //                             type: 'New', // New Application
    //                             salesRepresentativeId: currentUserId,
    //                             referringAgentId: currentUserId,
    //                             clientId: createdClient.id,
    //                             loanAmount: !isNaN(loanAmount as number) ? (loanAmount as number) : null,
    //                             createdById: currentUserId,
    //                             files: uploadedFiles.length
    //                                 ? {
    //                                       createMany: {
    //                                           data: uploadedFiles.map((f) => ({
    //                                               url: f.url,
    //                                               publicId: f.publicId,
    //                                               originalName: f.originalName,
    //                                               mimeType: f.mimeType,
    //                                               size: f.size,
    //                                               uploadedAt: f.uploadedAt,
    //                                           })),
    //                                       },
    //                                   }
    //                                 : undefined,
    //                         },
    //                         include: {
    //                             referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                             salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                             createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    //                             client: true,
    //                             files: true,
    //                         },
    //                     });
    //                     console.log(`G?? Application created successfully: Application #${createdApplication.applicationId}`);
    //                 } catch (appError: any) {
    //                     console.error('Failed to create application:', appError);
    //                     throw new Error(`Application creation failed: ${appError?.message || 'Unknown error'}`);
    //                 }
    //             }

    //             const populatedApplication = mapApplicationToApi(createdApplication);
    //             const mappedClient = mapClientToApi(createdClient);

    //             // Clean up temporary file
    //             try {
    //                 if (fs.existsSync(tempFilePath)) {
    //                     fs.unlinkSync(tempFilePath);
    //                 }
    //             } catch (cleanupError) {
    //                 console.warn('Failed to cleanup temporary file:', cleanupError);
    //             }

    //             console.log('[extractBusinessDetails] Status: SUCCESS - Client and Application created from PDF extraction');
    //             return res.status(200).json({
    //                 success: true,
    //                 message: 'Client and Application created successfully from PDF extraction.',
    //                 data: {
    //                     client: mappedClient,
    //                     application: populatedApplication,
    //                     extractedData: extractedData, // Include raw extracted data for reference
    //                     existingClient,
    //                     existingApplication,
    //                 },
    //             });
    //         } catch (error: any) {
    //             const msg = error?.message || 'Failed to extract business details from PDF';
    //             console.error('Business details extraction error:', {
    //                 message: msg,
    //                 stack: error?.stack,
    //                 name: error?.name,
    //                 code: error?.code,
    //             });
    //             // 400 when PDF has no/insufficient text (image-only, scanned, or empty)
    //             const isInsufficientText = /too little|no text|image-only|scanned|OCR/i.test(msg);
    //             return res.status(isInsufficientText ? 400 : 500).json({
    //                 success: false,
    //                 message: msg,
    //                 error: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
    //             });
    //         }
    //     }
    // Send approval email to client for a given application (async email, non-blocking)
    async sendApprovalEmail(req: Request, res: Response) {
        try {
            const { applicationId, resend, reinitiateContract, emailHtml: clientEmailHtmlRaw, emailSubject: clientEmailSubjectRaw, isoEmail: isoEmailOverride, ccEmails, toEmails, scrubbingPreviewHtml: scrubbingPreviewHtmlRaw } = req.body as {
                applicationId?: string | number;
                resend?: boolean;
                /** When true with resend, archive the prior contract envelope and reset for regeneration. */
                reinitiateContract?: boolean;
                /** Frontend-rendered branded approval HTML (backend injects URL / ISO name / business name). */
                emailHtml?: string;
                emailSubject?: string;
                /** Optional override for the linked ISO recipient email. */
                isoEmail?: string;
                /** Optional CC recipients on the approval / offer-updated template email. */
                ccEmails?: string[] | string;
                /** To recipients confirmed in the popup (chips); overrides `isoEmail` when non-empty. */
                toEmails?: string[] | string;
                /** Scrubbing Preview Copy HTML; appended below the final approval / offer-updated mail. */
                scrubbingPreviewHtml?: unknown;
            };
            const clientEmailSubject =
                typeof clientEmailSubjectRaw === 'string' && clientEmailSubjectRaw.trim()
                    ? clientEmailSubjectRaw.trim()
                    : undefined;
            const parsedCcEmails = (() => {
                if (Array.isArray(ccEmails)) {
                    return ccEmails.map((e: unknown) => String(e || '').trim()).filter(Boolean);
                }
                if (typeof ccEmails === 'string' && ccEmails.trim()) {
                    return ccEmails
                        .split(/[,;]+/)
                        .map((e) => e.trim())
                        .filter(Boolean);
                }
                return [];
            })();
            const isoEmailOverrideTrimmed =
                typeof isoEmailOverride === 'string' ? isoEmailOverride.trim() : '';
            const toEmailsOverride = (() => {
                const raw = Array.isArray(toEmails)
                    ? toEmails
                    : typeof toEmails === 'string'
                      ? toEmails.split(/[,;]+/)
                      : [];
                const list = raw.map((e: unknown) => String(e || '').trim()).filter(Boolean);
                return list.filter(
                    (e, i) => list.findIndex((x) => x.toLowerCase() === e.toLowerCase()) === i,
                );
            })();
            const uniqueCcList = [...new Set(parsedCcEmails.map((e) => e.toLowerCase()))]
                .map((lower) => parsedCcEmails.find((e) => e.toLowerCase() === lower) || lower);

            if (!applicationId) {
                return res.status(400).json({
                    success: false,
                    message: 'applicationId is required',
                });
            }

            const authUser = getAuthenticatedUser(req);
            // The ISO approval mail is Super Admin's decision; underwriters and scrubbers
            // record theirs internally (the submissions inbox) and never mail the ISO.
            const senderRole = String(authUser?.role || '').toUpperCase().replace(/-/g, '_');
            if (senderRole === 'UNDERWRITER' || senderRole === 'FINALUNDERWRITER' || senderRole === 'SCRUBBING') {
                return res.status(403).json({
                    success: false,
                    message: 'Only Super Admin can send the approval email to the ISO.',
                });
            }
            const applicationIdStr = String(applicationId);

            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationIdStr)
                ? { applicationId: Number(applicationIdStr) }
                : { id: applicationIdStr };

            const { application, forbidden } = await getApplicationForUser(
                whereClause,
                authUser,
                {
                    client: true,
                    iso: true,
                    termsOffers: {
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: {
                            approvedAmount: true,
                            factorRate: true,
                            paybackAmount: true,
                            termLength: true,
                            frequency: true,
                            paymentAmount: true,
                        },
                    },
                    OfferDecision: {
                        select: {
                            term: true,
                            frequency: true,
                            repayPerPeriod: true,
                            monthlyPayment: true,
                            offer: true,
                            rate: true,
                            totalRemit: true,
                            fees: true,
                        },
                    },
                }
            );

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            // The approval mail never goes out without an offer amount, whoever sends it.
            if (await blockIfNoOffer(res, authUser?.role, application.id, true)) {
                return;
            }

            const client: any = (application as any).client;
            let iso: any = (application as any).iso;

            const clientBusinessName = client?.businessName || 'Unknown Business';
            let isoName = String(iso?.name || '').trim();
            let isoEmailRaw = String(iso?.email || '').trim();
            const appIsoId = (application as any).isoId ? String((application as any).isoId).trim() : '';

            if (!appIsoId) {
                return res.status(400).json({
                    success: false,
                    message:
                        'This application is not linked to an ISO. Link an ISO to the deal before sending the approval email (only the ISO record receives this message).',
                });
            }

            if (!iso || !isoEmailRaw) {
                const isoRow = await prisma.iso.findUnique({
                    where: { id: appIsoId },
                    select: { name: true, email: true },
                });
                if (isoRow) {
                    iso = { ...iso, ...isoRow };
                    isoName = isoName || String(isoRow.name || '').trim();
                    isoEmailRaw = isoEmailRaw || String(isoRow.email || '').trim();
                }
            }

            const merchantGreetingName =
                `${client?.ownerFirstName || ''} ${client?.ownerLastName || ''}`.trim() ||
                clientBusinessName ||
                'there';
            const companyName = clientBusinessName;

            const merchantFullName =
                `${client?.ownerFirstName || ''} ${client?.ownerLastName || ''}`.trim() || undefined;
            const { merchantEmail, merchantPhone } = resolveMerchantContactForOfferEmail(client);
            const latestTermsOffer = (application as any).termsOffers?.[0] ?? null;
            const offerDecision = (application as any).OfferDecision ?? null;
            const offerApplicationNumber = (application as any).applicationId ?? undefined;
            const offerApprovedAmount =
                latestTermsOffer?.approvedAmount != null
                    ? Number(latestTermsOffer.approvedAmount)
                    : offerDecision?.offer != null
                      ? Number(offerDecision.offer)
                      : undefined;
            const offerFactorRate =
                latestTermsOffer?.factorRate != null
                    ? Number(latestTermsOffer.factorRate)
                    : offerDecision?.rate != null
                      ? Number(offerDecision.rate)
                      : undefined;
            const offerRepaymentAmount =
                latestTermsOffer?.paybackAmount != null
                    ? Number(latestTermsOffer.paybackAmount)
                    : offerDecision?.totalRemit != null
                      ? Number(offerDecision.totalRemit)
                      : undefined;

            if (!isoEmailRaw && !isoEmailOverrideTrimmed && !toEmailsOverride.length) {
                return res.status(400).json({
                    success: false,
                    message:
                        'The linked ISO has no email on file. Add an email to that ISO in the broker/ISO settings, or enter a recipient email when sending.',
                });
            }

            const isoEmailToUse = toEmailsOverride[0] || isoEmailOverrideTrimmed || isoEmailRaw;
            const isoToList = toEmailsOverride.length ? toEmailsOverride : [isoEmailToUse];
            // The ISO approval copies the submissions inbox too (removable in the popup).
            const uniqueCcForSend = [
                ...uniqueCcList,
                ...getSubmissionsInboxEmails().filter(
                    (e) =>
                        !isDefaultCcRemoved(e) &&
                        !uniqueCcList.some((c) => c.toLowerCase() === e.toLowerCase()),
                ),
            ].filter((e) => !isoToList.some((to) => to.toLowerCase() === e.toLowerCase()));

            try {
                await syncTermsOfferFromOfferDecision(
                    (application as any).id,
                    authUser?.id ?? null,
                );
            } catch (syncErr) {
                console.error('Send approval email: failed to sync terms offer from offer decision:', syncErr);
            }

            const baseUrl = resolveCrmFrontendBaseUrl() || '';

            const fallbackId = (application as any).id;

            if (!fallbackId) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to resolve application id for approval link',
                });
            }

            let approvalLinkToken = fallbackId;
            try {
                const portalToken = await createPublicPortalToken(fallbackId, { expiresInDays: 90 });
                if (portalToken) {
                    approvalLinkToken = portalToken;
                }
            } catch (tokenErr) {
                console.error('Approval email: public portal token failed, using application id in link:', tokenErr);
            }

            const publicApprovalUrl = baseUrl
                ? buildPublicApprovalPortalUrl(baseUrl, approvalLinkToken)
                : undefined;
            const viewApplicationUrl = publicApprovalUrl;
            const calculateApprovalUrl = publicApprovalUrl;

            const isoRecipientName = isoName || isoEmailToUse || merchantGreetingName;
            // One message to every To recipient confirmed in the popup.
            const recipients: { to: string | string[]; clientName: string }[] = [
                { to: isoToList.length > 1 ? isoToList : isoEmailToUse, clientName: isoRecipientName },
            ];

            const emailSubject =
                clientEmailSubject ||
                (resend ? 'Your Offer Values Have Been Updated' : 'Your Application Has Been Approved');

            /**
             * Prefer the CRM frontend-rendered HTML for native tenant logins.
             * Super Admin proxy: ignore SA FE HTML (platform branding) and always render
             * this tenant's current ISO templates (same as FE applicationApprovalEmailHtml /
             * offerUpdatedEmailHtml) ? never the legacy progress-tracker layouts.
             */
            const useTenantServerTemplate = Boolean((req as any).isSuperAdminProxy);
            const frontendEmailHtml =
                !useTenantServerTemplate &&
                typeof clientEmailHtmlRaw === 'string' &&
                clientEmailHtmlRaw.trim()
                    ? injectApplicationApprovalEmailValues(clientEmailHtmlRaw.trim(), {
                        approvalUrl: calculateApprovalUrl,
                        clientName: isoRecipientName,
                        companyName,
                    })
                    : undefined;
            const baseEmailHtml =
                frontendEmailHtml ??
                resolveIsoApprovalEmailHtml({
                    resend: !!resend,
                    clientName: isoRecipientName,
                    companyName,
                    calculateApprovalUrl,
                });
            // First approval email shows the approved amount, factor rate and term.
            const emailHtml = resend
                ? baseEmailHtml
                : fillApprovalOfferTerms(baseEmailHtml, await buildApprovalOfferTermsHtml(fallbackId));
            // Scrubbing Preview Copy HTML (optional) goes below the final template for every
            // recipient and delivery path; the audit log keeps the template only.
            const scrubbingPreviewHtml = sanitizeScrubbingPreviewHtml(scrubbingPreviewHtmlRaw);
            const deliveryEmailHtml = scrubbingPreviewHtml
                ? appendBelowEmailBody(emailHtml, scrubbingPreviewHtml)
                : emailHtml;

            const trackingId = randomUUID();
            const approvalEmailLogSuffix = resend
                ? ' resent updated offer email to the linked ISO.'
                : ' sent approval email to the linked ISO.';
            const authUserForLog = getAuthenticatedUser(req);
            const roleLabel = authUserForLog?.role
                ? String(authUserForLog.role).toUpperCase().replace(/_/g, ' ')
                : 'User';
            const actorName = (req as any).user?.name || '';

            try {
                await recordCommunicationAudit(req, {
                    outboundCommunicationId: trackingId,
                    applicationId: (application as any).id,
                    channel: 'EMAIL',
                    recipientType: 'ISO',
                    recipient: isoToList.join(', '),
                    subject: emailSubject,
                    body: emailHtml,
                    templateName: resend ? 'Update offer template' : 'Application approved template',
                    actionType: 'APPROVED',
                    user: authUserForLog,
                    currentStatus: `${(application as any).currentQueue} / ${(application as any).currentState}`,
                    actionDescription: `${roleLabel} ${actorName}`.trim() + approvalEmailLogSuffix,
                    metadata: {
                        emailSentTo: isoToList,
                        ccEmails: uniqueCcForSend,
                        sentToLinkedIsoOnly: !isoEmailOverrideTrimmed && !toEmailsOverride.length,
                        resend: !!resend,
                        template: resend ? 'offer-updated' : 'approval',
                        status: 'sent',
                        delivery: {
                            status: 'sent',
                            sentAt: new Date().toISOString(),
                        },
                    },
                });
            } catch (logError) {
                console.error('Failed to create activity log for approval email:', logError);
            }

            const deliveryResults = await Promise.all(
                recipients.map(async ({ to, clientName }) => {
                    const submissionApplication = {
                        note: (application as { note?: string | null }).note,
                        createdById: (application as { createdById?: string | null }).createdById,
                        client: (application as { client?: { notes?: string | null } | null }).client,
                    };
                    const sendResult = resend
                        ? await sendApplicationOfferUpdatedEmail({
                            to,
                            cc: uniqueCcForSend.length ? uniqueCcForSend : undefined,
                            clientName,
                            companyName,
                            viewApplicationUrl,
                            calculateApprovalUrl,
                            applicationNumber: offerApplicationNumber,
                            merchantName: merchantFullName,
                            merchantEmail,
                            merchantPhone,
                            approvedAmount: offerApprovedAmount,
                            factorRate: offerFactorRate,
                            repaymentAmount: offerRepaymentAmount,
                            html: deliveryEmailHtml,
                            subject: emailSubject,
                            trackingId,
                            submissionApplication,
                        })
                        : await sendApplicationApprovalEmail({
                            to,
                            cc: uniqueCcForSend.length ? uniqueCcForSend : undefined,
                            clientName,
                            companyName,
                            viewApplicationUrl,
                            calculateApprovalUrl,
                            html: deliveryEmailHtml,
                            subject: emailSubject,
                            trackingId,
                            submissionApplication,
                        });
                    return {
                        to,
                        ok: sendResult.sent,
                        sgMessageId: sendResult.sgMessageId,
                    };
                }),
            );
            const anyDelivered = deliveryResults.some((r) => r.ok);
            if (!anyDelivered) {
                return res.status(502).json({
                    success: false,
                    message:
                        'Could not deliver approval notification email. Check: (1) DISABLE_CLIENT_APPLICATION_EMAILS is not true, (2) SENDGRID_API_KEY or SMTP_AUTH_USER / SMTP_AUTH_PASS, (3) recipient spam folder.',
                    data: { attempted: deliveryResults },
                });
            }

            const shouldReinitiateContract = !!resend && !!reinitiateContract;
            if (shouldReinitiateContract) {
                try {
                    await reinitiateContractForApplication(String(fallbackId), {
                        user: getAuthenticatedUser(req),
                        req,
                        actorName: String((req as any).user?.name || ''),
                        source: 'applicationController.sendApprovalEmail',
                    });
                } catch (reinitErr) {
                    console.error(
                        'Send approval email: contract reinitiation failed:',
                        reinitErr,
                    );
                }
            }

            try {
                const outbound = await prisma.outbound_communications.findUnique({
                    where: { id: trackingId },
                    select: { metadata: true },
                });
                const prior =
                    outbound?.metadata &&
                    typeof outbound.metadata === 'object' &&
                    !Array.isArray(outbound.metadata)
                        ? (outbound.metadata as Record<string, unknown>)
                        : {};
                await prisma.outbound_communications.update({
                    where: { id: trackingId },
                    data: {
                        metadata: {
                            ...prior,
                            emailDelivery: deliveryResults,
                        } as object,
                    },
                });
            } catch (metaErr) {
                console.error('Failed to update approval email delivery metadata:', metaErr);
            }

            const deliveredSgMessageId = deliveryResults.find(
                (r) => r.ok && r.sgMessageId,
            )?.sgMessageId;
            if (deliveredSgMessageId) {
                try {
                    await storeSgMessageIdOnOutbound(trackingId, deliveredSgMessageId);
                } catch (metaErr) {
                    console.error('Failed to store SendGrid message id for approval email:', metaErr);
                }
            }

            try {
                const normalizedActorRole = String(authUser?.role || '')
                    .toUpperCase()
                    .replace(/-/g, '_');
                const shouldCreditUnderwriterApproval =
                    normalizedActorRole === 'UNDERWRITER';
                const underwriterApprovalPatch = shouldCreditUnderwriterApproval
                    ? patchRecordUnderwriterApproval(authUser, {
                          assignedUnderwriterId: (application as any).assignedUnderwriterId,
                          claimedByUnderwriterId: (application as any).claimedByUnderwriterId,
                          approvedByUnderwriterId: (application as any).approvedByUnderwriterId,
                      })
                    : undefined;

                await prisma.application.update({
                    where: { id: fallbackId },
                    data: {
                        currentQueue: APPROVAL_SENT_QUEUE,
                        currentState: APPROVAL_SENT_STATE,
                        // Approved after an earlier decline: drop the stale decline label.
                        ...(/declin|reject/i.test(String((application as any).underwriterAction ?? ''))
                            ? { underwriterAction: UNDERWRITER_ACTION_APPROVED }
                            : {}),
                        ...(underwriterApprovalPatch ?? {}),
                    },
                });
            } catch (stageErr) {
                console.error(
                    'Send approval email: failed to set application to Approval Sent:',
                    stageErr,
                );
            }

            return res.status(200).json({
                success: true,
                message: resend ? 'Updated offer email sent' : 'Approval email sent',
                data: { delivered: deliveryResults.filter((r) => r.ok).map((r) => r.to) },
            });
        } catch (error: any) {
            console.error('Send approval email error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    /** Archive the current contract envelope and reset CRM state so Operations can regenerate. */
    async reinitiateContract(req: Request, res: Response) {
        try {
            const { applicationId } = req.body as { applicationId?: string | number };
            if (!applicationId) {
                return res.status(400).json({
                    success: false,
                    message: 'applicationId is required',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const applicationIdStr = String(applicationId);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationIdStr)
                ? { applicationId: Number(applicationIdStr) }
                : { id: applicationIdStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser);
            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }
            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const ok = await reinitiateContractForApplication(String((application as any).id), {
                user: authUser,
                req,
                actorName: String((req as any).user?.name || ''),
                source: 'applicationController.reinitiateContract',
            });
            if (!ok) {
                return res.status(404).json({
                    success: false,
                    message: 'No contract found for this application',
                });
            }

            const refreshed = await prisma.application.findUnique({
                where: { id: (application as any).id },
                include: {
                    referringAgent: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    salesRepresentative: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    createdBy: {
                        select: { id: true, firstName: true, lastName: true, email: true, role: true },
                    },
                    client: true,
                    iso: true,
                    files: true,
                },
            });

            return res.status(200).json({
                success: true,
                message: 'Contract reinitiated. Generate a new contract when ready.',
                data: mapApplicationToApi(refreshed),
            });
        } catch (error: any) {
            console.error('Reinitiate contract error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    /** Funded / funds-released email G?? best-effort (same idea as funding-call email); any user with app access. */
    async sendFundedEmail(req: Request, res: Response) {
        try {
            const { applicationId } = req.body as { applicationId?: string | number };

            if (!applicationId) {
                return res.status(400).json({
                    success: false,
                    message: 'applicationId is required',
                });
            }

            const authUser = getAuthenticatedUser(req);

            const applicationIdStr = String(applicationId);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationIdStr)
                ? { applicationId: Number(applicationIdStr) }
                : { id: applicationIdStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser, {
                client: true,
                iso: true,
            });

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const client: any = (application as any).client;
            const iso: any = (application as any).iso;
            const isoEmail = String(iso?.email || '').trim();

            if (!isoEmail) {
                return res.status(200).json({
                    success: true,
                    message: 'No ISO email on file for this deal; funded notification skipped.',
                    skipped: true,
                });
            }

            return res.status(200).json({
                success: true,
                message: 'Funded notification is not sent to ISO; only approval and offer-update emails are delivered to the linked ISO.',
                skipped: true,
            });
        } catch (error: any) {
            console.error('Send funded email error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    // Get activity logs for a specific application
    async getActivityLogs(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);

            const appIdStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(appIdStr)
                ? { applicationId: Number(appIdStr) }
                : { id: appIdStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const { logs } = await getApplicationActivityLogsForUser(application.id, authUser);

            const { mapApplicationActivityLogEntry } = await import('../services/applicationActivityLogMapper');
            const mappedLogs = logs.map((log) => mapApplicationActivityLogEntry(log as any));

            return res.status(200).json({
                success: true,
                data: mappedLogs,
            });
        } catch (error: any) {
            console.error('Get application activity logs error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getActivityLogContent(req: Request, res: Response) {
        try {
            const { id, logId } = req.params;
            const authUser = getAuthenticatedUser(req);

            const appIdStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(appIdStr)
                ? { applicationId: Number(appIdStr) }
                : { id: appIdStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const activityLog = await prisma.applicationActivityLog.findFirst({
                where: { id: String(logId), applicationId: application.id },
            });

            if (!activityLog) {
                return res.status(404).json({
                    success: false,
                    message: 'Activity log not found for this application',
                });
            }

            const { getSystemActivityLogContent } = await import('../services/systemActivityLogService');
            const content = await getSystemActivityLogContent(activityLog.id);

            if (!content) {
                return res.status(404).json({
                    success: false,
                    message: 'No viewable content for this log entry',
                });
            }

            return res.status(200).json({ success: true, data: content });
        } catch (error: any) {
            console.error('Get application activity log content error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getPaymentMailLogs(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);

            const appIdStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(appIdStr)
                ? { applicationId: Number(appIdStr) }
                : { id: appIdStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const result = await listPaymentMailLogs(application.id, authUser);

            if (result.forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            const data = await enrichPaymentMailLogsForApi([...result.logs]);

            return res.status(200).json({ success: true, data });
        } catch (error: any) {
            console.error('Get payment mail logs error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async createPaymentMailLog(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);

            const appIdStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(appIdStr)
                ? { applicationId: Number(appIdStr) }
                : { id: appIdStr };

            const { application, forbidden } = await getApplicationForUser(whereClause, authUser);

            if (forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!application) {
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            const body = req.body as Record<string, unknown>;
            const dealKey = typeof body.dealKey === 'string' ? body.dealKey.trim() : '';
            const templateName = typeof body.templateName === 'string' ? body.templateName.trim() : '';
            const category = typeof body.category === 'string' ? body.category.trim() : '';
            const recipient = typeof body.recipient === 'string' ? body.recipient.trim() : '';
            const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
            const statusRaw = typeof body.status === 'string' ? body.status.trim().toLowerCase() : '';
            const mailBody = typeof body.body === 'string' ? body.body : undefined;

            if (!dealKey || !templateName || !category || !recipient || !subject || !statusRaw) {
                return res.status(400).json({
                    success: false,
                    message: 'dealKey, templateName, category, recipient, subject, and status are required',
                });
            }

            const result = await persistPaymentMailLog(application.id, authUser, {
                dealKey,
                templateName,
                category,
                recipient,
                subject,
                body: mailBody,
                status: statusRaw as 'queued' | 'sent' | 'failed',
            }, req);

            if (result.forbidden) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (result.badRequest) {
                return res.status(400).json({
                    success: false,
                    message: 'status must be queued, sent, or failed',
                });
            }

            if (!result.log) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to save mail log',
                });
            }

            const log = result.log;
            return res.status(201).json({
                success: true,
                data: {
                    id: log.id,
                    at: log.createdAt?.toISOString() ?? new Date().toISOString(),
                    dealKey: log.dealKey,
                    applicationId: log.applicationId,
                    templateName: log.templateName,
                    category: log.category,
                    recipient: log.recipient,
                    subject: log.subject,
                    body: log.body ?? undefined,
                    status: fromPrismaMailLogStatus(log.status),
                },
            });
        } catch (error: any) {
            console.error('Create payment mail log error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getDashboardPipelineFunnel(req: Request, res: Response) {
        try {
            const data = await withDashboardCache(
                DashboardCacheKind.FUNNEL,
                'global',
                () => aggregateDashboardPipelineFunnel(),
            );
            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get dashboard pipeline funnel error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getDashboardTrendChart(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            const currentUserRole = authUser?.role;
            const { startDate, endDate, trendView } = req.query as {
                startDate?: string;
                endDate?: string;
                trendView?: string;
            };

            let start: Date | null = null;
            let end: Date | null = null;
            if (startDate) {
                const d = new Date(startDate);
                if (!isNaN(d.getTime())) {
                    d.setHours(0, 0, 0, 0);
                    start = d;
                }
            }
            if (endDate) {
                const d = new Date(endDate);
                if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    end = d;
                }
            }

            const viewRaw = String(trendView ?? 'monthly').toLowerCase();
            const trendViewNorm =
                viewRaw === 'weekly' || viewRaw === 'yearly' ? viewRaw : 'monthly';

            const rawUwClaim = req.query.underwriterClaim;
            const uwClaimNorm =
                rawUwClaim != null
                    ? String(Array.isArray(rawUwClaim) ? rawUwClaim[0] : rawUwClaim)
                          .trim()
                          .toLowerCase()
                    : '';
            let underwriterClaimParam: UnderwriterClaimScope | null = null;
            if (
                uwClaimNorm === 'unclaimed' ||
                uwClaimNorm === 'claimed' ||
                uwClaimNorm === 'mine'
            ) {
                underwriterClaimParam = uwClaimNorm as UnderwriterClaimScope;
            }

            const trendCacheKey = [
                authUser?.id ?? 'none',
                String(currentUserRole ?? ''),
                start ? start.toISOString() : '',
                end ? end.toISOString() : '',
                trendViewNorm,
                underwriterClaimParam ?? '',
            ].join('|');

            const data = await withDashboardCache(
                DashboardCacheKind.TREND,
                trendCacheKey,
                () =>
                    aggregateApplicationTrendChart({
                        authUser,
                        role: currentUserRole,
                        startDate: start,
                        endDate: end,
                        trendView: trendViewNorm,
                        underwriterClaim: underwriterClaimParam,
                    }),
            );

            return res.status(200).json({ success: true, data });
        } catch (error) {
            console.error('Get dashboard trend chart error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getDashboardRecentApplications(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            if (!authUser) {
                return res.status(401).json({ success: false, message: 'Unauthorized' });
            }
            const limitRaw = req.query.limit;
            const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 10;
            const roleKey = String(authUser.role ?? '').trim();
            const recentCacheKey = `${authUser.id}|${roleKey}|${limit}`;
            const cachedPayload = await withDashboardCache(
                DashboardCacheKind.RECENT,
                recentCacheKey,
                async () => {
                    const { applications, totalItems } = await listDashboardRecentApplications({
                        authUser,
                        role: authUser.role,
                        limit,
                    });
                    return {
                        data: applications.map((app) => mapApplicationToApi(app)),
                        pagination: { totalItems },
                    };
                },
            );
            return res.status(200).json({
                success: true,
                data: cachedPayload.data,
                pagination: cachedPayload.pagination,
            });
        } catch (error) {
            console.error('Get dashboard recent applications error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    async getMonthlyTrend(req: Request, res: Response) {
        try {
            const authUser = getAuthenticatedUser(req);
            const currentUserRole = authUser?.role;

            const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

            let start: Date | null = null;
            let end: Date | null = null;

            if (startDate) {
                const d = new Date(startDate);
                if (!isNaN(d.getTime())) {
                    d.setHours(0, 0, 0, 0);
                    start = d;
                }
            }
            if (endDate) {
                const d = new Date(endDate);
                if (!isNaN(d.getTime())) {
                    d.setHours(23, 59, 59, 999);
                    end = d;
                }
            }

            const data = await aggregateApplicationMonthlyTrend({
                authUser,
                role: currentUserRole,
                startDate: start,
                endDate: end,
            });

            return res.status(200).json({
                success: true,
                data,
            });
        } catch (error) {
            console.error('Get monthly application trend error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }



    // Get duplicate applications (dedupes) for Underwriters/Admins
    async getDuplicates(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);

            const role = String(authUser?.role || '').toUpperCase().replace(/-/g, '_');
            const allowedRoles = ['SCRUBBING', 'UNDERWRITER', 'ADMIN', 'SUPER_ADMIN'];
            if (!allowedRoles.includes(role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: Dupes view is only available to Underwriters and Admins',
                });
            }

            // Super Admin's cross-book dedupe sends an EIN/SSN taken from a deal
            // in another Book (see lookupDuplicates), so there is no local
            // application to load and nothing to exclude.
            const lookup = (req as any).dedupeLookup as { ein?: unknown; ssn?: unknown } | undefined;
            let ein: string | null;
            let ssn: string | null;
            // Application.id is a UUID column; the nil UUID never matches a real deal.
            let excludeApplicationId = '00000000-0000-0000-0000-000000000000';
            if (lookup) {
                ein = usableDedupeEin(lookup.ein);
                ssn = typeof lookup.ssn === 'string' && lookup.ssn.trim() ? lookup.ssn.trim() : null;
                if (!ein && !ssn) {
                    return res.status(200).json({ success: true, data: [], isDuplicate: false });
                }
            } else {
                const idStr = String(id);
                const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(idStr)
                    ? { applicationId: Number(idStr) }
                    : { id: idStr };

                const applicationRecord = await prisma.application.findUnique({
                    where: whereClause,
                    include: {
                        client: true,
                        files: { select: { originalName: true, size: true } },
                        createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    },
                });

                if (!applicationRecord || !applicationRecord.client) {
                    return res.status(404).json({
                        success: false,
                        message: 'Application or client not found',
                    });
                }

                const client = applicationRecord.client as any;
                ein = usableDedupeEin(client.businessEinNumber);
                ssn = client.ownerSsn || null;
                excludeApplicationId = applicationRecord.id;
            }

            const mapDuplicateRow = (
                app: {
                    id: string;
                    applicationId: number;
                    currentQueue: string | null;
                    currentState: string | null;
                    createdAt: Date;
                    loanAmount: number | null;
                    client: any;
                    createdBy: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
                    OfferDecision?: {
                        decision?: string | null;
                        offer?: unknown;
                        position?: string | null;
                        rate?: unknown;
                        term?: string | null;
                        frequency?: string | null;
                        repayPerPeriod?: unknown;
                        monthlyPayment?: unknown;
                        fees?: unknown;
                        ourRemit?: unknown;
                        totalRemit?: unknown;
                        refinanceAmount?: unknown;
                        notes?: string | null;
                        declineReason?: string | null;
                    } | null;
                    scrubberRecommendation?: string | null;
                    underwriterAction?: string | null;
                },
                matchWith: string[],
            ) => {
                const dupClient: any = app.client;
                const agent = app.createdBy as any;
                const agentName = agent
                    ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || agent.email
                    : null;

                // The decision recorded on the prior deal, whichever stage made it.
                // Precedence matches resolveApplicationCurrentDecision on the
                // frontend: underwriter beats offer beats scrubber.
                const offerDecisionRaw = String(app.OfferDecision?.decision || '').trim();
                // A deal declined earlier and approved later can keep the old decline
                // label; once it is at Approval Sent or later, the stage wins.
                const pastApprovalStage = /^(approved|approvalsent|isoapproved|approvedbyiso|underwriterapproved|finalapproval|contracted|contractgenerated|contractouts?|contractsout|contractsent|contractsigned|signedcontracts|fundingcall|disburs(e)?ment|funded|final)$/.test(
                    String(app.currentQueue ?? '').toLowerCase().replace(/[^a-z]/g, ''),
                );
                const storedUnderwriterAction = String(app.underwriterAction || '').trim();
                const underwriterActionRaw =
                    pastApprovalStage && /declin|reject/i.test(storedUnderwriterAction)
                        ? 'Approved'
                        : storedUnderwriterAction;
                const scrubberRecommendationRaw = String(app.scrubberRecommendation || '').trim();

                const resolveDecisionOutcome = (value: string): 'Approved' | 'Rejected' | null => {
                    if (!value) return null;
                    if (/declin|reject/i.test(value)) return 'Rejected';
                    if (/approv/i.test(value)) return 'Approved';
                    return null;
                };

                const currentDecisionRaw =
                    underwriterActionRaw || offerDecisionRaw || scrubberRecommendationRaw || '';

                /**
                 * Why the prior deal was declined.
                 *
                 * Reasons live in three places and only the caller can see all of
                 * them, so they are resolved here rather than in the browser:
                 *   1. encoded into scrubberRecommendation ("Recommend Decline: A; B")
                 *   2. a SCRUBBER_DECLINE_REASONS: marker line in Application.note,
                 *      written because some CRM columns normalize the recommendation
                 *      string and drop the reasons
                 *   3. OfferDecision.declineReason, when the decline happened at the
                 *      offer stage
                 *
                 * In practice most declines only have (2) — the dedupe payload never
                 * carried `note`, so the panel showed a bare "Recommend Decline" with
                 * no reason at all.
                 */
                const SCRUBBER_DECLINE_NOTE_PREFIX = 'SCRUBBER_DECLINE_REASONS:';
                const splitReasonList = (raw: string): string[] =>
                    raw
                        .split(/\s*;\s*|\s*\|\|\|\s*/)
                        .map((part) => part.trim())
                        .filter(Boolean);

                const declineReasons: string[] = (() => {
                    // 1 — encoded into the recommendation itself.
                    const rec = scrubberRecommendationRaw;
                    if (/recommend\s+decline/i.test(rec)) {
                        const afterLabel = rec.includes('|||')
                            ? rec.split('|||').slice(1).join('|||')
                            : rec.slice(rec.indexOf(':') + 1);
                        if (rec.includes('|||') || rec.includes(':')) {
                            const parsed = splitReasonList(afterLabel);
                            if (parsed.length) return parsed;
                        }
                    }

                    // 2 — the marker line in the note.
                    const noteText = String((app as { note?: string | null }).note ?? '');
                    for (const line of noteText.split('\n')) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith(SCRUBBER_DECLINE_NOTE_PREFIX)) continue;
                        const parsed = splitReasonList(
                            trimmed.slice(SCRUBBER_DECLINE_NOTE_PREFIX.length).trim(),
                        );
                        if (parsed.length) return parsed;
                    }

                    // 3 — the offer-stage decline reason.
                    const offerReason = String(app.OfferDecision?.declineReason ?? '').trim();
                    if (offerReason) return splitReasonList(offerReason);

                    /**
                     * 4 — legacy rows, written before the marker existed, put the
                     * reason in the note as bare text on its own line (alongside a
                     * `gmail-msg:` id). Only read for a deal that is actually
                     * declined, and only when the leftover text is short enough to
                     * be a reason list rather than a free-form note, so an ordinary
                     * note is never mislabelled as a decline reason.
                     */
                    const isDeclined =
                        /declin/i.test(currentDecisionRaw) || /declin/i.test(scrubberRecommendationRaw);
                    if (!isDeclined) return [];

                    const leftover = noteText
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(
                            (line) =>
                                line &&
                                !line.startsWith(SCRUBBER_DECLINE_NOTE_PREFIX) &&
                                !/^gmail-msg:/i.test(line),
                        )
                        .join(', ');

                    if (!leftover || leftover.length > 160) return [];
                    const parsed = leftover
                        .split(/\s*;\s*|\s*,\s*|\s*\|\|\|\s*/)
                        .map((part) => part.trim())
                        .filter(Boolean);
                    return parsed.length > 0 && parsed.length <= 6 ? parsed : [];
                })();
                const currentDecisionStage = underwriterActionRaw
                    ? 'underwriter'
                    : offerDecisionRaw
                      ? 'offer'
                      : scrubberRecommendationRaw
                        ? 'scrubber'
                        : null;

                /**
                 * Status of the prior deal for the dedupe table.
                 *
                 * The decision is the source of truth, not the queue. An approved
                 * deal moves on through Contract Generated / Sent / Signed, at which
                 * point `currentQueue` is no longer 'Approved' — so reading the queue
                 * alone reported every decided-and-progressed deal as "Pending", and
                 * an underwriter looking at a duplicate could not see that the earlier
                 * deal had already been approved or declined. Queue and state are kept
                 * only as the fallback for deals nobody has decided yet.
                 */
                /**
                 * A scrubber recommendation is NOT a decision — the deal is still
                 * waiting on an underwriter — so it is labelled as a recommendation
                 * rather than collapsed into Approved/Rejected, which would read as
                 * final and mislead whoever is reviewing the duplicate.
                 */
                const decidedOutcome =
                    currentDecisionStage === 'scrubber'
                        ? null
                        : resolveDecisionOutcome(currentDecisionRaw);

                const recommendedOutcome = (() => {
                    if (currentDecisionStage !== 'scrubber') return null;
                    const outcome = resolveDecisionOutcome(scrubberRecommendationRaw);
                    if (outcome === 'Approved') return 'Recommended Approval';
                    if (outcome === 'Rejected') return 'Recommended Decline';
                    return null;
                })();

                const status: string =
                    decidedOutcome ??
                    recommendedOutcome ??
                    (app.currentQueue === 'Approved' || app.currentState === ApplicationState.COMPLETED
                        ? 'Approved'
                        : app.currentQueue === 'Declined' || app.currentState === ApplicationState.CANCELLED
                          ? 'Rejected'
                          : 'Pending');

                // `decision` stays strictly the offer decision: Apply/Preview copies
                // OfferDecision fields onto the current deal, so widening it here
                // would offer to apply a decision that has no offer terms behind it.
                const decision = offerDecisionRaw || null;
                const numOrNull = (v: unknown): number | null => {
                    if (v == null || v === '') return null;
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                };
                const od = app.OfferDecision;
                const offerAmt = numOrNull(od?.offer);

                return {
                    id: app.id,
                    applicationId: app.applicationId,
                    businessName: dupClient?.businessName || null,
                    agentName,
                    submittedAt: app.createdAt,
                    status,
                    fundedAmount: app.loanAmount ?? null,
                    businessEinNumber: dupClient?.businessEinNumber || null,
                    ownerSsn: dupClient?.ownerSsn || null,
                    matchWith,
                    isDuplicate: true,
                    decision,
                    hasDecision: !!decision,
                    offerAmount: offerAmt,
                    position: od?.position ?? null,
                    rate: numOrNull(od?.rate),
                    term: od?.term ?? null,
                    frequency: od?.frequency ?? null,
                    repayPerPeriod: numOrNull(od?.repayPerPeriod),
                    monthlyPayment: numOrNull(od?.monthlyPayment),
                    fees: numOrNull(od?.fees),
                    ourRemit: numOrNull(od?.ourRemit),
                    totalRemit: numOrNull(od?.totalRemit),
                    refinanceAmount: numOrNull(od?.refinanceAmount),
                    notes: od?.notes ?? null,
                    declineReason: od?.declineReason ?? null,
                    scrubberRecommendation: app.scrubberRecommendation ?? null,
                    underwriterAction: app.underwriterAction ?? null,
                    currentDecision: currentDecisionRaw || null,
                    currentDecisionStage,
                    declineReasons,
                };
            };

            const byId = new Map<string, ReturnType<typeof mapDuplicateRow>>();

            const mergeDuplicate = (
                app: Parameters<typeof mapDuplicateRow>[0],
                labels: string[],
            ) => {
                const existing = byId.get(app.id);
                if (existing) {
                    for (const label of labels) {
                        if (!existing.matchWith.includes(label)) {
                            existing.matchWith.push(label);
                        }
                    }
                    return;
                }
                byId.set(app.id, mapDuplicateRow(app, [...labels]));
            };

            const crossClientApps = await findApplicationsMatchingEinOrSsn({
                excludeApplicationId,
                ein,
                ssn,
            });
            for (const app of crossClientApps) {
                const dupClient: any = app.client;
                const labels: string[] = [];
                if (ein && usableDedupeEin(dupClient?.businessEinNumber) === ein) {
                    labels.push('EIN');
                }
                if (ssn && dupClient?.ownerSsn && dupClient.ownerSsn === ssn) {
                    labels.push('SSN');
                }
                if (ssn && labels.length === 0) {
                    labels.push('SSN');
                }
                if (labels.length > 0) {
                    mergeDuplicate(app, labels);
                }
            }

            // A lookup is a read on behalf of another Book; it must not retag deals here.
            if (!lookup) await syncDuplicateFlagsForEinOrSsn({ ein, ssn });

            const mapped = Array.from(byId.values()).sort(
                (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
            );

            return res.status(200).json({
                success: true,
                data: mapped,
                isDuplicate: mapped.length > 0,
                // Lets Super Admin look the same identity up in the other Books.
                identity: { ein, ssn },
            });
        } catch (error: any) {
            console.error('Get duplicate applications error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * POST /applications/dedupe-lookup — applications in this Book that share
     * the EIN / owner SSN in the body. Used by Super Admin to show dedupes
     * across Books; same rows and access rules as GET /:id/duplicates.
     */
    async lookupDuplicates(req: Request, res: Response) {
        (req as any).dedupeLookup = { ein: req.body?.ein, ssn: req.body?.ssn };
        return this.getDuplicates(req, res);
    }

    /**
     * Apply offer decision from a prior EIN/SSN duplicate onto the current application.
     * Body: { sourceApplicationId: uuid | applicationId number }
     */
    async applyDuplicateDecision(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const authUser = getAuthenticatedUser(req);
            const role = String(authUser?.role || '').toUpperCase().replace(/-/g, '_');
            const allowedRoles = ['SCRUBBING', 'UNDERWRITER', 'ADMIN', 'SUPER_ADMIN'];
            if (!allowedRoles.includes(role)) {
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: Apply Decision is only available to Scrubbing, Underwriters and Admins',
                });
            }

            const sourceApplicationId =
                (req.body?.sourceApplicationId ?? req.body?.sourceId ?? req.body?.duplicateApplicationId) != null
                    ? String(req.body.sourceApplicationId ?? req.body.sourceId ?? req.body.duplicateApplicationId).trim()
                    : '';
            if (!sourceApplicationId) {
                return res.status(400).json({
                    success: false,
                    message: 'sourceApplicationId is required',
                });
            }

            const result = await applyDuplicateOfferDecision({
                targetApplicationId: String(id),
                sourceApplicationId,
                actorUserId: authUser?.id || null,
            });

            try {
                await createApplicationActivityLog({
                    applicationId: result.targetApplicationId,
                    user: authUser,
                    req,
                    actionType: 'APPLICATION_UPDATED' as ApplicationActivityActionType,
                    actionDescription: `Applied offer decision from duplicate application #${result.sourceApplicationNumber}.`,
                    previousStatus: null,
                    currentStatus: null,
                    metadata: {
                        sourceApplicationId: result.sourceApplicationId,
                        sourceApplicationNumber: result.sourceApplicationNumber,
                        decision: result.offerDecision?.decision ?? null,
                    },
                });
            } catch (logErr) {
                console.warn('applyDuplicateDecision activity log failed:', logErr);
            }

            return res.status(200).json({
                success: true,
                message: `Decision from application #${result.sourceApplicationNumber} applied successfully.`,
                data: result,
            });
        } catch (error: any) {
            const status = Number(error?.status) || 500;
            if (status >= 400 && status < 500) {
                return res.status(status).json({
                    success: false,
                    message: error.message || 'Failed to apply decision',
                });
            }
            console.error('Apply duplicate decision error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

    /**
     * SUPER_ADMIN: bulk import applications from Excel/CSV (first sheet; row 1 headers, row 2 summary skipped).
     * Multipart field name: `file`.
     */
    async bulkUploadApplicationsExcel(req: Request, res: Response) {
        try {
            const userId = String((req as any).user?.id ?? '').trim();
            if (!userId) {
                return res.status(401).json({ success: false, message: 'User context missing' });
            }
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file?.buffer?.length) {
                return res.status(400).json({ success: false, message: 'Excel file is required (field name: file)' });
            }

            const summary = await processApplicationBulkExcelBuffer(file.buffer, userId);

            return res.status(200).json({
                success: true,
                message: buildBulkUploadCompletionMessage(summary.successCount, summary.updatedCount),
                data: summary,
            });
        } catch (error: any) {
            console.error('bulkUploadApplicationsExcel error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Bulk upload failed',
            });
        }
    }

    /**
     * SUPER_ADMIN: starts bulk import as background job and returns jobId for live polling.
     * Multipart field name: `file`.
     */
    async startBulkUploadApplicationsExcel(req: Request, res: Response) {
        cleanupExpiredBulkUploadJobs();
        try {
            const userId = String((req as any).user?.id ?? '').trim();
            if (!userId) {
                return res.status(401).json({ success: false, message: 'User context missing' });
            }
            const file = (req as any).file as Express.Multer.File | undefined;
            if (!file?.buffer?.length) {
                return res.status(400).json({ success: false, message: 'Excel file is required (field name: file)' });
            }

            const jobId = createBulkUploadJobId();
            const nowMs = Date.now();
            const initialJob: BulkUploadJob = {
                id: jobId,
                createdAtMs: nowMs,
                updatedAtMs: nowMs,
                status: 'processing',
                totalRows: 0,
                processedRows: 0,
                successCount: 0,
                updatedCount: 0,
                failedCount: 0,
                errors: [],
                warnings: [],
                createdSyndicators: [],
            };
            bulkUploadJobs.set(jobId, initialJob);

            void (async () => {
                const job = bulkUploadJobs.get(jobId);
                if (!job) return;
                try {
                    const {
                        rows,
                        errors: parseErrors,
                        warnings: parseWarnings,
                        syndicatorColumns,
                    } = parseApplicationBulkSheet(file.buffer);
                    job.totalRows = rows.length;
                    job.failedCount = parseErrors.length;
                    job.errors = [...parseErrors];
                    job.processedRows = parseErrors.length;
                    touchBulkUploadJob(job);
                    console.log(
                        `[bulk-import] job ${jobId}: parsed ${rows.length} row(s), ${parseErrors.length} parse error(s); starting ingest`,
                    );

                    let lastLogProcessed = 0;
                    const ingestSummary = await ingestApplicationBulkRows(rows, userId, (progress) => {
                        const runningJob = bulkUploadJobs.get(jobId);
                        if (!runningJob) return;
                        runningJob.totalRows = progress.totalRows;
                        runningJob.processedRows = progress.processedRows;
                        runningJob.successCount = progress.successCount;
                        runningJob.updatedCount = progress.updatedCount;
                        runningJob.failedCount = progress.failedCount + parseErrors.length;
                        runningJob.currentExcelRowNumber = progress.currentExcelRowNumber;
                        touchBulkUploadJob(runningJob);

                        // Server-side heartbeat every 50 rows so long imports leave a breadcrumb
                        // trail in the logs.
                        if (progress.processedRows - lastLogProcessed >= 50) {
                            lastLogProcessed = progress.processedRows;
                            console.log(
                                `[bulk-import] job ${jobId}: ${progress.processedRows}/${progress.totalRows} processed (` +
                                    `inserted=${progress.successCount}, updated=${progress.updatedCount}, failed=${progress.failedCount})`,
                            );
                        }
                    }, { syndicatorColumns });

                    const mergedErrors = [...parseErrors, ...ingestSummary.errors];
                    const mergedWarnings = [...parseWarnings, ...ingestSummary.warnings];
                    const finalSummary: BulkImportSummary = {
                        totalRows: rows.length,
                        successCount: ingestSummary.successCount,
                        updatedCount: ingestSummary.updatedCount,
                        failedCount: mergedErrors.length,
                        errors: mergedErrors,
                        warnings: mergedWarnings,
                        createdSyndicators: ingestSummary.createdSyndicators,
                    };
                    job.result = finalSummary;
                    job.warnings = mergedWarnings;
                    job.createdSyndicators = ingestSummary.createdSyndicators;
                    job.status = 'completed';
                    job.successCount = finalSummary.successCount;
                    job.updatedCount = finalSummary.updatedCount;
                    job.failedCount = finalSummary.failedCount;
                    job.processedRows = finalSummary.totalRows;
                    job.currentExcelRowNumber = undefined;
                    job.errors = mergedErrors;
                    job.message = buildBulkUploadCompletionMessage(
                        finalSummary.successCount,
                        finalSummary.updatedCount,
                    );
                    touchBulkUploadJob(job);
                    console.log(
                        `[bulk-import] job ${jobId}: completed G?? inserted=${finalSummary.successCount}, updated=${finalSummary.updatedCount}, failed=${finalSummary.failedCount}/${finalSummary.totalRows}`,
                    );
                    if (mergedErrors.length) {
                        console.warn(
                            `[bulk-import] job ${jobId}: ${mergedErrors.length} row(s) failed:`,
                        );
                        for (const rowError of mergedErrors) {
                            console.warn(
                                `[bulk-import]   row ${rowError.excelRowNumber}` +
                                    `${rowError.dealId ? ` (deal ${rowError.dealId})` : ''}` +
                                    `${rowError.dealName ? ` [${rowError.dealName}]` : ''}: ${rowError.message}`,
                            );
                        }
                    }
                } catch (error: any) {
                    job.status = 'failed';
                    job.message = error?.message || 'Bulk upload failed';
                    touchBulkUploadJob(job);
                    console.error(
                        `[bulk-import] job ${jobId}: fatal error G?? ${job.message}`,
                        error,
                    );
                }
            })();

            return res.status(202).json({
                success: true,
                message: 'Bulk upload started',
                data: { jobId },
            });
        } catch (error: any) {
            console.error('startBulkUploadApplicationsExcel error:', error);
            return res.status(500).json({
                success: false,
                message: error?.message || 'Failed to start bulk upload',
            });
        }
    }

    /** SUPER_ADMIN: poll live row-level progress for bulk import job. */
    async getBulkUploadApplicationsExcelProgress(req: Request, res: Response) {
        cleanupExpiredBulkUploadJobs();
        const jobId = String(req.params.jobId ?? '').trim();
        if (!jobId) {
            return res.status(400).json({ success: false, message: 'jobId is required' });
        }
        const job = bulkUploadJobs.get(jobId);
        if (!job) {
            return res.status(404).json({ success: false, message: 'Bulk upload job not found or expired' });
        }
        return res.status(200).json({
            success: true,
            data: {
                jobId: job.id,
                status: job.status,
                totalRows: job.totalRows,
                processedRows: job.processedRows,
                successCount: job.successCount,
                updatedCount: job.updatedCount,
                failedCount: job.failedCount,
                currentExcelRowNumber: job.currentExcelRowNumber,
                message: job.message,
                errors: job.status === 'completed' || job.status === 'failed' ? job.errors : [],
                warnings: job.status === 'completed' ? job.warnings : [],
                createdSyndicators: job.createdSyndicators,
            },
        });
    }

    // Get applications by underwriter id (assigned, approved, or claimed)
    async getByUnderwriterId(req: Request, res: Response) {
        try {
            const rawUnderwriterId = req.params.underwriterId || req.query.underwriterId;
            const underwriterId = String(rawUnderwriterId ?? '').trim();
            if (!underwriterId) {
                return res.status(400).json({
                    success: false,
                    message: 'underwriterId is required',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const where: Prisma.ApplicationWhereInput = {
                OR: [
                    { assignedUnderwriterId: underwriterId },
                    { approvedByUnderwriterId: underwriterId },
                    { claimedByUnderwriterId: underwriterId },
                ],
            };
            const visibilityAwareWhere = mergeApplicationVisibilityWhere(where, authUser);

            const applications = await (prisma as any).application.findMany({
                where: visibilityAwareWhere,
                orderBy: { createdAt: 'desc' },
                include: {
                    referringAgent: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    salesRepresentative: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    assignedUnderwriter: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    approvedByUnderwriter: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    claimedByUnderwriter: {
                        select: { id: true, firstName: true, lastName: true, email: true },
                    },
                    client: true,
                    iso: true,
                    termsOffers: {
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: { approvedAmount: true, factorRate: true, paybackAmount: true },
                    },
                    OfferDecision: {
                        select: {
                            offer: true,
                            decision: true,
                            declineReason: true,
                            rate: true,
                        },
                    },
                },
            });

            return res.status(200).json({
                success: true,
                data: applications.map(mapApplicationToApi),
            });
        } catch (error) {
            console.error('Get applications by underwriter id error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    // Get applications by ISO id
    async getByIsoId(req: Request, res: Response) {
        try {
            const rawIsoId = req.params.isoId || req.query.isoId;
            const isoId = String(rawIsoId ?? '').trim();
            if (!isoId) {
                return res.status(400).json({
                    success: false,
                    message: 'isoId is required',
                });
            }

            const authUser = getAuthenticatedUser(req);
            const where: any = { isoId };
            const visibilityAwareWhere = mergeApplicationVisibilityWhere(where, authUser);

            const applications = await (prisma as any).application.findMany({
                where: visibilityAwareWhere,
                orderBy: { createdAt: 'desc' },
                include: {
                    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
                    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
                    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                    client: true,
                    iso: true,
                    termsOffers: {
                        orderBy: { updatedAt: 'desc' },
                        take: 1,
                        select: { approvedAmount: true, factorRate: true, paybackAmount: true },
                    },
                    OfferDecision: {
                        select: {
                            offer: true,
                            decision: true,
                            declineReason: true,
                            rate: true,
                        },
                    },
                },
            });

            return res.status(200).json({
                success: true,
                data: applications.map(mapApplicationToApi),
            });
        } catch (error) {
            console.error('Get applications by ISO id error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error',
            });
        }
    }

    /**
     * Approve an application (idempotent webhook-style endpoint).
     *
     * Trigger surfaces:
     *   1. Authenticated CRM user (Underwriter / Admin / OperationsG?) clicks Approve.
     *   2. ISO clicks Approve from the public approval portal G?? the portal first
     *      mints a short-lived JWT (see PublicApprovalController.createApprovalSession)
     *      that flows through `authenticateToken` and lands here with
     *      `req.user.publicApprovalActor === 'ISO'`.
     *
     * Concurrency / scale guarantees come from `applicationApprovalService.approveApplication`:
     *   - Single conditional `updateMany` (no race between simultaneous clicks).
     *   - Optional `Idempotency-Key` request header to coalesce client retries.
     *   - Side-effects (notifications, ISO/agent emails) are queued via BullMQ
     *     when REDIS_URL is set, otherwise dispatched via setImmediate.
     */
    async approve(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { note } = (req.body ?? {}) as { note?: string };
            const idempotencyKeyHeader =
                (req.headers['idempotency-key'] as string | undefined) ||
                (req.headers['x-idempotency-key'] as string | undefined);

            const authUser = getAuthenticatedUser(req);
            const reqUser = (req as any).user as
                | { id?: string; name?: string; publicApprovalActor?: string; role?: string }
                | undefined;

            console.log('[POST /applications/:id/approve] received', {
                paramId: id,
                authUserId: authUser?.id ?? null,
                authUserRole: authUser?.role ?? null,
                publicApprovalActor: reqUser?.publicApprovalActor ?? null,
                hasIdempotencyKey: Boolean(idempotencyKeyHeader),
            });

            const applicationStr = String(id);
            const whereClause: Prisma.ApplicationWhereUniqueInput = /^\d+$/.test(applicationStr)
                ? { applicationId: Number(applicationStr) }
                : { id: applicationStr };

            const { application: existingApplication, forbidden } = await getApplicationForUser(
                whereClause,
                authUser,
            );

            if (forbidden) {
                console.warn('[POST /applications/:id/approve] forbidden', {
                    paramId: id,
                    authUserId: authUser?.id ?? null,
                    authUserRole: authUser?.role ?? null,
                });
                return res.status(403).json({
                    success: false,
                    message: 'Forbidden: you do not have access to this application',
                });
            }

            if (!existingApplication) {
                console.warn('[POST /applications/:id/approve] not found', { paramId: id });
                return res.status(404).json({
                    success: false,
                    message: 'Application not found',
                });
            }

            if (blockIfUnderwriterUnclaimedDeal(res, authUser, existingApplication)) {
                return;
            }

            const result = await approveApplication(whereClause, {
                actor: authUser,
                req,
                actorType: reqUser?.publicApprovalActor || authUser?.role || null,
                actorName: reqUser?.name ?? null,
                note: typeof note === 'string' ? note : null,
                idempotencyKey: typeof idempotencyKeyHeader === 'string' ? idempotencyKeyHeader : null,
            });

            const apiApplication = mapApplicationToApi(result.application);

            console.log('[POST /applications/:id/approve] responding', {
                applicationDbId: result.application?.id ?? null,
                alreadyApproved: result.alreadyApproved,
                responseCurrentQueue: (apiApplication as { currentQueue?: string })?.currentQueue ?? null,
                responseCurrentState: (apiApplication as { currentState?: string })?.currentState ?? null,
            });

            return res.status(200).json({
                success: true,
                message: result.alreadyApproved
                    ? 'Application was already approved'
                    : 'Application approved successfully',
                data: apiApplication,
                alreadyApproved: result.alreadyApproved,
            });
        } catch (error: any) {
            const status =
                typeof error?.statusCode === 'number' && error.statusCode >= 400
                    ? error.statusCode
                    : 500;
            if (status >= 500) {
                console.error('Approve application error:', error);
            }
            return res.status(status).json({
                success: false,
                message: error?.message || 'Internal server error',
            });
        }
    }

}

const applicationController = new ApplicationController();
export default applicationController;


