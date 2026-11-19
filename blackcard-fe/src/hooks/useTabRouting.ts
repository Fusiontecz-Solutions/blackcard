import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

export type TabOption = { id: string; label: string; disabled?: boolean };

/**
 * Keeps a Tab UI fully URL-driven.
 * - Reads `tab` from the current route params.
 * - Validates navigation actions against `availableTabs`.
 * - Redirects to a default tab when `tab` is missing.
 * - Optional `clampInvalidUrlTab`: replace unknown tab segments with the default tab.
 * - Preserves the current query string on tab navigations (e.g. `?operationsStatus=…`).
 * - Exposes `handleTabChange` to navigate when user clicks tabs.
 */
export function useTabRouting(
  availableTabs: TabOption[],
  applicationId: string | undefined | null,
  defaultTab: string,
  options?: { isTabsReady?: boolean; clampInvalidUrlTab?: boolean }
) {
  const navigate = useNavigate();
  const location = useLocation();
  const { tab: tabFromUrl } = useParams<{ tab?: string }>();

  const basePath = useMemo(() => {
    // Preserve backwards compatibility with existing `/application-details/:applicationId` links.
    if (location.pathname.startsWith("/application-details/")) return "/application-details";
    return "/applications";
  }, [location.pathname]);

  const availableTabIds = useMemo(
    () => availableTabs.map((t) => t.id),
    [availableTabs]
  );
  const hasAvailableTabs = availableTabIds.length > 0;

  /** Preserve e.g. `?operationsStatus=…` when syncing tab segment with the URL. */
  const searchSuffix = useMemo(
    () => (location.search && location.search.length > 0 ? location.search : ""),
    [location.search],
  );

  const isTabsReady = options?.isTabsReady ?? true;
  const clampInvalidUrlTab = options?.clampInvalidUrlTab ?? false;

  const resolvedDefaultTab = useMemo(() => {
    if (availableTabIds.includes(defaultTab)) return defaultTab;
    return availableTabIds[0] ?? defaultTab;
  }, [availableTabIds, defaultTab]);

  const activeTab = useMemo(() => {
    // CRITICAL: never override a valid/invalid/restricted URL tab.
    // If URL includes `tab`, always respect it.
    if (typeof tabFromUrl === "string" && tabFromUrl.length > 0) return tabFromUrl;
    return resolvedDefaultTab;
  }, [resolvedDefaultTab, tabFromUrl]);

  // Prevent repeated replace() calls while React Router is applying the navigation.
  const lastReplaceSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!applicationId) return;
    if (!hasAvailableTabs) return;
    if (!isTabsReady) return;

    // URL has an explicit tab segment.
    if (typeof tabFromUrl === "string" && tabFromUrl.length > 0) {
      if (
        clampInvalidUrlTab &&
        !availableTabIds.includes(tabFromUrl)
      ) {
        const signature = `${basePath}:${applicationId}:clampInvalid:${resolvedDefaultTab}:${availableTabIds.join(",")}`;
        if (lastReplaceSignatureRef.current !== signature) {
          lastReplaceSignatureRef.current = signature;
          navigate(
            `${basePath}/${applicationId}/${resolvedDefaultTab}${searchSuffix}`,
            { replace: true },
          );
        }
      }
      return;
    }

    // Only redirect when `tab` is missing from the URL.

    const signature = `${basePath}:${applicationId}:${resolvedDefaultTab}`;
    if (lastReplaceSignatureRef.current === signature) return;
    lastReplaceSignatureRef.current = signature;

    navigate(`${basePath}/${applicationId}/${resolvedDefaultTab}${searchSuffix}`, {
      replace: true,
    });
  }, [
    applicationId,
    availableTabIds,
    basePath,
    hasAvailableTabs,
    isTabsReady,
    resolvedDefaultTab,
    navigate,
    tabFromUrl,
    clampInvalidUrlTab,
    searchSuffix,
  ]);

  const handleTabChange = useCallback(
    (nextTab: string) => {
      if (!applicationId) return;
      if (!availableTabIds.includes(nextTab)) return; // Ensure tab exists before navigating.

      // Avoid redundant navigation for the already-active tab.
      if (nextTab === activeTab && tabFromUrl === nextTab) return;

      // Replace so each tab does not stack history entries; back (browser or summary) leaves the detail view in one step.
      navigate(`${basePath}/${applicationId}/${nextTab}${searchSuffix}`, {
        replace: true,
      });
    },
    [
      activeTab,
      applicationId,
      availableTabIds,
      basePath,
      navigate,
      tabFromUrl,
      searchSuffix,
    ],
  );

  return { activeTab, handleTabChange };
}

