import { Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes, Application, Role } from '@prisma/client';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../config/prismaClient';
import { parseBusinessData } from './parseBusinessData';
import { attachBufferAsApplicationFile } from './applicationPdfAttachService';
import { extractPdfPlainTextForParsing } from './pdfIngestionService';
import { normalizeOcrTextForParsing } from './ocrFieldExtraction';
import { logExtractedBusinessDataCsv } from './csvConverter';
import { scheduleApplicationStageNotification } from './applicationStageNotificationService';
import { allocateNextDealId, withAllocatedDealId } from './nextDealIdService';
import { applicationCreateUncheckedData } from '../utils/prisma/applicationCreateUncheckedData';
import {
    gmailAutoCreateMessageNote,
    findRecentApplicationForGmailMessage,
} from './pdfFileDedupeService';
import {
    recordGmailAutoCreateMessageHandled,
    recordPdfContentCreateHandled,
    releasePdfContentHashCreateClaim,
    sha256PdfContent,
    tryClaimPdfContentHashCreate,
} from './gmailAutoCreateProcessedStore';
import { getCachedDesignatedUnderwriterIds } from './underwriterRoutingService';
import { looksLikeEin } from './einSanitizer';
import { syncDuplicateFlagForApplication } from './applicationIdentityDedupeService';

export type UserRole = Role;

export interface AuthenticatedUser {
    id: string;
    role: UserRole | string;
    /** True when the SA gateway proxy authenticated this request. */
    viaSuperAdminProxy?: boolean;
}

/** JWT user on `req.user` (shared across controllers). */
export function getAuthenticatedUserFromRequest(req: {
    user?: { id?: string; role?: string } | null;
    isSuperAdminProxy?: boolean;
}): AuthenticatedUser | null {
    const user = req.user;
    if (!user?.id) return null;
    return {
        id: String(user.id),
        role: String(user.role ?? ''),
        viaSuperAdminProxy: Boolean(req.isSuperAdminProxy),
    };
}

function normalizeRole(role: string | UserRole | null | undefined): UserRole | null {
    if (!role) return null;
    const normalized = String(role).trim().toUpperCase().replace(/-/g, '_');
    const valid: UserRole[] = [
        'AGENT',
        'SCRUBBING',
        'UNDERWRITER',
        'ACCOUNTANT',
        'ACCOUNTS',
        'ADMIN',
        'SUPER_ADMIN',
        'OPERATIONS',
    ];

    return (valid as string[]).includes(normalized) ? (normalized as UserRole) : null;
}

/** Agents only see applications they referred or created. */
export function buildAgentApplicationVisibilityWhere(
    userId: string,
): PrismaTypes.ApplicationWhereInput {
    return {
        OR: [{ referringAgentId: userId }, { createdById: userId }],
    };
}

/** SQL fragment for stats queries (`Application` aliased as `a` by default). */
export function buildAgentApplicationVisibilitySql(
    userId: string,
    applicationTableAlias = 'a',
): Prisma.Sql {
    const prefix = applicationTableAlias ? `${applicationTableAlias}.` : '';
    return Prisma.sql`(${Prisma.raw(`${prefix}"referringAgentId"`)} = ${userId} OR ${Prisma.raw(`${prefix}"createdById"`)} = ${userId})`;
}

/** Underwriter list/count visibility — mirrors GET /applications underwriter scoping. */
export function buildUnderwriterApplicationVisibilityWhere(
    userId: string,
): PrismaTypes.ApplicationWhereInput {
    const designatedUnderwriterIds = getCachedDesignatedUnderwriterIds();
    if (designatedUnderwriterIds.length > 0 && !designatedUnderwriterIds.includes(userId)) {
        // Super Admin routed the book to other underwriters: this viewer only keeps
        // deals that were handed to them explicitly.
        return { assignedUnderwriterId: userId };
    }
    return {
        AND: [
            {
                OR: [
                    {
                        NOT: {
                            currentQueue: {
                                equals: 'Final Approval',
                                mode: 'insensitive',
                            },
                        },
                    },
                    { assignedUnderwriterId: userId },
                    {
                        AND: [
                            { assignedUnderwriterId: null },
                            { approvedByUnderwriterId: userId },
                        ],
                    },
                ],
            },
            {
                OR: [
                    { assignedUnderwriterId: null },
                    { assignedUnderwriterId: userId },
                ],
            },
        ],
    };
}

/** Scope list queries: agents see only their deals; underwriters see assigned / final-approval rows. */
export function mergeApplicationVisibilityWhere(
    base: PrismaTypes.ApplicationWhereInput,
    user: AuthenticatedUser | null | undefined
): PrismaTypes.ApplicationWhereInput {
    if (!user?.id) {
        return base;
    }

    const role = normalizeRole(user.role);
    const existingAnd = base.AND
        ? Array.isArray(base.AND)
            ? base.AND
            : [base.AND]
        : [];

    if (role === 'AGENT') {
        return {
            ...base,
            AND: [...existingAnd, buildAgentApplicationVisibilityWhere(user.id)],
        };
    }

    if (role === 'UNDERWRITER') {
        return {
            ...base,
            AND: [...existingAnd, buildUnderwriterApplicationVisibilityWhere(user.id)],
        };
    }

    return base;
}

const isFinalApprovalQueue = (queue: string | null | undefined): boolean =>
    String(queue ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '') === 'finalapproval';

