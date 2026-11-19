/**
 * PDF → Claude Messages API → structured JSON (same shape as ZipTool `PdfClaudeExtractResult`).
 *
 * Env (via Nest ConfigModule — reads process.env incl. `.env` when loaded):
 *   ANTHROPIC_API_KEY        (required)
 * Optional:
 *   ANTHROPIC_API_URL        default https://api.anthropic.com
 *   CLAUDE_PDF_MODEL         default claude-sonnet-4-6 (for text-only JSON on forms, claude-3-5-haiku-latest is often cheaper; spot-check quality)
 *   CLAUDE_PDF_MAX_TOKENS    default 12000 (lower if you narrow output fields to cut output-token cost)
 *   CLAUDE_PDF_DISABLE_VISION_FALLBACK  default false (true => always one text-only /v1/messages call, never PDF-as-document vision)
 *   PDF_HYBRID_MIN_TOTAL_LETTERS  default 500 (embedded text letter count below this uses vision fallback when fallback is enabled)
 */

import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";

export interface PdfClaudeExtractResultDTO {
  document_type: string;
  title: string;
  summary: string;
  key_data: Record<string, string>;
  pages: Array<{ page_number: number; note: string }>;
  transactions: Array<Record<string, unknown>>;
  model_notes?: string;
}

export interface ClaudePdfExtractMetaDTO {
  text_mode_used: "text" | "vision_base64";
  extracted_letters: number;
}

type PageTextItem = { str: string; transform: number[] };

async function pagerenderPdfParseDefault(pageData: {
  getTextContent: (o: Record<string, boolean>) => Promise<{ items: PageTextItem[] }>;
}): Promise<string> {
  const opts = { normalizeWhitespace: false, disableCombineTextItems: false };
  const textContent = await pageData.getTextContent(opts);
  let lastY: number | undefined;
  let text = "";
  for (const item of textContent.items) {
    const y = item.transform[5];
    if (lastY === y || lastY === undefined) {
      text += item.str;
    } else {
      text += "\n" + item.str;
    }
    lastY = y;
  }
  return text;
}

async function parsePdfBufferForHybrid(buffer: Buffer): Promise<{
  combined: string;
  perPage: string[];
  numpages: number;
}> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const parse = require("pdf-parse") as (
    buf: Buffer,
    opts?: { pagerender?: (pageData: unknown) => Promise<string> }
  ) => Promise<{ text: string; numpages: number }>;

  const perPage: string[] = [];
  const rendered = await parse(buffer, {
    pagerender: async (pageData: unknown) => {
      const t = await pagerenderPdfParseDefault(
        pageData as Parameters<typeof pagerenderPdfParseDefault>[0]
      );
      perPage.push(t);
      return t;
    },
  });

  return {
    combined: (rendered.text ?? "").trim(),
    perPage,
    numpages: rendered.numpages,
  };
}

@Injectable()
export class ClaudePdfExtractionService {
  private readonly client: Anthropic;
  private readonly disableVisionFallback: boolean;

