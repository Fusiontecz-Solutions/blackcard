/* global window, document, history */

(function initOpenCorporatesBridge() {
  const BUTTON_ID = "crm-opencorporates-send-btn";
  const HINT_ID = "crm-opencorporates-captcha-hint";

  function getApi() {
    return window.CrmOpenCorporatesExtract;
  }

  function readContext() {
    const bridge = window.CrmBackgroundCheckBridge;
    if (bridge) {
      const ctx = bridge.readBridgeContext();
      return {
        applicationId: ctx.applicationId || "",
        targetOrigin: ctx.targetOrigin || "",
      };
    }

    const params = new URLSearchParams(window.location.search);
    return {
      applicationId: params.get("crm_app_id") || params.get("hardrock_app_id") || "",
      targetOrigin: params.get("crm_origin") || params.get("hardrock_origin") || "",
    };
  }

  function isCompaniesPage() {
    return /\/companies(\/|$)/i.test(window.location.pathname);
  }

  function isCaptchaPage() {
    return (
      document.title.includes("HAProxy Challenge") ||
      Boolean(document.querySelector(".h-captcha"))
    );
  }

  function shouldShowButton(context) {
    if (isCaptchaPage()) return false;
    return (
      isCompaniesPage() ||
      Boolean(window.opener) ||
      Boolean(context.applicationId || context.targetOrigin)
    );
  }

  function createCaptchaHint() {
    if (document.getElementById(HINT_ID) || !document.body) return;

    const hint = document.createElement("div");
    hint.id = HINT_ID;
    hint.textContent =
      "CRM extension: solve the captcha above. After the page reloads, use Send to CRM (bottom-right).";
    hint.style.cssText = [
      "position:fixed",
      "left:20px",
      "right:20px",
      "bottom:20px",
      "z-index:2147483645",
      "padding:12px 14px",
      "border-radius:10px",
      "background:#1e3a8a",
      "color:#fff",
      "font:600 12px/1.4 system-ui,-apple-system,sans-serif",
      "box-shadow:0 10px 24px rgba(30,58,138,0.35)",
    ].join(";");
    document.body.appendChild(hint);
  }

  function createButton(api) {
    if (document.getElementById(BUTTON_ID) || !document.body) return;

    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "Send to CRM";
    button.title = "Send extracted company data back to the CRM background check tab";
    button.style.cssText = [
      "position:fixed",
      "right:20px",
      "bottom:20px",
      "z-index:2147483646",
      "padding:12px 16px",
      "border:none",
      "border-radius:999px",
      "background:#4f46e5",
      "color:#fff",
      "font:600 13px/1.2 system-ui,-apple-system,sans-serif",
      "box-shadow:0 10px 24px rgba(79,70,229,0.35)",
      "cursor:pointer",
    ].join(";");

    button.addEventListener("click", () => {
      const companies = api.extractPageCompanies();
      if (!companies.length) {
        window.alert("No OpenCorporates companies found on this page.");
        return;
      }

      const result = api.sendToOpener(companies);
      if (result.mode === "opener" || result.mode === "redirect") {
        button.textContent = result.mode === "redirect" ? "Returning to CRM…" : `Sent ${result.count} to CRM`;
        button.style.background = "#15803d";
        return;
      }

      button.textContent = "Copied JSON — paste in CRM";
      button.style.background = "#a16207";
      window.alert(
        `Copied ${result.count} companies as JSON to your clipboard.\n\nIn CRM: OpenCorporates → Paste JSON.`,
      );
    });

    document.body.appendChild(button);
  }

  function mountUi() {
    const api = getApi();
    if (!api || !document.body) return;

    const context = readContext();

    if (isCaptchaPage()) {
      createCaptchaHint();
      return;
    }

    const hint = document.getElementById(HINT_ID);
    if (hint) hint.remove();

    if (shouldShowButton(context)) {
      createButton(api);
    }
  }

  function ensureButton() {
    mountUi();
  }

  function watchNavigation() {
    const rerun = () => window.setTimeout(ensureButton, 100);

    window.addEventListener("popstate", rerun);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushStateWrapper(...args) {
      originalPushState.apply(this, args);
      rerun();
    };

    history.replaceState = function replaceStateWrapper(...args) {
      originalReplaceState.apply(this, args);
      rerun();
    };
  }

  function watchDom() {
    if (!document.body) return;

    const observer = new MutationObserver(() => {
      const api = getApi();
      if (!api) return;
      if (shouldShowButton(readContext()) && !document.getElementById(BUTTON_ID)) {
        createButton(api);
      }
    });

    observer.observe(document.body, { childList: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureButton, { once: true });
  } else {
    ensureButton();
  }

  watchNavigation();
  watchDom();

  window.CrmOpenCorporatesBookmarklet = function bookmarklet() {
    const api = getApi();
    if (!api) {
      window.alert("CRM extension is not loaded on this page.");
      return;
    }
    const companies = api.extractPageCompanies();
    if (!companies.length) {
      window.alert("No companies found on this page.");
      return;
    }
    const payload = api.buildImportPayload(companies);
    void api.copyPayloadToClipboard({ companies: payload.payload.companies });
    window.alert(
      `Copied ${companies.length} compan${companies.length === 1 ? "y" : "ies"} as JSON. Paste into CRM OpenCorporates panel.`,
    );
  };
})();
