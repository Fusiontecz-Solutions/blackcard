/* global chrome */

function pathIncludesApplicationId(url, applicationId) {
  if (!url || !applicationId) return false;
  try {
    return new URL(url).pathname.includes(`/application-details/${applicationId}/`);
  } catch {
    return false;
  }
}

function applicationIdsFromMessage(message) {
  const ids = new Set();
  if (message?.applicationId) ids.add(String(message.applicationId));
  if (Array.isArray(message?.applicationIds)) {
    message.applicationIds.forEach((id) => {
      if (id) ids.add(String(id));
    });
  }
  const match = String(message?.returnUrl || "").match(/\/application-details\/([^/?#]+)/i);
  if (match?.[1]) ids.add(match[1]);
  return [...ids];
}

function tabMatchesApplicationIds(tab, applicationIds) {
  if (!tab?.url) return false;
  return applicationIds.some((id) => pathIncludesApplicationId(tab.url, id));
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "crm:bridge-deliver") return;

  const applicationIds = applicationIdsFromMessage(message);
  const { returnUrl } = message;
  const senderTabId = sender?.tab?.id;
  if (!applicationIds.length) {
    sendResponse({ ok: false });
    return;
  }

  chrome.tabs.query({}, (tabs) => {
    const matches = tabs.filter(
      (tab) =>
        tab.id &&
        tab.id !== senderTabId &&
        tabMatchesApplicationIds(tab, applicationIds),
    );

    const target = matches[0] || null;

    if (target?.id) {
      const updates = { active: true, highlighted: true };
      if (returnUrl && !String(target.url || "").includes("/background-check")) {
        updates.url = returnUrl;
      }
      chrome.tabs.update(target.id, updates, () => {
        sendResponse({ ok: true, tabId: target.id });
      });
      return;
    }

    if (returnUrl) {
      chrome.tabs.create({ url: returnUrl, active: true }, (tab) => {
        sendResponse({ ok: true, tabId: tab?.id ?? null });
      });
      return;
    }

    sendResponse({ ok: false });
  });

  return true;
});
