import type { FunderProfile } from "@/types/integrationSettingsTypes";
import {
    boldSignTemplateIsPreviewable,
    getAddendumDropdownRef,
    type BoldSignTemplateRow,
} from "./boldSignTemplateDocument";
import { isAchAuthorizationLayoutKey } from "./platformDocumentConfig";

const ACH_STANDALONE_LAYOUT_KEY = "ach_authorization_standalone";
const ACH_TEXAS_LAYOUT_KEY = "ach_authorization_texas";

export type AchCoordinateLayoutChoice = "woodmere" | "texas";

export type AchTemplateLike = Pick<
    BoldSignTemplateRow,
    "id" | "layoutKey" | "templateId" | "type" | "name" | "pdfUrl" | "pdf_url"
>;

export function achLayoutKeyForCoordinateChoice(choice: AchCoordinateLayoutChoice): string {
    return choice === "texas" ? ACH_TEXAS_LAYOUT_KEY : ACH_STANDALONE_LAYOUT_KEY;
}

function toPreviewableTemplate(template: AchTemplateLike) {
    return {
        id: template.id == null ? undefined : String(template.id),
        layoutKey: template.layoutKey == null ? undefined : String(template.layoutKey),
        templateId: template.templateId == null ? undefined : String(template.templateId),
        type: template.type == null ? undefined : String(template.type),
        pdfUrl: template.pdfUrl == null ? undefined : String(template.pdfUrl),
        pdf_url: template.pdf_url == null ? undefined : String(template.pdf_url),
    };
}

/** Resolve ACH coordinate layout from the selected funder's uploaded ACH template. */
export function resolveAchCoordinateChoiceForFunder(
    profile: FunderProfile | null | undefined,
    templates: AchTemplateLike[],
): AchCoordinateLayoutChoice {
    if (!profile) return "woodmere";
    const source = String(
        profile.addendumDocumentsSource ?? profile.documentsSource ?? "",
    )
        .trim()
        .toLowerCase();
    const docsFunderId =
        source === "shared"
            ? String(
                  profile.sharedAddendumFunderId ??
                      profile.sharedDocumentsFunderId ??
                      "",
              ).trim() || profile.id
            : profile.id;
    if (!docsFunderId) return "woodmere";

    const prefix = `funder_${docsFunderId}_`.toLowerCase();
    const hasTexas = templates.some((row) => {
        const key = String(row.layoutKey ?? row.templateId ?? "")
            .trim()
            .toLowerCase();
        const type = String(row.type ?? "")
            .trim()
            .toLowerCase();
        if (!key.startsWith(prefix)) return false;
        return (
            type === "ach_authorization_texas" ||
            key.includes("ach_authorization_texas")
        );
    });
    return hasTexas ? "texas" : "woodmere";
}

export function findFunderScopedAchTemplate(
    funderId: string,
    templates: AchTemplateLike[],
): AchTemplateLike | null {
    const id = String(funderId || "").trim();
    if (!id) return null;
    const prefix = `funder_${id}_`.toLowerCase();
    const matches = templates.filter((t) => {
        const key = String(t.layoutKey ?? t.templateId ?? "")
            .trim()
            .toLowerCase();
        if (!key.startsWith(prefix)) return false;
        return (
            key.includes("ach_authorization") ||
            String(t.type ?? "")
                .toLowerCase()
                .includes("ach")
        );
    });
    const previewable = matches.filter((t) =>
        boldSignTemplateIsPreviewable(toPreviewableTemplate(t)),
    );
    const pool = previewable.length > 0 ? previewable : matches;
    const texas = pool.find((t) => {
        const key = String(t.layoutKey ?? t.templateId ?? "")
            .trim()
            .toLowerCase();
        const type = String(t.type ?? "")
            .trim()
            .toLowerCase();
        return type === "ach_authorization_texas" || key.includes("ach_authorization_texas");
    });
    return texas ?? pool[0] ?? null;
}

