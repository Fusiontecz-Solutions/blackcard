import express from 'express';
import complianceCheckController from '../controllers/complianceCheckController';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

// All compliance check routes require authentication
router.use(authenticateToken, forbidRoles('AGENT'));

// Create or update a compliance check
router.post('/', complianceCheckController.createOrUpdate.bind(complianceCheckController));

// Get all compliance checks for an application
router.get('/', complianceCheckController.getAll.bind(complianceCheckController));

// Get a single compliance check by ID
router.get('/:id', complianceCheckController.getById.bind(complianceCheckController));

// Delete a compliance check
router.delete('/:id', complianceCheckController.delete.bind(complianceCheckController));

export default router;

