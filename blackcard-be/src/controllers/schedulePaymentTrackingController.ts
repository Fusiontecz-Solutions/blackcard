import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import {
  listSchedulePaymentTrackingWithMatch,
  mapSchedulePaymentToApi,
  replaceSchedulePaymentTracking,
} from '../services/schedulePaymentTrackingService';
import { getApplicationForUser, type AuthenticatedUser } from '../services/applicationService';

const getAuthenticatedUser = (req: Request): AuthenticatedUser | null => {
  const user = (req as Request & { user?: { id?: string; role?: string } }).user;
  if (!user?.id) return null;
  return { id: user.id, role: user.role ?? '' };
};

const resolveApplicationWhere = (idParam: string): Prisma.ApplicationWhereUniqueInput =>
  /^\d+$/.test(idParam) ? { applicationId: Number(idParam) } : { id: idParam };

class SchedulePaymentTrackingController {
  async replaceForApplication(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const authUser = getAuthenticatedUser(req);
      const { application, forbidden } = await getApplicationForUser(resolveApplicationWhere(String(id)), authUser);

      if (forbidden) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: you do not have access to this application',
        });
      }

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const body = req.body as Record<string, unknown>;
      const payments = body.payments ?? body.paymentSchedule;

      const result = await replaceSchedulePaymentTracking(application.id, authUser, {
        paymentStartDate: typeof body.paymentStartDate === 'string' ? body.paymentStartDate : null,
        effectiveStartDate: typeof body.effectiveStartDate === 'string' ? body.effectiveStartDate : null,
        dealId: typeof body.dealId === 'string' ? body.dealId : null,
        payments: Array.isArray(payments) ? payments : [],
      });

      if (result.forbidden) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (result.notFound) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }
      if (result.badRequest) {
        return res.status(400).json({ success: false, message: result.message ?? 'Invalid request' });
      }

      return res.status(201).json({
        success: true,
        batchId: result.batchId,
        count: result.count,
        totalAmount: result.totalAmount,
        payments: result.payments,
      });
    } catch (error) {
      console.error('replaceSchedulePaymentTracking error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  async listForApplication(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const authUser = getAuthenticatedUser(req);
      const { application, forbidden } = await getApplicationForUser(resolveApplicationWhere(String(id)), authUser);

      if (forbidden) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: you do not have access to this application',
        });
      }

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      const statusRaw = typeof req.query.status === 'string' ? req.query.status.trim().toLowerCase() : 'scheduled';
      const batchId = typeof req.query.batchId === 'string' ? req.query.batchId.trim() : undefined;
      const dealId = typeof req.query.dealId === 'string' ? req.query.dealId.trim() : undefined;

      const result = await listSchedulePaymentTrackingWithMatch(application.id, authUser, {
        status: statusRaw === 'all' ? 'all' : (statusRaw as 'scheduled' | 'superseded' | 'cancelled'),
        batchId,
        dealId,
      });

      if (result.forbidden) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      return res.json({
        success: true,
        payments: result.payments,
        summary: result.summary,
      });
    } catch (error) {
      console.error('listSchedulePaymentTracking error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export default new SchedulePaymentTrackingController();
