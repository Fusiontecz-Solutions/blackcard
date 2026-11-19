import prisma from '../config/prismaClient';
import {
  DOCUMENT_REQUEST_LABELS,
  findFulfilledDocumentForRequest,
  getDocumentRequestConfig,
} from '../constants/documentRequestTypes';
import { emitToUser } from '../socket';
import {
  deriveActionUrl,
  deriveCategory,
  notificationTriageDefaults,
} from './notificationCategory';

type RecipientUser = {
  id: string;
  email?: string | null;
};

async function findActiveUsersByIds(ids: string[]): Promise<RecipientUser[]> {
  const unique = Array.from(new Set(ids.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!unique.length) return [];
  return prisma.user.findMany({
    where: { id: { in: unique }, isActive: true },
    select: { id: true, email: true },
  });
}

async function findActiveSuperAdmins(): Promise<RecipientUser[]> {
  try {
    return await prisma.user.findMany({
      where: { role: 'SUPER_ADMIN' as any, isActive: true },
      select: { id: true, email: true },
    });
  } catch (err) {
    console.error('[iso-doc-upload-notify] super-admin recipients failed:', err);
    return [];
  }
}

/** Deal stakeholders + all Super Admins (same idea as comment notify). */
async function resolveDealUsersAndSuperAdmins(applicationId: string): Promise<RecipientUser[]> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      claimedByUnderwriterId: true,
      assignedUnderwriterId: true,
      approvedByUnderwriterId: true,
      salesRepresentativeId: true,
      referringAgentId: true,
      createdById: true,
    },
  });
  if (!application) return [];

  const byId = new Map<string, RecipientUser>();
  const add = (row: RecipientUser | null | undefined) => {
    if (!row?.id) return;
    byId.set(String(row.id), { id: String(row.id), email: row.email ?? null });
  };

  const stakeIds = [
    application.claimedByUnderwriterId,
    application.assignedUnderwriterId,
    (application as { approvedByUnderwriterId?: string | null }).approvedByUnderwriterId,
    application.salesRepresentativeId,
    application.referringAgentId,
    application.createdById,
  ].filter(Boolean) as string[];
  (await findActiveUsersByIds(stakeIds)).forEach(add);
  (await findActiveSuperAdmins()).forEach(add);
  return Array.from(byId.values());
}

export async function loadDocumentRequestFulfillmentContext(applicationUuid: string) {
  const application = await prisma.application.findUnique({
    where: { id: applicationUuid },
    include: {
      files: true,
      contract: {
        select: {
          id: true,
          documents: {
            select: {
              id: true,
              documentType: true,
              fileName: true,
              fileUrl: true,
              downloadUrl: true,
            },
          },
        },
      },
    },
  });

  if (!application) return null;

  const contractFiles =
    (application as any).contract?.documents?.map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ''),
      documentType: row.documentType,
      fileName: row.fileName,
      fileUrl: row.fileUrl,
      downloadUrl: row.downloadUrl,
    })) ?? [];

  return {
    applicationId: application.applicationId,
    applicationUuid: application.id,
    applicationFiles: application.files.map((f) => ({
      id: f.id,
      originalName: f.originalName,
      requestedDocumentSlug: (f as { requestedDocumentSlug?: string | null }).requestedDocumentSlug,
      url: f.url,
    })),
    contractFiles,
  };
}

/**
 * Notify original document requesters + deal users + all Super Admins when ISO/portal
 * (or CRM) uploads a requested document.
 */