  constructor(private readonly cfg: ConfigService) {
    const apiKey = (
      this.cfg.get<string>("ANTHROPIC_API_KEY") ??
      process.env.ANTHROPIC_API_KEY ??
      ""
    ).trim();
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is required for ClaudePdfExtractionService");
    }
    const baseURL =
      (
        this.cfg.get<string>("ANTHROPIC_API_URL") ??
        process.env.ANTHROPIC_API_URL ??
        "https://api.anthropic.com"
      ).trim() || "https://api.anthropic.com";
    this.client = new Anthropic({ apiKey, baseURL });
    this.disableVisionFallback = (
      this.cfg.get<string>("CLAUDE_PDF_DISABLE_VISION_FALLBACK") ??
      process.env.CLAUDE_PDF_DISABLE_VISION_FALLBACK ??
      "false"
    )
      .trim()
      .toLowerCase() === "true";
  }

  getRuntimeDebugConfig(): { provider: string; model: string; disableVisionFallback: boolean } {
    return {
      provider: 'claude',
      model: this.cfg.get<string>("CLAUDE_PDF_MODEL") ?? "claude-sonnet-4-6",
      disableVisionFallback: this.disableVisionFallback,
    };
  }

  async extractHybridFromPdfBuffer(
    pdf: Buffer
  ): Promise<{ result: PdfClaudeExtractResultDTO; meta: ClaudePdfExtractMetaDTO }> {
    const { combined, perPage } = await parsePdfBufferForHybrid(pdf);
    const letters = PdfClaudeExtractionUtils.countLetters(combined);
    const minLetters = PdfClaudeExtractionUtils.readPositiveIntCfg(
      this.cfg,
      "PDF_HYBRID_MIN_TOTAL_LETTERS",
      500,
    );

    // Hybrid: one text-only Messages call when embedded text is rich enough (typical application PDFs).
    // Vision (PDF document block) only when text is sparse and CLAUDE_PDF_DISABLE_VISION_FALLBACK is false.
    const useTextPath = this.disableVisionFallback || letters >= minLetters;

    if (useTextPath) {
      const { system, user } = PdfClaudeExtractionUtils.buildSystemAndUserText(
        combined,
        perPage
      );
      const rawText = await this.callClaude(system, PdfClaudeExtractionUtils.singleTextBlock(user));
      const parsed = PdfClaudeExtractionUtils.parseJsonFromModel(rawText);
      let result = PdfClaudeExtractionUtils.validateResult(parsed);
      if (this.shouldRetryBusinessName(result)) {
        result = await this.retryMissingBusinessNameText(result, combined);
      }
      result = PdfClaudeExtractionUtils.enrichFromRawText(result, combined);
      return {
        result,
        meta: { text_mode_used: "text", extracted_letters: letters },
      };
    }

    return this.extractFromPdfVisionInternal(pdf, letters);
  }

  /**
   * Vision path when page images are already available (PNG, same order as document pages).
   */
  async extractFromPagePngs(
    pngs: Buffer[]
  ): Promise<{ result: PdfClaudeExtractResultDTO; meta: ClaudePdfExtractMetaDTO }> {
    return this.extractFromPagePngsInternal(pngs, 0);
  }

  private async extractFromPagePngsInternal(
    pngs: Buffer[],
    extractedLettersMeta: number
  ): Promise<{ result: PdfClaudeExtractResultDTO; meta: ClaudePdfExtractMetaDTO }> {
    if (!pngs.length) {
      throw new Error("extractFromPagePngs: need at least one PNG page");
    }
    const prompt = PdfClaudeExtractionUtils.buildVisionInstruction();
    const blocks: Anthropic.Messages.ContentBlockParam[] = [
      ...pngs.map(
        (buf): Anthropic.Messages.ImageBlockParam => ({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: buf.toString("base64"),
          },
        })
      ),
      { type: "text", text: prompt },
    ];
    const system = PdfClaudeExtractionUtils.buildSystemPrompt();
    const rawText = await this.callClaude(system, blocks);
    const parsed = PdfClaudeExtractionUtils.parseJsonFromModel(rawText);
    let result = PdfClaudeExtractionUtils.validateResult(parsed);
    if (this.shouldRetryBusinessName(result)) {
      result = await this.retryMissingBusinessNameVision(result, pngs);
    }
    return {
      result,
      meta: {
        text_mode_used: "vision_base64",
        extracted_letters: extractedLettersMeta,
      },
    };
  }

  private async extractFromPdfVisionInternal(
    pdf: Buffer,
    extractedLettersMeta: number
  ): Promise<{ result: PdfClaudeExtractResultDTO; meta: ClaudePdfExtractMetaDTO }> {
    if (!pdf.length) {
      throw new Error("extractFromPdfVisionInternal: empty PDF buffer");
    }
    const prompt = PdfClaudeExtractionUtils.buildVisionInstruction();
    const blocks: Anthropic.Messages.ContentBlockParam[] = [
      // Claude supports direct PDF document input.
      // Using this path avoids brittle host dependencies (pdf-poppler/poppler binaries).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: pdf.toString("base64"),
        },
      } as any),
      { type: "text", text: prompt },
    ];
    const system = PdfClaudeExtractionUtils.buildSystemPrompt();
    const rawText = await this.callClaude(system, blocks);
    const parsed = PdfClaudeExtractionUtils.parseJsonFromModel(rawText);
    const result = PdfClaudeExtractionUtils.validateResult(parsed);
    return {
      result,
      meta: {
        text_mode_used: "vision_base64",
        extracted_letters: extractedLettersMeta,
      },
    };
  }

  private async callClaude(
    system: string,
    userContent: Anthropic.Messages.ContentBlockParam[]
  ): Promise<string> {
    const model = this.cfg.get<string>("CLAUDE_PDF_MODEL") ?? "claude-sonnet-4-6";
    const max_tokens =
      PdfClaudeExtractionUtils.readPositiveIntCfg(this.cfg, "CLAUDE_PDF_MAX_TOKENS", 12000);

    const msg = await this.client.messages.create({
      model,
      max_tokens,
      temperature: 0,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    const parts: string[] = [];
    for (const block of msg.content) {
      if (block.type === "text" && block.text) {
        parts.push(block.text);
      }
    }
    return parts.join("\n").trim();
  }

  private shouldRetryBusinessName(result: PdfClaudeExtractResultDTO): boolean {
    const dtype = String(result.document_type ?? "").toLowerCase();
    const looksLikeApp =
      /(application|funding|merchant|loan|mca)/.test(dtype) ||
      !!result.key_data?.owner_first_name ||
      !!result.key_data?.owner_last_name ||
      !!result.key_data?.ssn;
    const likelyForm = !Array.isArray(result.transactions) || result.transactions.length === 0;
    const business = String(result.key_data?.business_name ?? "").trim();
    return !business && (looksLikeApp || likelyForm);
  }

  private async retryMissingBusinessNameText(
    base: PdfClaudeExtractResultDTO,
    fullText: string
  ): Promise<PdfClaudeExtractResultDTO> {
    const system =
      "You extract business-funding application fields. Return one JSON object only with key_data. " +
      "Set key_data.business_name to the legal merchant/business name exactly as printed. " +
      "Also include legal_business_name, company_name, merchant_name, dba_name if present.";
    const user =
      "Extract only missing merchant-name fields from this document text.\n\n" +
      `Document text:\n${PdfClaudeExtractionUtils.clip(fullText, 120_000)}`;
    const raw = await this.callClaude(system, PdfClaudeExtractionUtils.singleTextBlock(user));
    const parsed = PdfClaudeExtractionUtils.parseJsonFromModel(raw);
    const retry = PdfClaudeExtractionUtils.validateResult(parsed);
    return PdfClaudeExtractionUtils.mergeBusinessNameAliases(base, retry.key_data || {});
  }

  private async retryMissingBusinessNameVision(
    base: PdfClaudeExtractResultDTO,
    pngs: Buffer[]
  ): Promise<PdfClaudeExtractResultDTO> {
    const blocks: Anthropic.Messages.ContentBlockParam[] = [
      ...pngs.map(
        (buf): Anthropic.Messages.ImageBlockParam => ({
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: buf.toString("base64"),
          },
        })
      ),
      {
        type: "text",
        text:
          "Extract only merchant name fields. Return one JSON object with key_data only. " +
          "Set key_data.business_name to legal merchant/business name exactly as printed. " +
          "Also include legal_business_name, company_name, merchant_name, dba_name if visible.",
      },
    ];
    const raw = await this.callClaude("You are a document extraction engine.", blocks);
    const parsed = PdfClaudeExtractionUtils.parseJsonFromModel(raw);
    const retry = PdfClaudeExtractionUtils.validateResult(parsed);
    return PdfClaudeExtractionUtils.mergeBusinessNameAliases(base, retry.key_data || {});
  }

  /**
   * Extract structured KYC fields from a driver's license or voided check / bank letter.
   */
  async extractKycDocument(
    buffer: Buffer,
    mimeType: string,
    documentType: "driverLicense" | "voidedCheck",
  ): Promise<{ key_data: Record<string, string> }> {
    if (!buffer.length) {
      throw new Error("extractKycDocument: empty file buffer");
    }

    const mime = (mimeType || "").toLowerCase();
    const isPdf =
      mime === "application/pdf" ||
      mime === "application/x-pdf" ||
      mime === "binary/octet-stream";
    const isImage =
      mime === "image/jpeg" ||
      mime === "image/jpg" ||
      mime === "image/png" ||
      mime === "image/webp";

    const { system, userPrompt } = PdfClaudeExtractionUtils.buildKycSystemAndPrompt(documentType);

    let blocks: Anthropic.Messages.ContentBlockParam[];

    if (isImage) {
      const mediaType: "image/jpeg" | "image/png" | "image/webp" =
        mime === "image/png"
          ? "image/png"
          : mime === "image/webp"
            ? "image/webp"
            : "image/jpeg";
      blocks = [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: buffer.toString("base64"),
          },
        },
        { type: "text", text: userPrompt },
      ];
    } else if (isPdf) {
      blocks = [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: buffer.toString("base64"),
          },
        } as any),
        { type: "text", text: userPrompt },
      ];
    } else {
      throw new Error(`Unsupported file type for KYC extraction: ${mimeType || "unknown"}`);
    }

    const rawText = await this.callClaude(system, blocks);
    const parsed = PdfClaudeExtractionUtils.parseJsonFromModel(rawText);
    const validated = PdfClaudeExtractionUtils.validateKycResult(parsed, documentType);
    return { key_data: validated.key_data };
  }
}

