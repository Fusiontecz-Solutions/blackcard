import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getAvochatoVoiceStatus,
  postAvochatoCallToken,
} from '../controllers/avochatoVoiceController';

const router = express.Router();

router.use(authenticateToken);

router.get('/status', getAvochatoVoiceStatus);
router.post('/call-token', postAvochatoCallToken);

export default router;
