import {
    EXHIBIT_A_VALUE_COUNT,
    EXHIBIT_A_VALUE_FIELD_KEYS,
    type BuildContractPrefillFieldsArgs,
    type ExhibitAValueFieldKey,
} from "./Contract";

export function companiesFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs> | null | undefined,
): string[] {
    const loaded: string[] = [];
    for (const key of EXHIBIT_A_VALUE_FIELD_KEYS) {
        const v = String(prefill?.[key] ?? "").trim();
        if (v) loaded.push(v);
    }
    return loaded.length > 0 ? loaded : [""];
}

export function companiesToPrefillPayload(
    companies: readonly string[],
): Partial<BuildContractPrefillFieldsArgs> {
    const out: Partial<BuildContractPrefillFieldsArgs> = {};
    for (let i = 0; i < EXHIBIT_A_VALUE_COUNT; i++) {
        const key = EXHIBIT_A_VALUE_FIELD_KEYS[i] as ExhibitAValueFieldKey;
        out[key] = String(companies[i] ?? "").trim();
    }
    return out;
}

/** Map company name rows to indexed pairs for UI lists. */
export function mapExhibitCompanyNames(names: readonly string[]): Array<{ name: string; index: number }> {
    return names.map((name: string, index: number) => ({ name, index }));
}
