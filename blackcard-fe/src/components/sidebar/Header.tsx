import type { RootState } from "@/redux/store"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import type { user } from "../../redux/slices/authSlice";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import NotificationDropdown from "@/components/notifications/NotificationDropdown";

import { useLocation, useNavigate } from "react-router";

// Map routes to page titles
const getPageTitle = (pathname: string): string => {
    if (pathname === '/') return 'Dashboard';
    if (pathname.startsWith('/operations-applications')) return 'Operations pipeline';
    if (pathname.startsWith('/clients') || pathname.startsWith('/create-clients')) return 'Client';
    if (pathname.startsWith('/applications') || pathname.startsWith('/create-applications')) return 'Submission';
    if (pathname.startsWith('/application-details')) return 'Submission';
    if (pathname.startsWith('/commission-portal')) return 'Commission Portal';
    if (pathname.startsWith('/payments')) return 'Accountant';
    if (pathname.startsWith('/reports')) return 'Reports';
    if (pathname.startsWith('/team-chat')) return 'Team Chat';
    if (pathname.startsWith('/notifications')) return 'Notifications';
    if (pathname.startsWith('/case-management')) return 'Case Management';
    if (pathname.startsWith('/gmail')) return 'Gmail Workspace';
    if (pathname.startsWith('/user-setting')) return 'Settings';
    if (pathname.startsWith('/settings')) return 'Settings';
    if (pathname.startsWith('/create-terms-offer')) return 'Terms Offer';
    if (pathname.startsWith('/create-position')) return 'Position';
    // Default fallback
    return 'Dashboard';
};

const Header = () => {

    const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
    // On mobile the sidebar is an off-canvas sheet driven by openMobile, not state/setOpen.
    const sidebarVisible = isMobile ? openMobile : state === "expanded";
    const [user, setUser] = useState<user>()
    const { loading, data } = useSelector((state: RootState) => state.login)
    const { pathname } = useLocation();
    const navigate = useNavigate();

    // Get page title based on current route
    const pageTitle = getPageTitle(pathname);

    useEffect(() => {
        setUser(data?.user)
        if (!data.user) {
            const user = localStorage.getItem('user')
            if (user) {
                setUser(JSON.parse(user))
            }
            else {
                setUser(undefined)
            }
        }

    }, [data, loading])

    return (
        <header className="sticky top-0 z-40 border-b border-border bg-card app-header-scroll-compensate">
            <div className="w-full mx-auto px-4 md:px-6">
                <div className="h-16 flex items-center justify-between">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Button variant="outline" size={"sm"} onClick={toggleSidebar}>
                            {sidebarVisible ? (
                                <PanelLeftClose size={20} />
                            ) : (
                                <PanelLeftOpen size={20} />
                            )}
                        </Button>
                        <h1 className="truncate text-lg md:text-xl font-semibold text-muted-foreground font-inter">
                            {pageTitle}
                        </h1>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 md:gap-3">
                        <ThemeToggle />
                        <NotificationDropdown />
                        <button
                            type="button"
                            onClick={() => navigate("/user-setting")}
                            className="flex items-center gap-2 cursor-pointer"
                        >
                            <div className="h-8 w-8 rounded-full bg-[image:var(--brand-gradient)] text-white text-xs font-semibold flex items-center justify-center">{user?.firstName?.slice(0, 1).toUpperCase()}{user?.lastName?.slice(0, 1).toUpperCase()}</div>
                            <div className="hidden sm:block">
                                <div className="text-sm font-medium text-foreground capitalize">{user?.firstName + ' ' + user?.lastName || 'John Doe'}</div>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </header>
    )
}

export default Header