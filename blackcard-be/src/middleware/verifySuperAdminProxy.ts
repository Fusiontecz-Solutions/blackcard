
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** True iff the request carried a valid Super Admin proxy signature. */
      isSuperAdminProxy?: boolean;
      /** Tenant identity that Super Admin claimed to be proxying for. */
      superAdminContext?: {
        tenantId?: string;
        tenantCode?: string;
        /** Optional actor metadata: the human Super Admin user behind the call. */
        actorId?: string;
        actorEmail?: string;
        actorName?: string;
        /** SUPER_ADMIN | SCRUBBING | UNDERWRITER — from SA panel actor. */
        actorRole?: string;
      };
    }
  }
}

const PROXY_HEADER = 'x-super-admin-proxy';
const SECRET_HEADER = 'x-super-admin-secret';
const LEGACY_SECRET_HEADER = 'x-super-admin-proxy-secret';
const TENANT_ID_HEADER = 'x-super-admin-tenant-id';
const TENANT_CODE_HEADER = 'x-super-admin-tenant-code';
const LEGACY_TENANT_ID_HEADER = 'x-super-admin-book-id';
const LEGACY_TENANT_CODE_HEADER = 'x-super-admin-book-code';
// Optional actor identity headers, forwarded so the tenant can attribute the
// action to the Super Admin human user without ever validating their JWT.
const ACTOR_ID_HEADER = 'x-super-admin-actor-id';
const ACTOR_EMAIL_HEADER = 'x-super-admin-actor-email';
const ACTOR_NAME_HEADER = 'x-super-admin-actor-name';
const ACTOR_ROLE_HEADER = 'x-super-admin-actor-role';

const pickHeader = (req: Request, name: string): string | undefined => {
  const raw = req.headers[name];
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return crypto.timingSafeEqual(bufA, bufB);
};

/**
 * Tenant-side gateway for trusted backend-to-backend traffic from the
 * centralized Super Admin service.
 *
 * Contract:
 *   - No proxy/secret headers present   → pass through; regular tenant JWT
 *     middleware will run downstream.
 *   - Headers present but invalid       → reject with 401.
 *   - Headers present and valid         → mark `req.isSuperAdminProxy = true`
 *     and stash the claimed tenant + actor context on `req.superAdminContext`.
 *     The downstream JWT middleware MUST then short-circuit (see
 *     `authenticateToken`) and treat the request as a fully trusted internal
 *     call.
 */
export function verifySuperAdminProxy(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const proxyFlag = pickHeader(req, PROXY_HEADER);
  const presentedSecret =
    pickHeader(req, SECRET_HEADER) || pickHeader(req, LEGACY_SECRET_HEADER);

  // No proxy claim at all → continue and let the regular tenant JWT middleware run.
  if (!proxyFlag && !presentedSecret) {
    return next();
  }

  const expectedSecret = (process.env.SUPER_ADMIN_SECRET || '').trim();
  if (!expectedSecret) {
    console.error(
      '[verifySuperAdminProxy] SUPER_ADMIN_SECRET is not configured on the tenant backend.',
    );
    res.status(500).json({
      success: false,
      message: 'Tenant misconfigured: SUPER_ADMIN_SECRET is not set.',
    });
    return;
  }

  // Header presented but malformed / mismatched → reject loudly.
  if (
    !presentedSecret ||
    !proxyFlag ||
    (proxyFlag.toLowerCase() !== 'true' && proxyFlag !== '1') ||
    !constantTimeEquals(presentedSecret, expectedSecret)
  ) {
    res.status(401).json({
      success: false,
      message: 'Invalid Super Admin proxy credentials.',
    });
    return;
  }

  req.isSuperAdminProxy = true;
  req.superAdminContext = {
    tenantId:
      pickHeader(req, TENANT_ID_HEADER) || pickHeader(req, LEGACY_TENANT_ID_HEADER),
    tenantCode:
      pickHeader(req, TENANT_CODE_HEADER) ||
      pickHeader(req, LEGACY_TENANT_CODE_HEADER),
    actorId: pickHeader(req, ACTOR_ID_HEADER),
    actorEmail: pickHeader(req, ACTOR_EMAIL_HEADER),
    actorName: pickHeader(req, ACTOR_NAME_HEADER),
    actorRole: pickHeader(req, ACTOR_ROLE_HEADER),
  };

  next();
}

/**
 * Convenience composite: drop this in front of any router that must accept
 * BOTH tenant-user requests (via JWT) and Super Admin proxy requests (via the
 * signed headers above).
 *
 *   router.use(superAdminProxyAware(authenticateTenantJwt));
 */
export function superAdminProxyAware(
  tenantJwtMiddleware: (req: Request, res: Response, next: NextFunction) => unknown,
) {
  return [
    verifySuperAdminProxy,
    (req: Request, res: Response, next: NextFunction) => {
      if (req.isSuperAdminProxy) return next();
      return tenantJwtMiddleware(req, res, next);
    },
  ];
}
