import express from 'express';
import superAdminPlatformController from '../controllers/superAdminPlatformController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRoles('SUPER_ADMIN'));

router.get('/', superAdminPlatformController.getSnapshot.bind(superAdminPlatformController));
const refresh = superAdminPlatformController.refreshSnapshot.bind(superAdminPlatformController);
router.post('/refresh', refresh);
router.get('/refresh', refresh);
router.get(
  '/contract-analytics',
  superAdminPlatformController.getContractAnalytics.bind(superAdminPlatformController),
);

export default router;
