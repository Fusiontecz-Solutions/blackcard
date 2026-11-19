import type { OpenCorporatesCompanyHit, OpenCorporatesOfficer } from "./opencorporatesTypes";

export type ComparisonStatus = "match" | "mismatch" | "neutral";
export type OpenCorporatesSyncFieldKey =
  | "businessName"
  | "businessEntityType"
  | "incorporationDate"
  | "incorporationState"
  | "address1"
  | "city"
  | "state"
  | "zipCode";

export type ApplicationBusinessSnapshot = {
  businessName: string;
  businessEntityType: string;
  incorporationDate: string;
  incorporationState: string;
  address1: string;
  city: string;
  state: string;
  zipCode: string;
  ownerNames: string[];
};

export type ComparisonRow = {
  key: string;
  label: string;
  applicationValue: string;
  openCorporatesValue: string;
  status: ComparisonStatus;
  syncField?: OpenCorporatesSyncFieldKey;
};

type ParsedUsAddress = {
  address1: string;
  city: string;
  state: string;
  zipCode: string;
};

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI",
  wyoming: "WY", "district of columbia": "DC",
};

const ENTITY_ALIASES: Record<string, string> = {
  llc: "llc",
  "l l c": "llc",
  "limited liability company": "llc",
  "limited liability co": "llc",
  "foreign limited liability company": "llc",
  "domestic limited liability company": "llc",
  inc: "inc",
  incorporated: "inc",
  corporation: "inc",
  corp: "inc",
  "c corporation": "inc",
  "c corp": "inc",
  "s corporation": "inc",
  "s corp": "inc",
  "professional corporation": "inc",
  pc: "inc",
  llp: "llp",
  "l l p": "llp",
  "limited liability partnership": "llp",
  lp: "lp",
  "l p": "lp",
  "limited partnership": "lp",
  "sole proprietorship": "sole",
  "general partnership": "gp",
};

