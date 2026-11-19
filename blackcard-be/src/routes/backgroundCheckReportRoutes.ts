import express from 'express';
import backgroundCheckReportController from '../controllers/backgroundCheckReport.controller';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

router.use(authenticateToken, forbidRoles('AGENT'));

router.post('/pdf', backgroundCheckReportController.downloadPdf.bind(backgroundCheckReportController));

export default router;
