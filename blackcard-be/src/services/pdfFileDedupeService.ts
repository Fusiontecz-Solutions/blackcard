import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';

const DEDUPE_DAYS_DEFAULT = 7;

/** Stored on `Application.note` when Gmail subject fallback auto-creates a deal. */
export const GMAIL_AUTO_CREATE_MSG_NOTE_PREFIX = 'gmail-msg:';

export function gmailAutoCreateMessageNote(gmailMessageId: string): string {
    return `${GMAIL_AUTO_CREATE_MSG_NOTE_PREFIX}${String(gmailMessageId || '').trim()}`;
}

/** Parse Gmail API message id stored on `Application.note` (`gmail-msg:…`). */
export function parseGmailMessageIdFromApplicationNote(note: unknown): string | null {
    const raw = String(note ?? '').trim();
    if (!raw) return null;
    const exact = raw.match(/^\s*gmail-msg:([a-zA-Z0-9_-]+)\s*$/i);
    if (exact?.[1]) return exact[1];
    const embedded = raw.match(/gmail-msg:([a-zA-Z0-9_-]+)/i);
    return embedded?.[1] ?? null;
}

/** Parse Gmail API message id from client notes when subject fallback stored `MessageId: …`. */
export function parseGmailMessageIdFromClientNotes(notes: unknown): string | null {
    const raw = String(notes ?? '');
    const match = raw.match(/MessageId:\s*([a-zA-Z0-9_-]+)/i);
    return match?.[1]?.trim() || null;
}

export function readPdfFileDedupeDays(): number {
    const raw = Number(process.env.GMAIL_AUTO_CREATE_DEDUPE_DAYS ?? DEDUPE_DAYS_DEFAULT);
    if (!Number.isFinite(raw) || raw < 1) return DEDUPE_DAYS_DEFAULT;
    return Math.min(Math.floor(raw), 90);
}

export type PdfFileSignature = {
    originalName: string;
    size: number | null;
};

/** Case-insensitive PDF filename match (Gmail MIME size often differs from Cloudinary bytes). */
function pdfFileNameWhere(fileName: string): Prisma.ApplicationFileWhereInput {
    const trimmed = String(fileName || '').trim();
    return {
        originalName: { equals: trimmed, mode: 'insensitive' },
    };
}

/** Primary PDF attachment stored on the application (Gmail auto-create / upload). */
export function pickPrimaryPdfFile(
    files: Array<{ originalName?: string | null; size?: number | null }> | null | undefined,
): PdfFileSignature | null {
    if (!files?.length) return null;
    const pdf = files.find((f) =>
        String(f.originalName || '')
            .trim()
            .toLowerCase()
            .endsWith('.pdf'),
    );
    if (!pdf) return null;
    const originalName = String(pdf.originalName || '').trim();
    if (!originalName) return null;
    const size = pdf.size != null && Number(pdf.size) > 0 ? Number(pdf.size) : null;
    return { originalName, size };
}

/**
 * Gmail auto-create guard: same PDF filename from the same creator within the last N days.
 * Filename-only — declared Gmail size and stored Cloudinary bytes often differ.
 */
export async function hasRecentDuplicatePdfForCreator(params: {
    createdById: string;
    fileName: string;
    dedupeDays?: number;
}): Promise<boolean> {
    const existing = await findRecentApplicationByPdfFileForCreator(params);
    return !!existing;
}

/**
 * Return the most recent application from this creator that already has this PDF
 * filename attached (within the dedupe window). Used to return an idempotent
 * create response instead of inserting a second deal.
 */
export async function findRecentApplicationByPdfFileForCreator(params: {
    createdById: string;
    fileName: string;
    dedupeDays?: number;
}) {
    const dedupeDays = params.dedupeDays ?? readPdfFileDedupeDays();
    const since = new Date(Date.now() - dedupeDays * 24 * 60 * 60 * 1000);
    const fileName = String(params.fileName || '').trim();
    if (!fileName || !params.createdById) return null;

    return prisma.application.findFirst({
        where: {
            createdById: params.createdById,
            createdAt: { gte: since },
            deletedAt: null,
            files: { some: pdfFileNameWhere(fileName) },
        },
        include: {
            client: true,
            referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
            salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            iso: true,
            files: true,
        },
        orderBy: { createdAt: 'desc' },
    });
}

/** True if any of the given PDF filenames already exist on a recent app from this creator. */
export async function hasRecentDuplicatePdfFilenamesForCreator(params: {
    createdById: string;
    fileNames: string[];
    dedupeDays?: number;
}): Promise<boolean> {
    const names = Array.from(
        new Set(
            (params.fileNames || [])
                .map((n) => String(n || '').trim())
                .filter(Boolean),
        ),
    );
    for (const fileName of names) {
        const dup = await hasRecentDuplicatePdfForCreator({
            createdById: params.createdById,
            fileName,
            dedupeDays: params.dedupeDays,
        });
        if (dup) return true;
    }
    return false;
}

