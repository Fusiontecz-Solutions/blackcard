import { createSlice } from "@reduxjs/toolkit";
import {
    createACH,
    getAllACH,
    getByIdACH,
    updateACH,
    deleteACH,
    createEPO,
    getAllEPO,
    getByIdEPO,
    updateEPO,
    deleteEPO,
    createAddendum,
    getAllAddendum,
    getByIdAddendum,
    updateAddendum,
    deleteAddendum,
    createContractOwner,
    getAllContractOwners,
    getByIdContractOwner,
    updateContractOwner,
    deleteContractOwner,
    createContractGuarantor,
    getAllContractGuarantors,
    getByIdContractGuarantor,
    updateContractGuarantor,
    deleteContractGuarantor,
    createContract,
    getAllContracts,
    getByIdContract,
    getByApplicationIdContract,
    updateContract,
    deleteContract,
    uploadContractDocuments,
    getUploadedContractDocuments,
    getUploadedContractDocumentById,
    getBoldSignTemplates,
    updateUploadedContractDocument,
    deleteUploadedContractDocument,
} from "../actions/contractActions";

interface ListState<T = any> {
    loading: boolean;
    data: T[];
    error: string | null;
}

interface MutationState<T = any> {
    loading: boolean;
    success: boolean;
    data: T | null;
    error: string | null;
}

interface DetailState<T = any> {
    loading: boolean;
    data: T | null;
    error: string | null;
}

interface DeleteState {
    loading: boolean;
    success: boolean;
    deletedId: number | null;
    error: string | null;
}

const createListSlice = (name: string, getAllThunk: any) =>
    createSlice({
        name,
        initialState: { loading: false, data: [], error: null } as ListState,
        reducers: {
            clear: (state) => {
                state.data = [];
                state.error = null;
            },
        },
        extraReducers: (builder) => {
            builder
                .addCase(getAllThunk.pending, (state) => {
                    state.loading = true;
                    state.error = null;
                })
                .addCase(getAllThunk.fulfilled, (state, action) => {
                    state.loading = false;
                    state.data = action.payload?.data || action.payload || [];
                })
                .addCase(getAllThunk.rejected, (state, action) => {
                    state.loading = false;
                    state.error = action.payload as string;
                });
        },
    });

const createCreateSlice = (name: string, createThunk: any) =>
    createSlice({
        name,
        initialState: {
            loading: false,
            success: false,
            data: null,
            error: null,
        } as MutationState,
        reducers: {
            reset: (state) => {
                state.loading = false;
                state.success = false;
                state.data = null;
                state.error = null;
            },
        },
        extraReducers: (builder) => {
            builder
                .addCase(createThunk.pending, (state) => {
                    state.loading = true;
                    state.success = false;
                    state.error = null;
                })
                .addCase(createThunk.fulfilled, (state, action) => {
                    state.loading = false;
                    state.success = true;
                    state.data = action.payload?.data || action.payload;
                })
                .addCase(createThunk.rejected, (state, action) => {
                    state.loading = false;
                    state.success = false;
                    state.error = action.payload as string;
                });
        },
    });

const createDetailSlice = (name: string, getByIdThunk: any) =>
    createSlice({
        name,
        initialState: { loading: false, data: null, error: null } as DetailState,
        reducers: {
            clear: (state) => {
                state.data = null;
                state.error = null;
            },
        },
        extraReducers: (builder) => {
            builder
                .addCase(getByIdThunk.pending, (state) => {
                    state.loading = true;
                    state.error = null;
                })
                .addCase(getByIdThunk.fulfilled, (state, action) => {
                    state.loading = false;
                    state.data = action.payload?.data || action.payload;
                })
                .addCase(getByIdThunk.rejected, (state, action) => {
                    state.loading = false;
                    state.error = action.payload as string;
                });
        },
    });

