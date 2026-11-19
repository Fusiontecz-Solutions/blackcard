import type { NextFunction, Request, Response } from 'express';
import { clearService } from '../services/clearService';
import { runClearPersonLookup } from '../services/clearPersonLookupService';

export const clearController = {
  /**
   * Standalone CLEAR person lookup — not tied to an application.
   *
   * Backs the Person Lookup screen under Deal Pipeline. Nothing is persisted:
   * report PDFs come back inline as base64 and the caller renders or downloads
   * them from memory.
   */
  async personLookup(request: Request, response: Response, next: NextFunction) {
    try {
      const { firstName, lastName, ssn, includeReports } = request.body ?? {};
      const result = await runClearPersonLookup({
        firstName: String(firstName ?? ''),
        lastName: String(lastName ?? ''),
        ssn: ssn ? String(ssn) : null,
        includeReports: includeReports !== false,
      });

      response.status(200).json({
        success: true,
        message: result.groupCount > 0
          ? `CLEAR returned ${result.groupCount} possible match${result.groupCount === 1 ? '' : 'es'}.`
          : 'CLEAR returned no matching records.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async syncBusinessToClient(request: Request, response: Response, next: NextFunction) {
    try {
      const applicationId = String(request.params.applicationId ?? '').trim();
      const user = clearService.getAuthenticatedUser(request);
      const result = await clearService.syncBusinessToClient(
        applicationId,
        request.body,
        user,
        request,
      );
      response.status(200).json({
        success: true,
        message: 'CLEAR business values synced to application.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async syncPersonToOwner(request: Request, response: Response, next: NextFunction) {
    try {
      const applicationId = String(request.params.applicationId ?? '').trim();
      const user = clearService.getAuthenticatedUser(request);
      const result = await clearService.syncPersonToOwner(
        applicationId,
        request.body,
        user,
        request,
      );
      response.status(200).json({
        success: true,
        message: 'CLEAR person values synced to application owner.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },
};
