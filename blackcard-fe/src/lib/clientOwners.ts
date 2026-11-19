import type { OwnerDetail } from "@/types/clientTypes";

/** Prefer `owners[]`, then legacy single `owner`. */
export function resolveOwnersFromClientData(client: unknown): OwnerDetail[] {
    if (!client || typeof client !== "object") return [];

    const record = client as {
        owners?: OwnerDetail[];
        owner?: OwnerDetail;
    };

    if (Array.isArray(record.owners) && record.owners.length > 0) {
        return record.owners;
    }
    if (record.owner) {
        return [record.owner];
    }
    return [];
}

/** Route key used to load full client detail (owners relation). */
export function getClientFetchKeyFromApplicationClient(client: unknown): string | null {
    if (!client || typeof client !== "object") return null;

    const record = client as {
        clientId?: number | string | null;
        id?: string | null;
        _id?: string | null;
    };

    if (record.clientId != null && String(record.clientId).trim()) {
        return `clientId:${record.clientId}`;
    }

    const mongoId = record.id ?? record._id;
    if (mongoId != null && String(mongoId).trim()) {
        return `mongoId:${mongoId}`;
    }

    return null;
}

export function getClientFetchArg(fetchKey: string | null): string | null {
    if (!fetchKey) return null;
    if (fetchKey.startsWith("clientId:")) return fetchKey.slice("clientId:".length);
    if (fetchKey.startsWith("mongoId:")) return fetchKey.slice("mongoId:".length);
    return null;
}
