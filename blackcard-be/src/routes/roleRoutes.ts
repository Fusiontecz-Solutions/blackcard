import express from 'express';
import roleController from '../controllers/roleController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

router.use(authenticateToken);
router.get('/', roleController.getRoles.bind(roleController));

export default router;
