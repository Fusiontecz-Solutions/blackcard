import axios from 'axios';
import {
  getDocusignJwtSession,
  isDocusignJwtConfigured,
} from './docusign-jwt';
import { normalizeDocusignRestBaseUri } from './docusign-client';

const VIRTUAL_DOCUMENT_IDS = new Set(['certificate', 'combined', 'portfolio']);

function assertPdfBuffer(buf: Buffer, context?: string): void {
  const header = buf.subarray(0, Math.min(5, buf.length)).toString('ascii');
  if (buf.length < 5 || header !== '%PDF-') {
    const hint = context ? ` for "${context}"` : '';
    throw new Error(
      `Downloaded file is not a valid PDF${hint}. Check the DocuSign template document.`,
    );
  }
}

/**
 * Download the blank PDF for a DocuSign template (legacy defaults in layout JSON).
 * Used only when no Cloudinary/BoldSignTemplate.pdfUrl is configured.
 */
export async function downloadLegacyDocuSignTemplatePdfBase64(
  templateId: string,
  documentName?: string,
): Promise<string> {
  const tid = String(templateId || '').trim();
  if (!tid) {
    throw new Error('Missing DocuSign template id for default PDF download.');
  }
  if (!isDocusignJwtConfigured()) {
    throw new Error(
      'DocuSign JWT is not configured; cannot load default PDF from DocuSign templates.',
    );
  }

  const { accessToken, accountId, baseUri } = await getDocusignJwtSession();
  const client = axios.create({
    baseURL: normalizeDocusignRestBaseUri(baseUri),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/pdf',
    },
  });

  const docsRes = await client.get(
    `/v2.1/accounts/${accountId}/templates/${tid}/documents`,
    { headers: { Accept: 'application/json' } },
  );
  const docs =
    (docsRes.data?.templateDocuments || docsRes.data?.documents || []) as Array<{
      documentId?: string;
      type?: string;
      name?: string;
    }>;

  const contentDocs = docs.filter((doc) => {
    const docId = String(doc?.documentId ?? '').trim();
    if (!docId || VIRTUAL_DOCUMENT_IDS.has(docId.toLowerCase())) return false;
    const docType = String(doc?.type ?? '').trim().toLowerCase();
    return !docType || docType === 'content';
  });

  if (!contentDocs.length) {
    throw new Error(
      `DocuSign template "${tid}" has no downloadable PDF documents` +
        (documentName ? ` for "${documentName}"` : ''),
    );
  }

  const pdfRes = await client.get(
    `/v2.1/accounts/${accountId}/templates/${tid}/documents/combined`,
    { responseType: 'arraybuffer', validateStatus: () => true },
  );

  let buf: Buffer;
  if (pdfRes.status >= 200 && pdfRes.status < 300 && pdfRes.data) {
    buf = Buffer.from(pdfRes.data);
  } else {
    const firstId = String(contentDocs[0].documentId).trim();
    const singleRes = await client.get(
      `/v2.1/accounts/${accountId}/templates/${tid}/documents/${firstId}`,
      { responseType: 'arraybuffer' },
    );
    buf = Buffer.from(singleRes.data);
  }

  assertPdfBuffer(buf, documentName || tid);
  return buf.toString('base64');
}
