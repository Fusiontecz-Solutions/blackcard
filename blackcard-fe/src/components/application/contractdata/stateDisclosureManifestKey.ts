/** Mirrors BE `resolveStateDocumentConfigKey` for coordinate DocuSign manifest keys. */
const STATE_NAME_ALIASES: Record<string, string> = {
    ca: "california",
    california: "california",
    fl: "florida",
    florida: "florida",
    mo: "missouri",
    missouri: "missouri",
    ga: "georgia",
    georgia: "georgia",
    ks: "kansas",
    kansas: "kansas",
    ut: "utah",
    utah: "utah",
    va: "virginia",
    virginia: "virginia",
    ct: "connecticut",
    connecticut: "connecticut",
    ny: "newyork",
    newyork: "newyork",
    "new york": "newyork",
    la: "louisiana",
    louisiana: "louisiana",
    tx: "texas",
    texas: "texas",
};

const STATE_DISPLAY_NAME: Record<string, string> = {
    california: "California",
    florida: "Florida",
    missouri: "Missouri",
    georgia: "Georgia",
    kansas: "Kansas",
    utah: "Utah",
    virginia: "Virginia",
    connecticut: "Connecticut",
    newyork: "NewYork",
    louisiana: "Louisiana",
    texas: "Texas",
};

export const STATE_DISCLOSURE_MANIFEST_PREFIX = "state_disclosure_";

function capitalize(word: string): string {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function normalizeStateForDisclosureLookup(state: string): string {
    return String(state ?? "")
        .trim()
        .toLowerCase();
}

/** Canonical key for BoldSignTemplate state matching (e.g. "New York" → "newyork"). */
export function normalizeBoldSignTemplateStateKey(state: unknown): string | null {
    const stateRaw = String(state ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, " ")
        .trim();
    if (!stateRaw) return null;
    const noSpace = stateRaw.replace(/\s+/g, "");
    return STATE_NAME_ALIASES[stateRaw] || STATE_NAME_ALIASES[noSpace] || noSpace;
}

export function normalizeFrequencyForDisclosureLookup(frequency: string): string {
    const f = String(frequency ?? "")
        .trim()
        .toLowerCase();
    if (f.startsWith("week")) return "weekly";
    if (f.startsWith("day")) return "daily";
    if (f.startsWith("month")) return "monthly";
    return f || "daily";
}

export function resolveStateDocumentConfigKey(
    frequency?: string | null,
    state?: string | null,
): string | null {
    const freqRaw = normalizeFrequencyForDisclosureLookup(frequency || "");
    const stateRaw = String(state ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, " ");
    if (!freqRaw || !stateRaw) return null;

    const stateKey = STATE_NAME_ALIASES[stateRaw] || stateRaw.replace(/\s+/g, "");
    const freqKey = freqRaw.startsWith("week")
        ? "weekly"
        : freqRaw.startsWith("day")
          ? "daily"
          : freqRaw;
    const stateName = STATE_DISPLAY_NAME[stateKey] || capitalize(stateKey);
    const key = `${freqKey}${stateName}`;
    const SUPPORTED_KEYS = new Set([
        "dailyCalifornia",
        "weeklyCalifornia",
        "dailyConnecticut",
        "weeklyConnecticut",
        "dailyFlorida",
        "weeklyFlorida",
        "dailyGeorgia",
        "weeklyGeorgia",
        "dailyKansas",
        "weeklyKansas",
        "dailyUtah",
        "weeklyUtah",
        "dailyVirginia",
        "weeklyVirginia",
        "dailyNewYork",
        "weeklyNewYork",
        "dailyMissouri",
        "weeklyMissouri",
        "dailyLouisiana",
        "weeklyLouisiana",
        "dailyTexas",
        "weeklyTexas",
    ]);
    return SUPPORTED_KEYS.has(key) ? key : null;
}

/** DocuSign coordinate manifest key for a state disclosure PDF (e.g. `state_disclosure_dailyFlorida`). */
export function resolveStateDisclosureManifestKey(
    frequency?: string | null,
    state?: string | null,
): string | null {
    const configKey = resolveStateDocumentConfigKey(frequency, state);
    return configKey ? `${STATE_DISCLOSURE_MANIFEST_PREFIX}${configKey}` : null;
}
