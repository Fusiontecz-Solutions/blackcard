import cron, { validate as validateCronExpression } from 'node-cron';
import { refreshSuperAdminPlatformSnapshot } from '../services/superAdminPlatformService';

const DEFAULT_SUPER_ADMIN_PLATFORM_CRON = '*/5 * * * *';

let platformRefreshInProgress = false;

function resolveSuperAdminPlatformCronExpression(): string {
  const raw = String(process.env.SUPER_ADMIN_PLATFORM_CRON ?? '').trim();
  if (!raw) return DEFAULT_SUPER_ADMIN_PLATFORM_CRON;
  if (!validateCronExpression(raw)) {
    console.warn(
      `[super-admin-platform] invalid SUPER_ADMIN_PLATFORM_CRON="${raw}"; using default ${DEFAULT_SUPER_ADMIN_PLATFORM_CRON}`,
    );
    return DEFAULT_SUPER_ADMIN_PLATFORM_CRON;
  }
  return raw;
}

async function runSuperAdminPlatformRefresh(): Promise<void> {
  if (platformRefreshInProgress) {
    console.warn('[super-admin-platform] previous refresh still running; skipping this tick');
    return;
  }
  platformRefreshInProgress = true;
  try {
    const snapshot = await refreshSuperAdminPlatformSnapshot();
    console.log(
      `[super-admin-platform] refreshed at ${snapshot.lastRefreshedAt} (deals=${snapshot.dealCount}, clients=${snapshot.clientCount})`,
    );
  } catch (err) {
    console.error('[super-admin-platform] refresh failed:', err);
  } finally {
    platformRefreshInProgress = false;
  }
}

export function startSuperAdminPlatformCronJob(): void {
  const expression = resolveSuperAdminPlatformCronExpression();
  console.log(`[super-admin-platform] cron scheduled: "${expression}"`);
  cron.schedule(expression, () => {
    void runSuperAdminPlatformRefresh();
  });

  void runSuperAdminPlatformRefresh().catch((err) => {
    console.error('[super-admin-platform] initial refresh failed:', err);
  });
}
