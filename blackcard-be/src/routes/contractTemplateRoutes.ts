import express from 'express';
import contractTemplateController from '../controllers/contractTemplateController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All contract template routes require authentication
router.use(authenticateToken);

// Upload a new global contract template (field: 'file')
router.post('/upload', contractTemplateController.upload.bind(contractTemplateController));

// Get the most recently uploaded global contract template
router.get('/latest', contractTemplateController.getLatest.bind(contractTemplateController));

export default router;

