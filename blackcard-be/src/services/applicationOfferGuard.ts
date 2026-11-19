import prisma from '../config/prismaClient';

/**
 * Approvals need an offer: a saved OfferDecision with an Offer amount above 0.
 * Scrubbers and underwriters may not approve or recommend approval without one,
 * and the approval mail never goes out without one. Declines never need an
 * offer. Every other offer field stays optional.
 */
export const OFFER_REQUIRED_MESSAGE =
    'Save an offer (Offer amount) before approving this deal.';

const OFFER_GATED_ROLES = new Set(['SCRUBBING', 'UNDERWRITER']);

/** Queues an approval moves a deal into (declines are not gated). */
const DECISION_QUEUES = new Set(
    [
        'Underwriter Approved',
        'Final Approval',
        'Final',
        'Approval Sent',
        'ISO Approved',
        'Approved',
    ].map((q) => q.toUpperCase()),
);

export function isOfferGatedRole(role: unknown): boolean {
    return OFFER_GATED_ROLES.has(String(role ?? '').toUpperCase().replace(/-/g, '_'));
}

export function isDecisionQueueMove(targetQueue: unknown, scrubberRecommendation: unknown): boolean {
    const recommendation = String(scrubberRecommendation ?? '').trim();
    if (recommendation === 'Recommend Approval') return true;
    if (recommendation) return false; // Recommend Decline needs no offer
    return DECISION_QUEUES.has(String(targetQueue ?? '').trim().toUpperCase());
}

export async function applicationHasOffer(applicationUuid: string): Promise<boolean> {
    const od = await prisma.offerDecision.findUnique({
        where: { applicationId: applicationUuid },
        select: { offer: true },
    });
    return od?.offer != null && Number(od.offer) > 0;
}

/** Sends the 400 itself and returns true when the caller must stop. */
export async function blockIfNoOffer(
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
    role: unknown,
    applicationUuid: string | null | undefined,
    /** true: enforce for every role (the approval mail never goes out without an amount). */
    allRoles = false,
): Promise<boolean> {
    if (!applicationUuid || (!allRoles && !isOfferGatedRole(role))) return false;
    if (await applicationHasOffer(String(applicationUuid))) return false;
    res.status(400).json({ success: false, code: 'OFFER_REQUIRED', message: OFFER_REQUIRED_MESSAGE });
    return true;
}
