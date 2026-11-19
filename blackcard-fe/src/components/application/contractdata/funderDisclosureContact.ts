import type { ContractPrefillField } from "./Contract";

/** Funder profile fields used on state disclosure PDFs (e.g. Connecticut). */
export type FunderDisclosureContactSource = {
    name?: string | null;
    displayName?: string | null;
    dealIdPrefix?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    addressLine1?: string | null;
    addressCity?: string | null;
    addressState?: string | null;
    addressZip?: string | null;
};

export function formatFunderDisclosureAddress(
    profile?: FunderDisclosureContactSource | null,
): string {
    if (!profile) return "";
    const street = String(profile.addressLine1 ?? "").trim();
    const city = String(profile.addressCity ?? "").trim();
    const state = String(profile.addressState ?? "").trim();
    const zip = String(profile.addressZip ?? "").trim();
    const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    return [street, cityStateZip].filter(Boolean).join(", ");
}

function upsertPrefillField(
    fields: ContractPrefillField[],
    id: string,
    label: string,
    value: string,
): void {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return;
    const existing = fields.find((f) => f.id === id);
    if (existing) {
        existing.value = trimmed;
        return;
    }
    fields.push({ id, label, value: trimmed });
}

/**
 * Stamp selected-funder contact + deal prefix onto disclosure/addendum prefill
 * (Connecticut, Texas, Flex/BT layouts that use these tab labels).
 */
export function applyFunderDisclosureContactPrefill(
    fields: ContractPrefillField[],
    profile?: FunderDisclosureContactSource | null,
    options?: { funderDisplayName?: string | null },
): ContractPrefillField[] {
    if (!profile && !options?.funderDisplayName) return fields;

    const funderName = String(
        options?.funderDisplayName ||
            profile?.displayName ||
            profile?.name ||
            "",
    ).trim();
    const address = formatFunderDisclosureAddress(profile);
    const phone = String(profile?.contactPhone ?? "").trim();
    const email = String(profile?.contactEmail ?? "").trim();
    const dealIdPrefix = String(profile?.dealIdPrefix ?? "").trim();

    upsertPrefillField(fields, "funder_name", "Funder name", funderName);
    upsertPrefillField(fields, "funder_address", "Funder address", address);
    upsertPrefillField(fields, "funder_phone", "Funder phone", phone);
    upsertPrefillField(fields, "funder_email", "Funder email", email);
    upsertPrefillField(fields, "deal_id_prefix", "Deal ID prefix", dealIdPrefix);

    return fields;
}