const createUpdateSlice = (name: string, updateThunk: any) =>
    createSlice({
        name,
        initialState: {
            loading: false,
            success: false,
            data: null,
            error: null,
        } as MutationState,
        reducers: {
            reset: (state) => {
                state.loading = false;
                state.success = false;
                state.data = null;
                state.error = null;
            },
        },
        extraReducers: (builder) => {
            builder
                .addCase(updateThunk.pending, (state) => {
                    state.loading = true;
                    state.success = false;
                    state.error = null;
                })
                .addCase(updateThunk.fulfilled, (state, action) => {
                    state.loading = false;
                    state.success = true;
                    state.data = action.payload?.data || action.payload;
                })
                .addCase(updateThunk.rejected, (state, action) => {
                    state.loading = false;
                    state.success = false;
                    state.error = action.payload as string;
                });
        },
    });

const createDeleteSlice = (name: string, deleteThunk: any) =>
    createSlice({
        name,
        initialState: {
            loading: false,
            success: false,
            deletedId: null,
            error: null,
        } as DeleteState,
        reducers: {
            reset: (state) => {
                state.loading = false;
                state.success = false;
                state.deletedId = null;
                state.error = null;
            },
        },
        extraReducers: (builder) => {
            builder
                .addCase(deleteThunk.pending, (state) => {
                    state.loading = true;
                    state.success = false;
                    state.error = null;
                })
                .addCase(deleteThunk.fulfilled, (state, action) => {
                    state.loading = false;
                    state.success = true;
                    state.deletedId = action.payload?.deletedId ?? null;
                })
                .addCase(deleteThunk.rejected, (state, action) => {
                    state.loading = false;
                    state.success = false;
                    state.error = action.payload as string;
                });
        },
    });

export const achListSlice = createListSlice("achList", getAllACH);
export const createACHSlice = createCreateSlice("createACH", createACH);
export const achDetailSlice = createDetailSlice("achDetail", getByIdACH);
export const updateACHSlice = createUpdateSlice("updateACH", updateACH);
export const deleteACHSlice = createDeleteSlice("deleteACH", deleteACH);

export const epoListSlice = createListSlice("epoList", getAllEPO);
export const createEPOSlice = createCreateSlice("createEPO", createEPO);
export const epoDetailSlice = createDetailSlice("epoDetail", getByIdEPO);
export const updateEPOSlice = createUpdateSlice("updateEPO", updateEPO);
export const deleteEPOSlice = createDeleteSlice("deleteEPO", deleteEPO);

export const addendumListSlice = createListSlice("addendumList", getAllAddendum);
export const createAddendumSlice = createCreateSlice(
    "createAddendum",
    createAddendum,
);
export const addendumDetailSlice = createDetailSlice(
    "addendumDetail",
    getByIdAddendum,
);
export const updateAddendumSlice = createUpdateSlice(
    "updateAddendum",
    updateAddendum,
);
export const deleteAddendumSlice = createDeleteSlice(
    "deleteAddendum",
    deleteAddendum,
);

export const contractOwnerListSlice = createListSlice(
    "contractOwnerList",
    getAllContractOwners,
);
export const createContractOwnerSlice = createCreateSlice(
    "createContractOwner",
    createContractOwner,
);
export const contractOwnerDetailSlice = createDetailSlice(
    "contractOwnerDetail",
    getByIdContractOwner,
);
export const updateContractOwnerSlice = createUpdateSlice(
    "updateContractOwner",
    updateContractOwner,
);
export const deleteContractOwnerSlice = createDeleteSlice(
    "deleteContractOwner",
    deleteContractOwner,
);

export const contractGuarantorListSlice = createListSlice(
    "contractGuarantorList",
    getAllContractGuarantors,
);
export const createContractGuarantorSlice = createCreateSlice(
    "createContractGuarantor",
    createContractGuarantor,
);
export const contractGuarantorDetailSlice = createDetailSlice(
    "contractGuarantorDetail",
    getByIdContractGuarantor,
);
export const updateContractGuarantorSlice = createUpdateSlice(
    "updateContractGuarantor",
    updateContractGuarantor,
);
export const deleteContractGuarantorSlice = createDeleteSlice(
    "deleteContractGuarantor",
    deleteContractGuarantor,
);

