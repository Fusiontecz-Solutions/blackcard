import { axiosGet } from "@/redux/axios";

export type DataMerchRecord = {
  category?: string;
  note?: string;
  notes?: string;
  addedBy?: string | null;
  createdAt?: string | null;
  funder?: string;
  added_by?: string;
  created_at?: string;
  [key: string]: unknown;
};

export type DataMerchMerchant = {
  fein?: string | null;
  legalName?: string | null;
  legal_name?: string;
  name?: string;
  business_name?: string;
  ein?: string;
  dba?: string | null;
  address?: string | null;
  street1?: string | null;
  street2?: string | null;
  city?: string | null;
  state?: string | null;
  industry?: string | null;
  businessPhone?: string | null;
  businessStartDate?: string | null;
  risk_level?: string;
  records?: DataMerchRecord[];
  notes?: DataMerchRecord[];
  [key: string]: unknown;
};

export type DataMerchLookupData = {
  searchQuery: string;
  searchType: "ein" | "name" | "both";
  businessName: string | null;
  ein: string | null;
  merchants: DataMerchMerchant[];
  searchAttempts?: string[];
  raw: unknown;
};

function normalizeSearchType(value: unknown): "ein" | "name" | "both" {
  if (value === "name" || value === "both") return value;
  return "ein";
}

function extractLookupData(payload: unknown): DataMerchLookupData | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  if (!data || typeof data !== "object") return null;
  const merchants = Array.isArray(data.merchants) ? data.merchants : [];
  return {
    searchQuery: String(data.searchQuery ?? ""),
    searchType: normalizeSearchType(data.searchType),
    businessName:
      data.businessName != null ? String(data.businessName) : null,
    ein: data.ein != null ? String(data.ein) : null,
    merchants: merchants as DataMerchMerchant[],
    searchAttempts: Array.isArray(data.searchAttempts)
      ? data.searchAttempts.map((item) => String(item))
      : undefined,
    raw: data.raw,
  };
}

function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const root = payload as Record<string, unknown>;
  const msg = root.message ?? root.error;
  if (typeof msg === "string" && msg.trim()) return msg;
  if (msg && typeof msg === "object") {
    const nested = (msg as { description?: string }).description;
    if (nested) return nested;
  }
  return fallback;
}

/** DataMerch returns HTTP 404 when the merchant is not in their database. */
function isDataMerchMerchantNotFoundError(message: string, httpStatus?: number): boolean {
  if (httpStatus === 404) return true;
  const normalized = String(message ?? "").toLowerCase();
  return (
    normalized.includes("request failed (404)") ||
    (normalized.includes("datamerch") && normalized.includes("404"))
  );
}

function buildEmptyDataMerchLookup(hints?: {
  businessName?: string;
  ein?: string;
}): DataMerchLookupData {
  const einDigits = String(hints?.ein ?? "").replace(/\D/g, "");
  const hasEin = einDigits.length === 9;
  const businessName = String(hints?.businessName ?? "").trim();
  const searchType: "ein" | "name" | "both" =
    hasEin && businessName ? "both" : hasEin ? "ein" : "name";
  return {
    searchQuery:
      searchType === "both"
        ? `${einDigits} / ${businessName}`
        : hasEin
          ? einDigits
          : businessName,
    searchType,
    businessName: businessName || null,
    ein: hasEin ? einDigits : null,
    merchants: [],
    raw: null,
  };
}

export async function fetchDataMerchForApplication(
  applicationId: string,
  hints?: { businessName?: string; ein?: string },
) {
  const id = String(applicationId ?? "").trim();
  if (!id) {
    return { success: false as const, message: "Application id is required." };
  }

  try {
    const response = await axiosGet(`/datamerch/applications/${encodeURIComponent(id)}/lookup`);
    const data = extractLookupData(response.data);
    if (!data) {
      return { success: false as const, message: "Unexpected DataMerch response." };
    }
    return { success: true as const, data };
  } catch (error: unknown) {
    const err = error as { response?: { data?: unknown; status?: number }; message?: string };
    const message = extractErrorMessage(
      err.response?.data,
      err.message || "Failed to load DataMerch results.",
    );
    if (isDataMerchMerchantNotFoundError(message, err.response?.status)) {
      return {
        success: true as const,
        data: buildEmptyDataMerchLookup(hints),
      };
    }
    return {
      success: false as const,
      message,
    };
  }
}
