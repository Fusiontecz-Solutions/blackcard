import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import chatController from './chat.controller';

const router = express.Router();

router.use(authenticateToken);

// Channels
router.get('/channels', authenticateToken, chatController.fetchChannels);
router.post('/channel', authenticateToken, chatController.createTeamChannel);

// Messages
router.get('/dms', authenticateToken, chatController.fetchUserDMs);
router.get('/messages/:channelId', authenticateToken, chatController.fetchChannelMessages);

export default router;