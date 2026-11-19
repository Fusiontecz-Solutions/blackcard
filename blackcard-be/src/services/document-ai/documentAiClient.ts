import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import type { google } from '@google-cloud/documentai/build/protos/protos';
import { processDocumentPossiblyChunked } from './processDocumentChunked';

type Document = google.cloud.documentai.v1.IDocument;
type ProcessRequest = google.cloud.documentai.v1.IProcessRequest;

let clientSingleton: DocumentProcessorServiceClient | undefined;

export function getDocumentAiClient(): DocumentProcessorServiceClient {
  if (!clientSingleton) {
    clientSingleton = new DocumentProcessorServiceClient();
  }
  return clientSingleton;
}

export function resolveDocumentAiProcessorName(processorId: string): string {
  const projectId = String(process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT_ID || '').trim();
  const location = String(process.env.DOCUMENT_AI_LOCATION || 'us').trim();
  const id = String(processorId || '').trim();
  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT (or GCP_PROJECT_ID) is required for Document AI');
  }
  if (!id) {
    throw new Error('DOCUMENT_AI_PROCESSOR_ID is required for Document AI PDF extraction');
  }
  return `projects/${projectId}/locations/${location}/processors/${id}`;
}

export async function processDocumentWithProcessor(
  buffer: Buffer,
  processorId: string,
  mimeType = 'application/pdf',
): Promise<Document> {
  if (!buffer.length) {
    throw new Error('processDocumentWithProcessor: empty buffer');
  }

  const client = getDocumentAiClient();
  const name = resolveDocumentAiProcessorName(processorId);

  return (await processDocumentPossiblyChunked(buffer, mimeType, async (content, mt) => {
    const request: ProcessRequest = {
      name,
      rawDocument: {
        content: content.toString('base64'),
        mimeType: mt,
      },
      imagelessMode: true,
    };
    const [result] = await client.processDocument(request);
    if (!result.document) {
      throw new Error('Document AI returned no document payload');
    }
    return result.document;
  })) as Document;
}
