/* global window, localStorage, chrome */

(function initCrmBridgeReceiver() {
  const PENDING_STORAGE_PREFIX = "crm_bridge_pending_";
  const INBOX_PREFIX = "crm_bridge_inbox_";
  const MAX_AGE_MS = 5 * 60 * 1000;

  function readApplicationIdFromPath() {
    const match = window.location.pathname.match(/\/application-details\/([^/]+)/i);
    return match?.[1] ? String(match[1]) : "";
  }

  function hashHasBridgePending() {
    return window.location.hash.includes("crm_bridge_pending");
  }

  function stripBridgePendingFromHash() {
    if (!window.location.hash.includes("crm_bridge_pending")) return;
    let hash = window.location.hash.replace(/^#/, "");
    hash = hash
      .replace(/&?crm_bridge_pending=1/g, "")
      .replace(/^&+/, "")
      .replace(/&+$/, "");
    const nextUrl = hash
      ? `${window.location.pathname}${window.location.search}#${hash}`
      : `${window.location.pathname}${window.location.search}`;
    try {
      window.history.replaceState(null, "", nextUrl);
    } catch {
      // Ignore history errors.
    }
  }

  function deliverInbox(applicationId, pending) {
    if (!applicationId || !pending?.importPayload || !pending?.returnMessage) return;
    if (Date.now() - (pending.savedAt || 0) > MAX_AGE_MS) return;

    const inboxPayload = JSON.stringify({
      source: pending.source,
      importPayload: pending.importPayload,
      returnMessage: pending.returnMessage,
      savedAt: pending.savedAt || Date.now(),
    });

    const routeId = readApplicationIdFromPath() || applicationId;
    const ids = new Set([routeId, applicationId]);
    const messageId = pending?.importPayload?.applicationId;
    if (messageId) ids.add(String(messageId));

    try {
      ids.forEach((id) => {
        if (id) localStorage.setItem(`${INBOX_PREFIX}${id}`, inboxPayload);
      });
    } catch {
      return;
    }

    stripBridgePendingFromHash();
    window.dispatchEvent(
      new CustomEvent("crm-bridge-inbox", { detail: { applicationId } }),
    );
    window.focus();
  }

  function consumePendingFromStorage(applicationId) {
    if (!chrome?.storage?.local) return;

    const tryDeliver = (id, pending, keysToRemove) => {
      if (!pending) return false;
      deliverInbox(id, pending);
      if (keysToRemove?.length) {
        chrome.storage.local.remove(keysToRemove);
      }
      return true;
    };

    const routeId = readApplicationIdFromPath();
    const idsToTry = [...new Set([applicationId, routeId].filter(Boolean))];

    idsToTry.forEach((id) => {
      const storageKey = `${PENDING_STORAGE_PREFIX}${id}`;
      chrome.storage.local.get([storageKey], (result) => {
        const pending = result?.[storageKey];
        if (pending) {
          tryDeliver(routeId || id, pending, [storageKey]);
        }
      });
    });

    chrome.storage.local.get(null, (all) => {
      if (!all || typeof all !== "object") return;
      const currentPath = `${window.location.pathname}${window.location.search}`;
      Object.entries(all).forEach(([key, pending]) => {
        if (!key.startsWith(PENDING_STORAGE_PREFIX)) return;
        const returnUrl = pending?.returnMessage?.returnUrl || pending?.returnUrl;
        if (!returnUrl) return;
        try {
          const returnPath = new URL(returnUrl).pathname;
          if (currentPath.startsWith(returnPath)) {
            tryDeliver(routeId || readApplicationIdFromPath(), pending, [key]);
          }
        } catch {
          // Ignore invalid return URL.
        }
      });
    });
  }

  function consumePendingBridge() {
    const applicationId = readApplicationIdFromPath();
    if (!applicationId) return;
    consumePendingFromStorage(applicationId);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", consumePendingBridge, { once: true });
  } else {
    consumePendingBridge();
  }

  window.addEventListener("hashchange", consumePendingBridge);
  window.addEventListener("popstate", consumePendingBridge);

  if (chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const routeId = readApplicationIdFromPath();
      if (!routeId) return;

      Object.entries(changes).forEach(([key, change]) => {
        if (!key.startsWith(PENDING_STORAGE_PREFIX) || !change?.newValue) return;
        const pending = change.newValue;
        const ids = [
          routeId,
          key.slice(PENDING_STORAGE_PREFIX.length),
          pending?.returnMessage?.applicationId,
        ].filter(Boolean);
        if (ids.some((id) => key === `${PENDING_STORAGE_PREFIX}${id}` || id === routeId)) {
          deliverInbox(routeId, pending);
          chrome.storage.local.remove([key]);
        }
      });
    });
  }

  if (hashHasBridgePending()) {
    consumePendingBridge();
  }
})();