/** Thrown when callers handle sparse PDFs themselves instead of using hybrid vision. */
export class PdfTooSparseForTextHybridError extends Error {
  constructor(minLetters: number, actualLetters: number) {
    super(
      `PDF text is too sparse for hybrid text path (found ${actualLetters} letters, need >= ${minLetters}). ` +
        `Render pages to PNG and call extractFromPagePngs(), or use extractHybridFromPdfBuffer (vision fallback).`
    );
    this.name = "PdfTooSparseForTextHybridError";
  }
}

export class PdfClaudeExtractionUtils {
  static readPositiveIntCfg(cfg: ConfigService, key: string, fallback: number): number {
    const raw = cfg.get<string>(key);
    const n = raw !== undefined && raw !== null ? Number(raw) : NaN;
    if (!Number.isFinite(n) || n <= 0) {
      return fallback;
    }
    return Math.floor(n);
  }

  static countLetters(s: string): number {
    return [...(s || "")].filter((c) => /[A-Za-z]/.test(c)).length;
  }

  /** ZipTool-style strict JSON extraction rules (system). */
  static buildSystemPrompt(): string {
    return [
      "You extract structured data from documents.",
      "Reply with a single JSON object only, no markdown outside JSON.",
      "Use these keys: document_type (string), title (string), summary (string),",
      "key_data (object string->string for important fields like dates, amounts, names),",
      "transactions (array; include all visible transaction rows across all pages with fields",
      "page, date, description, amount, credit_debit[CR|DR], optional section/payee/check_no),",
      "pages (array of {page_number:int, note:string} optional), model_notes (string, optional).",
      "",
      "For business funding / merchant application forms:",
      "- Always provide key_data.business_name as the canonical legal entity name when visible.",
      "- If legal_business_name / company_name / merchant_name / dba_name exists, map best legal name into business_name.",
      "- Provide owner_first_name and owner_last_name when owner/applicant name is present.",
      "",
      "Value hygiene rules:",
      "- Values must be raw field values only (no labels like 'Owner Mobile :' or 'DateBusiness').",
      "- If unreadable, keep empty string; do not invent.",
      "- Do not put summary/title words inside key_data values.",
    ].join("\n");
  }