/** Detail access: agents only on own deals; other CRM roles unchanged. */
export function canUserAccessApplication(
    application: Pick<
        Application,
        | 'referringAgentId'
        | 'createdById'
        | 'currentQueue'
        | 'approvedByUnderwriterId'
        | 'assignedUnderwriterId'
    > & {
        assignedUnderwriterId?: string | null;
        claimedByUnderwriterId?: string | null;
    },
    user: AuthenticatedUser | null | undefined
): boolean {
    if (!user) return false;
    if (user.viaSuperAdminProxy) {
        // SA gateway already authenticated the actor and applied panelConfig gates.
        return true;
    }
    const role = normalizeRole(user.role);
    if (!role) return false;
    if (role === 'SCRUBBING') {
        const assignedId = String(application.assignedUnderwriterId ?? '').trim();
        const scrubberClaimId = String(application.claimedByUnderwriterId ?? '').trim();
        if (assignedId && scrubberClaimId !== user.id) {
            return false;
        }
        const queueToken = String(application.currentQueue ?? '')
            .trim()
            .toUpperCase()
            .replace(/[\s-]+/g, '_');
        if (queueToken === 'SCRUBBING' && scrubberClaimId && scrubberClaimId !== user.id) {
            return false;
        }
    }
    if (role === 'UNDERWRITER') {
        // A deal assigned to a specific Underwriter is private to them.
        if (
            application.assignedUnderwriterId &&
            application.assignedUnderwriterId !== user.id
        ) {
            return false;
        }
        const designatedUnderwriterIds = getCachedDesignatedUnderwriterIds();
        if (
            designatedUnderwriterIds.length > 0 &&
            !designatedUnderwriterIds.includes(user.id) &&
            !application.assignedUnderwriterId
        ) {
            return false;
        }
        if (isFinalApprovalQueue(application.currentQueue)) {
            const assignedId = String(application.assignedUnderwriterId ?? '').trim();
            if (assignedId) {
                return assignedId === user.id;
            }
            return application.approvedByUnderwriterId === user.id;
        }
    }
    if (role !== 'AGENT') return true;
    return (
        application.referringAgentId === user.id ||
        application.createdById === user.id
    );
}

/** Application type that may include relation fields when include is used */
type ApplicationWithRelations = Application & { files?: Array<{ id: string }> };

/**
 * Fetches a single application and enforces user-based access control.
 * When include is passed, the returned application may have relation fields (e.g. files).
 */
export async function getApplicationForUser(
    where: Prisma.ApplicationWhereUniqueInput,
    user: AuthenticatedUser | null | undefined,
    include?: Prisma.ApplicationInclude
): Promise<{ application: ApplicationWithRelations | null; forbidden: boolean }> {
    const application = await prisma.application.findUnique({
        where,
        include,
    }) as ApplicationWithRelations | null;

    if (!application) {
        return { application: null, forbidden: false };
    }

    if (!canUserAccessApplication(application, user)) {
        return { application: null, forbidden: true };
    }

    const role = normalizeRole(user?.role);
    const deletedAt = (application as { deletedAt?: Date | null }).deletedAt;
    if (
        deletedAt &&
        role !== 'SUPER_ADMIN' &&
        role !== 'OPERATIONS'
    ) {
        return { application: null, forbidden: false };
    }

    return { application, forbidden: false };
}

const APPLICATION_UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map route `:id` to a Prisma unique key (numeric `applicationId` or UUID `id`). */
export function resolveApplicationWhere(
    idParam: string,
): Prisma.ApplicationWhereUniqueInput | null {
    const ref = String(idParam ?? '').trim();
    if (!ref) return null;
    if (/^\d+$/.test(ref)) {
        const numericId = Number(ref);
        return Number.isFinite(numericId) ? { applicationId: numericId } : null;
    }
    if (!APPLICATION_UUID_REGEX.test(ref)) return null;
    return { id: ref };
}

/** Resolve application by UUID or numeric `applicationId` with agent visibility enforced. */
export async function getApplicationForUserByRef(
    applicationRef: string,
    user: AuthenticatedUser | null | undefined,
    include?: PrismaTypes.ApplicationInclude,
): Promise<{ application: ApplicationWithRelations | null; forbidden: boolean }> {
    const where = resolveApplicationWhere(applicationRef);
    if (!where) {
        return { application: null, forbidden: false };
    }
    return getApplicationForUser(where, user, include);
}

/* =========================================================================
   Create Client + Application from a PDF buffer (reusable across controllers)
   ========================================================================= */

/** Helper to strip non-digits from SSN */
const normalizeSsn = (ssn: string | null | undefined) =>
    ssn ? String(ssn).replace(/\D/g, '') : null;

/** Helper to normalize EIN to last 9 digits */
const normalizeEin = (ein: string | null | undefined) => {
    const digits = ein ? String(ein).replace(/\D/g, '') : '';
    if (!digits) return null;
    return digits.length >= 9 ? digits.slice(-9) : digits;
};

const normalizeBusinessName = (name: string | null | undefined) =>
    name ? String(name).replace(/\s+/g, ' ').trim() : '';

const normalizeEmail = (email: string | null | undefined) =>
    email ? String(email).trim().toLowerCase() : '';

/**
 * Identity match on the owner SSN.
 *
 * Requires the FULL number. Accepting the last four digits alone attached a
 * submission to whichever client happened to share them — real data has many
 * such collisions (ocean alone has 55 last-4 groups holding different full
 * SSNs) — and the new deal then displayed a completely different merchant.
 */
const ssnMatches = (a: string | null | undefined, b: string | null | undefined) => {
    const aNorm = normalizeSsn(a);
    const bNorm = normalizeSsn(b);
    if (!aNorm || !bNorm) return false;
    if (aNorm.length < 9 || bNorm.length < 9) return false;
    return aNorm === bNorm;
};

