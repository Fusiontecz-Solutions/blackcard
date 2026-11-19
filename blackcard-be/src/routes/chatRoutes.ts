import express from 'express';
import chatController from '../controllers/chatController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Create a new conversation
router.post('/conversations', chatController.createConversation.bind(chatController));

// Get all conversations for current user
router.get('/conversations', chatController.getConversations.bind(chatController));

// Get a specific conversation
router.get('/conversations/:conversationId', chatController.getConversationById.bind(chatController));

// Update conversation
router.put('/conversations/:conversationId', chatController.updateConversation.bind(chatController));

// Delete conversation
router.delete('/conversations/:conversationId', chatController.deleteConversation.bind(chatController));

// Get messages for a conversation
router.get('/conversations/:conversationId/messages', chatController.getMessages.bind(chatController));

// Search messages
router.get('/messages/search', chatController.searchMessages.bind(chatController));

// Export messages
router.get('/conversations/:conversationId/export', chatController.exportMessages.bind(chatController));

// Add participants to conversation
router.post('/conversations/:conversationId/participants', chatController.addParticipants.bind(chatController));

// Remove participant from conversation
router.delete('/conversations/:conversationId/participants/:userId', chatController.removeParticipant.bind(chatController));

export default router;
