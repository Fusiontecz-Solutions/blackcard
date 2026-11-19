import type { LoaderFunction, RouteObject } from 'react-router';
import React from 'react';
import {
  Navigate,
  useSearchParams,
  useLocation,
} from "react-router";
import { buildOperationsPipelineApplicationsUrl } from "@/constants/dashboardApplicationsNavigation";
import { OPERATIONS_APPLICATIONS_LIST_ALL_QUERY } from "@/constants/operationsDashboardApplications";
import DashboardPage from "../pages/dashboard/DashboardPage";
import OperationsDashboard from "../pages/dashboard/OperationsDashboard";
import RootLayout from "../components/layout/RootLayout";
import LoginPage from "../pages/auth/LoginPage";
import SignupPage from "../pages/auth/SignupPage";
import ForgotPasswordPage from "../pages/auth/ForgotPasswordPage";
import Clients from '../pages/clients/Clients';
import Settings from '../pages/settings/Settings';
import Applications from '../pages/applications/Applications';
import ApplicationsBrowsePage from '../pages/applications/ApplicationsBrowsePage';
import CommissionPortal from '../pages/commissionPortal/CommissionPortal';
import IsoPortal from '../pages/isoPortal/IsoPortal';
import Reports from '../pages/reports/Reports';
import ReportsHub from '@/pages/reports/hub/ReportsHub';
import CreateClient from '../pages/clients/clientDetails/CreateClient';
import CreateApplication from '../pages/applications/applicationDetails/CreateApplication';
import ApplicationDetails from '../pages/applications/applicationDetails/ApplicationDetails';
import CreateTermsOffer from '../pages/applications/applicationDetails/CreateTermsOffer';
import CreatePosition from '../pages/applications/applicationDetails/CreatePosition';
import CaseManagement from '../pages/caseManagement/CaseManagement';
import TeamChatPage from '../pages/teamChat/TeamChatPage';
import GmailPage from '../pages/gmailModule/gmail';
import GmailSkippedEmails from '../pages/gmailModule/GmailSkippedEmails';
import CommissionTracking from '../pages/commissionPortal/CommissionTracking';
import Deals from '../pages/deals/Deals';
import CreateDeal from '../pages/deals/CreateDeal';
import Agents from '../pages/agents/Agents';
import Underwriters from '../pages/underwriters/Underwriters';
import FinalUnderwriters from '../pages/finalUnderwriters/FinalUnderwriters';
import SyndicatorsPage from '../pages/syndicators/Syndicators';
import ActivityLogs from '../pages/activityLogs/ActivityLogs';
import SyndicatorPortfolio from '../pages/syndicators/SyndicatorPortfolio';
import SyndicatorFunding from '../pages/syndicators/SyndicatorFunding';
import SyndicatorPayouts from '../pages/syndicators/SyndicatorPayouts';
import SyndicatorPayoutDetailPage from '../pages/syndicators/SyndicatorPayoutDetail';
import SyndicatorActivity from '../pages/syndicators/SyndicatorActivity';
import SyndicatorWithdraw from '../pages/syndicators/SyndicatorWithdraw';
import SyndicatorsListPage from '../pages/syndicators/SyndicatorsListPage';
import SyndicationsPage from '../pages/syndicators/SyndicationsPage';
import SyndicatorsListOutlet from '../pages/syndicators/SyndicatorsListOutlet';
import SyndicatorAdminLayout from '../pages/syndicators/admin/SyndicatorAdminLayout';
import SyndicatorAdminProfilePage from '../pages/syndicators/admin/SyndicatorAdminProfilePage';
import SyndicatorAdminSyndicationsPage from '../pages/syndicators/admin/SyndicatorAdminSyndicationsPage';
import SyndicatorAdminBillingPage from '../pages/syndicators/admin/SyndicatorAdminBillingPage';
import SyndicatorAdminSettingsPage from '../pages/syndicators/admin/SyndicatorAdminSettingsPage';
import SyndicatorAdminTransactionsPage from '../pages/syndicators/admin/SyndicatorAdminTransactionsPage';
import SyndicatorAdminWithdrawalsPage from '../pages/syndicators/admin/SyndicatorAdminWithdrawalsPage';
import { useSelector } from "react-redux";
import type { RootState } from "@/redux/store";
import { PaymentHistoryDashboard } from '../pages/payment/PaymentHistoryDashboard';
import { DetailedPayments } from '../pages/payment/DetailedPayments';
import PaymentDealById from '../pages/payment/PaymentDealById';
import MerchantDeals from '../pages/payment/dealsPortfolio/MerchantDeals';
import FailedTransactions from '../pages/payment/FailedTransactions';
import Cases from '../pages/case/Cases';
import { CasesDashboard } from '../pages/case/CasesDashboard';
import UserSetting from '../pages/Userssettings/UserSetting';
import PublicApprovalPage from '../pages/public/PublicApprovalPage';
import PublicDocumentRequestPage from '../pages/public/PublicDocumentRequestPage';
import PublicApplicationStatusPage from '../pages/public/PublicApplicationStatusPage';
import DecisionLogicPage from '../pages/public/DecisionLogicPage';
import DecisionLogicSuccessPage from '../pages/public/DecisionLogicSuccessPage';
import DealPipeline from '../pages/Dealpipeline/DealPipeline';
import DealbyId from '../pages/Dealpipeline/DealbyId';
import NotificationDashboard from '../pages/NotificationDashboard/NotificationDashboard';
import LetterGeneratorDealById from '../pages/letterGenerator/LetterGeneratorDealById';
import TemplatePlayground from '../pages/templates/TemplatePlayground';
import ClearPersonLookup from '../pages/clearLookup/ClearPersonLookup';
import { applicationsPageLoader } from './applicationsLoader';
import {
  normalizeRoleKey,
  resolveEffectiveRole,
} from '@/lib/sessionRole';

