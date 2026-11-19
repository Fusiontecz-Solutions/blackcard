import express from 'express';
import userController from '../controllers/userController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireAdmin } from '../middleware/requireAdmin';

const router = express.Router();

router.use(authenticateToken);

// Create user (Admin only)
router.post('/', requireAdmin, userController.create.bind(userController));

// Get all users with optional role filter (?role=AGENT)
router.get('/', userController.getAll.bind(userController));

// Get user by MongoDB ObjectId
router.get('/:id', userController.getById.bind(userController));

// Get user by numeric userId
router.get('/userId/:userId', userController.getByUserId.bind(userController));

// Update user
router.put('/:id', userController.update.bind(userController));

// Toggle user active status
router.patch('/:id/toggle-active', userController.toggleActive.bind(userController));

// Delete user (Admin only)
router.delete('/:id', requireAdmin, userController.delete.bind(userController));

// Impersonate user
router.post('/impersonate', userController.impersonateUser.bind(userController));

export default router;

