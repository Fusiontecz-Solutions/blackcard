import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { clearController } from '../controllers/clearController';

const clearRouter = Router({ mergeParams: true });

clearRouter.use(authenticateToken);

// Standalone person lookup (Person Lookup screen under Management).
// Declared before the /applications/* routes since it shares no params.
clearRouter.post('/person-lookup', clearController.personLookup);
clearRouter.post(
  '/applications/:applicationId/sync-business-to-client',
  clearController.syncBusinessToClient,
);
clearRouter.post(
  '/applications/:applicationId/sync-person-to-owner',
  clearController.syncPersonToOwner,
);

export default clearRouter;
