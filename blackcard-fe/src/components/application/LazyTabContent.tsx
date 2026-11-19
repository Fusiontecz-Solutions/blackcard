import type { ReactNode } from "react";
import { TabsContent } from "@/components/ui/tabs";

type LazyTabContentProps = {
  value: string;
  activeTab: string;
  className?: string;
  children: ReactNode;
};

/** Mount tab children only when the tab is active (avoids N+1 API calls on details load). */
export function LazyTabContent({
  value,
  activeTab,
  className,
  children,
}: LazyTabContentProps) {
  return (
    <TabsContent value={value} className={className}>
      {activeTab === value ? children : null}
    </TabsContent>
  );
}
