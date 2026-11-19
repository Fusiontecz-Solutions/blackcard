import type { Request, Response } from 'express';
import {
  getSystemActivityLogContent,
  getSystemActivityLogs,
} from '../services/systemActivityLogService';

class ActivityLogController {
  async list(req: Request, res: Response) {
    try {
      const {
        page,
        limit,
        search,
        action,
        category,
        channel,
        recipientType,
        entity,
        userId,
        startDate,
        endDate,
      } = req.query;

      const result = await getSystemActivityLogs({
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
        search: typeof search === 'string' ? search : undefined,
        action: typeof action === 'string' ? action : undefined,
        category: typeof category === 'string' ? category : undefined,
        channel: typeof channel === 'string' ? channel : undefined,
        recipientType: typeof recipientType === 'string' ? recipientType : undefined,
        entity: typeof entity === 'string' ? entity : undefined,
        userId: typeof userId === 'string' ? userId : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
      });

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      console.error('[activityLogController.list]', error);
      return res.status(500).json({ success: false, message: 'Failed to fetch activity logs' });
    }
  }

  async getContent(req: Request, res: Response) {
    try {
      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Log id is required' });
      }

      const content = await getSystemActivityLogContent(id);
      if (!content) {
        return res.status(404).json({ success: false, message: 'Activity log not found' });
      }

      return res.status(200).json({ success: true, data: content });
    } catch (error) {
      console.error('[activityLogController.getContent]', error);
      return res.status(500).json({ success: false, message: 'Failed to load content' });
    }
  }
}

export default new ActivityLogController();
