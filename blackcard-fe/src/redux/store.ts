import { configureStore } from '@reduxjs/toolkit';
import { loginSlice, signupSlice } from './slices/authSlice';
import {
    clientsSlice,
    createClientSlice,
    clientDetailSlice,
    updateClientSlice,
    deleteClientSlice
} from './slices/clientSlice';
import {
    applicationsSlice,
    applicationStatsSlice,
    createApplicationSlice,
    applicationDetailSlice,
    clientApplicationsSlice,
    isoApplicationsSlice,
    underwriterApplicationsSlice,
    updateApplicationSlice,
    rejectApplicationSlice,
    deleteApplicationSlice,
    uploadDocumentsSlice,
} from './slices/applicationSlice';
import { automatedBankStatementSlice } from './slices/automatedBankStatementSlice';
import {
    usersSlice,
    usersByRoleSlice
} from './slices/userSlice';
import { rolesSlice } from './slices/rolesSlice';
import { settingsUsersSlice } from './slices/settingsUsersSlice';
import {
    commentsSlice,
    createCommentSlice,
    commentCountSlice,
    commentDetailSlice,
    updateCommentSlice,
    deleteCommentSlice
} from './slices/commentSlice';
import {
    notesSlice,
    createNoteSlice,
    deleteNoteSlice
} from './slices/noteSlice';
import {
    positionsSlice,
    createPositionSlice,
    positionDetailSlice,
    updatePositionSlice,
    deletePositionSlice
} from './slices/positionSlice';
import {
    termsOffersSlice,
    createTermsOfferSlice,
    termsOfferDetailSlice,
    updateTermsOfferSlice,
    deleteTermsOfferSlice
} from './slices/termsOfferSlice';
import {
    bankDetailsSlice,
    createBankDetailSlice,
    bulkCreateBankDetailsSlice,
    bankDetailDetailSlice,
    updateBankDetailSlice,
    deleteBankDetailSlice
} from './slices/bankDetailSlice';
import {
    monthsSlice,
    createMonthSlice,
    monthDetailSlice,
    updateMonthSlice,
    deleteMonthSlice
} from './slices/monthSlice';
import {
    transactionsSlice,
    createTransactionSlice,
    transactionDetailSlice,
    updateTransactionSlice,
    deleteTransactionSlice
} from './slices/transactionSlice';
import {
    complianceChecksSlice,
    createOrUpdateComplianceCheckSlice
} from './slices/complianceCheckSlice';
import {
    notificationsSlice,
    notificationSummarySlice,
    sendDocumentRequestSlice,
    markAsReadSlice,
    markAllAsReadSlice,
    documentRequestsSlice
} from './slices/notificationSlice';
import chatReducer from '@/redux/slices/chatSlice';
import teamChatReducer from './slices/teamChatSlice';
import gmailReducer from './slices/gmailSlice';
import boldSignReducer from './slices/boldSignSlice';
import { commissionRequestSlice } from './slices/commissionRequestSlice';
import dedupeReducer from './slices/dedupeSlice';
import activityLogReducer from './slices/activityLogSlice';
import { finalAnswersSlice } from './slices/finalAnswerSlice';
import { createFundingCallSlice, fundingCallsSlice } from './slices/fundingCallSlice';
// import automatedBankStatementSlice from './slices/automatedBankStatementSlice'
import { offerDecisionSlice } from './slices/offerDecisionSlice';
import { collectionPaymentsSlice } from './slices/collectionPaymentSlice';
import { paymentDashboardSlice } from './slices/paymentDashboardSlice';
import { paymentDashboardCohortSlice } from './slices/paymentDashboardCohortSlice';
import { paymentDashboardTrendSlice } from './slices/paymentDashboardTrendSlice';
import { paymentDashboardMoneySlice } from './slices/paymentDashboardMoneySlice';
import { operationsApplicationsSlice } from './slices/operationsApplicationsSlice';
import { operationsDashboardSlice } from './slices/operationsDashboardSlice';
import {
    achListSlice,
    createACHSlice,
    achDetailSlice,
    updateACHSlice,
    deleteACHSlice,
    epoListSlice,
    createEPOSlice,
    epoDetailSlice,
    updateEPOSlice,
    deleteEPOSlice,
    addendumListSlice,
    createAddendumSlice,
    addendumDetailSlice,
    updateAddendumSlice,
    deleteAddendumSlice,
    contractOwnerListSlice,
    createContractOwnerSlice,
    contractOwnerDetailSlice,
    updateContractOwnerSlice,
    deleteContractOwnerSlice,
    contractGuarantorListSlice,
    createContractGuarantorSlice,
    contractGuarantorDetailSlice,
    updateContractGuarantorSlice,
    deleteContractGuarantorSlice,
    contractListSlice,
    createContractSlice,
    contractDetailSlice,
    contractByApplicationDetailSlice,
    updateContractSlice,
    deleteContractSlice,
    uploadContractDocumentsSlice,
    uploadedContractDocumentsSlice,
    boldSignTemplatesSlice,
    uploadedContractDocumentDetailSlice,
    updateUploadedContractDocumentSlice,
    deleteUploadedContractDocumentSlice,
} from './slices/contractSlice';
import isoReducer from './slices/isoSlice';
import commissionProfileReducer from './slices/commissionProfileSlice';
import isoOnboardingReducer from './slices/isoOnboardingSlice';
import backgroundCheckReducer from './slices/backgroundCheckSlice';
import { paymentDashboardSessionCacheMiddleware } from './middleware/paymentDashboardSessionCacheMiddleware';
import { hydratePaymentDashboardFromSession } from '@/lib/hydratePaymentDashboardStore';

