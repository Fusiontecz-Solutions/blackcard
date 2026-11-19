import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import fs from "fs";
import path from "path";

let cachedClient: DocumentProcessorServiceClient | null = null;

function envFirst(...keys: string[]): string {
  for (const key of keys) {
    const val = process.env[key];
    if (val != null && String(val).trim() !== "") return String(val).trim();
  }
  return "";
}

function resolveCredentialsPath(): string {
  const raw = envFirst("GOOGLE_APPLICATION_CREDENTIALS");
  if (!raw) return "";
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), raw);
}

/** Bank-statement AI analysis needs the Bank Statement Parser, not the generic OCR/form processor. */
export function getBankStatementDocAIConfig() {
  return {
    projectId: envFirst("GOOGLE_CLOUD_PROJECT", "GCP_PROJECT_ID"),
    location: envFirst("DOCUMENT_AI_LOCATION", "DOCAI_LOCATION") || "us",
    processorId: envFirst(
      "DOCUMENT_AI_BANK_STATEMENT_PROCESSOR_ID",
      "DOCAI_PROCESSOR_ID",
      "DOCUMENT_AI_PROCESSOR_ID"
    ),
  };
}

export function getDocAIConfig() {
  return getBankStatementDocAIConfig();
}

/**
 * True when every value required to call Document AI is present.
 * Accepts both blackcard-be naming (GOOGLE_CLOUD_PROJECT, DOCUMENT_AI_*) and
 * mca-tool naming (GCP_PROJECT_ID, DOCAI_*).
 */
export function isDocumentAIConfigured() {
  const { projectId, location, processorId } = getBankStatementDocAIConfig();
  const hasInlineCreds = !!envFirst("GCP_SA_KEY");
  const credPath = resolveCredentialsPath();
  const hasFileCreds = !!(credPath && fs.existsSync(credPath));
  const hasCreds = hasInlineCreds || hasFileCreds;
  return !!(projectId && location && processorId && hasCreds);
}

function buildClientOptions(): any {
  if (process.env.GCP_SA_KEY) {
    let credentials;
    try {
      credentials = JSON.parse(process.env.GCP_SA_KEY);
    } catch {
      throw new Error(
        "GCP_SA_KEY is set but is not valid JSON. Paste the full service-account key as a single-line JSON string."
      );
    }
    return { credentials };
  }
  const keyPath = resolveCredentialsPath();
  if (keyPath && !fs.existsSync(keyPath)) {
    throw new Error(
      `GOOGLE_APPLICATION_CREDENTIALS points to a file that does not exist: ${keyPath}`
    );
  }
  if (keyPath) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
  }
  return {};
}

function apiEndpointFor(location: string) {
  return location && location !== "us"
    ? `${location}-documentai.googleapis.com`
    : undefined;
}

export function getDocumentAIClient() {
  if (cachedClient) return cachedClient;
  const { location } = getDocAIConfig();
  const options = buildClientOptions();
  const apiEndpoint = apiEndpointFor(location);
  if (apiEndpoint) options.apiEndpoint = apiEndpoint;
  cachedClient = new DocumentProcessorServiceClient(options);
  return cachedClient;
}

/** Fully-qualified processor resource name for process() calls. */
export function getProcessorName() {
  const { projectId, location, processorId } = getBankStatementDocAIConfig();
  return `projects/${projectId}/locations/${location}/processors/${processorId}`;
}
