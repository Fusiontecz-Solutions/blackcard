/** Document request slugs from the contract / underwriting request modal. */

export type DocumentRequestSlug =
  | 'bank-statements'
  | 'bank-statements-mtd'
  | 'additional-id'
  | 'business-license'
  | 'proof-of-address'
  | 'financial-statement'
  | 'voided-check'
  | 'tax-returns'
  | 'articles-of-incorporation';

export type DocumentRequestTypeConfig = {
  slug: DocumentRequestSlug;
  label: string;
  /** Match application file names (lowercase substrings). */
  matchKeywords: string[];
  /** Contract modal upload key when fulfilled via contract documents step. */
  contractUploadKey?: 'voidedCheck' | 'driverLicense';
  /** Normalized contract document type label (FileMetadata.documentType). */
  contractDocumentType?: string;
};

export const DOCUMENT_REQUEST_TYPES: DocumentRequestTypeConfig[] = [
  {
    slug: 'bank-statements',
    label: 'Bank Statements - 12 months',
    matchKeywords: ['bank statement', 'bankstatement', 'bank-statement', 'bank statements'],
  },
  {
    slug: 'bank-statements-mtd',
    label: 'Bank Statements - MTD',
    matchKeywords: [
      'bank statement mtd',
      'bank statements mtd',
      'mtd bank statement',
      'bank-statement-mtd',
      'bank statements - mtd',
    ],
  },
  {
    slug: 'additional-id',
    label: 'Additional ID Proof',
    matchKeywords: ['additional id', 'id proof', 'identification', 'passport'],
    contractUploadKey: 'driverLicense',
    contractDocumentType: 'Driver License',
  },
  {
    slug: 'business-license',
    label: 'Business License',
    matchKeywords: ['business license', 'business-license', 'license'],
  },
  {
    slug: 'proof-of-address',
    label: 'Proof of Address',
    matchKeywords: ['proof of address', 'utility bill', 'utilitybill', 'proof-of-address'],
  },
  {
    slug: 'financial-statement',
    label: 'Financial Statement',
    matchKeywords: ['financial statement', 'financial-statement', 'p&l', 'profit and loss'],
  },
  {
    slug: 'voided-check',
    label: 'Voided Check',
    matchKeywords: ['voided check', 'voidedcheck', 'voided-check'],
    contractUploadKey: 'voidedCheck',
    contractDocumentType: 'Voided Check',
  },
  {
    slug: 'tax-returns',
    label: 'Tax Returns - Last 2 Years',
    matchKeywords: ['tax return', 'tax-return', 'tax returns', '1040', '1120'],
  },
  {
    slug: 'articles-of-incorporation',
    label: 'Articles of Incorporations',
    matchKeywords: [
      'articles of incorporation',
      'articles-of-incorporation',
      'certificate of incorporation',
      'articles of organization',
    ],
  },
];

export const DOCUMENT_REQUEST_LABELS: Record<string, string> = Object.fromEntries(
  DOCUMENT_REQUEST_TYPES.map((t) => [t.slug, t.label]),
);
DOCUMENT_REQUEST_LABELS['additional-documents'] = 'Additional documents (as discussed)';

export function getDocumentRequestConfig(slug: string): DocumentRequestTypeConfig | undefined {
  const key = String(slug || '').trim().toLowerCase();
  return DOCUMENT_REQUEST_TYPES.find((t) => t.slug === key);
}

export function humanizeDocumentRequestLabels(slugs: string[]): string[] {
  return (slugs || [])
    .map((id) => DOCUMENT_REQUEST_LABELS[String(id || '').trim()] || String(id || '').trim())
    .filter(Boolean);
}

type ApplicationFileRow = {
  originalName?: string | null;
  requestedDocumentSlug?: string | null;
  url?: string | null;
  id?: string;
  mimeType?: string | null;
};

type ContractFileRow = {
  documentType?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  downloadUrl?: string | null;
  id?: string;
};

function normalizeMatchText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ');
}

export function findFulfilledDocumentForRequest(
  slug: string,
  context: {
    applicationFiles?: ApplicationFileRow[];
    contractFiles?: ContractFileRow[];
  },
): { source: 'application' | 'contract'; url?: string; fileId?: string; originalName?: string; mimeType?: string } | null {
  const config = getDocumentRequestConfig(slug);
  if (!config) return null;

  const appFiles = context.applicationFiles || [];
  for (const file of appFiles) {
    if (String(file.requestedDocumentSlug || '').trim().toLowerCase() === config.slug) {
      return {
        source: 'application',
        url: file.url || undefined,
        fileId: file.id,
        originalName: file.originalName || undefined,
        mimeType: file.mimeType || undefined,
      };
    }
  }

  for (const file of appFiles) {
    const name = normalizeMatchText(file.originalName);
    if (!name) continue;
    if (config.matchKeywords.some((kw) => name.includes(kw))) {
      return {
        source: 'application',
        url: file.url || undefined,
        fileId: file.id,
        originalName: file.originalName || undefined,
        mimeType: file.mimeType || undefined,
      };
    }
  }

  if (config.contractDocumentType) {
    const target = normalizeMatchText(config.contractDocumentType);
    for (const file of context.contractFiles || []) {
      const docType = normalizeMatchText(file.documentType);
      const fileName = normalizeMatchText(file.fileName);
      if (docType === target || config.matchKeywords.some((kw) => fileName.includes(kw))) {
        return {
          source: 'contract',
          url: file.fileUrl || file.downloadUrl || undefined,
          fileId: file.id,
          originalName: file.fileName || undefined,
        };
      }
    }
  }

  return null;
}

export function isDocumentRequestFulfilled(
  slug: string,
  context: {
    applicationFiles?: ApplicationFileRow[];
    contractFiles?: ContractFileRow[];
  },
): boolean {
  return findFulfilledDocumentForRequest(slug, context) != null;
}

export function slugsForContractUploadKey(uploadKey: string): DocumentRequestSlug[] {
  const key = String(uploadKey || '').trim();
  return DOCUMENT_REQUEST_TYPES.filter((t) => t.contractUploadKey === key).map((t) => t.slug);
}
