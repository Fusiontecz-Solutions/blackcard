/**
 * Shared "Missing Documents → back to Scrubber" logic, used by the Super Admin
 * CRM endpoint and the public (no-login) document upload link.
 */
import type { Prisma } from '@prisma/client';
import type { Request } from 'express';
import prisma from '../config/prismaClient';
import { CANONICAL_WORKFLOW_QUEUES } from '../utils/workflowQueueStorage';
import { DOCUMENT_REQUEST_TYPES } from '../constants/documentRequestTypes';
import { createApplicationActivityLog } from './applicationActivityLogService';
import { invalidateAllApplicationStatsCache } from './applicationStatsCache';
import type { AuthenticatedUser } from './applicationService';

export const MISSING_DOCUMENTS_NOTE_PREFIX = 'MISSING_DOCUMENTS:';

const normalizeQueueToken = (value: unknown): string =>
    typeof value === 'string' ? value.trim().toUpperCase().replace(/[\s-]+/g, '_') : '';

export function isMissingDocumentsQueue(queue: unknown): boolean {
    return normalizeQueueToken(queue) === 'MISSING_DOCUMENTS';
}

/** Parse the `MISSING_DOCUMENTS:` marker line (`|||` delimited) from Application.note. */
export function parseMissingDocumentsFromNote(note: unknown): string[] {
    const line = String(note ?? '')
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.startsWith(MISSING_DOCUMENTS_NOTE_PREFIX));
    if (!line) return [];
    return line
        .slice(MISSING_DOCUMENTS_NOTE_PREFIX.length)
        .split('|||')
        .map((d) => d.trim())
        .filter(Boolean);
}

export type ResolveMissingDocumentsResult<T> =
    | { ok: true; application: T }
    | { ok: false; status: 404 | 400; message: string };

/**
 * Return a Missing Documents deal to the Scrubbing queue UNCLAIMED, clear the
 * note marker and log activity. Caller handles auth.
 */
export async function resolveMissingDocumentsForApplication<I extends Prisma.ApplicationInclude>(params: {
    where: Prisma.ApplicationWhereUniqueInput;
    include: I;
    user: AuthenticatedUser | null;
    req?: Request | null;
    actionDescription: string;
    metadata?: Record<string, unknown>;
}): Promise<ResolveMissingDocumentsResult<Prisma.ApplicationGetPayload<{ include: I }>>> {
    const application = await prisma.application.findUnique({ where: params.where });
    if (!application) return { ok: false, status: 404, message: 'Application not found' };
    if (!isMissingDocumentsQueue(application.currentQueue)) {
        return { ok: false, status: 400, message: 'This deal is not in Missing Documents' };
    }

    const nextNote = String(application.note ?? '')
        .split('\n')
        .filter((line) => !line.trim().startsWith(MISSING_DOCUMENTS_NOTE_PREFIX))
        .join('\n')
        .trim();

    // Conditional update so a concurrent second call cannot resolve twice.
    const updated = await prisma.application.updateMany({
        where: { id: application.id, currentQueue: application.currentQueue },
        data: {
            currentQueue: CANONICAL_WORKFLOW_QUEUES.SCRUBBING,
            currentState: 'IN_PROGRESS',
            claimedByUnderwriterId: null,
            claimedAt: null,
            assignedUnderwriterId: null,
            note: nextNote || null,
        },
    });
    if (updated.count === 0) {
        return { ok: false, status: 400, message: 'This deal is not in Missing Documents' };
    }

    const refreshed = (await prisma.application.findUnique({
        where: { id: application.id },
        include: params.include,
    })) as Prisma.ApplicationGetPayload<{ include: I }>;

    try {
        await createApplicationActivityLog({
            applicationId: application.id,
            user: params.user,
            req: params.req ?? null,
            actionType: 'QUEUE_CHANGED',
            actionDescription: params.actionDescription,
            previousStatus: `${application.currentQueue} / ${application.currentState}`,
            currentStatus: `${refreshed.currentQueue} / ${refreshed.currentState}`,
            metadata: params.metadata,
        });
    } catch (logErr) {
        console.error('Failed to log missing documents resolve:', logErr);
    }

    invalidateAllApplicationStatsCache();
    return { ok: true, application: refreshed };
}

