import fs from 'fs/promises';
import { getPdfExtractionService } from './pdf-extraction/pdfExtraction.context';
import { resolveMimeTypeFromBuffer } from '../utils/mimeTypeFromBuffer';
import {
  type KycDocumentType,
  type KycExtractionMapped,
  mapKycKeyDataToPrefill,
  normalizeKycDocumentType,
} from './contractKycPrefillMapper';

type UploadedFileLike = {
  name?: string;
  mimetype?: string;
  tempFilePath?: string;
  data?: Buffer;
};

async function readFileBuffer(file: UploadedFileLike): Promise<Buffer> {
  if (file.data && file.data.length) {
    return file.data;
  }
  if (file.tempFilePath) {
    return fs.readFile(file.tempFilePath);
  }
  throw new Error('Uploaded file has no readable data');
}

function declaredMimeFromFile(file: UploadedFileLike): string {
  const mt = String(file.mimetype || '').toLowerCase().trim();
  if (mt) return mt;
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return '';
}

class ContractKycDocumentExtractService {
  async extractFromBuffer(
    buffer: Buffer,
    mimeType: string,
    documentType: KycDocumentType,
  ): Promise<KycExtractionMapped> {
    const svc = getPdfExtractionService();
    const { key_data } = await svc.extractKycDocument(buffer, mimeType, documentType);
    return mapKycKeyDataToPrefill(documentType, key_data);
  }

  async extractFromUploadedFile(
    file: UploadedFileLike,
    documentType: KycDocumentType,
  ): Promise<KycExtractionMapped> {
    const buffer = await readFileBuffer(file);
    const mimeType = resolveMimeTypeFromBuffer(declaredMimeFromFile(file), buffer);
    return this.extractFromBuffer(buffer, mimeType, documentType);
  }

  resolveDocumentType(raw: unknown): KycDocumentType {
    const normalized = normalizeKycDocumentType(raw);
    if (!normalized) {
      throw new Error('documentType must be driverLicense or voidedCheck');
    }
    return normalized;
  }
}

export default new ContractKycDocumentExtractService();
