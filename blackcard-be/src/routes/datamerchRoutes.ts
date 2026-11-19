import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { datamerchController } from '../controllers/datamerchController';

const datamerchRouter = Router({ mergeParams: true });

datamerchRouter.use(authenticateToken);
datamerchRouter.get('/search', datamerchController.searchMerchants);
datamerchRouter.get(
    '/applications/:applicationId/lookup',
    datamerchController.lookupByApplication,
);

export default datamerchRouter;
