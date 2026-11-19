import prisma from '../config/prismaClient';
import {
  findFulfilledDocumentForRequest,
  getDocumentRequestConfig,
} from '../constants/documentRequestTypes';
import { loadDocumentRequestFulfillmentContext } from './documentRequestFulfillmentService';

export type DocumentRequestListItem = {
  name: string;
  label?: string;
  status: 'Complete' | 'Pending';
  createdAt: Date;
  requestedBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  message?: string;
  fileUrl?: string;
  fileId?: string;
  originalFileName?: string;
  mimeType?: string;
  contractUploadKey?: string;
};

/** Build the document-request checklist for an application (shared by auth + public portals). */
export async function buildDocumentRequestListForApplication(
  applicationUuid: string,
): Promise<DocumentRequestListItem[]> {
  const application = await prisma.application.findUnique({
    where: { id: applicationUuid },
    include: { files: true },
  });
  if (!application) return [];

  const fulfillmentContext = await loadDocumentRequestFulfillmentContext(application.id);
  const applicationFiles = fulfillmentContext?.applicationFiles ?? application.files ?? [];
  const contractFiles = fulfillmentContext?.contractFiles ?? [];

  const notificationsRecords = await prisma.notification.findMany({
    where: {
      applicationId: application.id,
      type: 'document_request',
    },
    orderBy: { createdAt: 'desc' },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });

  const documentMap = new Map<
    string,
    {
      status: 'Complete' | 'Pending';
      createdAt: Date;
      requestedBy?: DocumentRequestListItem['requestedBy'];
      message?: string;
      label?: string;
      fileUrl?: string;
      fileId?: string;
      contractUploadKey?: string;
      originalFileName?: string;
      mimeType?: string;
    }
  >();
  const generalRequests: DocumentRequestListItem[] = [];

  notificationsRecords.forEach((notification) => {
    const requestedDocs = notification.documentRequestedDocuments || [];
    const wantsAdditional = Boolean(notification.documentRequestAdditional);

    requestedDocs.forEach((docSlug: string) => {
      const config = getDocumentRequestConfig(docSlug);
      const fulfilled = findFulfilledDocumentForRequest(docSlug, {
        applicationFiles,
        contractFiles,
      });
      const isUploaded = fulfilled != null;

      if (
        !documentMap.has(docSlug) ||
        (documentMap.get(docSlug)?.createdAt &&
          notification.createdAt > documentMap.get(docSlug)!.createdAt)
      ) {
        documentMap.set(docSlug, {
          status: isUploaded ? 'Complete' : 'Pending',
          createdAt: notification.createdAt,
          requestedBy: notification.createdBy ?? undefined,
          label: config?.label,
          fileUrl: fulfilled?.url,
          fileId: fulfilled?.fileId,
          contractUploadKey: config?.contractUploadKey,
          originalFileName: fulfilled?.originalName,
          mimeType: fulfilled?.mimeType,
        });
      }
    });

    if (wantsAdditional) {
      const additionalSlug = 'additional-documents';
      const fulfilled = findFulfilledDocumentForRequest(additionalSlug, {
        applicationFiles,
        contractFiles,
      });
      if (
        !documentMap.has(additionalSlug) ||
        (documentMap.get(additionalSlug)?.createdAt &&
          notification.createdAt > documentMap.get(additionalSlug)!.createdAt)
      ) {
        documentMap.set(additionalSlug, {
          status: fulfilled ? 'Complete' : 'Pending',
          createdAt: notification.createdAt,
          requestedBy: notification.createdBy ?? undefined,
          label: 'Additional documents (as discussed)',
          fileUrl: fulfilled?.url,
          fileId: fulfilled?.fileId,
          originalFileName: fulfilled?.originalName,
          mimeType: fulfilled?.mimeType,
        });
      }
    }

    if (requestedDocs.length === 0 && !wantsAdditional && notification.message) {
      generalRequests.push({
        name: 'Sent Back for Documentation',
        status: 'Pending',
        createdAt: notification.createdAt,
        requestedBy: notification.createdBy ?? undefined,
        message: notification.message,
      });
    }
  });

  const documents: DocumentRequestListItem[] = Array.from(documentMap.entries()).map(
    ([name, data]) => ({
      name,
      label: data.label,
      status: data.status,
      createdAt: data.createdAt,
      requestedBy: data.requestedBy,
      message: data.message,
      fileUrl: data.fileUrl,
      fileId: data.fileId,
      contractUploadKey: data.contractUploadKey,
      originalFileName: data.originalFileName,
      mimeType: data.mimeType,
    }),
  );

  generalRequests
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .forEach((req) => documents.push(req));

  return documents;
}
