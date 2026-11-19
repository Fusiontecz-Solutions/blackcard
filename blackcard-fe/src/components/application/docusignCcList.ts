/** Shared DocuSign CC list: PDF viewer reads/writes this storage key before send. */
export const BOLDSIGN_CC_LIST_STORAGE_KEY = "boldsign_cc_list";

/**
 * Cached tenant default CC from GET /integration-settings/contract-cc-defaults.
 * Null until the API resolves (or after a failed fetch — fail open with empty default).
 */
let tenantDefaultContractCcEmail: string | null = null;
/** Full resolved default CC list from the last successful API fetch (may be multiple). */
let tenantResolvedContractCcEmails: string[] = [];

/**
 * Always null as a static constant — use getTenantDefaultContractCcEmail() /
 * setTenantDefaultContractCcEmail() for the live tenant value.
 */
export const DEFAULT_CONTRACT_CC_EMAIL: string | null = null;

/**
 * @deprecated Prefer getTenantDefaultContractCcEmail(). Kept for settings UI labels;
 * updated whenever the tenant API cache is set.
 */
export let DOCUSIGN_DEFAULT_CC_EMAIL: string | null = null;

export function setTenantDefaultContractCcEmail(
    email: string | null | undefined,
    allEmails?: string[] | null,
): void {
    const fromList = (allEmails ?? [])
        .map((e) => String(e ?? "").trim())
        .filter(Boolean);
    const fromSingle = parseFunderDefaultCcEmails(email);
    const emails = fromList.length ? [...new Set(fromList)] : fromSingle;
    tenantResolvedContractCcEmails = emails;
    tenantDefaultContractCcEmail = emails[0] ?? null;
    DOCUSIGN_DEFAULT_CC_EMAIL = tenantDefaultContractCcEmail;
}

export function getTenantDefaultContractCcEmail(): string | null {
    return tenantDefaultContractCcEmail;
}

export function getTenantResolvedContractCcEmails(): string[] {
    return [...tenantResolvedContractCcEmails];
}

export function normalizeCcEmailToken(email: string): string {
    return email.trim().toLowerCase();
}

export function parseFunderDefaultCcEmails(value?: string | null): string[] {
    return [
        ...new Set(
            String(value ?? "")
                .split(/[,;\n]+/)
                .map((part) => part.trim())
                .filter(Boolean),
        ),
    ];
}

export function isDefaultCcEmail(email: string): boolean {
    const token = normalizeCcEmailToken(email);
    if (!token) return false;
    if (
        tenantResolvedContractCcEmails.some(
            (reserved) => normalizeCcEmailToken(reserved) === token,
        )
    ) {
        return true;
    }
    if (
        tenantDefaultContractCcEmail &&
        normalizeCcEmailToken(tenantDefaultContractCcEmail) === token
    ) {
        return true;
    }
    return false;
}

export const isDefaultContractCcEmail = isDefaultCcEmail;

/** Known reserved defaults: tenant API cache + every funder-profile default CC. */
export function collectKnownFunderDefaultCcEmails(
    funderDefaultCcValues: Array<string | null | undefined> = [],
): Set<string> {
    const out = new Set<string>();
    for (const email of tenantResolvedContractCcEmails) {
        out.add(normalizeCcEmailToken(email));
    }
    if (tenantDefaultContractCcEmail) {
        out.add(normalizeCcEmailToken(tenantDefaultContractCcEmail));
    }
    for (const value of funderDefaultCcValues) {
        for (const email of parseFunderDefaultCcEmails(value)) {
            out.add(normalizeCcEmailToken(email));
        }
    }
    return out;
}

export type ContractCcMergeOptions = {
    /** Funder-profile override (comma-separated allowed). Replaces tenant default when set. */
    funderDefaultCcEmail?: string | null;
    /** Explicit tenant default override (usually from API cache). */
    tenantDefaultCcEmail?: string | null;
    /** When set, also treat other funders' default CCs as reserved (not user-added). */
    knownFunderDefaultCcEmails?: Iterable<string>;
};

export function contractCcFunderKey(
    funderProfileId?: string | null,
    funderName?: string | null,
): string {
    return `${String(funderProfileId || "").trim()}::${String(funderName || "").trim()}`;
}

/**
 * Build CC merge options for the currently selected funder.
 * Prefer the profile's default CC immediately; only apply API-resolved CCs when
 * they were fetched for this same funder (avoids stale Woodmere/tenant chips).
 */
export function buildContractCcMergeOptions(args: {
    selectedFunderDefaultCcEmail?: string | null;
    selectedFunderKey?: string | null;
    apiDefaults?: {
        defaultCcEmail?: string | null;
        resolvedCcEmail?: string | null;
        ccEmails?: string[] | null;
    } | null;
    apiFunderKey?: string | null;
    funderDefaultCcValues?: Array<string | null | undefined>;
}): ContractCcMergeOptions {
    const selectedFunderKey = String(args.selectedFunderKey || "").trim();
    const apiFunderKey = String(args.apiFunderKey || "").trim();
    const apiIsForSelectedFunder =
        Boolean(selectedFunderKey) &&
        Boolean(apiFunderKey) &&
        selectedFunderKey === apiFunderKey;
    const apiResolved = apiIsForSelectedFunder
        ? args.apiDefaults?.ccEmails?.length
            ? args.apiDefaults.ccEmails.join(", ")
            : args.apiDefaults?.resolvedCcEmail ?? null
        : null;
    return {
        funderDefaultCcEmail:
            String(args.selectedFunderDefaultCcEmail || "").trim() || apiResolved,
        tenantDefaultCcEmail:
            args.apiDefaults?.defaultCcEmail ?? getTenantDefaultContractCcEmail(),
        knownFunderDefaultCcEmails: collectKnownFunderDefaultCcEmails(
            args.funderDefaultCcValues,
        ),
    };
}

