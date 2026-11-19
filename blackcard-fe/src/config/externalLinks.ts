export type BackgroundCheckLinkContext = {
  businessName: string;
  ein: string;
};

export type BackgroundCheckResource = {
  id: string;
  title: string;
  description: string;
  href?: string | ((ctx: BackgroundCheckLinkContext) => string);
  isApi?: boolean;
  hasPanel?: boolean;
};

/**
 * Background Check cards — DataMerch first, external links in the middle, CLEAR last.
 */
export const BACKGROUND_CHECK_RESOURCES: BackgroundCheckResource[] = [
  {
    id: "datamerch",
    title: "DataMerch",
    description: "Industry default database",
    isApi: true,
  },
  {
    id: "opencorporates",
    title: "OpenCorporates",
    description: "Entity registration & status",
    hasPanel: true,
    href: ({ businessName }) =>
      businessName.trim()
        ? `https://opencorporates.com/companies?q=${encodeURIComponent(businessName.trim())}`
        : "https://opencorporates.com/",
  },
  {
    id: "sos",
    title: "Secretary of State",
    description: "State business registration",
    href: "https://www.quicksos.com/secretary-of-state-search",
  },
  {
    id: "nyscef",
    title: "NY Court",
    description: "Civil court case search",
    hasPanel: true,
    href: "https://iapps.courts.state.ny.us/nyscef/CaseSearch?TAB=name",
  },
  {
    id: "google",
    title: "Google Search",
    description: "Open-web reputation",
    href: ({ businessName, ein }) => {
      const query = [businessName.trim(), ein.trim()].filter(Boolean).join(" ");
      return query
        ? `https://www.google.com/search?q=${encodeURIComponent(query)}`
        : "https://www.google.com/";
    },
  },
  {
    id: "tlo",
    title: "Thomson Reuters CLEAR",
    description: "Identity and background screening",
  },
];

export function resolveBackgroundCheckHref(
  resource: BackgroundCheckResource,
  ctx: BackgroundCheckLinkContext,
): string | undefined {
  if (!resource.href) return undefined;
  return typeof resource.href === "function" ? resource.href(ctx) : resource.href;
}
