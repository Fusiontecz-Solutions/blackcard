import type { Request, Response } from 'express';
import { DocusignService } from './docusign.service';
import { formatDocusignRouteError } from './utils/docusign-client';

const docusignService = new DocusignService();

function sendDocusignRouteError(
  res: Response,
  error: unknown,
  fallbackMessage: string,
) {
  const { status, message, retryAfterSeconds } = formatDocusignRouteError(error);
  if (retryAfterSeconds != null) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
  return res.status(status).json({
    message: message || fallbackMessage,
    ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
  });
}

export const getDocusignAuthStatus = async (_req: Request, res: Response) => {
  try {
    return res.json(docusignService.getConnectionStatus());
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'Failed to get DocuSign status' });
  }
};

/** JWT admin consent link (open in browser as impersonated DocuSign user). */
export const getDocusignConsentUrl = async (_req: Request, res: Response) => {
  try {
    const consentUrl = docusignService.getJwtConsentUrl();
    return res.json({
      consentUrl,
      redirectUriNote:
        'Add this redirect URI under Apps and Keys → Black Card CRM → Additional settings → Redirect URIs: ' +
        'https://developers.docusign.com/platform/auth/consent',
      loginAsNote:
        'Sign in as the same user as DOCUSIGN_IMPERSONATED_USER_ID (your dev@ account) before approving.',
    });
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error?.message || 'Failed to build consent URL' });
  }
};

export const connectDocusign = async (req: Request, res: Response) => {
  try {
    const status = docusignService.getConnectionStatus();
    if (status.mode === 'jwt') {
      return res.json({
        authUrl: null,
        ...status,
        message: 'DocuSign is configured with server JWT. No user connection required.',
      });
    }
    const userId = (req as any).user.id;
    const authUrl = docusignService.getAuthUrl(userId);
    return res.json({ authUrl, ...status });
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const docusignCallback = async (req: Request, res: Response) => {
  try {
    const { code, state } = req.query;
    if (!code || !state) {
      return res.status(400).json({ message: 'Missing code or state' });
    }
    const result = await docusignService.handleCallback(code as string, state as string);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ message: error?.message || 'DocuSign callback failed' });
  }
};

export const sendTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      templateId,
      redirectUrl,
      title,
      message,
      roles,
      signerName,
      signerEmail,
      reminderSettings,
      prefillFields,
      ccEmails,
      applicationId,
      autoSend,
      ownerCount,
    } = req.body;

    if (!roles?.length && (!signerName || !signerEmail)) {
      return res.status(400).json({
        message: 'Missing required fields: provide roles array or signerName & signerEmail',
      });
    }

    const result = await docusignService.sendTemplate(userId, {
      templateId,
      redirectUrl,
      title,
      message,
      roles,
      signerName,
      signerEmail,
      reminderSettings,
      prefillFields,
      ccEmails: ccEmails || [],
      applicationId,
      autoSend: autoSend === false ? false : undefined,
      ownerCount: ownerCount != null ? Number(ownerCount) : undefined,
    });

    return res.json(result);
  } catch (error: any) {
    const { status, message } = formatDocusignRouteError(error);
    return res.status(status).json({
      message: message || 'Failed to send template',
    });
  }
};

export const addRecipientsToTemplate = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { templateId, roles, title, message, ccEmails } = req.body;

    if (!templateId) {
      return res.status(400).json({ message: 'templateId is required' });
    }
    if (!roles?.length) {
      return res.status(400).json({ message: 'roles is required' });
    }

    const result = await docusignService.addRecipientsToTemplate(userId, {
      templateId,
      roles,
      title,
      message,
      ccEmails,
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to add recipients to template',
    });
  }
};

export const getTemplateRecipients = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const templateId = req.query.templateId as string | undefined;
    const result = await docusignService.getTemplateRecipients(userId, templateId);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to fetch template recipients',
    });
  }
};

export const prefillFormFields = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { documentId, fields } = req.body;

    if (!documentId) {
      return res.status(400).json({ message: 'Missing required field: documentId' });
    }
    if (!fields?.length) {
      return res.status(400).json({ message: 'fields must be a non-empty array' });
    }

    const result = await docusignService.prefillFormFields(userId, documentId, fields);
    return res.json(result);
  } catch (error: unknown) {
    return sendDocusignRouteError(res, error, 'Failed to prefill form fields');
  }
};

