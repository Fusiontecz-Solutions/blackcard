import express from 'express';
import activityLogController from '../controllers/activityLogController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

router.use(authenticateToken);
router.use(requireRoles('SUPER_ADMIN'));

router.get('/', activityLogController.list.bind(activityLogController));
router.get('/:id/content', activityLogController.getContent.bind(activityLogController));

export default router;