export const contractListSlice = createListSlice("contractList", getAllContracts);
export const createContractSlice = createCreateSlice(
    "createContractEntity",
    createContract,
);
export const contractDetailSlice = createDetailSlice(
    "contractDetail",
    getByIdContract,
);
export const contractByApplicationDetailSlice = createDetailSlice(
    "contractByApplicationDetail",
    getByApplicationIdContract,
);
export const updateContractSlice = createUpdateSlice(
    "updateContractEntity",
    updateContract,
);
export const deleteContractSlice = createDeleteSlice(
    "deleteContractEntity",
    deleteContract,
);
export const uploadContractDocumentsSlice = createCreateSlice(
    "uploadContractDocuments",
    uploadContractDocuments,
);
export const uploadedContractDocumentsSlice = createListSlice(
    "uploadedContractDocuments",
    getUploadedContractDocuments,
);
export const boldSignTemplatesSlice = createListSlice(
    "boldSignTemplates",
    getBoldSignTemplates,
);
export const uploadedContractDocumentDetailSlice = createDetailSlice(
    "uploadedContractDocumentDetail",
    getUploadedContractDocumentById,
);
export const updateUploadedContractDocumentSlice = createUpdateSlice(
    "updateUploadedContractDocument",
    updateUploadedContractDocument,
);
export const deleteUploadedContractDocumentSlice = createDeleteSlice(
    "deleteUploadedContractDocument",
    deleteUploadedContractDocument,
);

export const { clear: clearACHList } = achListSlice.actions;
export const { reset: resetCreateACH } = createACHSlice.actions;
export const { clear: clearACHDetail } = achDetailSlice.actions;
export const { reset: resetUpdateACH } = updateACHSlice.actions;
export const { reset: resetDeleteACH } = deleteACHSlice.actions;

export const { clear: clearEPOList } = epoListSlice.actions;
export const { reset: resetCreateEPO } = createEPOSlice.actions;
export const { clear: clearEPODetail } = epoDetailSlice.actions;
export const { reset: resetUpdateEPO } = updateEPOSlice.actions;
export const { reset: resetDeleteEPO } = deleteEPOSlice.actions;

export const { clear: clearAddendumList } = addendumListSlice.actions;
export const { reset: resetCreateAddendum } = createAddendumSlice.actions;
export const { clear: clearAddendumDetail } = addendumDetailSlice.actions;
export const { reset: resetUpdateAddendum } = updateAddendumSlice.actions;
export const { reset: resetDeleteAddendum } = deleteAddendumSlice.actions;

export const { clear: clearContractOwnerList } = contractOwnerListSlice.actions;
export const { reset: resetCreateContractOwner } = createContractOwnerSlice.actions;
export const { clear: clearContractOwnerDetail } = contractOwnerDetailSlice.actions;
export const { reset: resetUpdateContractOwner } = updateContractOwnerSlice.actions;
export const { reset: resetDeleteContractOwner } = deleteContractOwnerSlice.actions;

export const { clear: clearContractGuarantorList } =
    contractGuarantorListSlice.actions;
export const { reset: resetCreateContractGuarantor } =
    createContractGuarantorSlice.actions;
export const { clear: clearContractGuarantorDetail } =
    contractGuarantorDetailSlice.actions;
export const { reset: resetUpdateContractGuarantor } =
    updateContractGuarantorSlice.actions;
export const { reset: resetDeleteContractGuarantor } =
    deleteContractGuarantorSlice.actions;

export const { clear: clearContractList } = contractListSlice.actions;
export const { reset: resetCreateContract } = createContractSlice.actions;
export const { clear: clearContractDetail } = contractDetailSlice.actions;
export const { clear: clearContractByApplicationDetail } =
    contractByApplicationDetailSlice.actions;
export const { reset: resetUpdateContract } = updateContractSlice.actions;
export const { reset: resetDeleteContract } = deleteContractSlice.actions;
export const { reset: resetUploadContractDocuments } =
    uploadContractDocumentsSlice.actions;
export const { clear: clearUploadedContractDocuments } =
    uploadedContractDocumentsSlice.actions;
export const { clear: clearBoldSignTemplates } =
    boldSignTemplatesSlice.actions;
export const { clear: clearUploadedContractDocumentDetail } =
    uploadedContractDocumentDetailSlice.actions;
export const { reset: resetUpdateUploadedContractDocument } =
    updateUploadedContractDocumentSlice.actions;
export const { reset: resetDeleteUploadedContractDocument } =
    deleteUploadedContractDocumentSlice.actions;