/**
 * Gmail guard: same INBOX message must not create two applications
 * (e.g. cron re-run while email still unread, or shared inbox across CRM users).
 *
 * Only checks for an existing application stamped with `gmail-msg:{id}`.
 * Do NOT consult the auto-create ledger here — after `tryClaimGmailAutoCreateMessage`
 * inserts a `processing` row, ledger lookups treat that claim as "already handled"
 * and every new message is falsely recorded as `skipped_duplicate`.
 * Pre-claim ledger / global checks belong in `gmail.service.ts` before claim.
 */
export async function hasRecentApplicationForGmailMessage(params: {
    /** Optional — when omitted, matches any creator (shared-inbox safe). */
    createdById?: string;
    gmailMessageId: string;
    dedupeDays?: number;
}): Promise<boolean> {
    const existing = await findRecentApplicationForGmailMessage(params);
    return !!existing;
}

/** Return the most recent app stamped with this Gmail message id (any creator by default). */
export async function findRecentApplicationForGmailMessage(params: {
    /** Optional — omit to search globally across creators. */
    createdById?: string;
    gmailMessageId: string;
    dedupeDays?: number;
}) {
    const gmailMessageId = String(params.gmailMessageId || '').trim();
    if (!gmailMessageId) return null;

    const dedupeDays = params.dedupeDays ?? readPdfFileDedupeDays();
    const since = new Date(Date.now() - dedupeDays * 24 * 60 * 60 * 1000);
    const noteMarker = gmailAutoCreateMessageNote(gmailMessageId);
    const createdById = params.createdById ? String(params.createdById).trim() : '';

    return prisma.application.findFirst({
        where: {
            ...(createdById ? { createdById } : {}),
            createdAt: { gte: since },
            deletedAt: null,
            note: { contains: noteMarker },
        },
        include: {
            client: true,
            referringAgent: { select: { id: true, firstName: true, lastName: true, email: true } },
            salesRepresentative: { select: { id: true, firstName: true, lastName: true, email: true } },
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            iso: true,
            files: true,
        },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Subject-fallback guard: same merchant + ISO within the dedupe window (any creator).
 * Targets placeholder-owner (`none`/`none`) clients created when PDF extraction failed.
 */
export async function hasRecentSubjectFallbackMerchantApplication(params: {
    /** Optional — omit for shared-inbox / cross-user safety. */
    createdById?: string;
    businessName: string;
    isoId?: string | null;
    dedupeDays?: number;
}): Promise<boolean> {
    const businessName = String(params.businessName || '').trim();
    if (!businessName) return false;

    const dedupeDays = params.dedupeDays ?? readPdfFileDedupeDays();
    const since = new Date(Date.now() - dedupeDays * 24 * 60 * 60 * 1000);
    const createdById = params.createdById ? String(params.createdById).trim() : '';

    const existing = await prisma.application.findFirst({
        where: {
            ...(createdById ? { createdById } : {}),
            createdAt: { gte: since },
            ...(params.isoId ? { isoId: params.isoId } : {}),
            client: {
                businessName: { equals: businessName, mode: 'insensitive' },
                ownerFirstName: { equals: 'none', mode: 'insensitive' },
                ownerLastName: { equals: 'none', mode: 'insensitive' },
            },
        },
        select: { id: true },
    });
    return !!existing;
}

/**
 * Other applications with the same PDF filename from the same creator,
 * within ±dedupeDays of `referenceCreatedAt`.
 */
export async function findSamePdfFileApplications(params: {
    excludeApplicationId: string;
    createdById: string;
    file: PdfFileSignature;
    referenceCreatedAt: Date;
    dedupeDays?: number;
}) {
    const dedupeDays = params.dedupeDays ?? readPdfFileDedupeDays();
    const deltaMs = dedupeDays * 24 * 60 * 60 * 1000;
    const refTime = params.referenceCreatedAt.getTime();
    const windowStart = new Date(refTime - deltaMs);
    const windowEnd = new Date(refTime + deltaMs);

    return prisma.application.findMany({
        where: {
            id: { not: params.excludeApplicationId },
            createdById: params.createdById,
            createdAt: { gte: windowStart, lte: windowEnd },
            files: { some: pdfFileNameWhere(params.file.originalName) },
        },
        include: {
            client: true,
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            files: { select: { originalName: true, size: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
}

/**
 * Older applications with the same PDF filename (outside the recent dedupe window).
 * Shown in the dupes panel when a re-submission after the window is treated as a new deal.
 */
export async function findHistoricalSamePdfFileApplications(params: {
    excludeApplicationId: string;
    createdById: string;
    file: PdfFileSignature;
    referenceCreatedAt: Date;
    dedupeDays?: number;
}) {
    const dedupeDays = params.dedupeDays ?? readPdfFileDedupeDays();
    const windowStart = new Date(
        params.referenceCreatedAt.getTime() - dedupeDays * 24 * 60 * 60 * 1000,
    );

    return prisma.application.findMany({
        where: {
            id: { not: params.excludeApplicationId },
            createdById: params.createdById,
            createdAt: { lt: windowStart },
            files: { some: pdfFileNameWhere(params.file.originalName) },
        },
        include: {
            client: true,
            createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
            files: { select: { originalName: true, size: true } },
        },
        orderBy: { createdAt: 'desc' },
    });
}