export const store = configureStore({
    reducer: {
        // Auth reducers
        login: loginSlice.reducer,
        signup: signupSlice.reducer,
        // Client reducers
        clients: clientsSlice.reducer,
        createClient: createClientSlice.reducer,
        clientDetail: clientDetailSlice.reducer,
        updateClient: updateClientSlice.reducer,
        deleteClient: deleteClientSlice.reducer,
        // Application reducers
        applications: applicationsSlice.reducer,
        applicationStats: applicationStatsSlice.reducer,
        createApplication: createApplicationSlice.reducer,
        applicationDetail: applicationDetailSlice.reducer,
        clientApplications: clientApplicationsSlice.reducer,
        isoApplications: isoApplicationsSlice.reducer,
        underwriterApplications: underwriterApplicationsSlice.reducer,
        updateApplication: updateApplicationSlice.reducer,
        rejectApplication: rejectApplicationSlice.reducer,
        deleteApplication: deleteApplicationSlice.reducer,
        uploadDocuments: uploadDocumentsSlice.reducer,
        automatedBankStatement: automatedBankStatementSlice.reducer,
        // uploadBankStatement: automatedBankStatementSlice.reducer,
        // User reducers
        users: usersSlice.reducer,
        usersByRole: usersByRoleSlice.reducer,
        // Settings: roles (fetch once) + users by role (cached)
        roles: rolesSlice.reducer,
        settingsUsers: settingsUsersSlice.reducer,
        // Comment reducers
        comments: commentsSlice.reducer,
        createComment: createCommentSlice.reducer,
        commentCount: commentCountSlice.reducer,
        commentDetail: commentDetailSlice.reducer,
        updateComment: updateCommentSlice.reducer,
        deleteComment: deleteCommentSlice.reducer,
        // Note reducers
        notes: notesSlice.reducer,
        createNote: createNoteSlice.reducer,
        deleteNote: deleteNoteSlice.reducer,
        // Position reducers
        positions: positionsSlice.reducer,
        createPosition: createPositionSlice.reducer,
        positionDetail: positionDetailSlice.reducer,
        updatePosition: updatePositionSlice.reducer,
        deletePosition: deletePositionSlice.reducer,
        // Terms Offer reducers
        termsOffers: termsOffersSlice.reducer,
        createTermsOffer: createTermsOfferSlice.reducer,
        termsOfferDetail: termsOfferDetailSlice.reducer,
        updateTermsOffer: updateTermsOfferSlice.reducer,
        deleteTermsOffer: deleteTermsOfferSlice.reducer,
        // Bank Detail reducers
        bankDetails: bankDetailsSlice.reducer,
        createBankDetail: createBankDetailSlice.reducer,
        bulkCreateBankDetails: bulkCreateBankDetailsSlice.reducer,
        bankDetailDetail: bankDetailDetailSlice.reducer,
        updateBankDetail: updateBankDetailSlice.reducer,
        deleteBankDetail: deleteBankDetailSlice.reducer,
        // Month reducers
        months: monthsSlice.reducer,
        createMonth: createMonthSlice.reducer,
        monthDetail: monthDetailSlice.reducer,
        updateMonth: updateMonthSlice.reducer,
        deleteMonth: deleteMonthSlice.reducer,
        // Transaction reducers
        transactions: transactionsSlice.reducer,
        createTransaction: createTransactionSlice.reducer,
        transactionDetail: transactionDetailSlice.reducer,
        updateTransaction: updateTransactionSlice.reducer,
        deleteTransaction: deleteTransactionSlice.reducer,
        // Compliance Check reducers
        complianceChecks: complianceChecksSlice.reducer,
        createOrUpdateComplianceCheck: createOrUpdateComplianceCheckSlice.reducer,
        // Notification reducers
        notifications: notificationsSlice.reducer,
        notificationSummary: notificationSummarySlice.reducer,
        sendDocumentRequest: sendDocumentRequestSlice.reducer,
        markNotificationAsRead: markAsReadSlice.reducer,
        markAllNotificationsAsRead: markAllAsReadSlice.reducer,
        documentRequests: documentRequestsSlice.reducer,
        // Chat reducer
        chat: chatReducer,
        teamChat: teamChatReducer,
        gmail: gmailReducer,
        boldSign: boldSignReducer,
        activityLogs: activityLogReducer,
        // Commission Request
        commissionRequest: commissionRequestSlice.reducer,
        // Application dedupe
        applicationDedupe: dedupeReducer,
        // Final answers (Merchant Interview)
        finalAnswers: finalAnswersSlice.reducer,
        // Funding call
        createFundingCall: createFundingCallSlice.reducer,
        fundingCalls: fundingCallsSlice.reducer,
        // Offer decision
        offerDecision: offerDecisionSlice.reducer,
        // Contract modules
        achList: achListSlice.reducer,
        createACH: createACHSlice.reducer,
        achDetail: achDetailSlice.reducer,
        updateACH: updateACHSlice.reducer,
        deleteACH: deleteACHSlice.reducer,
        epoList: epoListSlice.reducer,
        createEPO: createEPOSlice.reducer,
        epoDetail: epoDetailSlice.reducer,
        updateEPO: updateEPOSlice.reducer,
        deleteEPO: deleteEPOSlice.reducer,
        addendumList: addendumListSlice.reducer,
        createAddendum: createAddendumSlice.reducer,
        addendumDetail: addendumDetailSlice.reducer,
        updateAddendum: updateAddendumSlice.reducer,
        deleteAddendum: deleteAddendumSlice.reducer,
        contractOwnerList: contractOwnerListSlice.reducer,
        createContractOwner: createContractOwnerSlice.reducer,
        contractOwnerDetail: contractOwnerDetailSlice.reducer,
        updateContractOwner: updateContractOwnerSlice.reducer,
        deleteContractOwner: deleteContractOwnerSlice.reducer,
        contractGuarantorList: contractGuarantorListSlice.reducer,
        createContractGuarantor: createContractGuarantorSlice.reducer,
        contractGuarantorDetail: contractGuarantorDetailSlice.reducer,
        updateContractGuarantor: updateContractGuarantorSlice.reducer,
        deleteContractGuarantor: deleteContractGuarantorSlice.reducer,
        contractList: contractListSlice.reducer,
        createContractEntity: createContractSlice.reducer,
        contractDetail: contractDetailSlice.reducer,
        contractByApplicationDetail: contractByApplicationDetailSlice.reducer,
        updateContractEntity: updateContractSlice.reducer,
        deleteContractEntity: deleteContractSlice.reducer,
        uploadContractDocuments: uploadContractDocumentsSlice.reducer,
        uploadedContractDocuments: uploadedContractDocumentsSlice.reducer,
        boldSignTemplates: boldSignTemplatesSlice.reducer,
        uploadedContractDocumentDetail: uploadedContractDocumentDetailSlice.reducer,
        updateUploadedContractDocument: updateUploadedContractDocumentSlice.reducer,
        deleteUploadedContractDocument: deleteUploadedContractDocumentSlice.reducer,
        collectionPayments: collectionPaymentsSlice.reducer,
        paymentDashboard: paymentDashboardSlice.reducer,
        paymentDashboardCohort: paymentDashboardCohortSlice.reducer,
        paymentDashboardTrend: paymentDashboardTrendSlice.reducer,
        paymentDashboardMoney: paymentDashboardMoneySlice.reducer,
        operationsApplications: operationsApplicationsSlice.reducer,
        operationsDashboard: operationsDashboardSlice.reducer,
        iso: isoReducer,
        commissionProfile: commissionProfileReducer,
        isoOnboarding: isoOnboardingReducer,
        backgroundCheck: backgroundCheckReducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: false,
        }).concat(paymentDashboardSessionCacheMiddleware),
});

hydratePaymentDashboardFromSession(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
