import type { Application } from "@/types/applicationTypes";
import { resolveApplicationDisplayLoanAmount } from "@/lib/applicationLoanAmount";
import { isoDomainLabelFromEmail } from "@/lib/isoDisplayLabel";

/** Default page size for server-paginated application list tables. */
export const APPLICATIONS_LIST_PAGE_SIZE = 10;

/**
 * Legacy bulk fetch cap — only for specialized flows (e.g. payment funded cohort).
 * List screens should use server pagination with {@link APPLICATIONS_LIST_PAGE_SIZE}.
 */
export const APPLICATIONS_TABLE_CLIENT_FETCH_LIMIT = 2000;

/** Single lowercase string of searchable fields for substring matching. */
export function buildApplicationSearchHaystack(app: Application): string {
  const parts: string[] = [];
  if (app.applicationId != null) parts.push(String(app.applicationId));
  if (app.dealId) parts.push(String(app.dealId));
  if (app.dealDisplayName) parts.push(String(app.dealDisplayName));
  const client = app.client;
  if (typeof client === "string") {
    parts.push(client);
  } else if (client && typeof client === "object") {
    parts.push(
      client.business?.name ?? "",
      client.business?.email ?? "",
    );
    const o = client.owner;
    if (o) {
      parts.push(o.firstName ?? "", o.lastName ?? "", o.email ?? "");
    }
    if (client.clientId != null) parts.push(String(client.clientId));
    if (client._id) parts.push(String(client._id));
  }
  const cb = app.createdBy;
  if (cb && typeof cb === "object") {
    parts.push(cb.firstName ?? "", cb.lastName ?? "", cb.email ?? "");
  }
  const ra = app.referringAgent;
  if (ra && typeof ra === "object") {
    parts.push(ra.firstName ?? "", ra.lastName ?? "", ra.email ?? "");
  }
  const iso = app.iso;
  if (iso && typeof iso === "object") {
    parts.push(iso.name ?? "", iso.email ?? "", iso.id ?? "", iso._id ?? "");
    const domain = isoDomainLabelFromEmail(iso.email);
    if (domain) parts.push(domain);
  }
  parts.push(
    app.currentQueue ?? "",
    app.queue ?? "",
    app.currentState ?? "",
    app.state ?? "",
    app.status ?? "",
    app.salesRepresentative ?? "",
  );
  const displayLoanAmount = resolveApplicationDisplayLoanAmount(app);
  if (displayLoanAmount != null) parts.push(String(displayLoanAmount));
  return parts.join(" ").toLowerCase();
}

export function filterApplicationsBySearchQuery<T extends Application>(
  items: T[] | undefined | null,
  query: string,
): T[] {
  const list = items ?? [];
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter((app) => buildApplicationSearchHaystack(app).includes(q));
}

export type PipelineDealSearchable = {
  merchant: string;
  owner: string;
  code: string;
  iso: string;
  amount: number;
};

export function filterPipelineDealsBySearch<T extends PipelineDealSearchable>(
  deals: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return deals;
  return deals.filter((d) => {
    const hay = `${d.merchant} ${d.owner} ${d.code} ${d.iso} ${d.amount}`.toLowerCase();
    return hay.includes(q);
  });
}
