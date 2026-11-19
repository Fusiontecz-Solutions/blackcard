import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AxiosProgressEvent } from "axios";
import { axiosDelete, axiosGet, axiosPost, axiosPostFormData, axiosPut } from "../axios";

const CONTRACT_BASE = "/contract";

const getErrorMessage = (error: any, fallback: string): string =>
    error?.response?.data?.message || fallback;

const buildQuery = (params: Record<string, unknown>) => {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        queryParams.append(key, String(value));
    });
    const q = queryParams.toString();
    return q ? `?${q}` : "";
};

export interface UpdateContractData {
    clientId?: string;
    applicationId?: string;
    offerId?: string;
    startDate?: Date | string;
    endDate?: Date | string;
    contractLenght?: number;
    approvedAmount?: number;
    totalAmount?: number;
    status?:
        | "DRAFT"
        | "SENT"
        | "VIEWED"
        | "SIGNED"
        | "COMPLETED"
        | "DECLINED"
        | "REVOKED"
        | "EXPIRED";
    createdById?: string;
    agreementDate?: Date | string;
    paymentBankId?: string;
    state?: string | null;
    funderName?: string | null;
    /** BoldSign prefill overrides (flat strings); persisted on `Contract.contractPrefillOverrides`. */
    contractPrefillOverrides?: Record<string, unknown> | null;
    clientEmail?: string | null;
    clientName?: string | null;
    reverseDisbursementEnabled?: boolean;
    reverseDisbursementSchedule?: {
        fixedDailyDebit?: string;
        summary?: {
            totalFundingAmount?: string;
            netFundingAmount?: string;
            dailyDebit?: string;
            totalTermLength?: string;
            reductionOnDailyRate?: string;
            originationFeePercent?: string;
            factorRate?: string;
        };
        rows?: Array<Record<string, unknown>>;
    } | null;

    // Optional columns for extended BoldSign prefill fields (stored as strings).
    owner1GuarantorName?: string;
    owner2GuarantorName?: string;
    guarantyClientName?: string;
    guarantySs?: string;
    guarantySsDriverLicense?: string;
    guarantyOwner1Name?: string;
    guarantyOwner1Ss?: string;
    guarantyOwner1DriverLicense?: string;
    guarantyOwner2Name?: string;
    guarantyOwner2Ss?: string;
    guarantyOwner2DriverLicense?: string;
    guarantyGuarantor1Name?: string;
    guarantyGuarantor1Ss?: string;
    guarantyGuarantor1DriverLicense?: string;
    guarantyGuarantor2Name?: string;
    guarantyGuarantor2Ss?: string;
    guarantyGuarantor2DriverLicense?: string;
    achAuthorizationConcentAccountHolderName?: string;
    achAuthorizationConcentAccountHolderDate?: string;
    achAuthorizationBankPortalWebsite?: string;
    achAuthorizationUsername?: string;
    achAuthorizationPassword?: string;
    achAuthorizationSecurityQuestion1?: string;
    achAuthorizationSecurityQuestion2?: string;
    achAuthorizationSecurityQuestion3?: string;
    achAuthorizationSecurityAnswer1?: string;
    achAuthorizationSecurityAnswer2?: string;
    achAuthorizationSecurityAnswer3?: string;
    achAuthorizationOtherInfomation?: string;
    achAuthorizationReferenceName1?: string;
    achAuthorizationReferenceNumber1?: string;
    achAuthorizationReferenceRelationship1?: string;
    achAuthorizationReferenceName2?: string;
    achAuthorizationReferenceNumber2?: string;
    achAuthorizationReferenceRelationship2?: string;
    achAuthorizationReferenceName3?: string;
    achAuthorizationReferenceNumber3?: string;
    achAuthorizationReferenceRelationship3?: string;
    purchasePercent?: string | null;
}

// ------------------------- Contract -------------------------
export const createContract = createAsyncThunk(
    "contract/create",
    async (data: Record<string, unknown>, { rejectWithValue }) => {
        try {
            const response = await axiosPost(`${CONTRACT_BASE}/create_contract`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to create contract"));
        }
    },
);

export const getAllContracts = createAsyncThunk(
    "contract/getAll",
    async (
        filters: {
            clientId?: string;
            applicationId?: string;
            status?:
                | "DRAFT"
                | "SENT"
                | "VIEWED"
                | "SIGNED"
                | "COMPLETED"
                | "DECLINED"
                | "REVOKED"
                | "EXPIRED";
        } = {},
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/get_all_contracts${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch contracts"));
        }
    },
);

export const getByIdContract = createAsyncThunk(
    "contract/getById",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/get_contract/${id}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch contract"));
        }
    },
);

export const getContractRelatedDataByContractId = createAsyncThunk(
    "contract/getRelatedByContractId",
    async (contractId: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/get_contract_related/${contractId}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch contract related data"),
            );
        }
    },
);

export const getByApplicationIdContract = createAsyncThunk(
    "contract/getByApplicationId",
    async (applicationId: string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/get_contract_by_application/${applicationId}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch contract by application"),
            );
        }
    },
);

