import { Router } from 'express';
import { sendPaymentMail, downloadLetterPdf } from '../controllers/mail.controller';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

router.post('/send', authenticateToken, sendPaymentMail);
router.post('/letter-pdf', authenticateToken, downloadLetterPdf);

export default router;
