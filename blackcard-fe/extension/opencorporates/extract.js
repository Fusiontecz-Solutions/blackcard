/* global window */

(function initOpenCorporatesExtract() {
  if (window.CrmOpenCorporatesExtract) return;

  const IMPORT_MESSAGE_TYPE = "crm:opencorporates-import";
  const OC_LEGACY_BRIDGE_STORAGE_KEY = "crm_opencorporates_bridge";
  const LOGIN_GATED_RE = /please\s+(log\s*in|sign\s*in)\s+to\s+see/i;

function getBridge() {
  return window.CrmBackgroundCheckBridge;
}

function persistBridgeContext(context) {
  const bridge = getBridge();
  if (bridge) {
    bridge.persistBridgeContext({
      applicationId: context.applicationId,
      targetOrigin: context.targetOrigin,
      returnUrl: context.returnUrl,
      sectionId: context.sectionId,
      searchMode: context.searchMode,
      businessName: context.businessName,
      ownerFirstName: context.ownerFirstName,
      ownerMiddleName: context.ownerMiddleName,
      ownerLastName: context.ownerLastName,
    });
    return;
  }
  if (!context.applicationId && !context.targetOrigin) return;
  try {
    sessionStorage.setItem(OC_LEGACY_BRIDGE_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Ignore quota / private-mode errors.
  }
}

function loadBridgeContext() {
  const bridge = getBridge();
  if (bridge) return bridge.readBridgeContext();
  try {
    const raw = sessionStorage.getItem(OC_LEGACY_BRIDGE_STORAGE_KEY);
    if (!raw) return { applicationId: "", targetOrigin: "", returnUrl: "", sectionId: "" };
    const parsed = JSON.parse(raw);
    return {
      applicationId: String(parsed.applicationId || ""),
      targetOrigin: String(parsed.targetOrigin || ""),
      returnUrl: String(parsed.returnUrl || ""),
      sectionId: String(parsed.sectionId || ""),
    };
  } catch {
    return { applicationId: "", targetOrigin: "", returnUrl: "", sectionId: "" };
  }
}

function readBridgeContext() {
  const bridge = getBridge();
  if (bridge) return bridge.readBridgeContext();
  return loadBridgeContext();
}

function readContextFromUrl() {
  const context = readBridgeContext();
  if (context.applicationId || context.targetOrigin || context.returnUrl) {
    return context;
  }
  return loadBridgeContext();
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isLoginGated(value) {
  return !value || LOGIN_GATED_RE.test(value);
}

function sanitizeField(value) {
  const cleaned = cleanText(value);
  return isLoginGated(cleaned) ? undefined : cleaned;
}

function pickField(fields, keys) {
  for (const key of keys) {
    const value = fields[key];
    if (value) return value;
  }
  return undefined;
}

function parseCompanyPath(pathname) {
  const match = String(pathname || "").match(/\/companies\/([a-z]{2}(?:_[a-z]{2})?)\/([^/?#]+)/i);
  if (!match) return null;
  return {
    jurisdictionCode: match[1].toLowerCase(),
    companyNumber: decodeURIComponent(match[2]),
  };
}

function parseDefinitionList() {
  const fields = {};
  document.querySelectorAll("dl").forEach((dl) => {
    dl.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (!dd || dd.tagName !== "DD") return;
      const key = cleanText(dt.textContent).toLowerCase();
      const value = sanitizeField(dd.textContent);
      if (key && value) fields[key] = value;
    });
  });
  return fields;
}

function sectionNodesAfterHeading(heading) {
  const nodes = [];
  let el = heading.nextElementSibling;
  while (el && !/^H[1-4]$/i.test(el.tagName)) {
    nodes.push(el);
    el = el.nextElementSibling;
  }
  return nodes;
}

function parseOfficerListItem(li) {
  const text = cleanText(li.textContent);
  if (!text || isLoginGated(text)) return null;

  const link = li.querySelector("a[href*='/officers/'], a[href]");
  const positionEl = li.querySelector(
    ".position, .officer-position, .role, em, small, span.officer-role, span[class*='position']",
  );

  let name = sanitizeField(link?.textContent || "");
  let position = sanitizeField(positionEl?.textContent || "");

  if (name && !position) {
    const nameIdx = text.indexOf(name);
    if (nameIdx >= 0) {
      const remainder = cleanText(
        text.slice(nameIdx + name.length).replace(/^[\s,;:–\-]+/, ""),
      );
      if (remainder && remainder.length <= 50) {
        position = sanitizeField(remainder);
      }
    }
  }

  if (!name) {
    const commaIdx = text.indexOf(",");
    if (commaIdx > 0) {
      name = sanitizeField(text.slice(0, commaIdx));
      position = position || sanitizeField(text.slice(commaIdx + 1));
    } else {
      name = sanitizeField(text);
    }
  }

  if (!name) return null;
  return {
    name,
    ...(position ? { position } : {}),
  };
}

function extractOfficerFromAnchor(anchor) {
  const name = sanitizeField(anchor.textContent);
  if (!name) return null;

  const container =
    anchor.closest("li, tr, .officer, [class*='officer'], td, .person, .item") ||
    anchor.parentElement;

  let position;
  const positionEl =
    container?.querySelector?.(
      ".position, .officer-position, .role, em, small, span.officer-role, span[class*='position']",
    ) || (anchor.nextElementSibling && anchor.nextElementSibling !== container
      ? anchor.nextElementSibling
      : null);

  if (positionEl && positionEl !== anchor) {
    position = sanitizeField(positionEl.textContent);
  }

  if (!position && container) {
    const fullText = cleanText(container.textContent || "");
    const nameIdx = fullText.indexOf(name);
    if (nameIdx >= 0) {
      const remainder = cleanText(
        fullText.slice(nameIdx + name.length).replace(/^[\s,;:–\-]+/, ""),
      );
      if (remainder && remainder.length <= 50) {
        position = sanitizeField(remainder);
      }
    }
  }

  return {
    name,
    ...(position ? { position } : {}),
  };
}

function mergeUniqueOfficers(...groups) {
  const merged = [];
  const seen = new Set();

  groups.flat().forEach((officer) => {
    if (!officer?.name) return;
    const key = `${officer.name}|${officer.position || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(officer);
  });

  return merged;
}

function extractOfficersFromOfficerLinks() {
  const officers = [];
  const seen = new Set();

  document.querySelectorAll("a[href*='/officers/']").forEach((anchor) => {
    const officer = extractOfficerFromAnchor(anchor);
    if (!officer) return;
    const key = `${officer.name}|${officer.position || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    officers.push(officer);
  });

  return officers;
}

function extractOfficersFromListNodes(nodes) {
  const officers = [];
  const seen = new Set();

  nodes.forEach((node) => {
    node.querySelectorAll("ul li, ol li, .officer, [class*='officer']").forEach((li) => {
      const officer = parseOfficerListItem(li);
      if (!officer || seen.has(`${officer.name}|${officer.position || ""}`)) return;
      seen.add(`${officer.name}|${officer.position || ""}`);
      officers.push(officer);
    });
  });

  return officers;
}

function extractOfficersFromTables() {
  const officers = [];
  const seen = new Set();

  document.querySelectorAll("table").forEach((table) => {
    const headers = Array.from(table.querySelectorAll("th")).map((th) =>
      cleanText(th.textContent).toLowerCase(),
    );
    const nameIdx = headers.findIndex((h) => h.includes("name") || h.includes("officer"));
    const posIdx = headers.findIndex((h) => h.includes("position") || h.includes("role"));
    if (nameIdx < 0) return;

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const name = sanitizeField(cells[nameIdx]?.textContent);
      if (!name || seen.has(name)) return;
      seen.add(name);
      officers.push({
        name,
        position:
          posIdx >= 0 ? sanitizeField(cells[posIdx]?.textContent) || undefined : undefined,
      });
    });
  });

  return officers;
}

function extractOfficersByHeading() {
  const active = [];
  const inactive = [];
  const directors = [];
  const activeSeen = new Set();
  const inactiveSeen = new Set();
  const directorSeen = new Set();

  document.querySelectorAll("h1, h2, h3, h4, .section-heading, .heading").forEach((heading) => {
    const title = cleanText(heading.textContent).toLowerCase();
    const isDirectorSection =
      title.includes("director") ||
      (title.includes("officer") && !title.includes("inactive"));
    if (!isDirectorSection) return;

    const isInactive = title.includes("inactive");
    const nodes = [heading.parentElement, ...sectionNodesAfterHeading(heading)].filter(Boolean);
    const officers = extractOfficersFromListNodes(nodes);

    officers.forEach((officer) => {
      const key = `${officer.name}|${officer.position || ""}`;
      if (isInactive) {
        if (inactiveSeen.has(key)) return;
        inactiveSeen.add(key);
        inactive.push({ ...officer, status: "inactive" });
      } else {
        if (activeSeen.has(key)) return;
        activeSeen.add(key);
        active.push({ ...officer, status: "active" });
        if (!directorSeen.has(key)) {
          directorSeen.add(key);
          directors.push({ ...officer, status: "active" });
        }
      }
    });
  });

  return { active, inactive, directors };
}

function extractIdentifiers() {
  const identifiers = [];
  const seen = new Set();

  document.querySelectorAll("table").forEach((table) => {
    const headers = Array.from(table.querySelectorAll("th")).map((th) =>
      cleanText(th.textContent).toLowerCase(),
    );
    const systemIdx = headers.findIndex(
      (h) => h.includes("identifier system") || h === "system" || h.includes("system"),
    );
    const valueIdx = headers.findIndex(
      (h) => h === "identifier" || (h.includes("identifier") && !h.includes("system")),
    );
    const categoryIdx = headers.findIndex((h) => h.includes("categor"));
    if (systemIdx < 0 || valueIdx < 0) return;

    table.querySelectorAll("tbody tr").forEach((row) => {
      const cells = row.querySelectorAll("td");
      const system = sanitizeField(cells[systemIdx]?.textContent);
      const value = sanitizeField(cells[valueIdx]?.textContent);
      const category =
        categoryIdx >= 0 ? sanitizeField(cells[categoryIdx]?.textContent) : undefined;
      if (!system || !value) return;
      const key = `${system}|${value}`;
      if (seen.has(key)) return;
      seen.add(key);
      identifiers.push({
        system,
        value,
        ...(category ? { category } : {}),
      });
    });
  });

  return identifiers;
}

function extractAddresses(fields) {
  const addresses = [];
  const seen = new Set();

  const candidates = [
    ["Registered address", pickField(fields, ["registered address", "registered office address"])],
    ["Head office", pickField(fields, ["head office address", "head office"])],
    ["Mailing address", pickField(fields, ["mailing address"])],
    ["Agent address", pickField(fields, ["agent address", "registered agent address"])],
  ];

  candidates.forEach(([label, address]) => {
    if (!address || seen.has(address)) return;
    seen.add(address);
    addresses.push({ label, address });
  });

  document.querySelectorAll("h2, h3, h4").forEach((heading) => {
    const title = cleanText(heading.textContent).toLowerCase();
    if (!title.includes("address")) return;
    sectionNodesAfterHeading(heading).forEach((node) => {
      node.querySelectorAll("dl").forEach((dl) => {
        dl.querySelectorAll("dt").forEach((dt) => {
          const dd = dt.nextElementSibling;
          if (!dd || dd.tagName !== "DD") return;
          const label = cleanText(dt.textContent);
          const address = sanitizeField(dd.textContent);
          if (!label || !address || seen.has(address)) return;
          seen.add(address);
          addresses.push({ label, address });
        });
      });
    });
  });

  return addresses;
}

function extractCompanyFromDetailPage() {
  const path = parseCompanyPath(window.location.pathname);
  if (!path) return null;

  const fields = parseDefinitionList();
  const h1 = document.querySelector("h1");
  const name =
    sanitizeField(h1?.textContent) ||
    sanitizeField(document.querySelector(".company_name")?.textContent) ||
    sanitizeField(document.title.replace(/\s+\|\s+OpenCorporates.*$/i, ""));

  const { active: headingOfficers, inactive: inactiveOfficers, directors: headingDirectors } =
    extractOfficersByHeading();
  const tableOfficers = extractOfficersFromTables();
  const linkOfficers = extractOfficersFromOfficerLinks();
  const officers = mergeUniqueOfficers(headingOfficers, tableOfficers, linkOfficers);
  const directors = mergeUniqueOfficers(
    headingDirectors,
    linkOfficers.length > 0 ? linkOfficers : [],
  );
  const identifiers = extractIdentifiers();
  const addresses = extractAddresses(fields);

  const agentName = pickField(fields, ["agent name", "registered agent name", "registered agent"]);
  const agentAddress = pickField(fields, ["agent address", "registered agent address"]);
  const headOfficeAddress = pickField(fields, ["head office address", "head office"]);
  const mailingAddress = pickField(fields, ["mailing address"]);
  const registeredAddress =
    pickField(fields, ["registered address", "registered office address", "address"]) ||
    headOfficeAddress ||
    mailingAddress;

  return {
    name,
    companyNumber: path.companyNumber,
    jurisdictionCode: path.jurisdictionCode || pickField(fields, ["jurisdiction"]),
    currentStatus: pickField(fields, ["company status", "status", "current status"]),
    incorporationDate: pickField(fields, ["incorporation date", "formation date", "incorporation"]),
    companyType: pickField(fields, ["company type", "type"]),
    agentName,
    agentAddress,
    headOfficeAddress,
    mailingAddress,
    registeredAddress,
    addresses: addresses.length > 0 ? addresses : undefined,
    opencorporatesUrl: window.location.href.split("?")[0],
    registryUrl:
      document.querySelector('a[href*="companieshouse"], a[href*="sos."], a[href*="sunbiz"]')
        ?.href || undefined,
    officers: officers.length > 0 ? officers : undefined,
    directors: directors.length > 0 ? directors : undefined,
    inactiveOfficers: inactiveOfficers.length > 0 ? inactiveOfficers : undefined,
    identifiers: identifiers.length > 0 ? identifiers : undefined,
    dataSource: pickField(fields, ["source", "data source"]),
    lastUpdateFromSource: pickField(fields, ["last update from source"]),
    lastChangeRecorded: pickField(fields, ["last change recorded"]),
    nextUpdateFromSource: pickField(fields, ["next update from source"]),
  };
}

function extractOfficersFromSearchContainer(container) {
  const officers = [];
  const seen = new Set();

  container?.querySelectorAll?.(".officer, [class*='officer'], [class*='director']")?.forEach((node) => {
    const officer = parseOfficerListItem(node);
    if (!officer) return;
    const key = `${officer.name}|${officer.position || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    officers.push(officer);
  });

  const text = cleanText(container?.textContent || "");
  const directorPattern =
    /([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s*[,–-]\s*(Director|Officer|Agent|President|CEO|Managing Member|Secretary|Member)/gi;
  let match = directorPattern.exec(text);
  while (match) {
    const name = sanitizeField(match[1]);
    const position = sanitizeField(match[2]);
    if (name) {
      const key = `${name}|${position || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        officers.push({ name, ...(position ? { position } : {}) });
      }
    }
    match = directorPattern.exec(text);
  }

  return officers;
}

function extractCompaniesFromSearchPage() {
  const companies = [];
  const seen = new Set();

  document.querySelectorAll('a[href*="/companies/"]').forEach((anchor) => {
    const href = anchor.href || "";
    const path = parseCompanyPath(new URL(href, window.location.origin).pathname);
    if (!path) return;

    const key = `${path.jurisdictionCode}/${path.companyNumber}`;
    if (seen.has(key)) return;
    seen.add(key);

    const container =
      anchor.closest("li") ||
      anchor.closest("tr") ||
      anchor.closest(".search-result") ||
      anchor.parentElement;
    const containerText = cleanText(container?.textContent || "");
    const name = sanitizeField(anchor.textContent) || sanitizeField(containerText.split("|")[0]);

    let currentStatus;
    const statusMatch = containerText.match(
      /\b(active|inactive|dissolved|live|good standing|administratively dissolved|struck off)\b/i,
    );
    if (statusMatch) currentStatus = statusMatch[1];

    const officers = extractOfficersFromSearchContainer(container);
    const directors = officers.filter((officer) =>
      /director|officer|agent|president|ceo|secretary|member/i.test(officer.position || ""),
    );

    companies.push({
      name,
      companyNumber: path.companyNumber,
      jurisdictionCode: path.jurisdictionCode,
      currentStatus,
      opencorporatesUrl: href.split("?")[0],
      officers: officers.length > 0 ? officers : undefined,
      directors: directors.length > 0 ? directors : undefined,
    });
  });

  return companies;
}

function extractPageCompanies() {
  const detail = extractCompanyFromDetailPage();
  if (detail && detail.name) return [detail];
  return extractCompaniesFromSearchPage();
}

function buildImportPayload(companies) {
  const context = readBridgeContext();
  return {
    payload: {
      type: IMPORT_MESSAGE_TYPE,
      applicationId: context.applicationId,
      sourceUrl: window.location.href,
      searchedAt: new Date().toISOString(),
      companies,
    },
    context,
    targetOrigin: context.targetOrigin,
    applicationId: context.applicationId,
  };
}

function copyPayloadToClipboard(payload) {
  const text = JSON.stringify(payload, null, 2);
  return navigator.clipboard.writeText(text);
}

function sendToOpener(companies) {
  const { payload, context } = buildImportPayload(companies);
  const bridge = getBridge();
  const bridgeResult = bridge?.sendPayloadToCrm(payload, "opencorporates");
  if (bridgeResult?.mode === "opener") {
    return {
      mode: "opener",
      applicationId: bridgeResult.applicationId || context.applicationId,
      count: companies.length,
    };
  }

  void copyPayloadToClipboard({ companies: payload.companies });
  return { mode: "clipboard", applicationId: context.applicationId, count: companies.length };
}

window.CrmOpenCorporatesExtract = {
  IMPORT_MESSAGE_TYPE,
  extractPageCompanies,
  sendToOpener,
  buildImportPayload,
  copyPayloadToClipboard,
};
})();
