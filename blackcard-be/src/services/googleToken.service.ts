import { google } from 'googleapis';
import prisma from '../config/prismaClient';

const userSelect = {
    id: true,
    email: true,
    googleRefreshToken: true,
    googleOAuths: { select: { refreshToken: true, email: true } },
} as const;

export type GmailUserRow = {
    id: string;
    email: string;
    googleRefreshToken: string | null;
    googleOAuths: { refreshToken: string; email: string } | null;
};

/** Prefer User.googleRefreshToken; fall back to linked GoogleOAuth row. */
export function getGoogleRefreshTokenForUser(user: GmailUserRow): string | null {
    const onUser = String(user.googleRefreshToken || '').trim();
    if (onUser) return onUser;
    const onOAuth = String(user.googleOAuths?.refreshToken || '').trim();
    if (onOAuth) return onOAuth;
    return null;
}

/** Resolve CRM user for Gmail OAuth (JWT session, then explicit id/email). */
export async function findUserForGmailAccess(options: {
    authUserId?: string;
    userId?: string;
    email?: string;
}): Promise<GmailUserRow | null> {
    const { authUserId, userId, email } = options;

    if (authUserId) {
        const byAuth = await prisma.user.findUnique({
            where: { id: authUserId },
            select: userSelect,
        });
        if (byAuth) return byAuth;
    }

    if (userId?.trim()) {
        const byId = await prisma.user.findUnique({
            where: { id: userId.trim() },
            select: userSelect,
        });
        if (byId) return byId;
    }

    if (email?.trim()) {
        const byEmail = await prisma.user.findFirst({
            where: {
                email: { equals: email.trim().toLowerCase(), mode: 'insensitive' },
            },
            select: userSelect,
        });
        if (byEmail) return byEmail;
    }

    return null;
}

function getGoogleRedirectUri(): string {
    return (
        process.env.GOOGLE_REDIRECT_URI ||
        'https://www.woodmere.finexusai.com/backend/api/v1/google/callback'
    );
}

function createOAuth2Client() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        getGoogleRedirectUri(),
    );
}

function formatGoogleTokenError(error: unknown): string {
    const err = error as {
        message?: string;
        response?: { data?: { error?: string; error_description?: string } };
    };
    const code = String(err?.response?.data?.error || '').trim();
    const description = String(err?.response?.data?.error_description || '').trim();
    if (code === 'invalid_grant') {
        return 'Gmail connection expired or was revoked. Reconnect Google from the Gmail page.';
    }
    if (description) return description;
    if (err?.message) return err.message;
    return 'Failed to generate Gmail access token from refresh token';
}

/** Mint a short-lived Gmail access token from a stored refresh token. */
export async function mintGmailAccessToken(refreshToken: string): Promise<string> {
    const client = createOAuth2Client();
    client.setCredentials({ refresh_token: refreshToken.trim() });
    try {
        const accessTokenResponse = await client.getAccessToken();
        const token = accessTokenResponse?.token;
        if (!token) {
            throw new Error('Failed to generate Gmail access token from refresh token');
        }
        return token;
    } catch (error: unknown) {
        throw new Error(formatGoogleTokenError(error));
    }
}

/** Load stored refresh token and mint an access token. */
export async function getGmailAccessTokenForUserId(userId: string): Promise<string> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: userSelect,
    });
    if (!user) {
        throw new Error('User not found');
    }
    const refreshToken = getGoogleRefreshTokenForUser(user);
    if (!refreshToken) {
        throw new Error(
            'Gmail is not connected for this user. Connect Google from the Gmail page.',
        );
    }
    return mintGmailAccessToken(refreshToken);
}

/**
 * Prefer an explicit token from the client; otherwise mint from the logged-in
 * user's stored Google refresh token (User or GoogleOAuth table).
 */
export async function resolveGmailAccessToken(options: {
    explicitAccessToken?: string;
    authUserId?: string;
    userId?: string;
    email?: string;
}): Promise<string> {
    const user = await findUserForGmailAccess({
        authUserId: options.authUserId,
        userId: options.userId,
        email: options.email,
    });

    if (user) {
        const refreshToken = getGoogleRefreshTokenForUser(user);
        if (refreshToken) {
            return mintGmailAccessToken(refreshToken);
        }
    }

    const explicit = String(options.explicitAccessToken || '').trim();
    if (explicit) return explicit;

    if (!user) {
        throw new Error(
            'Could not resolve CRM user for Gmail. Sign in again or pass a valid userId/email.',
        );
    }

    throw new Error(
        'Gmail is not connected for this user. Connect Google from the Gmail page.',
    );
}
