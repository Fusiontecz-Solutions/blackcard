import type { NextFunction, Request, Response } from 'express';
import { opencorporatesService } from '../services/opencorporatesService';

export const opencorporatesController = {
  async importForApplication(request: Request, response: Response, next: NextFunction) {
    try {
      const applicationId = String(request.params.applicationId ?? '').trim();
      const result = await opencorporatesService.importForApplication(applicationId, request.body);
      response.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async syncToClient(request: Request, response: Response, next: NextFunction) {
    try {
      const applicationId = String(request.params.applicationId ?? '').trim();
      const user = opencorporatesService.getAuthenticatedUser(request);
      const result = await opencorporatesService.syncToClient(
        applicationId,
        request.body,
        user,
        request,
      );
      response.status(200).json({
        success: true,
        message: 'OpenCorporates values synced to application.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
