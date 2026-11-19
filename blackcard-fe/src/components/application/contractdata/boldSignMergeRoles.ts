// import type { BoldSignTemplateRole } from "@/redux/actions/boldSignActions";
// import { weeklyCaliforniaMergeRoleDummyFormFieldsForRole } from "./Weekly_California";

// /** One BoldSign merge signer row; `formFields` match v1-beta merge (camelCase, normalized server-side). */
// export type BoldSignMergeRolePayload = BoldSignTemplateRole & {
//     formFields?: Array<Record<string, unknown>>;
// };

// /** Matches common base operating-agreement merge shape; adjust ids to your BoldSign base template if needed. */
// const PRIMARY_TEMPLATE_MERGE_FORM_FIELDS: Array<Record<string, unknown>> = [
//     {
//         id: "sign",
//         name: "sign",
//         fieldType: "Signature",
//         pageNumber: 1,
//         bounds: { x: 100, y: 120, width: 100, height: 100 },
//         roleIndex: 1,
//     },
// ];

// /** Placeholder signature for a merged state template when we do not have state-specific field maps. */
// function genericSecondaryMergeFormFields(roleIndex: number): Array<Record<string, unknown>> {
//     return [
//         {
//             id: roleIndex === 2 ? "sign1" : `sign_state_${roleIndex}`,
//             name: "sign",
//             fieldType: "Signature",
//             pageNumber: 1,
//             bounds: { x: 100, y: 120, width: 100, height: 100 },
//             roleIndex,
//         },
//     ];
// }

// function secondaryMergeFormFieldsForSlot(
//     roleIndex: number,
//     contractStateKey: string,
//     disclosureFrequencyKey: string | undefined,
// ): Array<Record<string, unknown>> {
//     const weeklyCaDisclosure =
//         contractStateKey === "california" && disclosureFrequencyKey !== "daily";
//     if (weeklyCaDisclosure) {
//         return weeklyCaliforniaMergeRoleDummyFormFieldsForRole(roleIndex) as Array<
//             Record<string, unknown>
//         >;
//     }
//     return genericSecondaryMergeFormFields(roleIndex);
// }

// function normalizeSignerType(raw: string | undefined): string {
//     const t = String(raw ?? "").trim();
//     if (!t || /^signer$/i.test(t)) return "Signer";
//     return t;
// }

// /**
//  * BoldSign merge requires **one signer row per template** (`roleIndex` 1…N) with non-empty
//  * `formFields` on secondary templates when those templates assign fields to the signer.
//  *
//  * Call with the **base operating agreement** recipient list (typically a single Client role);
//  * returns `templateIds.length` roles: same signer identity, distinct `roleIndex` / `signerOrder`,
//  * and `formFields` on slots 2…N (weekly CA uses real dummy ids; other states use a generic signature).
//  */
// export function buildBoldSignMergeRolesForStateTemplateMerge(options: {
//     templateIds: string[];
//     baseRoles: BoldSignTemplateRole[];
//     contractStateKey: string;
//     disclosureFrequencyKey?: string;
// }): BoldSignMergeRolePayload[] {
//     const templateIds = options.templateIds.map((id) => String(id).trim()).filter(Boolean);
//     const t = templateIds.length;
//     const baseRoles = options.baseRoles;
//     if (t <= 1) {
//         return baseRoles as BoldSignMergeRolePayload[];
//     }

//     /** Multiple signers on the base template: let the API expand roles server-side. */
//     if (baseRoles.length !== 1) {
//         return baseRoles as BoldSignMergeRolePayload[];
//     }

//     const base = baseRoles[0];
//     const signerType = normalizeSignerType(base.signerType);

//     return Array.from({ length: t }, (_, i) => {
//         const roleIndex = i + 1;
//         const formFields =
//             i === 0
//                 ? [...PRIMARY_TEMPLATE_MERGE_FORM_FIELDS]
//                 : secondaryMergeFormFieldsForSlot(
//                       roleIndex,
//                       options.contractStateKey,
//                       options.disclosureFrequencyKey,
//                   );

//         const row: BoldSignMergeRolePayload = {
//             ...base,
//             roleIndex,
//             signerOrder: roleIndex,
//             signerType,
//             locale: base.locale ?? "EN",
//             deliveryMode: base.deliveryMode ?? "Email",
//             formFields,
//         };
//         return row;
//     });
// }


import type { BoldSignTemplateRole } from "@/redux/actions/boldSignActions";
import { weeklyCaliforniaMergeRoleDummyFormFieldsForRole } from "./Weekly_California";