export const getEmbeddedRequestUrl = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, redirectUrl } = req.body;
    if (!documentId || !redirectUrl) {
      return res.status(400).json({ message: 'Missing documentId and redirectUrl' });
    }
    const result = await docusignService.getEmbeddedRequestUrl(userId, documentId, redirectUrl);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const getEmbeddedSignLink = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, signerEmail, redirectUrl } = req.body;
    if (!documentId || !signerEmail || !redirectUrl) {
      return res.status(400).json({
        message: 'Missing documentId, signerEmail, or redirectUrl',
      });
    }
    const result = await docusignService.getEmbeddedSignLink(
      userId,
      documentId,
      signerEmail,
      redirectUrl,
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const voidDocument = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, reason, applicationId, contractId, funderName, funderProfileId, contractState } =
      req.body;
    if (!documentId) {
      return res.status(400).json({ message: 'Missing documentId' });
    }
    const contractIdNum = Number(contractId);
    const result = await docusignService.voidDocument(
      userId,
      documentId,
      reason || 'Voided by user',
      {
        applicationId: applicationId ? String(applicationId) : undefined,
        contractId:
          Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
        funderName: typeof funderName === 'string' ? funderName.trim() : undefined,
        funderProfileId:
          typeof funderProfileId === 'string' ? funderProfileId.trim() : undefined,
        contractState: typeof contractState === 'string' ? contractState.trim() : undefined,
      },
    );
    return res.json(result);
  } catch (error: any) {
    const { status, message } = formatDocusignRouteError(error);
    return res.status(status).json({ message });
  }
};

/** Re-send signing emails for an in-progress envelope (no new envelope). */
export const resendEnvelopeNotification = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId, envelopeId, funderName, applicationId, contractId } = req.body;
    const id = String(documentId || envelopeId || '').trim();
    if (!id) {
      return res.status(400).json({ message: 'Missing documentId / envelopeId' });
    }
    const contractIdNum = Number(contractId);
    const result = await docusignService.resendEnvelopeNotification(userId, id, {
      funderName: typeof funderName === 'string' ? funderName.trim() : undefined,
      applicationId: applicationId ? String(applicationId) : undefined,
      contractId:
        Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    const { status, message } = formatDocusignRouteError(error);
    return res.status(status).json({ message });
  }
};

export const getDocumentProperties = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { documentId } = req.params;
    const result = await docusignService.getDocumentProperties(userId, documentId);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const downloadPrefilledPdfByApplication = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { applicationId } = req.params;
    if (!applicationId?.trim()) {
      return res.status(400).json({ message: 'applicationId is required' });
    }
    const pdfBuffer = await docusignService.downloadDocumentPdfForApplication(
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
    return sendDocusignRouteError(res, error, 'Failed to fetch prefilled PDF');
  }
};

