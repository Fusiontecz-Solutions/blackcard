/** Shared parsing for `/docusign/template/recipients` and legacy BoldSign shapes. */

export function firstNonEmptyString(...values: unknown[]): string {
    for (const v of values) {
        if (typeof v === "string" && v.trim().length > 0) {
            return v.trim();
        }
    }
    return "";
}

/**
 * Recipients API / Redux `templateRecipients` shapes vary: top-level `roles`,
 * `data.roles`, PascalCase, DocuSign `raw.recipients.signers`, or BoldSign `raw.roles`.
 */
export function parseBoldSignTemplateRolesFromRecipientsPayload(
    payload: unknown,
): Array<Record<string, unknown>> {
    if (!payload || typeof payload !== "object") {
        return [];
    }
    const p = payload as Record<string, unknown>;
    const data = (p.data as Record<string, unknown>) ?? p;
    const innerRaw =
        data.raw && typeof data.raw === "object"
            ? (data.raw as Record<string, unknown>)
            : null;

    const rawRecipients =
        innerRaw?.recipients && typeof innerRaw.recipients === "object"
            ? (innerRaw.recipients as Record<string, unknown>)
            : null;

    const candidates: unknown[] = [
        data.roles,
        data.Roles,
        data.Signers,
        p.roles,
        p.Roles,
        p.Signers,
        innerRaw?.roles,
        innerRaw?.Roles,
        innerRaw?.Signers,
        rawRecipients?.signers,
        rawRecipients?.Signers,
    ];

    for (const arr of candidates) {
        if (
            Array.isArray(arr) &&
            arr.length > 0 &&
            typeof arr[0] === "object" &&
            arr[0] !== null
        ) {
            return arr as Array<Record<string, unknown>>;
        }
    }
    return [];
}

export function getTemplateRoleLabel(row: Record<string, unknown>): string {
    return (
        firstNonEmptyString(
            row.roleName,
            row.RoleName,
            row.name,
            row.Name,
            row.signerRole,
            row.SignerRole,
        ) || "Role"
    );
}

export function getTemplateRoleEmailFromRow(row: Record<string, unknown>): string {
    const nestedSigner =
        row.signer && typeof row.signer === "object"
            ? (row.signer as Record<string, unknown>)
            : row.Signer && typeof row.Signer === "object"
              ? (row.Signer as Record<string, unknown>)
              : null;

    return firstNonEmptyString(
        row.signerEmail,
        row.SignerEmail,
        row.defaultSignerEmail,
        row.DefaultSignerEmail,
        row.email,
        row.Email,
        nestedSigner?.email,
        nestedSigner?.Email,
    );
}

import {
    OWNER2_NAME_SYNC_CAMEL_KEYS,
    clearParty2PrefillPartial,
} from "./contractPartyCounts";
import {
    DOCUSIGN_DEFAULT_SIGNER_ROLE,
    DOCUSIGN_PRIMARY_SIGNER_ROLE,
} from "./docusignTemplateConfig";

/** Resolve CRM role label to DocuSign signer role (defaults to platform signer role). */
export function resolveDocuSignSignerRole(role?: string | null): string {
    const trimmed = String(role ?? "").trim();
    return trimmed || DOCUSIGN_DEFAULT_SIGNER_ROLE;
}

/** Role payload for `/docusign/send-template` and sync-envelope-cc. */
export type DocuSignTemplateRolePayload = {
    roleIndex: number;
    signerName: string;
    signerOrder: number;
    signerEmail: string;
    signerRole: string;
    privateMessage?: string;
    authenticationCode?: string;
    authenticationType?: "AccessCode";
    deliveryMode?: "Email";
    signerType?: "signer";
    locale?: "EN";
};

/** CRM-only signer rows (this send) — does not modify the DocuSign template. */
export type ContractSignerOverrideRow = {
    role: string;
    name: string;
    email: string;
};

/** Persisted on `Contract.contractPrefillOverrides` (excluded from main prefill form). */
export const CONTRACT_SIGNER_OVERRIDES_KEY = "contractSignerOverrides";

export function parseContractSignerOverridesFromPrefill(
    raw: unknown,
): ContractSignerOverrideRow[] | null {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const rows = (raw as Record<string, unknown>)[CONTRACT_SIGNER_OVERRIDES_KEY];
    if (!Array.isArray(rows) || !rows.length) return null;
    const parsed = rows
        .map((row) => {
            if (!row || typeof row !== "object") return null;
            const r = row as Record<string, unknown>;
            const role = String(r.role ?? "").trim();
            const email = String(r.email ?? "").trim();
            const name = String(r.name ?? "").trim();
            if (!role || !email) return null;
            return { role, name, email };
        })
        .filter((r): r is ContractSignerOverrideRow => r != null);
    return parsed.length ? parsed : null;
}

