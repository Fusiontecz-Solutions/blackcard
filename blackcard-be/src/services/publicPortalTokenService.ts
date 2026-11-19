import crypto from 'crypto';
import prisma from '../config/prismaClient';

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

const generateNonGuessableToken = () => crypto.randomBytes(32).toString('base64url');

let publicApprovalTokenTableExistsCache: boolean | null = null;

export async function isPublicPortalTokenTableReady(): Promise<boolean> {
  // Only a positive answer is cached: a failed check must be retried, otherwise one
  // early miss would leave every later document-request link empty until restart.
  if (publicApprovalTokenTableExistsCache) {
    return true;
  }
  const rows = await prisma.$queryRaw<{ regclass: string | null }[]>`
    SELECT to_regclass('public."PublicApprovalToken"')::text AS regclass
  `;
  publicApprovalTokenTableExistsCache = Boolean(rows?.[0]?.regclass);
  return publicApprovalTokenTableExistsCache;
}

/**
 * Creates a row in PublicApprovalToken and returns the raw secret (shown once — e.g. in email links).
 * Same storage as approval share links; scoped access is enforced by which public page consumes the token.
 */
export async function createPublicPortalToken(
  applicationUuid: string,
  options?: { expiresInDays?: number },
): Promise<string | null> {
  if (!(await isPublicPortalTokenTableReady())) {
    return null;
  }

  let expiresAt: Date | undefined;
  if (
    typeof options?.expiresInDays === 'number' &&
    Number.isFinite(options.expiresInDays) &&
    options.expiresInDays > 0
  ) {
    expiresAt = new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000);
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateNonGuessableToken();
    const tokenHash = sha256Hex(token);
    try {
      await prisma.publicApprovalToken.create({
        data: {
          tokenHash,
          applicationId: applicationUuid,
          expiresAt: expiresAt ?? undefined,
        },
      });
      return token;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'P2002') continue;
      throw err;
    }
  }
  return null;
}

export type ResolvedPortalToken = {
  applicationId: string;
  expiresAt: Date | null;
};

/**
 * Resolve a public portal secret to an application UUID.
 * Falls back to treating the token as an application UUID when the token table is unavailable.
 */
export async function resolvePortalToken(token: string): Promise<ResolvedPortalToken | null> {
  const secret = String(token || '').trim();
  if (!secret) return null;

  const isUuidLikeToken =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(secret);

  if (await isPublicPortalTokenTableReady()) {
    const tokenRecord = await prisma.publicApprovalToken.findUnique({
      where: { tokenHash: sha256Hex(secret) },
    });
    if (tokenRecord) {
      if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
        return null;
      }
      return {
        applicationId: tokenRecord.applicationId,
        expiresAt: tokenRecord.expiresAt ?? null,
      };
    }
  }

  if (isUuidLikeToken) {
    const app = await prisma.application.findUnique({
      where: { id: secret },
      select: { id: true },
    });
    if (app) {
      return { applicationId: app.id, expiresAt: null };
    }
  }

  return null;
}

export { sha256Hex };
