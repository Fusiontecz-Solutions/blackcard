import type { Request, Response, NextFunction } from 'express';
import { tryRecordApplicationRouteActivity } from '../services/applicationSubActivityLog';
import { recordGenericAudit } from '../services/systemActivityLogService';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const SKIP_PATH_PREFIXES = [
  '/activity-logs',
  '/auth/refresh',
  '/health',
  '/google/test',
  '/notifications',
  '/chat',
  '/team-chat',
  '/sendgrid',
  // Sheet pushes carry the whole sheet; each run is kept in the sync's own status log.
  '/sheet-sync',
];

function shouldSkip(path: string, method: string): boolean {
  if (!MUTATING.has(method)) return true;
  const normalized = path.replace(/^\/api\/v1/, '') || path;
  return SKIP_PATH_PREFIXES.some((p) => normalized.startsWith(p));
}

function deriveAction(method: string): string {
  switch (method) {
    case 'POST':
      return 'CREATE';
    case 'PUT':
    case 'PATCH':
      return 'UPDATE';
    case 'DELETE':
      return 'DELETE';
    default:
      return method;
  }
}

function deriveEntity(path: string): string {
  const parts = path.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
  if (parts.length === 0) return 'System';
  const segment = parts[0].replace(/-/g, ' ');
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

export function activityLogger(req: Request, res: Response, next: NextFunction): void {
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  const method = req.method.toUpperCase();

  if (shouldSkip(pathOnly, method)) {
    next();
    return;
  }

  res.on('finish', () => {
    if (req.__activityLogged) return;
    if (!req.user) return;
    if (res.statusCode >= 400) return;

    void tryRecordApplicationRouteActivity(req, res.statusCode)
      .then(() => {
        if (req.__activityLogged) return;
        const action = deriveAction(method);
        const entity = deriveEntity(pathOnly);
        const description = `${action} ${entity} via ${method} ${pathOnly}`;
        return recordGenericAudit(req, {
          action,
          entity,
          description,
        });
      })
      .catch((err: any) => {
        console.error('[activityLogger] failed to record audit:', err);
      });
  });

  next();
}
