import type { Request, Response } from 'express';
import { BoldSignService } from './boldsign.service';
import prisma from '../../config/prismaClient';
import { verifyWebhookSignature } from './utils/boldsign-webhook';

const boldSignService = new BoldSignService();

// ─── OAuth ────────────────────────────────────────────────────────────────────

/** GET /boldsign/connect – returns BoldSign OAuth authorization URL */
export const connectBoldSign = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const authUrl = boldSignService.getAuthUrl(userId);
    return res.json({ authUrl });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/** GET /boldsign/callback – handles the OAuth redirect */
export const boldSignCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ message: 'Missing code or state' });
    }
    const userId = state as string;
    const result = await boldSignService.handleCallback(code as string, userId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'BoldSign callback failed' });
  }
};

// ─── Document operations ──────────────────────────────────────────────────────

/** POST /boldsign/send-document – create & send document for e-signing */

/** POST /boldsign/send-document-for-signing – send document with signer & form fields */
export const sendDocumentForSigning = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      signerName,
      signerEmail,
      title,
      message,
      // authenticationCode,
      // authenticationType,
      ccEmails,
      documentBase64,
    } = req.body;

    // Support both file upload (multer) and base64 body field
    let fileBuffer: Buffer;
    if ((req as any).file) {
      fileBuffer = (req as any).file.buffer;
    } else if (documentBase64) {
      const cleaned = documentBase64.replace(/^data:application\/pdf;base64,/, '');
      fileBuffer = Buffer.from(cleaned, 'base64');
    } else {
      return res.status(400).json({
        message: 'Missing required field: provide a PDF file upload or documentBase64',
      });
    }

    if (!signerName || !signerEmail) {
      return res.status(400).json({
        message: 'Missing required fields: signerName, signerEmail',
      });
    }

    const result = await boldSignService.sendDocumentForSigning(userId, fileBuffer, {
      title,
      message,
      signerName,
      signerEmail,
      // authenticationCode,
      // authenticationType,
      ccEmails: ccEmails || [],
    });

    return res.json(result);
  } catch (error: any) {
    console.error('BoldSign sendDocumentForSigning error:', error);
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to send document for signing',
    });
  }
};

/** POST /boldsign/send-template – create embedded request URL from a BoldSign template */
export const sendTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      templateId,
      redirectUrl,
      showToolbar,
      sendViewOption,
      showSaveButton,
      showSendButton,
      showPreviewButton,
      showNavigationButtons,
      sendLinkValidTill,
      title,
      message,
      roles,
      signerName,
      signerEmail,
      labels,
      reminderSettings,
      prefillFields,
      ccEmails,
      // expiryDays,
      // expiryDateType,
      // expiryValue,
      // disableExpiryAlert,
      // enablePrintAndSign,
      // enableReassign,
      roleRemovalIndices,
      applicationId,
    } = req.body;

    // At least one role (via roles array or flat signerName/signerEmail) is required
    if (!roles?.length && (!signerName || !signerEmail)) {
      return res.status(400).json({
        message: 'Missing required fields: provide roles array or signerName & signerEmail',
      });
    }

    const result = await boldSignService.sendTemplate(userId, {
      templateId,
      redirectUrl,
      showToolbar,
      sendViewOption,
      showSaveButton,
      showSendButton,
      showPreviewButton,
      showNavigationButtons,
      sendLinkValidTill,
      title,
      message,
      roles,
      signerName,
      signerEmail,
      labels,
      reminderSettings,
      prefillFields,
      ccEmails: ccEmails || [],
      // expiryDays,
      // expiryDateType,
      // expiryValue,
      // disableExpiryAlert,
      // enablePrintAndSign,
      // enableReassign,
      roleRemovalIndices,
      applicationId,
    });

    return res.json(result);
  } catch (error: any) {
    const msg = String(error?.message ?? '');
    const isMissingSignerBoldSign400 =
      (error?.status === 400 || error?.statusCode === 400) &&
      (msg.includes('Minimum one signer') ||
        msg.includes('"Signers"') ||
        msg.includes('one signer is needed'));

    if (!isMissingSignerBoldSign400) {
      console.error('BoldSign sendTemplate error:', error);
    }

    return res.status(error.status || error.statusCode || 500).json({
      message: error?.message || 'Failed to send template',
    });
  }
};

/** POST /boldsign/add-template-recipients – add recipients (role/name/email) and send */
// export const addRecipientsToTemplate = async (req: Request, res: Response) => {
//   try {
//     const userId = (req as any).user?.id;
//     const { templateId, roles, title, message, enableSigningOrder, ccEmails } = req.body;

