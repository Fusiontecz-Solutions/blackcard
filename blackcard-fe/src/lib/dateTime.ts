import {
  addMonths,
  endOfDay,
  endOfMonth,
  startOfMonth,
  startOfWeek,
  endOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

/** Default business timezone for the CRM (US Eastern, DST-aware). */
export const BUSINESS_TIMEZONE = "America/New_York" as const;

/** US English locale for all CRM-facing dates and times. */
export const DATE_LOCALE_US = "en-US" as const;

export type DateInput = string | number | Date | null | undefined;

/** Parse API / UI date input to a valid `Date`, or `null`. */
export function parseDateInput(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Current instant as a zoned ET `Date` (for calendar math in Eastern Time). */
export function nowInET(): Date {
  return toZonedTime(new Date(), BUSINESS_TIMEZONE);
}

/** `YYYY-MM-DD` calendar day in Eastern Time. */
export function formatYmdET(value: DateInput = new Date()): string {
  const date = parseDateInput(value);
  if (!date) return "";
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "yyyy-MM-dd");
}

/** `MM/DD/YYYY` in Eastern Time. */
export function formatDateET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "MM/dd/yyyy");
}

/** Short month label in ET, e.g. `Apr 07, 2026`. */
export function formatDateShortMonthET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "MMM dd, yyyy");
}

/** US numeric calendar date in ET, e.g. `4/7/2026`. */
export function formatDateMonthDayYearET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "M/d/yyyy");
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

/** Time only in ET, e.g. `3:45 PM`. */
export function formatTimeET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "h:mm a");
}

/** Month label in ET, e.g. `Jun`. */
export function formatMonthShortET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "MMM");
}

/** Month + day in ET, e.g. `Jun 24`. */
export function formatMonthDayET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "MMM d");
}

export function isSameCalendarDayET(a: DateInput, b: DateInput): boolean {
  const da = parseDateInput(a);
  const db = parseDateInput(b);
  if (!da || !db) return false;
  return formatYmdET(da) === formatYmdET(db);
}

export function isTodayET(value: DateInput): boolean {
  return isSameCalendarDayET(value, new Date());
}

export function isYesterdayET(value: DateInput): boolean {
  const zonedNow = nowInET();
  const yesterday = subDays(zonedNow, 1);
  const date = parseDateInput(value);
  if (!date) return false;
  return formatYmdET(date) === formatInTimeZone(yesterday, BUSINESS_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Normalize API/store dates to `YYYY-MM-DD` in Eastern Time.
 * Plain `YYYY-MM-DD` strings are treated as calendar days (no shift).
 */
export function normalizeApiDateToYyyyMmDdET(value: DateInput): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const isoPrefix = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoPrefix) return isoPrefix[1];
    const us = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (us) {
      const month = parseInt(us[1], 10);
      const day = parseInt(us[2], 10);
      const year = parseInt(us[3], 10);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
    }
    const parsed = parseDateInput(trimmed);
    return parsed ? formatYmdET(parsed) : "";
  }
  const parsed = parseDateInput(value);
  return parsed ? formatYmdET(parsed) : "";
}

/** Start/end of the current calendar month in ET as `YYYY-MM-DD`. */
export function getCurrentMonthDateRangeET(): {
  start: string;
  end: string;
  startDateObj: Date;
  endDateObj: Date;
} {
  const zonedNow = nowInET();
  const monthStart = startOfMonth(zonedNow);
  const monthEnd = endOfMonth(zonedNow);
  return {
    start: formatInTimeZone(monthStart, BUSINESS_TIMEZONE, "yyyy-MM-dd"),
    end: formatInTimeZone(monthEnd, BUSINESS_TIMEZONE, "yyyy-MM-dd"),
    startDateObj: fromZonedTime(monthStart, BUSINESS_TIMEZONE),
    endDateObj: fromZonedTime(endOfDay(monthEnd), BUSINESS_TIMEZONE),
  };
}

/** Previous calendar month in ET as `YYYY-MM-DD` bounds. */
export function getPreviousMonthDateRangeET(referenceYmd?: string): {
  start: string;
  end: string;
  startDateObj: Date;
  endDateObj: Date;
} | null {
  const base =
    referenceYmd && /^\d{4}-\d{2}-\d{2}$/.test(referenceYmd)
      ? toZonedTime(fromZonedTime(`${referenceYmd}T12:00:00`, BUSINESS_TIMEZONE), BUSINESS_TIMEZONE)
      : nowInET();
  const prevMonth = subMonths(startOfMonth(base), 1);
  const monthStart = startOfMonth(prevMonth);
  const monthEnd = endOfMonth(prevMonth);
  return {
    start: formatInTimeZone(monthStart, BUSINESS_TIMEZONE, "yyyy-MM-dd"),
    end: formatInTimeZone(monthEnd, BUSINESS_TIMEZONE, "yyyy-MM-dd"),
    startDateObj: fromZonedTime(monthStart, BUSINESS_TIMEZONE),
    endDateObj: fromZonedTime(endOfDay(monthEnd), BUSINESS_TIMEZONE),
  };
}