function isOwnerLikeSignerRoleLabel(role: string): boolean {
    const r = role.toLowerCase();
    if (!r || r.includes("cc") || r.includes("carbon")) return false;
    return (
        r.includes("client") ||
        r.includes("owner") ||
        r.includes("guarantor") ||
        r.includes("signer") ||
        r.includes("merchant")
    );
}

/**
 * Keep frozen `contractSignerOverrides` names/emails aligned with live CRM parties
 * (Overview / Verify edits) without dropping manual CC rows.
 */
export function mergeLivePartiesIntoSavedSignerOverrides(
    saved: ContractSignerOverrideRow[] | null | undefined,
    parties: ContractSignerOverrideRow[] | null | undefined,
): ContractSignerOverrideRow[] | null {
    if (!saved?.length) return saved ?? null;
    if (!parties?.length) return saved;

    const claimed = new Set<number>();
    return saved.map((row) => {
        if (!isOwnerLikeSignerRoleLabel(row.role)) return row;
        const email = String(row.email || "").trim().toLowerCase();
        let partyIndex = -1;
        if (email) {
            partyIndex = parties.findIndex(
                (p, i) =>
                    !claimed.has(i) &&
                    String(p.email || "")
                        .trim()
                        .toLowerCase() === email,
            );
        }
        if (partyIndex < 0) {
            partyIndex = parties.findIndex((_, i) => !claimed.has(i));
        }
        if (partyIndex < 0) return row;
        claimed.add(partyIndex);
        const party = parties[partyIndex]!;
        const nextName = String(party.name || "").trim();
        const nextEmail = String(party.email || "").trim();
        return {
            ...row,
            name: nextName || row.name,
            email: nextEmail || row.email,
        };
    });
}

export function mergeContractPrefillWithSignerOverrides(
    baseRaw: unknown,
    signerRows: ContractSignerOverrideRow[],
): Record<string, unknown> {
    const base =
        baseRaw && typeof baseRaw === "object" && !Array.isArray(baseRaw)
            ? { ...(baseRaw as Record<string, unknown>) }
            : {};
    const withSigners = {
        ...base,
        [CONTRACT_SIGNER_OVERRIDES_KEY]: signerRows,
    };
    return applyOwner2PrefillKeysFromSignerRows(withSigners, signerRows);
}

/** Mirror owner-2 signer name into prefill override keys when saving signers. */
export function applyOwner2PrefillKeysFromSignerRows(
    record: Record<string, unknown>,
    signerRows: ContractSignerOverrideRow[],
): Record<string, unknown> {
    const out = { ...record };
    const secondRow = findSecondOwnerSignerRow(signerRows);
    const secondName = String(secondRow?.name || "").trim();
    const hasSecondSigner =
        Boolean(secondRow && String(secondRow.email || "").trim()) ||
        signerRows.filter((r) => String(r.email || "").trim()).length >= 2;

    if (!hasSecondSigner || !secondName) {
        // Drop stale Owner 2 names when Manage Signers has only one person.
        clearParty2PrefillPartial(out, 1);
        return out;
    }
    for (const key of OWNER2_NAME_SYNC_CAMEL_KEYS) {
        out[key] = secondName;
    }
    return out;
}

