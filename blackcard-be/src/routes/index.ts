import express from 'express';
import reportRoutes from './reportRoutes';
const router = express.Router();

import authRoutes from './authRoutes';
import roleRoutes from './roleRoutes';
import clientRoutes from './clientRoutes';
import applicationRoutes from './applicationRoutes';
import publicApprovalRoutes from './publicApprovalRoutes';
import userRoutes from './userRoutes';
import uploadRoutes from './uploadRoutes';
import contractTemplateRoutes from './contractTemplateRoutes';
import commentRoutes from './commentRoutes';
import positionRoutes from './positionRoutes';
import termsOfferRoutes from './termsOfferRoutes';
import noteRoutes from './noteRoutes';
import applicationQuestionRoutes from './applicationQuestionRoutes';
import bankDetailRoutes from './bankDetailRoutes';
import finalAnswerRoutes from './finalAnswerRoutes';
import complianceCheckRoutes from './complianceCheckRoutes';
import monthRoutes from './monthRoutes';
import transactionRoutes from './transactionRoutes';
import bankAnalysisRoutes from './bankAnalysisRoutes';
import aiAnalysisRoutes from './aiAnalysisRoutes';
import fundingCallRoutes from './fundingCallRoutes';
import offerDecisionRoutes from './offerDecisionRoutes';
import notificationRoutes from './notificationRoutes';
import chatRoutes from './chatRoutes';
import { connectGoogle, googleCallback } from './gmailRoutes';
import commissionRequestRoutes from './commissionRequestRoutes';
import {
    findUserForGmailAccess,
    getGoogleRefreshTokenForUser,
    mintGmailAccessToken,
} from '../services/googleToken.service';
import { authenticateToken } from '../middleware/authMiddleware';
import gmailServiceRoutes from './gmailServiceRoutes';
import docusignRoutes from '../services/docusign/docusign.routes';
import boldsignRoutes from '../services/boldsign/boldsign.routes';
import automatedBankStatementRoutes from '../services/automatedBankStatement/automatedBankStatement.route';
import teamChatRoutes from '../team_chat/chat.routes';
import contractRoutes from './contractRoutes';
import collectionPaymentRoutes from './collectionPaymentRoutes';
import isoRoutes from './isoRoutes';
import backgroundCheckRoutes from './backgroundCheckRoutes';
import paymentTemplateRoutes from './paymentTemplateRoutes';
import isoDashboardRoutes from './isoRoutes';
import decisionLogicRoutes from './decisionLogicRoutes';
import datamerchRoutes from './datamerchRoutes';
import opencorporatesRoutes from './opencorporatesRoutes';
import clearRoutes from './clearRoutes';
import claudePdfExtractRoutes from './claudePdfExtractRoutes';
import syndicatorRoutes from './syndicatorRoutes';
import applicationSyndicatorRoutes from './applicationSyndicatorRoutes';
import avochatoVoiceRoutes from './avochatoVoiceRoutes';
import avochatoMessagingRoutes from './avochatoMessagingRoutes';
import superAdminPlatformRoutes from './superAdminPlatformRoutes';
import activityLogRoutes from './activityLogRoutes';
import sendgridWebhookRoutes from './sendgridWebhookRoutes';
import sheetSyncRoutes from './sheetSyncRoutes';
import mailRoutes from './mailRoutes';
import integrationSettingsRoutes from './integrationSettingsRoutes';
import backgroundCheckReportRoutes from './backgroundCheckReportRoutes';
import letterTemplateRoutes from './letterTemplateRoutes';
import underwriterRoutingRoutes from './underwriterRoutingRoutes';

