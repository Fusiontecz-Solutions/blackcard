import express from 'express';
import termsOfferController from '../controllers/termsOfferController';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

router.use(authenticateToken, forbidRoles('AGENT'));

// Create a new terms offer
router.post('/', termsOfferController.create.bind(termsOfferController));

// Get all terms offers with optional filters (application)
router.get('/', termsOfferController.getAll.bind(termsOfferController));

// Commission trend stats (commissionAmount per month)
router.get('/stats/commission-trend', termsOfferController.getCommissionTrend.bind(termsOfferController));

// Get terms offer by numeric termsOfferId (must come before /:id route)
router.get('/termsOfferId/:termsOfferId', termsOfferController.getByTermsOfferId.bind(termsOfferController));

// Get terms offer by MongoDB ObjectId
router.get('/:id', termsOfferController.getById.bind(termsOfferController));

// Update terms offer
router.put('/:id', termsOfferController.update.bind(termsOfferController));

// Delete terms offer
router.delete('/:id', termsOfferController.delete.bind(termsOfferController));

export default router;

