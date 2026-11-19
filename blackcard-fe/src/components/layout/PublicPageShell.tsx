import type { ReactNode } from "react";

/** Merchant-facing pages keep mixed case (approval, document upload, bank connect). */
export function PublicPageShell({ children }: { children: ReactNode }) {
    return <div className="crm-keep-case min-h-screen">{children}</div>;
}
