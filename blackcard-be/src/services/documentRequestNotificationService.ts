import prisma from '../config/prismaClient';
import {
    documentRequestDisplayLabel,
    isDocumentRequestFulfilled,
} from '../utils/documentRequestMatch';

/** Notify users who requested documents when a matching file is uploaded. */
export async function notifyDocumentRequestRecipientsOnUpload(params: {
    applicationId: string;
    applicationNumber?: number | null;
    uploaderUserId?: string | null;
    filesBefore: Array<{ originalName?: string | null }>;
    filesAfter: Array<{ originalName?: string | null }>;
}): Promise<void> {
    const { applicationId, applicationNumber, uploaderUserId, filesBefore, filesAfter } = params;

    const requestNotifications = await prisma.notification.findMany({
        where: { applicationId, type: 'document_request' },
        orderBy: { createdAt: 'desc' },
    });

    if (!requestNotifications.length) return;

    const requestedDocIds = new Set<string>();
    for (const row of requestNotifications) {
        for (const docId of row.documentRequestedDocuments || []) {
            if (String(docId || '').trim()) requestedDocIds.add(String(docId).trim());
        }
    }

    const newlyFulfilled = [...requestedDocIds].filter(
        (docId) =>
            !isDocumentRequestFulfilled(docId, filesBefore) &&
            isDocumentRequestFulfilled(docId, filesAfter),
    );

    if (!newlyFulfilled.length) return;

    const appLabel = applicationNumber != null ? String(applicationNumber) : 'N/A';
    const notifiedKeys = new Set<string>();

    for (const docId of newlyFulfilled) {
        const label = documentRequestDisplayLabel(docId);
        for (const row of requestNotifications) {
            const docs = row.documentRequestedDocuments || [];
            if (!docs.includes(docId)) continue;

            const recipientId = String(row.createdById || '').trim();
            if (!recipientId) continue;

            const dedupeKey = `${recipientId}:${docId}`;
            if (notifiedKeys.has(dedupeKey)) continue;
            notifiedKeys.add(dedupeKey);

            const actorId = String(uploaderUserId || recipientId).trim();
            if (!actorId) continue;

            await prisma.notification.create({
                data: {
                    title: 'Requested document received',
                    message: `${label} was uploaded for Application #${appLabel}.`,
                    type: 'document_request_received',
                    applicationId,
                    recipientId,
                    createdById: actorId,
                    documentRequestedDocuments: [docId],
                    documentRequestAdditional: false,
                    isRead: false,
                },
            });
        }
    }
}
