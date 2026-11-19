import type { Request, Response } from 'express';
import { resolveTenantUserId } from '../middleware/authMiddleware';
import {
    dismissSkippedGmailAutoCreateRows,
    listSkippedGmailAutoCreateRows,
    retrySkippedGmailAutoCreateRows,
} from '../services/gmailAutoCreateReview.service';

const MAX_IDS = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same gate as GET /gmail/health: Super Admin proxy, SUPER_ADMIN or ADMIN. */
function isPrivileged(req: Request): boolean {
    const role = String(req.user?.role || '').toUpperCase();
    return req.isSuperAdminProxy === true || role === 'SUPER_ADMIN' || role === 'ADMIN';
}

function parseDate(value: unknown): Date | null {
    const raw = String(value ?? '').trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
}

function parseIds(body: any): string[] | null {
    const raw = Array.isArray(body?.ids) ? body.ids : body?.id ? [body.id] : [];
    const ids = Array.from(new Set(raw.map((v: unknown) => String(v || '').trim()))).filter(
        (v): v is string => UUID_RE.test(v as string),
    );
    if (ids.length === 0 || ids.length > MAX_IDS) return null;
    return ids;
}

/** GET /api/v1/gmail/auto-create/skipped */
export async function getSkippedAutoCreateEmails(req: Request, res: Response): Promise<void> {
    try {
        if (!isPrivileged(req)) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }
        const statusRaw = String(req.query.status || 'open');
        const status = statusRaw === 'dismissed' || statusRaw === 'all' ? statusRaw : 'open';
        const data = await listSkippedGmailAutoCreateRows({
            page: Number(req.query.page) || 1,
            pageSize: Number(req.query.pageSize) || 25,
            reason: req.query.reason ? String(req.query.reason) : null,
            status,
            from: parseDate(req.query.from),
            to: parseDate(req.query.to),
            search: req.query.search ? String(req.query.search) : null,
        });
        res.json({ success: true, data });
    } catch (error: any) {
        console.error('[gmail-auto-create] list skipped failed:', error?.message || error);
        res.status(500).json({ success: false, message: 'Failed to load skipped emails' });
    }
}

/** POST /api/v1/gmail/auto-create/skipped/retry  { ids: string[], force?: boolean } */
export async function retrySkippedAutoCreateEmails(req: Request, res: Response): Promise<void> {
    try {
        if (!isPrivileged(req)) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }
        const ids = parseIds(req.body);
        if (!ids) {
            res.status(400).json({ success: false, message: `Provide 1-${MAX_IDS} ledger ids` });
            return;
        }
        const results = await retrySkippedGmailAutoCreateRows(ids, { force: req.body?.force === true });
        console.log(
            `[gmail-auto-create] retry skipped by=${req.user?.email || req.user?.id || 'unknown'} ids=${ids.length} force=${req.body?.force === true}`,
        );
        res.json({
            success: true,
            data: { retried: results.filter((r) => r.ok).length, results },
        });
    } catch (error: any) {
        console.error('[gmail-auto-create] retry skipped failed:', error?.message || error);
        res.status(500).json({ success: false, message: 'Failed to retry skipped emails' });
    }
}

/** POST /api/v1/gmail/auto-create/skipped/dismiss  { ids: string[] } */
export async function dismissSkippedAutoCreateEmails(req: Request, res: Response): Promise<void> {
    try {
        if (!isPrivileged(req)) {
            res.status(403).json({ success: false, message: 'Forbidden' });
            return;
        }
        const ids = parseIds(req.body);
        if (!ids) {
            res.status(400).json({ success: false, message: `Provide 1-${MAX_IDS} ledger ids` });
            return;
        }
        const dismissed = await dismissSkippedGmailAutoCreateRows(ids, resolveTenantUserId(req));
        res.json({ success: true, data: { dismissed } });
    } catch (error: any) {
        console.error('[gmail-auto-create] dismiss skipped failed:', error?.message || error);
        res.status(500).json({ success: false, message: 'Failed to dismiss skipped emails' });
    }
}
