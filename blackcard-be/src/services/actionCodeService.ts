import prisma from '../config/prismaClient';

/**
 * Lightweight, in-memory action-code service used to gate sensitive application
 * mutations (edit / delete) behind a one-time 4-digit code that is delivered to
 * Super Admins. There is intentionally no DB model: codes are short-lived and
 * stored in process memory, which keeps this self-contained and migration-free.
 */

export type ActionCodeOperation = 'edit' | 'delete';

/** Thrown when a supplied action code is missing, wrong, expired, or already used. */
export class ActionCodeValidationError extends Error {
    statusCode: number;

    constructor(message: string, statusCode = 400) {
        super(message);
        this.name = 'ActionCodeValidationError';
        this.statusCode = statusCode;
    }
}

type StoredActionCode = {
    code: string;
    operation: ActionCodeOperation;
    expiresAtMs: number;
    requestedByUserId: string | null;
};

/** Keyed by `${applicationId}:${operation}` so edit and delete codes don't collide. */
const actionCodeStore = new Map<string, StoredActionCode>();

/** Codes are valid for 15 minutes. */
const ACTION_CODE_TTL_MS = 1000 * 60 * 15;

const buildKey = (applicationId: string, operation: ActionCodeOperation): string =>
    `${applicationId}:${operation}`;

const purgeExpiredCodes = (nowMs = Date.now()): void => {
    for (const [key, entry] of actionCodeStore.entries()) {
        if (entry.expiresAtMs <= nowMs) {
            actionCodeStore.delete(key);
        }
    }
};

const generateFourDigitCode = (): string =>
    Math.floor(1000 + Math.random() * 9000).toString();

/**
 * Roles that must supply an action code before editing / deleting an application.
 * Elevated roles (Super Admin) bypass the requirement.
 */
export const requiresActionCodeForRole = (role: string | null | undefined): boolean => {
    const normalized = String(role ?? '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
    return normalized !== 'SUPER_ADMIN';
};

/**
 * Generate (and persist in memory) a one-time action code for the given application
 * + operation, then notify all Super Admins with the code. Returns the code and its
 * expiry so the caller can surface the expiry to the requester.
 */
export async function generateApplicationActionCode(
    applicationId: string,
    operation: ActionCodeOperation,
    requestedByUserId: string | null,
): Promise<{ code: string; operation: ActionCodeOperation; expiresAt: Date }> {
    purgeExpiredCodes();

    const code = generateFourDigitCode();
    const expiresAtMs = Date.now() + ACTION_CODE_TTL_MS;
    actionCodeStore.set(buildKey(applicationId, operation), {
        code,
        operation,
        expiresAtMs,
        requestedByUserId,
    });

    const expiresAt = new Date(expiresAtMs);

    // Best-effort: notify Super Admins with the generated code. Never block the
    // response if the notification write fails.
    try {
        const superAdmins = await prisma.user.findMany({
            where: { role: 'SUPER_ADMIN', isActive: true },
            select: { id: true },
        });
        const recipientIds = superAdmins
            .map((u) => String(u.id))
            .filter((id) => id && id !== String(requestedByUserId ?? ''));

        if (recipientIds.length > 0) {
            const title = `Action code for ${operation === 'delete' ? 'deletion' : 'edit'}`;
            const message = `A one-time ${operation} code (${code}) was requested for an application. It expires at ${expiresAt.toISOString()}.`;
            await prisma.notification.createMany({
                data: recipientIds.map((recipientId) => ({
                    title,
                    message,
                    type: 'application_update',
                    recipientId,
                    applicationId,
                    createdById: requestedByUserId || null,
                })),
            });
        }
    } catch (notifyErr) {
        console.error('Failed to notify Super Admins of action code:', notifyErr);
    }

    return { code, operation, expiresAt };
}

/**
 * Validate a supplied code for an application + operation. Throws
 * `ActionCodeValidationError` on any mismatch / expiry. Does not consume the code
 * (call `markApplicationActionCodeUsed` after the mutation succeeds).
 */
export async function validateApplicationActionCode(
    applicationId: string,
    code: string | null | undefined,
    operation: ActionCodeOperation,
): Promise<void> {
    purgeExpiredCodes();

    const supplied = String(code ?? '').trim();
    if (!supplied) {
        throw new ActionCodeValidationError('An action code is required for this operation.');
    }

    const entry = actionCodeStore.get(buildKey(applicationId, operation));
    if (!entry) {
        throw new ActionCodeValidationError(
            'No active action code found. Request a new code and try again.',
        );
    }
    if (entry.expiresAtMs <= Date.now()) {
        actionCodeStore.delete(buildKey(applicationId, operation));
        throw new ActionCodeValidationError('Action code has expired. Request a new code.');
    }
    if (entry.code !== supplied) {
        throw new ActionCodeValidationError('Invalid action code.');
    }
}

/** Consume / invalidate the action code(s) for an application after a successful mutation. */
export async function markApplicationActionCodeUsed(applicationId: string): Promise<void> {
    actionCodeStore.delete(buildKey(applicationId, 'edit'));
    actionCodeStore.delete(buildKey(applicationId, 'delete'));
}
