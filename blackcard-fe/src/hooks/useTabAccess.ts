import { createElement, useMemo } from "react";
import type { ReactNode } from "react";
import type { TabOption } from "./useTabRouting";

const fallbackComponent: ReactNode = createElement(
  "div",
  {
    className: "mt-6 rounded-md border border-[#E5E7EB] bg-white p-4 text-sm text-[#687182]",
  },
  createElement(
    "div",
    { className: "font-semibold text-[var(--brand)]" },
    "Access Denied"
  ),
  createElement(
    "div",
    { className: "mt-1" },
    "This tab is not available for your current role. Please contact your administrator if you believe this is an error."
  )
);

export function useTabAccess(tabs: TabOption[], activeTab: string): { isAllowed: boolean; fallbackComponent: ReactNode } {
  const isAllowed = useMemo(() => {
    return tabs.some((t) => t.id === activeTab);
  }, [tabs, activeTab]);

  return { isAllowed, fallbackComponent };
}

