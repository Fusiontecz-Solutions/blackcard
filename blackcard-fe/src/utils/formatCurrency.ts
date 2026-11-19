/** US English for all CRM money display (stable regardless of browser locale). */
export const MONEY_LOCALE_US = "en-US" as const

const usdCompactFormatter = new Intl.NumberFormat(MONEY_LOCALE_US, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
})

const usdFormatter = new Intl.NumberFormat(MONEY_LOCALE_US, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Parse monetary scalars coming from APIs (string, number, or Prisma-style Decimal leftovers). */
export function parseMoneyInput(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }
  if (typeof value === "string") {
    const s = value.replace(/[$,\s]/g, "").trim()
    if (s === "") return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  if (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { toFixed?: (p?: number) => string }).toFixed === "function"
  ) {
    const s = String((value as { toFixed: (p?: number) => string }).toFixed(20)).trim()
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export type FormatUSDShortOptions = {
  fallback?: string
}

export type FormatUSDOptions = {
  fallback?: string
}

/**
 * Standard USD for professional display (e.g. $12,345.67).
 */
export function formatUSD(
  value: unknown,
  options?: FormatUSDOptions,
): string {
  const fallback =
    options?.fallback !== undefined ? options.fallback : "$0.00"
  const n = parseMoneyInput(value)
  if (n === null) return fallback
  return usdFormatter.format(n)
}

/**
 * Compact USD for dashboards and tables (e.g. $1K, $35K, $1.5M).
 */
export function formatUSDShort(
  value: unknown,
  options?: FormatUSDShortOptions,
): string {
  const fallback =
    options?.fallback !== undefined ? options.fallback : "$0"
  const n = parseMoneyInput(value)
  if (n === null) return fallback
  if (n === 0) return "$0"
  return usdCompactFormatter.format(n)
}