//     console.log('addRecipientsToTemplate backend', req.body);

//     if (!templateId) {
//       return res.status(400).json({ message: 'templateId is required' });
//     }
//     if (!roles || !Array.isArray(roles) || roles.length === 0) {
//       return res.status(400).json({ message: 'roles is required and must be a non-empty array' });
//     }

//     const result = await boldSignService.addRecipientsToTemplate(userId, {
//       templateId,
//       roles,
//       title,
//       message,
//       enableSigningOrder,
//       ccEmails,
//     });

//     return res.json(result);
//   } catch (error: any) {
//     return res.status(error.status || 500).json({
//       message: error?.message || 'Failed to add recipients to template',
//     });
//   }
// };

// POST /boldsign/add-template-recipients
export const addRecipientsToTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const {
      templateId,
      roles,
      title,
      message,
      enableSigningOrder,
      ccEmails,
    } = req.body;

    console.log('addRecipientsToTemplate backend', req.body);

    if (!templateId) {
      return res.status(400).json({ message: 'templateId is required' });
    }

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res
        .status(400)
        .json({ message: 'roles is required and must be a non-empty array' });
    }

    const result = await boldSignService.addRecipientsToTemplate(userId, {
      templateId,
      roles,
      title,
      message,
      enableSigningOrder,
      ccEmails,
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to add recipients to template',
    });
  }
};

/** GET /boldsign/template/:templateId/recipients – list roles/default recipients on a template */
export const getTemplateRecipients = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const result = await boldSignService.getTemplateRecipients(userId);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to fetch template recipients',
    });
  }
};

/** PATCH /boldsign/prefill-fields – prefill form fields on an in-progress document */
export const prefillFormFields = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { documentId, fields } = req.body;

    if (!documentId) {
      return res.status(400).json({
        message: 'Missing required field: documentId',
      });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({
        message: 'Missing required field: fields (must be a non-empty array of { id, value })',
      });
    }

    const result = await boldSignService.prefillFormFields(userId, documentId, fields);

    return res.json(result);
  } catch (error: any) {
    // console.error('BoldSign prefillFormFields error:', error);
    console.error("BoldSign Prefill Error:");
    console.error("Status:", error.response?.status);
    console.error("Data:", error.response?.data);
    console.error("Headers:", error.response?.headers);
    // console.error("Full Error:", error);
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to prefill form fields',
    });
  }
};

/** POST /boldsign/embedded-request-url – get sender review URL */
export const getEmbeddedRequestUrl = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, redirectUrl } = req.body;

    if (!documentId || !redirectUrl) {
      return res.status(400).json({ message: 'Missing required fields: documentId and redirectUrl' });
    }

    const result = await boldSignService.getEmbeddedRequestUrl(userId, documentId, redirectUrl);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** POST /boldsign/embedded-sign-link – get embedded signing link */
export const getEmbeddedSignLink = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, signerEmail, redirectUrl } = req.body;

    if (!documentId || !signerEmail || !redirectUrl) {
      return res.status(400).json({ message: 'Missing required fields: documentId, signerEmail, redirectUrl' });
    }

    const result = await boldSignService.getEmbeddedSignLink(userId, documentId, signerEmail, redirectUrl);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** POST /boldsign/void-document – void / revoke a document */
export const voidDocument = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, reason } = req.body;

    if (!documentId) {
      return res.status(400).json({ message: 'Missing required field: documentId' });
    }

    const result = await boldSignService.voidDocument(userId, documentId, reason || 'Voided by user');
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** GET /boldsign/document-properties/:documentId */
export const getDocumentProperties = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId } = req.params;

    const result = await boldSignService.getDocumentProperties(userId, documentId);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/** GET /boldsign/prefilled-pdf/application/:applicationId – BoldSign PDF for CRM application (linked Document) */
export const downloadPrefilledPdfByApplication = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { applicationId } = req.params;
    if (!applicationId?.trim()) {
      return res.status(400).json({ message: 'applicationId is required' });
    }
    const pdfBuffer = await boldSignService.downloadDocumentPdfForApplication(
      userId,
      String(applicationId).trim(),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="prefilled-contract-${String(applicationId).trim()}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error.message || 'Failed to fetch prefilled PDF',
    });
  }
};

/** GET /boldsign/template/:templateId/download – download BoldSign template PDF for preview */
export const downloadTemplatePdf = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { templateId } = req.params;
    if (!templateId?.trim()) {
      return res.status(400).json({ message: 'templateId is required' });
    }
    const pdfBuffer = await boldSignService.downloadTemplatePdf(
      userId,
      String(templateId).trim(),
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="template-${String(templateId).trim()}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error.message || 'Failed to fetch template PDF',
    });
  }
};

