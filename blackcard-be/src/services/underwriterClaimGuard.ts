import type { Application } from '@prisma/client';
import type { AuthenticatedUser } from './applicationService';
import prisma from '../config/prismaClient';

function normalizeQueueToken(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

/** True when `currentQueue` is the primary Scrubbing inbox queue (`Scrubbing`). */
export function isApplicationInUnderwriterQueue(currentQueue: string | null | undefined): boolean {
    return normalizeQueueToken(currentQueue ?? '') === 'SCRUBBING';
}

/** True when `currentQueue` is the final Underwriter review queue (`Underwriter`). */
export function isApplicationInFinalUnderwriterQueue(currentQueue: string | null | undefined): boolean {
    return normalizeQueueToken(currentQueue ?? '') === 'UNDERWRITER';
}

export type UnderwriterClaimMutationDenial = { status: number; message: string };

/**
 * Scrubbing queue: only the claiming scrubbing may mutate the deal.
 * Unclaimed (`claimedByUnderwriterId` null): SCRUBBING may not change anything until they claim.
 */
export function getUnderwriterClaimMutationDenial(
    user: AuthenticatedUser | null | undefined,
    app: (Pick<Application, 'currentQueue'> & {
        claimedByUnderwriterId?: string | null;
        assignedUnderwriterId?: string | null;
        returnedToScrubberAt?: Date | string | null;
    }) | null,
): UnderwriterClaimMutationDenial | null {
    if (!app || !user?.id) return null;

    const roleUpper = user.role ? String(user.role).toUpperCase().replace(/-/g, '_') : '';

    if (roleUpper === 'SCRUBBING' && isApplicationInUnderwriterQueue(app.currentQueue)) {
        // A deal the underwriter sent back for correction keeps its assignment on
        // purpose, so the underwriter does not lose it. The scrubber who holds the
        // claim is exactly who is meant to be editing it, so do not lock them out.
        const awaitingCorrection = Boolean(app.returnedToScrubberAt);
        if (app.assignedUnderwriterId && !awaitingCorrection) {
            return {
                status: 403,
                message:
                    'This deal was claimed by an underwriter. It is no longer available to scrubbers.',
            };
        }
        const claimId = app.claimedByUnderwriterId ?? null;
        if (!claimId) {
            return {
                status: 403,
                message:
                    'Claim this deal before making changes. Until then, you can only review the application overview.',
            };
        }
        if (claimId !== user.id) {
            return {
                status: 403,
                message: 'This deal is claimed by another scrubbing. You can only review the overview.',
            };
        }
        return null;
    }

    if (roleUpper === 'UNDERWRITER' && isApplicationInUnderwriterQueue(app.currentQueue)) {
        return {
            status: 403,
            message:
                'This deal is still in Scrubbing — view only. You cannot edit it until a scrubber sends it on, or you claim it first from Queue.',
        };
    }

    if (roleUpper === 'UNDERWRITER' && isApplicationInFinalUnderwriterQueue(app.currentQueue)) {
        const assignId = app.assignedUnderwriterId ?? null;
        if (!assignId) {
            return {
                status: 403,
                message:
                    'Claim this application before making changes. Until then, you can only review the application overview.',
            };
        }
        if (assignId !== user.id) {
            return {
                status: 403,
                message:
                    'This application is claimed by another underwriter. You can only review the overview.',
            };
        }
    }

    return null;
}

/**
 * Same claim rule for controllers that only know the application's id.
 * Sends the 403 itself and returns true when the caller must stop.
 */
export async function blockIfClaimRequired(
    req: { user?: { id?: string | null; role?: unknown } | null },
    res: { status: (code: number) => { json: (body: unknown) => unknown } },
    applicationUuid: string | null | undefined,
): Promise<boolean> {
    const userId = req.user?.id;
    if (!applicationUuid || !userId) return false;
    const app = await prisma.application.findUnique({
        where: { id: String(applicationUuid) },
        select: {
            currentQueue: true,
            claimedByUnderwriterId: true,
            assignedUnderwriterId: true,
            returnedToScrubberAt: true,
        },
    });
    const deny = getUnderwriterClaimMutationDenial(
        { id: userId, role: req.user?.role } as AuthenticatedUser,
        app,
    );
    if (!deny) return false;
    res.status(deny.status).json({ success: false, message: deny.message });
    return true;
}