  /** Text-hybrid user block (ZipTool `_build_system_and_user_text` user half). */
  static buildUserTextPass(fullText: string, perPageTexts: string[]): string {
    const pageBlocks = perPageTexts.map(
      (t, i) => `--- Page ${i + 1} ---\n${PdfClaudeExtractionUtils.clip(t, 12_000)}\n`
    );
    return [
      "Mode: text extraction (embedded/layered PDF text).",
      "",
      "Per-page text (may be empty on some pages):",
      pageBlocks.join("\n"),
      "",
      "Full document text (merged):",
      PdfClaudeExtractionUtils.clip(fullText, 120_000),
    ].join("\n");
  }

  static buildSystemAndUserText(
    fullText: string,
    perPageTexts: string[]
  ): { system: string; user: string } {
    return {
      system: PdfClaudeExtractionUtils.buildSystemPrompt(),
      user: PdfClaudeExtractionUtils.buildUserTextPass(fullText, perPageTexts),
    };
  }

  /** User message tail for vision: after all page images. */
  static buildVisionInstruction(): string {
    return [
      "The preceding images are PDF pages in order (first image = page 1).",
      "Read all pages and produce the same single JSON object described in the system instructions.",
      "Ensure pages[] has one entry per image, with matching page_number.",
      "If the document is a statement with transaction lines, populate transactions[]; otherwise use [].",
    ].join("\n");
  }

  static singleTextBlock(user: string): Anthropic.Messages.ContentBlockParam[] {
    return [{ type: "text", text: user }];
  }