/** GET /boldsign/download/:documentId – download signed PDF */
export const downloadSignedPdf = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId } = req.params;

    const pdfBuffer = await boldSignService.downloadSignedPdf(userId, documentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="signed-document-${documentId}.pdf"`);
    return res.send(pdfBuffer);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message || 'Failed to fetch PDF' });
  }
};

/** GET /boldsign/list – list documents */
export const listDocuments = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;

    const result = await boldSignService.listDocuments(userId, page, pageSize);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

// ─── Webhook ──────────────────────────────────────────────────────────────────

/** POST /boldsign/merge-and-send – merge templates (v1-beta by default), optional prefill, then embedded URL */
export const mergeAndSendTemplates = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      templates,
      templateIds,
      contractTemplateFilters,
      roles,
      secondaryMergeRoleFormFields,
      prefillFields,
      redirectUrl,
      showToolbar,
      sendViewOption,
      showSaveButton,
      showSendButton,
      showPreviewButton,
      showNavigationButtons,
      sendLinkValidTill,
      applicationId,
      useLegacyMergeApi,
      ccEmails,
    } = req.body;

    const hasTemplates = Array.isArray(templates) && templates.length > 0;
    const hasTemplateIds = Array.isArray(templateIds) && templateIds.length > 0;
    const hasFilters =
      contractTemplateFilters &&
      typeof contractTemplateFilters === 'object' &&
      ['state', 'frequency', 'type'].some((k) => {
        const v = (contractTemplateFilters as Record<string, unknown>)[k];
        return v != null && String(v).trim() !== '';
      });

    if (!hasTemplates && !hasTemplateIds && !hasFilters) {
      return res.status(400).json({
        message:
          'Provide non-empty templates, templateIds, or contractTemplateFilters (at least one of state, frequency, type).',
      });
    }
    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      return res.status(400).json({ message: 'roles is required and must be a non-empty array' });
    }

    const result = await boldSignService.mergeAndSendTemplates(userId, {
      templates,
      templateIds,
      contractTemplateFilters,
      roles,
      secondaryMergeRoleFormFields,
      prefillFields,
      redirectUrl,
      showToolbar,
      sendViewOption,
      showSaveButton,
      showSendButton,
      showPreviewButton,
      showNavigationButtons,
      sendLinkValidTill,
      applicationId,
      useLegacyMergeApi,
      ccEmails: ccEmails || [],
    });

    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to merge and send templates',
    });
  }
};

/** POST /boldsign/webhook – BoldSign webhook receiver */
// export const boldSignWebhook = async (req: Request, res: Response) => {
//   try {
//     // Verify signature if configured
//     const signature = req.headers['boldsignsignature'] as string;
//     if (signature) {
//       const rawBody = JSON.stringify(req.body);
//       const isValid = verifyWebhookSignature(rawBody, signature);
//       if (!isValid) {
//         return res.status(401).json({ message: 'Invalid webhook signature' });
//       }
//     }

//     await boldSignService.processWebhookEvent(req.body);
//     return res.send('OK');
//   } catch (error: any) {
//     console.error('BoldSign webhook error:', error);
//     return res.status(500).json({ message: error.message });
//   }
// };


// export const boldSignWebhook = async (req: Request, res: Response) => {
//   try {
//     const signature = req.headers['boldsignsignature'] as string;

//     if (signature) {
//       const rawBody = (req as any).rawBody; // ← use raw body

//       const isValid = verifyWebhookSignature(rawBody, signature);

//       if (!isValid) {
//         return res.status(401).json({ message: 'Invalid webhook signature' });
//       }
//     }

//     console.log("Webhook received:", req.body);

//     await boldSignService.processWebhookEvent(req.body);

//     return res.send('OK');
//   } catch (error: any) {
//     console.error('BoldSign webhook error:', error);
//     return res.status(500).json({ message: error.message });
//   }
// };

export const boldSignWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers['boldsignsignature'] as string;

    if (signature) {
      const rawBody = (req as any).rawBody;

      const isValid = verifyWebhookSignature(rawBody, signature);

      if (!isValid) {
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }
    }

    console.log("Webhook received:", req.body);

    // ✅ return immediately
    res.send('OK');

    // ✅ background processing
    boldSignService.processWebhookEvent(req.body).catch((error) => {
      console.error('Webhook background error:', error);
    });

    return; // <-- ADD THIS

  } catch (error: any) {
    console.error('BoldSign webhook error:', error);
    return res.status(500).json({ message: error.message });
  }
};