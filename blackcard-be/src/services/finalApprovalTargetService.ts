import type { PrismaClient } from '@prisma/client';

type UnderwriterCandidateSource = 'approved' | 'assigned' | 'claimed';

export type FinalApprovalUnderwriterTarget = {
    userId: string;
    source: UnderwriterCandidateSource;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
};

const normalizeRole = (role: string | null | undefined): string =>
    String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');

export const isActiveUnderwriterRole = (role: string | null | undefined): boolean =>
    normalizeRole(role) === 'UNDERWRITER';

type ApplicationUnderwriterIds = {
    approvedByUnderwriterId?: string | null;
    assignedUnderwriterId?: string | null;
    claimedByUnderwriterId?: string | null;
};

/**
 * Resolve which active Underwriter should receive post-contract final approval.
 * Skips scrubbers/admins recorded in `approvedByUnderwriterId` when a real
 * Underwriter is available on assigned/claimed fields.
 */
export async function resolveFinalApprovalUnderwriterTarget(
    db: Pick<PrismaClient, 'user'>,
    application: ApplicationUnderwriterIds,
): Promise<FinalApprovalUnderwriterTarget | null> {
    const candidates: Array<{ id: string; source: UnderwriterCandidateSource }> = [];
    const seen = new Set<string>();

    const push = (rawId: string | null | undefined, source: UnderwriterCandidateSource) => {
        const id = String(rawId ?? '').trim();
        if (!id || seen.has(id)) return;
        seen.add(id);
        candidates.push({ id, source });
    };

    push(application.approvedByUnderwriterId, 'approved');
    push(application.assignedUnderwriterId, 'assigned');
    push(application.claimedByUnderwriterId, 'claimed');

    if (!candidates.length) return null;

    const users = await db.user.findMany({
        where: {
            id: { in: candidates.map((c) => c.id) },
            isActive: true,
        },
        select: {
            id: true,
            role: true,
            firstName: true,
            lastName: true,
            email: true,
        },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    for (const candidate of candidates) {
        const user = byId.get(candidate.id);
        if (!user || !isActiveUnderwriterRole(user.role)) continue;
        return {
            userId: user.id,
            source: candidate.source,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
        };
    }

    return null;
}
