import type { NyscefCaseHit, NyscefLookupData } from "./nyscefTypes";
import type { OpenCorporatesCompanyHit, OpenCorporatesLookupData } from "./opencorporatesTypes";

export const STRUCTURED_NOTES_ATTR = "data-crm-bg-notes";

function formatSearchedAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isStructuredBackgroundCheckNotes(notes: string): boolean {
  return notes.trim().includes(STRUCTURED_NOTES_ATTR);
}

export function stripStructuredNotesHtml(html: string): string {
  if (!html.trim()) return "";
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function detailRow(label: string, value: string | undefined): string {
  if (!value?.trim()) return "";
  return `<div class="crm-bg-notes__row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function listSection(title: string, items: string[]): string {
  if (!items.length) return "";
  const rows = items.map((item) => `<li>${esc(item)}</li>`).join("");
  return `<div class="crm-bg-notes__section"><p class="crm-bg-notes__section-title">${esc(title)}</p><ul class="crm-bg-notes__list">${rows}</ul></div>`;
}

function buildOpenCorporatesCompanyHtml(
  company: OpenCorporatesCompanyHit,
  searchedAt?: string,
): string {
  const chips = [
    company.currentStatus
      ? `<span class="crm-bg-notes__chip crm-bg-notes__chip--status">${esc(company.currentStatus)}</span>`
      : "",
    company.jurisdictionCode || company.companyNumber
      ? `<span class="crm-bg-notes__chip">${esc([company.jurisdictionCode, company.companyNumber].filter(Boolean).join(" · "))}</span>`
      : "",
    company.companyType
      ? `<span class="crm-bg-notes__chip">${esc(company.companyType)}</span>`
      : "",
  ].filter(Boolean);

  const details = [
    detailRow("Incorporated", company.incorporationDate),
    detailRow("Registered agent", company.agentName),
    detailRow("Agent address", company.agentAddress),
    detailRow("Head office", company.headOfficeAddress),
    detailRow("Mailing", company.mailingAddress),
    detailRow(
      "Registered address",
      company.registeredAddress &&
        company.registeredAddress !== company.headOfficeAddress &&
        company.registeredAddress !== company.mailingAddress
        ? company.registeredAddress
        : undefined,
    ),
    ...(company.addresses ?? []).map((entry) => detailRow(entry.label, entry.address)),
    detailRow("Registry", company.registryUrl),
  ].filter(Boolean);

  const officers = (company.officers ?? []).map((o) =>
    o.position ? `${o.name} (${o.position})` : o.name,
  );
  const directors = (company.directors ?? []).map((o) =>
    o.position ? `${o.name} (${o.position})` : o.name,
  );
  const inactive = (company.inactiveOfficers ?? []).map((o) =>
    o.position ? `${o.name} (${o.position})` : o.name,
  );
  const identifiers = (company.identifiers ?? []).map((id) =>
    id.category ? `${id.system}: ${id.value} (${id.category})` : `${id.system}: ${id.value}`,
  );

  const meta = [
    company.dataSource ? `Source: ${company.dataSource}` : "",
    company.lastUpdateFromSource ? `Updated: ${company.lastUpdateFromSource}` : "",
    company.lastChangeRecorded ? `Last change: ${company.lastChangeRecorded}` : "",
  ].filter(Boolean);

  const searchedLabel = searchedAt ? formatSearchedAt(searchedAt) : "";

  return `<article class="crm-bg-notes__entity">
    <h3 class="crm-bg-notes__title">${esc(company.name)}</h3>
    ${chips.length ? `<div class="crm-bg-notes__chips">${chips.join("")}</div>` : ""}
    ${details.length ? `<dl class="crm-bg-notes__details">${details.join("")}</dl>` : ""}
    ${listSection("Identifiers", identifiers)}
    ${listSection("Directors", directors)}
    ${listSection("Officers", officers)}
    ${listSection("Inactive officers", inactive)}
    ${meta.length ? `<p class="crm-bg-notes__meta-line">${esc(meta.join(" · "))}</p>` : ""}
    <a class="crm-bg-notes__link" href="${esc(company.opencorporatesUrl)}" target="_blank" rel="noopener noreferrer">View on OpenCorporates</a>
    ${searchedLabel ? `<p class="crm-bg-notes__entity-meta">Imported ${esc(searchedLabel)}</p>` : ""}
  </article>`;
}

export function buildOpenCorporatesNotesHtml(
  lookup: OpenCorporatesLookupData,
  searchedAt?: string,
): string {
  const searchedLabel = searchedAt ? formatSearchedAt(searchedAt) : "";

  if (!lookup.companies.length) {
    return `<div ${STRUCTURED_NOTES_ATTR}="opencorporates" class="crm-bg-notes">
      <div class="crm-bg-notes__toolbar">
        <span class="crm-bg-notes__source crm-bg-notes__source--oc">OpenCorporates</span>
        ${searchedLabel ? `<span class="crm-bg-notes__searched">${esc(searchedLabel)}</span>` : ""}
      </div>
      <p class="crm-bg-notes__empty">No companies found for &quot;${esc(lookup.searchQuery)}&quot;.</p>
    </div>`;
  }

  const entities = lookup.companies
    .map((company) => buildOpenCorporatesCompanyHtml(company, searchedAt))
    .join("");

  return `<div ${STRUCTURED_NOTES_ATTR}="opencorporates" class="crm-bg-notes">
    <div class="crm-bg-notes__toolbar">
      <span class="crm-bg-notes__source crm-bg-notes__source--oc">OpenCorporates</span>
      <span class="crm-bg-notes__summary">${lookup.companies.length} compan${lookup.companies.length === 1 ? "y" : "ies"} · ${esc(lookup.searchQuery)}</span>
      ${searchedLabel ? `<span class="crm-bg-notes__searched">${esc(searchedLabel)}</span>` : ""}
    </div>
    <div class="crm-bg-notes__stack">${entities}</div>
  </div>`;
}

function buildNyscefCaseHtml(item: NyscefCaseHit, index: number): string {
  const chips = [
    item.indexNumber
      ? `<span class="crm-bg-notes__chip">${esc(item.indexNumber)}</span>`
      : "",
    item.filingDate ? `<span class="crm-bg-notes__chip">${esc(item.filingDate)}</span>` : "",
    item.status ? `<span class="crm-bg-notes__chip crm-bg-notes__chip--status">${esc(item.status)}</span>` : "",
  ].filter(Boolean);

  const details = [
    detailRow("Court", item.court),
    detailRow("Case type", item.caseType),
  ].filter(Boolean);

  return `<article class="crm-bg-notes__case">
    <div class="crm-bg-notes__case-head">
      <span class="crm-bg-notes__case-index">${index + 1}</span>
      <h3 class="crm-bg-notes__case-title">${esc(item.caseName || "Unnamed case")}</h3>
    </div>
    ${chips.length ? `<div class="crm-bg-notes__chips">${chips.join("")}</div>` : ""}
    ${details.length ? `<dl class="crm-bg-notes__details">${details.join("")}</dl>` : ""}
    ${
      item.detailUrl
        ? `<a class="crm-bg-notes__link" href="${esc(item.detailUrl)}" target="_blank" rel="noopener noreferrer">View case documents</a>`
        : ""
    }
  </article>`;
}

export function buildNyscefNotesHtml(lookup: NyscefLookupData, searchedAt?: string): string {
  const modeLabel = lookup.searchMode === "owner" ? "Owner search" : "Business search";
  const searchedLabel = searchedAt ? formatSearchedAt(searchedAt) : "";

  if (!lookup.cases.length) {
    return `<div ${STRUCTURED_NOTES_ATTR}="nyscef" class="crm-bg-notes">
      <div class="crm-bg-notes__toolbar">
        <span class="crm-bg-notes__source crm-bg-notes__source--court">NY Court</span>
        <span class="crm-bg-notes__summary">${esc(modeLabel)} · ${esc(lookup.searchQuery)}</span>
        ${searchedLabel ? `<span class="crm-bg-notes__searched">${esc(searchedLabel)}</span>` : ""}
      </div>
      <p class="crm-bg-notes__empty">No cases found.</p>
    </div>`;
  }

  const cases = lookup.cases
    .map((item, index) => buildNyscefCaseHtml(item, index))
    .join("");

  return `<div ${STRUCTURED_NOTES_ATTR}="nyscef" class="crm-bg-notes">
    <div class="crm-bg-notes__toolbar">
      <span class="crm-bg-notes__source crm-bg-notes__source--court">NY Court</span>
      <span class="crm-bg-notes__summary">${lookup.cases.length} case${lookup.cases.length === 1 ? "" : "s"} · ${esc(modeLabel)} · ${esc(lookup.searchQuery)}</span>
      ${searchedLabel ? `<span class="crm-bg-notes__searched">${esc(searchedLabel)}</span>` : ""}
    </div>
    <div class="crm-bg-notes__stack">${cases}</div>
  </div>`;
}
