import express from 'express';
import notificationController from '../controllers/notificationController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Send document request notification
router.post('/document-request', notificationController.sendDocumentRequest.bind(notificationController));

// Scrubbing (or other workflow) sent application to Underwriter — notify all active Final Underwriters in-app
router.post(
    '/application-sent-to-final-scrubbing',
    notificationController.notifyApplicationSentToFinalUnderwriter.bind(notificationController),
);

// Get notifications for current user
router.get('/', notificationController.getNotifications.bind(notificationController));

// Triage counts for headings + bell badge (register before param routes)
router.get('/summary', notificationController.getSummary.bind(notificationController));

// Get document requests for an application
router.get('/document-requests/:applicationId', notificationController.getDocumentRequestsByApplication.bind(notificationController));

// Bulk triage update (multi-select). Must precede '/:id/...' so 'bulk' isn't read as an id.
router.patch('/bulk', notificationController.bulkUpdate.bind(notificationController));

// Remove a specific document request
router.delete(
    '/document-requests/:applicationId/:documentId',
    notificationController.removeDocumentRequest.bind(notificationController),
);


// Mark all notifications as read for current user (precede '/:id/read')
router.patch('/read-all', notificationController.markAllAsRead.bind(notificationController));

// Update per-user triage state (bucket / importance / snooze / archive / read)
router.patch('/:id/state', notificationController.updateNotificationState.bind(notificationController));

// Mark notification as read
router.patch('/:id/read', notificationController.markAsRead.bind(notificationController));

// Delete a notification
router.delete('/:id', notificationController.deleteNotification.bind(notificationController));

export default router;

