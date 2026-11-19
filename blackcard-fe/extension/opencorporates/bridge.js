/* global window, sessionStorage */

(function initCrmBridge() {
  if (window.CrmBackgroundCheckBridge) return;

  const BRIDGE_STORAGE_KEY = "crm_background_check_bridge";
const RETURN_MESSAGE_TYPE = "crm:bridge-return";

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function persistBridgeContext(context) {
  if (!context.applicationId && !context.targetOrigin) return;
  try {
    sessionStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Ignore quota / private-mode errors.
  }
}

function loadBridgeContext() {
  try {
    const raw = sessionStorage.getItem(BRIDGE_STORAGE_KEY);
    if (!raw) return emptyBridgeContext();
    const parsed = JSON.parse(raw);
    return normalizeBridgeContext(parsed);
  } catch {
    return emptyBridgeContext();
  }
}

function emptyBridgeContext() {
  return {
    applicationId: "",
    targetOrigin: "",
    returnUrl: "",
    sectionId: "",
    searchMode: "",
    businessName: "",
    ownerFirstName: "",
    ownerMiddleName: "",
    ownerLastName: "",
  };
}

function normalizeBridgeContext(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    applicationId: cleanText(data.applicationId),
    targetOrigin: cleanText(data.targetOrigin),
    returnUrl: cleanText(data.returnUrl),
    sectionId: cleanText(data.sectionId),
    searchMode: cleanText(data.searchMode),
    businessName: cleanText(data.businessName),
    ownerFirstName: cleanText(data.ownerFirstName),
    ownerMiddleName: cleanText(data.ownerMiddleName),
    ownerLastName: cleanText(data.ownerLastName),
  };
}

function readParamsFromLocation() {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const hashParams = new URLSearchParams(hash);
    if (
      hashParams.get("crm_app_id") ||
      hashParams.get("hardrock_app_id") ||
      hashParams.get("crm_origin") ||
      hashParams.get("hardrock_origin")
    ) {
      return { params: hashParams, fromHash: true };
    }
  }

  return { params: new URLSearchParams(window.location.search), fromHash: false };
}

function clearBridgeHashFromUrl() {
  if (!window.location.hash) return;
  try {
    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(null, "", cleanUrl);
  } catch {
    // Ignore history API errors.
  }
}

function readBridgeContext() {
  const { params, fromHash } = readParamsFromLocation();
  const fromUrl = normalizeBridgeContext({
    applicationId: params.get("crm_app_id") || params.get("hardrock_app_id"),
    targetOrigin: params.get("crm_origin") || params.get("hardrock_origin"),
    returnUrl: params.get("crm_return_url"),
    sectionId: params.get("crm_section"),
    searchMode: params.get("crm_search_mode"),
    businessName: params.get("crm_business_name"),
    ownerFirstName: params.get("crm_owner_first"),
    ownerMiddleName: params.get("crm_owner_middle"),
    ownerLastName: params.get("crm_owner_last"),
  });

  if (fromUrl.applicationId || fromUrl.targetOrigin || fromUrl.returnUrl) {
    persistBridgeContext(fromUrl);
    if (fromHash) {
      clearBridgeHashFromUrl();
    }
    return fromUrl;
  }

  return loadBridgeContext();
}

function buildOriginVariants(origin) {
  const variants = [];
  const cleaned = cleanText(origin);
  if (!cleaned) return variants;
  variants.push(cleaned);
  try {
    const url = new URL(cleaned);
    if (url.hostname.startsWith("www.")) {
      variants.push(`${url.protocol}//${url.hostname.slice(4)}`);
    } else {
      variants.push(`${url.protocol}//www.${url.hostname}`);
    }
  } catch {
    // Ignore invalid origin.
  }
  return [...new Set(variants.filter(Boolean))];
}

function postMessageToOpener(context, importPayload, returnMessage) {
  if (!window.opener || window.opener.closed) return false;

  const origins = buildOriginVariants(context.targetOrigin);
  if (!origins.length) return false;

  for (const origin of origins) {
    try {
      window.opener.postMessage(importPayload, origin);
      window.opener.postMessage(returnMessage, origin);
      window.opener.focus();
      window.setTimeout(() => {
        try {
          window.close();
        } catch {
          // Popup may be blocked from closing; CRM tab is already focused.
        }
      }, 700);
      return true;
    } catch {
      // Try next origin variant (www vs non-www).
    }
  }
  return false;
}

function applicationIdFromReturnUrl(returnUrl) {
  const match = String(returnUrl || "").match(/\/application-details\/([^/?#]+)/i);
  return match?.[1] ? cleanText(match[1]) : "";
}

function bridgeStorageIds(context) {
  const ids = new Set();
  const fromReturn = applicationIdFromReturnUrl(context.returnUrl);
  if (fromReturn) ids.add(fromReturn);
  if (context.applicationId) ids.add(cleanText(context.applicationId));
  return [...ids];
}

function deliverViaExtensionStorage(context, importPayload, source, returnMessage) {
  if (
    typeof chrome === "undefined" ||
    !chrome.storage ||
    !chrome.storage.local
  ) {
    return false;
  }

  const storageIds = bridgeStorageIds(context);
  if (!storageIds.length) return false;

  const primaryId = storageIds[0];
  const pending = {
    source,
    importPayload: {
      ...importPayload,
      applicationId: primaryId,
    },
    returnMessage: {
      ...returnMessage,
      applicationId: primaryId,
    },
    savedAt: Date.now(),
  };

  const storagePayload = {};
  storageIds.forEach((id) => {
    storagePayload[`crm_bridge_pending_${id}`] = pending;
  });

  chrome.storage.local.set(storagePayload, () => {
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage(
        {
          type: "crm:bridge-deliver",
          applicationId: primaryId,
          applicationIds: storageIds,
          returnUrl: context.returnUrl,
        },
        () => {
          window.setTimeout(() => {
            try {
              window.close();
            } catch {
              if (context.returnUrl) {
                const joiner = context.returnUrl.includes("#") ? "&" : "#";
                window.location.href = `${context.returnUrl}${joiner}crm_bridge_pending=1`;
              }
            }
          }, 400);
        },
      );
      return;
    }

    if (context.returnUrl) {
      const joiner = context.returnUrl.includes("#") ? "&" : "#";
      window.location.href = `${context.returnUrl}${joiner}crm_bridge_pending=1`;
    }
  });

  return true;
}

function sendPayloadToCrm(importPayload, source) {
  const context = readBridgeContext();
  const returnMessage = {
    type: RETURN_MESSAGE_TYPE,
    applicationId: context.applicationId,
    source,
    returnUrl: context.returnUrl,
    sectionId: context.sectionId,
  };

  if (postMessageToOpener(context, importPayload, returnMessage)) {
    return { mode: "opener", applicationId: context.applicationId, targetOrigin: context.targetOrigin };
  }

  if (deliverViaExtensionStorage(context, importPayload, source, returnMessage)) {
    return { mode: "redirect", applicationId: context.applicationId, targetOrigin: context.targetOrigin };
  }

  return { mode: "clipboard", applicationId: context.applicationId, targetOrigin: context.targetOrigin };
}

window.CrmBackgroundCheckBridge = {
  BRIDGE_STORAGE_KEY,
  RETURN_MESSAGE_TYPE,
  readBridgeContext,
  persistBridgeContext,
  sendPayloadToCrm,
  cleanText,
};
})();
