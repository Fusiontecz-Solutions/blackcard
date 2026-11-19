import express from 'express';
import isoController from '../controllers/iso.controller';
import isoCommissionController from '../controllers/isoCommission.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

router.post('/', authenticateToken, forbidRoles('AGENT'), isoController.create.bind(isoController));
router.get('/', authenticateToken, isoController.getAll.bind(isoController));

router.get(
  '/portal-overview',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.getPortalOverview.bind(isoCommissionController),
);
router.post(
  '/commission-plans',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.createPlan.bind(isoCommissionController),
);
router.put(
  '/commission-plans/:planId',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.updatePlan.bind(isoCommissionController),
);
router.delete(
  '/commission-plans/:planId',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.deletePlan.bind(isoCommissionController),
);
router.put(
  '/portal-settings/scoring',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.updateScoring.bind(isoCommissionController),
);
router.put(
  '/:id/payout-approval',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.setPayoutApproval.bind(isoCommissionController),
);

/** ISO broker deals + commission payout (must be before `/:id`) */
router.get(
  '/:id/my-deals',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.getMyDeals.bind(isoCommissionController),
);
router.put(
  '/:id/application-payout-status',
  authenticateToken,
  forbidRoles('AGENT'),
  isoCommissionController.upsertApplicationPayout.bind(isoCommissionController),
);

router.get('/:id', authenticateToken, isoController.getById.bind(isoController));
router.put('/:id', authenticateToken, isoController.update.bind(isoController));
router.delete('/:id', authenticateToken, forbidRoles('AGENT'), isoController.delete.bind(isoController));

export default router;
