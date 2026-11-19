import type { Request, Response, NextFunction } from 'express';

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

/**
 * Requires req.user to be set (use after authenticateToken) and role ADMIN or SUPER_ADMIN.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  if (!ADMIN_ROLES.has(req.user.role)) {
    res.status(403).json({ success: false, message: 'Admin access required' });
    return;
  }
  next();
}
