import { axiosPost } from "@/redux/axios";
import type {
  ClearBusinessSyncFieldKey,
  ClearPersonSyncFieldKey,
} from "@/components/application/clearComparison";
import type { ClearBusinessHit, ClearPersonHit } from "@/components/application/clearTypes";

export type ClearSyncResponse = {
  success: boolean;
  message: string;
  data?: {
    clientId: string;
    ownerId?: string | null;
    updatedFields: Record<string, string>;
    before: Record<string, string>;
    after: Record<string, string>;
  };
};

export async function syncClearBusinessToApplication(
  applicationId: string,
  payload: {
    hit: ClearBusinessHit;
    fields: ClearBusinessSyncFieldKey[];
  },
): Promise<ClearSyncResponse> {
  try {
    const response = await axiosPost(
      `/clear/applications/${applicationId}/sync-business-to-client`,
      payload,
    );
    const body = response.data as ClearSyncResponse;
    return {
      success: body.success !== false,
      message: body.message ?? "CLEAR business values synced to application.",
      data: body.data,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      message:
        err.response?.data?.message ??
        err.message ??
        "Failed to sync CLEAR business values to application.",
    };
  }
}

export async function syncClearPersonToOwner(
  applicationId: string,
  payload: {
    hit: ClearPersonHit;
    fields: ClearPersonSyncFieldKey[];
    ownerId?: string;
  },
): Promise<ClearSyncResponse> {
  try {
    const response = await axiosPost(
      `/clear/applications/${applicationId}/sync-person-to-owner`,
      payload,
    );
    const body = response.data as ClearSyncResponse;
    return {
      success: body.success !== false,
      message: body.message ?? "CLEAR person values synced to application owner.",
      data: body.data,
    };
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return {
      success: false,
      message:
        err.response?.data?.message ??
        err.message ??
        "Failed to sync CLEAR person values to application owner.",
    };
  }
}
