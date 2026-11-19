/** Dispatched after an offer-decision is saved elsewhere (e.g. approval modal). */
export const OFFER_DECISION_UPDATED_EVENT = "crm:offer-decision-updated";

export function emitOfferDecisionUpdated(applicationId: string | number) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
        new CustomEvent(OFFER_DECISION_UPDATED_EVENT, {
            detail: { applicationId: String(applicationId) },
        }),
    );
}

export function offerDecisionUpdateMatchesApplication(
    eventApplicationId: unknown,
    currentApplicationId: string | number | null | undefined,
): boolean {
    if (currentApplicationId == null || currentApplicationId === "") return false;
    if (eventApplicationId == null || eventApplicationId === "") return false;
    return String(eventApplicationId) === String(currentApplicationId);
}
