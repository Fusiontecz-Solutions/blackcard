import type { DocumentLayout } from './convert-docusign-template-export';

export type LayoutWithPdf = DocumentLayout & { documentBase64: string };

export type MergedLayoutPdfResult = {
  documentBase64: string;
  /** 0-based page index where each layout's PDF starts in the merged file. */
  pageOffsetByLayoutKey: Map<string, number>;
  /** Index-parallel offsets preserve duplicate layout instances. */
  pageOffsetByLayoutIndex: number[];
  pageCount: number;
};

/** Concatenate platform layout PDFs into one file for a single DocuSign document. */
export async function mergeLayoutPdfsToSingleDocument(
  layouts: LayoutWithPdf[],
): Promise<MergedLayoutPdfResult> {
  if (!layouts.length) {
    throw new Error('At least one layout PDF is required to merge.');
  }
  if (layouts.length === 1) {
    const only = layouts[0];
    const { PDFDocument } = await import('pdf-lib');
    const pdf = await PDFDocument.load(Buffer.from(only.documentBase64, 'base64'));
    return {
      documentBase64: only.documentBase64,
      pageOffsetByLayoutKey: new Map([[only.key, 0]]),
      pageOffsetByLayoutIndex: [0],
      pageCount: pdf.getPageCount(),
    };
  }

  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  const pageOffsetByLayoutKey = new Map<string, number>();
  const pageOffsetByLayoutIndex: number[] = [];
  let totalPages = 0;

  for (const layout of layouts) {
    const base64 = String(layout.documentBase64 || '').trim();
    if (!base64) {
      throw new Error(`Layout "${layout.key}" is missing documentBase64 for PDF merge.`);
    }
    pageOffsetByLayoutKey.set(layout.key, totalPages);
    pageOffsetByLayoutIndex.push(totalPages);
    const src = await PDFDocument.load(Buffer.from(base64, 'base64'));
    const pageCount = src.getPageCount();
    if (pageCount < 1) {
      throw new Error(`Layout "${layout.key}" PDF has no pages.`);
    }
    const indices = Array.from({ length: pageCount }, (_, i) => i);
    const copied = await merged.copyPages(src, indices);
    for (const page of copied) {
      merged.addPage(page);
    }
    totalPages += pageCount;
  }

  const bytes = await merged.save();
  return {
    documentBase64: Buffer.from(bytes).toString('base64'),
    pageOffsetByLayoutKey,
    pageOffsetByLayoutIndex,
    pageCount: totalPages,
  };
}

/** Append one or more PDF buffers to an existing base64 PDF (e.g. contract last page). */
export async function appendPdfBuffersToBase64(
  mainBase64: string,
  appendBuffers: Buffer[],
): Promise<string> {
  const base64 = String(mainBase64 || '').trim();
  if (!base64) {
    throw new Error('Main PDF base64 is required to append pages.');
  }
  const { PDFDocument } = await import('pdf-lib');
  const mainDoc = await PDFDocument.load(Buffer.from(base64, 'base64'));

  for (const buf of appendBuffers) {
    if (!buf?.length) continue;
    const src = await PDFDocument.load(buf);
    const pageCount = src.getPageCount();
    if (pageCount < 1) continue;
    const indices = Array.from({ length: pageCount }, (_, i) => i);
    const copied = await mainDoc.copyPages(src, indices);
    for (const page of copied) {
      mainDoc.addPage(page);
    }
  }

  return Buffer.from(await mainDoc.save()).toString('base64');
}

/**
 * Extract 1-based page numbers from a PDF into a new PDF (base64).
 * Used for Texas ACH form — pages 11–12 of the Texas Funding Group contract.
 */
export async function extractPdfPagesAsBase64(
  sourceBase64: string,
  pageNumbers1Based: number[],
): Promise<string> {
  const base64 = String(sourceBase64 || '').trim();
  if (!base64) {
    throw new Error('Source PDF base64 is required to extract pages.');
  }
  const pages = pageNumbers1Based
    .map((n) => Math.floor(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 1);
  if (!pages.length) {
    throw new Error('At least one page number is required to extract.');
  }

  const { PDFDocument } = await import('pdf-lib');
  const src = await PDFDocument.load(Buffer.from(base64, 'base64'));
  const pageCount = src.getPageCount();
  const indices: number[] = [];
  for (const page of pages) {
    if (page > pageCount) {
      throw new Error(
        `Cannot extract page ${page}: source PDF only has ${pageCount} page(s).`,
      );
    }
    indices.push(page - 1);
  }

  const out = await PDFDocument.create();
  const copied = await out.copyPages(src, indices);
  for (const page of copied) {
    out.addPage(page);
  }
  return Buffer.from(await out.save()).toString('base64');
}

