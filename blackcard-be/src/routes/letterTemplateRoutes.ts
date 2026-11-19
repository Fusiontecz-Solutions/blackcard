import { Router } from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import letterTemplateController from '../controllers/letterTemplateController';

const router = Router();

router.use(authenticateToken, requireSuperAdmin);

router.get('/', letterTemplateController.list.bind(letterTemplateController));
router.get(
  '/:id',
  letterTemplateController.getById.bind(letterTemplateController),
);

export default router;
