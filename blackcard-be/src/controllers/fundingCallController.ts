// @ts-nocheck
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import prisma from '../config/prismaClient';
import {
  resolveApplicationAttributedUserId,
  APPLICATION_USER_ATTRIBUTION_ERROR,
} from '../middleware/authMiddleware';
import { getAuthenticatedUserFromRequest } from '../services/applicationService';
import {
  createApplicationActivityLog,
  type ApplicationActivityActionType,
} from '../services/applicationActivityLogService';
import {
    scheduleApplicationStageNotification,
    notifyApplicationRejected,
    notifyOperationsFundingCallApprovedForDisbursement,
} from '../services/applicationStageNotificationService';
import {
    sendApplicationApprovalEmail,
    resolveMerchantContactForOfferEmail,
    buildApplicationApprovedEmailInjectValues,
    buildApplicationApprovedEmailHtml,
    injectApplicationApprovalEmailValues,
} from '../services/emailService';
import { createOutboundCommunication, storeSgMessageIdOnOutbound } from '../services/outboundCommunicationService';
import { recordCommunicationAudit } from '../services/systemActivityLogService';
import { syncTermsOfferFromOfferDecision } from '../services/syncTermsOfferFromOfferDecision';
import {
    buildPublicApprovalPortalUrl,
    resolveCrmFrontendBaseUrl,
} from '../utils/crmFrontendUrl';
import { createPublicPortalToken } from '../services/publicPortalTokenService';

