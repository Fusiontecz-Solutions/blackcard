import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { formatUSD } from "@/utils/formatCurrency"
import {
  formatDateMonthDayYearET,
  formatDateShortMonthET,
  formatDateTimeET,
  formatTimeET,
  isTodayET,
  isYesterdayET,
  normalizeApiDateToYyyyMmDdET,
  type DateInput,
} from "@/lib/dateTime"

export { formatUSD, formatUSDShort, MONEY_LOCALE_US } from "@/utils/formatCurrency"
export {
  BUSINESS_TIMEZONE,
  DATE_LOCALE_US,
  type DateInput,
  nowInET,
  formatYmdET,
  formatDateET,
  formatDateShortMonthET,
  formatDateMonthDayYearET,
  formatDateTimeET,
  formatTimeET,
  formatMonthShortET,
  formatMonthDayET,
  isSameCalendarDayET,
  isTodayET,
  isYesterdayET,
  normalizeApiDateToYyyyMmDdET,
  getCurrentMonthDateRangeET,
  getPreviousMonthDateRangeET,
  getMonthRangeET,
  etDayToUtcBounds,
  createETDateTimeFormatter,
  parseDateInput,
  formatDayET,
  formatYearMonthET,
  getWeekRangeET,
  isWithinYmdRangeET,
  getRecentMonthShortLabelsET,
  getPeriodStartET,
} from "@/lib/dateTime"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------- Date / time formatting helpers (Eastern Time) ----------

/**
 * Normalize API/store dates to YYYY-MM-DD in Eastern Time.
 * Plain YYYY-MM-DD strings are treated as calendar days (no shift).
 */
export function normalizeApiDateToYyyyMmDd(value: DateInput): string {
  return normalizeApiDateToYyyyMmDdET(value)
}

/** Format a date-like value as "Apr 07, 2026" in Eastern Time. */
export function formatDate(value: DateInput, fallback = ""): string {
  return formatDateShortMonthET(value, fallback)
}

/** US numeric calendar date in ET, e.g. "5/10/2023". */
export function formatDateMonthDayYear(value: DateInput, fallback = ""): string {
  return formatDateMonthDayYearET(value, fallback)
}

/** Date and time in Eastern Time, e.g. "06/24/2026 03:45 PM EDT". */
export function formatDateTimeUS(value: DateInput, fallback = ""): string {
  return formatDateTimeET(value, fallback)
}

/** Format lastSeenAt as "Last seen X ago" (e.g. "Last seen 5m ago", "Last seen yesterday") */
export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Last seen"
  const date = new Date(lastSeenAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)
  if (diffMins < 1) return "Last seen just now"
  if (diffMins < 60) return `Last seen ${diffMins}m ago`
  if (diffHours < 24) return `Last seen ${diffHours}h ago`
  if (isYesterdayET(date)) return "Last seen yesterday"
  if (diffDays < 7) return `Last seen ${diffDays}d ago`
  return `Last seen ${formatDate(date)}`
}

/** Exact date/time in ET (e.g. "Jun 24, 2026, 3:45 PM EDT") - for tooltip or "Last seen at ..." */
export function formatLastSeenExact(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return ""
  return formatDateTimeET(lastSeenAt, "")
}

/** Display text for last seen in ET (e.g. "Last seen today at 3:45 PM EDT") */
export function formatLastSeenWithTime(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Last seen"
  const date = new Date(lastSeenAt)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "Last seen just now"
  const timeStr = formatTimeET(date)
  if (isTodayET(date)) return `Last seen today at ${timeStr}`
  if (isYesterdayET(date)) return `Last seen yesterday at ${timeStr}`
  const dateStr = formatDate(date)
  return `Last seen ${dateStr} at ${timeStr}`
}

// ---------- Numeric formatting helpers ----------
// Single source of truth for how numbers are rounded and displayed.

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  const num = typeof value === "string" ? Number(value) : (value as number)
  return Number.isFinite(num) ? num : null
}

/** Round any value to an integer using Math.round. Returns null for invalid input. */
export function roundToInt(value: unknown): number | null {
  const num = toNumberOrNull(value)
  if (num === null) return null
  return Math.round(num)
}

type FormatIntOptions = {
  locale?: string
  useGrouping?: boolean
  fallback?: string
}

