export type FunderDealIdPrefix = 'KK' | 'KC';

export type ResolvedFunderOrganization = {
    /** Canonical stored label, e.g. `Katan II`. */
    organization: 'Katan II' | 'Katan III';
    prefix: FunderDealIdPrefix;
};

/** Compact deal id token (no spaces/dashes), uppercased. */
export function compactDealIdToken(dealIdRaw: string | null | undefined): string {
    let normalized = String(dealIdRaw ?? '')
        .trim()
        .toUpperCase();
    if (!normalized) return '';
    normalized = normalized.replace(/^['']+/g, '');
    return normalized.replace(/[\s\-_/]+/g, '');
}

/**
 * Maps contract/business funder selection to organization + deal id prefix.
 * Accepts Roman (`Katan II`) or Arabic (`Katan 2`) labels.
 */
export function resolveFunderOrganizationFromName(
    funderNameRaw: string | null | undefined,
): ResolvedFunderOrganization | null {
    const normalized = String(funderNameRaw ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    if (!normalized) return null;

    if (
        normalized === 'katan ii' ||
        normalized === 'katan 2' ||
        normalized === 'katan2'
    ) {
        return { organization: 'Katan II', prefix: 'KK' };
    }
    if (
        normalized === 'katan iii' ||
        normalized === 'katan 3' ||
        normalized === 'katan3'
    ) {
        return { organization: 'Katan III', prefix: 'KC' };
    }
    return null;
}

export function dealIdMatchesFunderPrefix(
    dealIdRaw: string | null | undefined,
    prefix: FunderDealIdPrefix,
): boolean {
    const compact = compactDealIdToken(dealIdRaw);
    return compact.startsWith(prefix);
}
