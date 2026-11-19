import prisma from '../../../config/prismaClient';
import {
  findBoldSignTemplatePdfUrlForLayout,
  isDocumentLayoutKey,
  loadPlatformDocumentPdfBase64,
  PLATFORM_DOCUMENTS,
} from '../platform-document-registry';
import type { DocumentLayout } from './convert-docusign-template-export';
import {
  getDocumentLayout,
  resolveLayoutKeyFromBoldSignType,
  type DocumentLayoutKey,
} from '../layouts/document-layout.registry';
import {
  buildRecipientTabsByRoleForLayout,
  prefillFieldsToValueMap,
  type LayoutSignerInput,
} from './build-envelope-from-layout';
import { fetchRemoteAssetBuffer } from '../../cloudinaryInlinePreviewService';
import { tryBuildStateDisclosureLayoutFromDbRow } from './state-document-layout';
import {
  parseFunderSupplementalLayoutKey,
  resolveFunderSupplementalStorageType,
} from '../../../utils/funderContractLayout';

export type ResolvedMergeTemplate = {
  sourceRef: string;
  name?: string;
  pdfUrl?: string;
  /** When set, PDF bytes were already resolved (e.g. DocuSign default template). */
  documentBase64?: string;
  layoutKey?: DocumentLayoutKey;
  /** When set, coordinates come from `state-document-config.ts` (disclosure merge). */
  inlineLayout?: DocumentLayout;
};

/**
 * Funder-owned layout keys (`funder_{uuid}_balance_transfer`, etc.) store that
 * funder's PDF, but always reuse the shared platform coordinate layouts.
 */
export function resolveCoordinateLayoutKeyForTemplate(options: {
  layoutKey?: string | null;
  type?: string | null;
}): DocumentLayoutKey | null {
  const key = String(options.layoutKey || '').trim();
  if (isDocumentLayoutKey(key)) return key;

  const parsed = parseFunderSupplementalLayoutKey(key);
  if (parsed) {
    const storageType = resolveFunderSupplementalStorageType(
      parsed.supplementalType,
    );
    if (isDocumentLayoutKey(storageType)) return storageType;
  }

  return resolveLayoutKeyFromBoldSignType(String(options.type || '')) || null;
}

