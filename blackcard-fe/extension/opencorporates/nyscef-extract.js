/* global window, document */

(function initNyscefExtract() {
  if (window.CrmNyscefExtract) return;

  const IMPORT_MESSAGE_TYPE = "crm:nyscef-import";

const FIELD_SELECTORS = {
  business: [
    "#txtBusinessOrgName",
    'input[name="txtBusinessOrgName"]',
    'input[id*="BusinessOrg" i]',
    'input[name*="BusinessOrg" i]',
    'input[name*="business" i]',
    'input[id*="business" i]',
  ],
  first: [
    "#txtPartyFirstName",
    'input[name="txtPartyFirstName"]',
    'input[id*="PartyFirst" i]',
    'input[name*="PartyFirst" i]',
    'input[name*="first" i][name*="party" i]',
    'input[id*="first" i][id*="party" i]',
  ],
  middle: [
    "#txtPartyMiddleName",
    'input[name="txtPartyMiddleName"]',
    'input[id*="PartyMiddle" i]',
    'input[name*="PartyMiddle" i]',
    'input[name*="middle" i][name*="party" i]',
    'input[id*="middle" i][id*="party" i]',
  ],
  last: [
    "#txtPartyLastName",
    'input[name="txtPartyLastName"]',
    'input[id*="PartyLast" i]',
    'input[name*="PartyLast" i]',
    'input[name*="last" i][name*="party" i]',
    'input[id*="last" i][id*="party" i]',
  ],
};

function getBridge() {
  return window.CrmBackgroundCheckBridge;
}

function cleanText(value) {
  return getBridge()?.cleanText(value) || String(value || "").replace(/\s+/g, " ").trim();
}

function isResultsPage() {
  const text = cleanText(document.body?.textContent || "").toLowerCase();
  if (text.includes("no cases found") || text.includes("case search results")) return true;
  if (document.querySelector("table")) {
    const headers = Array.from(document.querySelectorAll("th, td")).map((cell) =>
      cleanText(cell.textContent).toLowerCase(),
    );
    return headers.some(
      (header) =>
        header.includes("index") ||
        header.includes("case name") ||
        header.includes("filing date") ||
        header.includes("court"),
    );
  }
  return /CaseSearchResults|DocumentList|CaseDetails/i.test(window.location.pathname);
}

function isSearchFormPage() {
  return /CaseSearch/i.test(window.location.pathname) && !isResultsPage();
}

function findBySelectors(selectors) {
  for (const selector of selectors) {
    try {
      const input = document.querySelector(selector);
      if (input && !input.disabled && input.type !== "hidden") return input;
    } catch {
      // Invalid selector — try next.
    }
  }
  return null;
}

function setInputValue(input, value) {
  if (!input || value == null || value === "") return false;

  const nextValue = String(value);
  const proto = window.HTMLInputElement?.prototype;
  const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
  if (descriptor?.set) {
    descriptor.set.call(input, nextValue);
  } else {
    input.value = nextValue;
  }

  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.dispatchEvent(new Event("blur", { bubbles: true }));
  return input.value === nextValue;
}

function findInputByLabel(labelText) {
  const wanted = labelText.toLowerCase();
  const labels = Array.from(document.querySelectorAll("label, td, th, span, div, p"));
  for (const label of labels) {
    const text = cleanText(label.textContent).toLowerCase();
    if (!text || !text.includes(wanted)) continue;
    const container = label.closest("tr, .form-group, fieldset, form, div") || label.parentElement;
    const input = container?.querySelector?.(
      'input[type="text"], input:not([type]), textarea',
    );
    if (input && !input.disabled && input.type !== "hidden") return input;
  }
  return null;
}

function findInputNearHeading(headingText) {
  const wanted = headingText.toLowerCase();
  const nodes = Array.from(document.querySelectorAll("label, th, td, span, div, p, legend"));
  for (const node of nodes) {
    const text = cleanText(node.textContent).toLowerCase();
    if (text !== wanted && !text.startsWith(wanted)) continue;
    const row = node.closest("tr");
    if (row) {
      const input = row.querySelector('input[type="text"], input:not([type])');
      if (input) return input;
    }
    const sibling = node.parentElement?.querySelector?.(
      'input[type="text"], input:not([type])',
    );
    if (sibling) return sibling;
  }
  return null;
}

function selectPartyNameType() {
  const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
  for (const radio of radios) {
    const value = cleanText(radio.value).toLowerCase();
    const name = cleanText(radio.name).toLowerCase();
    const id = cleanText(radio.id).toLowerCase();
    const label =
      radio.labels?.[0] ||
      document.querySelector(`label[for="${radio.id}"]`) ||
      radio.closest("label");

    const labelText = cleanText(label?.textContent).toLowerCase();
    const isParty =
      value === "party" ||
      value.includes("party") ||
      labelText === "party" ||
      (name.includes("nametype") && labelText.includes("party")) ||
      id.includes("party");

    if (isParty && !labelText.includes("attorney")) {
      radio.click();
      radio.checked = true;
      radio.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }

  const partyRadio =
    document.querySelector('input[type="radio"][value*="party" i]') ||
    document.querySelector('input[type="radio"][name*="nameType" i]');
  if (partyRadio) {
    partyRadio.click();
    partyRadio.checked = true;
    partyRadio.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

function resolveBusinessInput() {
  return (
    findBySelectors(FIELD_SELECTORS.business) ||
    findInputNearHeading("business/organization") ||
    findInputByLabel("business/organization") ||
    findInputByLabel("business") ||
    findInputByLabel("organization")
  );
}

function resolveOwnerInputs() {
  return {
    first:
      findBySelectors(FIELD_SELECTORS.first) ||
      findInputNearHeading("first") ||
      findInputByLabel("first"),
    middle:
      findBySelectors(FIELD_SELECTORS.middle) ||
      findInputByLabel("middle"),
    last:
      findBySelectors(FIELD_SELECTORS.last) ||
      findInputNearHeading("last") ||
      findInputByLabel("last"),
  };
}

function prefillSearchForm() {
  const context = getBridge()?.readBridgeContext() || {};
  if (!isSearchFormPage()) return { filled: false, mode: context.searchMode || "business" };

  const mode = (context.searchMode || "business").toLowerCase();

  if (mode === "owner") {
    selectPartyNameType();
    const inputs = resolveOwnerInputs();
    const filledFirst = setInputValue(inputs.first, context.ownerFirstName);
    const filledMiddle = context.ownerMiddleName
      ? setInputValue(inputs.middle, context.ownerMiddleName)
      : false;
    const filledLast = setInputValue(inputs.last, context.ownerLastName);
    const filled = Boolean(filledFirst || filledLast || filledMiddle);
    return { filled, mode };
  }

  const businessInput = resolveBusinessInput();
  const filled = setInputValue(businessInput, context.businessName);
  return { filled, mode };
}

function schedulePrefillSearchForm() {
  if (!isSearchFormPage()) return;

  let attempts = 0;
  const maxAttempts = 30;
  let filled = false;

  const tryPrefill = () => {
    if (!isSearchFormPage()) return true;
    const result = prefillSearchForm();
    filled = filled || result.filled;
    attempts += 1;
    return filled || attempts >= maxAttempts;
  };

  if (tryPrefill()) return;

  const intervalId = window.setInterval(() => {
    if (tryPrefill()) {
      window.clearInterval(intervalId);
      observer.disconnect();
    }
  }, 500);

  const observer = new MutationObserver(() => {
    if (tryPrefill()) {
      window.clearInterval(intervalId);
      observer.disconnect();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => {
    window.clearInterval(intervalId);
    observer.disconnect();
  }, 15_000);
}

function cellText(cell) {
  if (!cell) return "";
  if (typeof cell === "string") return cleanText(cell);
  return cleanText(cell.textContent || cell.innerText || "");
}

function parseIndexAndDate(value) {
  const text = cleanText(value);
  if (!text) return { indexNumber: undefined, filingDate: undefined };

  const dateMatch = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  if (!dateMatch) {
    return { indexNumber: text, filingDate: undefined };
  }

  const filingDate = dateMatch[1];
  const indexNumber = cleanText(text.replace(dateMatch[0], ""));
  return { indexNumber: indexNumber || undefined, filingDate };
}

function splitCourtCaseType(value) {
  const parts = String(value || "")
    .split(/\n+/)
    .map((part) => cleanText(part))
    .filter(Boolean);

  if (parts.length >= 2) {
    return {
      court: parts[0],
      caseType: parts.slice(1).join(" · "),
    };
  }

  const text = cleanText(value);
  return { court: text || undefined, caseType: undefined };
}

function parseCaseRow(cells) {
  const values = cells.map((cell) => cellText(cell));
  if (values.length < 2) return null;

  const joined = values.join(" ").toLowerCase();
  if (
    joined.includes("index number") ||
    joined.includes("case name") ||
    joined.includes("case #/received date") ||
    joined.includes("efiling status") ||
    joined.includes("caption") ||
    joined.includes("court/case type") ||
    joined === "search" ||
    joined.includes("filing date")
  ) {
    return null;
  }

  const base = {
    detailUrl: undefined,
    searchMode: (getBridge()?.readBridgeContext()?.searchMode || "business").toLowerCase(),
  };

  const link = cells
    .flatMap((cell) => Array.from(cell.querySelectorAll("a[href]")))
    .find((anchor) => /CaseDetails|DocumentList|CaseSearch/i.test(anchor.getAttribute("href") || ""));
  if (link?.href) base.detailUrl = link.href;

  let row;
  if (values.length === 4) {
    const indexParts = parseIndexAndDate(values[0]);
    const courtParts = splitCourtCaseType(values[3]);
    row = {
      ...base,
      indexNumber: indexParts.indexNumber,
      filingDate: indexParts.filingDate,
      status: values[1] || undefined,
      caseName: values[2] || undefined,
      court: courtParts.court,
      caseType: courtParts.caseType,
    };
  } else {
    row = {
      ...base,
      indexNumber: values[0] || undefined,
      caseName: values[1] || undefined,
      caseType: values[2] || undefined,
      court: values[3] || undefined,
      filingDate: values[4] || values[3] || undefined,
      status: values[5] || undefined,
    };
  }

  if (!row.caseName && !row.indexNumber) return null;
  return row;
}

function extractCasesFromTables() {
  const cases = [];
  const seen = new Set();

  document.querySelectorAll("table").forEach((table) => {
    table.querySelectorAll("tr").forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (!cells.length) return;
      const parsed = parseCaseRow(cells);
      if (!parsed) return;
      const key = `${parsed.indexNumber || ""}|${parsed.caseName || ""}|${parsed.filingDate || ""}`;
      if (seen.has(key)) return;
      seen.add(key);
      cases.push(parsed);
    });
  });

  return cases;
}

function extractCasesFromLists() {
  const cases = [];
  const seen = new Set();

  document.querySelectorAll("a[href*='CaseDetails'], a[href*='DocumentList']").forEach((anchor) => {
    const container =
      anchor.closest("tr, li, .result, .search-result, div") || anchor.parentElement;
    const text = cleanText(container?.textContent || anchor.textContent);
    if (!text || seen.has(text)) return;
    seen.add(text);
    cases.push({
      caseName: cleanText(anchor.textContent) || text,
      detailUrl: anchor.href,
      searchMode: (getBridge()?.readBridgeContext()?.searchMode || "business").toLowerCase(),
    });
  });

  return cases;
}

function extractPageCases() {
  const fromTables = extractCasesFromTables();
  if (fromTables.length > 0) return fromTables;
  return extractCasesFromLists();
}

function buildImportPayload(cases) {
  const context = getBridge()?.readBridgeContext() || {};
  const searchQuery =
    context.searchMode === "owner"
      ? [context.ownerFirstName, context.ownerMiddleName, context.ownerLastName]
          .filter(Boolean)
          .join(" ")
      : context.businessName;

  return {
    payload: {
      type: IMPORT_MESSAGE_TYPE,
      applicationId: context.applicationId,
      sourceUrl: window.location.href,
      searchedAt: new Date().toISOString(),
      searchQuery,
      searchMode: context.searchMode || "business",
      cases,
    },
    context,
  };
}

function copyPayloadToClipboard(cases) {
  const { payload } = buildImportPayload(cases);
  return navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
}

function sendToCrm(cases) {
  const { payload } = buildImportPayload(cases);
  const bridgeResult = getBridge()?.sendPayloadToCrm(payload, "nyscef");
  if (bridgeResult?.mode === "opener" || bridgeResult?.mode === "redirect") {
    return {
      mode: bridgeResult.mode,
      count: cases.length,
      applicationId: bridgeResult.applicationId,
    };
  }

  void copyPayloadToClipboard(cases);
  return { mode: "clipboard", count: cases.length, applicationId: payload.applicationId };
}

window.CrmNyscefExtract = {
  IMPORT_MESSAGE_TYPE,
  isSearchFormPage,
  isResultsPage,
  prefillSearchForm,
  schedulePrefillSearchForm,
  extractPageCases,
  sendToCrm,
  buildImportPayload,
  copyPayloadToClipboard,
};
})();