/** Split display name for CRM owner rows — never duplicate a single token into first+last. */
export function splitSignerDisplayName(name: string): {
    firstName: string;
    lastName: string;
} {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (parts.length === 0) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
    return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

/** Second merchant signer row from Manage Signers (Owner 2 / Guarantor 2 or 2nd distinct email). */
export function findSecondOwnerSignerRow(
    rows: ContractSignerOverrideRow[],
): ContractSignerOverrideRow | null {
    if (!rows.length) return null;
    const explicit = rows.find((r) =>
        /owner\s*2|guarantor\s*2/i.test(String(r.role || "").trim()),
    );
    if (explicit && String(explicit.email || "").trim()) return explicit;
    const primaryEmail = String(rows[0]?.email || "")
        .trim()
        .toLowerCase();
    const distinctSecond = rows.find((r, idx) => {
        if (idx === 0) return false;
        const email = String(r.email || "").trim().toLowerCase();
        return Boolean(email && email !== primaryEmail);
    });
    return distinctSecond ?? (rows.length >= 2 ? rows[1]! : null);
}

const DOCUSIGN_SIGNER_ROLE_COMMON = {
    privateMessage: "Kindly sign this article",
    authenticationCode: "1234",
    authenticationType: "AccessCode" as const,
    deliveryMode: "Email" as const,
    signerType: "signer" as const,
    locale: "EN" as const,
};

/** Build send/sync payload from Summary recipient editor rows. */
export function buildDocuSignRolesFromEditorRows(
    rows: ContractSignerOverrideRow[],
): DocuSignTemplateRolePayload[] {
    return rows
        .filter((r) => String(r.role || "").trim() && String(r.email || "").trim())
        .map((r, idx) => ({
            roleIndex: idx + 1,
            signerName: String(r.name || "").trim() || String(r.email).trim().split("@")[0],
            signerOrder: idx + 1,
            signerEmail: String(r.email).trim(),
            signerRole: String(r.role).trim(),
            ...DOCUSIGN_SIGNER_ROLE_COMMON,
        }));
}

export function contractSignerOverridesFingerprint(
    rows: ContractSignerOverrideRow[],
): string {
    return JSON.stringify(
        rows.map((r) => ({
            role: String(r.role || "").trim(),
            name: String(r.name || "").trim(),
            email: String(r.email || "").trim().toLowerCase(),
        })),
    );
}

export function getTemplateRoleNameFromRow(row: Record<string, unknown>): string {
    const nestedSigner =
        row.signer && typeof row.signer === "object"
            ? (row.signer as Record<string, unknown>)
            : row.Signer && typeof row.Signer === "object"
              ? (row.Signer as Record<string, unknown>)
              : null;

    return firstNonEmptyString(
        row.signerName,
        row.SignerName,
        row.defaultSignerName,
        row.DefaultSignerName,
        nestedSigner?.name,
        nestedSigner?.Name,
    );
}

/**
 * When a DocuSign template lists multiple signer roles, keep only the primary role
 * (e.g. "Receiver") so the envelope is not sent to duplicate signer slots.
 */
export function filterTemplateRolesToPrimarySigner(
    templateRoles: Array<Record<string, unknown>>,
    preferredRoleName: string = DOCUSIGN_PRIMARY_SIGNER_ROLE,
): Array<Record<string, unknown>> {
    if (templateRoles.length <= 1) return templateRoles;
    const preferred = String(preferredRoleName || DOCUSIGN_PRIMARY_SIGNER_ROLE).trim().toLowerCase();
    if (!preferred) return [templateRoles[0]!];
    const matched = templateRoles.filter(
        (row) => getTemplateRoleLabel(row).toLowerCase() === preferred,
    );
    if (matched.length === 1) return matched;
    return [templateRoles[0]!];
}

/** Map template recipient rows + application client email to DocuSign signer roles. */
export function buildBoldSignRolesFromTemplateRecipients(
    templateRoles: Array<Record<string, unknown>>,
    applicationSignerEmail: string,
    applicationSignerName: string,
    options?: { singleSignerOnly?: boolean; preferredRoleName?: string },
): DocuSignTemplateRolePayload[] {
    const rolesForSend =
        options?.singleSignerOnly === false
            ? templateRoles
            : filterTemplateRolesToPrimarySigner(
                  templateRoles,
                  options?.preferredRoleName,
              );
    const appEmail = applicationSignerEmail.trim();

    if (rolesForSend.length === 0) {
        if (!appEmail) {
            return [];
        }
        return [
            {
                roleIndex: 1,
                signerName: applicationSignerName,
                signerOrder: 1,
                signerEmail: appEmail,
                signerRole: DOCUSIGN_DEFAULT_SIGNER_ROLE,
                ...DOCUSIGN_SIGNER_ROLE_COMMON,
            },
        ];
    }

    return rolesForSend.map((r, idx) => {
        const row = r as Record<string, unknown>;
        const templateEmail = getTemplateRoleEmailFromRow(row);
        const signerEmail = templateEmail || (idx === 0 ? appEmail : "");
        const templatePersonName = getTemplateRoleNameFromRow(row);
        const signerName =
            templatePersonName ||
            (idx === 0 ? applicationSignerName : `Signer ${idx + 1}`);
        const roleLabel = getTemplateRoleLabel(row) || `Role ${idx + 1}`;
        const roleIndexRaw = row.roleIndex ?? row.RoleIndex;
        const roleIndex =
            typeof roleIndexRaw === "number" && Number.isFinite(roleIndexRaw)
                ? roleIndexRaw
                : idx + 1;

        return {
            roleIndex,
            signerName,
            signerOrder: idx + 1,
            signerEmail,
            signerRole: roleLabel,
            ...DOCUSIGN_SIGNER_ROLE_COMMON,
        };
    });
}

/** Resolve DocuSign roles for envelope create/send (saved overrides win over template defaults). */
export function resolveDocuSignRolesForEnvelopeSend(options: {
    payloadRoles?: DocuSignTemplateRolePayload[] | null;
    contractSignerOverrides?: ContractSignerOverrideRow[] | null;
    templateRoles: Array<Record<string, unknown>>;
    applicationSignerEmail: string;
    applicationSignerName: string;
    /** When true, include every template signer role (not only the primary). Default true. */
    multiSigner?: boolean;
}): DocuSignTemplateRolePayload[] {
    const fromPayload = (options.payloadRoles ?? []).filter((r) =>
        String(r.signerEmail || "").trim(),
    );
    if (fromPayload.length) return fromPayload;

    const fromContract = options.contractSignerOverrides?.length
        ? buildDocuSignRolesFromEditorRows(options.contractSignerOverrides)
        : [];
    if (fromContract.length) return fromContract;

    return buildBoldSignRolesFromTemplateRecipients(
        options.templateRoles,
        options.applicationSignerEmail,
        options.applicationSignerName,
        { singleSignerOnly: options.multiSigner === false },
    );
}

export type ContractPartyPerson = {
    firstName?: string;
    lastName?: string;
    email?: string;
};

function normalizeRoleKey(role: string): string {
    return String(role || "").trim().toLowerCase();
}

export function isOwnerRoleName(role: string): boolean {
    const key = normalizeRoleKey(role);
    return key === "owner" || /^owner[\s_-]*\d*$/.test(key);
}

export function isGuarantorRoleName(role: string): boolean {
    return normalizeRoleKey(role).includes("guarantor");
}

export function isClientRoleName(role: string): boolean {
    const key = normalizeRoleKey(role);
    return (
        key === "client" ||
        key.includes("merchant") ||
        key.includes("receiver") ||
        key.includes("customer")
    );
}

/** Build numbered owner/guarantor/client rows from CRM contract parties. */
export function buildContractPartySignerRows(options: {
    clientEmail?: string;
    clientName?: string;
    owners?: ContractPartyPerson[];
    guarantors?: ContractPartyPerson[];
}): ContractSignerOverrideRow[] {
    const rows: ContractSignerOverrideRow[] = [];
    const clientEmail = String(options.clientEmail || "").trim();
    const clientName = String(options.clientName || "").trim();
    if (clientEmail) {
        rows.push({
            role: "Client",
            name: clientName || clientEmail.split("@")[0],
            email: clientEmail,
        });
    }
    (options.owners || []).forEach((owner, idx) => {
        const email = String(owner.email || "").trim();
        if (!email) return;
        const name =
            `${String(owner.firstName || "").trim()} ${String(owner.lastName || "").trim()}`.trim() ||
            email.split("@")[0];
        rows.push({
            role: idx === 0 ? "Owner" : DOCUSIGN_DEFAULT_SIGNER_ROLE,
            name,
            email,
        });
    });
    (options.guarantors || []).forEach((guarantor, idx) => {
        const email = String(guarantor.email || "").trim();
        if (!email) return;
        const name =
            `${String(guarantor.firstName || "").trim()} ${String(guarantor.lastName || "").trim()}`.trim() ||
            email.split("@")[0];
        rows.push({
            role: idx === 0 ? "Guarantor" : DOCUSIGN_DEFAULT_SIGNER_ROLE,
            name,
            email,
        });
    });
    return rows;
}

/** Fill template signer slots from CRM owner/guarantor/client rows when role names match. */
export function mergeApplicationDataIntoSignerRoles(
    roles: DocuSignTemplateRolePayload[],
    appRows: ContractSignerOverrideRow[],
): DocuSignTemplateRolePayload[] {
    if (!appRows.length) return roles;

    const byExactRole = new Map<string, ContractSignerOverrideRow>();
    for (const row of appRows) {
        const key = normalizeRoleKey(row.role);
        if (key && row.email.trim() && !byExactRole.has(key)) {
            byExactRole.set(key, row);
        }
    }

    const clientRows = appRows.filter(
        (r) => isClientRoleName(r.role) && String(r.email || "").trim(),
    );
    const ownerRows = appRows.filter(
        (r) => isOwnerRoleName(r.role) && String(r.email || "").trim(),
    );
    const guarantorRows = appRows.filter(
        (r) => isGuarantorRoleName(r.role) && String(r.email || "").trim(),
    );

    let ownerIdx = 0;
    let guarantorIdx = 0;

    return roles.map((r, slotIdx) => {
        const roleLabel = String(r.signerRole || "").trim();

        if (isGuarantorRoleName(roleLabel) && guarantorRows[guarantorIdx]) {
            const match = guarantorRows[guarantorIdx++];
            return {
                ...r,
                signerEmail: match.email.trim(),
                signerName: match.name.trim() || r.signerName,
            };
        }

        if (isOwnerRoleName(roleLabel) && ownerRows[ownerIdx]) {
            const match = ownerRows[ownerIdx++];
            return {
                ...r,
                signerEmail: match.email.trim(),
                signerName: match.name.trim() || r.signerName,
            };
        }

        if (isClientRoleName(roleLabel) && clientRows[0]) {
            return {
                ...r,
                signerEmail: clientRows[0].email.trim(),
                signerName: clientRows[0].name.trim() || r.signerName,
            };
        }

        const exact = byExactRole.get(normalizeRoleKey(roleLabel));
        if (exact) {
            return {
                ...r,
                signerEmail: exact.email.trim(),
                signerName: exact.name.trim() || r.signerName,
            };
        }

        const partyBySlot = appRows[slotIdx];
        if (partyBySlot?.email.trim()) {
            return {
                ...r,
                signerEmail: partyBySlot.email.trim(),
                signerName: partyBySlot.name.trim() || r.signerName,
            };
        }

        return r;
    });
}

export type SignerEditorRow = {
    id: string;
    role: string;
    name: string;
    email: string;
};

/** Rows for the signer editor — saved overrides win, else template slots + CRM parties. */
export function buildSignerEditorRows(options: {
    savedOverrides?: ContractSignerOverrideRow[] | null;
    templateRoles: Array<Record<string, unknown>>;
    applicationSignerEmail: string;
    applicationSignerName: string;
    partyRows: ContractSignerOverrideRow[];
}): SignerEditorRow[] {
    if (options.savedOverrides?.length) {
        const synced =
            mergeLivePartiesIntoSavedSignerOverrides(
                options.savedOverrides,
                options.partyRows,
            ) ?? options.savedOverrides;
        return synced.map((row, idx) => ({
            id: String(idx + 1),
            role: row.role,
            name: row.name,
            email: row.email,
        }));
    }

    const resolved = mergeApplicationDataIntoSignerRoles(
        buildBoldSignRolesFromTemplateRecipients(
            options.templateRoles,
            options.applicationSignerEmail,
            options.applicationSignerName,
            { singleSignerOnly: false },
        ),
        options.partyRows,
    );

    if (resolved.length) {
        return resolved.map((row, idx) => ({
            id: String(idx + 1),
            role: row.signerRole,
            name: row.signerName,
            email: row.signerEmail,
        }));
    }

    if (options.partyRows.length) {
        return options.partyRows.map((row, idx) => ({
            id: String(idx + 1),
            role: row.role,
            name: row.name,
            email: row.email,
        }));
    }

    const email = String(options.applicationSignerEmail || "").trim();
    if (!email) return [{ id: "1", role: "", name: "", email: "" }];
    return [
        {
            id: "1",
            role: DOCUSIGN_DEFAULT_SIGNER_ROLE,
            name: options.applicationSignerName || email.split("@")[0],
            email,
        },
    ];
}

/** Next role for “Add signer” — first slot from template, additional slots default to Signer. */
export function suggestNextTemplateSignerRole(
    templateRoles: Array<Record<string, unknown>>,
    usedRoles: string[],
): string {
    if (usedRoles.filter((r) => String(r || "").trim()).length >= 1) {
        return DOCUSIGN_DEFAULT_SIGNER_ROLE;
    }
    const used = new Set(usedRoles.map((r) => normalizeRoleKey(r)));
    for (const row of templateRoles) {
        const label = getTemplateRoleLabel(row);
        if (label && !used.has(normalizeRoleKey(label))) return label;
    }
    return DOCUSIGN_DEFAULT_SIGNER_ROLE;
}

export function validateDocuSignSignerRoles(
    roles: DocuSignTemplateRolePayload[],
): { valid: boolean; message?: string } {
    if (!roles.length) {
        return {
            valid: false,
            message:
                "Add at least one signer with a role name and email before sending to DocuSign.",
        };
    }
    const missing = roles
        .map((r, idx) =>
            String(r.signerEmail || "").trim() ? -1 : idx,
        )
        .filter((i) => i >= 0);
    if (missing.length) {
        const labels = missing
            .map((i) => roles[i]?.signerRole || `Signer ${i + 1}`)
            .join(", ");
        return {
            valid: false,
            message: `Every DocuSign signer needs an email. Missing for: ${labels}.`,
        };
    }
    return { valid: true };
}
