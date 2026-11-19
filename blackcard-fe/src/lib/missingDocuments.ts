/**
 * Missing Documents flow: a scrubber parks a deal with Super Admin. The backend
 * stores the list as a `MISSING_DOCUMENTS:` marker line on Application.note
 * (`|||` delimited) — internal, never shown as note text.
 */
export const MISSING_DOCUMENTS_NOTE_PREFIX = "MISSING_DOCUMENTS:";
export const MISSING_DOCUMENTS_DELIMITER = "|||";
/** Application.currentQueue / currentState while the deal waits on documents. */
export const MISSING_DOCUMENTS_QUEUE = "Missing Documents";

export function isMissingDocumentsMarkerLine(line: string): boolean {
  return line.trim().startsWith(MISSING_DOCUMENTS_NOTE_PREFIX);
}

export function parseMissingDocumentsFromNote(
  note: string | null | undefined,
): string[] {
  const lines = String(note ?? "").replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(MISSING_DOCUMENTS_NOTE_PREFIX)) continue;
    return trimmed
      .slice(MISSING_DOCUMENTS_NOTE_PREFIX.length)
      .split(MISSING_DOCUMENTS_DELIMITER)
      .map((d) => d.trim())
      .filter(Boolean);
  }
  return [];
}

/** Remove the marker line so it never shows in note displays. */
export function stripMissingDocumentsMarker(note: string | null | undefined): string {
  return String(note ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !isMissingDocumentsMarkerLine(line))
    .join("\n")
    .trim();
}

/** The raw marker line(s) of a note, to re-attach after editing the visible text. */
export function extractMissingDocumentsMarkerLines(note: string | null | undefined): string[] {
  return String(note ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(isMissingDocumentsMarkerLine);
}

export function isMissingDocumentsQueue(queue: string | null | undefined): boolean {
  return (
    String(queue ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "") ===
    "missingdocuments"
  );
}

const normalizeDocumentKey = (value: string): string =>
  String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Split the scrubber's list into catalog document slugs (matched by label or
 * slug against `options`) and the unmatched free-text entries.
 */
export function mapMissingDocumentsToRequestOptions(
  documents: string[],
  options: { id: string; label: string }[],
): { slugs: string[]; unmatched: string[] } {
  const slugs: string[] = [];
  const unmatched: string[] = [];
  for (const doc of documents) {
    const key = normalizeDocumentKey(doc);
    const match = options.find(
      (o) => normalizeDocumentKey(o.label) === key || normalizeDocumentKey(o.id) === key,
    );
    if (match) {
      if (!slugs.includes(match.id)) slugs.push(match.id);
    } else if (doc.trim()) {
      unmatched.push(doc.trim());
    }
  }
  return { slugs, unmatched };
}

/** Generic "other" document type: free-text entries upload under it. */
export const MISSING_DOCUMENTS_GENERIC_SLUG = "additional-documents";

/** One row of a Missing Documents hold (backend `buildMissingDocumentItems`). */
export type MissingDocumentItem = {
  /** Stable unique row key (free-text rows share the generic slug). */
  key: string;
  label: string;
  /** Document type the uploads are tagged with. */
  slug: string;
  matched: boolean;
  /** Free-text rows: file-name prefix tying an upload to this row; "" otherwise. */
  fileNamePrefix: string;
  /** A file for this row was uploaded during this hold. */
  satisfied: boolean;
  files: { id: string; name: string; uploadedAt: string }[];
};

/**
 * Free-text rows upload under the generic slug; the backend tells them apart
 * by this file-name prefix (ApplicationFile has no description column).
 */
export function withMissingDocumentFilePrefix(file: File, prefix: string | undefined): File {
  const p = String(prefix ?? "");
  if (!p || file.name.toLowerCase().startsWith(p.toLowerCase())) return file;
  return new File([file], `${p}${file.name}`, { type: file.type, lastModified: file.lastModified });
}