/** Rolling N-month window ending at the current ET month (inclusive). */
export function getMonthRangeET(monthsBack: number): { start: Date; end: Date } {
  const zonedNow = nowInET();
  const end = endOfMonth(zonedNow);
  const start = startOfMonth(subMonths(zonedNow, monthsBack));
  return {
    start: fromZonedTime(start, BUSINESS_TIMEZONE),
    end: fromZonedTime(endOfDay(end), BUSINESS_TIMEZONE),
  };
}

/** UTC `Date` bounds for an ET calendar day (`YYYY-MM-DD`). */
export function etDayToUtcBounds(ymd: string): { start: Date; end: Date } {
  const start = fromZonedTime(`${ymd}T00:00:00`, BUSINESS_TIMEZONE);
  const end = fromZonedTime(`${ymd}T23:59:59.999`, BUSINESS_TIMEZONE);
  return { start, end };
}

/** Day of month in ET (no leading zero), e.g. `24`. */
export function formatDayET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "d");
}

/** `YYYY-MM` month key in Eastern Time. */
export function formatYearMonthET(value: DateInput, fallback = ""): string {
  const date = parseDateInput(value);
  if (!date) return fallback;
  return formatInTimeZone(date, BUSINESS_TIMEZONE, "yyyy-MM");
}

/** Sunday-start week range for a timestamp, in Eastern Time. */
export function getWeekRangeET(value: DateInput): {
  startYmd: string;
  endYmd: string;
  label: string;
} | null {
  const date = parseDateInput(value);
  if (!date) return null;
  const zoned = toZonedTime(date, BUSINESS_TIMEZONE);
  const weekStart = startOfWeek(zoned, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(zoned, { weekStartsOn: 0 });
  const startYmd = formatInTimeZone(weekStart, BUSINESS_TIMEZONE, "yyyy-MM-dd");
  const endYmd = formatInTimeZone(weekEnd, BUSINESS_TIMEZONE, "yyyy-MM-dd");
  const label = `${formatMonthDayET(fromZonedTime(weekStart, BUSINESS_TIMEZONE))} - ${formatMonthDayET(fromZonedTime(weekEnd, BUSINESS_TIMEZONE))}`;
  return { startYmd, endYmd, label };
}

/** Inclusive ET calendar-day filter for UTC instants. */
export function isWithinYmdRangeET(
  value: DateInput,
  startYmd?: string | null,
  endYmd?: string | null,
): boolean {
  const date = parseDateInput(value);
  if (!date) return false;
  if (!startYmd && !endYmd) return true;
  const time = date.getTime();
  if (startYmd) {
    const { start } = etDayToUtcBounds(startYmd);
    if (time < start.getTime()) return false;
  }
  if (endYmd) {
    const { end } = etDayToUtcBounds(endYmd);
    if (time > end.getTime()) return false;
  }
  return true;
}

/** Start of week/month/year in ET as a UTC instant. */
export function getPeriodStartET(
  view: "weekly" | "monthly" | "yearly",
  reference: Date = new Date(),
): Date {
  const zoned = toZonedTime(reference, BUSINESS_TIMEZONE);
  if (view === "weekly") {
    return fromZonedTime(startOfWeek(zoned, { weekStartsOn: 0 }), BUSINESS_TIMEZONE);
  }
  if (view === "monthly") {
    return fromZonedTime(startOfMonth(zoned), BUSINESS_TIMEZONE);
  }
  return fromZonedTime(startOfYear(zoned), BUSINESS_TIMEZONE);
}

/** Recent month short labels in ET, ending at the current ET month. */
export function getRecentMonthShortLabelsET(count: number): string[] {
  const zonedNow = nowInET();
  const anchor = startOfMonth(zonedNow);
  return Array.from({ length: count }, (_, i) =>
    formatInTimeZone(addMonths(anchor, i - (count - 1)), BUSINESS_TIMEZONE, "MMM"),
  );
}

/** `Intl.DateTimeFormat` preconfigured for Eastern Time display. */
export function createETDateTimeFormatter(
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(DATE_LOCALE_US, {
    timeZone: BUSINESS_TIMEZONE,
    ...options,
  });
}
