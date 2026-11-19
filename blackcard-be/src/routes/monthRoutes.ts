import express from 'express';
import monthController from '../controllers/monthController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All month routes require authentication
router.use(authenticateToken);

// Create a new month
router.post('/', monthController.createMonth.bind(monthController));

// Get all months for a specific application
router.get('/', monthController.getAllMonths.bind(monthController));

// Get month by MongoDB ObjectId
router.get('/:id', monthController.getMonthById.bind(monthController));

// Update month
router.put('/:id', monthController.updateMonth.bind(monthController));

// Delete month
router.delete('/:id', monthController.deleteMonth.bind(monthController));

export default router;

