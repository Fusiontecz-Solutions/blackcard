/**
 * Detect AES-GCM payloads from the API (iv.tag.ciphertext).
 * Used only to avoid showing undecrypted blobs when decrypt failed server-side.
 */
export function looksEncrypted(value) {
  if (value == null) return false;
  const parts = String(value).split(".");
  if (parts.length !== 3) return false;
  const b64 = /^[A-Za-z0-9+/]+=*$/;
  return parts.every((p) => p.length > 0 && b64.test(p));
}

/** Plain account number for inputs and display, or empty if still encrypted. */
export function sanitizeAccountNumber(value) {
  const s = value != null ? String(value).trim() : "";
  if (!s || looksEncrypted(s)) return "";
  return s;
}

/** "Yes" / "No" label for previews, or null if missing / still encrypted. */
export function formatLegalCheckLabel(value) {
  const s = String(value ?? "").trim();
  if (!s || looksEncrypted(s)) return null;
  const lower = s.toLowerCase();
  if (lower === "yes" || lower === "no") {
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return null;
}

export function isDisplayableLegalCheck(value) {
  return formatLegalCheckLabel(value) != null;
}

/** Plain note text for inputs and display, or empty if still encrypted. */
export function sanitizeNoteText(value) {
  if (value == null) return "";
  const s = String(value);
  if (looksEncrypted(s)) return "";
  return s;
}

function noteVisibleText(value) {
  const s = sanitizeNoteText(value);
  if (!s) return "";
  if (/<img\b/i.test(s)) return s;
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when note text is missing, whitespace-only, image-free empty HTML, or still encrypted. */
export function isEmptyNoteText(value) {
  const s = sanitizeNoteText(value);
  if (!s.trim()) return true;
  if (/<img\b/i.test(s)) return false;
  return noteVisibleText(s) === "";
}

/** Filter note list to displayable plaintext / HTML notes only. */
export function sanitizeNoteTextList(values) {
  if (!Array.isArray(values)) return [];
  return values.map((v) => sanitizeNoteText(v)).filter((s) => !isEmptyNoteText(s));
}
