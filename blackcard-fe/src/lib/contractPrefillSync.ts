/** Dispatched after contract prefill overrides are saved (e.g. Net to merchant). */
export const CONTRACT_PREFILL_UPDATED_EVENT = "crm:contract-prefill-updated";

export function emitContractPrefillUpdated(
    applicationUuid: string,
    contract?: unknown,
): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(CONTRACT_PREFILL_UPDATED_EVENT, {
            detail: { applicationUuid: String(applicationUuid), contract },
        }),
    );
}

export function contractPrefillUpdateMatchesApplication(
    eventApplicationUuid: unknown,
    currentApplicationUuid: string | null | undefined,
): boolean {
    if (!currentApplicationUuid?.trim()) return false;
    if (eventApplicationUuid == null || eventApplicationUuid === "") return false;
    return String(eventApplicationUuid) === String(currentApplicationUuid);
}
