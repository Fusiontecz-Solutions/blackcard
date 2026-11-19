import {
  normalizeComparableText,
  normalizeIncorporationDate,
  normalizeStateCode,
  parseUsAddressBlob,
} from "./opencorporatesComparison";
import type { ClearBusinessHit, ClearPersonHit } from "./clearTypes";

export type ComparisonStatus = "match" | "mismatch" | "neutral";

export type ClearBusinessSyncFieldKey =
  | "businessName"
  | "businessEinNumber"
  | "address1"
  | "city"
  | "state"
  | "zipCode";

export type ClearPersonSyncFieldKey =
  | "firstName"
  | "middleName"
  | "lastName"
  | "dateOfBirth"
  | "ssn"
  | "address1"
  | "city"
  | "state"
  | "zipCode"
  | "email"
  | "mobileNumber";

export type ClearComparisonRow = {
  key: string;
  label: string;
  applicationValue: string;
  clearValue: string;
  status: ComparisonStatus;
  syncField?: ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey;
};

export type ApplicationBusinessSnapshot = {
  businessName: string;
  businessEinNumber: string;
  address1: string;
  city: string;
  state: string;
  zipCode: string;
};

export type ApplicationOwnerSnapshot = {
  ownerId?: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  ssn: string;
  email: string;
  mobileNumber: string;
  address1: string;
  city: string;
  state: string;
  zipCode: string;
};

function formatDisplay(value: string): string {
  return value.trim() || "—";
}

function hasDisplayValue(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  return Boolean(trimmed) && trimmed !== "—";
}

function digitsOnly(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** True when CLEAR returned a position-preserving mask (X/*) or truncated last-4. */
function isPartialOrMaskedId(value: string | null | undefined): boolean {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return false;
  if (/[X*]/.test(raw)) return true;
  const digits = digitsOnly(raw);
  return digits.length > 0 && digits.length < 9;
}

/**
 * CLEAR often returns SSN/FEIN as 589-30-XXXX or XX-XXX6789. When the mask is
 * compatible with the application's full 9-digit id, show the complete app value.
 */
export function revealClearIdForDisplay(
  clearValue: string | null | undefined,
  appValue: string | null | undefined,
): string {
  const clearRaw = String(clearValue ?? "").trim();
  const appDigits = digitsOnly(appValue);
  if (!clearRaw) {
    return appDigits.length === 9 ? appDigits : "";
  }
  if (!isPartialOrMaskedId(clearRaw)) {
    return clearRaw;
  }
  if (appDigits.length !== 9) {
    return clearRaw;
  }
  if (!clearIdCompatibleWithApp(clearRaw, appDigits)) {
    return clearRaw;
  }
  return appDigits;
}

function clearIdCompatibleWithApp(clearValue: string, appDigits: string): boolean {
  if (appDigits.length !== 9) return false;
  const clearDigits = digitsOnly(clearValue);
  if (clearDigits.length === 9) return clearDigits === appDigits;
  if (clearDigits.length === 4) return appDigits.slice(-4) === clearDigits;

  const mask = String(clearValue).toUpperCase().replace(/[^0-9X*]/g, "");
  if (mask.length !== 9) {
    // e.g. "589-30-XXXX" → after keeping digits+X: "58930XXXX" length 9
    return false;
  }
  for (let i = 0; i < 9; i += 1) {
    const ch = mask[i];
    if (ch === "X" || ch === "*") continue;
    if (!/\d/.test(ch)) continue;
    if (ch !== appDigits[i]) return false;
  }
  return true;
}

function formatSsnDisplay(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length === 9) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  return formatDisplay(value);
}

function formatEinDisplay(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  }
  return formatDisplay(value);
}

function compareText(appValue: string, clearValue: string): ComparisonStatus {
  const app = normalizeComparableText(appValue);
  const clear = normalizeComparableText(clearValue);
  if (!app && !clear) return "neutral";
  if (!app || !clear) return "neutral";
  return app === clear ? "match" : "mismatch";
}

function compareDate(appValue: string, clearValue: string): ComparisonStatus {
  const app = normalizeIncorporationDate(appValue);
  const clear = normalizeIncorporationDate(clearValue);
  if (!app && !clear) return "neutral";
  if (!app || !clear) return "neutral";
  return app === clear ? "match" : "mismatch";
}

