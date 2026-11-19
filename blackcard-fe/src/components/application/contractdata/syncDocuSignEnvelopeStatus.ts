import { axiosPost } from "@/redux/axios";
import {
    isDocuSignEnvelopeSyncTerminal,
    isDocuSignStatusTerminal,
    markDocuSignEnvelopeTerminal,
} from "./docusignPolling";

const MIN_SYNC_INTERVAL_MS = 10 * 60_000;

const lastSyncedAtByEnvelope = new Map<string, number>();
const inFlightByEnvelope = new Map<string, Promise<unknown>>();

function isRateLimitedError(err: unknown): boolean {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 429) return true;
    const msg = String(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "",
    );
    return /burst_envelope_polling|hourly_envelope_polling|polling.?limit|hourly_apiinvocation|apiinvocation.?limit|api.?invocation.?limit/i.test(
        msg,
    );
}

export function extractDocuSignApiErrorMessage(err: unknown, fallback: string): string {
    const ax = err as {
        response?: { data?: { message?: string } };
        message?: string;
    };
    const fromBody = String(ax?.response?.data?.message ?? "").trim();
    if (fromBody) return fromBody;
    const fromAxios = String(ax?.message ?? "").trim();
    if (fromAxios && !/^Request failed with status code \d+$/i.test(fromAxios)) {
        return fromAxios;
    }
    return fallback;
}

export type SyncDocuSignEnvelopeStatusOptions = {
    applicationId?: string;
    contractId?: number | null;
    force?: boolean;
    silent?: boolean;
};

export type SyncDocuSignEnvelopeStatusResult = {
    skipped?: boolean;
    rateLimited?: boolean;
    data?: unknown;
};

export async function syncDocuSignEnvelopeStatus(
    envelopeId: string,
    options?: SyncDocuSignEnvelopeStatusOptions,
): Promise<SyncDocuSignEnvelopeStatusResult> {
    const eid = String(envelopeId ?? "").trim();
    if (!eid) return { skipped: true };

    // Once signed/completed via webhook, never hit DocuSign again for status.
    if (isDocuSignEnvelopeSyncTerminal(eid)) {
        return { skipped: true };
    }

    const now = Date.now();
    const last = lastSyncedAtByEnvelope.get(eid) ?? 0;
    if (!options?.force && now - last < MIN_SYNC_INTERVAL_MS) {
        return { skipped: true };
    }

    const inFlight = inFlightByEnvelope.get(eid);
    if (inFlight) {
        try {
            const data = await inFlight;
            return { data };
        } catch (err) {
            if (options?.silent && isRateLimitedError(err)) {
                return { rateLimited: true };
            }
            throw err;
        }
    }

    const contractIdNum = Number(options?.contractId);
    const request = axiosPost("/docusign/sync-envelope-status", {
        envelopeId: eid,
        ...(options?.applicationId ? { applicationId: String(options.applicationId) } : {}),
        ...(Number.isFinite(contractIdNum) && contractIdNum > 0
            ? { contractId: contractIdNum }
            : {}),
        ...(options?.force ? { force: true } : {}),
    })
        .then((res) => {
            lastSyncedAtByEnvelope.set(eid, Date.now());
            const data = res?.data ?? res;
            const status = String(
                (data as { internalStatus?: string; docusignStatus?: string } | null)
                    ?.internalStatus ??
                    (data as { docusignStatus?: string } | null)?.docusignStatus ??
                    "",
            );
            if (isDocuSignStatusTerminal(status)) {
                markDocuSignEnvelopeTerminal(eid);
            }
            return data;
        })
        .finally(() => {
            inFlightByEnvelope.delete(eid);
        });

    inFlightByEnvelope.set(eid, request);

    try {
        const data = await request;
        return { data };
    } catch (err) {
        if (isRateLimitedError(err)) {
            lastSyncedAtByEnvelope.set(eid, Date.now());
            if (options?.silent) return { rateLimited: true };
            throw new Error(
                "DocuSign hourly API limit reached (3000/hour). Wait about an hour, then click Update status once.",
            );
        }
        throw new Error(
            extractDocuSignApiErrorMessage(err, "Could not sync DocuSign envelope status."),
        );
    }
}
