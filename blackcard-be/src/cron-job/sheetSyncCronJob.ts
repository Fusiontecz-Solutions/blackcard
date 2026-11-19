import cron, { validate as validateCronExpression } from 'node-cron';
import { startLinkSheetSync } from '../services/sheetSync/sheetSyncRunner';

/**
 * Daily Google Sheet → CRM sync from the link-shared sheet. Off unless SHEET_SYNC_SHEET_ID and
 * SHEET_SYNC_CRON are both set; writes follow the same env guards as every sheet sync run.
 */
export function startSheetSyncCronJob(): void {
    const sheetId = String(process.env.SHEET_SYNC_SHEET_ID ?? '').trim();
    const expression = String(process.env.SHEET_SYNC_CRON ?? '').trim();
    if (!sheetId || !expression) return;
    if (!validateCronExpression(expression)) {
        console.warn(`[sheet-sync] invalid SHEET_SYNC_CRON="${expression}"; daily sync not scheduled`);
        return;
    }
    const timezone = process.env.SHEET_SYNC_TIMEZONE?.trim() || 'America/New_York';
    console.log(`[sheet-sync] cron scheduled: "${expression}" (${timezone})`);
    cron.schedule(
        expression,
        () => {
            try {
                if (!startLinkSheetSync(false)) console.warn('[sheet-sync] previous run still going; skipping this tick');
            } catch (err) {
                console.error('[sheet-sync] could not start:', err);
            }
        },
        { timezone },
    );
}