function compareDigits(appValue: string, clearValue: string): ComparisonStatus {
  const app = digitsOnly(appValue);
  const clearRaw = String(clearValue ?? "").trim();
  const clear = digitsOnly(clearValue);
  if (!app && !clear && !clearRaw) return "neutral";
  if (!app || (!clear && !clearRaw)) return "neutral";

  // Masked / partial CLEAR ids that align with a full app id count as a match.
  if (app.length === 9 && clearRaw && clearIdCompatibleWithApp(clearRaw, app)) {
    return "match";
  }
  if (app.length === 9 && clear.length === 4) {
    return app.slice(-4) === clear ? "match" : "mismatch";
  }
  if (clear.length === 9 && app.length === 4) {
    return clear.slice(-4) === app ? "match" : "mismatch";
  }
  if (!clear) return "neutral";
  return app === clear ? "match" : "mismatch";
}

function resolveHitAddress(hit: {
  address1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  addressBlob?: string;
}) {
  if (hit.address1 && hit.city && hit.state && hit.zipCode) {
    return {
      address1: hit.address1,
      city: hit.city,
      state: normalizeStateCode(hit.state) || hit.state,
      zipCode: hit.zipCode,
    };
  }
  return parseUsAddressBlob(hit.addressBlob || "");
}

export function extractApplicationBusinessSnapshotForClear(
  applicationData: Record<string, unknown> | null | undefined,
): ApplicationBusinessSnapshot {
  const client = applicationData?.client as Record<string, unknown> | undefined;
  const business = client?.business as Record<string, unknown> | undefined;
  const address = business?.address as Record<string, unknown> | undefined;

  return {
    businessName: String(business?.name ?? client?.businessName ?? "").trim(),
    businessEinNumber: String(
      business?.einNumber ??
        business?.businessEinNumber ??
        business?.ein ??
        client?.businessEinNumber ??
        client?.einNumber ??
        client?.ein ??
        applicationData?.businessEinNumber ??
        "",
    ).trim(),
    address1: String(address?.address1 ?? client?.businessAddress1 ?? "").trim(),
    city: String(address?.city ?? client?.businessCity ?? "").trim(),
    state: String(address?.state ?? client?.businessState ?? "").trim(),
    zipCode: String(address?.zipCode ?? client?.businessZipCode ?? "").trim(),
  };
}

/** CLEAR SSN post-filter only runs when the application has a full 9-digit SSN. */
export function hasFullSsnForClear(ssn: string | null | undefined): boolean {
  return String(ssn ?? "").replace(/\D/g, "").length === 9;
}

/**
 * Owners that would be searched without a full SSN (CLEAR stays loose / unfiltered).
 * Empty when every searchable owner has a 9-digit SSN, or when there are no owners.
 */
