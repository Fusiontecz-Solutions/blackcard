/**
 * The CRM shows every date and time in US Eastern, wherever the user logs in
 * from. Most screens format with `toLocale*String` / `Intl.DateTimeFormat`,
 * which default to the browser's own timezone — so this makes Eastern the
 * default for all of them. A call that passes its own `timeZone` keeps it.
 * Imported first in main.tsx, before any formatting runs.
 */
import { BUSINESS_TIMEZONE } from "@/lib/dateTime";

type DateTimeOptions = Intl.DateTimeFormatOptions | undefined;

const withEastern = (options: DateTimeOptions): Intl.DateTimeFormatOptions => ({
    ...(options ?? {}),
    timeZone: options?.timeZone ?? BUSINESS_TIMEZONE,
});

/**
 * A date-only value ("2026-10-15") parses to exactly midnight UTC; shown in
 * Eastern it would fall on the previous day. Keep those on their own calendar day.
 */
const isDateOnlyValue = (date: Date): boolean =>
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0;

/**
 * A calendar date built in the browser's own timezone ("2026-07-01T00:00:00",
 * new Date(y, m, d)) is exactly local midnight; shifted to Eastern it would also
 * land on the previous day (e.g. a "July 2026" month header showing "June").
 */
const isLocalMidnight = (date: Date): boolean =>
    date.getHours() === 0 &&
    date.getMinutes() === 0 &&
    date.getSeconds() === 0 &&
    date.getMilliseconds() === 0;

const optionsFor = (date: Date, options: DateTimeOptions): Intl.DateTimeFormatOptions => {
    if (options?.timeZone || Number.isNaN(date.getTime())) return withEastern(options);
    if (isDateOnlyValue(date)) return { ...(options ?? {}), timeZone: "UTC" };
    if (isLocalMidnight(date)) return { ...(options ?? {}) };
    return withEastern(options);
};

const PATCHED = Symbol.for("crm.forceEasternTime");
const globalScope = globalThis as typeof globalThis & { [PATCHED]?: boolean };

if (!globalScope[PATCHED]) {
    globalScope[PATCHED] = true;

    const NativeDateTimeFormat = Intl.DateTimeFormat;
    function EasternDateTimeFormat(
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions,
    ): Intl.DateTimeFormat {
        return new NativeDateTimeFormat(locales, withEastern(options));
    }
    // Keep `instanceof Intl.DateTimeFormat` and supportedLocalesOf working.
    EasternDateTimeFormat.prototype = NativeDateTimeFormat.prototype;
    EasternDateTimeFormat.supportedLocalesOf = NativeDateTimeFormat.supportedLocalesOf;
    Intl.DateTimeFormat = EasternDateTimeFormat as unknown as typeof Intl.DateTimeFormat;

    const proto = Date.prototype;
    const nativeToLocaleString = proto.toLocaleString;
    const nativeToLocaleDateString = proto.toLocaleDateString;
    const nativeToLocaleTimeString = proto.toLocaleTimeString;

    proto.toLocaleString = function (this: Date, locales?: string | string[], options?: DateTimeOptions) {
        return nativeToLocaleString.call(this, locales, optionsFor(this, options));
    };
    proto.toLocaleDateString = function (this: Date, locales?: string | string[], options?: DateTimeOptions) {
        return nativeToLocaleDateString.call(this, locales, optionsFor(this, options));
    };
    proto.toLocaleTimeString = function (this: Date, locales?: string | string[], options?: DateTimeOptions) {
        return nativeToLocaleTimeString.call(this, locales, withEastern(options));
    };
}

export {};