/** Remount when `?query` changes so list state matches URL + route loader (deal pipeline links). */
const ApplicationsRouteEntry: React.FC = () => {
    const { search } = useLocation();
    return <Applications key={search || '_'} />;
};

type ChildRoute = {
    index?: boolean;
    path?: string;
    element: React.ReactNode;
    loader?: LoaderFunction;
    children?: ChildRoute[];
};

type RouteConfig = {
    path: string;
    element: React.ReactNode;
    children?: ChildRoute[];
};

function mapChildRoutes(children: ChildRoute[]): RouteObject[] {
    return children.map((child): RouteObject => {
        if (child.index) {
            return {
                index: true,
                element: child.element,
                ...(child.loader ? { loader: child.loader } : {}),
            };
        }
        return {
            path: child.path,
            element: child.element,
            ...(child.loader ? { loader: child.loader } : {}),
            ...(child.children?.length
                ? { children: mapChildRoutes(child.children) }
                : {}),
        };
    });
}

const createRoute = (config: RouteConfig): RouteObject => {
    const { path, element, children } = config;
    return {
        path,
        element,
        ...(children?.length ? { children: mapChildRoutes(children) } : {}),
    } as RouteObject;
};

/** Legacy `/operations-applications` → main Applications list with operations filter. */
const OperationsApplicationsLegacyRedirect: React.FC = () => {
    const [sp] = useSearchParams();
    const raw = sp.get("operationsStatus")?.trim();
    return (
        <Navigate
            to={buildOperationsPipelineApplicationsUrl(
                raw && raw.length > 0 ? raw : OPERATIONS_APPLICATIONS_LIST_ALL_QUERY,
            )}
            replace
        />
    );
};