/** Align with deal-pipeline queue labels (Agent, Scrubbing, Underwriter, Contracted, Final). */
const normalizeQueueKey = (queue: string | null | undefined) =>
  String(queue ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();

const normalizeCallStatusKey = (value: string | null | undefined) =>
  String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();

const FUNDING_CALL_CLIENT_INCLUDE = {
  owners: {
    orderBy: { sortOrder: 'asc' as const },
  },
};

const isFundingCallRejected = (callStatus: string | null | undefined) =>
  normalizeCallStatusKey(callStatus) === 'rejected';

const CONTRACT_STAGE_QUEUE_KEYS = [
  'contracted',
  'contractpending',
  'contractgenerated',
  'contractsent',
  'contractout',
  'contractsout',
  'contractsigned',
  'signedcontracts',
  'finalapproval',
];

const QUEUES_THAT_CAN_MOVE_TO_FUNDING_CALL = new Set([
  'agent',
  'scrubbing',
  'underwriter',
  ...CONTRACT_STAGE_QUEUE_KEYS,
  'final',
]);

const QUEUES_THAT_CAN_MOVE_TO_DISBURSEMENT = new Set([
  'agent',
  'scrubbing',
  'underwriter',
  ...CONTRACT_STAGE_QUEUE_KEYS,
  'final',
  'fundingcall',
]);

const shouldSetApplicationQueueToFundingCall = (currentQueue: string | null | undefined) =>
  QUEUES_THAT_CAN_MOVE_TO_FUNDING_CALL.has(normalizeQueueKey(currentQueue));

const shouldSetApplicationQueueToDisbursement = (currentQueue: string | null | undefined) =>
  QUEUES_THAT_CAN_MOVE_TO_DISBURSEMENT.has(normalizeQueueKey(currentQueue));

const mapFundingCallToApi = (record: any) => {
  if (!record) return record;

  const {
    id,
    applicationId,
    // Prisma relation fields are capitalized in your schema:
    // - `Application`
    // - `User`
    Application,
    createdById,
    User,
    createdAt,
    updatedAt,
    ...rest
  } = record;

  const mappedApplication =
    Application &&
    ({
      _id: Application.id,
      id: Application.id,
      applicationId: (Application as any).applicationId,
      priority: (Application as any).priority,
      type: (Application as any).type,
      currentQueue: (Application as any).currentQueue,
      currentState: (Application as any).currentState,
    } as any);

  const mappedCreatedBy =
    User &&
    ({
      _id: User.id,
      id: User.id,
      firstName: (User as any).firstName,
      lastName: (User as any).lastName,
      email: (User as any).email,
    } as any);

  return {
    ...rest,
    _id: id,
    id,
    application: mappedApplication ?? applicationId,
    createdBy: mappedCreatedBy ?? createdById,
    createdAt,
    updatedAt,
  };
};

class FundingCallController {
  async create(req: Request, res: Response) {
    try {
      const { application, callStatus, applicationStatus, remarks, followUpDate } = req.body;

      if (!application || !callStatus) {
        return res.status(400).json({
          success: false,
          message: 'Application and callStatus are required',
        });
      }

      const applicationStr = String(application);
      let appRecord = null;

      if (/^\d+$/.test(applicationStr)) {
        appRecord = await prisma.application.findUnique({
          where: { applicationId: Number(applicationStr) },
          include: { client: true, iso: true },
        });
      } else {
        appRecord = await prisma.application.findUnique({
          where: { id: applicationStr },
          include: { client: true, iso: true },
        });
      }

      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const createdBy = await resolveApplicationAttributedUserId(req, {
        createdById: appRecord.createdById,
        salesRepresentativeId: appRecord.salesRepresentativeId,
      });
      if (!createdBy) {
        return res.status(400).json({
          success: false,
          message: APPLICATION_USER_ATTRIBUTION_ERROR,
        });
      }

      const parsedFollowUpDate =
        followUpDate && typeof followUpDate === 'string' && followUpDate.trim()
          ? new Date(followUpDate)
          : null;

      // If a funding call already exists for this application, update the most recent one
      const latestExisting = await prisma.fundingCall.findFirst({
        where: { applicationId: appRecord.id },
        orderBy: { createdAt: 'desc' },
      });

      let record;

      if (latestExisting) {
        record = await prisma.fundingCall.update({
          where: { id: latestExisting.id },
          data: {
            callStatus: String(callStatus),
            applicationStatus: applicationStatus ?? null,
            remarks: remarks ?? null,
            followUpDate: parsedFollowUpDate,
          },
          include: {
            Application: true,
            User: true,
          },
        });
      } else {
        record = await prisma.fundingCall.create({
          data: {
            applicationId: appRecord.id,
            callStatus: String(callStatus),
            applicationStatus: applicationStatus ?? null,
            remarks: remarks ?? null,
            followUpDate: parsedFollowUpDate,
            createdById: createdBy,
          },
          include: {
            Application: true,
            User: true,
          },
        });
      }

      let applicationForResponse = record.Application;
      const previousQueue = appRecord.currentQueue;
      const previousState = appRecord.currentState;
      const callStatusStr = String(callStatus);

      if (isFundingCallRejected(callStatusStr)) {
        const declineReason =
          (remarks && String(remarks).trim()) ||
          'Rejected during funding call';

        const declinedApp = await prisma.application.update({
          where: { id: appRecord.id },
          data: {
            currentQueue: 'Declined',
            currentState: 'CANCELLED',
            note: declineReason,
          },
        });
        applicationForResponse = { ...record.Application, ...declinedApp };

        try {
          const authUser = getAuthenticatedUserFromRequest(req);
          const roleLabel = authUser?.role
            ? String(authUser.role).toUpperCase().replace(/_/g, ' ')
            : 'User';
          const actorName = (req as any).user?.name || '';

          await createApplicationActivityLog({
            applicationId: appRecord.id,
            user: authUser,
            req,
            actionType: 'APPLICATION_REJECTED' as ApplicationActivityActionType,
            actionDescription:
              `${roleLabel} ${actorName}`.trim() +
              ` declined the application during funding call. Reason: ${declineReason}`,
            previousStatus: `${previousQueue} / ${previousState}`,
            currentStatus: `${declinedApp.currentQueue} / ${declinedApp.currentState}`,
            metadata: {
              reason: declineReason,
              fundingCallStatus: callStatusStr,
            },
          });
        } catch (logError) {
          console.error('Failed to create activity log for funding call rejection:', logError);
        }

        try {
          const recipientIds = new Set<string>();
          const addIfNotSender = (id: string | null | undefined) => {
            const sid = id ? String(id) : '';
            if (sid && sid !== String(createdBy)) recipientIds.add(sid);
          };
          addIfNotSender(appRecord.referringAgentId);
          addIfNotSender(appRecord.salesRepresentativeId);

          await notifyApplicationRejected({
            application: { ...appRecord, ...declinedApp },
            actorId: createdBy,
            reason: declineReason,
            extraRecipientIds: Array.from(recipientIds),
          });
        } catch (notificationError) {
          console.error('Failed to send funding call rejection notification:', notificationError);
        }
      } else if (shouldSetApplicationQueueToFundingCall(appRecord.currentQueue)) {
        const previousQueue = appRecord.currentQueue;
        const previousState = appRecord.currentState;
        const updatedApp = await prisma.application.update({
          where: { id: appRecord.id },
          data: {
            currentQueue: 'Funding Call',
            currentState: 'FUNDING_CALL',
          },
          include: {
            client: true,
            referringAgent: { select: { id: true } },
            salesRepresentative: { select: { id: true } },
            createdBy: { select: { id: true } },
          },
        });
        applicationForResponse = updatedApp
          ? { ...record.Application, ...updatedApp }
          : record.Application;

        scheduleApplicationStageNotification({
          application: updatedApp as any,
          previousQueue,
          previousState,
          actorId: createdBy,
          actorName: (req as any).user?.name || '',
          transitionAction: 'QUEUE_CHANGED',
        });
      }


      return res.status(201).json({
        success: true,
        message: isFundingCallRejected(callStatusStr)
          ? 'Application declined successfully'
          : 'Funding call saved successfully',
        data: mapFundingCallToApi({ ...record, Application: applicationForResponse }),
      });
    } catch (error) {
      console.error('Create funding call error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  async getByApplication(req: Request, res: Response) {
    try {
      const { application } = req.query;

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'Application is required',
        });
      }

      const applicationStr = String(application);
      let appRecord = null;

      if (/^\d+$/.test(applicationStr)) {
        appRecord = await prisma.application.findUnique({
          where: { applicationId: Number(applicationStr) },
        });
      } else {
        appRecord = await prisma.application.findUnique({
          where: { id: applicationStr },
        });
      }

      if (!appRecord) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      const records = await prisma.fundingCall.findMany({
        where: { applicationId: appRecord.id },
        orderBy: { createdAt: 'desc' },
        include: {
          Application: true,
          User: true,
        },
      });

      return res.status(200).json({
        success: true,
        data: records.map(mapFundingCallToApi),
      });
    } catch (error) {
      console.error('Get funding calls error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

  /** Super Admin: approve funding call for disbursement, email client, notify Operations. */
  async approveForDisbursement(req: Request, res: Response) {
    try {
      const {
        application,
        clientEmail: clientEmailRaw,
        emailHtml: clientEmailHtmlRaw,
        emailSubject: clientEmailSubjectRaw,
      } =
        req.body as {
          application?: string | number;
          clientEmail?: string;
          emailHtml?: string;
          emailSubject?: string;
        };

      if (!application) {
        return res.status(400).json({
          success: false,
          message: 'Application is required',
        });
      }

      const applicationStr = String(application);
      let appRecord = null;

      if (/^\d+$/.test(applicationStr)) {
        appRecord = await prisma.application.findUnique({
          where: { applicationId: Number(applicationStr) },
          include: {
            client: { include: FUNDING_CALL_CLIENT_INCLUDE },
            iso: true,
            termsOffers: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: {
                approvedAmount: true,
                factorRate: true,
                paybackAmount: true,
                termLength: true,
                frequency: true,
                paymentAmount: true,
              },
            },
            OfferDecision: true,
          },
        });
      } else {
        appRecord = await prisma.application.findUnique({
          where: { id: applicationStr },
          include: {
            client: { include: FUNDING_CALL_CLIENT_INCLUDE },
            iso: true,
            termsOffers: {
              orderBy: { updatedAt: 'desc' },
              take: 1,
              select: {
                approvedAmount: true,
                factorRate: true,
                paybackAmount: true,
                termLength: true,
                frequency: true,
                paymentAmount: true,
              },
            },
            OfferDecision: true,
          },
        });
      }

      if (!appRecord) {
        return res.status(404).json({
          success: false,
          message: 'Application not found',
        });
      }

      const createdBy = await resolveApplicationAttributedUserId(req, {
        createdById: appRecord.createdById,
        salesRepresentativeId: appRecord.salesRepresentativeId,
      });
      if (!createdBy) {
        return res.status(400).json({
          success: false,
          message: APPLICATION_USER_ATTRIBUTION_ERROR,
        });
      }

      const previousQueue = appRecord.currentQueue;
      const previousState = appRecord.currentState;
      const callStatus = 'Approved for Disbursement';

      const latestExisting = await prisma.fundingCall.findFirst({
        where: { applicationId: appRecord.id },
        orderBy: { createdAt: 'desc' },
      });

      let record;
      if (latestExisting) {
        record = await prisma.fundingCall.update({
          where: { id: latestExisting.id },
          data: {
            callStatus,
            applicationStatus: 'Approved for Disbursement',
            remarks: latestExisting.remarks,
          },
          include: { Application: true, User: true },
        });
      } else {
        record = await prisma.fundingCall.create({
          data: {
            applicationId: appRecord.id,
            callStatus,
            applicationStatus: 'Approved for Disbursement',
            remarks: null,
            followUpDate: null,
            createdById: createdBy,
          },
          include: { Application: true, User: true },
        });
      }

      let applicationForResponse = record.Application;
      if (shouldSetApplicationQueueToDisbursement(appRecord.currentQueue)) {
        const updatedApp = await prisma.application.update({
          where: { id: appRecord.id },
          data: {
            currentQueue: 'Disbursement',
            currentState: 'DISBURSMENT',
          },
          include: {
            client: true,
            referringAgent: { select: { id: true } },
            salesRepresentative: { select: { id: true } },
            createdBy: { select: { id: true } },
          },
        });
        applicationForResponse = updatedApp
          ? { ...record.Application, ...updatedApp }
          : record.Application;

        scheduleApplicationStageNotification({
          application: updatedApp as any,
          previousQueue,
          previousState,
          actorId: createdBy,
          actorName: (req as any).user?.name || '',
          transitionAction: 'QUEUE_CHANGED',
        });
      }

      const client: any = appRecord.client;
      const clientBusinessName = client?.businessName || 'Unknown Business';
      const merchantGreetingName =
        `${client?.ownerFirstName || ''} ${client?.ownerLastName || ''}`.trim() ||
        clientBusinessName ||
        'Valued Client';
      const latestContract = await prisma.contract.findFirst({
        where: { applicationId: appRecord.id },
        orderBy: { updatedAt: 'desc' },
        select: { clientEmail: true },
      });
      const explicitClientEmail =
        typeof clientEmailRaw === 'string' && clientEmailRaw.trim()
          ? clientEmailRaw.trim()
          : undefined;
      const { merchantEmail } = resolveMerchantContactForOfferEmail(client, {
        explicitClientEmail,
        contractClientEmail: latestContract?.clientEmail,
      });

      try {
        await syncTermsOfferFromOfferDecision(appRecord.id, createdBy);
      } catch (syncErr) {
        console.error(
          'Approve for disbursement: failed to sync terms offer from offer decision:',
          syncErr,
        );
      }

      const latestTermsOffer =
        (await prisma.termsOffer.findFirst({
          where: { applicationId: appRecord.id },
          orderBy: { updatedAt: 'desc' },
          select: {
            approvedAmount: true,
            factorRate: true,
            paybackAmount: true,
            termLength: true,
            frequency: true,
            paymentAmount: true,
          },
        })) ??
        appRecord.termsOffers?.[0] ??
        null;
      const offerDecision = appRecord.OfferDecision ?? null;
      const approvedOfferInjectValues = buildApplicationApprovedEmailInjectValues({
        requestAmount:
          appRecord.loanAmount != null ? Number(appRecord.loanAmount) : undefined,
        approvedAmount:
          latestTermsOffer?.approvedAmount != null
            ? Number(latestTermsOffer.approvedAmount)
            : offerDecision?.offer != null
              ? Number(offerDecision.offer)
              : undefined,
        factorRate:
          latestTermsOffer?.factorRate != null
            ? Number(latestTermsOffer.factorRate)
            : offerDecision?.rate != null
              ? Number(offerDecision.rate)
              : undefined,
        paybackAmount:
          latestTermsOffer?.paybackAmount != null
            ? Number(latestTermsOffer.paybackAmount)
            : offerDecision?.totalRemit != null
              ? Number(offerDecision.totalRemit)
              : undefined,
        term:
          latestTermsOffer?.termLength != null
            ? latestTermsOffer.termLength
            : offerDecision?.term ?? undefined,
        repay:
          latestTermsOffer?.paymentAmount != null
            ? Number(latestTermsOffer.paymentAmount)
            : offerDecision?.repayPerPeriod != null
              ? Number(offerDecision.repayPerPeriod)
              : undefined,
        monthlyRepayment:
          offerDecision?.monthlyPayment != null
            ? Number(offerDecision.monthlyPayment)
            : undefined,
        achFrequency:
          String(latestTermsOffer?.frequency || offerDecision?.frequency || 'Daily').trim() ||
          'Daily',
      });

      const emailSubject =
        typeof clientEmailSubjectRaw === 'string' && clientEmailSubjectRaw.trim()
          ? clientEmailSubjectRaw.trim()
          : 'Your Application Has Been Approved for Disbursement';

      let publicApprovalUrl: string | undefined;
      try {
        const baseUrl = resolveCrmFrontendBaseUrl() || '';
        if (baseUrl) {
          let approvalLinkToken = appRecord.id;
          try {
            const portalToken = await createPublicPortalToken(appRecord.id, {
              expiresInDays: 90,
            });
            if (portalToken) approvalLinkToken = portalToken;
          } catch (tokenErr) {
            console.error(
              'Approve for disbursement: public portal token failed, using application id:',
              tokenErr,
            );
          }
          publicApprovalUrl = buildPublicApprovalPortalUrl(baseUrl, approvalLinkToken);
        }
      } catch (urlErr) {
        console.error('Approve for disbursement: failed to build public approval URL:', urlErr);
      }

      let emailSent = false;
      let emailSkippedReason: string | null = null;

      if (!merchantEmail) {
        emailSkippedReason =
          'No client email on file for this application; approval was saved but the client was not emailed.';
      } else {
        const frontendEmailHtml =
          typeof clientEmailHtmlRaw === 'string' && clientEmailHtmlRaw.trim()
            ? clientEmailHtmlRaw.trim()
            : undefined;
        const rawEmailHtml =
          frontendEmailHtml ??
          buildApplicationApprovedEmailHtml({
            clientName: merchantGreetingName,
            companyName: clientBusinessName,
          });
        const resolvedEmailHtml = injectApplicationApprovalEmailValues(rawEmailHtml, {
          approvalUrl: publicApprovalUrl,
          clientName: merchantGreetingName,
          companyName: clientBusinessName,
          ...approvedOfferInjectValues,
        });

        const trackingId = randomUUID();
        const authUserForEmail = getAuthenticatedUserFromRequest(req);
        const roleLabelForEmail = authUserForEmail?.role
          ? String(authUserForEmail.role).toUpperCase().replace(/_/g, ' ')
          : 'User';
        const actorNameForEmail = (req as any).user?.name || '';

        let outboundTracked = false;
        try {
          await recordCommunicationAudit(req, {
            outboundCommunicationId: trackingId,
            applicationId: appRecord.id,
            channel: 'EMAIL',
            recipientType: 'CLIENT',
            recipient: merchantEmail,
            subject: emailSubject,
            body: resolvedEmailHtml,
            templateName: 'Application approved template',
            actionType: 'APPROVED',
            user: authUserForEmail,
            currentStatus: `${applicationForResponse?.currentQueue ?? 'Disbursement'} / DISBURSMENT`,
            actionDescription:
              `${roleLabelForEmail} ${actorNameForEmail}`.trim() +
              ' sent application approved email to the client for disbursement.',
            metadata: {
              emailSentTo: [merchantEmail],
              sentToClient: true,
              fundingCallDisbursement: true,
              template: 'approval',
              status: 'sent',
              delivery: {
                status: 'sent',
                sentAt: new Date().toISOString(),
              },
            },
          });
          outboundTracked = true;
        } catch (auditErr) {
          console.error(
            'Approve for disbursement: failed to create communication audit for client email:',
            auditErr,
          );
          try {
            await createOutboundCommunication({
              id: trackingId,
              applicationId: appRecord.id,
              channel: 'EMAIL',
              recipientType: 'CLIENT',
              recipient: merchantEmail,
              subject: emailSubject,
              body: resolvedEmailHtml,
              templateName: 'Application approved template',
              user: authUserForEmail,
              req,
              metadata: {
                template: 'approval',
                status: 'sent',
                delivery: {
                  status: 'sent',
                  sentAt: new Date().toISOString(),
                },
              },
            });
            outboundTracked = true;
          } catch (outboundErr) {
            console.error(
              'Approve for disbursement: failed to create outbound communication row:',
              outboundErr,
            );
          }
        }

        if (!outboundTracked) {
          emailSkippedReason =
            'Could not create mail tracking record; approval email was not sent.';
        } else {
        const sendResult = await sendApplicationApprovalEmail({
          to: merchantEmail,
          clientName: merchantGreetingName,
          companyName: clientBusinessName,
          calculateApprovalUrl: publicApprovalUrl,
          viewApplicationUrl: publicApprovalUrl,
          html: resolvedEmailHtml,
          subject: emailSubject,
          trackingId,
        });
        emailSent = sendResult.sent;

        if (emailSent && sendResult.sgMessageId) {
          try {
            await storeSgMessageIdOnOutbound(trackingId, sendResult.sgMessageId);
          } catch (metaErr) {
            console.error(
              'Approve for disbursement: failed to store SendGrid message id:',
              metaErr,
            );
          }
        }
        if (!emailSent) {
          emailSkippedReason =
            'Client approval email could not be delivered (check SMTP settings or client email).';
        }
        }
      }

      try {
        const authUser = getAuthenticatedUserFromRequest(req);
        const roleLabel = authUser?.role
          ? String(authUser.role).toUpperCase().replace(/_/g, ' ')
          : 'User';
        const actorName = (req as any).user?.name || '';

        await createApplicationActivityLog({
          applicationId: appRecord.id,
          user: authUser,
          req,
          actionType: 'APPLICATION_UPDATED' as ApplicationActivityActionType,
          actionDescription:
            `${roleLabel} ${actorName}`.trim() +
            ` approved the application for disbursement after the funding call.` +
            (emailSent ? ' Client approval email sent.' : ''),
          previousStatus: `${previousQueue} / ${previousState}`,
          currentStatus: `${applicationForResponse?.currentQueue ?? 'Disbursement'} / DISBURSMENT`,
          metadata: {
            fundingCallStatus: callStatus,
            clientEmailSent: emailSent,
            clientEmail: merchantEmail || null,
          },
        });
      } catch (logError) {
        console.error('Failed to create activity log for disbursement approval:', logError);
      }

      try {
        await notifyOperationsFundingCallApprovedForDisbursement({
          application: {
            id: appRecord.id,
            applicationId: appRecord.applicationId,
            currentQueue: applicationForResponse?.currentQueue ?? 'Disbursement',
            currentState: applicationForResponse?.currentState ?? 'DISBURSMENT',
            client: appRecord.client,
          },
          actorId: createdBy,
          actorName: (req as any).user?.name || '',
        });
      } catch (notificationError) {
        console.error(
          'Failed to notify Operations about funding call disbursement approval:',
          notificationError,
        );
      }

      return res.status(200).json({
        success: true,
        message: emailSent
          ? 'Application approved for disbursement. Client notified and Operations alerted.'
          : emailSkippedReason ||
            'Application approved for disbursement. Operations has been notified.',
        data: mapFundingCallToApi({ ...record, Application: applicationForResponse }),
        emailSent,
        emailSkippedReason,
      });
    } catch (error) {
      console.error('Approve for disbursement error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
}

const fundingCallController = new FundingCallController();
export default fundingCallController;

