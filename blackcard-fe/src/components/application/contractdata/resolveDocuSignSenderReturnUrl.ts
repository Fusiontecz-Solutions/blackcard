function normalizePublicAppOrigin(raw: string): string {
    const trimmed = String(raw || "").trim().replace(/\/+$/, "");
    if (!trimmed) return "";
    if (trimmed.includes("://")) {
        try {
            return new URL(trimmed).origin;
        } catch {
            return "";
        }
    }
    return `https://${trimmed.replace(/^\/+/, "")}`;
}

function isLocalDevHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
}

/** Marketing / public website hosts — never use as DocuSign return URL for CRM sends. */
function isMarketingSiteHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return host === "woodmere.finexusai.com" || host === "www.woodmere.finexusai.com";
}

const CRM_PLATFORM_ORIGIN = normalizePublicAppOrigin(
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) ?? "",
);

/**
 * Return URL DocuSign uses after the sender finishes review/send.
 * Must land on the CRM (e.g. www.woodmere.finexusai.com), not the marketing site.
 */
export function resolveDocuSignSenderReturnUrl(): string {
    if (typeof window !== "undefined") {
        try {
            const current = new URL(window.location.href);

            // Local dev: keep the user on localhost. Redirecting to production makes the
            // DocuSign tab appear to "close" or jump away while reviewing.
            if (isLocalDevHost(current.hostname)) {
                return current.href;
            }

            if (
                !isMarketingSiteHost(current.hostname) &&
                current.protocol === "https:"
            ) {
                return current.href;
            }
        } catch {
            /* fall through */
        }
    }

    return CRM_PLATFORM_ORIGIN || "https://www.woodmere.finexusai.com";
}
