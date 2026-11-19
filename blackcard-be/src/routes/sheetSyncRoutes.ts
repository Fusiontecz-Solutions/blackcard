import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import type { SheetTabs } from '../services/sheetSync/sheetSource';
import {
    getSheetSyncRun,
    sheetSyncTabNames,
    startLinkSheetSync,
    startPushedSheetSync,
    type SyncRun,
} from '../services/sheetSync/sheetSyncRunner';

/**
 * Google Sheet → CRM sync. PUBLIC routes guarded by a shared secret (header
 * `x-sheet-sync-secret` = SHEET_SYNC_PUSH_SECRET), like the SendGrid webhook.
 *
 *   POST /push    tabs sent by the Apps Script bound to the sheet (appsScript.gs)
 *   POST /pull    downloads the link-shared sheet (SHEET_SYNC_SHEET_ID) — same as the daily job
 *   GET  /status  latest run, or ?runId=
 *
 * Runs are answered at once (202) and continue in the background, because Apps Script gives up
 * on a request after about a minute. Body `{ "dryRun": true }` forces a dry run.
 */
const router = Router();

function requireSecret(req: Request, res: Response, next: NextFunction): void {
    const expected = process.env.SHEET_SYNC_PUSH_SECRET ?? '';
    const given = String(req.header('x-sheet-sync-secret') ?? '');
    const ok =
        expected.length >= 24 &&
        given.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
    if (!ok) {
        res.status(401).json({ success: false, message: 'Invalid sheet sync secret.' });
        return;
    }
    next();
}

function started(res: Response, run: SyncRun | null): void {
    if (!run) {
        res.status(409).json({ success: false, message: 'A sync is already running; try again when it finishes.' });
        return;
    }
    res.status(202).json({ success: true, runId: run.id, mode: run.mode, writesDisabledBecause: run.writesDisabledBecause });
}

router.post('/push', requireSecret, (req: Request, res: Response) => {
    const tabs = (req.body?.tabs ?? {}) as SheetTabs;
    const missing = sheetSyncTabNames().filter((name) => !Array.isArray(tabs[name]));
    if (missing.length) {
        res.status(400).json({ success: false, message: `Missing tab(s): ${missing.join(', ')}` });
        return;
    }
    started(res, startPushedSheetSync(tabs, req.body?.dryRun === true));
});

router.post('/pull', requireSecret, (req: Request, res: Response) => {
    try {
        started(res, startLinkSheetSync(req.body?.dryRun === true));
    } catch (err) {
        res.status(400).json({ success: false, message: err instanceof Error ? err.message : String(err) });
    }
});

router.get('/status', requireSecret, (req: Request, res: Response) => {
    const run = getSheetSyncRun(req.query.runId ? String(req.query.runId) : null);
    if (!run) {
        res.status(404).json({ success: false, message: 'No sync run found.' });
        return;
    }
    res.json({ success: true, run });
});

export default router;