/** Blocks SYNDICATOR role from internal admin syndicator pages (bookmark / typed URL). */
const SyndicatorAdminSyndicatorRouteGuard: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const { data } = useSelector((state: RootState) => state.login);
    const rawRole = resolveEffectiveRole(data?.user);
    if (normalizeRoleKey(rawRole) === 'SYNDICATOR') {
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

const DashboardEntry: React.FC = () => {
    const { data } = useSelector((state: RootState) => state.login);
    const normalizedRole = normalizeRoleKey(resolveEffectiveRole(data?.user));

    // ACCOUNTS role has no real dashboard; the payments page IS their landing screen.
    if (normalizedRole === "ACCOUNTS") {
        return <Navigate to="/payments" replace />;
    }

    const useOperationsDashboard =
        normalizedRole === "OPERATIONS" || normalizedRole === "SUPER_ADMIN";

    if (useOperationsDashboard) {
        return <OperationsDashboard />;
    }

    return <DashboardPage />;
};

const Routes: RouteObject[] = [
    createRoute({
        path: '/decision-logic',
        element: <DecisionLogicPage />
    }),
    createRoute({
        path: '/decision-logic/success',
        element: <DecisionLogicSuccessPage />
    }),
    createRoute({
        path: '/login',
        element: <LoginPage />
    }),
    createRoute({
        path: '/signup',
        element: <SignupPage />
    }),
    createRoute({
        path: '/forgot-password',
        element: <ForgotPasswordPage />
    }),
    // Public shareable links (no CRM login — top-level so SPA routing always matches email URLs)
    createRoute({
        path: '/public/application/status/:token',
        element: <PublicApplicationStatusPage />,
    }),
    createRoute({
        path: '/public/application/approval/:token',
        element: <PublicApprovalPage />,
    }),
    createRoute({
        path: '/public/application/documents/:token',
        element: <PublicDocumentRequestPage />,
    }),
    createRoute({
        path: '/templates/playground',
        element: <Navigate to="/template/playground" replace />,
    }),
    createRoute({
        path: '/templat/playground',
        element: <Navigate to="/template/playground" replace />,
    }),
    createRoute({
        path: '/template/playground',
        element: <RootLayout />,
        children: [{ index: true, element: <TemplatePlayground /> }],
    }),
    createRoute({
        path: '/',
        element: <RootLayout />,
        children: [
            { index: true, element: <DashboardEntry /> },
            { path: 'clients', element: <Clients /> },
            { path: 'deal-pipeline', element: <DealPipeline /> },
            { path: 'deal-pipeline/:dealId', element: <DealbyId /> },
            // Standalone CLEAR background check, not tied to an application.
            { path: 'person-lookup', element: <ClearPersonLookup /> },
            { path: 'create-clients', element: <CreateClient /> },
            { path: 'create-clients/:clientId', element: <CreateClient /> },
            {
                path: 'applications',
                element: <ApplicationsRouteEntry />,
                loader: applicationsPageLoader,
            },
            { path: 'applications/browse', element: <ApplicationsBrowsePage /> },
            { path: 'operations-applications', element: <OperationsApplicationsLegacyRedirect /> },
            { path: 'letter-generator', element: <Applications mode="letterGenerator" /> },
            { path: 'letter-generator/:letterGeneratorDealId', element: <LetterGeneratorDealById /> },
            { path: 'deals', element: <Deals /> },
            { path: 'deals/create', element: <CreateDeal /> },
            { path: 'agents', element: <Agents /> },
            { path: 'scrubbing', element: <Underwriters /> },
            { path: 'underwriters', element: <FinalUnderwriters /> },
            { path: 'syndicators', element: <Navigate to="/syndicators/dashboard" replace /> },
            {
                path: 'syndicators/dashboard',
                element: (
                    <SyndicatorAdminSyndicatorRouteGuard>
                        <SyndicatorsPage />
                    </SyndicatorAdminSyndicatorRouteGuard>
                ),
            },
            {
                path: 'syndicators/syndications',
                element: (
                    <SyndicatorAdminSyndicatorRouteGuard>
                        <SyndicationsPage />
                    </SyndicatorAdminSyndicatorRouteGuard>
                ),
            },
            {
                path: 'syndicators/syndicators-list',
                element: (
                    <SyndicatorAdminSyndicatorRouteGuard>
                        <SyndicatorsListOutlet />
                    </SyndicatorAdminSyndicatorRouteGuard>
                ),
                children: [
                    { index: true, element: <SyndicatorsListPage /> },
                    {
                        path: ':syndicatorId',
                        element: <SyndicatorAdminLayout />,
                        children: [
                            { index: true, element: <Navigate to="profile" replace /> },
                            { path: 'profile', element: <SyndicatorAdminProfilePage /> },
                            {
                                path: 'syndications',
                                element: <SyndicatorAdminSyndicationsPage />,
                            },
                            { path: 'billing', element: <SyndicatorAdminBillingPage /> },
                            { path: 'settings', element: <SyndicatorAdminSettingsPage /> },
                            { path: 'withdrawals', element: <SyndicatorAdminWithdrawalsPage /> },
                            {
                                path: 'transactions',
                                element: <SyndicatorAdminTransactionsPage />,
                            },
                        ],
                    },
                ],
            },
            { path: 'create-applications', element: <CreateApplication /> },
            { path: 'create-applications/:applicationId', element: <CreateApplication /> },
            // URL-driven tab navigation inside ApplicationDetails (static paths like applications/browse must be registered above)
            { path: 'applications/:applicationId/:tab?', element: <ApplicationDetails /> },
            { path: 'application-details/:applicationId', element: <ApplicationDetails /> },
            { path: 'application-details/:applicationId/:tab?', element: <ApplicationDetails /> },
            { path: 'application-details/:applicationId/create-terms-offer', element: <CreateTermsOffer /> },
            { path: 'application-details/:applicationId/edit-terms-offer/:termsOfferId', element: <CreateTermsOffer /> },
            { path: 'application-details/:applicationId/view-terms-offer/:termsOfferId', element: <CreateTermsOffer /> },
            { path: 'create-terms-offer', element: <CreateTermsOffer /> },
            { path: 'edit-terms-offer/:termsOfferId', element: <CreateTermsOffer /> },
            { path: 'view-terms-offer/:termsOfferId', element: <CreateTermsOffer /> },
            { path: 'application-details/:applicationId/create-position', element: <CreatePosition /> },
            { path: 'application-details/:applicationId/edit-position/:positionId', element: <CreatePosition /> },
            { path: 'application-details/:applicationId/view-position/:positionId', element: <CreatePosition /> },
            { path: 'create-position', element: <CreatePosition /> },
            { path: 'edit-position/:positionId', element: <CreatePosition /> },
            { path: 'view-position/:positionId', element: <CreatePosition /> },
            { path: 'case-management', element: <CaseManagement /> },
            { path: 'team-chat', element: <TeamChatPage /> },
            { path: 'reports', element: <ReportsHub /> },
            { path: 'reports/commissions', element: <Reports /> },
            { path: 'commission-portal', element: <CommissionPortal /> },
            { path: 'iso-portal', element: <IsoPortal /> },
            { path: 'settings', element: <Settings /> },
            { path: 'commission-tracking', element: <CommissionTracking /> },
            { path: 'gmail', element: <GmailPage /> },
            { path: 'gmail/skipped', element: <GmailSkippedEmails /> },
            { path: 'activity-logs', element: <ActivityLogs /> },
            { path: 'payments', element: <PaymentHistoryDashboard /> },
            { path: 'payments/details', element: <DetailedPayments /> },
            { path: 'payments/failed-transactions', element: <FailedTransactions /> },
            { path: 'payments/merchant/:dealRef', element: <MerchantDeals /> },
            {
                path: 'payments/:paymentDealId',
                element: <PaymentDealById />,
            },
            { path: 'cases', element: <Cases /> },
            { path: 'cases-dashboard', element: <CasesDashboard /> },
            { path: 'user-setting', element: <UserSetting /> },
            { path: 'syndicator-portfolio', element: <SyndicatorPortfolio /> },
            { path: 'syndicator-funding', element: <SyndicatorFunding /> },
            { path: 'syndicator-payouts', element: <SyndicatorPayouts /> },
            { path: 'syndicator-payouts/:dealId', element: <SyndicatorPayoutDetailPage /> },
            { path: 'syndicator-activity', element: <SyndicatorActivity /> },
            { path: 'syndicator-withdraw', element: <SyndicatorWithdraw /> },
            { path: 'notifications', element: <NotificationDashboard /> },
        ]
    })
];

export default Routes;
