/**
 * PDF / image → Google Document AI → structured key_data
 * (same downstream shape as the legacy Claude extractor).
 *
 * Required env:
 *   GOOGLE_CLOUD_PROJECT (or GCP_PROJECT_ID)
 *   DOCUMENT_AI_PROCESSOR_ID
 *
 * Optional:
 *   DOCUMENT_AI_LOCATION
 *   DOCUMENT_AI_KYC_PROCESSOR_ID
 *   DOCUMENT_AI_OCR_PROCESSOR_ID
 *   GOOGLE_APPLICATION_CREDENTIALS
 */

import {
  PdfClaudeExtractionUtils,
  type ClaudePdfExtractMetaDTO,
  type PdfClaudeExtractResultDTO,
} from '../../nestjs-claude-pdf/claude-pdf-extraction.service';
import { processDocumentWithProcessor } from './documentAiClient';
import {
  mapDocumentAiToExtractResult,
  mapDocumentAiToKycKeyData,
} from './mapDocumentAiToExtractResult';

function readProcessorId(key: string, fallbackKey?: string): string {
  const primary = String(process.env[key] || '').trim();
  if (primary) return primary;
  if (fallbackKey) {
    const fb = String(process.env[fallbackKey] || '').trim();
    if (fb) return fb;
  }
  return '';
}

/** Ignore placeholder example values from .env templates. */
function isRealProcessorId(id: string): boolean {
  const v = String(id || '').trim();
  if (!v) return false;
  if (/^(separate-kyc|enterprise-ocr|your-|example|placeholder)/i.test(v)) return false;
  if (v.includes('processor-id')) return false;
  return /^[a-z0-9]+$/i.test(v);
}

function resolveProcessorId(key: string, fallbackKey?: string): string {
  const primary = readProcessorId(key);
  if (isRealProcessorId(primary)) return primary;
  if (fallbackKey) {
    const fb = readProcessorId(fallbackKey);
    if (isRealProcessorId(fb)) return fb;
  }
  return '';
}

function detectMimeFromBuffer(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).toString() === '\x89PNG\r\n\x1a\n') {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF') {
    return 'application/pdf';
  }
  return null;
}

function resolveMimeType(mimeType: string, buffer: Buffer): string {
  const detected = detectMimeFromBuffer(buffer);
  if (detected) return detected;

  const mime = String(mimeType || '').toLowerCase().trim();
  if (mime && mime !== 'application/octet-stream' && mime !== 'binary/octet-stream') {
    return mime;
  }
  return 'application/pdf';
}

function countNonEmptyKeys(kd: Record<string, string>): number {
  return Object.values(kd).filter((v) => String(v ?? '').trim().length > 0).length;
}

export class DocumentAiPdfExtractionService {
  getRuntimeDebugConfig(): Record<string, string> {
    return {
      provider: 'document_ai',
      processorId: resolveProcessorId('DOCUMENT_AI_PROCESSOR_ID'),
      kycProcessorId: resolveProcessorId('DOCUMENT_AI_KYC_PROCESSOR_ID', 'DOCUMENT_AI_PROCESSOR_ID'),
      ocrProcessorId: resolveProcessorId('DOCUMENT_AI_OCR_PROCESSOR_ID'),
    };
  }

  async extractHybridFromPdfBuffer(
    pdf: Buffer,
  ): Promise<{ result: PdfClaudeExtractResultDTO; meta: ClaudePdfExtractMetaDTO }> {
    const processorId = resolveProcessorId('DOCUMENT_AI_PROCESSOR_ID');
    if (!processorId) {
      throw new Error('DOCUMENT_AI_PROCESSOR_ID is required for Document AI PDF extraction');
    }

    let document = await processDocumentWithProcessor(pdf, processorId, 'application/pdf');
    let result = mapDocumentAiToExtractResult(document);
    let fullText = String(document.text || '').trim();

    const ocrProcessorId = resolveProcessorId('DOCUMENT_AI_OCR_PROCESSOR_ID');
    if (ocrProcessorId && countNonEmptyKeys(result.key_data) < 3) {
      document = await processDocumentWithProcessor(pdf, ocrProcessorId, 'application/pdf');
      const ocrResult = mapDocumentAiToExtractResult(document);
      result.key_data = { ...ocrResult.key_data, ...result.key_data };
      fullText = String(document.text || fullText).trim();
    }

    result = PdfClaudeExtractionUtils.enrichFromRawText(result, fullText);
    result = PdfClaudeExtractionUtils.withCanonicalBusinessName(result);

    return {
      result,
      meta: {
        text_mode_used: 'text',
        extracted_letters: PdfClaudeExtractionUtils.countLetters(fullText),
      },
    };
  }

  async extractKycDocument(
    buffer: Buffer,
    mimeType: string,
    documentType: 'driverLicense' | 'voidedCheck',
  ): Promise<{ key_data: Record<string, string> }> {
    if (!buffer.length) {
      throw new Error('extractKycDocument: empty file buffer');
    }

    const processorId = resolveProcessorId('DOCUMENT_AI_KYC_PROCESSOR_ID', 'DOCUMENT_AI_PROCESSOR_ID');
    if (!processorId) {
      throw new Error('DOCUMENT_AI_KYC_PROCESSOR_ID or DOCUMENT_AI_PROCESSOR_ID is required');
    }

    const document = await processDocumentWithProcessor(
      buffer,
      processorId,
      resolveMimeType(mimeType, buffer),
    );
    return { key_data: mapDocumentAiToKycKeyData(document, documentType) };
  }
}