export const updateContract = createAsyncThunk(
    "contract/update",
    async (
        { id, data }: { id: number | string; data: UpdateContractData },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(`${CONTRACT_BASE}/update_contract/${id}`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to update contract"));
        }
    },
);

export const deleteContract = createAsyncThunk(
    "contract/delete",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/delete_contract/${id}`);
            return { ...(response.data || {}), deletedId: Number(id) || null };
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to delete contract"));
        }
    },
);

// ------------------------- ACH -------------------------
export const createACH = createAsyncThunk(
    "contract/ach/create",
    async (data: Record<string, unknown>, { rejectWithValue }) => {
        try {
            const response = await axiosPost(`${CONTRACT_BASE}/ach`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to create ACH"));
        }
    },
);

export const getAllACH = createAsyncThunk(
    "contract/ach/getAll",
    async (
        filters: { clientId?: string; contractId?: number | string } = {},
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/ach${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch ACH"));
        }
    },
);

export const getByIdACH = createAsyncThunk(
    "contract/ach/getById",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/ach/${id}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch ACH detail"));
        }
    },
);

export const updateACH = createAsyncThunk(
    "contract/ach/update",
    async (
        { id, data }: { id: number | string; data: Record<string, unknown> },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(`${CONTRACT_BASE}/ach/${id}`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to update ACH"));
        }
    },
);

export const deleteACH = createAsyncThunk(
    "contract/ach/delete",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/ach/${id}`);
            return { ...(response.data || {}), deletedId: Number(id) || null };
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to delete ACH"));
        }
    },
);

// ------------------------- EPO -------------------------
export const createEPO = createAsyncThunk(
    "contract/epo/create",
    async (data: Record<string, unknown>, { rejectWithValue }) => {
        try {
            const response = await axiosPost(`${CONTRACT_BASE}/epo`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to create EPO"));
        }
    },
);

export const getAllEPO = createAsyncThunk(
    "contract/epo/getAll",
    async (
        filters: { clientId?: string; contractId?: number | string } = {},
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/epo${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch EPO"));
        }
    },
);

export const getByIdEPO = createAsyncThunk(
    "contract/epo/getById",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/epo/${id}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch EPO detail"));
        }
    },
);

export const updateEPO = createAsyncThunk(
    "contract/epo/update",
    async (
        { id, data }: { id: number | string; data: Record<string, unknown> },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(`${CONTRACT_BASE}/epo/${id}`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to update EPO"));
        }
    },
);

export const deleteEPO = createAsyncThunk(
    "contract/epo/delete",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/epo/${id}`);
            return { ...(response.data || {}), deletedId: Number(id) || null };
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to delete EPO"));
        }
    },
);

// ------------------------- Addendum -------------------------
export const createAddendum = createAsyncThunk(
    "contract/addendum/create",
    async (data: Record<string, unknown>, { rejectWithValue }) => {
        try {
            const response = await axiosPost(`${CONTRACT_BASE}/addendum`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to create addendum"));
        }
    },
);

export const getAllAddendum = createAsyncThunk(
    "contract/addendum/getAll",
    async (
        filters: { clientId?: string; contractId?: number | string } = {},
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/addendum${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch addendum"));
        }
    },
);

export const getByIdAddendum = createAsyncThunk(
    "contract/addendum/getById",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/addendum/${id}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch addendum detail"),
            );
        }
    },
);

export const updateAddendum = createAsyncThunk(
    "contract/addendum/update",
    async (
        { id, data }: { id: number | string; data: Record<string, unknown> },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(`${CONTRACT_BASE}/addendum/${id}`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to update addendum"));
        }
    },
);

export const deleteAddendum = createAsyncThunk(
    "contract/addendum/delete",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/addendum/${id}`);
            return { ...(response.data || {}), deletedId: Number(id) || null };
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to delete addendum"));
        }
    },
);

// ------------------------- Owner -------------------------
export const createContractOwner = createAsyncThunk(
    "contract/owner/create",
    async (data: Record<string, unknown>, { rejectWithValue }) => {
        try {
            const response = await axiosPost(`${CONTRACT_BASE}/owner`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to create owner"));
        }
    },
);

export const getAllContractOwners = createAsyncThunk(
    "contract/owner/getAll",
    async (filters: { contractId?: number | string } = {}, { rejectWithValue }) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/owner${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch owners"));
        }
    },
);

export const getByIdContractOwner = createAsyncThunk(
    "contract/owner/getById",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/owner/${id}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch owner detail"));
        }
    },
);

export const updateContractOwner = createAsyncThunk(
    "contract/owner/update",
    async (
        { id, data }: { id: number | string; data: Record<string, unknown> },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(`${CONTRACT_BASE}/owner/${id}`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to update owner"));
        }
    },
);

