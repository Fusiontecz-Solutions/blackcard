/**
 * Google Document AI online (sync) imageless mode page caps vary by processor
 * (commonly 15 for Form Parser, up to 30 for some OCR processors).
 * Larger PDFs must be split, processed per shard, then merged.
 *
 * Env:
 *   DOCUMENT_AI_ONLINE_PAGE_LIMIT — shard size (default 15, hard-capped at 30)
 */
import { PDFDocument } from 'pdf-lib';

/** Absolute max for imageless online processing — cannot be raised by us. */
export const DOCUMENT_AI_ONLINE_HARD_LIMIT = 30;

/** Safer default: Form Parser / custom extractors often reject above 15 pages. */
export const DOCUMENT_AI_ONLINE_DEFAULT_LIMIT = 15;

export function documentAiOnlinePageLimit(): number {
  const raw = Number(process.env.DOCUMENT_AI_ONLINE_PAGE_LIMIT || DOCUMENT_AI_ONLINE_DEFAULT_LIMIT);
  if (!Number.isFinite(raw) || raw < 1) return DOCUMENT_AI_ONLINE_DEFAULT_LIMIT;
  return Math.min(DOCUMENT_AI_ONLINE_HARD_LIMIT, Math.floor(raw));
}

/** Parse `Document pages exceed the limit: 15 got 30` → 15 */
export function parseDocumentAiPageLimitFromError(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const m = msg.match(/pages exceed the limit:\s*(\d+)/i);
  if (!m?.[1]) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(DOCUMENT_AI_ONLINE_HARD_LIMIT, Math.floor(n));
}

export async function countPdfPages(buffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return pdf.getPageCount();
}

/** Split a PDF into ≤maxPages shards. Returns original buffer alone when under the limit. */
export async function splitPdfIntoPageChunks(buffer: Buffer, maxPages = documentAiOnlinePageLimit()): Promise<Buffer[]> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  const total = pdf.getPageCount();
  if (total <= maxPages) return [buffer];

  const chunks: Buffer[] = [];
  for (let start = 0; start < total; start += maxPages) {
    const end = Math.min(start + maxPages, total);
    const out = await PDFDocument.create();
    const indices = Array.from({ length: end - start }, (_, i) => start + i);
    const pages = await out.copyPages(pdf, indices);
    for (const page of pages) out.addPage(page);
    chunks.push(Buffer.from(await out.save()));
  }
  return chunks;
}

type DocAiDocument = {
  text?: string | null;
  pages?: unknown[] | null;
  entities?: unknown[] | null;
};

/** Concatenate shard documents so MCA extraction sees one combined OCR + entity set. */
export function mergeDocumentAiDocuments(docs: DocAiDocument[]): DocAiDocument {
  if (docs.length === 1) return docs[0]!;
  const texts: string[] = [];
  const pages: unknown[] = [];
  const entities: unknown[] = [];
  for (const d of docs) {
    const t = String(d?.text ?? '').trim();
    if (t) texts.push(t);
    if (Array.isArray(d?.pages)) pages.push(...d.pages);
    if (Array.isArray(d?.entities)) entities.push(...d.entities);
  }
  return {
    text: texts.join('\n'),
    pages,
    entities,
  };
}

type ProcessFn<T extends DocAiDocument = DocAiDocument> = (
  content: Buffer,
  mimeType: string,
) => Promise<T>;

async function processPdfShards<T extends DocAiDocument>(
  content: Buffer,
  processOne: ProcessFn<T>,
  limit: number,
): Promise<T | DocAiDocument> {
  let chunks: Buffer[];
  try {
    chunks = await splitPdfIntoPageChunks(content, limit);
  } catch (err) {
    // Corrupt/encrypted PDFs: fall through to a single attempt (may still fail at DocAI).
    console.warn('[document-ai] PDF split failed; sending whole file:', err instanceof Error ? err.message : err);
    return processOne(content, 'application/pdf');
  }

  if (chunks.length === 1) {
    return processOne(chunks[0]!, 'application/pdf');
  }

  console.info(`[document-ai] splitting PDF into ${chunks.length} shards (≤${limit} pages each)`);
  const docs: DocAiDocument[] = [];
  for (let i = 0; i < chunks.length; i++) {
    docs.push(await processOne(chunks[i]!, 'application/pdf'));
  }
  return mergeDocumentAiDocuments(docs);
}

/**
 * Process a PDF/image with Document AI. PDFs over the online page limit are split
 * into shards, each processed with imageless mode, then merged.
 * If the API reports a lower page limit than we used, retry once at that limit.
 */
export async function processDocumentPossiblyChunked<T extends DocAiDocument>(
  content: Buffer,
  mimeType: string,
  processOne: ProcessFn<T>,
): Promise<T | DocAiDocument> {
  const mime = String(mimeType || '').toLowerCase();
  const isPdf =
    mime === 'application/pdf' ||
    (content.length >= 4 && content.subarray(0, 4).toString('ascii') === '%PDF');

  if (!isPdf) {
    return processOne(content, mimeType || 'application/octet-stream');
  }

  const limit = documentAiOnlinePageLimit();
  try {
    return await processPdfShards(content, processOne, limit);
  } catch (err) {
    const apiLimit = parseDocumentAiPageLimitFromError(err);
    if (apiLimit != null && apiLimit < limit) {
      console.warn(
        `[document-ai] processor page limit is ${apiLimit} (tried ${limit}); re-sharding and retrying`,
      );
      return processPdfShards(content, processOne, apiLimit);
    }
    throw err;
  }
}
