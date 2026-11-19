import express from 'express';
import backgroundCheck from '../controllers/backgroundCheck.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { requireRoles } from '../middleware/requireRoles';

const router = express.Router();

const DECIDERS = ['UNDERWRITER', 'FINAL_UNDERWRITER', 'ADMIN', 'SUPER_ADMIN'];
const ADMINS = ['ADMIN', 'SUPER_ADMIN'];

router.use(authenticateToken);

// Read / lazy-create + run checks (any authenticated staff member)
router.get('/application/:applicationId', backgroundCheck.getForApplication.bind(backgroundCheck));
router.post('/application/:applicationId/company-research', requireRoles(...DECIDERS), backgroundCheck.companyResearch.bind(backgroundCheck));
router.patch('/items/:itemId', backgroundCheck.updateItem.bind(backgroundCheck));
router.post('/items/:itemId/run', requireRoles(...DECIDERS), backgroundCheck.runItem.bind(backgroundCheck));
router.post('/items/:itemId/map-to-exhibit', requireRoles(...DECIDERS), backgroundCheck.mapToExhibit.bind(backgroundCheck));
router.post('/items/:itemId/attachments', backgroundCheck.addAttachment.bind(backgroundCheck));
router.delete('/attachments/:id', backgroundCheck.removeAttachment.bind(backgroundCheck));
router.get('/:checkId/audit', backgroundCheck.audit.bind(backgroundCheck));

// Decisions / configuration (role-gated)
router.post('/:checkId/decision', requireRoles(...DECIDERS), backgroundCheck.decide.bind(backgroundCheck));
router.post('/:checkId/reopen', requireRoles(...ADMINS), backgroundCheck.reopen.bind(backgroundCheck));
router.patch('/:checkId/required', requireRoles(...ADMINS), backgroundCheck.setRequired.bind(backgroundCheck));

export default router;
