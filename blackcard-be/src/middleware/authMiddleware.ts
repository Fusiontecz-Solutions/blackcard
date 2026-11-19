import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prismaClient';
import { withDbRetry, isRetryableDbError } from '../utils/dbRetry';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                name: string;
                email: string;
                role: string;
                publicApprovalActor?: 'CLIENT' | 'ISO';
            };
        }
    }
}

/**
 * Trusted Super Admin → tenant proxy principal.
 * When the SA panel forwards an actor (SCRUBBING / UNDERWRITER / SUPER_ADMIN),
 * we honor that role so tenant list filters (`underwriterClaim`) and role gates
 * (`requireRoles('SCRUBBING')`) behave like a native tenant login.
 * If the actor email matches a tenant User row, we use that id for claim FKs.
 */
const SUPER_ADMIN_PROXY_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

const PROXY_ACTOR_ROLES = new Set(['SUPER_ADMIN', 'SCRUBBING', 'UNDERWRITER', 'OPERATIONS', 'ADMIN']);

function normalizeProxyActorRole(raw?: string | null): string {
    const role = String(raw ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    if (PROXY_ACTOR_ROLES.has(role)) return role;
    return 'SUPER_ADMIN';
}

/**
 * User id safe for tenant DB foreign keys (e.g. Application.createdById).
 * Super Admin proxy principals are synthetic unless mapped to a tenant User by email.
 */
export function resolveTenantUserId(req: Request): string | null {
    if (req.isSuperAdminProxy) {
        const id = req.user?.id;
        if (!id || id === SUPER_ADMIN_PROXY_SENTINEL_ID) return null;
        return id;
    }
    return req.user?.id ?? null;
}

export type ApplicationAttributionContext = {
    createdById: string | null;
    salesRepresentativeId: string;
};

export const APPLICATION_USER_ATTRIBUTION_ERROR =
    'Could not attribute this action to a tenant user. Ensure the application has a valid creator or sales representative.';

const resolveApplicationAttributedUserIdFromActorId = async (
    actorUserId: string | null | undefined,
    application: ApplicationAttributionContext,
): Promise<string | null> => {
    if (actorUserId) {
        const actor = await prisma.user.findUnique({
            where: { id: actorUserId },
            select: { id: true },
        });
        if (actor) return actor.id;
    }

    const fallbackIds = [
        application.createdById,
        application.salesRepresentativeId,
    ].filter((id): id is string => typeof id === 'string' && id.length > 0);

    for (const candidateId of fallbackIds) {
        const user = await prisma.user.findUnique({
            where: { id: candidateId },
            select: { id: true },
        });
        if (user) return user.id;
    }

    return null;
};

/**
 * Resolves a tenant User.id for required application FKs (BankDetail, BankAnalysis, Note, etc.).
 * Regular users are attributed to themselves when their id exists in User.
 * Super Admin proxy calls have no tenant User row — fall back to the application's
 * creator or sales representative (same pattern as contract creation).
 */
export async function resolveApplicationAttributedUserId(
    req: Request,
    application: ApplicationAttributionContext,
): Promise<string | null> {
    return resolveApplicationAttributedUserIdFromActorId(resolveTenantUserId(req), application);
}

/** Same attribution rules as above, but accepts a raw actor id (e.g. from AuthenticatedUser). */
export async function resolveApplicationAttributedUserIdForActor(
    actorUserId: string | null | undefined,
    application: ApplicationAttributionContext,
): Promise<string | null> {
    return resolveApplicationAttributedUserIdFromActorId(actorUserId, application);
}

/** @deprecated Use resolveApplicationAttributedUserId */
export const resolveBankDetailCreatedById = resolveApplicationAttributedUserId;

/**
 * Resolves User.userId (numeric) for Document ownership (DocuSign / BoldSign envelope link).
 *
 * Regular JWT users map directly when their row exists.
 * Super Admin proxy principals are not tenant Users — fall back to the application's
 * creator or sales representative (same pattern as resolveApplicationAttributedUserId).
 * When re-linking an existing Document, prefer its prior numeric userId over failing.
 */
export async function resolveDocumentOwnerNumericUserId(
    actorUserId: string | null | undefined,
    applicationId: string,
    existingNumericUserId?: number | null,
): Promise<number | null> {
    const appId = String(applicationId || '').trim();
    if (!appId) return null;

    const actorId = String(actorUserId || '').trim();
    if (actorId && actorId !== SUPER_ADMIN_PROXY_SENTINEL_ID) {
        const actor = await prisma.user.findUnique({
            where: { id: actorId },
            select: { userId: true },
        });
        if (actor?.userId != null) return actor.userId;
    }

    const app = await prisma.application.findUnique({
        where: { id: appId },
        select: { createdById: true, salesRepresentativeId: true },
    });
    if (app) {
        const attributedUuid = await resolveApplicationAttributedUserIdForActor(actorId || null, {
            createdById: app.createdById,
            salesRepresentativeId: app.salesRepresentativeId,
        });
        if (attributedUuid) {
            const attributed = await prisma.user.findUnique({
                where: { id: attributedUuid },
                select: { userId: true },
            });
            if (attributed?.userId != null) return attributed.userId;
        }
    }

    if (existingNumericUserId != null && Number.isFinite(existingNumericUserId)) {
        return existingNumericUserId;
    }

    return null;
}

/**
 * Tenant user id when it exists in User; otherwise null (safe for optional createdById FK).
 * Super Admin proxy principals never write a synthetic id into the database.
 */
export async function resolveOptionalTenantUserId(req: Request): Promise<string | null> {
    const tenantUserId = resolveTenantUserId(req);
    if (!tenantUserId) return null;
    const actor = await prisma.user.findUnique({
        where: { id: tenantUserId },
        select: { id: true },
    });
    return actor?.id ?? null;
}

export type AuditLogUserResolveOptions = {
    user?: { id?: string; role?: string } | null;
    applicationId?: string | null;
};

/**
 * Resolves a tenant User.id safe for optional audit FKs
 * (ApplicationActivityLog.userId, OutboundCommunication.createdById).
 *
 * - Regular JWT users: their row in User when it exists.
 * - Super Admin proxy: no synthetic id; falls back to the application's
 *   creator or sales representative when applicationId is known.
 * - Invalid / missing user with applicationId: same application fallback.
 */
export async function resolveAuditLogUserId(
    req: Request | null | undefined,
    options?: AuditLogUserResolveOptions,
): Promise<string | null> {
    const applicationId =
        options?.applicationId && String(options.applicationId).trim().length > 0
            ? String(options.applicationId).trim()
            : null;

    if (req) {
        const fromReq = await resolveOptionalTenantUserId(req);
        if (fromReq) return fromReq;

        if (applicationId) {
            const app = await prisma.application.findUnique({
                where: { id: applicationId },
                select: { createdById: true, salesRepresentativeId: true },
            });
            if (app) {
                return resolveApplicationAttributedUserId(req, app);
            }
        }
        return null;
    }

    const userId = options?.user?.id;
    if (userId) {
        const actor = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (actor) return actor.id;
    }

    if (applicationId) {
        const app = await prisma.application.findUnique({
            where: { id: applicationId },
            select: { createdById: true, salesRepresentativeId: true },
        });
        if (app) {
            const fallbackIds = [app.createdById, app.salesRepresentativeId].filter(
                (id): id is string => typeof id === 'string' && id.length > 0,
            );
            for (const candidateId of fallbackIds) {
                const row = await prisma.user.findUnique({
                    where: { id: candidateId },
                    select: { id: true },
                });
                if (row) return row.id;
            }
        }
    }

    return null;
}

export const authenticateToken = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<Response | void> => {
    try {
        // Trusted internal call from the centralized Super Admin backend.
        // `verifySuperAdminProxy` has already validated the shared secret
        // (constant-time compared against SUPER_ADMIN_SECRET) before this
        // middleware runs, so we MUST NOT try to validate a tenant JWT here.
        if (req.isSuperAdminProxy) {
            const ctx = req.superAdminContext || {};
            const actorRole = normalizeProxyActorRole(ctx.actorRole);
            const actorEmail = String(ctx.actorEmail || '')
                .trim()
                .toLowerCase();
            let tenantUserId: string | null = null;
            let displayName = ctx.actorName || 'Super Admin (proxy)';

            if (actorEmail) {
                const tenantUser = await withDbRetry(
                    () =>
                        prisma.user.findFirst({
                            where: {
                                email: { equals: actorEmail, mode: 'insensitive' },
                                isActive: true,
                            },
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        }),
                    { label: 'authenticateToken proxy actor email lookup' },
                );
                if (tenantUser) {
                    tenantUserId = tenantUser.id;
                    const name = `${tenantUser.firstName || ''} ${tenantUser.lastName || ''}`.trim();
                    if (name) displayName = name;
                }
            }

            // Never put the Super Admin platform actor UUID on req.user.id —
            // it is not a tenant User row and breaks FK writes (TermsOffer, etc.).
            // Keep the real SA actor only on req.superAdminContext.actorId.
            req.user = {
                id: tenantUserId || SUPER_ADMIN_PROXY_SENTINEL_ID,
                name: displayName,
                email: ctx.actorEmail || 'super-admin@proxy.internal',
                role: actorRole,
            };
            return next();
        }

        // Get token from Authorization header or cookies
        const authHeader = req.headers.authorization;
        const token = authHeader?.split(' ')[1] || req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication token required',
            });
        }

        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
            id: string;
            name: string;
            email: string;
            role: string;
            publicApprovalActor?: 'CLIENT' | 'ISO';
        };

        // Check if token exists in AccessToken table and is not expired
        const accessToken = await withDbRetry(
            () =>
                prisma.accessToken.findFirst({
                    where: {
                        token,
                        userId: decoded.id,
                    },
                }),
            { label: 'authenticateToken lookup' },
        );

        if (!accessToken) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token',
            });
        }

        // Check if token is expired
        if (accessToken.expiresAt < new Date()) {
            // Optionally delete expired token
            await withDbRetry(
                () => prisma.accessToken.deleteMany({ where: { token } }),
                { label: 'authenticateToken delete expired' },
            );
            return res.status(401).json({
                success: false,
                message: 'Token has expired',
            });
        }

        // Set user info in request object
        req.user = {
            id: decoded.id,
            name: decoded.name,
            email: decoded.email,
            role: decoded.role,
            publicApprovalActor: decoded.publicApprovalActor,
        };

        next();
    } catch (error: any) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token',
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token has expired',
            });
        }
        if (isRetryableDbError(error)) {
            console.error('Authentication error (database unavailable):', error);
            return res.status(503).json({
                success: false,
                message: 'Database temporarily unavailable. Please try again.',
            });
        }
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error',
        });
        return;
    }
};

