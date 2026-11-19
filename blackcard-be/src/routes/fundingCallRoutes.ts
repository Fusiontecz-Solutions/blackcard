import express from 'express';
import fundingCallController from '../controllers/fundingCallController';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

router.use(authenticateToken, forbidRoles('AGENT'));

router.post('/', fundingCallController.create.bind(fundingCallController));
router.post(
  '/approve-for-disbursement',
  requireRoles('SUPER_ADMIN'),
  fundingCallController.approveForDisbursement.bind(fundingCallController),
);
router.get('/', fundingCallController.getByApplication.bind(fundingCallController));

export default router;

