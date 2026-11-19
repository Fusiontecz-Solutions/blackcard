/**
 * Central Excel → system mappings for the application bulk import.
 *
 * Type / Status values are stored as normalized uppercase text, so a value that is not listed
 * here is still imported (as-is, normalized) — the import just reports it as "unrecognized" so
 * the team can add it below. To support a new value, add it to the matching map; aliases map
 * alternate spellings onto the canonical stored value.
 */

/** Canonical application types. Key = normalized Excel text, value = stored `Application.type`. */
export const APPLICATION_TYPE_MAP: Record<string, string> = {
    MCA: 'MCA',
    REFI: 'REFI',
    REFINANCE: 'REFI',
    REVERSE: 'REVERSE',
    'REVERSE MCA': 'REVERSE',
    FLEX: 'FLEX',
};

/** Canonical application statuses. Key = normalized Excel text, value = stored `Application.status`. */
export const APPLICATION_STATUS_MAP: Record<string, string> = {
    DEFAULT: 'DEFAULT',
    DEFAULTED: 'DEFAULT',
    'PAID IN FULL': 'PAID IN FULL',
    PIF: 'PAID IN FULL',
    PAIDINFULL: 'PAID IN FULL',
    LEGAL: 'LEGAL',
};

export const APPLICATION_TYPE_REFI = 'REFI';
export const APPLICATION_TYPE_REVERSE = 'REVERSE';

/** Uppercase, collapse whitespace / underscores / hyphens to single spaces. */
export function normalizeImportToken(raw: unknown): string {
    return String(raw ?? '')
        .replace(/[​-‍﻿]/g, '')
        .replace(/[_\-\s]+/g, ' ')
        .trim()
        .toUpperCase();
}

export type ImportValueMapping = {
    /** Value to store; null when the cell is blank. */
    value: string | null;
    /** True when the value is not in the known map (stored as normalized text). */
    unrecognized: boolean;
};

function mapImportValue(raw: unknown, map: Record<string, string>): ImportValueMapping {
    const token = normalizeImportToken(raw);
    if (!token) return { value: null, unrecognized: false };
    const known = map[token] ?? map[token.replace(/\s/g, '')];
    if (known) return { value: known, unrecognized: false };
    return { value: token, unrecognized: true };
}

export function mapApplicationType(raw: unknown): ImportValueMapping {
    return mapImportValue(raw, APPLICATION_TYPE_MAP);
}

export function mapApplicationStatus(raw: unknown): ImportValueMapping {
    return mapImportValue(raw, APPLICATION_STATUS_MAP);
}
