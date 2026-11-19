import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../config/prismaClient';
import {
  createPublicPortalToken,
  isPublicPortalTokenTableReady,
  resolvePortalToken,
  sha256Hex,
} from '../services/publicPortalTokenService';
import { buildDocumentRequestListForApplication } from '../services/documentRequestListService';
import uploadService from '../services/uploadService';
import {
  buildMissingDocumentItems,
  isMissingDocumentsQueue,
  type MissingDocumentItem,
  parseMissingDocumentsFromNote,
  resolveMissingDocumentsForApplication,
} from '../services/missingDocumentsResolveService';
import { notifyRequestersDocumentReceived } from '../services/documentRequestFulfillmentService';
import {
  assertAllowedCloudinaryUrl,
  streamCloudinaryInlinePreview,
} from '../services/cloudinaryInlinePreviewService';

// For public pages we only return the minimal fields Approval needs.
const mapApplicationForApproval = (app: any) => {
  if (!app) return null;

  const client = app.client;
  return {
    _id: app.id,
    id: app.id,
    applicationId: app.applicationId,
    loanAmount: app.loanAmount,
    commissionPercentage: app.commissionPercentage,
    client: client
      ? {
          owner: {
            firstName: client.ownerFirstName,
            lastName: client.ownerLastName,
          },
          business: {
            name: client.businessName,
          },
        }
      : null,
  };
};

