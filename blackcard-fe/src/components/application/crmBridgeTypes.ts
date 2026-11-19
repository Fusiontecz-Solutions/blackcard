import { routeParamMatchesApplication } from "@/lib/applicationRouteMatch";

export const CRM_BRIDGE_RETURN_MESSAGE_TYPE = "crm:bridge-return";

export type CrmBridgeSectionId = "opencorporates" | "nyscef";

export type CrmBridgeSearchMode = "business" | "owner";

export type CrmBridgeLaunchContext = {
  applicationId: string;
  origin: string;
  returnUrl: string;
  sectionId: CrmBridgeSectionId;
  searchMode?: CrmBridgeSearchMode;
  businessName?: string;
  ownerFirstName?: string;
  ownerMiddleName?: string;
  ownerLastName?: string;
};

export type CrmBridgeReturnMessage = {
  type: typeof CRM_BRIDGE_RETURN_MESSAGE_TYPE;
  applicationId: string;
  source: CrmBridgeSectionId;
  returnUrl?: string;
  sectionId?: string;
};

/** Must match the live CRM tab origin exactly (postMessage + redirect fallback). */
export function resolveCrmBridgeOrigin(): string {
  if (typeof window !== "undefined" && window.location.origin) {
    return window.location.origin;
  }
  return (
    (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.replace(/\/$/, "") || ""
  );
}

/** Prefer the URL route segment — it is the canonical id for bridge storage keys. */
export function resolveBridgeApplicationId(
  routeApplicationId: string | undefined,
  applicationData?: Record<string, unknown> | null,
): string {
  const route = String(routeApplicationId ?? "").trim();
  if (route) return route;
  const data = applicationData ?? {};
  return String(data._id ?? data.id ?? data.applicationId ?? "").trim();
}

export function readRouteApplicationIdFromLocation(): string {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/\/application-details\/([^/]+)/i);
  return match?.[1] ? String(match[1]).trim() : "";
}

/** Import messages may carry UUID, numeric deal id, or legacy id for the same application. */
export function bridgeImportApplicationIdMatches(
  expectedApplicationId: string,
  messageApplicationId: string,
  applicationData?: Record<string, unknown> | null,
): boolean {
  const expected = String(expectedApplicationId ?? "").trim();
  const message = String(messageApplicationId ?? "").trim();
  if (!expected || !message) return false;
  if (expected === message) return true;
  if (!applicationData) return false;

  const candidates = new Set(
    [
      expected,
      message,
      applicationData._id,
      applicationData.id,
      applicationData.applicationId,
    ]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean),
  );

  if (candidates.has(expected) && candidates.has(message)) return true;

  return (
    routeParamMatchesApplication(expected, applicationData) &&
    (message === String(applicationData.applicationId ?? "") ||
      message === String(applicationData._id ?? "") ||
      message === String(applicationData.id ?? ""))
  );
}

export function buildCrmBackgroundCheckReturnUrl(
  applicationId: string,
  sectionId: CrmBridgeSectionId,
): string {
  const origin = resolveCrmBridgeOrigin();
  return `${origin}/application-details/${applicationId}/background-check#bg-check-${sectionId}`;
}

export const CRM_BRIDGE_INBOX_PREFIX = "crm_bridge_inbox_";

export type CrmBridgeInboxPayload = {
  source: CrmBridgeSectionId;
  importPayload: unknown;
  returnMessage: CrmBridgeReturnMessage;
  savedAt: number;
};

export function loadCrmBridgeInbox(
  applicationId: string,
  options?: { source?: CrmBridgeSectionId },
): CrmBridgeInboxPayload | null {
  const ids = [
    String(applicationId ?? "").trim(),
    readRouteApplicationIdFromLocation(),
  ].filter(Boolean);

  for (const id of [...new Set(ids)]) {
    const storageKey = `${CRM_BRIDGE_INBOX_PREFIX}${id}`;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as CrmBridgeInboxPayload;
      if (!parsed?.importPayload || !parsed?.returnMessage) continue;
      if (Date.now() - (parsed.savedAt || 0) > 5 * 60 * 1000) {
        localStorage.removeItem(storageKey);
        continue;
      }
      if (options?.source && parsed.source !== options.source) continue;
      localStorage.removeItem(storageKey);
      return parsed;
    } catch {
      // Try next id alias.
    }
  }
  return null;
}

export function splitOwnerName(fullName: string): {
  firstName: string;
  middleName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0]!, middleName: "", lastName: "" };
  if (parts.length === 2) {
    return { firstName: parts[0]!, middleName: "", lastName: parts[1]! };
  }
  return {
    firstName: parts[0]!,
    middleName: parts.slice(1, -1).join(" "),
    lastName: parts[parts.length - 1]!,
  };
}

function buildCrmBridgeParamEntries(
  context: CrmBridgeLaunchContext,
): [string, string][] {
  const entries: [string, string][] = [
    ["hardrock_app_id", context.applicationId],
    ["hardrock_origin", context.origin],
    ["crm_app_id", context.applicationId],
    ["crm_origin", context.origin],
    ["crm_return_url", context.returnUrl],
    ["crm_section", context.sectionId],
  ];
  if (context.searchMode) {
    entries.push(["crm_search_mode", context.searchMode]);
  }
  if (context.businessName?.trim()) {
    entries.push(["crm_business_name", context.businessName.trim()]);
  }
  if (context.ownerFirstName?.trim()) {
    entries.push(["crm_owner_first", context.ownerFirstName.trim()]);
  }
  if (context.ownerMiddleName?.trim()) {
    entries.push(["crm_owner_middle", context.ownerMiddleName.trim()]);
  }
  if (context.ownerLastName?.trim()) {
    entries.push(["crm_owner_last", context.ownerLastName.trim()]);
  }
  return entries;
}

export function appendCrmBridgeParams(
  baseUrl: string,
  context: CrmBridgeLaunchContext,
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of buildCrmBridgeParamEntries(context)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/** External sites strip unknown query params — pass bridge context in the URL hash instead. */
export function appendCrmBridgeHash(
  baseUrl: string,
  context: CrmBridgeLaunchContext,
): string {
  const url = new URL(baseUrl);
  const params = new URLSearchParams();
  for (const [key, value] of buildCrmBridgeParamEntries(context)) {
    params.set(key, value);
  }
  url.hash = params.toString();
  return url.toString();
}

export function isCrmBridgeReturnMessage(data: unknown): data is CrmBridgeReturnMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as CrmBridgeReturnMessage;
  return msg.type === CRM_BRIDGE_RETURN_MESSAGE_TYPE && Boolean(msg.applicationId);
}

export function handleCrmBridgeReturn(message: CrmBridgeReturnMessage): void {
  const sectionId = message.sectionId || message.source;
  const anchor = document.getElementById(`bg-check-${sectionId}`);
  if (anchor) {
    anchor.scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (message.returnUrl) {
    const hashIndex = message.returnUrl.indexOf("#");
    if (hashIndex >= 0) {
      const hash = message.returnUrl.slice(hashIndex + 1);
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  window.focus();
}
