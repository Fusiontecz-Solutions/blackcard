import {
  isScrubberDeclineRecommendation,
  parseScrubberDeclineReasons,
  SCRUBBER_DECLINE_REASONS_DELIMITER,
} from "@/lib/scrubberDeclineReasons";
import { MISSING_DOCUMENTS_NOTE_PREFIX } from "@/lib/missingDocuments";

/** Marker written into Application.note so reasons survive CRMs that normalize scrubberRecommendation. */
export const SCRUBBER_DECLINE_REASONS_NOTE_PREFIX = "SCRUBBER_DECLINE_REASONS:";
/** Marker the book adds to Application.note on an underwriter decline (internal, never shown). */
export const UNDERWRITER_DECLINE_REASONS_NOTE_PREFIX = "UNDERWRITER_DECLINE_REASONS:";

export function buildNoteWithScrubberDeclineReasons(
  existingNote: string | null | undefined,
  reasons: string[],
): string {
  const cleanedReasons = reasons.map((r) => String(r).trim()).filter(Boolean);
  const withoutMarker = String(existingNote ?? "")
    .split("\n")
    .filter((line) => !line.trim().startsWith(SCRUBBER_DECLINE_REASONS_NOTE_PREFIX))
    .join("\n")
    .trim();
  if (cleanedReasons.length === 0) return withoutMarker;
  const markerLine = `${SCRUBBER_DECLINE_REASONS_NOTE_PREFIX}${cleanedReasons.join(
    SCRUBBER_DECLINE_REASONS_DELIMITER,
  )}`;
  return withoutMarker ? `${withoutMarker}\n${markerLine}` : markerLine;
}

export function parseScrubberDeclineReasonsFromNote(
  note: string | null | undefined,
): string[] {
  const lines = String(note ?? "").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(SCRUBBER_DECLINE_REASONS_NOTE_PREFIX)) continue;
    const payload = trimmed
      .slice(SCRUBBER_DECLINE_REASONS_NOTE_PREFIX.length)
      .trim();
    return payload
      .split(SCRUBBER_DECLINE_REASONS_DELIMITER)
      .map((r) => r.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Resolve scrubber decline reasons from recommendation field, dedicated field, or note marker.
 */
export function resolveScrubberDeclineReasonsForDisplay(app: {
  scrubberRecommendation?: string | null;
  scrubberDeclineReasons?: string | null | string[];
  note?: string | null;
}): string[] {
  const fromRec = parseScrubberDeclineReasons(
    app.scrubberRecommendation,
    app.scrubberDeclineReasons,
  );
  if (fromRec.length > 0) return fromRec;
  if (isScrubberDeclineRecommendation(app.scrubberRecommendation)) {
    return parseScrubberDeclineReasonsFromNote(app.note);
  }
  return [];
}

export function isDeclinedStatusLabel(status: string | null | undefined): boolean {
  const n = String(status ?? "").trim().toLowerCase();
  return (
    n === "declined" ||
    n === "decline" ||
    n === "decline request" ||
    n.includes("declined by")
  );
}

export function splitDeclineReasonText(raw: string): string[] {
  return raw
    .split(/\n+|\s*;\s*|\s*\|\|\|\s*/)
    .map((r) => r.trim())
    .filter(Boolean);
}

/** Internal Application.note marker for Gmail subject-fallback auto-created deals. */
const GMAIL_AUTO_CREATE_MSG_NOTE_RE = /^\s*gmail-msg:[a-f0-9]+\s*$/i;
const GMAIL_AUTO_CREATE_MSG_PREFIX_RE = /^\s*gmail-msg:[a-f0-9]+\s*/i;

function stripInternalNoteMarkersForDeclineDisplay(
  note: string | null | undefined,
): string {
  return String(note ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith(SCRUBBER_DECLINE_REASONS_NOTE_PREFIX) &&
        !line.startsWith(UNDERWRITER_DECLINE_REASONS_NOTE_PREFIX) &&
        !line.startsWith(MISSING_DOCUMENTS_NOTE_PREFIX) &&
        !GMAIL_AUTO_CREATE_MSG_NOTE_RE.test(line),
    )
    .map((line) => line.replace(GMAIL_AUTO_CREATE_MSG_PREFIX_RE, "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/** Decline reasons for Status / Current State column when queue is Declined. */
export function resolveStatusDeclineReasonsForDisplay(app: {
  scrubberRecommendation?: string | null;
  scrubberDeclineReasons?: string | null | string[];
  note?: string | null;
  declineReason?: string | null;
  OfferDecision?: { declineReason?: string | null } | null;
}): string[] {
  const scrubber = resolveScrubberDeclineReasonsForDisplay(app);
  if (scrubber.length > 0) return scrubber;

  const fromOffer = String(
    app.OfferDecision?.declineReason ?? app.declineReason ?? "",
  ).trim();
  if (fromOffer) return splitDeclineReasonText(fromOffer);

  // Reject flow stores selected reason(s) on Application.note (may include
  // internal gmail-msg / scrubber markers — strip those before display).
  const cleanedNote = stripInternalNoteMarkersForDeclineDisplay(app.note);
  if (!cleanedNote) return [];
  return splitDeclineReasonText(cleanedNote);
}

/** Decline reasons for Request column when scrubber recommended Decline. */
export function resolveRequestDeclineReasonsForDisplay(app: {
  scrubberRecommendation?: string | null;
  scrubberDeclineReasons?: string | null | string[];
  note?: string | null;
  declineReason?: string | null;
  OfferDecision?: { declineReason?: string | null } | null;
}): string[] {
  if (!isScrubberDeclineRecommendation(app.scrubberRecommendation)) return [];
  const scrubber = resolveScrubberDeclineReasonsForDisplay(app);
  if (scrubber.length > 0) return scrubber;
  const fromOffer = String(
    app.OfferDecision?.declineReason ?? app.declineReason ?? "",
  ).trim();
  if (fromOffer) return splitDeclineReasonText(fromOffer);
  return [];
}