export async function resolveTemplateRefForMerge(
  ref: string,
): Promise<ResolvedMergeTemplate> {
  const sourceRef = String(ref || '').trim();
  if (!sourceRef) {
    throw new Error('Empty template reference');
  }

  if (isDocumentLayoutKey(sourceRef)) {
    const def = PLATFORM_DOCUMENTS[sourceRef];
    const dbPdfUrl = await findBoldSignTemplatePdfUrlForLayout(sourceRef);
    if (dbPdfUrl) {
      return {
        sourceRef,
        name: def.name,
        layoutKey: sourceRef,
        pdfUrl: dbPdfUrl,
      };
    }
    // No uploaded PDF — use default DocuSign template PDF for this layout.
    const documentBase64 = await loadPlatformDocumentPdfBase64(sourceRef);
    return {
      sourceRef,
      name: def.name,
      layoutKey: sourceRef,
      documentBase64,
    };
  }

  const row = await prisma.boldSignTemplate.findFirst({
    where: {
      OR: [
        { id: sourceRef },
        { templateId: sourceRef },
        { layoutKey: sourceRef },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  if (row) {
    const layoutFromRow = String(row.layoutKey || '').trim();
    const layoutKey =
      resolveCoordinateLayoutKeyForTemplate({
        layoutKey: layoutFromRow,
        type: row.type,
      }) || undefined;
    const pdfUrl = String(row.pdfUrl || '').trim() || undefined;
    const inlineLayout = tryBuildStateDisclosureLayoutFromDbRow(row);
    const hasRemotePdf =
      !!pdfUrl &&
      (pdfUrl.startsWith('http://') || pdfUrl.startsWith('https://')) &&
      !pdfUrl.startsWith('platform://');

    if (hasRemotePdf) {
      if (!layoutKey && !inlineLayout) {
        throw new Error(
          `Template "${row.name}" has no layoutKey and no state-document-config entry for frequency="${row.frequency}" state="${row.state}".`,
        );
      }
      return {
        sourceRef,
        name: row.name,
        pdfUrl,
        layoutKey,
        inlineLayout: inlineLayout || undefined,
      };
    }

    if (layoutKey && isDocumentLayoutKey(layoutKey)) {
      const documentBase64 = await loadPlatformDocumentPdfBase64(layoutKey);
      return {
        sourceRef,
        name: row.name,
        layoutKey,
        documentBase64,
        inlineLayout: inlineLayout || undefined,
      };
    }

    throw new Error(
      `Template "${row.name}" has no pdfUrl. Upload a PDF to Cloudinary and set pdfUrl on the document template record.`,
    );
  }

  throw new Error(
    `Unknown document reference "${sourceRef}". Use a CRM document template row id with pdfUrl and layoutKey.`,
  );
}

export function assertValidPdfBuffer(buf: Buffer, context?: string): void {
  const header = buf.subarray(0, Math.min(5, buf.length)).toString('ascii');
  if (buf.length < 5 || header !== '%PDF-') {
    const hint = context ? ` for "${context}"` : '';
    throw new Error(
      `Downloaded file is not a valid PDF${hint}. Check the Cloudinary pdfUrl points to a real PDF.`,
    );
  }
}

export async function fetchPdfAsBase64(
  url: string,
  context?: string,
): Promise<string> {
  let buf: Buffer;
  try {
    buf = await fetchRemoteAssetBuffer(url);
  } catch (error) {
    const statusHint =
      error instanceof Error && /\((\d+)\)/.test(error.message)
        ? error.message
        : 'Failed to download PDF';
    throw new Error(
      `${statusHint}${context ? ` for "${context}"` : ''}`,
    );
  }
  assertValidPdfBuffer(buf, context);
  return buf.toString('base64');
}

export function buildPdfCompositeTemplate(options: {
  compositeTemplateId: string;
  envelopeDocumentId: string;
  layout: DocumentLayout;
  documentBase64: string;
  signers: LayoutSignerInput[];
  values: Record<string, string>;
  ownerCount?: number;
  guarantorCount?: number;
}): Record<string, unknown> {
  const tabsByRole = buildRecipientTabsByRoleForLayout(
    options.layout,
    options.envelopeDocumentId,
    options.values,
    options.signers,
    {
      ownerCount: options.ownerCount ?? 1,
      guarantorCount: options.guarantorCount ?? 0,
    },
  );

  const signers = options.signers.map((s, idx) => {
    const tabs = tabsByRole.get(s.roleName) || {
      textTabs: [],
      dateTabs: [],
      signHereTabs: [],
      initialHereTabs: [],
    };
    const hasTabs =
      tabs.textTabs.length +
        tabs.dateTabs.length +
        tabs.signHereTabs.length +
        tabs.initialHereTabs.length >
      0;
    return {
      roleName: s.roleName,
      name: s.name,
      email: s.email,
      recipientId: String(idx + 1),
      routingOrder: String(s.routingOrder ?? idx + 1),
      ...(hasTabs ? { tabs } : {}),
    };
  });

  return {
    compositeTemplateId: options.compositeTemplateId,
    document: {
      documentId: options.envelopeDocumentId,
      name: options.layout.document.originalFileName || options.layout.name,
      documentBase64: options.documentBase64,
    },
    inlineTemplates: [
      {
        sequence: options.compositeTemplateId,
        recipients: { signers },
      },
    ],
  };
}

export async function buildPdfCompositeFromResolved(
  resolved: ResolvedMergeTemplate,
  compositeTemplateId: string,
  envelopeDocumentId: string,
  signers: LayoutSignerInput[],
  prefillFields: Array<{ id: string; value: string }>,
  ownerCount = 1,
  guarantorCount = 0,
): Promise<Record<string, unknown>> {
  if (
    (!resolved.pdfUrl && !resolved.documentBase64) ||
    (!resolved.layoutKey && !resolved.inlineLayout)
  ) {
    throw new Error(
      `Template "${resolved.name || resolved.sourceRef}" is missing pdfUrl or layout`,
    );
  }
  const layout =
    resolved.inlineLayout ||
    (resolved.layoutKey ? getDocumentLayout(resolved.layoutKey) : null);
  if (!layout) {
    throw new Error(
      `Template "${resolved.name || resolved.sourceRef}" could not resolve a document layout`,
    );
  }
  let documentBase64 = String(resolved.documentBase64 || '').trim();
  if (!documentBase64) {
    const pdfUrl = String(resolved.pdfUrl || '').trim();
    if (!pdfUrl || pdfUrl.startsWith('platform://')) {
      throw new Error(
        `Template "${resolved.name || resolved.sourceRef}" is missing a Cloudinary pdfUrl.`,
      );
    }
    documentBase64 = await fetchPdfAsBase64(
      pdfUrl,
      resolved.name || resolved.sourceRef,
    );
  }
  if (!documentBase64) {
    throw new Error(
      `Template "${resolved.name || resolved.sourceRef}" PDF could not be loaded`,
    );
  }
  const values = prefillFieldsToValueMap(prefillFields);
  return buildPdfCompositeTemplate({
    compositeTemplateId,
    envelopeDocumentId,
    layout,
    documentBase64,
    signers,
    values,
    ownerCount,
    guarantorCount,
  });
}
