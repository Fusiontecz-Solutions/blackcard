import express from 'express';
import commentController from '../controllers/commentController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All comment routes require authentication so we can associate createdBy
router.use(authenticateToken);

// Create a new comment on an application
router.post('/application/:applicationId', commentController.create.bind(commentController));

// Get all comments for an application
router.get('/application/:applicationId', commentController.getByApplication.bind(commentController));

// Get comment count for an application
router.get('/application/:applicationId/count', commentController.getCount.bind(commentController));

// Get single comment by ID
router.get('/:id', commentController.getById.bind(commentController));

// Update comment
router.put('/:id', commentController.update.bind(commentController));

// Delete comment (soft delete)
router.delete('/:id', commentController.delete.bind(commentController));

export default router;
