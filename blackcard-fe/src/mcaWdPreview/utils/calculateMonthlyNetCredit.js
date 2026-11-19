/**
 * Minimal month-label helpers used by WD preview charts / leverage.
 * Ported from MCA-tool calculateMonthlyNetCredit (subset).
 */

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

export function getMonthStartEnd(yyyyMm) {
  if (!yyyyMm || typeof yyyyMm !== "string") return null;
  const match = yyyyMm.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  return {
    monthStart: new Date(y, m - 1, 1),
    monthEnd: new Date(y, m, 0),
  };
}

export function parseMonthLabelToYYYYMM(monthLabel, refDate = new Date()) {
  if (!monthLabel || typeof monthLabel !== "string") return "";
  const trimmed = String(monthLabel).trim().toLowerCase();
  let monthIndex = -1;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (
      trimmed.startsWith(MONTH_NAMES[i]) ||
      MONTH_NAMES[i].startsWith(trimmed.slice(0, 3))
    ) {
      monthIndex = i;
      break;
    }
  }
  if (monthIndex === -1) return "";

  const monthNum = String(monthIndex + 1).padStart(2, "0");
  const yearMatch = trimmed.match(/\b(20\d{2}|19\d{2})\b/);
  if (yearMatch) return `${yearMatch[1]}-${monthNum}`;
  return `${refDate.getFullYear()}-${monthNum}`;
}
