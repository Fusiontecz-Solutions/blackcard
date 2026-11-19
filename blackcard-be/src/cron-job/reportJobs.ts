/**
 * Reporting cron jobs:
 *  - incremental sync of tenant applications (REPORT_SYNC_CRON, default every 15 min)
 *  - full nightly resync + snapshot rollup (REPORT_FULL_SYNC_CRON, default 01:30)
 *  - scheduled report emails (checked every minute)
 *
 * REPORT_JOBS_ENABLED=false disables all three.
 */
import cron from 'node-cron';
import { syncAllBooks, syncAllBooksIncremental } from '../services/reporting/reportSyncService';
import { runDueSchedules } from '../services/reporting/reportScheduleService';

const TZ = process.env.REPORT_CRON_TZ || 'America/New_York';

function enabled(): boolean {
  const v = String(process.env.REPORT_JOBS_ENABLED ?? 'true').trim().toLowerCase();
  return !['0', 'false', 'no', 'off'].includes(v);
}

function expr(envKey: string, fallback: string): string {
  const raw = String(process.env[envKey] ?? '').trim();
  if (raw && cron.validate(raw)) return raw;
  if (raw) console.warn(`[report-jobs] invalid ${envKey}="${raw}", using "${fallback}"`);
  return fallback;
}

let scheduleTickRunning = false;

export function startReportJobs(): void {
  if (!enabled()) {
    console.log('[report-jobs] disabled via REPORT_JOBS_ENABLED');
    return;
  }
  const incremental = expr('REPORT_SYNC_CRON', '*/15 * * * *');
  const full = expr('REPORT_FULL_SYNC_CRON', '30 1 * * *');

  cron.schedule(incremental, () => {
    void syncAllBooksIncremental('cron').catch((err) => console.error('[report-jobs] incremental sync failed:', err));
  }, { timezone: TZ });

  cron.schedule(full, () => {
    void syncAllBooks({ trigger: 'cron-full' }).catch((err) => console.error('[report-jobs] full sync failed:', err));
  }, { timezone: TZ });

  cron.schedule('* * * * *', () => {
    if (scheduleTickRunning) return;
    scheduleTickRunning = true;
    void runDueSchedules()
      .then((r) => {
        if (r.length) console.log(`[report-jobs] delivered ${r.length} scheduled report(s)`);
      })
      .catch((err) => console.error('[report-jobs] schedule tick failed:', err))
      .finally(() => {
        scheduleTickRunning = false;
      });
  }, { timezone: TZ });

  console.log(`[report-jobs] scheduled: incremental "${incremental}", full "${full}", schedules every minute (tz=${TZ})`);
}
