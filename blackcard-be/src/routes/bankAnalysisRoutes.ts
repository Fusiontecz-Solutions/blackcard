import express from 'express';
import bankAnalysisController from '../controllers/bankAnalysisController';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

// All bank analysis routes require authentication
router.use(authenticateToken, forbidRoles('AGENT'));

// Get all bank analyses for a specific application
router.get('/', bankAnalysisController.getByApplication.bind(bankAnalysisController));

// Create a new bank analysis entry
router.post('/', bankAnalysisController.create.bind(bankAnalysisController));

// Update bank analysis details and rows
router.put('/:id', bankAnalysisController.update.bind(bankAnalysisController));

// Create or update a single row under a bank analysis
router.post('/:bankId/rows', bankAnalysisController.upsertRow.bind(bankAnalysisController));

// Delete a single row from a bank analysis
router.delete('/:bankId/rows/:rowId', bankAnalysisController.deleteRow.bind(bankAnalysisController));

// Delete bank analysis
router.delete('/:id', bankAnalysisController.delete.bind(bankAnalysisController));

export default router;