function canonicalFunderAchLayoutKey(
    funderId: string,
    choice: AchCoordinateLayoutChoice,
): string {
    const id = String(funderId || "").trim();
    if (!id || id.startsWith("fallback-")) return "";
    const storageType =
        choice === "texas" ? ACH_TEXAS_LAYOUT_KEY : "ach_authorization";
    return `funder_${id}_${storageType}`;
}

/**
 * ACH PDF / envelope layout for the selected funder.
 * Prefer the funder's uploaded ACH template (`funder_<id>_ach_authorization*`);
 * never keep a stale mapping UUID that points at the platform default PDF.
 */
export function resolveAchDocumentRefForSelectedFunder(
    profile: FunderProfile | null | undefined,
    templates: AchTemplateLike[],
): string {
    const coordinateChoice = resolveAchCoordinateChoiceForFunder(profile, templates);
    const coordinateFallback = achLayoutKeyForCoordinateChoice(coordinateChoice);
    if (!profile) return coordinateFallback;

    const source = String(
        profile.addendumDocumentsSource ?? profile.documentsSource ?? "",
    )
        .trim()
        .toLowerCase();

    const docsFunderId =
        source === "shared"
            ? String(
                  profile.sharedAddendumFunderId ??
                      profile.sharedDocumentsFunderId ??
                      "",
              ).trim() || profile.id
            : profile.id;

    // Prefer funder-uploaded ACH (Settings → Funder profile → ACH Authorization).
    // Same path for Black Card, third-party funders, and platform-default profiles.
    const scoped = findFunderScopedAchTemplate(docsFunderId, templates);
    const scopedKey = String(scoped?.layoutKey ?? scoped?.templateId ?? "").trim();
    if (scopedKey) return scopedKey;

    if (docsFunderId !== profile.id) {
        const ownScoped = findFunderScopedAchTemplate(profile.id, templates);
        const ownKey = String(ownScoped?.layoutKey ?? ownScoped?.templateId ?? "").trim();
        if (ownKey) return ownKey;
    }

    // Templates may be stale — target the canonical funder key so the backend can
    // resolve the uploaded PDF before falling back to platform coordinates.
    return (
        canonicalFunderAchLayoutKey(docsFunderId, coordinateChoice) ||
        coordinateFallback
    );
}

export function isAchMappingOrTemplate(args: {
    documentType?: string | null;
    layoutKey?: string | null;
    templateType?: string | null;
    templateName?: string | null;
    documentRef?: string | null;
}): boolean {
    const docType = String(args.documentType ?? "").toLowerCase();
    if (docType === "ach") return true;
    if (isAchAuthorizationLayoutKey(args.documentRef)) return true;
    if (isAchAuthorizationLayoutKey(args.layoutKey)) return true;
    const type = String(args.templateType ?? "").toLowerCase();
    if (type === "ach" || type === "ach_authorization" || type.includes("ach_authorization")) {
        return true;
    }
    const name = String(args.templateName ?? "").toLowerCase();
    return name.includes("ach") && name.includes("authorization");
}

/**
 * Document ref for contract-package addendum rows (incl. ACH attached as addendum).
 * ACH must use layoutKey / funder-scoped key — never BoldSignTemplate UUID.
 */
export function resolvePackageAddendumDocumentRef(args: {
    mappingDocumentType?: string | null;
    template?: AchTemplateLike | null;
    funderProfile?: FunderProfile | null;
    boldSignTemplates?: AchTemplateLike[];
}): string {
    const template = args.template ?? null;
    const layoutKey = String(template?.layoutKey ?? template?.templateId ?? "").trim();
    const isAch = isAchMappingOrTemplate({
        documentType: args.mappingDocumentType,
        layoutKey,
        templateType: template?.type,
        templateName: template?.name,
        documentRef: layoutKey,
    });
    if (isAch) {
        return resolveAchDocumentRefForSelectedFunder(
            args.funderProfile ?? null,
            args.boldSignTemplates ?? [],
        );
    }
    const dropdown = getAddendumDropdownRef(template);
    if (dropdown) return dropdown;
    return layoutKey;
}