const mapOfferDecisionForApproval = (row: any) => {
  if (!row) return null;

  return {
    _id: row.id,
    id: row.id,
    application: row.applicationId,
    decision: row.decision,
    position: row.position,
    offer: row.offer,
    rate: row.rate,
    factorRate: row.rate,
    term: row.term,
    frequency: row.frequency,
    repayPerPeriod: row.repayPerPeriod,
    monthlyPayment: row.monthlyPayment,
    fees: row.fees,
    ourRemit: row.ourRemit,
    totalRemit: row.totalRemit,
    refinanceAmount: row.refinanceAmount,
    declineReason: row.declineReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

const mapTermsOfferForApproval = (offer: any) => {
  if (!offer) return offer;

  return {
    _id: offer.id,
    termsOfferId: offer.termsOfferId,
    approvedAmount: offer.approvedAmount,
    factorRate: offer.factorRate,
    paybackAmount: offer.paybackAmount,
    numberOfPayments: offer.numberOfPayments,
    offerExpiryDate: offer.offerExpiryDate,
    termLength: offer.termLength,
    commissionPercent: offer.commissionPercent,
    paymentAmount: offer.paymentAmount,
    percentOfGross: offer.percentOfGross,
    frequency: offer.frequency,
    buyRate: offer.buyRate,
    commissionAmount: offer.commissionAmount,
    position: offer.position,
    paymentSchedule: offer.paymentSchedule,
    paymentDays: offer.paymentDays,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
};

const mapApplicationForPortalStatus = (app: any) => {
  if (!app) return null;
  const client = app.client;
  return {
    id: app.id,
    applicationId: app.applicationId,
    currentQueue: app.currentQueue,
    currentState: app.currentState,
    type: app.type,
    loanAmount: app.loanAmount,
    updatedAt: app.updatedAt,
    createdAt: app.createdAt,
    client: client
      ? {
          businessName: client.businessName,
          ownerFirstName: client.ownerFirstName,
          ownerLastName: client.ownerLastName,
        }
      : null,
  };
};

class PublicApprovalController {
  // Protected: generate a token for a given application (returns token only)
  async createToken(req: Request, res: Response) {
    try {
      const { applicationId } = req.params;
      const { expiresInDays } = req.body as { expiresInDays?: number };

      const applicationIdStr = Array.isArray(applicationId) ? applicationId[0] : applicationId;
      if (!applicationIdStr) {
        return res.status(400).json({ success: false, message: 'applicationId is required' });
      }

      let app: { id: string } | null = null;
      if (/^\d+$/.test(applicationIdStr)) {
        const numericAppId = Number(applicationIdStr);
        app = await prisma.application.findUnique({
          where: { applicationId: numericAppId },
          select: { id: true },
        });
      } else {
        // Allow UUID form as well (application `id` is a UUID in Prisma).
        app = await prisma.application.findUnique({
          where: { id: applicationIdStr },
          select: { id: true },
        });
      }

      if (!app) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      if (!(await isPublicPortalTokenTableReady())) {
        return res.status(503).json({
          success: false,
          code: 'TOKEN_TABLE_MISSING',
          message: 'Public approval token table is not available. Run migrations and try again.',
        });
      }

      const token = await createPublicPortalToken(
        app.id,
        typeof expiresInDays === 'number' && Number.isFinite(expiresInDays) && expiresInDays > 0
          ? { expiresInDays }
          : undefined,
      );

      if (!token) {
        return res.status(500).json({ success: false, message: 'Failed to generate token' });
      }

      return res.status(201).json({ success: true, token });
    } catch (error) {
      console.error('PublicApprovalController.createToken error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Public: validate token + return minimal application + latest terms offers
  async getByToken(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      const tokenHash = sha256Hex(token);
      let tokenRecord: any = null;
      const tokenTableExists = await isPublicPortalTokenTableReady();
      if (tokenTableExists) {
        tokenRecord = await prisma.publicApprovalToken.findUnique({
          where: { tokenHash },
        });
      }

      const isUuidLikeToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);

      // Token-table not available yet OR token not found:
      // fallback to treating `:token` as an application UUID directly.
      if (!tokenRecord) {
        if (isUuidLikeToken) {
          const appRecord = await prisma.application.findUnique({
            where: { id: token },
            include: { client: true },
          });

          if (!appRecord) {
            return res.status(404).json({
              success: false,
              code: 'APPLICATION_NOT_FOUND',
              message: 'Application not found',
            });
          }

          const [termsOffers, offerDecision] = await Promise.all([
            prisma.termsOffer.findMany({
              where: { applicationId: appRecord.id },
              orderBy: { createdAt: 'desc' },
              take: 10,
            }),
            prisma.offerDecision.findUnique({
              where: { applicationId: appRecord.id },
            }),
          ]);

          return res.status(200).json({
            success: true,
            data: {
              application: mapApplicationForApproval(appRecord),
              termsOffers: termsOffers.map(mapTermsOfferForApproval),
              offerDecision: mapOfferDecisionForApproval(offerDecision),
              expiresAt: null,
            },
          });
        }

        return res.status(404).json({
          success: false,
          code: tokenTableExists ? 'TOKEN_NOT_FOUND' : 'TOKEN_TABLE_MISSING',
          message: 'Link not found',
        });
      }

      if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
        return res.status(410).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Link expired',
          expiresAt: tokenRecord.expiresAt,
        });
      }

      const appRecord = await prisma.application.findUnique({
        where: { id: tokenRecord.applicationId },
        include: { client: true },
      });

      if (!appRecord) {
        return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', message: 'Application not found' });
      }

      const [termsOffers, offerDecision] = await Promise.all([
        prisma.termsOffer.findMany({
          where: { applicationId: tokenRecord.applicationId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.offerDecision.findUnique({
          where: { applicationId: tokenRecord.applicationId },
        }),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          application: mapApplicationForApproval(appRecord),
          termsOffers: termsOffers.map(mapTermsOfferForApproval),
          offerDecision: mapOfferDecisionForApproval(offerDecision),
          expiresAt: tokenRecord.expiresAt ?? null,
        },
      });
    } catch (error) {
      console.error('PublicApprovalController.getByToken error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Public: application status for external recipients (token must exist in PublicApprovalToken; no UUID shortcut).
   */
  async getPortalStatusByToken(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      if (!(await isPublicPortalTokenTableReady())) {
        return res.status(503).json({
          success: false,
          code: 'TOKEN_TABLE_MISSING',
          message: 'Portal is temporarily unavailable',
        });
      }

      const tokenHash = sha256Hex(token);
      const tokenRecord = await prisma.publicApprovalToken.findUnique({
        where: { tokenHash },
      });

      if (!tokenRecord) {
        return res.status(404).json({
          success: false,
          code: 'TOKEN_NOT_FOUND',
          message: 'Link not found',
        });
      }

      if (tokenRecord.expiresAt && tokenRecord.expiresAt < new Date()) {
        return res.status(410).json({
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Link expired',
          expiresAt: tokenRecord.expiresAt,
        });
      }

      const appRecord = await prisma.application.findUnique({
        where: { id: tokenRecord.applicationId },
        include: { client: true },
      });

      if (!appRecord) {
        return res.status(404).json({
          success: false,
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          application: mapApplicationForPortalStatus(appRecord),
          expiresAt: tokenRecord.expiresAt ?? null,
        },
      });
    } catch (error) {
      console.error('PublicApprovalController.getPortalStatusByToken error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  // Public: create a short-lived authenticated session for the referring agent
  // derived from the given public approval token.
  //
  // This lets unregistered users use the existing authenticated UI
  // (upload documents, create/edit/delete comments, etc.) without showing
  // sidebar/tabs on the frontend.
  async createApprovalSession(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      const isUuidLikeToken =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token);

      let applicationId: string | null = null;

      // Try resolve from publicApprovalToken table first (if migrated)
      if (await isPublicPortalTokenTableReady()) {
        const tokenHash = sha256Hex(token);
        const tokenRecord = await prisma.publicApprovalToken.findUnique({
          where: { tokenHash },
        });
        if (tokenRecord) applicationId = tokenRecord.applicationId;
      }

      // Fallback: treat token as application UUID directly
      if (!applicationId) {
        if (!isUuidLikeToken) {
          return res.status(404).json({ success: false, message: 'Link not found' });
        }
        applicationId = token;
      }

      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        include: {
          referringAgent: true,
          client: true,
        },
      });

      if (!application) {
        return res.status(404).json({ success: false, message: 'Application not found' });
      }

      // Prefer referring agent; fall back to a CRM user matching the linked ISO email.
      let sessionUser = application.referringAgent;
      if (!sessionUser && (application as any).isoId) {
        const iso = await prisma.iso.findUnique({
          where: { id: String((application as any).isoId) },
          select: { email: true, name: true },
        });
        const isoEmail = String(iso?.email || '').trim();
        if (isoEmail) {
          sessionUser = await prisma.user.findFirst({
            where: { email: { equals: isoEmail, mode: 'insensitive' }, isActive: true },
          });
        }
      }

      if (!sessionUser?.id || !sessionUser?.email) {
        return res.status(403).json({
          success: false,
          message: 'This link is not associated with a valid ISO/agent',
        });
      }

      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        return res.status(500).json({ success: false, message: 'Server misconfiguration (JWT_SECRET missing)' });
      }

      const payload = {
        name: `${sessionUser.firstName} ${sessionUser.lastName}`.trim() || 'ISO',
        email: sessionUser.email,
        id: sessionUser.id,
        role: sessionUser.role,
        // Public approval links are sent to ISO/referring-agent recipients.
        // Keep auth role compatibility but tag actor type for downstream attribution.
        publicApprovalActor: 'ISO' as const,
      };

      const sessionToken = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.accessToken.create({
        data: {
          token: sessionToken,
          userId: sessionUser.id,
          expiresAt,
        },
      });

      return res.status(200).json({
        success: true,
        token: sessionToken,
        user: {
          _id: sessionUser.id,
          firstName: sessionUser.firstName,
          lastName: sessionUser.lastName,
          email: sessionUser.email,
          phone: sessionUser.phone,
          role: sessionUser.role,
          isVerified: sessionUser.isVerified,
          isActive: sessionUser.isActive,
          profilePicture: sessionUser.profilePicture ?? null,
        },
        applicationId: application.id,
      });
    } catch (error) {
      console.error('PublicApprovalController.createApprovalSession error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Public: document request portal — list requested documents (no login). */
  async getDocumentRequestPortalByToken(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      const resolved = await resolvePortalToken(token);
      if (!resolved) {
        const tokenHash = sha256Hex(token);
        const tokenRecord = await prisma.publicApprovalToken.findUnique({
          where: { tokenHash },
        });
        if (tokenRecord?.expiresAt && tokenRecord.expiresAt < new Date()) {
          return res.status(410).json({
            success: false,
            code: 'TOKEN_EXPIRED',
            message: 'Link expired',
            expiresAt: tokenRecord.expiresAt,
          });
        }
        return res.status(404).json({
          success: false,
          code: 'TOKEN_NOT_FOUND',
          message: 'Link not found',
        });
      }

      const appRecord = await prisma.application.findUnique({
        where: { id: resolved.applicationId },
        include: { client: true },
      });

      if (!appRecord) {
        return res.status(404).json({
          success: false,
          code: 'APPLICATION_NOT_FOUND',
          message: 'Application not found',
        });
      }

      const client = appRecord.client;
      const clientName =
        client?.businessName ||
        `${client?.ownerFirstName || ''} ${client?.ownerLastName || ''}`.trim() ||
        'Client';

      const documents = await buildDocumentRequestListForApplication(appRecord.id);

      return res.status(200).json({
        success: true,
        data: {
          application: {
            id: appRecord.id,
            applicationId: appRecord.applicationId,
            clientName,
          },
          documents,
          // Missing Documents hold: the scrubber's list, shown above the upload UI.
          // `items` is the per-document status (slug to tag uploads with + files
          // uploaded during this hold).
          missingDocuments: isMissingDocumentsQueue(appRecord.currentQueue)
            ? {
                active: true,
                documents: parseMissingDocumentsFromNote(appRecord.note),
                hasUploadedFiles:
                  (await prisma.applicationFile.count({ where: { applicationId: appRecord.id } })) > 0,
                ...(await buildMissingDocumentItems(appRecord)),
              }
            : {
                active: false,
                documents: [] as string[],
                hasUploadedFiles: false,
                heldSince: null,
                items: [] as MissingDocumentItem[],
              },
          expiresAt: resolved.expiresAt,
        },
      });
    } catch (error) {
      console.error('PublicApprovalController.getDocumentRequestPortalByToken error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /**
   * Public: merchant/ISO uploaded the missing documents → send the deal back to
   * the open Scrubbing queue. Only while the deal is in Missing Documents.
   */
  async resolveMissingDocumentsByToken(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      const resolved = await resolvePortalToken(token);
      if (!resolved) {
        const tokenHash = sha256Hex(token);
        const tokenRecord = await prisma.publicApprovalToken.findUnique({
          where: { tokenHash },
        });
        if (tokenRecord?.expiresAt && tokenRecord.expiresAt < new Date()) {
          return res.status(410).json({
            success: false,
            code: 'TOKEN_EXPIRED',
            message: 'Link expired',
            expiresAt: tokenRecord.expiresAt,
          });
        }
        return res.status(404).json({
          success: false,
          code: 'TOKEN_NOT_FOUND',
          message: 'Link not found',
        });
      }

      const fileCount = await prisma.applicationFile.count({
        where: { applicationId: resolved.applicationId },
      });
      if (fileCount === 0) {
        return res.status(400).json({
          success: false,
          message: 'Upload at least one document before sending back to Scrubber',
        });
      }

      const result = await resolveMissingDocumentsForApplication({
        where: { id: resolved.applicationId },
        include: {},
        user: null,
        req,
        actionDescription:
          'Missing documents uploaded via the public upload link; deal returned to the open Scrubbing queue.',
        metadata: { source: 'public-document-upload-link' },
      });
      if (!result.ok) {
        return res.status(result.status).json({ success: false, message: result.message });
      }

      return res.status(200).json({
        success: true,
        message: 'Deal sent back to Scrubber',
      });
    } catch (error) {
      console.error('PublicApprovalController.resolveMissingDocumentsByToken error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Public: inline preview for uploaded documents (token-scoped; no CRM login). */
  async streamDocumentRequestPreview(req: Request, res: Response) {
    try {
      const token = req.params.token;
      const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
      const nameParam = typeof req.query.name === 'string' ? req.query.name.trim() : '';

      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      const validationError = assertAllowedCloudinaryUrl(rawUrl);
      if (validationError) {
        return res.status(validationError.status).json({
          success: false,
          message: validationError.message,
        });
      }

      const resolved = await resolvePortalToken(token);
      if (!resolved) {
        const tokenHash = sha256Hex(token);
        const tokenRecord = await prisma.publicApprovalToken.findUnique({
          where: { tokenHash },
        });
        if (tokenRecord?.expiresAt && tokenRecord.expiresAt < new Date()) {
          return res.status(410).json({
            success: false,
            code: 'TOKEN_EXPIRED',
            message: 'Link expired',
            expiresAt: tokenRecord.expiresAt,
          });
        }
        return res.status(404).json({
          success: false,
          code: 'TOKEN_NOT_FOUND',
          message: 'Link not found',
        });
      }

      const ownedFile = await prisma.applicationFile.findFirst({
        where: { applicationId: resolved.applicationId, url: rawUrl },
        select: { originalName: true, mimeType: true },
      });

      let originalName = ownedFile?.originalName || undefined;
      let mimeType = ownedFile?.mimeType || undefined;

      if (!ownedFile) {
        const contractDoc = await prisma.fileMetadata.findFirst({
          where: {
            OR: [{ fileUrl: rawUrl }, { downloadUrl: rawUrl }],
            contract: { applicationId: resolved.applicationId },
          },
          select: { fileName: true, contentType: true },
        });
        if (!contractDoc) {
          return res.status(403).json({
            success: false,
            message: 'File not found for this application',
          });
        }
        originalName = contractDoc.fileName || undefined;
        mimeType = contractDoc.contentType || undefined;
      }

      const displayName = nameParam || originalName || 'document';
      await streamCloudinaryInlinePreview(res, rawUrl, displayName, mimeType || undefined);
      return;
    } catch (error) {
      console.error('PublicApprovalController.streamDocumentRequestPreview error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }

  /** Public: upload a requested document via portal token (no login). */
  async uploadDocumentRequestByToken(req: Request, res: Response) {
    try {
      const token = req.params.token;
      if (!token) {
        return res.status(400).json({ success: false, message: 'Token is required' });
      }

      const resolved = await resolvePortalToken(token);
      if (!resolved) {
        const tokenHash = sha256Hex(token);
        const tokenRecord = await prisma.publicApprovalToken.findUnique({
          where: { tokenHash },
        });
        if (tokenRecord?.expiresAt && tokenRecord.expiresAt < new Date()) {
          return res.status(410).json({
            success: false,
            code: 'TOKEN_EXPIRED',
            message: 'Link expired',
            expiresAt: tokenRecord.expiresAt,
          });
        }
        return res.status(404).json({
          success: false,
          code: 'TOKEN_NOT_FOUND',
          message: 'Link not found',
        });
      }

      const requestedDocumentSlug = String(
        (req.body as { requestedDocumentSlug?: string })?.requestedDocumentSlug || '',
      )
        .trim()
        .toLowerCase();

      if (!requestedDocumentSlug) {
        return res.status(400).json({
          success: false,
          message: 'requestedDocumentSlug is required',
        });
      }

      const reqFiles = (req as any).files;
      const rawFile = reqFiles?.file ?? reqFiles?.files;
      const file = Array.isArray(rawFile) ? rawFile[0] : rawFile;

      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
      }

      const application = await prisma.application.findUnique({
        where: { id: resolved.applicationId },
        select: {
          id: true,
          applicationId: true,
          salesRepresentativeId: true,
          createdById: true,
        },
      });

      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const folder = 'ih-crm/applications';
      const uploadResult = await uploadService.uploadFile(file, folder);

      if (!uploadResult.success || !uploadResult.data) {
        return res.status(500).json({
          success: false,
          message: uploadResult.message || uploadResult.error || 'Failed to upload file',
        });
      }

      await prisma.applicationFile.create({
        data: {
          applicationId: application.id,
          url: uploadResult.data.secure_url,
          publicId: uploadResult.data.public_id,
          originalName: uploadResult.fileName || file.name,
          mimeType: uploadResult.data.format,
          size: uploadResult.data.bytes,
          requestedDocumentSlug,
        },
      });

      const uploaderUserId =
        application.salesRepresentativeId || application.createdById || '';

      try {
        await notifyRequestersDocumentReceived({
          applicationUuid: application.id,
          documentSlug: requestedDocumentSlug,
          uploadedByUserId: uploaderUserId,
          fromIsoPortal: true,
        });
      } catch (notifyErr) {
        console.error('Public document upload notify failed:', notifyErr);
      }

      const documents = await buildDocumentRequestListForApplication(application.id);

      return res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data: { documents },
      });
    } catch (error) {
      console.error('PublicApprovalController.uploadDocumentRequestByToken error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}

export default new PublicApprovalController();