router.use('/auth', authRoutes);
router.use('/roles', roleRoutes);
router.use('/clients', clientRoutes);
router.use('/applications', applicationRoutes);
router.use('/reports', reportRoutes);
// Public approval share links (must be mounted before protected routes)
router.use('/public', publicApprovalRoutes);
router.use('/users', userRoutes);
router.use('/uploads', uploadRoutes);
router.use('/contract-templates', contractTemplateRoutes);
router.use('/comments', commentRoutes);
router.use('/positions', positionRoutes);
router.use('/terms-offers', termsOfferRoutes);
router.use('/notes', noteRoutes);
router.use('/application-questions', applicationQuestionRoutes);
router.use('/bank-details', bankDetailRoutes);
router.use('/final-answers', finalAnswerRoutes);
router.use('/compliance-checks', complianceCheckRoutes);
router.use('/months', monthRoutes);
router.use('/transactions', transactionRoutes);
router.use('/bank-analysis', bankAnalysisRoutes);
router.use('/ai-analysis', aiAnalysisRoutes);
router.use('/notifications', notificationRoutes);
router.use('/chat', chatRoutes);
router.get('/google/connect', connectGoogle);
router.use('/commission-requests', commissionRequestRoutes);
router.get('/google/callback', googleCallback);
router.use('/gmail', gmailServiceRoutes);
router.use('/docusign', docusignRoutes);
router.use('/boldsign', boldsignRoutes);
router.use('/funding-calls', fundingCallRoutes);
router.use('/offer-decisions', offerDecisionRoutes);
router.use('/automatedbankstatement', automatedBankStatementRoutes);
router.use('/team-chat', teamChatRoutes);
router.use('/contract', contractRoutes);
router.use('/collection-payments', collectionPaymentRoutes);
router.use('/iso', isoRoutes);
router.use('/background-checks', backgroundCheckRoutes);
router.use('/payment-templates', paymentTemplateRoutes);
router.use('/iso', isoDashboardRoutes);
router.use('/decision-logic', decisionLogicRoutes);
router.use('/datamerch', datamerchRoutes);
router.use('/opencorporates', opencorporatesRoutes);
router.use('/clear', clearRoutes);
router.use('/pdf-extraction', claudePdfExtractRoutes);
router.use('/syndicators', syndicatorRoutes);
router.use('/application-syndicators', applicationSyndicatorRoutes);
router.use('/avochato-voice', avochatoVoiceRoutes);
router.use('/avochato-messaging', avochatoMessagingRoutes);
router.use('/super-admin-platform', superAdminPlatformRoutes);
router.use('/activity-logs', activityLogRoutes);
router.use('/sendgrid', sendgridWebhookRoutes);
router.use('/sheet-sync', sheetSyncRoutes);
router.use('/mail', mailRoutes);
router.use('/integration-settings', integrationSettingsRoutes);
router.use('/background-check-report', backgroundCheckReportRoutes);
router.use('/letter-templates', letterTemplateRoutes);
router.use('/integration-settings', integrationSettingsRoutes);
router.use('/underwriter-routing', underwriterRoutingRoutes);

// router.get('/google/test', async (req, res) => {
//   try {
//     // Debug endpoint: generates a short-lived access token from the User's stored refresh token.
//     // Example: /api/v1/google/test?userId=<user-uuid>
//     // Example: /api/v1/google/test?email=<registered-email>
//     const userId =
//       typeof req.query.userId === 'string' ? req.query.userId : undefined;
//     const email =
//       typeof req.query.email === 'string' ? req.query.email : undefined;

//     if (!userId && !email) {
//       return res.status(400).json({
//         success: false,
//         message: 'Provide ?userId=<uuid> or ?email=<registered-email>',
//       });
//     }

//     const user = userId
//       ? await prisma.user.findUnique({
//         where: { id: userId },
//         select: { id: true, email: true, googleRefreshToken: true },
//       })
//       : await prisma.user.findFirst({
//         where: {
//           email: email
//             ? { equals: email.toLowerCase(), mode: 'insensitive' }
//             : undefined,
//         },
//         select: { id: true, email: true, googleRefreshToken: true },
//       });

//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found',
//       });
//     }

//     if (!user.googleRefreshToken) {
//       return res.status(400).json({
//         success: false,
//         message: 'googleRefreshToken is missing for this user',
//       });
//     }

//     oAuth2Client.setCredentials({
//       refresh_token: user.googleRefreshToken,
//     });

//     const accessTokenResponse = await oAuth2Client.getAccessToken();

//     return res.json({
//       success: true,
//       accessToken: accessTokenResponse?.token,
//     });

//   } catch (error) {
//     console.error('Token error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to generate access token',
//     });
//   }
// });

// router.get('/google/test', async (req, res) => {
//   try {

//     const refreshToken = process.env.GOOGLE_REFRESH_TOKEN; // or DB

//     oAuth2Client.setCredentials({
//       refresh_token: refreshToken
//     });

//     const accessTokenResponse = await oAuth2Client.getAccessToken();

//     res.json({
//       success: true,
//       accessToken: accessTokenResponse?.token,
//     });

//   } catch (error) {
//     console.error('Token error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to generate access token',
//     });
//   }
// });

router.get('/google/test', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    const user = await findUserForGmailAccess({ authUserId: userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const refreshToken = getGoogleRefreshTokenForUser(user);
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message:
          'Gmail is not connected for this user. Connect Google from the Gmail page.',
      });
    }

    const accessToken = await mintGmailAccessToken(refreshToken);

    return res.json({
      success: true,
      accessToken,
      email: user.email,
    });
  } catch (error: unknown) {
    console.error('Token error:', error);
    const message =
      error instanceof Error ? error.message : 'Failed to generate access token';
    return res.status(500).json({
      success: false,
      message,
    });
  }
});


export default router;
