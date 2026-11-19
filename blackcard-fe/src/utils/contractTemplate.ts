import { axiosGet } from "@/redux/axios";
import { replaceLegacyBrandInDisplayName } from "@/constants/appBranding";

export type LatestContractTemplate = {
    url: string;
    originalName: string;
};

const STORAGE_KEY = "globalContractTemplate";

function clearCachedTemplate(): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

/** Load the latest uploaded contract template URL from the API only. */
export async function fetchLatestContractTemplate(): Promise<LatestContractTemplate | null> {
    try {
        const response = await axiosGet("/contract-templates/latest");
        const data = response.data?.data;
        if (data?.url) {
            return {
                url: String(data.url),
                originalName: replaceLegacyBrandInDisplayName(data.originalName),
            };
        }
    } catch {
        /* no uploaded template */
    }
    clearCachedTemplate();
    return null;
}