export type ExistingClientMatchReason =
    | 'ein'
    | 'business_name_email'
    | 'owner_ssn'
    | 'owner_ssn_client_owner'
    | 'business_name_owner_name'
    | 'business_name_owner_name_client_owner';

/**
 * Resolve an existing Client for PDF auto-create flows.
 * Matches by EIN, business name + email, owner SSN (flat + ClientOwner rows), then business + owner name.
 */
export async function findExistingClientFromPdfExtract(
    business: Record<string, unknown>,
    owner: Record<string, unknown>,
): Promise<{ client: any; matchedBy: ExistingClientMatchReason } | null> {
    const einNorm = looksLikeEin(
        (business.business_ein_number ??
            business.ein_number ??
            business.businessEinNumber) as string | null | undefined,
    )
        ? normalizeEin(
              (business.business_ein_number ??
                  business.ein_number ??
                  business.businessEinNumber) as string | null | undefined,
          )
        : null;
    const businessNameNorm = normalizeBusinessName(
        (business.business_name ?? business.dba_name ?? business.businessName) as
            | string
            | null
            | undefined,
    );
    const businessEmailNorm = normalizeEmail(
        (business.business_email ?? business.email ?? business.businessEmail) as
            | string
            | null
            | undefined,
    );
    const ownerFirstNorm = normalizeBusinessName(
        (owner.owner_first_name ?? owner.firstName) as string | null | undefined,
    );
    const ownerLastNorm = normalizeBusinessName(
        (owner.owner_last_name ?? owner.lastName) as string | null | undefined,
    );
    const ownerSsnRaw =
        (owner.owner_ssn ?? owner.ownerSsn ?? owner.ssn ?? null) as string | null | undefined;

    if (einNorm) {
        // Narrow on the digit suffix rather than taking the newest 500 rows:
        // a recency window hides older clients, so a repeat merchant that first
        // submitted long ago would never match and would be duplicated.
        const clientsWithEin = await prisma.client.findMany({
            where: { businessEinNumber: { contains: einNorm.slice(-4) } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const existingByEin = clientsWithEin.find(
            (c) => normalizeEin(c.businessEinNumber) === einNorm,
        );
        if (existingByEin) {
            return { client: existingByEin, matchedBy: 'ein' };
        }
    }

    if (businessNameNorm && businessEmailNorm) {
        const existingByBusiness = await prisma.client.findFirst({
            where: {
                businessName: { equals: businessNameNorm, mode: 'insensitive' },
                businessEmail: { equals: businessEmailNorm, mode: 'insensitive' },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (existingByBusiness) {
            return { client: existingByBusiness, matchedBy: 'business_name_email' };
        }
    }

    const ownerSsnNormForLookup = normalizeSsn(ownerSsnRaw);
    if (ownerSsnNormForLookup && ownerSsnNormForLookup.length >= 9) {
        // Stored SSNs are not normalized ("123-45-6789" or "123456789"), so
        // narrow on the digit suffix in SQL and compare the full value in code.
        // The old `take: 500` recency window hid older clients entirely, which
        // turned a genuine repeat merchant into a duplicate client.
        const last4 = ownerSsnNormForLookup.slice(-4);

        const clientsWithSsn = await prisma.client.findMany({
            where: { ownerSsn: { contains: last4 } },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const existingBySsn = clientsWithSsn.find((c) => ssnMatches(c.ownerSsn, ownerSsnRaw));
        if (existingBySsn) {
            return { client: existingBySsn, matchedBy: 'owner_ssn' };
        }

        const clientOwnersWithSsn = await prisma.clientOwner.findMany({
            where: { ssn: { contains: last4 } },
            include: { client: true },
            orderBy: { createdAt: 'desc' },
            take: 500,
        });
        const ownerRecordMatch = clientOwnersWithSsn.find((co) => ssnMatches(co.ssn, ownerSsnRaw));
        if (ownerRecordMatch?.client) {
            return { client: ownerRecordMatch.client, matchedBy: 'owner_ssn_client_owner' };
        }
    }

    if (businessNameNorm && ownerFirstNorm && ownerLastNorm) {
        const existingByName = await prisma.client.findFirst({
            where: {
                businessName: { equals: businessNameNorm, mode: 'insensitive' },
                ownerFirstName: { equals: ownerFirstNorm, mode: 'insensitive' },
                ownerLastName: { equals: ownerLastNorm, mode: 'insensitive' },
            },
            orderBy: { createdAt: 'desc' },
        });
        if (existingByName) {
            return { client: existingByName, matchedBy: 'business_name_owner_name' };
        }

        const ownerNameMatch = await prisma.clientOwner.findFirst({
            where: {
                firstName: { equals: ownerFirstNorm, mode: 'insensitive' },
                lastName: { equals: ownerLastNorm, mode: 'insensitive' },
                client: {
                    businessName: { equals: businessNameNorm, mode: 'insensitive' },
                },
            },
            include: { client: true },
            orderBy: { createdAt: 'desc' },
        });
        if (ownerNameMatch?.client) {
            return {
                client: ownerNameMatch.client,
                matchedBy: 'business_name_owner_name_client_owner',
            };
        }
    }

    return null;
}

/** Helper to parse numeric amounts like "$12,345.67" */
const parseNumericAmount = (value: string | number | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    const str = String(value).replace(/[$,\s]/g, '').trim();
    if (!str) return null;
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
};

/** Helper to parse date strings */
const parseDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
};

const looksLikeEmail = (s: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(s);

/**
 * OCR/Claude occasionally puts the wrong line into date fields (e.g. “Requested Amount :”).
 */
const parseDateForClientFields = (dateStr: string | null | undefined): Date | null => {
    const t = String(dateStr ?? '').trim();
    if (!t || t.length > 80) return null;
    if (/requested\s+amount|gross\s+annual\s+sales|business\s+name|dba|email\b/i.test(t)) return null;
    if (!/\d/.test(t)) return null;
    return parseDate(t);
};

/**
 * When the same owner SSN matches an existing client, we still ingest a new Application but historically
 * left Client.* empty → CRM showed no email even though CSV extraction logged them.
 */
async function mergePdfExtractIntoExistingClient(
    clientId: string,
    business: Record<string, unknown>,
    owner: Record<string, unknown>,
): Promise<void> {
    const cur = await prisma.client.findUnique({
        where: { id: clientId },
        select: {
            businessEmail: true,
            ownerEmail: true,
            businessWebsite: true,
            businessNumber: true,
            ownerMobileNumber: true,
        },
    });
    if (!cur) return;

    const patch: Prisma.ClientUpdateInput = {};
    const bizEm = String(business.business_email ?? '').trim();
    const ownEm = String(owner.owner_email ?? '').trim();
    const web = String(business.business_website ?? '')
        .trim()
        .replace(/[,;)]+$/, '');
    const phone = String(business.phone_number ?? '').trim();
    const ownerMobile = String(owner.owner_mobile_number ?? '').trim();

    if (!(cur.businessEmail ?? '').trim() && bizEm && looksLikeEmail(bizEm)) patch.businessEmail = bizEm;
    if (!(cur.ownerEmail ?? '').trim() && ownEm && looksLikeEmail(ownEm)) patch.ownerEmail = ownEm;
    if (!(cur.businessWebsite ?? '').trim() && web && /\./.test(web)) patch.businessWebsite = web.slice(0, 500);
    if (!(cur.businessNumber ?? '').trim() && phone) patch.businessNumber = phone.slice(0, 80);
    if (!(cur.ownerMobileNumber ?? '').trim() && ownerMobile) patch.ownerMobileNumber = ownerMobile.slice(0, 80);

    if (Object.keys(patch).length === 0) return;
    await prisma.client.update({
        where: { id: clientId },
        data: patch,
    });
}

export interface PdfApplicationResult {
    client: any;
    application: any;
    existingClient: boolean;
    /** True when a recent same-PDF create was reused (no new Application row). */
    alreadyExisted?: boolean;
}

export interface CreatePdfApplicationOptions {
    isoId?: string | null;
    /** Original filename for the stored ApplicationFile (e.g. Gmail attachment name). */
    originalFileName?: string | null;
    /** Gmail message id for durable auto-create dedupe (`gmail-msg:` note). */
    gmailMessageId?: string | null;
    /**
     * When provided (e.g. OCR + `parseBusinessData` already ran in the controller),
     * skips PDF text extraction and parsing inside this helper.
     */
    preParsedData?: unknown;
    /** Gmail cron: one Claude call per PDF (no business-name retry). */
    skipClaudeBusinessNameRetry?: boolean;
    /** When true, skip PDF filename/content/gmail idempotency (tests only). */
    skipPdfIdempotency?: boolean;
}

/** Thrown when parsed PDF data cannot satisfy Prisma for a *new* client (e.g. missing business name). */
export class InsufficientParsedPdfError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InsufficientParsedPdfError';
    }
}

/**
 * New-client path needs owner name fields; businessName falls back when missing.
 */
export function assertReadyToCreateNewClientFromPdf(parsedData: unknown, clientRecord: unknown): void {
    if (clientRecord) {
        return;
    }
    const o =
        (parsedData as { owner?: { owner_first_name?: string | null; owner_last_name?: string | null } })?.owner ??
        {};
    const fn = o.owner_first_name != null ? String(o.owner_first_name).trim() : '';
    const ln = o.owner_last_name != null ? String(o.owner_last_name).trim() : '';
    if (!fn || !ln) {
        throw new InsufficientParsedPdfError(
            'Could not determine owner first and last name from this PDF. Prisma requires both; ensure Claude key_data includes owner_first_name / owner_last_name.',
        );
    }
}

/**
 * Accepts a raw PDF buffer, extracts business/owner data, finds or creates
 * a Client, then creates an Application linked to that client.
 *
 * This is the same logic used by ApplicationController.autoCreateFromPDF
 * but decoupled from Express (Request/Response) so it can be reused by
 * the Gmail auto-import flow or any other caller.
 */
const PDF_EMAIL_AUTO_CREATE_QUEUE = 'Scrubbing';
/** Route PDF-created applications directly to scrubbing review queue. */
const PDF_EMAIL_AUTO_CREATE_STATE = 'IN_PROGRESS';

const applicationWithFilesInclude = {
    referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
    salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
    createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
    client: true,
    files: true,
} as const;

async function refetchApplicationWithFiles(applicationId: string) {
    return prisma.application.findUnique({
        where: { id: applicationId },
        include: applicationWithFilesInclude,
    });
}

/**
 * Reuse only when this exact Gmail message already created a deal.
 * Same PDF filename/bytes on a new email must create a new application so it
 * can land in Dupes (EIN/SSN identity match) instead of being skipped.
 */
export async function resolveExistingPdfCreateIfDuplicate(params: {
    userId: string;
    fileName: string;
    pdfContentHash: string;
    gmailMessageId?: string | null;
}): Promise<PdfApplicationResult | null> {
    const gmailMessageId = String(params.gmailMessageId || '').trim();

    if (gmailMessageId) {
        const byMsg = await findRecentApplicationForGmailMessage({
            gmailMessageId,
        });
        if (byMsg?.client) {
            console.log(
                `[pdf-create] idempotent reuse via gmail-msg=${gmailMessageId} application=${byMsg.id}`,
            );
            return {
                client: byMsg.client,
                application: byMsg,
                existingClient: true,
                alreadyExisted: true,
            };
        }
    }

    return null;
}

export async function stampPdfCreateIdempotency(params: {
    userId: string;
    applicationId: string;
    pdfContentHash: string;
    gmailMessageId?: string | null;
}): Promise<void> {
    const { userId, applicationId, pdfContentHash } = params;
    const gmailMessageId = String(params.gmailMessageId || '').trim();
    try {
        await recordPdfContentCreateHandled(userId, pdfContentHash, applicationId);
    } catch (err) {
        console.warn('[pdf-create] failed to record content-hash ledger:', err);
    }
    if (gmailMessageId) {
        try {
            await recordGmailAutoCreateMessageHandled(userId, gmailMessageId, 'success', {
                applicationId,
                pdfContentHash,
            });
        } catch (err) {
            console.warn('[pdf-create] failed to record gmail message ledger:', err);
        }
    }
}

export async function createClientAndApplicationFromPDFBuffer(
    pdfBuffer: Buffer | string,
    userId: string,
    options?: CreatePdfApplicationOptions
): Promise<PdfApplicationResult> {
    const storedPdfName =
        String(options?.originalFileName || 'application.pdf').trim() || 'application.pdf';
    const isoId = options?.isoId ? String(options.isoId).trim() : null;
    let commissionPercentageFromIso = 0;
    if (isoId) {
        const isoRecord = await prisma.iso.findUnique({
            where: { id: isoId },
            select: { commissionPercentage: true },
        });
        if (isoRecord) {
            commissionPercentageFromIso = Number(isoRecord.commissionPercentage ?? 0);
        }
    }
    const agentCreationQueue = PDF_EMAIL_AUTO_CREATE_QUEUE;
    const agentCreationState = PDF_EMAIL_AUTO_CREATE_STATE;
    const gmailMessageId = String(options?.gmailMessageId || '').trim();
    const gmailNote = gmailMessageId ? gmailAutoCreateMessageNote(gmailMessageId) : '';

    const buf: Buffer = Buffer.isBuffer(pdfBuffer)
        ? pdfBuffer
        : await fs.readFile(String(pdfBuffer));
    const pdfContentHash = sha256PdfContent(buf);

    if (!options?.skipPdfIdempotency) {
        const reused = await resolveExistingPdfCreateIfDuplicate({
            userId,
            fileName: storedPdfName,
            pdfContentHash,
            gmailMessageId: gmailMessageId || null,
        });
        if (reused) return reused;

        const claimed = await tryClaimPdfContentHashCreate(pdfContentHash);
        if (!claimed) {
            // Another create is in flight for the same bytes — wait in case it is the
            // same Gmail message. A different email with the same PDF still creates.
            for (let attempt = 0; attempt < 8; attempt++) {
                await new Promise((r) => setTimeout(r, 400));
                const raced = await resolveExistingPdfCreateIfDuplicate({
                    userId,
                    fileName: storedPdfName,
                    pdfContentHash,
                    gmailMessageId: gmailMessageId || null,
                });
                if (raced) return raced;
            }
            console.warn(
                `[pdf-create] content-hash claim held by another worker; creating a new application hash=${pdfContentHash.slice(0, 12)}…`,
            );
        }
    }

    try {
        return await createClientAndApplicationFromPDFBufferUnlocked(
            buf,
            userId,
            options,
            {
                storedPdfName,
                isoId,
                commissionPercentageFromIso,
                agentCreationQueue,
                agentCreationState,
                gmailMessageId,
                gmailNote,
                pdfContentHash,
            },
        );
    } finally {
        if (!options?.skipPdfIdempotency) {
            await releasePdfContentHashCreateClaim(pdfContentHash);
        }
    }
}

async function createClientAndApplicationFromPDFBufferUnlocked(
    buf: Buffer,
    userId: string,
    options: CreatePdfApplicationOptions | undefined,
    ctx: {
        storedPdfName: string;
        isoId: string | null;
        commissionPercentageFromIso: number;
        agentCreationQueue: string;
        agentCreationState: string;
        gmailMessageId: string;
        gmailNote: string;
        pdfContentHash: string;
    },
): Promise<PdfApplicationResult> {
    const {
        storedPdfName,
        isoId,
        commissionPercentageFromIso,
        agentCreationQueue,
        agentCreationState,
        gmailMessageId,
        gmailNote,
        pdfContentHash,
    } = ctx;

    let parsedData: any;
    if (options?.preParsedData && typeof options.preParsedData === 'object') {
        parsedData = options.preParsedData;
    } else {
        const nameFromOpts =
            String(options?.originalFileName || '').trim() || storedPdfName || 'application.pdf';
        const textRaw = await extractPdfPlainTextForParsing(buf, nameFromOpts);
        const text = normalizeOcrTextForParsing(textRaw);
        parsedData = parseBusinessData(text);
    }

    if (!parsedData || typeof parsedData !== 'object') {
        throw new Error('Failed to extract structured data from PDF');
    }

    logExtractedBusinessDataCsv(parsedData, {
        tag: '[pdfIngestion]',
        fileName: storedPdfName,
    });

    const business: any = parsedData.business || {};
    const owner: any = parsedData.owner || {};

    const ownerSsnRaw =
        owner.owner_ssn || owner.ownerSsn || owner.ssn || null;
    const ownerSsnNorm = normalizeSsn(ownerSsnRaw);

    // Parse requested loan amount
    const requestedAmountRaw =
        business.business_requested_amount || business.requested_amount || null;
    const loanAmountNum = parseNumericAmount(requestedAmountRaw);

    // Parse Gross Annual Sales → monthly revenue
    const grossAnnualRaw = business.business_monthly_revenue; // parsed from "Gross Annual Sales"
    const annualRevenue = parseNumericAmount(grossAnnualRaw);
    const monthlyRevenue =
        annualRevenue != null ? Math.round((annualRevenue / 12) * 100) / 100 : null;

    // 3️⃣ Try to find existing client (EIN, business+email, SSN, business+owner name)
    const existingMatch = await findExistingClientFromPdfExtract(business, owner);
    let clientRecord: any | null = existingMatch?.client ?? null;
    let existingClient = Boolean(clientRecord);

    if (existingMatch) {
        console.log(
            `[createClientAndApplicationFromPDFBuffer] Reusing existing client (${existingMatch.matchedBy}): clientId=${clientRecord?.clientId}`,
        );
    }

    // 4️⃣ Create client + application
    if (clientRecord) {
        await mergePdfExtractIntoExistingClient(clientRecord.id, business, owner);
        clientRecord = await prisma.client.findUnique({
            where: { id: clientRecord.id },
        });

        // Client already exists → create application only
        const createdApplication = await withAllocatedDealId((dealId, tx) =>
            tx.application.create({
                data: applicationCreateUncheckedData({
                    priority: 'High',
                    type: 'New',
                    salesRepresentativeId: userId,
                    referringAgentId: userId,
                    clientId: clientRecord.id,
                    isoId: isoId || null,
                    commissionPercentage: commissionPercentageFromIso,
                    loanAmount: loanAmountNum != null && !isNaN(loanAmountNum) ? loanAmountNum : null,
                    createdById: userId,
                    currentQueue: agentCreationQueue,
                    currentState: agentCreationState,
                    note: gmailNote || undefined,
                    dealId,
                }),
                include: applicationWithFilesInclude,
            }),
        );

        if (buf.length > 0) {
            await attachBufferAsApplicationFile(createdApplication.id, buf, storedPdfName);
        }
        const applicationWithFiles =
            (await refetchApplicationWithFiles(createdApplication.id)) || createdApplication;

        try {
            await syncDuplicateFlagForApplication(createdApplication.id);
        } catch (dedupeErr) {
            console.warn('[createClientAndApplicationFromPDFBuffer] isDuplicate sync failed:', dedupeErr);
        }

        await stampPdfCreateIdempotency({
            userId,
            applicationId: createdApplication.id,
            pdfContentHash,
            gmailMessageId: gmailMessageId || null,
        });

        console.log(
            '[createClientAndApplicationFromPDFBuffer] Final DB result (existing client):',
            JSON.stringify(
                { clientId: clientRecord.id, applicationId: applicationWithFiles.id },
                null,
                2,
            ),
        );

        scheduleApplicationStageNotification({
            application: applicationWithFiles as any,
            transitionAction: 'CREATED',
            actorId: userId,
        });

        return {
            client: clientRecord,
            application: applicationWithFiles,
            existingClient: true,
        };
    }

    assertReadyToCreateNewClientFromPdf(parsedData, clientRecord);

    // Client does not exist → create client + application atomically
    const result = await prisma.$transaction(async (tx) => {
        const dealId = await allocateNextDealId(tx);

        const businessNameFallback =
            String(business.business_name || '').trim() ||
            String(business.dba_name || '').trim() ||
            (owner.owner_first_name || owner.owner_last_name
                ? `${String(owner.owner_first_name || '').trim()} ${String(owner.owner_last_name || '').trim()}`.trim() + ' Business'
                : 'Unknown Business');
        const newClient = await tx.client.create({
            data: {
                businessName: businessNameFallback,
                businessEmail: business.business_email || null,
                businessNumber: business.phone_number || null,
                businessWebsite: business.business_website || null,
                businessIncorporationDate: parseDateForClientFields(business.business_incorporation_date),
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
                ownerDateOfBirth: parseDateForClientFields(owner.owner_date_of_birth),
                ownerSsn: ownerSsnNorm || null,
                ownerFicoScore: owner.owner_fico_score ? Number(owner.owner_fico_score) : null,
                ownerOwnershipStartDate: null,
                ownerOwnershipPercentage: owner.owner_ownership_percentage
                    ? Number(owner.owner_ownership_percentage)
                    : null,
                ownerAddress1: owner.owner_address1 || null,
                ownerAddress2: null,
                ownerCity: owner.owner_city || null,
                ownerState: owner.owner_state || null,
                ownerZipCode: owner.owner_zip_code || null,
                createdById: userId,
            },
        });

        const newApplication = await tx.application.create({
            data: applicationCreateUncheckedData({
                priority: 'High',
                type: 'New',
                salesRepresentativeId: userId,
                referringAgentId: userId,
                clientId: newClient.id,
                isoId: isoId || null,
                commissionPercentage: commissionPercentageFromIso,
                loanAmount: loanAmountNum != null && !isNaN(loanAmountNum) ? loanAmountNum : null,
                createdById: userId,
                currentQueue: agentCreationQueue,
                currentState: agentCreationState,
                note: gmailNote || undefined,
                dealId,
            }),
            include: applicationWithFilesInclude,
        });

        return { newClient, newApplication };
    }, { maxWait: 20_000, timeout: 120_000 });

    if (buf.length > 0) {
        await attachBufferAsApplicationFile(result.newApplication.id, buf, storedPdfName);
    }
    const applicationWithFiles =
        (await refetchApplicationWithFiles(result.newApplication.id)) || result.newApplication;

    try {
        await syncDuplicateFlagForApplication(result.newApplication.id);
    } catch (dedupeErr) {
        console.warn('[createClientAndApplicationFromPDFBuffer] isDuplicate sync failed:', dedupeErr);
    }

    await stampPdfCreateIdempotency({
        userId,
        applicationId: result.newApplication.id,
        pdfContentHash,
        gmailMessageId: gmailMessageId || null,
    });

    console.log(
        '[createClientAndApplicationFromPDFBuffer] Final DB result (new client):',
        JSON.stringify(
            { clientId: result.newClient.id, applicationId: applicationWithFiles.id },
            null,
            2,
        ),
    );

    scheduleApplicationStageNotification({
        application: applicationWithFiles as any,
        transitionAction: 'CREATED',
        actorId: userId,
    });

    return {
        client: result.newClient,
        application: applicationWithFiles,
        existingClient: false,
    };
}

/** Placeholder owner names when Gmail subject fallback creates a client without PDF extraction. */
export const GMAIL_SUBJECT_FALLBACK_OWNER_FIRST = 'none';
export const GMAIL_SUBJECT_FALLBACK_OWNER_LAST = 'none';

export interface CreateGmailSubjectFallbackOptions {
    isoId?: string | null;
    gmailMessageId?: string | null;
}

/**
 * Creates a Client + Application using only the merchant name parsed from the email subject.
 * Used when PDF extraction cannot supply enough data for the normal auto-create path.
 */
export async function createApplicationFromGmailSubjectFallback(
    businessName: string,
    userId: string,
    options?: CreateGmailSubjectFallbackOptions,
): Promise<PdfApplicationResult> {
    const trimmedBusinessName = String(businessName || '').trim();
    if (!trimmedBusinessName) {
        throw new Error('Business name is required for Gmail subject fallback');
    }

    const isoId = options?.isoId ? String(options.isoId).trim() : null;
    let commissionPercentageFromIso = 0;
    if (isoId) {
        const isoRecord = await prisma.iso.findUnique({
            where: { id: isoId },
            select: { commissionPercentage: true },
        });
        if (isoRecord) {
            commissionPercentageFromIso = Number(isoRecord.commissionPercentage ?? 0);
        }
    }

    const gmailMessageId = String(options?.gmailMessageId || '').trim();
    const notes = gmailMessageId
        ? `Auto-created from Gmail subject (PDF extraction incomplete). MessageId: ${gmailMessageId}`
        : 'Auto-created from Gmail subject (PDF extraction incomplete).';

    const result = await prisma.$transaction(async (tx) => {
        const dealId = await allocateNextDealId(tx);

        const newClient = await tx.client.create({
            data: {
                businessName: trimmedBusinessName,
                ownerFirstName: GMAIL_SUBJECT_FALLBACK_OWNER_FIRST,
                ownerLastName: GMAIL_SUBJECT_FALLBACK_OWNER_LAST,
                notes,
                createdById: userId,
            },
        });

        const newApplication = await tx.application.create({
            data: applicationCreateUncheckedData({
                priority: 'High',
                type: 'New',
                salesRepresentativeId: userId,
                referringAgentId: userId,
                clientId: newClient.id,
                isoId: isoId || null,
                commissionPercentage: commissionPercentageFromIso,
                createdById: userId,
                currentQueue: PDF_EMAIL_AUTO_CREATE_QUEUE,
                currentState: PDF_EMAIL_AUTO_CREATE_STATE,
                note: gmailMessageId ? gmailAutoCreateMessageNote(gmailMessageId) : '',
                dealId,
            }),
            include: applicationWithFilesInclude,
        });

        return { newClient, newApplication };
    }, { maxWait: 20_000, timeout: 120_000 });

    const applicationWithFiles =
        (await refetchApplicationWithFiles(result.newApplication.id)) || result.newApplication;

    try {
        await syncDuplicateFlagForApplication(result.newApplication.id);
    } catch (dedupeErr) {
        console.warn('[createApplicationFromGmailSubjectFallback] isDuplicate sync failed:', dedupeErr);
    }

    console.log(
        '[createApplicationFromGmailSubjectFallback] Created from subject:',
        JSON.stringify(
            {
                businessName: trimmedBusinessName,
                clientId: result.newClient.id,
                applicationId: applicationWithFiles.id,
            },
            null,
            2,
        ),
    );

    scheduleApplicationStageNotification({
        application: applicationWithFiles as any,
        transitionAction: 'CREATED',
        actorId: userId,
    });

    return {
        client: result.newClient,
        application: applicationWithFiles,
        existingClient: false,
    };
}

function pdfExtractString(value: unknown): string {
    return value != null ? String(value).trim() : '';
}

async function downloadPdfBufferFromUrl(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120_000,
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
    });
    return Buffer.from(response.data);
}

/**
 * Runs Claude/Document AI extraction on a stored application PDF and merges
 * business + owner fields into the linked client (and loan amount on the application).
 */
export async function applyPdfExtractToApplicationFromStoredFile(
    applicationId: string,
    fileId: string,
): Promise<{ client: any; application: any; parsedData: unknown }> {
    const file = await prisma.applicationFile.findFirst({
        where: { id: fileId, applicationId },
    });
    if (!file?.url) {
        throw new Error('Application file not found');
    }

    const fileName = String(file.originalName || '').trim() || 'document.pdf';
    const mime = String(file.mimeType || '').toLowerCase();
    const isPdf =
        mime === 'application/pdf' ||
        fileName.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
        throw new Error('Only PDF files can be used to fill application details');
    }

    const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: { client: true },
    });
    if (!application?.client) {
        throw new Error('Application or client not found');
    }

    const pdfBuffer = await downloadPdfBufferFromUrl(file.url);
    const syntheticText = await extractPdfPlainTextForParsing(pdfBuffer, fileName);
    const parsedData = parseBusinessData(normalizeOcrTextForParsing(syntheticText));

    if (!parsedData || typeof parsedData !== 'object') {
        throw new Error('Failed to extract structured data from PDF');
    }

    logExtractedBusinessDataCsv(parsedData, {
        tag: '[fillFromPdf]',
        fileName,
    });

    const business: Record<string, unknown> = (parsedData as { business?: Record<string, unknown> }).business || {};
    const owner: Record<string, unknown> = (parsedData as { owner?: Record<string, unknown> }).owner || {};
    const client = application.client;

    const ownerSsnNorm = normalizeSsn(
        pdfExtractString(owner.owner_ssn || owner.ownerSsn || owner.ssn) || null,
    );

    const requestedAmountRaw =
        business.business_requested_amount || business.requested_amount || null;
    const loanAmountNum = parseNumericAmount(requestedAmountRaw as string | number | null | undefined);

    const grossAnnualRaw = business.business_monthly_revenue;
    const annualRevenue = parseNumericAmount(grossAnnualRaw as string | number | null | undefined);
    const monthlyRevenue =
        annualRevenue != null ? Math.round((annualRevenue / 12) * 100) / 100 : null;

    const patch: Prisma.ClientUpdateInput = {};

    const businessName =
        pdfExtractString(business.business_name) || pdfExtractString(business.dba_name);
    if (businessName) patch.businessName = businessName;

    const assignString = (key: keyof Prisma.ClientUpdateInput, value: unknown) => {
        const v = pdfExtractString(value);
        if (v) (patch as Record<string, unknown>)[key as string] = v;
    };

    assignString('businessEmail', business.business_email);
    assignString('businessNumber', business.phone_number);
    assignString('businessWebsite', business.business_website);
    assignString('businessIncorporationState', business.business_incorporation_state || business.business_state);
    assignString('businessEntityType', business.business_type_of_entity);
    assignString('businessEinNumber', business.business_ein_number);
    assignString('businessAddress1', business.business_address1);
    assignString('businessAddress2', business.business_address2);
    assignString('businessCity', business.business_city);
    assignString('businessState', business.business_state);
    assignString('businessZipCode', business.business_zip_code);

    const incorporationDate = parseDateForClientFields(
        pdfExtractString(business.business_incorporation_date) || null,
    );
    if (incorporationDate) patch.businessIncorporationDate = incorporationDate;
    if (annualRevenue != null) patch.businessAnnualRevenue = annualRevenue;
    if (monthlyRevenue != null) patch.businessMonthlyRevenue = monthlyRevenue;

    const ownerFirst = pdfExtractString(owner.owner_first_name);
    const ownerLast = pdfExtractString(owner.owner_last_name);
    if (ownerFirst) patch.ownerFirstName = ownerFirst;
    if (ownerLast) patch.ownerLastName = ownerLast;

    assignString('ownerMiddleName', owner.owner_middle_name);
    assignString('ownerEmail', owner.owner_email);
    assignString('ownerMobileNumber', owner.owner_mobile_number);
    assignString('ownerAddress1', owner.owner_address1);
    assignString('ownerCity', owner.owner_city);
    assignString('ownerState', owner.owner_state);
    assignString('ownerZipCode', owner.owner_zip_code);

    const ownerDob = parseDateForClientFields(pdfExtractString(owner.owner_date_of_birth) || null);
    if (ownerDob) patch.ownerDateOfBirth = ownerDob;
    if (ownerSsnNorm) patch.ownerSsn = ownerSsnNorm;

    const fico = pdfExtractString(owner.owner_fico_score);
    if (fico && !Number.isNaN(Number(fico))) patch.ownerFicoScore = Number(fico);

    const ownershipPct = pdfExtractString(owner.owner_ownership_percentage);
    if (ownershipPct && !Number.isNaN(Number(ownershipPct))) {
        patch.ownerOwnershipPercentage = Number(ownershipPct);
    }

    if (Object.keys(patch).length === 0 && loanAmountNum == null) {
        throw new Error(
            'PDF extraction did not return enough business or owner fields to update this application',
        );
    }

    const updatedClient =
        Object.keys(patch).length > 0
            ? await prisma.client.update({
                  where: { id: client.id },
                  data: patch,
              })
            : client;

    const applicationPatch: Prisma.ApplicationUpdateInput = {};
    if (loanAmountNum != null && !Number.isNaN(loanAmountNum)) {
        applicationPatch.loanAmount = loanAmountNum;
    }

    const updatedApplication = await prisma.application.update({
        where: { id: applicationId },
        data: applicationPatch,
        include: applicationWithFilesInclude,
    });

    console.log(
        '[applyPdfExtractToApplicationFromStoredFile] Updated application from PDF:',
        JSON.stringify(
            {
                applicationId,
                fileId,
                fileName,
                clientId: updatedClient.id,
                fieldsUpdated: Object.keys(patch),
                loanAmount: loanAmountNum,
            },
            null,
            2,
        ),
    );

    return {
        client: updatedClient,
        application: updatedApplication,
        parsedData,
    };
}

const applicationService = {
    mergeApplicationVisibilityWhere,
    canUserAccessApplication,
    getApplicationForUser,
    getApplicationForUserByRef,
    resolveApplicationWhere,
    createClientAndApplicationFromPDFBuffer,
    createApplicationFromGmailSubjectFallback,
    applyPdfExtractToApplicationFromStoredFile,
};

export { mergePdfExtractIntoExistingClient };

export default applicationService;