export const downloadTemplatePdf = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { templateId } = req.params;
    if (!templateId?.trim()) {
      return res.status(400).json({ message: 'templateId is required' });
    }
    const funderName =
      typeof req.query.funderName === 'string' ? req.query.funderName.trim() : undefined;
    const funderProfileId =
      typeof req.query.funderProfileId === 'string'
        ? req.query.funderProfileId.trim()
        : undefined;
    const state =
      typeof req.query.state === 'string' ? req.query.state.trim() : undefined;

    const pdfBuffer = await docusignService.downloadTemplatePdf(
      userId,
      String(templateId).trim(),
      { funderName, funderProfileId, state },
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

/**
 * Shared signed-PDF response for SuperAdmin proxy + CRM.
 * Envelope ID must come from the path (`:envelopeId` or legacy `:documentId`).
 * Optional query: `contractId`, `applicationId` — scopes tenant proof for archived prior sends.
 */
async function sendEnvelopeSignedPdf(
  req: Request,
  res: Response,
  options: {
    requireDocument: boolean;
    contentDisposition: 'inline' | 'attachment';
    filenamePrefix: string;
  },
) {
  const userId = (req as any).user?.id;
  const envelopeId = String(
    req.params.envelopeId || req.params.documentId || '',
  ).trim();

  if (!envelopeId) {
    return res.status(400).json({
      message: 'envelopeId is required in the URL path',
    });
  }

  const contractIdNum = Number(req.query.contractId);
  const applicationId =
    typeof req.query.applicationId === 'string'
      ? req.query.applicationId.trim()
      : undefined;
  const funderName =
    typeof req.query.funderName === 'string' ? req.query.funderName.trim() : undefined;
  const funderProfileId =
    typeof req.query.funderProfileId === 'string'
      ? req.query.funderProfileId.trim()
      : undefined;
  const contractState =
    typeof req.query.contractState === 'string'
      ? req.query.contractState.trim()
      : typeof req.query.state === 'string'
        ? req.query.state.trim()
        : undefined;

  const pdfBuffer = await docusignService.downloadSignedPdf(userId, envelopeId, {
    requireDocument: options.requireDocument,
    contractId:
      Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
    applicationId: applicationId || undefined,
    funderName: funderName || undefined,
    funderProfileId: funderProfileId || undefined,
    contractState: contractState || undefined,
  });

  if (!pdfBuffer?.length) {
    return res.status(502).json({
      message: 'DocuSign returned an empty PDF for this envelope',
    });
  }

  const filename = `${options.filenamePrefix}-${envelopeId}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `${options.contentDisposition}; filename="${filename}"`,
  );
  return res.send(pdfBuffer);
}

/** Legacy alias: GET /download/:envelopeId (param may still be named documentId). */
export const downloadSignedPdf = async (req: Request, res: Response) => {
  try {
    return await sendEnvelopeSignedPdf(req, res, {
      // ACH / standalone packages are not always Document rows — allow either.
      requireDocument: false,
      contentDisposition: 'inline',
      filenamePrefix: 'signed-contract',
    });
  } catch (error: any) {
    return sendDocusignRouteError(res, error, 'Failed to fetch PDF');
  }
};

/** GET /signed-pdf/:envelopeId — requires a tenant Document row for the envelope. */
export const getSignedPdf = async (req: Request, res: Response) => {
  try {
    return await sendEnvelopeSignedPdf(req, res, {
      requireDocument: true,
      contentDisposition: 'inline',
      filenamePrefix: 'signed-contract',
    });
  } catch (error: any) {
    return sendDocusignRouteError(res, error, 'Failed to fetch signed contract PDF');
  }
};

export const listDocuments = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 10;
    const result = await docusignService.listDocuments(userId, page, pageSize);
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/**
 * Feature probe for CRM / org-admin. Books without this route return 404, so callers
 * can hide "Create in new envelope" instead of silently reusing an envelope.
 */
export const getDocusignCapabilities = async (_req: Request, res: Response) => {
  return res.json({ forceNewEnvelope: true });
};

export const mergeAndSendTemplates = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const {
      templates,
      templateIds,
      supplementalLayoutKeys,
      supplementalDocumentRefs,
      supplementalDocuments,
      standaloneDocumentRefs,
      contractTemplateFilters,
      roles,
      prefillFields,
      redirectUrl,
      applicationId,
      ccEmails,
      title,
      message,
      documentName,
      autoSend,
      ownerCount,
      guarantorCount,
      skipApplicationEnvelopeLink,
      standaloneLinkKind,
      includeMainContract,
      mainContractLayoutKey,
      contractId,
      sendPackage,
      funderName,
      funderProfileId,
      contractState,
      forceNewEnvelope,
    } = req.body;

    if (!roles?.length) {
      return res.status(400).json({ message: 'roles is required' });
    }

    const result = await docusignService.mergeAndSendTemplates(userId, {
      forceNewEnvelope: forceNewEnvelope === true,
      templates,
      templateIds,
      supplementalLayoutKeys,
      supplementalDocumentRefs,
      supplementalDocuments,
      standaloneDocumentRefs,
      contractTemplateFilters,
      roles,
      prefillFields,
      redirectUrl,
      applicationId,
      ccEmails: ccEmails || [],
      title,
      message,
      documentName:
        typeof documentName === 'string' && documentName.trim()
          ? documentName.trim()
          : undefined,
      autoSend: autoSend === false ? false : autoSend === true ? true : undefined,
      ownerCount: ownerCount != null ? Number(ownerCount) : undefined,
      guarantorCount: guarantorCount != null ? Number(guarantorCount) : undefined,
      skipApplicationEnvelopeLink: skipApplicationEnvelopeLink === true,
      standaloneLinkKind:
        standaloneLinkKind === 'ach' || standaloneLinkKind === 'package'
          ? standaloneLinkKind
          : undefined,
      includeMainContract:
        includeMainContract === false ? false : includeMainContract === true ? true : undefined,
      mainContractLayoutKey:
        typeof mainContractLayoutKey === 'string' ? mainContractLayoutKey.trim() : undefined,
      contractId: contractId != null ? Number(contractId) : undefined,
      sendPackage:
        sendPackage && typeof sendPackage === 'object' && !Array.isArray(sendPackage)
          ? {
              includeMainContract: sendPackage.includeMainContract === true,
              includeAddendum: sendPackage.includeAddendum === true,
              includeDisclosure: sendPackage.includeDisclosure === true,
            }
          : undefined,
      funderName: typeof funderName === 'string' ? funderName.trim() : undefined,
      funderProfileId:
        typeof funderProfileId === 'string' && funderProfileId.trim()
          ? funderProfileId.trim()
          : undefined,
      contractState:
        typeof contractState === 'string' && contractState.trim()
          ? contractState.trim()
          : undefined,
    });

    return res.json(
      forceNewEnvelope === true ? { ...result, forceNewEnvelope: true } : result,
    );
  } catch (error: any) {
    const { status, message } = formatDocusignRouteError(error);
    return res.status(status).json({
      message: message || 'Failed to merge and send templates',
    });
  }
};

export const docusignWebhook = async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization as string | undefined;
    if (!docusignService.verifyWebhookBasicAuth(authHeader)) {
      return res.status(401).json({ message: 'Invalid webhook credentials' });
    }

    res.send('OK');
    const rawBody =
      typeof req.body === 'string'
        ? req.body
        : req.body && typeof req.body === 'object'
          ? req.body
          : '';
    docusignService.processWebhookEvent(rawBody).catch((error) => {
      console.error('DocuSign webhook background error:', error);
    });
    return;
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/** POST /docusign/sync-envelope-status — poll DocuSign when Connect did not fire. */
export const syncDocusignEnvelopeStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { applicationId, envelopeId, ccEmails, contractId } = req.body || {};
    if (!applicationId && !envelopeId) {
      return res.status(400).json({
        message: 'applicationId or envelopeId is required',
      });
    }
    const contractIdNum = Number(contractId);
    const result = await docusignService.syncEnvelopeStatusFromDocusign(userId, {
      applicationId,
      envelopeId,
      ccEmails: Array.isArray(ccEmails) ? ccEmails : undefined,
      contractId:
        Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({
      message: error?.message || 'Failed to sync envelope status',
    });
  }
};

/** Legacy endpoints */
export const createDraftEnvelope = async (req: Request, res: Response) => {
  return sendTemplate(req, res);
};

export const getSenderView = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      envelopeId,
      returnUrl,
      ccEmails,
      applicationId,
      signerEmail,
      signerName,
      roles,
      contractId,
      funderName,
      contractState,
    } = req.body;
    if (!envelopeId || !returnUrl) {
      return res.status(400).json({ message: 'Missing envelopeId and returnUrl' });
    }
    const contractIdNum = Number(contractId);
    const result = await docusignService.getSenderViewUrl(userId, envelopeId, returnUrl, {
      ccEmails: Array.isArray(ccEmails) ? ccEmails : undefined,
      applicationId: applicationId ? String(applicationId) : undefined,
      signerEmail: signerEmail ? String(signerEmail) : undefined,
      signerName: signerName ? String(signerName) : undefined,
      roles: Array.isArray(roles) ? roles : undefined,
      contractId:
        Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
      funderName: typeof funderName === 'string' ? funderName.trim() : undefined,
      contractState: typeof contractState === 'string' ? contractState.trim() : undefined,
    });
    return res.json(result);
  } catch (error: unknown) {
    const { message } = formatDocusignRouteError(error);
    console.error('[DocuSign] sender-view failed:', message);
    return sendDocusignRouteError(res, error, 'Failed to create sender view');
  }
};

export const sendEnvelope = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { envelopeId, applicationId, ccEmails, title, contractId, funderName, contractState } =
      req.body;
    if (!envelopeId) {
      return res.status(400).json({ message: 'Missing envelopeId' });
    }
    const contractIdNum = Number(contractId);
    const result = await docusignService.sendEnvelope(userId, String(envelopeId), {
      applicationId: applicationId ? String(applicationId) : undefined,
      ccEmails: Array.isArray(ccEmails) ? ccEmails : undefined,
      title: title ? String(title) : undefined,
      contractId:
        Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
      funderName: typeof funderName === 'string' ? funderName.trim() : undefined,
      contractState: typeof contractState === 'string' ? contractState.trim() : undefined,
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

export const syncEnvelopeCc = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const {
      envelopeId,
      ccEmails,
      applicationId,
      signerEmail,
      signerName,
      roles,
      contractId,
      funderName,
      funderProfileId,
      contractState,
    } = req.body;
    if (!envelopeId) {
      return res.status(400).json({ message: 'Missing envelopeId' });
    }
    const contractIdNum = Number(contractId);
    const result = await docusignService.syncEnvelopeCcEmails(
      userId,
      String(envelopeId),
      Array.isArray(ccEmails) ? ccEmails : [],
      applicationId ? String(applicationId) : undefined,
      signerEmail ? String(signerEmail) : undefined,
      signerName ? String(signerName) : undefined,
      Array.isArray(roles) ? roles : undefined,
      {
        contractId:
          Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined,
        funderName: typeof funderName === 'string' ? funderName.trim() : undefined,
        funderProfileId:
          typeof funderProfileId === 'string' ? funderProfileId.trim() : undefined,
        contractState: typeof contractState === 'string' ? contractState.trim() : undefined,
      },
    );
    return res.json(result);
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};