/** Format a value as an integer string (no decimals). */
export function formatInt(
  value: unknown,
  options: FormatIntOptions = {},
): string {
  const { locale = "en-US", useGrouping = true, fallback = "" } = options
  const rounded = roundToInt(value)
  if (rounded === null) return fallback

  return rounded.toLocaleString(locale, {
    useGrouping,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
}

type FormatCurrencyIntOptions = {
  locale?: string
  currency?: string
  fallback?: string
}

/** Format a value as a currency string with no decimals (whole units only). */
export function formatCurrencyInt(
  value: unknown,
  options: FormatCurrencyIntOptions = {},
): string {
  const { locale = "en-US", currency = "USD", fallback = "" } = options
  const rounded = roundToInt(value)
  if (rounded === null) return fallback

  return rounded.toLocaleString(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  })
}

/**
 * Generic number formatting helper for UI display.
 * Uses the International Number System with comma grouping and no decimals.
 * Use for counts and other non-money integers.
 *
 * Examples:
 * - 1000 -> "1,000"
 * - 1000000 -> "1,000,000"
 */
export function formatNumber(value: unknown, fallback = ""): string {
  return formatInt(value, { fallback })
}

/** Strip non-numeric characters for parsing (digits, optional leading minus, one decimal point). */
export function sanitizeDecimalStringForParse(raw: string): string {
  let s = String(raw).replace(/[^0-9.-]+/g, "")
  const neg = s.startsWith("-")
  if (neg) s = s.slice(1)
  s = s.replace(/-/g, "")
  const parts = s.split(".")
  if (parts.length > 1) {
    s = parts[0] + "." + parts.slice(1).join("")
  } else {
    s = parts[0] ?? ""
  }
  return (neg ? "-" : "") + s
}

/** Parse a display/user string into a finite number, or NaN. */
export function parseNumberUS(value: unknown): number {
  if (value === null || value === undefined) return NaN
  if (typeof value === "string" && value.trim() === "") return NaN
  const s = sanitizeDecimalStringForParse(String(value)).replace(/,/g, "").trim()
  if (s === "" || s === "-" || s === "+" || s === ".") return NaN
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

/**
 * US English number for read-only display: comma thousands, period decimal, always two fraction digits.
 */
export function formatNumberUS(value: unknown): string {
  if (value === null || value === undefined) return ""
  const num = parseNumberUS(value)
  if (Number.isNaN(num)) {
    if (typeof value === "string" && value.trim() !== "") return value
    return ""
  }
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Factor/sell rate — keeps real precision (e.g. 1.499), not forced to two decimals.
 */
export function formatRateUS(value: unknown): string {
  if (value === null || value === undefined) return ""
  const num = parseNumberUS(value)
  if (Number.isNaN(num)) {
    if (typeof value === "string" && value.trim() !== "") return value.trim()
    return ""
  }
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })
}

/** Normalize rate on blur without rounding to two decimal places. */
export function formatRateUSCommit(raw: string): string {
  const num = parseNumberUS(raw)
  if (!Number.isFinite(num)) return ""
  return formatRateUS(num)
}

/**
 * Live numeric input: thousand separators on the integer part only; keep fractional digits as typed.
 */
export function formatNumberUSForInput(str: string): string {
  let s = String(str).replace(/[^0-9.-]/g, "")
  const neg = s.startsWith("-")
  if (neg) s = s.slice(1)
  s = s.replace(/-/g, "")
  const dot = s.indexOf(".")
  const intRaw = (dot === -1 ? s : s.slice(0, dot)).replace(/\D/g, "")
  const fracRaw = dot === -1 ? undefined : s.slice(dot + 1).replace(/\D/g, "")
  const hasDot = dot !== -1

  let intFormatted = ""
  if (intRaw !== "") {
    intFormatted = Number(intRaw).toLocaleString("en-US", {
      useGrouping: true,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
  } else if (hasDot) {
    intFormatted = "0"
  }

  let body = intFormatted
  if (hasDot) {
    body += "." + (fracRaw ?? "")
  }

  if (!neg) return body
  if (body === "" && !hasDot) return "-"
  return `-${body}`
}

/** Percent for display using two fraction digits (e.g. 12.50%). */
export function formatPercentUS(value: unknown): string {
  const s = formatNumberUS(value)
  return s === "" ? "" : `${s}%`
}

/**
 * Full-precision currency for forms and contracts (e.g. "$ 12,345.67").
 */
export function formatCurrencyFull(
  value: unknown,
  options: { fallback?: string } = {},
): string {
  const { fallback = "" } = options
  if (value === null || value === undefined || value === "") return fallback
  const num = typeof value === "number" ? value : parseNumberUS(value)
  if (Number.isNaN(num)) return fallback
  return `$ ${formatNumberUS(num)}`
}

/**
 * Standard USD currency (no compact K/M notation).
 */
export function formatCurrency(
  value: unknown,
  options: { fallback?: string } = {},
): string {
  return formatUSD(value, options)
}

