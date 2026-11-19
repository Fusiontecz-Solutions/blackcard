import type { Request, Response } from 'express';
import prisma from '../config/prismaClient';
import {
  getDocumentAIClient,
  getProcessorName,
  isDocumentAIConfigured,
} from '../config/documentAI';
import { processDocumentPossiblyChunked } from '../services/document-ai/processDocumentChunked';
import { fetchRemoteAssetBuffer } from '../services/cloudinaryInlinePreviewService';
import { buildMcaAnalysis, analyzeFromTransactions, analyzePdfIntegrity, tagKeyFor, CATEGORY_LABELS } from '../utils/mcaExtractionApi';

async function loadTagOverrides() {
  const tags = await prisma.mcaTag.findMany({ select: { key: true, decision: true } });
  const overrides: Record<string, string> = {};
  const mcaKeywords = new Set<string>();
  const notMcaKeywords = new Set<string>();
  for (const t of tags) {
    overrides[t.key] = t.decision;
    const isKeyword = t.key.startsWith("kw:");
    const token = isKeyword
      ? t.key.slice(3).trim().toLowerCase()
      : String(t.key).replace(/^(lender|payee):/, "").trim().toLowerCase();
    const minLen = isKeyword ? 3 : 4;
    if (token.length >= minLen) {
      if (["mca", "mcaDebits", "loanInflow", "mcaCredits"].includes(t.decision)) mcaKeywords.add(token);
      else if (t.decision === "not_mca") notMcaKeywords.add(token);
    }
  }
  return { overrides, learned: { mcaKeywords: [...mcaKeywords], notMcaKeywords: [...notMcaKeywords] } };
}

const SUPPORTED_MIME = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/tiff", "image/gif", "image/bmp", "image/webp",
]);

function guessMimeFromName(name = "") {
  const ext = String(name).toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
    tif: "image/tiff", tiff: "image/tiff", gif: "image/gif", bmp: "image/bmp", webp: "image/webp",
  };
  return map[ext || ""] || "";
}

function detectMimeFromBuffer(buffer: Buffer) {
  if (!buffer || buffer.length < 4) return "";
  if (buffer.subarray(0, 4).toString("ascii") === "%PDF") return "application/pdf";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  return "";
}

/**
 * Download a statement for OCR. Bank PDFs are uploaded as Cloudinary *image*
 * resources — do NOT rewrite image/upload → raw/upload (that 404s). Use the
 * shared Cloudinary helper so public PDF delivery blocks fall back to an
 * authenticated privatedownload URL.
 */
async function fetchDocumentBuffer(url: string) {
  const cleaned = String(url || "").replace("/fl_inline/", "/");
  try {
    const content = await fetchRemoteAssetBuffer(cleaned);
    if (content.length < 100) {
      throw new Error(`Document download returned only ${content.length} bytes — check Cloudinary URL`);
    }
    return content;
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    const statusMatch = msg.match(/\((\d{3})\)/);
    if (statusMatch) throw new Error(`Failed to download document (${statusMatch[1]})`);
    throw new Error(msg || "Failed to download document");
  }
}

async function resolveDocumentBytes(body: any, bankAnalysisId: string) {
  if (body.file && typeof body.file === "string" && body.file.startsWith("data:")) {
    const match = body.file.match(/^data:([^;]+);base64,(.*)$/s);
    if (!match) throw new Error("Invalid file data URL");
    const content = Buffer.from(match[2], "base64");
    const mimeType = detectMimeFromBuffer(content) || match[1];
    return { content, mimeType, fileName: body.fileName || "", url: "", publicId: "" };
  }
  if (body.documentUrl) {
    const content = await fetchDocumentBuffer(body.documentUrl);
    const detectedMime = detectMimeFromBuffer(content);
    const mimeType =
      detectedMime ||
      (body.mimeType && body.mimeType !== "pdf" ? body.mimeType : "") ||
      guessMimeFromName(body.fileName || body.documentUrl);
    if (mimeType === "application/pdf" && content.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error("Downloaded file is not a valid PDF. Re-upload the bank statement as a PDF document.");
    }
    return {
      content,
      mimeType,
      fileName: body.fileName || "",
      url: body.documentUrl,
      publicId: body.documentPublicId || "",
    };
  }
  throw new Error("Provide file (base64 data URL) or documentUrl");
}