export async function notifyRequestersDocumentReceived(options: {
  applicationUuid: string;
  documentSlug: string;
  uploadedByUserId: string;
  /** When true (public ISO portal), message says ISO uploaded. */
  fromIsoPortal?: boolean;
}): Promise<void> {
  const slug = String(options.documentSlug || '').trim().toLowerCase();
  if (!slug) return;

  const config = getDocumentRequestConfig(slug);
  const label = config?.label || DOCUMENT_REQUEST_LABELS[slug] || slug;

  const application = await prisma.application.findUnique({
    where: { id: options.applicationUuid },
    select: {
      id: true,
      applicationId: true,
      currentQueue: true,
      currentState: true,
      client: { select: { businessName: true } },
    },
  });
  if (!application) return;

  const notifications = await prisma.notification.findMany({
    where: {
      applicationId: application.id,
      type: 'document_request',
    },
    orderBy: { createdAt: 'desc' },
    select: {
      createdById: true,
      documentRequestedDocuments: true,
    },
  });

  const recipientIds = new Set<string>();
  for (const row of notifications) {
    const docs = row.documentRequestedDocuments || [];
    if (!docs.includes(slug)) continue;
    if (row.createdById) recipientIds.add(String(row.createdById));
  }

  // Always include deal stakeholders + Super Admins (org-admin / SA personal inbox).
  for (const u of await resolveDealUsersAndSuperAdmins(application.id)) {
    recipientIds.add(String(u.id));
  }

  const uploaderId = String(options.uploadedByUserId || '').trim();
  const appNum = application.applicationId ?? 'N/A';
  const clientName = String(application.client?.businessName || '').trim() || 'Client';
  const fromIso = options.fromIsoPortal === true;
  const title = fromIso ? 'ISO uploaded a document' : 'Requested document received';
  const message = fromIso
    ? `ISO uploaded ${label} for Application #${appNum} (${clientName}).`
    : `${label} was uploaded for Application #${appNum}.`;
  const type = 'document_received';
  const triage = notificationTriageDefaults(type, application);
  const actionUrl = deriveActionUrl({
    type,
    category: triage.category as any,
    applicationNumber: application.applicationId,
    applicationUuid: application.id,
  });

  for (const recipientId of recipientIds) {
    if (uploaderId && recipientId === uploaderId) continue;
    try {
      const created = await prisma.notification.create({
        data: {
          title,
          message,
          type,
          category: triage.category || deriveCategory(type),
          bucket: triage.bucket,
          importance: 'high',
          actionUrl,
          applicationId: application.id,
          recipientId,
          createdById: uploaderId || null,
        },
      });
      emitToUser(recipientId, 'notification:new', {
        notification: {
          _id: created.id,
          id: created.id,
          title: created.title,
          message: created.message,
          type: created.type,
          recipientId,
          applicationId: application.id,
          isRead: false,
          category: created.category,
          bucket: created.bucket,
          importance: created.importance,
          actionUrl: created.actionUrl,
          createdAt: created.createdAt,
        },
      });
    } catch (err) {
      // Retry without createdById if FK fails (portal actor).
      try {
        await prisma.notification.create({
          data: {
            title,
            message,
            type,
            category: triage.category || deriveCategory(type),
            bucket: triage.bucket,
            importance: 'high',
            actionUrl,
            applicationId: application.id,
            recipientId,
            createdById: null,
          },
        });
      } catch (err2) {
        console.error('[documentRequest] Failed to notify recipient:', err2);
      }
    }
  }
}

export async function notifyForContractDocumentUpload(options: {
  contractId: number;
  contractUploadKeys: string[];
  uploadedByUserId: string;
}): Promise<void> {
  const contract = await prisma.contract.findUnique({
    where: { id: options.contractId },
    select: { applicationId: true },
  });
  if (!contract?.applicationId) return;

  const { slugsForContractUploadKey } = await import('../constants/documentRequestTypes');
  const slugs = new Set<string>();
  for (const key of options.contractUploadKeys) {
    for (const slug of slugsForContractUploadKey(key)) {
      slugs.add(slug);
    }
  }

  const context = await loadDocumentRequestFulfillmentContext(contract.applicationId);
  if (!context) return;

  for (const slug of slugs) {
    const fulfilled = findFulfilledDocumentForRequest(slug, {
      applicationFiles: context.applicationFiles,
      contractFiles: context.contractFiles,
    });
    if (!fulfilled || fulfilled.source !== 'contract') continue;
    await notifyRequestersDocumentReceived({
      applicationUuid: contract.applicationId,
      documentSlug: slug,
      uploadedByUserId: options.uploadedByUserId,
    });
  }
}
