import express from 'express';
import { authenticateToken } from '../middleware/authMiddleware';
import {
  getAvochatoContacts,
  getAvochatoMessagingStatus,
  getAvochatoTicketConversation,
  getAvochatoTickets,
  postAvochatoOutboundSms,
} from '../controllers/avochatoMessagingController';

const router = express.Router();

router.use(authenticateToken);

router.get('/status', getAvochatoMessagingStatus);
router.get('/tickets', getAvochatoTickets);
router.get('/contacts', getAvochatoContacts);
router.get('/tickets/:ticketId/conversation', getAvochatoTicketConversation);
router.post('/messages', postAvochatoOutboundSms);

export default router;
