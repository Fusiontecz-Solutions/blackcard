import {
  SCRUBBER_DECLINE_REASONS_NOTE_PREFIX,
  UNDERWRITER_DECLINE_REASONS_NOTE_PREFIX,
} from "@/lib/scrubberDeclineReasonsDisplay";
import { MISSING_DOCUMENTS_NOTE_PREFIX } from "@/lib/missingDocuments";

const PREFERRED_OBJECT_KEYS = [
  "legalName",
  "dba",
  "name",
  "documentName",
  "document",
  "typeOfEntity",
  "ein",
  "mailingAddress",
  "reason",
  "additionalComments",
  "content",
  "message",
  /** ContractTab / ACH payloads */
  "bankName",
  "fullNameOnAccount",
  "accountNumber",
  "routingNumber",
] as const;

const stringifyPrimitive = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const formatObject = (value: Record<string, unknown>): string => {
  const preferred = PREFERRED_OBJECT_KEYS.map((key) => stringifyPrimitive(value[key])).filter(Boolean);

  if (preferred.length > 0) {
    return preferred.join(" - ");
  }

  const fallback = Object.entries(value)
    .filter(([key]) => key !== "id")
    .map(([, entry]) => stringifyPrimitive(entry))
    .filter(Boolean);

  if (fallback.length > 0) {
    return fallback.join(" - ");
  }

  return "";
};

const parsePotentialJsonString = (value: string): unknown => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

/**
 * ContractTab sections use uppercase labels: `[ACH]`, `[ADDENDUM]`, etc.
 * Payload may be on the next line **or** glued to the header: `[ACH][{...}]` (no newline before `[` / `{`).
 */
const SECTION_HEADER_SPLIT = /(?=\n\s*\[[A-Z][A-Z0-9_]*\]\s*[\[{])/;

const isStructuredContractSectionPart = (part: string): boolean => {
  const t = part.trim();
  if (!t) return false;
  // Header then JSON/array: `[ACH][{...}]` or `[ACH]\n[{...}]`
  if (/^\[[A-Z][A-Z0-9_]*\]\s*[\[{]/.test(t)) return true;
  // Legacy: header line then JSON on following line only
  if (/^\[[^\]]+\]\s*\n/.test(t)) return true;
  return false;
};

/**
 * Split combined application notes: free text plus lines like `[ADDENDUM]\\n{json}` (from appendStructuredNote).
 * Handles `\\n\\n` before headers, CRLF, and `[TAG][{json}]` (no newline between tag and payload).
 */
const normalizeNoteNewlines = (note: string): string => note.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/** Internal Application.note marker when Gmail subject-fallback auto-creates a deal (dedupe guard). */
const GMAIL_AUTO_CREATE_MSG_NOTE_RE = /^\s*gmail-msg:[a-f0-9]+\s*$/i;

const stripInternalSystemNotes = (note: string): string =>
  normalizeNoteNewlines(note)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !GMAIL_AUTO_CREATE_MSG_NOTE_RE.test(line) &&
        !line.startsWith(SCRUBBER_DECLINE_REASONS_NOTE_PREFIX) &&
        !line.startsWith(UNDERWRITER_DECLINE_REASONS_NOTE_PREFIX) &&
        !line.startsWith(MISSING_DOCUMENTS_NOTE_PREFIX),
    )
    .join("\n\n")
    .trim();

const splitStructuredNoteParts = (note: string): string[] =>
  normalizeNoteNewlines(note)
    .trim()
    .split(SECTION_HEADER_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * Action Required shows only human-entered message text (e.g. document request reason).
 * Structured contract sections are omitted so addendum / EPO payloads are not shown here.
 */
const messageOnlyFromCombinedNote = (note: string): string => {
  const parts = splitStructuredNoteParts(note);
  return parts.filter((part) => !isStructuredContractSectionPart(part)).join("\n\n").trim();
};

function formatActionRequiredInner(value: unknown): string {
  if (value == null) return "--";

  if (typeof value === "string") {
    const parsed = parsePotentialJsonString(value);
    if (parsed === value) return value.trim() || "--";
    return formatActionRequiredInner(parsed);
  }

  if (Array.isArray(value)) {
    const lines = value
      .map((item) => formatActionRequiredInner(item))
      .filter((line) => line && line !== "--");
    if (lines.length === 0) return "--";
    const sep = lines.some((line) => line.includes("\n")) ? "\n\n" : "\n";
    return lines.join(sep);
  }

  if (typeof value === "object") {
    const objectLine = formatObject(value as Record<string, unknown>).trim();
    return objectLine || "--";
  }

  const primitive = stringifyPrimitive(value);
  return primitive || "--";
}

export const formatActionRequired = (value: unknown): string => {
  if (value == null) return "--";

  if (typeof value === "string") {
    const trimmed = stripInternalSystemNotes(value);
    if (!trimmed) return "--";

    const messageOnly = messageOnlyFromCombinedNote(trimmed);
    if (!messageOnly) {
      const hadStructuredSections =
        splitStructuredNoteParts(trimmed).some((p) => isStructuredContractSectionPart(p));
      return hadStructuredSections ? "--" : formatActionRequiredInner(trimmed);
    }

    return formatActionRequiredInner(parsePotentialJsonString(messageOnly));
  }

  return formatActionRequiredInner(value);
};