export function ownersMissingFullSsnForClear(
  applicationData: Record<string, unknown> | null | undefined,
): Array<{ name: string; ownerId?: string }> {
  return extractApplicationOwnersForClear(applicationData)
    .filter((owner) => !hasFullSsnForClear(owner.ssn))
    .map((owner) => ({
      ownerId: owner.ownerId,
      name: [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() || "Owner",
    }));
}

export function extractApplicationOwnersForClear(
  applicationData: Record<string, unknown> | null | undefined,
): ApplicationOwnerSnapshot[] {
  const client = applicationData?.client as Record<string, unknown> | undefined;
  const owners = Array.isArray(client?.owners)
    ? (client?.owners as Record<string, unknown>[])
    : [];

  if (owners.length > 0) {
    return owners.map((owner) => {
      const address = (owner.address as Record<string, unknown> | undefined) ?? {};
      return {
        ownerId: String(owner.id ?? owner._id ?? "").trim() || undefined,
        firstName: String(owner.firstName ?? "").trim(),
        middleName: String(owner.middleName ?? "").trim(),
        lastName: String(owner.lastName ?? "").trim(),
        dateOfBirth: String(owner.dateOfBirth ?? "").trim(),
        ssn: String(owner.ssn ?? "").trim(),
        email: String(owner.email ?? "").trim(),
        mobileNumber: String(owner.mobileNumber ?? "").trim(),
        address1: String(address.address1 ?? owner.address1 ?? "").trim(),
        city: String(address.city ?? owner.city ?? "").trim(),
        state: String(address.state ?? owner.state ?? "").trim(),
        zipCode: String(address.zipCode ?? owner.zipCode ?? "").trim(),
      };
    });
  }

  const primary = (client?.owner as Record<string, unknown> | undefined) ?? {};
  if (!primary.firstName && !client?.ownerFirstName) return [];
  return [
    {
      ownerId: undefined,
      firstName: String(primary.firstName ?? client?.ownerFirstName ?? "").trim(),
      middleName: String(primary.middleName ?? client?.ownerMiddleName ?? "").trim(),
      lastName: String(primary.lastName ?? client?.ownerLastName ?? "").trim(),
      dateOfBirth: String(primary.dateOfBirth ?? client?.ownerDateOfBirth ?? "").trim(),
      ssn: String(primary.ssn ?? client?.ownerSsn ?? "").trim(),
      email: String(primary.email ?? client?.ownerEmail ?? "").trim(),
      mobileNumber: String(primary.mobileNumber ?? client?.ownerMobileNumber ?? "").trim(),
      address1: String(
        (primary.address as Record<string, unknown> | undefined)?.address1 ??
          client?.ownerAddress1 ??
          "",
      ).trim(),
      city: String(
        (primary.address as Record<string, unknown> | undefined)?.city ?? client?.ownerCity ?? "",
      ).trim(),
      state: String(
        (primary.address as Record<string, unknown> | undefined)?.state ??
          client?.ownerState ??
          "",
      ).trim(),
      zipCode: String(
        (primary.address as Record<string, unknown> | undefined)?.zipCode ??
          client?.ownerZipCode ??
          "",
      ).trim(),
    },
  ];
}

export function buildClearBusinessComparisonRows(
  hit: ClearBusinessHit,
  application: ApplicationBusinessSnapshot,
): ClearComparisonRow[] {
  const parsed = resolveHitAddress(hit);
  const clearAddress1 = parsed?.address1 || hit.address1 || "";
  const clearCity = parsed?.city || hit.city || "";
  const clearState = parsed?.state || hit.state || "";
  const clearZip = parsed?.zipCode || hit.zipCode || "";

  return [
    {
      key: "businessName",
      label: "Legal name",
      applicationValue: formatDisplay(application.businessName),
      clearValue: formatDisplay(hit.name),
      status: compareText(application.businessName, hit.name),
      syncField: "businessName",
    },
    {
      key: "businessEinNumber",
      label: "EIN",
      applicationValue: formatEinDisplay(application.businessEinNumber),
      clearValue: formatEinDisplay(
        revealClearIdForDisplay(hit.fein, application.businessEinNumber),
      ),
      status: compareDigits(application.businessEinNumber, hit.fein),
      syncField: "businessEinNumber",
    },
    {
      key: "address",
      label: "Address",
      applicationValue: formatDisplay(
        [application.address1, application.city, application.state, application.zipCode]
          .filter(Boolean)
          .join(", "),
      ),
      clearValue: formatDisplay(
        [clearAddress1, clearCity, clearState, clearZip].filter(Boolean).join(", ") ||
          hit.addressBlob,
      ),
      status:
        clearAddress1 || clearCity || clearState || clearZip
          ? compareText(
              [application.address1, application.city, normalizeStateCode(application.state), application.zipCode]
                .filter(Boolean)
                .join(" "),
              [clearAddress1, clearCity, normalizeStateCode(clearState), clearZip]
                .filter(Boolean)
                .join(" "),
            )
          : "neutral",
      syncField: clearAddress1 && clearCity && clearState && clearZip ? "address1" : undefined,
    },
  ];
}

export function buildClearPersonComparisonRows(
  hit: ClearPersonHit,
  owner: ApplicationOwnerSnapshot,
  options?: { businessEinNumber?: string; clearBusinessFein?: string },
): ClearComparisonRow[] {
  const parsed = resolveHitAddress(hit);
  const clearAddress1 = parsed?.address1 || hit.address1 || "";
  const clearCity = parsed?.city || hit.city || "";
  const clearState = parsed?.state || hit.state || "";
  const clearZip = parsed?.zipCode || hit.zipCode || "";
  const businessEin = String(options?.businessEinNumber ?? "").trim();
  const clearFein = String(options?.clearBusinessFein ?? "").trim();
  const revealedSsn = revealClearIdForDisplay(hit.ssn, owner.ssn);
  const revealedEin = revealClearIdForDisplay(clearFein, businessEin);

  return [
    {
      key: "firstName",
      label: "First name",
      applicationValue: formatDisplay(owner.firstName),
      clearValue: formatDisplay(hit.firstName),
      status: compareText(owner.firstName, hit.firstName),
      syncField: "firstName",
    },
    {
      key: "middleName",
      label: "Middle name",
      applicationValue: formatDisplay(owner.middleName),
      clearValue: formatDisplay(hit.middleName),
      status: compareText(owner.middleName, hit.middleName),
      syncField: "middleName",
    },
    {
      key: "lastName",
      label: "Last name",
      applicationValue: formatDisplay(owner.lastName),
      clearValue: formatDisplay(hit.lastName),
      status: compareText(owner.lastName, hit.lastName),
      syncField: "lastName",
    },
    {
      key: "dateOfBirth",
      label: "Date of birth",
      applicationValue: formatDisplay(normalizeIncorporationDate(owner.dateOfBirth) || owner.dateOfBirth),
      clearValue: formatDisplay(normalizeIncorporationDate(hit.dateOfBirth) || hit.dateOfBirth),
      status: compareDate(owner.dateOfBirth, hit.dateOfBirth),
      syncField: "dateOfBirth",
    },
    {
      key: "ssn",
      label: "SSN",
      applicationValue: formatSsnDisplay(owner.ssn),
      clearValue: formatSsnDisplay(revealedSsn),
      status: compareDigits(owner.ssn, hit.ssn),
      syncField: "ssn",
    },
    {
      key: "businessEinNumber",
      label: "EIN",
      applicationValue: formatEinDisplay(businessEin),
      clearValue: formatEinDisplay(revealedEin || clearFein),
      status:
        businessEin || clearFein
          ? compareDigits(businessEin, clearFein || businessEin)
          : "neutral",
    },
    {
      key: "email",
      label: "Email",
      applicationValue: formatDisplay(owner.email),
      clearValue: formatDisplay(hit.email),
      status: compareText(owner.email, hit.email),
      syncField: "email",
    },
    {
      key: "mobileNumber",
      label: "Mobile",
      applicationValue: formatDisplay(owner.mobileNumber),
      clearValue: formatDisplay(hit.phoneNumber),
      status: compareDigits(owner.mobileNumber, hit.phoneNumber),
      syncField: "mobileNumber",
    },
    {
      key: "address",
      label: "Address",
      applicationValue: formatDisplay(
        [owner.address1, owner.city, owner.state, owner.zipCode].filter(Boolean).join(", "),
      ),
      clearValue: formatDisplay(
        [clearAddress1, clearCity, clearState, clearZip].filter(Boolean).join(", ") ||
          hit.addressBlob,
      ),
      status:
        clearAddress1 || clearCity || clearState || clearZip
          ? compareText(
              [owner.address1, owner.city, normalizeStateCode(owner.state), owner.zipCode]
                .filter(Boolean)
                .join(" "),
              [clearAddress1, clearCity, normalizeStateCode(clearState), clearZip]
                .filter(Boolean)
                .join(" "),
            )
          : "neutral",
      syncField: clearAddress1 && clearCity && clearState && clearZip ? "address1" : undefined,
    },
  ];
}

export function canSyncClearComparisonRow(row: ClearComparisonRow): boolean {
  if (!row.syncField) return false;
  if (!hasDisplayValue(row.clearValue)) return false;
  if (row.status === "match") return false;
  if (row.status === "mismatch") return true;
  return row.status === "neutral" && !hasDisplayValue(row.applicationValue);
}

export function syncFieldsForClearComparisonRow(
  row: ClearComparisonRow,
): Array<ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey> {
  if (!canSyncClearComparisonRow(row) || !row.syncField) return [];
  if (row.syncField === "address1") {
    return ["address1", "city", "state", "zipCode"];
  }
  return [row.syncField];
}

export function syncFieldsFromClearComparisonRows(
  rows: ClearComparisonRow[],
): Array<ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey> {
  const fields = new Set<ClearBusinessSyncFieldKey | ClearPersonSyncFieldKey>();
  for (const row of rows) {
    for (const field of syncFieldsForClearComparisonRow(row)) {
      fields.add(field);
    }
  }
  return Array.from(fields);
}

export function buildClearSyncConfirmationLines(rows: ClearComparisonRow[]): string[] {
  return rows
    .filter(canSyncClearComparisonRow)
    .map((row) => `${row.label}: "${row.applicationValue}" → "${row.clearValue}"`);
}

/** PDF-ready CLEAR vs application match blocks (mirrors ClearPanel). */
export type ClearPdfMatchRow = {
  label: string;
  applicationValue: string;
  clearValue: string;
  status: ComparisonStatus;
};

export type ClearPdfMatchSection = {
  kind: "business" | "person";
  title: string;
  subtitle: string;
  ownerLabel?: string;
  rows: ClearPdfMatchRow[];
};

export function buildClearMatchSectionsForPdf(
  clearMetadata: import("./clearTypes").ClearLookupMetadata | null | undefined,
  applicationData: Record<string, unknown> | null | undefined,
): ClearPdfMatchSection[] {
  if (!clearMetadata) return [];

  const businessSnapshot = extractApplicationBusinessSnapshotForClear(applicationData);
  const owners = extractApplicationOwnersForClear(applicationData);
  const businessHits = clearMetadata.businessSearch?.hits ?? [];
  const personSearches = clearMetadata.personSearches ?? [];

  let clearBusinessFein = "";
  for (const hit of businessHits) {
    const fein = String(hit.fein ?? "").trim();
    if (fein) {
      clearBusinessFein = fein;
      break;
    }
  }

  const personIdOptions = {
    businessEinNumber: businessSnapshot.businessEinNumber,
    clearBusinessFein,
  };

  const sections: ClearPdfMatchSection[] = [];

  for (const [index, hit] of businessHits.entries()) {
    const rows = buildClearBusinessComparisonRows(hit, businessSnapshot);
    const revealedFein = revealClearIdForDisplay(hit.fein, businessSnapshot.businessEinNumber);
    sections.push({
      kind: "business",
      title: hit.name || `CLEAR business hit ${index + 1}`,
      subtitle: [revealedFein ? `EIN ${formatEinDisplay(revealedFein)}` : null, hit.groupId]
        .filter(Boolean)
        .join(" · "),
      rows: rows.map((row) => ({
        label: row.label,
        applicationValue: row.applicationValue,
        clearValue: row.clearValue,
        status: row.status,
      })),
    });
  }

  for (const [searchIndex, search] of personSearches.entries()) {
    const owner =
      (search.ownerId
        ? owners.find((row) => row.ownerId === search.ownerId)
        : undefined) ??
      (typeof search.ownerIndex === "number" ? owners[search.ownerIndex] : undefined) ??
      owners[0];
    const ownerLabel =
      search.ownerName ||
      [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") ||
      `Owner ${searchIndex + 1}`;
    const hits = search.hits ?? [];

    for (const [hitIndex, hit] of hits.entries()) {
      const rows = buildClearPersonComparisonRows(
        hit,
        owner ?? {
          firstName: "",
          middleName: "",
          lastName: "",
          dateOfBirth: "",
          ssn: "",
          email: "",
          mobileNumber: "",
          address1: "",
          city: "",
          state: "",
          zipCode: "",
        },
        personIdOptions,
      );
      const revealedSsn = revealClearIdForDisplay(hit.ssn, owner?.ssn);
      const revealedEin = revealClearIdForDisplay(
        clearBusinessFein,
        businessSnapshot.businessEinNumber,
      );
      sections.push({
        kind: "person",
        title:
          [hit.firstName, hit.middleName, hit.lastName].filter(Boolean).join(" ") ||
          `CLEAR person hit ${hitIndex + 1}`,
        subtitle: [
          revealedSsn ? `SSN ${formatSsnDisplay(revealedSsn)}` : null,
          revealedEin ? `EIN ${formatEinDisplay(revealedEin)}` : null,
          hit.groupId,
        ]
          .filter(Boolean)
          .join(" · "),
        ownerLabel,
        rows: rows.map((row) => ({
          label: row.label,
          applicationValue: row.applicationValue,
          clearValue: row.clearValue,
          status: row.status,
        })),
      });
    }
  }

  return sections;
}
