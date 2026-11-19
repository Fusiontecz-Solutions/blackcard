import { formatInTimeZone } from "date-fns-tz";

/** Default business timezone for the CRM backend. */
export const BUSINESS_TIMEZONE = "America/New_York" as const;

export const DATE_LOCALE_US = "en-US" as const;

export type DateInput = string | number | Date | null | undefined;

export function parseDateInput(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `YYYY-MM-DD` calendar day in Eastern Time. */
export function formatYmdET(value: DateInput = new Date()): string {
  const date = parseDateInput(value);
  if (!date) return "";
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Full timestamp in Eastern Time.
 * Example: `06/24/2026 03:45 PM`
 */
export function formatDateTimeET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;

  const parts = new Intl.DateTimeFormat(DATE_LOCALE_US, {
    timeZone: BUSINESS_TIMEZONE,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("month")}/${get("day")}/${get("year")} ${get("hour")}:${get("minute")} ${get("dayPeriod")}`;
}

/** Short month date in ET, e.g. `Apr 07, 2026`. */
export function formatDateET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "MMM dd, yyyy");
}

/** Normalize timestamps to `YYYY-MM-DD` in Eastern Time. */
export function normalizeApiDateToYyyyMmDdET(value: DateInput): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoPrefix) return isoPrefix[1];
    const parsed = parseDateInput(trimmed);
    return parsed ? formatYmdET(parsed) : "";
  }
  const parsed = parseDateInput(value);
  return parsed ? formatYmdET(parsed) : "";
}