  static clip(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max) + "\n…[truncated]";
  }

  static parseJsonFromModel(raw: string): unknown {
    let text = (raw || "").trim();
    if (!text) return null;

    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      text = fence[1].trim();
    }

    const tryParse = (s: string): unknown => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    };

    let parsed = tryParse(text);
    if (parsed) return parsed;

    const i = text.indexOf("{");
    const j = text.lastIndexOf("}");
    if (i !== -1 && j > i) {
      parsed = tryParse(text.slice(i, j + 1));
      if (parsed) return parsed;
    }
    return null;
  }

  static validateResult(data: unknown): PdfClaudeExtractResultDTO {
    if (!data || typeof data !== "object") {
      throw new Error("Claude did not return a JSON object");
    }
    const o = data as Record<string, unknown>;
    const key_data: Record<string, string> = {};
    const kd = o.key_data;
    if (kd && typeof kd === "object") {
      for (const [k, v] of Object.entries(kd as Record<string, unknown>)) {
        key_data[String(k)] = v == null ? "" : String(v);
      }
    }

    const pages = PdfClaudeExtractionUtils.normalizePages(o.pages);
    const transactions = Array.isArray(o.transactions)
      ? (o.transactions as Array<Record<string, unknown>>)
      : [];

    const base: PdfClaudeExtractResultDTO = {
      document_type: o.document_type == null ? "unknown" : String(o.document_type),
      title: o.title == null ? "" : String(o.title),
      summary: o.summary == null ? "" : String(o.summary),
      key_data,
      pages,
      transactions,
    };

    const mn = o.model_notes;
    if (mn != null && String(mn).trim() !== "") {
      base.model_notes = String(mn);
    }
    return PdfClaudeExtractionUtils.withCanonicalBusinessName(base);
  }

  static enrichFromRawText(
    result: PdfClaudeExtractResultDTO,
    fullText: string
  ): PdfClaudeExtractResultDTO {
    const keyData = { ...(result.key_data || {}) };
    const cleaned = (v: string): string =>
      String(v || "")
        .replace(/\s+/g, " ")
        .replace(/^(Owner Mobile\s*:|DateBusiness)\s*/i, "")
        .trim();
    for (const [k, v] of Object.entries(keyData)) {
      keyData[k] = cleaned(String(v ?? ""));
    }

    if (!String(keyData.business_name || "").trim()) {
      const patterns = [
        /(?:legal\s*(?:business|corporate)?\s*name|business\s*name|company\s*name|merchant\s*name|dba(?:\s*name)?)\s*[:\-]\s*([^\n\r]{2,120})/i,
        /(?:legal\s*(?:business|corporate)?\s*name|business\s*name|company\s*name|merchant\s*name|dba(?:\s*name)?)\s+([^\n\r]{2,120})/i,
      ];
      for (const p of patterns) {
        const m = fullText.match(p);
        const value = cleaned(m?.[1] ?? "");
        if (value && !/^(owner|mobile|datebusiness)$/i.test(value)) {
          keyData.business_name = value;
          break;
        }
      }
    }

    if (!String(keyData.owner_first_name || "").trim() || !String(keyData.owner_last_name || "").trim()) {
      const ownerMatch = fullText.match(
        /(?:applicant|owner|principal)\s*(?:name)?\s*[:\-]\s*([A-Za-z][A-Za-z '\.-]{2,80})/i
      );
      const full = cleaned(ownerMatch?.[1] ?? "");
      const parts = full.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        if (!String(keyData.owner_first_name || "").trim()) {
          keyData.owner_first_name = parts.slice(0, -1).join(" ");
        }
        if (!String(keyData.owner_last_name || "").trim()) {
          keyData.owner_last_name = parts[parts.length - 1] || "";
        }
      }
    }

    return PdfClaudeExtractionUtils.withCanonicalBusinessName({ ...result, key_data: keyData });
  }

  static withCanonicalBusinessName(result: PdfClaudeExtractResultDTO): PdfClaudeExtractResultDTO {
    const keyData = { ...(result.key_data || {}) };
    const aliasOrder = [
      "business_name",
      "legal_business_name",
      "company_name",
      "merchant_name",
      "dba_name",
    ];
    const first = aliasOrder
      .map((k) => String(keyData[k] ?? "").trim())
      .find((v) => v.length > 0);
    if (first) keyData.business_name = first;
    return { ...result, key_data: keyData };
  }

  static mergeBusinessNameAliases(
    base: PdfClaudeExtractResultDTO,
    incomingKeyData: Record<string, string>
  ): PdfClaudeExtractResultDTO {
    const merged = { ...(base.key_data || {}) };
    for (const [k, v] of Object.entries(incomingKeyData || {})) {
      if (!v) continue;
      merged[k] = String(v).trim();
    }
    return PdfClaudeExtractionUtils.withCanonicalBusinessName({ ...base, key_data: merged });
  }

  static buildKycSystemAndPrompt(
    documentType: "driverLicense" | "voidedCheck",
  ): { system: string; userPrompt: string } {
    if (documentType === "driverLicense") {
      return {
        system: [
          "You extract data from US driver's licenses and state ID cards with absolute precision.",
          "Reply with a single JSON object only — no markdown outside JSON.",
          "Use keys: document_type (string), key_data (object string->string).",
          "",
          "key_data fields (use empty string if not visible; never invent):",
          "- first_name, last_name, full_name (as printed on card)",
          "- driver_license_number (exact spacing/digits as printed)",
          "- date_of_birth (MM/DD/YYYY when visible)",
          "- sex, height, eye_color, license_class",
          "- address_line1, address_line2 (apt/suite if separate)",
          "- city, state (2-letter), zip",
          "- issue_date, expiration_date (MM/DD/YYYY when visible)",
          "",
          "Rules:",
          "- Copy values exactly as printed on the document.",
          "- Do not include field labels in values.",
          "- For multi-line addresses, put street in address_line1 and unit in address_line2.",
        ].join("\n"),
        userPrompt:
          "Read this driver's license image/document and return the JSON object with key_data populated.",
      };
    }

    return {
      system: [
        "You extract banking data from voided checks, direct deposit forms, and bank verification letters.",
        "Reply with a single JSON object only — no markdown outside JSON.",
        "Use keys: document_type (string), key_data (object string->string).",
        "",
        "key_data fields (use empty string if not visible; never invent):",
        "- account_holder_name / member_name (exact legal name on document)",
        "- legal_business_name (if business entity shown)",
        "- dba_name (doing business as, if shown separately or after 'DBA')",
        "- account_holder_address_line1, account_holder_address_line2",
        "- city, state (2-letter), zip",
        "- bank_name (financial institution name)",
        "- bank_address, bank_city, bank_state, bank_zip",
        "- routing_number / aba_routing_number (9 digits, no spaces)",
        "- account_number / checking_account_number (digits only, preserve leading zeros)",
        "- account_type (Checking, Savings, etc.)",
        "- check_number (if visible on sample check)",
        "",
        "Rules:",
        "- Routing numbers are exactly 9 digits.",
        "- Account numbers: digits only, full length as printed (often 10-17 digits).",
        "- If member name contains 'DBA', also populate legal_business_name and dba_name separately.",
        "- Copy bank and holder names exactly as printed.",
      ].join("\n"),
      userPrompt:
        "Read this voided check / bank letter / direct deposit form and return the JSON object with key_data populated.",
    };
  }

  static validateKycResult(
    data: unknown,
    documentType: "driverLicense" | "voidedCheck",
  ): { document_type: string; key_data: Record<string, string> } {
    if (!data || typeof data !== "object") {
      throw new Error("Claude did not return a JSON object for KYC extraction");
    }
    const o = data as Record<string, unknown>;
    const key_data: Record<string, string> = {};
    const kd = o.key_data;
    if (kd && typeof kd === "object") {
      for (const [k, v] of Object.entries(kd as Record<string, unknown>)) {
        key_data[String(k)] = v == null ? "" : String(v).trim();
      }
    }
    return {
      document_type:
        o.document_type == null ? documentType : String(o.document_type),
      key_data,
    };
  }

  static normalizePages(p: unknown): Array<{ page_number: number; note: string }> {
    if (!Array.isArray(p)) return [];
    return p.map((item, idx) => {
      if (!item || typeof item !== "object") {
        return { page_number: idx + 1, note: "" };
      }
      const row = item as Record<string, unknown>;
      const pn = row.page_number;
      const page_number =
        typeof pn === "number" && Number.isFinite(pn)
          ? Math.floor(pn)
          : typeof pn === "string" && /^\d+$/.test(pn)
            ? parseInt(pn, 10)
            : idx + 1;
      return {
        page_number,
        note: row.note == null ? "" : String(row.note),
      };
    });
  }
}