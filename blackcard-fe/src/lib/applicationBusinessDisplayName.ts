import type { Application } from "@/types/applicationTypes";

export function getClientNameFromApplicationClient(client: Application["client"]): string {
    if (typeof client === "string") return client;
    if (client?.business?.name) return client.business.name;
    if (client?.owner?.firstName || client?.owner?.lastName) {
        return `${client.owner.firstName || ""} ${client.owner.lastName || ""}`.trim();
    }
    return "-";
}

/** Prefer per-import deal line (e.g. "… #2") when set; otherwise client business / owner name. */
export function getApplicationBusinessDisplayName(app: Application): string {
    const line = app.dealDisplayName?.trim();
    if (line) return line;
    return getClientNameFromApplicationClient(app.client);
}
