import express from 'express';
import publicApprovalController from '../controllers/publicApprovalController';
import { authenticateToken } from '../middleware/authMiddleware';
import { forbidRoles } from '../middleware/forbidRoles';

const router = express.Router();

// Generate a new share token for an application's Approval page (protected)
router.post(
  '/application/:applicationId/approval-token',
  authenticateToken,
  forbidRoles('AGENT'),
  publicApprovalController.createToken.bind(publicApprovalController)
);

// Public: status portal (register before the generic `/:token` handler)
router.get(
  '/application/:token/portal-status',
  publicApprovalController.getPortalStatusByToken.bind(publicApprovalController)
);

// Public: document request portal (register before the generic `/:token` handler)
router.get(
  '/application/:token/document-request',
  publicApprovalController.getDocumentRequestPortalByToken.bind(publicApprovalController)
);

router.post(
  '/application/:token/document-request/upload',
  publicApprovalController.uploadDocumentRequestByToken.bind(publicApprovalController)
);

router.post(
  '/application/:token/document-request/missing-documents/resolve',
  publicApprovalController.resolveMissingDocumentsByToken.bind(publicApprovalController)
);

router.get(
  '/application/:token/document-request/preview',
  publicApprovalController.streamDocumentRequestPreview.bind(publicApprovalController)
);

// Public: open approval by token (no auth required)
router.get(
  '/application/:token',
  publicApprovalController.getByToken.bind(publicApprovalController)
);

// Public: create an authenticated session (JWT) for public approval token
// so existing authenticated UI actions (comments, uploads) can work end-to-end.
router.post(
  '/application/:token/approval-session',
  publicApprovalController.createApprovalSession.bind(publicApprovalController)
);

export default router;

