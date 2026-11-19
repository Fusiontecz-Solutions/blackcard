import type { Request, Response } from 'express';
import {
  getUnderwriterRoutingConfig,
  setDesignatedUnderwriters,
  UnderwriterRoutingError,
  type RoutingUnderwriter,
} from '../services/underwriterRoutingService';

function underwriterName(user: RoutingUnderwriter): string {
  return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
}

/** Accepts `underwriterIds: string[]`, or a single `underwriterId` for convenience. */
function readRequestedIds(body: unknown): string[] {
  const payload = (body ?? {}) as { underwriterIds?: unknown; underwriterId?: unknown };
  if (Array.isArray(payload.underwriterIds)) {
    return payload.underwriterIds.map((id) => String(id ?? '').trim()).filter(Boolean);
  }
  const single = payload.underwriterId == null ? '' : String(payload.underwriterId).trim();
  return single ? [single] : [];
}

class UnderwriterRoutingController {
  /** GET the underwriter(s) this book's cases are routed to (empty = no routing). */
  async getConfig(_req: Request, res: Response) {
    try {
      const data = await getUnderwriterRoutingConfig();
      return res.status(200).json({ success: true, data });
    } catch (error: unknown) {
      console.error('getUnderwriterRoutingConfig error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** PUT the selection; send an empty list to turn routing off. */
  async setConfig(req: Request, res: Response) {
    try {
      const { config, assignedCount } = await setDesignatedUnderwriters({
        underwriterIds: readRequestedIds(req.body),
        actorId: req.user?.id ?? null,
      });

      let message = 'Underwriter routing cleared';
      if (config.autoAssign) {
        const name = underwriterName(config.underwriters[0]);
        message = `All cases now route to ${name}${
          assignedCount ? ` — ${assignedCount} unassigned case(s) moved over` : ''
        }`;
      } else if (config.underwriterIds.length > 1) {
        message = `${config.underwriterIds.length} underwriters can now see all cases (no auto-assign)`;
      }

      return res.status(200).json({
        success: true,
        message,
        data: { ...config, assignedCount },
      });
    } catch (error: unknown) {
      if (error instanceof UnderwriterRoutingError) {
        return res.status(error.status).json({ success: false, message: error.message });
      }
      console.error('setUnderwriterRoutingConfig error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export default new UnderwriterRoutingController();
