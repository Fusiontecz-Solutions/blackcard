import express from 'express';
import noteController from '../controllers/noteController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All note routes require authentication
router.use(authenticateToken);

// Create a new note
router.post('/', noteController.create.bind(noteController));

// Get all notes with optional filters (application)
router.get('/', noteController.getAll.bind(noteController));

// Delete note
router.delete('/:id', noteController.delete.bind(noteController));

export default router;