export function normalizeComparableText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonName(value: unknown): string {
  return normalizeComparableText(value)
    .replace(/\b(jr|sr|ii|iii|iv|md|esq)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStateCode(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const jurisdiction = raw.match(/^us[_-]?([a-z]{2})$/i);
  if (jurisdiction) return jurisdiction[1].toUpperCase();
  if (/^[a-z]{2}$/i.test(raw)) return raw.toUpperCase();
  return US_STATE_NAME_TO_CODE[normalizeComparableText(raw)] ?? "";
}

export function normalizeIncorporationDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeEntityType(value: unknown): string {
  const normalized = normalizeComparableText(value);
  if (!normalized) return "";
  if (ENTITY_ALIASES[normalized]) return ENTITY_ALIASES[normalized];
  for (const [alias, canonical] of Object.entries(ENTITY_ALIASES)) {
    if (normalized.includes(alias)) return canonical;
  }
  return normalized;
}

function compareNormalized(left: string, right: string): ComparisonStatus {
  if (!left || !right) return "neutral";
  return left === right ? "match" : "mismatch";
}

export function parseUsAddressBlob(raw: unknown): ParsedUsAddress | null {
  const text = String(raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/\bUSA\b\.?/gi, "")
    .replace(/\bUnited States\b\.?/gi, "")
    .trim()
    .replace(/[,\s]+$/g, "");
  if (!text) return null;

  const zipMatch = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!zipMatch || zipMatch.index == null) return null;
  const beforeZip = text.slice(0, zipMatch.index).replace(/[,\s]+$/g, "").trim();
  const parts = beforeZip.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;

  let state = normalizeStateCode(parts[parts.length - 1]);
  let city = "";
  let streetParts = parts.slice(0, -1);
  if (!state && parts.length >= 3) {
    state = normalizeStateCode(parts[parts.length - 2]);
    if (state) {
      city = parts[parts.length - 1];
      streetParts = parts.slice(0, -2);
    }
  } else if (state) {
    city = streetParts[streetParts.length - 1] ?? "";
    streetParts = streetParts.slice(0, -1);
  }

  const address1 = streetParts.join(", ").trim();
  if (!address1 || !city || !state) return null;
  return { address1, city, state, zipCode: zipMatch[1] };
}

export function pickOpenCorporatesAddressBlob(company: OpenCorporatesCompanyHit): string {
  const labeled =
    company.addresses?.find((entry) =>
      /registered|principal|head office|business/i.test(entry.label),
    )?.address ?? company.addresses?.[0]?.address;
  return String(
    labeled ||
      company.registeredAddress ||
      company.headOfficeAddress ||
      company.mailingAddress ||
      "",
  ).trim();
}

export function extractApplicationBusinessSnapshot(
  applicationData: Record<string, unknown> | null | undefined,
): ApplicationBusinessSnapshot {
  const client = applicationData?.client as Record<string, unknown> | undefined;
  const business = client?.business as Record<string, unknown> | undefined;
  const address = business?.address as Record<string, unknown> | undefined;
  const owners = Array.isArray(client?.owners)
    ? (client.owners as Record<string, unknown>[])
    : [];
  const primaryOwner = client?.owner as Record<string, unknown> | undefined;
  const ownerRows = [...owners, ...(primaryOwner ? [primaryOwner] : [])];
  const ownerNames = ownerRows
    .map((owner) =>
      [owner.firstName, owner.middleName, owner.lastName].filter(Boolean).join(" ").trim(),
    )
    .filter(Boolean);

  return {
    businessName: String(business?.name ?? client?.businessName ?? "").trim(),
    businessEntityType: String(
      business?.businessEntityType ?? client?.businessEntityType ?? "",
    ).trim(),
    incorporationDate: String(
      business?.incorporationDate ?? client?.businessIncorporationDate ?? "",
    ).trim(),
    incorporationState: String(
      business?.incorporationState ?? client?.businessIncorporationState ?? "",
    ).trim(),
    address1: String(address?.address1 ?? client?.businessAddress1 ?? "").trim(),
    city: String(address?.city ?? client?.businessCity ?? "").trim(),
    state: String(address?.state ?? client?.businessState ?? "").trim(),
    zipCode: String(address?.zipCode ?? client?.businessZipCode ?? "").trim(),
    ownerNames: Array.from(new Set(ownerNames)),
  };
}

const display = (value: string): string => value.trim() || "—";

function collectCompanyPeople(company: OpenCorporatesCompanyHit): OpenCorporatesOfficer[] {
  const people = [...(company.directors ?? []), ...(company.officers ?? [])];
  const seen = new Set<string>();
  return people.filter((person) => {
    const key = normalizePersonName(person.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildOpenCorporatesComparisonRows(
  company: OpenCorporatesCompanyHit,
  application: ApplicationBusinessSnapshot,
): ComparisonRow[] {
  const addressBlob = pickOpenCorporatesAddressBlob(company);
  const parsedAddress = parseUsAddressBlob(addressBlob);
  const ocState = normalizeStateCode(company.jurisdictionCode);
  const people = collectCompanyPeople(company);
  const ownerNorms = application.ownerNames.map(normalizePersonName).filter(Boolean);
  const officerNames = people.map((person) => person.name.trim()).filter(Boolean);
  let officerStatus: ComparisonStatus = "neutral";
  if (officerNames.length > 0 && ownerNorms.length > 0) {
    officerStatus = people.some((person) =>
      ownerNorms.includes(normalizePersonName(person.name)),
    )
      ? "match"
      : "mismatch";
  }

  const applicationAddress = [
    application.address1,
    application.city,
    [application.state, application.zipCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  const ocAddress = parsedAddress
    ? `${parsedAddress.address1}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.zipCode}`
    : addressBlob;

  return [
    {
      key: "businessName",
      label: "Legal name",
      applicationValue: display(application.businessName),
      openCorporatesValue: display(company.name),
      status: compareNormalized(
        normalizeComparableText(application.businessName),
        normalizeComparableText(company.name),
      ),
      syncField: "businessName",
    },
    {
      key: "businessEntityType",
      label: "Entity type",
      applicationValue: display(application.businessEntityType),
      openCorporatesValue: display(company.companyType ?? ""),
      status: compareNormalized(
        normalizeEntityType(application.businessEntityType),
        normalizeEntityType(company.companyType),
      ),
      syncField: "businessEntityType",
    },
    {
      key: "incorporationDate",
      label: "Incorporation date",
      applicationValue: display(
        normalizeIncorporationDate(application.incorporationDate) || application.incorporationDate,
      ),
      openCorporatesValue: display(
        normalizeIncorporationDate(company.incorporationDate) || company.incorporationDate || "",
      ),
      status: compareNormalized(
        normalizeIncorporationDate(application.incorporationDate),
        normalizeIncorporationDate(company.incorporationDate),
      ),
      syncField: "incorporationDate",
    },
    {
      key: "incorporationState",
      label: "Incorporation state",
      applicationValue: display(
        normalizeStateCode(application.incorporationState) || application.incorporationState,
      ),
      openCorporatesValue: display(ocState || company.jurisdictionCode),
      status: compareNormalized(
        normalizeStateCode(application.incorporationState),
        ocState,
      ),
      syncField: "incorporationState",
    },
    {
      key: "address",
      label: "Registered address",
      applicationValue: display(applicationAddress),
      openCorporatesValue: display(ocAddress),
      status: parsedAddress
        ? compareNormalized(
            normalizeComparableText(
              `${application.address1} ${application.city} ${normalizeStateCode(application.state)} ${application.zipCode}`,
            ),
            normalizeComparableText(
              `${parsedAddress.address1} ${parsedAddress.city} ${parsedAddress.state} ${parsedAddress.zipCode}`,
            ),
          )
        : "neutral",
      syncField: parsedAddress ? "address1" : undefined,
    },
    {
      key: "officers",
      label: "Officers / owners",
      applicationValue: application.ownerNames.length ? application.ownerNames.join("; ") : "—",
      openCorporatesValue: officerNames.length
        ? officerNames.map((name, index) => {
            const position = people[index]?.position;
            return position ? `${name} (${position})` : name;
          }).join("; ")
        : "—",
      status: officerStatus,
    },
  ];
}

function hasDisplayValue(value: string): boolean {
  const trimmed = value.trim();
  return Boolean(trimmed) && trimmed !== "—";
}

export function canSyncComparisonRow(row: ComparisonRow): boolean {
  if (!row.syncField || !hasDisplayValue(row.openCorporatesValue) || row.status === "match") {
    return false;
  }
  return row.status === "mismatch" ||
    (row.status === "neutral" && !hasDisplayValue(row.applicationValue));
}

export function syncFieldsForComparisonRow(
  row: ComparisonRow,
): OpenCorporatesSyncFieldKey[] {
  if (!canSyncComparisonRow(row) || !row.syncField) return [];
  return row.syncField === "address1"
    ? ["address1", "city", "state", "zipCode"]
    : [row.syncField];
}

export function syncFieldsFromComparisonRows(
  rows: ComparisonRow[],
): OpenCorporatesSyncFieldKey[] {
  return Array.from(new Set(rows.flatMap(syncFieldsForComparisonRow)));
}

export function buildSyncConfirmationLines(rows: ComparisonRow[]): string[] {
  return rows
    .filter(canSyncComparisonRow)
    .map(
      (row) =>
        `${row.label}: "${row.applicationValue}" → "${row.openCorporatesValue}"`,
    );
}
