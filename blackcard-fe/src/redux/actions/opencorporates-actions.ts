import { axiosPost } from "@/redux/axios";
import type { OpenCorporatesSyncFieldKey } from "@/components/application/opencorporatesComparison";
import type { OpenCorporatesCompanyHit } from "@/components/application/opencorporatesTypes";
import type { OpenCorporatesLookupData } from "@/components/application/opencorporatesTypes";

export type OpenCorporatesImportResponse = {
  success: boolean;
  message: string;
  data?: OpenCorporatesLookupData & { searchedAt: string };
};

export type OpenCorporatesSyncResponse = {
  success: boolean;
  message: string;
  data?: {
    clientId: string;
    updatedFields: Partial<Record<OpenCorporatesSyncFieldKey, string>>;
    before: Partial<Record<OpenCorporatesSyncFieldKey, string>>;
    after: Partial<Record<OpenCorporatesSyncFieldKey, string>>;
  };
};

export async function importOpenCorporatesForApplication(
  applicationId: string,
  payload: {
    searchQuery: string;
    jurisdictionCode?: string;
    sourceUrl?: string;
    companies: OpenCorporatesLookupData["companies"];
  },
): Promise<OpenCorporatesImportResponse> {
  try {
    const response = await axiosPost(`/opencorporates/applications/${applicationId}/import`, payload);
    const body = response.data as {
      success?: boolean;
      message?: string;
      data?: OpenCorporatesLookupData & { searchedAt: string };
    };
    return {
      success: body.success !== false,
      message: body.message ?? "OpenCorporates data imported.",
      data: body.data,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      message:
        err.response?.data?.message ??
        err.message ??
        "Failed to save OpenCorporates import.",
    };
  }
}

export async function syncOpenCorporatesToApplication(
  applicationId: string,
  payload: {
    company: OpenCorporatesCompanyHit;
    fields: OpenCorporatesSyncFieldKey[];
  },
): Promise<OpenCorporatesSyncResponse> {
  try {
    const response = await axiosPost(
      `/opencorporates/applications/${applicationId}/sync-to-client`,
      payload,
    );
    const body = response.data as OpenCorporatesSyncResponse;
    return {
      success: body.success !== false,
      message: body.message ?? "OpenCorporates values synced to application.",
      data: body.data,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      message:
        err.response?.data?.message ??
        err.message ??
        "Failed to sync OpenCorporates values to application.",
    };
  }
}
