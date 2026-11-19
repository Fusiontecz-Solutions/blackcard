import { useEffect, useRef } from "react";
import { useSocket } from "@/context/SocketContext";

/** Matches backend `CONTRACT_SIGNING_STATUS_SOCKET_EVENT`. */
export const CONTRACT_SIGNING_STATUS_SOCKET_EVENT = "contract:signing-status";

export type ContractSigningStatusRealtimePayload = {
    applicationId?: string;
    envelopeId?: string | null;
    status?: string;
    priorStatus?: string | null;
    provider?: string;
    envelopeKind?: string | null;
};

function idsMatch(
    left: string | null | undefined,
    right: string | null | undefined,
): boolean {
    const a = String(left ?? "").trim();
    const b = String(right ?? "").trim();
    if (!a || !b) return false;
    return a === b || a.toLowerCase() === b.toLowerCase();
}

/**
 * Instant CRM refresh when DocuSign Connect (webhook) updates envelope status.
 * Prefer this over polling DocuSign; fall back to envelope sync only when stale.
 */
export function useContractSigningStatusRealtime(
    applicationId: string | null | undefined,
    onUpdate: (payload: ContractSigningStatusRealtimePayload) => void,
): void {
    const { socket } = useSocket();
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;

    useEffect(() => {
        if (!socket) return;
        const appId = String(applicationId ?? "").trim();
        if (!appId) return;

        const handle = (payload: ContractSigningStatusRealtimePayload) => {
            if (!idsMatch(payload?.applicationId, appId)) return;
            onUpdateRef.current(payload);
        };

        socket.on(CONTRACT_SIGNING_STATUS_SOCKET_EVENT, handle);
        return () => {
            socket.off(CONTRACT_SIGNING_STATUS_SOCKET_EVENT, handle);
        };
    }, [socket, applicationId]);
}
