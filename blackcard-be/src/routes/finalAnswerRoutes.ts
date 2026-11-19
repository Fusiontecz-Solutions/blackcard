import express from 'express';
import finalAnswerController from '../controllers/finalAnswerController';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

// All final answer routes require authentication
router.use(authenticateToken, forbidRoles('AGENT'));

// Upsert a single answer
router.post('/', finalAnswerController.upsert.bind(finalAnswerController));

// Bulk upsert answers for an application
router.post('/bulk', finalAnswerController.bulkUpsert.bind(finalAnswerController));

// Get all answers for an application
router.get('/', finalAnswerController.getByApplication.bind(finalAnswerController));

export default router;

