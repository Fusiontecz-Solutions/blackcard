import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';
import applicationSyndicatorController from '../controllers/applicationSyndicatorController';

const router = express.Router();

router.use(authenticateToken, forbidRoles('AGENT'));

router.get(
  '/',
  applicationSyndicatorController.listAllGroupedByDeal.bind(applicationSyndicatorController),
);

router.get(
  '/by-syndicator/:syndicatorId',
  applicationSyndicatorController.listBySyndicator.bind(applicationSyndicatorController),
);

router.get(
  '/:applicationId',
  applicationSyndicatorController.listByApplication.bind(applicationSyndicatorController),
);
router.post(
  '/:applicationId',
  applicationSyndicatorController.create.bind(applicationSyndicatorController),
);
router.delete('/:id', applicationSyndicatorController.remove.bind(applicationSyndicatorController));

export default router;