export const analyzeDocument = async (req: Request, res: Response) => {
  try {
    const { bankAnalysisId } = req.params;
    if (!isDocumentAIConfigured()) {
      return res.status(503).json({ message: "Google Document AI is not configured." });
    }
    const bankAnalysis = await prisma.bankAnalysis.findUnique({ where: { id: bankAnalysisId } });
    if (!bankAnalysis) return res.status(404).json({ message: "Bank analysis not found" });

    let doc;
    try { doc = await resolveDocumentBytes(req.body || {}, bankAnalysisId); }
    catch (e: any) { return res.status(400).json({ message: e.message }); }

    if (!doc.mimeType || !SUPPORTED_MIME.has(doc.mimeType)) {
      return res.status(400).json({ message: `Unsupported file type for OCR. Upload a PDF or image.` });
    }

    const client = getDocumentAIClient();
    let document: any;
    try {
      document = await processDocumentPossiblyChunked(doc.content, doc.mimeType, async (content, mimeType) => {
        const [result] = await client.processDocument({
          name: getProcessorName(),
          rawDocument: {
            content: content.toString('base64'),
            mimeType,
          },
          imagelessMode: true,
        });
        if (!result.document) throw new Error('Document AI returned no document payload');
        return result.document as any;
      });
    } catch (e: any) {
      return res.status(502).json({ message: `Document AI error: ${e?.details || e?.message}` });
    }

    const { overrides, learned } = await loadTagOverrides();
    let pdfFlags: string[] = [];
    try { pdfFlags = analyzePdfIntegrity(doc.content); } catch { /* ignore */ }

    const analysis = buildMcaAnalysis(document, { fileName: doc.fileName, documentUrl: doc.url, pdfFlags }, overrides, learned);

    const matchOr = [
      ...(doc.url ? [{ documentUrl: doc.url }] : []),
      ...(doc.publicId ? [{ documentPublicId: doc.publicId }] : []),
      ...(!doc.url && !doc.publicId && doc.fileName ? [{ fileName: doc.fileName }] : []),
    ];
    const existing = matchOr.length
      ? await prisma.aiAnalysis.findFirst({
          where: { bankAnalysisId, OR: matchOr },
        })
      : null;

    const data = {
      bankAnalysisId,
      documentUrl: doc.url,
      documentPublicId: doc.publicId,
      fileName: doc.fileName,
      status: "completed",
      engine: "google-document-ai",
      result: analysis as any,
      processedAt: new Date(),
      processedBy: (req as any).user?.userId || null,
    };

    let saved;
    if (existing) {
      saved = await prisma.aiAnalysis.update({ where: { id: existing.id }, data });
    } else {
      saved = await prisma.aiAnalysis.create({ data });
    }

    return res.status(200).json({ message: "Document analyzed successfully", data: saved });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

function resolveTotalsOverride(
  body: any,
  previousManualTotals: { totalCredits?: number | null; totalDebits?: number | null } | null | undefined,
): { totalCredits: number | null; totalDebits: number | null } | null | undefined {
  const { totalCredits, totalDebits, clearTotals } = body || {};
  if (clearTotals) return null;
  if (totalCredits === undefined && totalDebits === undefined) return undefined;
  const num = (v: unknown) =>
    v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v);
  const prev = previousManualTotals || {};
  const next = {
    totalCredits: totalCredits !== undefined ? num(totalCredits) : (prev.totalCredits ?? null),
    totalDebits: totalDebits !== undefined ? num(totalDebits) : (prev.totalDebits ?? null),
  };
  if (next.totalCredits == null && next.totalDebits == null) return null;
  return next;
}

function recomputeMetaFromStored(
  prev: any,
  opts: {
    openingBalance?: unknown;
    totalsOverride?: { totalCredits: number | null; totalDebits: number | null } | null;
  } = {},
) {
  const startingBalance =
    opts.openingBalance != null && Number.isFinite(Number(opts.openingBalance))
      ? Number(opts.openingBalance)
      : prev.startingBalance;
  const totalsOverride =
    opts.totalsOverride !== undefined ? opts.totalsOverride : (prev.manualTotals || null);
  return {
    fileName: prev.fileName,
    documentUrl: prev.documentUrl,
    bankName: prev.bankName,
    accountType: prev.accountType,
    statementPeriod: prev.statementPeriod,
    startingBalance,
    endingBalance: prev.endingBalance,
    statementTotals: prev.statementTotals,
    totalsOverride,
    printedDailyBalances: prev.printedDailyBalances || null,
    pdfFlags: prev.pdfIntegrityFlags || [],
  };
}

export const recategorizeDocument = async (req: Request, res: Response) => {
  try {
    const { bankAnalysisId } = req.params;
    const { documentUrl, documentPublicId, openingBalance } = req.body || {};

    const existing = await prisma.aiAnalysis.findFirst({
      where: {
        bankAnalysisId,
        ...(documentUrl ? { documentUrl } : documentPublicId ? { documentPublicId } : {}),
      },
    });
    if (!existing || !existing.result) return res.status(404).json({ message: "No analysis found. Run AI first." });

    const { overrides, learned } = await loadTagOverrides();
    const prev = existing.result as any;
    const totalsOverride = resolveTotalsOverride(req.body || {}, prev.manualTotals || null);

    const analysis = analyzeFromTransactions(
      prev.transactions || [],
      recomputeMetaFromStored(prev, { openingBalance, totalsOverride }),
      overrides,
      learned,
    );

    const saved = await prisma.aiAnalysis.update({
      where: { id: existing.id },
      data: { result: analysis as any, processedAt: new Date(), processedBy: (req as any).user?.userId || null },
    });

    return res.status(200).json({ message: "Recategorized", data: saved });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const recategorizeAll = async (req: Request, res: Response) => {
  try {
    const { bankAnalysisId } = req.params;
    const analyses = await prisma.aiAnalysis.findMany({ where: { bankAnalysisId, status: "completed" } });
    if (!analyses.length) return res.status(200).json({ message: "Nothing to recategorize", data: [] });

    const { overrides, learned } = await loadTagOverrides();
    const results = [];
    for (const entry of analyses) {
      const prev = entry.result as any;
      if (!prev?.transactions?.length) continue;
      const analysis = analyzeFromTransactions(
        prev.transactions,
        recomputeMetaFromStored(prev),
        overrides,
        learned,
      );
      const saved = await prisma.aiAnalysis.update({
        where: { id: entry.id },
        data: { result: analysis as any, processedAt: new Date() },
      });
      results.push(saved);
    }
    return res.status(200).json({ message: "Recategorized all", data: results });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getCombined = async (req: Request, res: Response) => {
  try {
    const { bankAnalysisId } = req.params;
    const analyses = await prisma.aiAnalysis.findMany({ where: { bankAnalysisId, status: "completed" } });
    const entries = analyses.filter(a => {
      const r = a.result as any;
      return r?.transactions?.length > 0;
    });
    if (entries.length < 2) return res.status(200).json({ message: "OK", data: null, count: entries.length });

    const { overrides, learned } = await loadTagOverrides();
    const ordered = [...entries].sort((a, b) => {
      const ra = a.result as any, rb = b.result as any;
      return String(ra?.statementPeriod?.start || "").localeCompare(String(rb?.statementPeriod?.start || ""));
    });

    const mergedTxns: any[] = [];
    const starts: string[] = [], ends: string[] = [];
    let openingBalance: number | null = null, closingBalance: number | null = null;

    for (const e of ordered) {
      const r = e.result as any;
      const src = r.fileName || "statement";
      for (const t of r.transactions) mergedTxns.push({ ...t, source: src });
      if (r.statementPeriod?.start) starts.push(r.statementPeriod.start);
      if (r.statementPeriod?.end) ends.push(r.statementPeriod.end);
      if (openingBalance == null && typeof r.startingBalance === "number") openingBalance = r.startingBalance;
      if (typeof r.endingBalance === "number") closingBalance = r.endingBalance;
    }

    const analysis: any = analyzeFromTransactions(mergedTxns, {
      fileName: `Combined — ${ordered.length} statements`,
      statementPeriod: { start: starts.sort()[0] || "", end: ends.sort().slice(-1)[0] || "" },
      startingBalance: openingBalance, endingBalance: closingBalance,
    }, overrides, learned);

    // Combined totals = sum of each statement's effective totals (manual/stated/extracted),
    // not a re-derivation from the merged transaction list.
    const r2 = (n: number) => Math.round(n * 100) / 100;
    let sumCr = 0, sumDr = 0;
    for (const e of ordered) {
      const r = e.result as any;
      sumCr += Number(r?.summary?.totalCredits) || 0;
      sumDr += Number(r?.summary?.totalDebits) || 0;
    }
    const n = ordered.length || 1;
    analysis.summary = {
      ...analysis.summary,
      totalCredits: r2(sumCr),
      totalDebits: r2(sumDr),
      netCashFlow: r2(sumCr - sumDr),
      avgTotalCredits: r2(sumCr / n),
      avgTotalDebits: r2(sumDr / n),
      statementCount: ordered.length,
      totalsSource: "per-statement",
    };

    analysis.combined = true;
    analysis.sourceCount = ordered.length;
    return res.status(200).json({ message: "OK", data: analysis });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const deleteAnalysis = async (req: Request, res: Response) => {
  try {
    const { bankAnalysisId, analysisId } = req.params;
    const existing = await prisma.aiAnalysis.findFirst({
      where: { id: analysisId, bankAnalysisId },
    });
    if (!existing) return res.status(404).json({ message: "AI analysis not found" });
    await prisma.aiAnalysis.delete({ where: { id: existing.id } });
    return res.status(200).json({ message: "AI analysis deleted", data: { id: existing.id } });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const getAnalyses = async (req: Request, res: Response) => {
  try {
    const { bankAnalysisId } = req.params;
    const analyses = await prisma.aiAnalysis.findMany({
      where: { bankAnalysisId },
      orderBy: { createdAt: 'asc' },
    });
    return res.status(200).json({ message: "OK", data: analyses });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const setMcaTag = async (req: Request, res: Response) => {
  try {
    const { description, decision, removeTag, keyword, key: bodyKey } = req.body || {};

    let key: string, example: string;
    if (bodyKey && typeof bodyKey === "string") {
      key = bodyKey.trim(); example = "";
    } else if (keyword && typeof keyword === "string" && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      if (kw.length < 3) return res.status(400).json({ message: "Keyword must be at least 3 characters" });
      key = `kw:${kw}`; example = keyword.trim();
    } else if (description && typeof description === "string") {
      key = tagKeyFor(description); example = description.slice(0, 120);
    } else {
      return res.status(400).json({ message: "description or keyword is required" });
    }
    if (!key) return res.status(400).json({ message: "Could not derive a tag key" });

    if (removeTag) {
      await prisma.mcaTag.deleteMany({ where: { key } });
      return res.status(200).json({ message: "Tag removed", data: { key, decision: "" } });
    }

    const categoryLabels = CATEGORY_LABELS as Record<string, string>;
    const isValid = decision === "mca" || decision === "not_mca" || !!categoryLabels[decision];
    if (!isValid) return res.status(400).json({ message: "decision must be 'mca', 'not_mca', or a valid category key" });

    const tag = await prisma.mcaTag.upsert({
      where: { key },
      update: { decision, example },
      create: { key, decision, example, createdBy: (req as any).user?.userId || null },
    });
    return res.status(200).json({ message: "Tag saved", data: tag });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const listMcaTags = async (req: Request, res: Response) => {
  try {
    const tags = await prisma.mcaTag.findMany({ orderBy: { updatedAt: 'desc' } });
    return res.status(200).json({ message: "OK", data: tags });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

export const listCategories = async (_req: Request, res: Response) => {
  const categoryLabels = CATEGORY_LABELS as Record<string, string>;
  const options = Object.keys(categoryLabels).map((key: string) => ({ key, label: categoryLabels[key] }));
  return res.status(200).json({ message: "OK", data: options });
};
