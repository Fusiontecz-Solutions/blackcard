import type { NextFunction, Request, Response } from 'express';
import { datamerchService } from '../services/datamerchService';

export const datamerchController = {
    async lookupByApplication(
        request: Request,
        response: Response,
        next: NextFunction,
    ) {
        try {
            const applicationId = String(
                request.params.applicationId ?? request.query.applicationId ?? '',
            ).trim();

            const result = await datamerchService.lookupForApplication(applicationId);
            response.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    },

    async searchMerchants(request: Request, response: Response, next: NextFunction) {
        try {
            const query = String(request.query.q ?? request.query.query ?? '').trim();
            const result = await datamerchService.searchMerchants(query);
            response.status(200).json({
                success: true,
                data: result,
            });
        } catch (error) {
            next(error);
        }
    },
};
