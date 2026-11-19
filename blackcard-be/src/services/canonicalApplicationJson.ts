/**
 * Fixed JSON shape for loan-application OCR / parsed data (APIs, exports, LLM post-processing).
 * Maps internal `parseBusinessData` fields → stable keys by meaning, not label spelling.
 */

import { parseBusinessData } from './parseBusinessData';

export type CanonicalApplicationJson = {
    business: {
        business_name: string;
        email: string;
        phone: string;
        website: string;
        incorporation_date: string;
        incorporation_state: string;
        entity_type: string;
        ein: string;
        monthly_revenue: string;
        address1: string;
        city: string;
        state: string;
        zip: string;
    };
    owner: {
        first_name: string;
        last_name: string;
        email: string;
        phone: string;
        dob: string;
        ssn: string;
        fico: string;
        ownership_percentage: string;
    };
    loan: {
        requested_amount: string;
    };
};

const s = (v: unknown) => (v != null && String(v).trim() ? String(v).trim() : '');

/** Map `parseBusinessData` result → canonical structure (empty strings for missing). */
export function toCanonicalApplicationJson(parsed: {
    business: Record<string, unknown>;
    owner: Record<string, unknown>;
}): CanonicalApplicationJson {
    const b = parsed.business || {};
    const o = parsed.owner || {};
    return {
        business: {
            business_name: s(b.business_name ?? b.dba_name),
            email: s(b.business_email),
            phone: s(b.phone_number),
            website: s(b.business_website),
            incorporation_date: s(b.business_incorporation_date),
            incorporation_state: s(b.business_incorporation_state ?? b.business_state),
            entity_type: s(b.business_type_of_entity),
            ein: s(b.business_ein_number),
            monthly_revenue: s(b.business_monthly_revenue),
            address1: s(b.business_address1),
            city: s(b.business_city),
            state: s(b.business_state),
            zip: s(b.business_zip_code),
        },
        owner: {
            first_name: s(o.owner_first_name),
            last_name: s(o.owner_last_name),
            email: s(o.owner_email),
            phone: s(o.owner_mobile_number),
            dob: s(o.owner_date_of_birth),
            ssn: s(o.owner_ssn),
            fico: s(o.owner_fico_score),
            ownership_percentage: s(o.owner_ownership_percentage),
        },
        loan: {
            requested_amount: s(b.business_requested_amount),
        },
    };
}

/** Full pipeline: raw OCR / pdf text → canonical JSON. */
export function parseOcrTextToCanonicalApplicationJson(ocrText: string): CanonicalApplicationJson {
    const parsed = parseBusinessData(ocrText);
    return toCanonicalApplicationJson(parsed as { business: Record<string, unknown>; owner: Record<string, unknown> });
}
