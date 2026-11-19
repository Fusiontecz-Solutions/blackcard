import type { Request, Response, NextFunction } from 'express';

function normalizeRoleKey(role: string): string {
    return String(role || '')
        .trim()
        .toUpperCase()
        .replace(/-/g, '_');
}

/**
 * Reject requests from users whose role is in the denied list.
 *
 * Usage:
 *   router.use(authenticateToken, forbidRoles('AGENT'), handler);
 */
export function forbidRoles(...deniedRoles: string[]) {
    const denied = new Set(deniedRoles.map(normalizeRoleKey));

    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
            return;
        }

        const role = normalizeRoleKey(req.user.role);
        if (denied.has(role)) {
            res.status(403).json({
                success: false,
                message: 'Forbidden: your role cannot access this resource',
            });
            return;
        }

        next();
    };
}
