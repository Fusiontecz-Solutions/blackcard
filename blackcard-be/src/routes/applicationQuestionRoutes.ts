import express from 'express';
import applicationQuestionController from '../controllers/applicationQuestionController';

const router = express.Router();

// Create or Update application question response (upsert)
router.post('/', applicationQuestionController.createOrUpdate.bind(applicationQuestionController));

// Get all application question responses for an application
router.get('/', applicationQuestionController.getAll.bind(applicationQuestionController));

// Get application question response by MongoDB ObjectId
router.get('/:id', applicationQuestionController.getById.bind(applicationQuestionController));

export default router;

