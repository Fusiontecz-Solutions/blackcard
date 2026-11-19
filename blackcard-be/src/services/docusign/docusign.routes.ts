import express, { Router } from 'express';
import { authenticateToken } from '../../middleware/authMiddleware';
import {
  connectDocusign,
  getDocusignAuthStatus,
  getDocusignConsentUrl,
  docusignCallback,
  sendTemplate,
  addRecipientsToTemplate,
  prefillFormFields,
  getEmbeddedRequestUrl,
  getEmbeddedSignLink,
  voidDocument,
  resendEnvelopeNotification,
  getDocumentProperties,
  downloadSignedPdf,
  downloadPrefilledPdfByApplication,
  downloadTemplatePdf,
  listDocuments,
  docusignWebhook,
  syncDocusignEnvelopeStatus,
  mergeAndSendTemplates,
  getTemplateRecipients,
  createDraftEnvelope,
  getSenderView,
  sendEnvelope,
  syncEnvelopeCc,
  getSignedPdf,
  getDocusignCapabilities,
} from './docusign.controller';

const router = Router();

router.get('/capabilities', authenticateToken, getDocusignCapabilities);
router.get('/auth/status', authenticateToken, getDocusignAuthStatus);
router.get('/consent-url', authenticateToken, getDocusignConsentUrl);
router.get('/connect', authenticateToken, connectDocusign);
router.get('/callback', docusignCallback);

router.post('/send-template', authenticateToken, sendTemplate);
router.post('/add-template-recipients', authenticateToken, addRecipientsToTemplate);
router.get('/template/recipients', authenticateToken, getTemplateRecipients);
router.patch('/prefill-fields', authenticateToken, prefillFormFields);
router.post('/merge-and-send', authenticateToken, mergeAndSendTemplates);
router.post('/embedded-request-url', authenticateToken, getEmbeddedRequestUrl);
router.post('/embedded-sign-link', authenticateToken, getEmbeddedSignLink);
router.post('/void-document', authenticateToken, voidDocument);
router.post('/resend-envelope', authenticateToken, resendEnvelopeNotification);
router.get('/document-properties/:documentId', authenticateToken, getDocumentProperties);
router.get(
  '/prefilled-pdf/application/:applicationId',
  authenticateToken,
  downloadPrefilledPdfByApplication,
);
router.get('/template/:templateId/download', authenticateToken, downloadTemplatePdf);
/** Legacy + SuperAdmin: envelope ID in path (param name is envelopeId). */
router.get('/download/:envelopeId', authenticateToken, downloadSignedPdf);
router.get('/signed-pdf/:envelopeId', authenticateToken, getSignedPdf);
router.get('/list', authenticateToken, listDocuments);

/** Accept JSON or legacy XML Connect payloads (global express.json skips XML). */
const docusignWebhookBody = express.text({
  type: ['application/json', 'application/xml', 'text/xml', 'text/*', '*/*'],
  limit: '10mb',
});

router.post('/webhook', docusignWebhookBody, docusignWebhook);
router.post('/sync-envelope-status', authenticateToken, syncDocusignEnvelopeStatus);

/** Legacy aliases */
router.post('/create-draft-envelope', authenticateToken, createDraftEnvelope);
router.post('/sender-view', authenticateToken, getSenderView);
router.post('/send-envelope', authenticateToken, sendEnvelope);
router.post('/sync-envelope-cc', authenticateToken, syncEnvelopeCc);

export default router;