/** True when the visible default CC chips come from the selected funder, not tenant. */
export function contractDefaultCcIsFunderOverride(
    options?: ContractCcMergeOptions,
): boolean {
    const funderCcs = parseFunderDefaultCcEmails(options?.funderDefaultCcEmail);
    if (!funderCcs.length) return false;
    const tenantCcs = parseFunderDefaultCcEmails(options?.tenantDefaultCcEmail);
    if (!tenantCcs.length) return true;
    const tenantSet = new Set(tenantCcs.map(normalizeCcEmailToken));
    return funderCcs.some((e) => !tenantSet.has(normalizeCcEmailToken(e)));
}

/** Funder profile CC replaces tenant default; otherwise tenant API cache is used. */
export function resolveContractDefaultCcEmails(
    options?: ContractCcMergeOptions,
): string[] {
    const funderCcs = parseFunderDefaultCcEmails(options?.funderDefaultCcEmail);
    if (funderCcs.length) return funderCcs;

    const fromOpt = parseFunderDefaultCcEmails(options?.tenantDefaultCcEmail);
    if (fromOpt.length) return fromOpt;

    if (tenantResolvedContractCcEmails.length) {
        return [...tenantResolvedContractCcEmails];
    }
    if (tenantDefaultContractCcEmail) {
        return [tenantDefaultContractCcEmail];
    }
    return [];
}

export function isReservedContractCcEmail(
    email: string,
    options?: ContractCcMergeOptions,
): boolean {
    const token = normalizeCcEmailToken(email);
    if (!token) return false;
    if (
        resolveContractDefaultCcEmails(options).some(
            (reserved) => normalizeCcEmailToken(reserved) === token,
        )
    ) {
        return true;
    }
    if (!options?.knownFunderDefaultCcEmails) return false;
    for (const known of options.knownFunderDefaultCcEmails) {
        if (normalizeCcEmailToken(known) === token) return true;
    }
    return false;
}

/** Default CC (tenant API / funder override), then user-added addresses (deduped). */
export function mergeWithDefaultCcEmails(
    emails: string[],
    options?: ContractCcMergeOptions,
): string[] {
    const out = new Set<string>(resolveContractDefaultCcEmails(options));
    for (const e of emails) {
        const trimmed = e.trim();
        if (trimmed && !isReservedContractCcEmail(trimmed, options)) {
            out.add(trimmed);
        }
    }
    return [...out];
}

export const mergeContractCcEmailList = mergeWithDefaultCcEmails;

/**
 * Returns saved CC emails only (excludes default CC — merged at send time).
 * Also drops other funders' default CCs so switching funders does not keep their CC.
 */
export function loadBoldSignCcEmailList(
    options?: ContractCcMergeOptions,
): string[] {
    if (typeof window === "undefined") {
        return [];
    }
    const raw = localStorage.getItem(BOLDSIGN_CC_LIST_STORAGE_KEY);
    if (!raw) {
        return [];
    }
    try {
        const saved = JSON.parse(raw) as unknown;
        if (!Array.isArray(saved)) {
            return [];
        }
        const out = new Set<string>();
        for (const e of saved) {
            if (
                typeof e === "string" &&
                e.trim() !== "" &&
                !isReservedContractCcEmail(e, options)
            ) {
                out.add(e.trim());
            }
        }
        return [...out];
    } catch {
        return [];
    }
}

export const loadContractCcEmailList = loadBoldSignCcEmailList;

export function saveBoldSignCcEmailList(
    emails: string[],
    options?: ContractCcMergeOptions,
): void {
    if (typeof window === "undefined") {
        return;
    }
    const unique = [
        ...new Set(
            emails
                .map((e) => e.trim())
                .filter(Boolean)
                .filter((e) => !isReservedContractCcEmail(e, options)),
        ),
    ];
    localStorage.setItem(BOLDSIGN_CC_LIST_STORAGE_KEY, JSON.stringify(unique));
}

/** User-added contract CC emails — stored on `Contract.contractPrefillOverrides`. */
export const CONTRACT_CC_EMAILS_PREFILL_KEY = "contractCcEmails";

export function parseContractCcEmailsFromPrefill(raw: unknown): string[] {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return [];
    const list = (raw as Record<string, unknown>)[CONTRACT_CC_EMAILS_PREFILL_KEY];
    if (!Array.isArray(list)) return [];
    const out: string[] = [];
    for (const entry of list) {
        if (typeof entry === "string" && entry.trim()) {
            out.push(entry.trim());
        }
    }
    return [...new Set(out.map((e) => e.toLowerCase()))].map(
        (lower) => out.find((e) => e.toLowerCase() === lower) || lower,
    );
}

export function mergeContractPrefillWithCcEmails(
    baseRaw: unknown,
    userEmails: string[],
): Record<string, unknown> {
    const base =
        baseRaw != null && typeof baseRaw === "object" && !Array.isArray(baseRaw)
            ? { ...(baseRaw as Record<string, unknown>) }
            : {};
    const normalized = [
        ...new Set(
            userEmails
                .map((e) => String(e ?? "").trim())
                .filter(Boolean)
                .filter((e) => !isDefaultCcEmail(e)),
        ),
    ];
    if (!normalized.length) {
        const next = { ...base };
        delete next[CONTRACT_CC_EMAILS_PREFILL_KEY];
        return next;
    }
    return {
        ...base,
        [CONTRACT_CC_EMAILS_PREFILL_KEY]: normalized,
    };
}
