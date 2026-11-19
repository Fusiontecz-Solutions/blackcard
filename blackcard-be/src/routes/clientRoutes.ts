import express from 'express';
import clientController from '../controllers/clientController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

router.use(authenticateToken);

// Create a new client
router.post('/', clientController.create.bind(clientController));

// Get all clients with pagination and filters
router.get('/', clientController.getAll.bind(clientController));

// Get client by MongoDB ObjectId
router.get('/:id', clientController.getById.bind(clientController));

// Get client by numeric clientId
router.get('/clientId/:clientId', clientController.getByClientId.bind(clientController));

// Update client
router.put('/:id', clientController.update.bind(clientController));

// Update client status
router.patch('/:id/status', clientController.updateStatus.bind(clientController));

// Delete client
router.delete('/:id', clientController.delete.bind(clientController));

export default router;

