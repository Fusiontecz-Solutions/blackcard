import express from 'express';
import positionController from '../controllers/positionController';

const router = express.Router();

// Create a new position
router.post('/', positionController.create.bind(positionController));

// Get all positions with optional filters (application, activeStatus)
router.get('/', positionController.getAll.bind(positionController));

// Get position by numeric positionId (must come before /:id route)
router.get('/positionId/:positionId', positionController.getByPositionId.bind(positionController));

// Get position by MongoDB ObjectId
router.get('/:id', positionController.getById.bind(positionController));

// Update position
router.put('/:id', positionController.update.bind(positionController));

// Delete position
router.delete('/:id', positionController.delete.bind(positionController));

export default router;

