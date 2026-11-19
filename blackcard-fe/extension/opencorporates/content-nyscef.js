/* global window, document */

(function initNyscefBridge() {
  const api = window.CrmNyscefExtract;
  const bridge = window.CrmBackgroundCheckBridge;
  if (!api || !bridge) return;

  api.schedulePrefillSearchForm();

  function createButton() {
    if (document.getElementById("crm-nyscef-send-btn")) return;

    const button = document.createElement("button");
    button.id = "crm-nyscef-send-btn";
    button.type = "button";
    button.textContent = "Send to CRM";
    button.title = "Send NY court search results back to the CRM background check tab";
    button.style.cssText = [
      "position:fixed",
      "right:20px",
      "bottom:20px",
      "z-index:2147483646",
      "padding:12px 16px",
      "border:none",
      "border-radius:999px",
      "background:#0f766e",
      "color:#fff",
      "font:600 13px/1.2 system-ui,-apple-system,sans-serif",
      "box-shadow:0 10px 24px rgba(15,118,110,0.35)",
      "cursor:pointer",
    ].join(";");

    button.addEventListener("click", () => {
      const cases = api.extractPageCases();
      if (!cases.length) {
        window.alert(
          "No NY court cases found on this page. Run a search first, then click Send to CRM on the results page.",
        );
        return;
      }

      const result = api.sendToCrm(cases);
      if (result.mode === "opener" || result.mode === "redirect") {
        button.textContent = result.mode === "redirect" ? "Returning to CRM…" : `Sent ${result.count} to CRM`;
        button.style.background = "#15803d";
        return;
      }

      button.textContent = "Copied JSON — paste in CRM";
      button.style.background = "#a16207";
      window.alert(
        `Copied ${result.count} case${result.count === 1 ? "" : "s"} as JSON.\n\nIn CRM: NY Court panel → Paste JSON.`,
      );
    });

    document.body.appendChild(button);
  }

  function createPrefillHint() {
    if (document.getElementById("crm-nyscef-prefill-hint")) return;
    if (!api.isSearchFormPage()) return;

    const context = bridge.readBridgeContext();
    if (!context.businessName && !context.ownerFirstName && !context.ownerLastName) return;

    const prefillLabel =
      context.searchMode === "owner"
        ? [context.ownerFirstName, context.ownerMiddleName, context.ownerLastName]
            .filter(Boolean)
            .join(" ")
        : context.businessName;

    const hint = document.createElement("div");
    hint.id = "crm-nyscef-prefill-hint";
    hint.innerHTML = [
      "<strong>CRM extension:</strong>",
      prefillLabel
        ? ` <span id="crm-nyscef-prefill-value"></span> should be prefilled in the search form.`
        : " Search fields should be prefilled.",
      " Click <strong>Search</strong> on this page, then use <strong>Send to CRM</strong> on the results page.",
    ].join("");
    hint.style.cssText = [
      "position:fixed",
      "left:20px",
      "right:20px",
      "bottom:20px",
      "z-index:2147483645",
      "padding:12px 14px",
      "border-radius:10px",
      "background:#134e4a",
      "color:#fff",
      "font:600 12px/1.4 system-ui,-apple-system,sans-serif",
      "box-shadow:0 10px 24px rgba(19,78,74,0.35)",
    ].join(";");
    document.body.appendChild(hint);

    const valueEl = hint.querySelector("#crm-nyscef-prefill-value");
    if (valueEl && prefillLabel) {
      valueEl.textContent = `"${prefillLabel}"`;
    }

    const updateHint = () => {
      const result = api.prefillSearchForm();
      if (result.filled && valueEl) {
        valueEl.textContent = `"${prefillLabel}"`;
      }
    };

    updateHint();
    const hintInterval = window.setInterval(() => {
      updateHint();
      if (!api.isSearchFormPage()) {
        window.clearInterval(hintInterval);
      }
    }, 750);
    window.setTimeout(() => window.clearInterval(hintInterval), 15_000);
  }

  function contextHasBridge() {
    const context = bridge.readBridgeContext();
    return Boolean(context.applicationId || context.targetOrigin);
  }

  function ensureSendButton() {
    if (api.isResultsPage() || window.opener || contextHasBridge()) {
      createButton();
    }
  }

  ensureSendButton();

  function watchNavigation() {
    const rerun = () => window.setTimeout(ensureSendButton, 100);
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

  if (document.body) {
    const observer = new MutationObserver(() => {
      if (!document.getElementById("crm-nyscef-send-btn")) {
        ensureSendButton();
      }
    });
    observer.observe(document.body, { childList: true });
  }

  watchNavigation();
  createPrefillHint();

  window.CrmNyscefBookmarklet = function bookmarklet() {
    const cases = api.extractPageCases();
    if (!cases.length) {
      window.alert("No NY court cases found on this page.");
      return;
    }
    void api.copyPayloadToClipboard(cases);
    window.alert(
      `Copied ${cases.length} case${cases.length === 1 ? "" : "s"} as JSON. Paste into CRM NY Court panel.`,
    );
  };
})();
