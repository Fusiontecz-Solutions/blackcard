/**
 * ISO list / overview label: prefer email domain (ABC@example.com → example).
 */

export function isoDomainLabelFromEmail(
    email: string | null | undefined,
): string | null {
    const raw = String(email || "").trim();
    if (!raw) return null;
    const at = raw.lastIndexOf("@");
    if (at < 0) return null;
    const host = raw
        .slice(at + 1)
        .trim()
        .toLowerCase()
        .replace(/\.+$/, "");
    if (!host) return null;
    const parts = host.split(".").filter(Boolean);
    if (!parts.length) return null;
    // example.com → example; mail.example.com → example
    const label = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    if (!label || label === "www") return parts[0] || null;
    return label;
}

export type IsoLabelSource = {
    name?: string | null;
    email?: string | null;
} | null | undefined;

/** Table / overview title for a linked ISO. */
export function formatIsoDisplayLabel(iso: IsoLabelSource): string {
    if (!iso || typeof iso !== "object") return "-";
    const fromEmail = isoDomainLabelFromEmail(iso.email);
    if (fromEmail) return fromEmail;
    const name = String(iso.name || "").trim();
    if (name) return name;
    const email = String(iso.email || "").trim();
    if (email) return email;
    return "-";
}
