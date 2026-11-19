import express from 'express';
import commissionRequestController from '../controllers/commissionRequestController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

// All commission request routes require authentication
router.use(authenticateToken);

// Agents: create commission request
router.post(
  '/',
  requireRoles('AGENT'),
  commissionRequestController.create.bind(commissionRequestController),
);

// Admin & Agent: list commission requests (agents see only their own; admins see all)
router.get(
  '/',
  commissionRequestController.getAll.bind(commissionRequestController),
);

// Funded deals with latest commission status
router.get(
  '/funded-deals',
  commissionRequestController.getFundedDeals.bind(commissionRequestController),
);

// Commission portal dashboard (aggregated, date-filtered on server)
router.get(
  '/portal-dashboard',
  commissionRequestController.getCommissionPortalDashboard.bind(commissionRequestController),
);

// Admin: update commission request status (accept both PATCH and POST for compatibility)
router.patch(
  '/:id/status',
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  commissionRequestController.updateStatus.bind(commissionRequestController),
);

router.post(
  '/:id/status',
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  commissionRequestController.updateStatus.bind(commissionRequestController),
);

// Admin: delete commission request
router.delete(
  '/:id',
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  commissionRequestController.delete.bind(commissionRequestController),
);

// Agent: regenerate a rejected commission request
router.post(
  '/:id/regenerate',
  requireRoles('AGENT'),
  commissionRequestController.regenerate.bind(commissionRequestController),
);

export default router;