/** One BoldSign merge signer row; `formFields` match v1-beta merge (camelCase, normalized server-side). */
export type BoldSignMergeRolePayload = BoldSignTemplateRole & {
    formFields?: Array<Record<string, unknown>>;
};

/**
 * The base merged template (e.g. RPA) already defines Client signature fields in BoldSign.
 * Do not send placeholder merge `formFields` for `roleIndex` 1 — duplicate Signature widgets
 * with arbitrary bounds (e.g. y ≈ 120) render as “Sign Here” on page 1 headers.
 *
 * Secondary templates still need explicit `formFields` when BoldSign expects them on merge.
 */

/** Generic fallback signature for secondary templates (lower page; y aligns with Weekly_CA scale). */
function genericSecondaryMergeFormFields(roleIndex: number): Array<Record<string, unknown>> {
    const id = roleIndex === 2 ? "sign1" : `sign_state_${roleIndex}`;
    return [
        {
            id,
            name: id,
            fieldType: "Signature",
            pageNumber: 1,
            bounds: { x: 72, y: 520, width: 220, height: 40 },
            roleIndex,
        },
    ];
}

function isWeeklyCaliforniaDisclosureTemplateName(name: string | null | undefined): boolean {
    const n = String(name || "").toLowerCase();
    return n.includes("weekly") && n.includes("california");
}

/**
 * Pick placeholder signature + text fields for each merged template after the base contract.
 * Weekly California disclosure uses real field ids from `Weekly_California.ts` only when that
 * template row is actually the weekly CA disclosure (by DB `name`). Other slots (daily CA, other
 * states, addendum) use a generic signature placeholder per role index.
 */
function secondaryMergeFormFieldsForMergedTemplate(options: {
    roleIndex: number;
    mergedTemplateId: string;
    stateTemplateRows?: Array<{ templateId: string; name?: string | null }>;
    disclosureFrequencyKey: string | undefined;
}): Array<Record<string, unknown>> {
    const { roleIndex, mergedTemplateId, stateTemplateRows, disclosureFrequencyKey } = options;
    const tid = String(mergedTemplateId || "").trim();
    const row = stateTemplateRows?.find(
        (r) => String(r.templateId || "").trim() === tid,
    );
    const weeklyCaDisclosure =
        row &&
        isWeeklyCaliforniaDisclosureTemplateName(row.name) &&
        disclosureFrequencyKey !== "daily";

    if (weeklyCaDisclosure) {
        return weeklyCaliforniaMergeRoleDummyFormFieldsForRole(roleIndex) as Array<
            Record<string, unknown>
        >;
    }

    return genericSecondaryMergeFormFields(roleIndex);
}

/** Normalize signer type */
function normalizeSignerType(raw: string | undefined): string {
    const t = String(raw ?? "").trim();
    if (!t || /^signer$/i.test(t)) return "Signer";
    return t;
}

/**
 * BoldSign merge requires **one signer only**
 * with multiple roleIndex form fields
 */
export function buildBoldSignMergeRolesForStateTemplateMerge(options: {
    templateIds: string[];
    baseRoles: BoldSignTemplateRole[];
    /** Kept for backward compatibility; slot logic uses `stateTemplateRows` + template id. */
    contractStateKey: string;
    disclosureFrequencyKey?: string;
    /** State-disclosure rows from CRM (match `templateId` to each merged template after the base). */
    stateTemplateRows?: Array<{ templateId: string; name?: string | null }>;
}): BoldSignMergeRolePayload[] {
    const templateIds = options.templateIds
        .map((id) => String(id).trim())
        .filter(Boolean);

    const templateCount = templateIds.length;

    const baseRoles = options.baseRoles;

    if (templateCount <= 1) {
        return baseRoles as BoldSignMergeRolePayload[];
    }

    /** Only single signer supported */
    if (baseRoles.length !== 1) {
        return baseRoles as BoldSignMergeRolePayload[];
    }

    const base = baseRoles[0];
    const signerType = normalizeSignerType(base.signerType);
    const secondaryIds = templateIds.slice(1);

    /** Only non-base templates: base slot uses template-defined fields in BoldSign. */
    const formFields = secondaryIds
        .map((mergedTemplateId, i) =>
            secondaryMergeFormFieldsForMergedTemplate({
                roleIndex: i + 2,
                mergedTemplateId,
                stateTemplateRows: options.stateTemplateRows,
                disclosureFrequencyKey: options.disclosureFrequencyKey,
            }),
        )
        .flat();

    /** Return single signer */
    return [
        {
            ...base,
            roleIndex: 1,
            signerOrder: 1,
            signerType,
            locale: base.locale ?? "EN",
            deliveryMode: base.deliveryMode ?? "Email",
            formFields,
        },
    ];
}
