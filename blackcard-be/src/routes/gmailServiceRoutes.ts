import { Router } from 'express';
import {
  syncGmail,
  getEmailDetails,
  getAttachment,
  autoCreateFromEmails,
  markMessageInCrm,
  sendCompose,
  getGmailLinkedAccount,
  getGmailHealth,
  setGmailAutoCreate,
} from '../controllers/gmail.controller';
import {
  getLabels,
  postLabel,
  patchLabel,
  removeLabel,
  listMailbox,
  getMailboxThread,
  modifyMailbox,
  trashMailbox,
  untrashMailbox,
  getMailboxAttachment,
  sendMailbox,
  saveMailboxDraft,
  deleteMailboxDraft,
  findMailboxDraft,
} from '../controllers/gmailMailbox.controller';
import {
  getSkippedAutoCreateEmails,
  retrySkippedAutoCreateEmails,
  dismissSkippedAutoCreateEmails,
} from '../controllers/gmailAutoCreateReview.controller';
import { authenticateToken } from '../middleware/authMiddleware';

const router = Router();

/**
 * GET /api/v1/gmail/me — connected Gmail mailbox for the logged-in CRM user
 */
router.get('/me', authenticateToken, getGmailLinkedAccount);

/**
 * GET /api/v1/gmail/health — book-wide Gmail connection health.
 * Consumed by the Super Admin panel; the handler restricts it to the
 * Super Admin proxy and to admins of this book.
 */
router.get('/health', authenticateToken, getGmailHealth);
router.patch('/health/mailboxes/:userId/auto-create', authenticateToken, setGmailAutoCreate);

/**
 * /api/v1/gmail/auto-create/skipped — admin review of mail auto-create filtered out.
 * Handlers restrict to the Super Admin proxy and book admins (same as /health).
 */
router.get('/auto-create/skipped', authenticateToken, getSkippedAutoCreateEmails);
router.post('/auto-create/skipped/retry', authenticateToken, retrySkippedAutoCreateEmails);
router.post('/auto-create/skipped/dismiss', authenticateToken, dismissSkippedAutoCreateEmails);

/**
 * POST /api/gmail/sync
 */
router.post('/sync', authenticateToken, syncGmail);

/**
 * GET /api/gmail/message/:messageId
 */
router.get('/message/:messageId', getEmailDetails);

/**
 * GET /api/gmail/message/:messageId/attachment/:attachmentId
 */
// router.get(
//   '/attachment',
//   getAttachment
// );

router.post(
  '/attachment',
  getAttachment
);

/**
 * POST /api/gmail/auto-create-applications
 * Scans INBOX for PDF attachments → extracts data → creates Client + Application
 */
router.post('/auto-create-applications', authenticateToken, autoCreateFromEmails);

/**
 * POST /api/gmail/message/:messageId/in-crm
 */
router.post('/message/:messageId/in-crm', authenticateToken, markMessageInCrm);

/**
 * POST /api/gmail/send
 * Compose and send an email via Gmail
 */
router.post('/send', sendCompose);

/**
 * /api/v1/gmail/mailbox/* — Gmail page mailbox actions (labels, star, archive,
 * trash, threads, reply/forward, drafts). Always sends through the user's Gmail.
 */
router.get('/mailbox/labels', authenticateToken, getLabels);
router.post('/mailbox/labels', authenticateToken, postLabel);
router.patch('/mailbox/labels/:labelId', authenticateToken, patchLabel);
router.delete('/mailbox/labels/:labelId', authenticateToken, removeLabel);
router.post('/mailbox/list', authenticateToken, listMailbox);
router.get('/mailbox/threads/:threadId', authenticateToken, getMailboxThread);
router.post('/mailbox/modify', authenticateToken, modifyMailbox);
router.post('/mailbox/trash', authenticateToken, trashMailbox);
router.post('/mailbox/untrash', authenticateToken, untrashMailbox);
router.get(
  '/mailbox/messages/:messageId/attachments/:attachmentId',
  authenticateToken,
  getMailboxAttachment,
);
router.post('/mailbox/send', authenticateToken, sendMailbox);
router.post('/mailbox/drafts', authenticateToken, saveMailboxDraft);
router.delete('/mailbox/drafts/:draftId', authenticateToken, deleteMailboxDraft);
router.get('/mailbox/drafts/by-message/:messageId', authenticateToken, findMailboxDraft);

export default router;
