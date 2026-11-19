import { useEffect, useRef } from "react";
import {
  loadCrmBridgeInbox,
  readRouteApplicationIdFromLocation,
  type CrmBridgeInboxPayload,
  type CrmBridgeSectionId,
} from "./crmBridgeTypes";

export function useCrmBridgeInbox(
  applicationId: string | undefined,
  source: CrmBridgeSectionId,
  onInbox: (payload: CrmBridgeInboxPayload) => void,
): void {
  const onInboxRef = useRef(onInbox);
  onInboxRef.current = onInbox;

  useEffect(() => {
    const routeApplicationId = readRouteApplicationIdFromLocation();
    const resolvedId = applicationId || routeApplicationId;
    if (!resolvedId) return;

    const consume = () => {
      const inbox = loadCrmBridgeInbox(resolvedId, { source });
      if (inbox) {
        onInboxRef.current(inbox);
      }
    };

    consume();
    window.addEventListener("crm-bridge-inbox", consume);

    const pollInterval = window.setInterval(consume, 1000);
    const stopPoll = window.setTimeout(() => {
      window.clearInterval(pollInterval);
    }, 60_000);

    return () => {
      window.removeEventListener("crm-bridge-inbox", consume);
      window.clearInterval(pollInterval);
      window.clearTimeout(stopPoll);
    };
  }, [applicationId, source]);
}
