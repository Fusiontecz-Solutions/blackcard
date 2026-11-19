import { Outlet, useNavigate, useLocation } from "react-router";
import Sidebar from "../sidebar/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { jwtDecode } from "jwt-decode";
import RootLayoutWrapper from "./RootLayoutWrapper";
import { useEffect, useMemo } from "react";
import {
    normalizeRoleKey,
    resolveEffectiveRole,
} from "@/lib/sessionRole";
import { isAgentAllowedPath, isAgentRole } from "@/lib/agentAccess";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import { getApplicationStats } from "@/redux/actions/applicationActions";
import {
    fetchOperationsDashboardSummary,
    fetchOperationsDashboardRecentCases,
} from "@/redux/actions/operationsDashboardActions";
import { fetchPaymentFinancialOverviewSummary } from "@/redux/actions/paymentDashboardActions";
import { OnlineStatusSync } from "@/components/chat/OnlineStatusSync";
import RealtimeNotificationsListener from "@/components/notifications/RealtimeNotificationsListener";
import NotificationsSync from "@/components/notifications/NotificationsSync";
import {
    isApplicationStatsWarmRoute,
    isOpsDashboardWarmRoute,
    shouldPrefetchOpsDashboardSummary,
} from "@/lib/shellPrefetchRoutes";
import { isShellPrefetchFresh } from "@/lib/prefetchFreshness";
import { axiosGet } from "@/redux/axios";
import { toast } from "react-toastify";

interface DecodedToken {
    role: string;
    name: string;
    email: string;
    id: string;
    exp?: number;
}

const FINAL_UNDERWRITER_ROLE = 'UNDERWRITER';

const allowedPathsForUnderwriter = (pathname: string): boolean => {
    if (pathname === '/') return true;
    if (pathname === '/applications') return true;
    if (pathname.startsWith('/application-details')) return true;
    // Allow the tab-driven ApplicationDetails route.
    if (pathname.startsWith('/applications/')) return true;
    if (pathname.startsWith('/create-applications')) return true;
    if (pathname === '/team-chat') return true;
    if (pathname === '/notifications') return true;
    if (pathname === '/user-setting') return true;
    if (pathname === '/template/playground') return true;
    return false;
};

const RootLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch<AppDispatch>();
    const isPublicRoute = location.pathname.startsWith('/public/');
    const { data } = useSelector((state: RootState) => state.login);
    const statsData = useSelector((state: RootState) => state.applicationStats.data);
    const statsLoading = useSelector((state: RootState) => state.applicationStats.loading);
    const statsRefreshing = useSelector((state: RootState) => state.applicationStats.isRefreshing);
    const opsDashboard = useSelector((state: RootState) => state.operationsDashboard);
    const paymentDashboardFetched = useSelector(
        (state: RootState) => state.paymentDashboard.data,
    );
    const paymentDashboardLoading = useSelector(
        (state: RootState) => state.paymentDashboard.loading,
    );
    const paymentDashboardError = useSelector(
        (state: RootState) => state.paymentDashboard.error,
    );

    const userRole = useMemo(
        () => resolveEffectiveRole(data?.user),
        [data?.user?.role, location.pathname],
    );

    const normalizedRole = normalizeRoleKey(userRole);
    const isFinalUnderwriter = normalizedRole === FINAL_UNDERWRITER_ROLE;
    const isAgent = isAgentRole(userRole);

    // Get current user ID from token
    const currentUserId = useMemo(() => {
        try {
            const token = localStorage.getItem('token');
            if (token && typeof token === 'string') {
                const decoded: DecodedToken = jwtDecode(token);
                return decoded?.id ?? '';
            }
        } catch {
            // ignore
        }
        return '';
    }, [location.pathname]);

    useEffect(() => {
        // Public share pages must be accessible without auth.
        if (isPublicRoute) return;

        const token = localStorage.getItem('token');
        const returnTo = `${location.pathname}${location.search || ''}`;
        const loginWithReturn = () =>
            navigate(`/login?returnUrl=${encodeURIComponent(returnTo)}`, { replace: true });

        if (!token) {
            loginWithReturn();
            return;
        }

        if (token && typeof token === 'string') {
            try {
                const decoded: DecodedToken = jwtDecode(token);
                if (decoded?.exp && decoded.exp * 1000 < Date.now()) {
                    loginWithReturn();
                }
            } catch {
                loginWithReturn();
            }
        } else {
            loginWithReturn();
        }
    }, [navigate, isPublicRoute, location.pathname, location.search]);

    const pathname = location.pathname;

    // Application stats only on dashboard / applications routes (not every authenticated page).
    useEffect(() => {
        if (isPublicRoute) return;
        const token = localStorage.getItem("token");
        if (!token) return;
        if (!isApplicationStatsWarmRoute(pathname)) return;
        if (statsData != null || statsLoading || statsRefreshing) return;
        dispatch(getApplicationStats());
    }, [
        dispatch,
        isPublicRoute,
        pathname,
        statsData,
        statsLoading,
        statsRefreshing,
    ]);

    // Deal-pipeline sidebar badges need summary counts on any authenticated page.
    useEffect(() => {
        if (isPublicRoute) return;
        if (!localStorage.getItem("token")) return;
        if (!shouldPrefetchOpsDashboardSummary(normalizedRole)) return;
        if (
            opsDashboard.hasLoadedSummaryOnce &&
            isShellPrefetchFresh(opsDashboard.lastSummaryFetchedAt)
        ) {
            // Counts come from parallel DB aggregates — no refetch needed.
        } else {
            void dispatch(fetchOperationsDashboardSummary());
        }
    }, [
        dispatch,
        isPublicRoute,
        normalizedRole,
        opsDashboard.hasLoadedSummaryOnce,
        opsDashboard.lastSummaryFetchedAt,
    ]);

    // Recent cases list only on routes that render the operations dashboard.
    useEffect(() => {
        if (isPublicRoute) return;
        if (!localStorage.getItem("token")) return;
        if (!isOpsDashboardWarmRoute(pathname, normalizedRole)) return;
        if (
            opsDashboard.hasLoadedRecentOnce &&
            isShellPrefetchFresh(opsDashboard.lastRecentFetchedAt)
        ) {
            // Keep recent list snapshot.
        } else {
            void dispatch(fetchOperationsDashboardRecentCases());
        }
    }, [
        dispatch,
        isPublicRoute,
        pathname,
        normalizedRole,
        opsDashboard.hasLoadedRecentOnce,
        opsDashboard.lastRecentFetchedAt,
    ]);

    // Payment cards/chart warm-up only on the list page — not `/payments/:deal`.
    useEffect(() => {
        if (isPublicRoute) return;
        if (!localStorage.getItem("token")) return;
        if (pathname !== "/payments") return;
        if (!paymentDashboardFetched && !paymentDashboardLoading && !paymentDashboardError) {
            const year = new Date().getFullYear();
            void dispatch(
                fetchPaymentFinancialOverviewSummary({
                    chartYear: year,
                    chartMonth: new Date().getMonth(),
                }),
            );
        }
    }, [
        dispatch,
        isPublicRoute,
        pathname,
        paymentDashboardFetched,
        paymentDashboardLoading,
        paymentDashboardError,
    ]);

    useEffect(() => {
        if (isPublicRoute) return;
        if (isFinalUnderwriter && !allowedPathsForUnderwriter(location.pathname)) {
            navigate('/', { replace: true });
        }
    }, [isFinalUnderwriter, location.pathname, navigate]);

    useEffect(() => {
        if (isPublicRoute) return;
        if (!isAgent) return;
        if (!isAgentAllowedPath(location.pathname)) {
            navigate('/applications', { replace: true });
        }
    }, [isAgent, isPublicRoute, location.pathname, navigate]);

    // ✅ DOCUSIGN CALLBACK HANDLER - Runs on every page load
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        const state = params.get("state");

        if (code) {
            console.log("DocuSign callback detected - code:", code);
            console.log("DocuSign callback state:", state);

            // Call the callback API to exchange code for access token
            axiosGet("/docusign/callback", {
                params: {
                    code,
                    state,
                },
            })
                .then((res) => {
                    console.log("DocuSign callback response:", res);
                    console.log("DocuSign callback data:", res.data);

                    toast.success("DocuSign connected successfully!");

                    // Remove query parameters from URL without reloading
                    window.history.replaceState({}, document.title, window.location.pathname);

                    // If we have a PDF URL stored, we can optionally redirect to create the envelope
                    // This will be handled by the ContractTab when user navigates back
                })
                .catch((err) => {
                    console.error("DocuSign callback error:", err);
                    toast.error(err?.response?.data?.message || "DocuSign connection failed");

                    // Still clean up the URL even on error
                    window.history.replaceState({}, document.title, window.location.pathname);
                });
        }
    }, [location.search]);

    if (isPublicRoute) {
        return <div className="crm-keep-case min-h-screen bg-background"><Outlet /></div>;
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Tablet widths (768–1023px) can't fit the expanded sidebar plus content — start icon-collapsed there. */}
            <SidebarProvider
                defaultOpen={
                    typeof window === "undefined" ||
                    window.matchMedia("(min-width: 1024px)").matches
                }
            >
                <Sidebar />
                <RootLayoutWrapper />
            </SidebarProvider>
            {currentUserId && (
                <>
                    <OnlineStatusSync />
                    <NotificationsSync />
                    <RealtimeNotificationsListener />
                    {/* <FloatingChatWidget currentUserId={currentUserId} /> */}
                </>
            )}
        </div>
    );
};

export default RootLayout;