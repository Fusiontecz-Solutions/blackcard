/**
 * US date format utilities (MM/DD/YYYY).
 * Use these for all user-facing dates and API payloads in this project.
 */

/**
 * Format a date for US display (MM/DD/YYYY).
 * @param {string|Date} value - ISO date string (YYYY-MM-DD) or Date object
 * @returns {string} MM/DD/YYYY or "" if invalid
 */
export function formatDateUS(value) {
  if (value == null || value === "") return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  return `${month}/${day}/${year}`;
}

export function formatNumberUS(value) {
  if (value === null || value === undefined) return "";
  const num = Number(String(value).replace(/[^0-9.-]+/g, ""));
  if (isNaN(num)) return value;
  // Always show exactly two decimal places for display (cents)
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format as user types: add thousand separators, keep decimal part (e.g. "12345.6" → "12,345.6"). */
export function formatNumberUSForInput(str) {
  if (str == null) return "";
  let s = String(str).replace(/[^0-9.-]/g, "");
  const hasMinus = s.startsWith("-");
  const rest = hasMinus ? s.slice(1) : s;
  if (rest === "" || rest === ".") return (hasMinus ? "-" : "") + rest;
  const dotIdx = rest.indexOf(".");
  const intPart = dotIdx === -1 ? rest : rest.slice(0, dotIdx);
  const decPart = dotIdx === -1 ? undefined : rest.slice(dotIdx + 1);
  const formattedInt = (intPart || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (hasMinus ? "-" : "") + formattedInt + (decPart !== undefined ? "." + decPart : "");
}

/**
 * Parse US date string (MM-DD-YYYY or MM/DD/YYYY) to ISO date string (YYYY-MM-DD) for API.
 * @param {string} usDate - MM-DD-YYYY or MM/DD/YYYY
 * @returns {string} YYYY-MM-DD or "" if invalid
 */
export function parseUSDateToISO(usDate) {
  if (!usDate || typeof usDate !== "string") return "";
  const trimmed = usDate.trim();
  const match = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!match) return "";
  const [, m, d, y] = match;
  const month = parseInt(m, 10);
  const day = parseInt(d, 10);
  const year = parseInt(y, 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return "";
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Validate US date string (MM-DD-YYYY or MM/DD/YYYY).
 * @param {string} usDate
 * @returns {boolean}
 */
export function isValidUSDate(usDate) {
  return parseUSDateToISO(usDate) !== "";
}