const normalizeDocumentKey = (value: unknown): string =>
    String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Generic "other" document type: free-text marker entries upload under it. */
export const MISSING_DOCUMENTS_GENERIC_SLUG = 'additional-documents';

/**
 * File-name prefix that ties an upload under the generic slug to the free-text
 * entry it satisfies (ApplicationFile has no description column). Keep in sync
 * with blackcard-fe src/lib/missingDocuments.ts.
 */
export function missingDocumentFilePrefix(label: string): string {
    const clean = String(label || '')
        .replace(/[\/:*?"<>|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80);
    return `${clean || 'Document'} - `;
}

/**
 * Map one scrubber marker entry (a catalog label, or free text) to a document
 * request slug. Catalog entries map by label or slug; free text uploads under
 * the generic "Additional documents" type so it shows in the Documents tab.
 */
export function missingDocumentSlugForLabel(label: string): { slug: string; matched: boolean } {
    const key = normalizeDocumentKey(label);
    const match = DOCUMENT_REQUEST_TYPES.find(
        (t) => normalizeDocumentKey(t.label) === key || normalizeDocumentKey(t.slug) === key,
    );
    if (match) return { slug: match.slug, matched: true };
    return { slug: MISSING_DOCUMENTS_GENERIC_SLUG, matched: false };
}

export type MissingDocumentItem = {
    /** Stable unique row key (the slug for catalog entries; free text shares the generic slug). */
    key: string;
    label: string;
    slug: string;
    /** True when the label matched a catalog document type. */
    matched: boolean;
    /** Free-text rows: file-name prefix to add on upload; empty for catalog rows. */
    fileNamePrefix: string;
    /** At least one file tagged with this slug was uploaded during this hold. */
    satisfied: boolean;
    files: { id: string; name: string; uploadedAt: Date }[];
};

/**
 * Per-document status for a Missing Documents hold. The hold starts at the
 * latest "flagged this deal as Missing Documents" activity log; when that log
 * is missing, only uploads made on the public page (client-side) count.
 * Free-text rows count generic-slug files whose name carries the row's prefix.
 */
export async function buildMissingDocumentItems(application: {
    id: string;
    note: string | null;
}): Promise<{ heldSince: Date | null; items: MissingDocumentItem[] }> {
    const labels = parseMissingDocumentsFromNote(application.note);
    if (labels.length === 0) return { heldSince: null, items: [] };

    const flagLog = await prisma.applicationActivityLog.findFirst({
        where: {
            applicationId: application.id,
            actionType: 'QUEUE_CHANGED',
            actionDescription: { contains: 'flagged this deal as Missing Documents' },
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
    });
    const heldSince = flagLog?.createdAt ?? null;

    const seen = new Set<string>();
    const mapped = labels.map((label) => {
        const m = missingDocumentSlugForLabel(label);
        const base = m.matched ? m.slug : `${m.slug}:${normalizeDocumentKey(label) || 'document'}`;
        let key = base;
        for (let i = 2; seen.has(key); i++) key = `${base}-${i}`;
        seen.add(key);
        return { key, label, ...m, fileNamePrefix: m.matched ? '' : missingDocumentFilePrefix(label) };
    });
    const files = heldSince
        ? await prisma.applicationFile.findMany({
              where: {
                  applicationId: application.id,
                  requestedDocumentSlug: { in: Array.from(new Set(mapped.map((m) => m.slug))) },
                  uploadedAt: { gte: heldSince },
              },
              select: { id: true, originalName: true, uploadedAt: true, requestedDocumentSlug: true },
              orderBy: { uploadedAt: 'asc' },
          })
        : [];

    const items = mapped.map((m) => {
        const own = files
            .filter(
                (f) =>
                    f.requestedDocumentSlug === m.slug &&
                    (!m.fileNamePrefix ||
                        String(f.originalName || '').toLowerCase().startsWith(m.fileNamePrefix.toLowerCase())),
            )
            .map((f) => ({ id: f.id, name: f.originalName || 'Uploaded file', uploadedAt: f.uploadedAt }));
        return { ...m, satisfied: own.length > 0, files: own };
    });
    return { heldSince, items };
}
