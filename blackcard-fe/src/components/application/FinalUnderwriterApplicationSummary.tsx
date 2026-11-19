import type { ComponentProps } from "react";
import ApplicationSummary from "./ApplicationSummary";

/**
 * Underwriter application-detail summary — includes Scrubber Request
 * (not shown to Super Admin or other roles).
 */
export default function FinalUnderwriterApplicationSummary(
  props: ComponentProps<typeof ApplicationSummary>,
) {
  return <ApplicationSummary {...props} showScrubberRequest />;
}
