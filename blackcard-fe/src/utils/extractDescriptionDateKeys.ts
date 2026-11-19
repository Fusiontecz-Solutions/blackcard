/**
 * Extract YYYY-MM-DD keys from free-text transaction descriptions (ACH returns, etc.).
 * Supports M/D/YYYY, ISO dates, and month-name forms (e.g. "MAR 29", "March 29, 2023").
 * Month+day without year uses the transaction anchor date so returns posted days later
 * still match the original credit (e.g. debit 3/31 with "ACH RETURN MAR 29" → 2023-03-29).
 */

const MONTH_TOKEN_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function normalizeTwoDigitYear(y: number): number {
  if (y >= 100) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

function resolveYearForMonthDay(month: number, day: number, anchor: Date, mode: "utc" | "local"): number {
  if (mode === "utc") {
    const ay = anchor.getUTCFullYear();
    let t = Date.UTC(ay, month - 1, day);
    if (t > anchor.getTime()) t = Date.UTC(ay - 1, month - 1, day);
    return new Date(t).getUTCFullYear();
  }
  const ay = anchor.getFullYear();
  let cand = new Date(ay, month - 1, day).getTime();
  if (cand > anchor.getTime()) cand = new Date(ay - 1, month - 1, day).getTime();
  return new Date(cand).getFullYear();
}

function addYyyyMmDd(result: Set<string>, year: number, month: number, day: number): void {
  if (month < 1 || month > 12 || day < 1 || day > 31) return;
  const mm = month < 10 ? `0${month}` : String(month);
  const dd = day < 10 ? `0${day}` : String(day);
  result.add(`${year}-${mm}-${dd}`);
}

function parseAnchor(anchor: string | Date | null | undefined, mode: "utc" | "local"): Date | null {
  if (anchor == null || anchor === "") return null;
  if (anchor instanceof Date) return Number.isNaN(anchor.getTime()) ? null : anchor;
  const s = String(anchor).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (mode === "utc") return new Date(Date.UTC(y, m - 1, d));
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Month-first: Mar 29, March 29, MAR 29, Mar. 29, 2023 / '23 */
const RE_MONTH_FIRST =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*\.?\s*(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}|\d{2}))?\b/gi;

/** Day-first: 29 MAR, 29 March 2023 */
const RE_DAY_FIRST =
  /\b(\d{1,2})(?:st|nd|rd|th)?\s*[-./]?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(\d{4}|\d{2}))?\b/gi;

function addKeysFromNamedMonthMatches(
  text: string,
  result: Set<string>,
  anchor: Date | null,
  mode: "utc" | "local",
): void {
  let m: RegExpExecArray | null;
  RE_MONTH_FIRST.lastIndex = 0;
  while ((m = RE_MONTH_FIRST.exec(text)) !== null) {
    const mon = MONTH_TOKEN_TO_NUM[m[1].toLowerCase()];
    const day = Number(m[2]);
    if (!mon || !Number.isFinite(day)) continue;
    const yRaw = m[3];
    if (yRaw) {
      const yr = normalizeTwoDigitYear(Number(yRaw));
      addYyyyMmDd(result, yr, mon, day);
    } else if (anchor) {
      const y = resolveYearForMonthDay(mon, day, anchor, mode);
      addYyyyMmDd(result, y, mon, day);
    }
  }
  RE_DAY_FIRST.lastIndex = 0;
  while ((m = RE_DAY_FIRST.exec(text)) !== null) {
    const day = Number(m[1]);
    const mon = MONTH_TOKEN_TO_NUM[m[2].toLowerCase()];
    if (!mon || !Number.isFinite(day)) continue;
    const yRaw = m[3];
    if (yRaw) {
      const yr = normalizeTwoDigitYear(Number(yRaw));
      addYyyyMmDd(result, yr, mon, day);
    } else if (anchor) {
      const y = resolveYearForMonthDay(mon, day, anchor, mode);
      addYyyyMmDd(result, y, mon, day);
    }
  }
}

export function extractDescriptionDateKeys(
  raw: unknown,
  anchorForMonthDay?: string | Date | null,
  mode: "utc" | "local" = "local",
): string[] {
  const text = String(raw ?? "");
  if (!text.trim()) return [];
  const result = new Set<string>();
  const slashMatches = text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g);
  for (const match of slashMatches) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const yearRaw = Number(match[3]);
    if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(yearRaw)) continue;
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    addYyyyMmDd(result, year, month, day);
  }
  const isoMatches = text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g);
  for (const match of isoMatches) {
    result.add(`${match[1]}-${match[2]}-${match[3]}`);
  }

  const anchor = parseAnchor(anchorForMonthDay ?? null, mode);
  addKeysFromNamedMonthMatches(text, result, anchor, mode);

  return Array.from(result);
}