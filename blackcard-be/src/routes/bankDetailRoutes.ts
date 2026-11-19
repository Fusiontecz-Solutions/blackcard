import express from 'express';
import bankDetailController from '../controllers/bankDetailController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All bank detail routes require authentication
router.use(authenticateToken);

// Create a single bank detail
router.post('/', bankDetailController.create.bind(bankDetailController));

// Create multiple bank details at once
router.post('/bulk', bankDetailController.bulkCreate.bind(bankDetailController));

// Get all bank details for a specific application
router.get('/', bankDetailController.getAll.bind(bankDetailController));

// Get bank detail by MongoDB ObjectId
router.get('/:id', bankDetailController.getById.bind(bankDetailController));

// Update bank detail
router.put('/:id', bankDetailController.update.bind(bankDetailController));

// Delete bank detail
router.delete('/:id', bankDetailController.delete.bind(bankDetailController));

export default router;

