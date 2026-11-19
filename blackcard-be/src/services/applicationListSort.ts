import type { Prisma } from '@prisma/client';
import type prismaClient from '../config/prismaClient';
import {
    compareApplicationsByWorkflowStage,
} from './applicationWorkflowSortRank';

type PrismaClient = typeof prismaClient;

/**
 * Maps GET /applications `sortBy` / `sortOrder` to Prisma `orderBy`.
 * `status` uses {@link fetchPaginatedApplicationsForList} pipeline ordering instead.
 */
export function buildApplicationListOrderBy(
    sortByRaw: unknown,
    sortOrderRaw: unknown,
): Prisma.ApplicationOrderByWithRelationInput | Prisma.ApplicationOrderByWithRelationInput[] {
    const sortBy = String(sortByRaw ?? 'createdAt').trim();
    const dir: Prisma.SortOrder =
        String(sortOrderRaw ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    switch (sortBy) {
        case 'dealId':
            return [{ dealId: dir }, { applicationId: dir }];
        case 'applicationId':
            return { applicationId: dir };
        case 'businessName':
            return { client: { businessName: dir } };
        case 'email':
            return { client: { businessEmail: dir } };
        case 'loanAmount':
            return [{ OfferDecision: { offer: dir } }, { loanAmount: dir }];
        case 'updatedAt':
        case 'lastModifiedAt':
            return { updatedAt: dir };
        case 'createdAt':
            return { createdAt: dir };
        default:
            return { createdAt: 'desc' };
    }
}

function normalizeSortOrder(raw: unknown): 'asc' | 'desc' {
    return String(raw ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
}

/**
 * Paginated application list. When `sortBy` is `status`, orders by pipeline stage
 * (New → Agent → Underwriter → Final Underwriter → … → Funded), not alphabetically.
 */
export async function fetchPaginatedApplicationsForList(
    prisma: PrismaClient,
    args: {
        where: Prisma.ApplicationWhereInput;
        skip: number;
        take: number;
        sortBy: unknown;
        sortOrder: unknown;
        include: Prisma.ApplicationInclude;
    },
): Promise<{ apps: Awaited<ReturnType<PrismaClient['application']['findMany']>>; total: number }> {
    const sortBy = String(args.sortBy ?? 'createdAt').trim();
    const sortOrder = normalizeSortOrder(args.sortOrder);

    const total = await prisma.application.count({ where: args.where });

    if (sortBy !== 'status') {
        const apps = await prisma.application.findMany({
            where: args.where,
            orderBy: buildApplicationListOrderBy(args.sortBy, args.sortOrder),
            skip: args.skip,
            take: args.take,
            include: args.include,
        });
        return { apps, total };
    }

    const candidates = await prisma.application.findMany({
        where: args.where,
        select: {
            id: true,
            applicationId: true,
            currentQueue: true,
            currentState: true,
            status: true,
        },
    });

    const sorted = [...candidates].sort((a, b) =>
        compareApplicationsByWorkflowStage(a, b, sortOrder),
    );

    const pageIds = sorted.slice(args.skip, args.skip + args.take).map((row) => row.id);
    if (pageIds.length === 0) {
        return { apps: [], total };
    }

    const apps = await prisma.application.findMany({
        where: { id: { in: pageIds } },
        include: args.include,
    });

    const byId = new Map(apps.map((app) => [app.id, app]));
    const orderedApps = pageIds
        .map((id) => byId.get(id))
        .filter((app): app is NonNullable<typeof app> => app != null);

    return { apps: orderedApps, total };
}
