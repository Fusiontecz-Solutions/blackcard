import { axiosGet } from "@/redux/axios";
import {
    persistedFunderProfileIdForApi,
    usesTexasContractLayout,
} from "@/hooks/useFunderProfiles";
import type { FunderProfile } from "@/types/integrationSettingsTypes";
import { resolvePdfViewUrl } from "@/utils/cloudinaryPdfUrl";
import { APP_COMPANY_NAME, replaceLegacyBrandInDisplayName } from "@/constants/appBranding";
import { PLATFORM_LAYOUT_KEYS } from "./platformDocumentConfig";

export type MainContractTemplatePreview = {
    url: string;
    name: string;
    layoutKey: string;
    source: "contract-templates" | "crm-pdf-url" | "docusign-download" | "fallback";
};

function isFunderOwnedContractLayout(layoutKey: string, profile?: FunderProfile): boolean {
    const key = String(layoutKey || "").trim();
    if (key.startsWith("funder_")) return true;
    if (key === PLATFORM_LAYOUT_KEYS.texasFundingGroupContract) return true;
    if (profile && usesTexasContractLayout(profile)) return true;
    const profileKey = String(profile?.mainContractLayoutKey ?? "").trim();
    if (profileKey.startsWith("funder_")) return true;
    if (profileKey && profileKey !== PLATFORM_LAYOUT_KEYS.contract) return true;
    return false;
}

async function fetchCrmTemplatePdfByLayoutKey(
    layoutKey: string,
    previewName: string,
): Promise<MainContractTemplatePreview | null> {
    const key = String(layoutKey || "").trim();
    if (!key) return null;
    try {
        const res = await axiosGet("/contract/templates", {
            params: { type: "contract" },
        });
        const rows = (
            (res as { data?: { data?: unknown } })?.data?.data ??
            (res as { data?: unknown })?.data ??
            []
        ) as Array<{
            layoutKey?: string;
            templateId?: string;
            pdfUrl?: string;
            name?: string;
            originalFileName?: string;
        }>;
        if (!Array.isArray(rows)) return null;
        const match = rows.find(
            (row) =>
                String(row.layoutKey || "").trim() === key ||
                String(row.templateId || "").trim() === key,
        );
        const pdfUrl = String(match?.pdfUrl || "").trim();
        if (!pdfUrl || !/^https?:\/\//i.test(pdfUrl)) return null;
        const name =
            replaceLegacyBrandInDisplayName(
                String(match?.originalFileName || match?.name || "").trim() || previewName,
            );
        let viewUrl = pdfUrl;
        try {
            viewUrl = (await resolvePdfViewUrl(pdfUrl, name)) || pdfUrl;
        } catch {
            viewUrl = pdfUrl;
        }
        return {
            url: viewUrl,
            name,
            layoutKey: key,
            source: "crm-pdf-url",
        };
    } catch {
        return null;
    }
}

export async function fetchMainContractTemplatePreview(options: {
    funderName?: string | null;
    funderProfileId?: string | null;
    state?: string | null;
    layoutKey: string;
    previewName: string;
    fallbackUrl?: string | null;
    fallbackName?: string | null;
    funders?: FunderProfile[];
    findFunder?: (name?: string | null) => FunderProfile | undefined;
    findFunderById?: (id?: string | null) => FunderProfile | undefined;
}): Promise<MainContractTemplatePreview | null> {
    const layoutKey = String(options.layoutKey || "").trim() || PLATFORM_LAYOUT_KEYS.contract;
    const funderName = String(options.funderName ?? "").trim();
    const state = String(options.state ?? "").trim() || undefined;
    const funderProfileId = String(options.funderProfileId ?? "").trim();
    const profile =
        options.findFunderById?.(funderProfileId) ?? options.findFunder?.(funderName);
    const persistedProfileId =
        funderProfileId && !funderProfileId.startsWith("fallback-")
            ? funderProfileId
            : persistedFunderProfileIdForApi(profile);
    const funderOwnedLayout = isFunderOwnedContractLayout(layoutKey, profile);
    const funderScopedLayoutKey = persistedProfileId ? `funder_${persistedProfileId}` : "";

    // Funder-profile PDF first when this funder has its own upload.
    if (funderScopedLayoutKey) {
        const funderPreview = await fetchCrmTemplatePdfByLayoutKey(
            funderScopedLayoutKey,
            options.previewName,
        );
        if (funderPreview?.url) return funderPreview;
    }
    if (layoutKey && layoutKey !== PLATFORM_LAYOUT_KEYS.contract && layoutKey !== funderScopedLayoutKey) {
        const crmPreview = await fetchCrmTemplatePdfByLayoutKey(layoutKey, options.previewName);
        if (crmPreview?.url) return crmPreview;
    }

    // Platform / global default (optional). Backend also falls back to funder PDF if none.
    // Backend-built PDF first: it includes generated pages (No Debt Settlement
    // rider on page 3) that the raw uploaded template does not.
    try {
        const response = await axiosGet(
            `/docusign/template/${encodeURIComponent(layoutKey)}/download`,
            {
                responseType: "blob",
                params: {
                    ...(funderName ? { funderName } : {}),
                    ...(persistedProfileId ? { funderProfileId: persistedProfileId } : {}),
                    ...(state ? { state } : {}),
                },
            },
        );
        const blob =
            response?.data instanceof Blob
                ? response.data
                : new Blob([response?.data], { type: "application/pdf" });
        if (blob.size > 0 && blob.type !== "application/json") {
            return {
                url: URL.createObjectURL(blob),
                name: replaceLegacyBrandInDisplayName(
                    options.previewName || `${APP_COMPANY_NAME} Contract.pdf`,
                ),
                layoutKey,
                source: "docusign-download",
            };
        }
    } catch {
        /* fall through */
    }

    try {
        const res = await axiosGet("/contract-templates/latest", {
            params: {
                layoutKey: PLATFORM_LAYOUT_KEYS.contract,
                ...(funderName ? { funderName } : {}),
                ...(persistedProfileId ? { funderProfileId: persistedProfileId } : {}),
                ...(state ? { state } : {}),
            },
        });
        const data = (res as { data?: { data?: { url?: string; originalName?: string } } })
            ?.data?.data;
        if (data?.url) {
            const viewUrl = await resolvePdfViewUrl(
                data.url,
                data.originalName || options.previewName,
            );
            if (viewUrl) {
                return {
                    url: viewUrl,
                    name: replaceLegacyBrandInDisplayName(
                        data.originalName || options.previewName,
                    ),
                    layoutKey: PLATFORM_LAYOUT_KEYS.contract,
                    source: "contract-templates",
                };
            }
        }
    } catch {
        /* try CRM / funder PDFs */
    }

    const platformCrmPreview = await fetchCrmTemplatePdfByLayoutKey(
        PLATFORM_LAYOUT_KEYS.contract,
        options.previewName,
    );
    if (platformCrmPreview?.url) return platformCrmPreview;

    const fallbackUrl = String(options.fallbackUrl ?? "").trim();
    // Never use a cached global PDF for the platform contract (often a leftover Katan file).
    if (fallbackUrl && !/^platform:/i.test(fallbackUrl) && !funderOwnedLayout) {
        const viewUrl = await resolvePdfViewUrl(
            fallbackUrl,
            options.fallbackName || options.previewName,
        );
        return {
            url: viewUrl,
            name: replaceLegacyBrandInDisplayName(
                options.fallbackName || options.previewName,
            ),
            layoutKey,
            source: "fallback",
        };
    }

    return null;
}
