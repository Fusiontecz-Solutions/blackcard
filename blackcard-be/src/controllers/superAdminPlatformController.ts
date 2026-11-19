import type { Request, Response } from 'express';
import { getContractAnalyticsForSuperAdmin } from '../services/contractAnalyticsService';
import {
  getSuperAdminPlatformSnapshot,
  refreshSuperAdminPlatformSnapshot,
} from '../services/superAdminPlatformService';

function parseOptionalIsoDate(
  value: unknown,
  fieldName: 'from' | 'to',
): { ok: true; date?: Date } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: `Invalid ${fieldName} date: expected an ISO date string` };
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: `Invalid ${fieldName} date: "${value}" is not a valid ISO date` };
  }
  return { ok: true, date: parsed };
}

class SuperAdminPlatformController {
  /** GET cached platform KPIs (refreshed on a schedule). */
  async getSnapshot(req: Request, res: Response) {
    try {
      const refreshIfMissing = String(req.query.refreshIfMissing ?? '').toLowerCase() === 'true';
      const snapshot = await getSuperAdminPlatformSnapshot({ refreshIfMissing });

      if (!snapshot) {
        return res.status(404).json({
          success: false,
          message: 'Platform metrics not initialized yet. POST /super-admin-platform/refresh or wait for the cron job.',
        });
      }

      return res.status(200).json({ success: true, data: snapshot });
    } catch (error: unknown) {
      console.error('getSuperAdminPlatformSnapshot error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({ success: false, message });
    }
  }

  /**
   * POST force-refresh from live CRM data.
   * Query `wait=false` returns immediately with the last cached snapshot and refreshes in the background.
   */
  async refreshSnapshot(req: Request, res: Response) {
    try {
      const wait = String(req.query.wait ?? 'true').toLowerCase() !== 'false';

      if (!wait) {
        const cached =
          (await getSuperAdminPlatformSnapshot()) ??
          (await getSuperAdminPlatformSnapshot({ refreshIfMissing: true }));

        void refreshSuperAdminPlatformSnapshot().catch((err) => {
          console.error('background refreshSuperAdminPlatformSnapshot error:', err);
        });

        return res.status(202).json({
          success: true,
          refreshing: true,
          data: cached,
        });
      }

      const snapshot = await refreshSuperAdminPlatformSnapshot();
      return res.status(200).json({ success: true, data: snapshot });
    } catch (error: unknown) {
      console.error('refreshSuperAdminPlatformSnapshot error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({ success: false, message });
    }
  }

  /**
   * GET live contract funnel analytics (stages, rates, contract status amounts).
   * Optional query: `from`, `to` (ISO dates). Apps filter on updatedAt; contracts on createdAt.
   */
  async getContractAnalytics(req: Request, res: Response) {
    try {
      const fromResult = parseOptionalIsoDate(req.query.from, 'from');
      if (!fromResult.ok) {
        return res.status(400).json({ success: false, message: fromResult.message });
      }
      const toResult = parseOptionalIsoDate(req.query.to, 'to');
      if (!toResult.ok) {
        return res.status(400).json({ success: false, message: toResult.message });
      }

      if (fromResult.date && toResult.date && fromResult.date.getTime() > toResult.date.getTime()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date range: `from` must be before or equal to `to`',
        });
      }

      const data = await getContractAnalyticsForSuperAdmin({
        from: fromResult.date,
        to: toResult.date,
      });

      return res.status(200).json({ success: true, data });
    } catch (error: unknown) {
      console.error('getContractAnalytics error:', error);
      const message = error instanceof Error ? error.message : 'Internal server error';
      return res.status(500).json({ success: false, message });
    }
  }
}

export default new SuperAdminPlatformController();
