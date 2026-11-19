import express from 'express';
import underwriterRoutingController from '../controllers/underwriterRoutingController';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

router.use(authenticateToken);

// Scrubbers (and admins) need read access so org-admin Recommend can load
// this book's designated UW To list. Writes stay Super Admin only.
router.get(
  '/',
  requireRoles('SUPER_ADMIN', 'SCRUBBING', 'ADMIN'),
  underwriterRoutingController.getConfig.bind(underwriterRoutingController),
);
router.put(
  '/',
  requireRoles('SUPER_ADMIN'),
  underwriterRoutingController.setConfig.bind(underwriterRoutingController),
);

export default router;