export const deleteContractOwner = createAsyncThunk(
    "contract/owner/delete",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/owner/${id}`);
            return { ...(response.data || {}), deletedId: Number(id) || null };
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to delete owner"));
        }
    },
);

// ------------------------- Guarantor -------------------------
export const createContractGuarantor = createAsyncThunk(
    "contract/guarantor/create",
    async (data: Record<string, unknown>, { rejectWithValue }) => {
        try {
            const response = await axiosPost(`${CONTRACT_BASE}/guarantor`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to create guarantor"));
        }
    },
);

export const getAllContractGuarantors = createAsyncThunk(
    "contract/guarantor/getAll",
    async (filters: { contractId?: number | string } = {}, { rejectWithValue }) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/guarantor${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to fetch guarantors"));
        }
    },
);

export const getByIdContractGuarantor = createAsyncThunk(
    "contract/guarantor/getById",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/guarantor/${id}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch guarantor detail"),
            );
        }
    },
);

export const updateContractGuarantor = createAsyncThunk(
    "contract/guarantor/update",
    async (
        { id, data }: { id: number | string; data: Record<string, unknown> },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPut(`${CONTRACT_BASE}/guarantor/${id}`, data);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to update guarantor"));
        }
    },
);

export const deleteContractGuarantor = createAsyncThunk(
    "contract/guarantor/delete",
    async (id: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/guarantor/${id}`);
            return { ...(response.data || {}), deletedId: Number(id) || null };
        } catch (error: any) {
            return rejectWithValue(getErrorMessage(error, "Failed to delete guarantor"));
        }
    },
);

// ------------------------- Uploaded Documents -------------------------
export const uploadContractDocuments = createAsyncThunk(
    "contract/documents/upload",
    async (
        {
            contractId,
            filesByType,
            onUploadProgress,
        }: {
            contractId: number | string;
            filesByType: Record<string, File | File[] | null | undefined>;
            /** Optional progress callback for the multipart upload (not persisted to state). */
            onUploadProgress?: (event: AxiosProgressEvent) => void;
        },
        { rejectWithValue },
    ) => {
        try {
            const formData = new FormData();
            Object.entries(filesByType || {}).forEach(([documentType, input]) => {
                const files = Array.isArray(input) ? input : [input];
                files
                    .filter(Boolean)
                    .forEach((file) => formData.append(documentType, file as File));
            });
            const response = await axiosPostFormData(
                `${CONTRACT_BASE}/${contractId}/documents/upload`,
                formData,
                onUploadProgress ? { onUploadProgress } : undefined,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to upload contract documents"),
            );
        }
    },
);

export const syncKycPrefillToContract = createAsyncThunk(
    "contract/documents/syncKycPrefill",
    async (
        {
            contractId,
            extraction,
        }: {
            contractId: number | string;
            extraction: {
                documentType: "driverLicense" | "voidedCheck";
                contractPrefill?: Record<string, string>;
                panels?: Record<string, unknown>;
                keyData?: Record<string, string>;
            };
        },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosPost(
                `${CONTRACT_BASE}/${contractId}/documents/sync-kyc-prefill`,
                extraction,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to sync KYC data to contract prefill"),
            );
        }
    },
);

export const getUploadedContractDocuments = createAsyncThunk(
    "contract/documents/getAll",
    async (contractId: number | string, { rejectWithValue }) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/${contractId}/documents`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch uploaded contract documents"),
            );
        }
    },
);

export const getUploadedContractDocumentById = createAsyncThunk(
    "contract/documents/getById",
    async (
        { contractId, fileId }: { contractId: number | string; fileId: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosGet(`${CONTRACT_BASE}/${contractId}/documents/${fileId}`);
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch uploaded contract document"),
            );
        }
    },
);

export const updateUploadedContractDocument = createAsyncThunk(
    "contract/documents/update",
    async (
        {
            contractId,
            fileId,
            fileName,
            file,
        }: {
            contractId: number | string;
            fileId: string;
            fileName?: string;
            file?: File | null;
        },
        { rejectWithValue },
    ) => {
        try {
            const formData = new FormData();
            if (fileName) formData.append("fileName", fileName);
            if (file) formData.append("file", file);
            const response = await axiosPut(
                `${CONTRACT_BASE}/${contractId}/documents/${fileId}`,
                formData,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to update uploaded contract document"),
            );
        }
    },
);

export const deleteUploadedContractDocument = createAsyncThunk(
    "contract/documents/delete",
    async (
        { contractId, fileId }: { contractId: number | string; fileId: string },
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosDelete(`${CONTRACT_BASE}/${contractId}/documents/${fileId}`);
            return { ...(response.data || {}), deletedId: fileId };
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to delete uploaded contract document"),
            );
        }
    },
);

// ------------------------- BoldSign Templates -------------------------
export const getBoldSignTemplates = createAsyncThunk(
    "contract/templates/getAll",
    async (
        filters: { type?: string; state?: string; frequency?: string } = {},
        { rejectWithValue },
    ) => {
        try {
            const response = await axiosGet(
                `${CONTRACT_BASE}/templates${buildQuery(filters as Record<string, unknown>)}`,
            );
            return response.data;
        } catch (error: any) {
            return rejectWithValue(
                getErrorMessage(error, "Failed to fetch DocuSign templates"),
            );
        }
    },
);
