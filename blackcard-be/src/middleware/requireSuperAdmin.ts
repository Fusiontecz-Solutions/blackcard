import type { Request, Response, NextFunction } from 'express';

/**
 * Requires req.user to be set (use after authenticateToken) and role SUPER_ADMIN.
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }
  const role = String(req.user.role || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (role !== 'SUPER_ADMIN' && role !== 'SUPERADMIN') {
    res.status(403).json({ success: false, message: 'Super admin access required' });
    return;
  }
  next();
}
