import { createSlice } from "@reduxjs/toolkit";
import {
  downloadBoldSignSignedPdf,
  getBoldSignDocumentProperties,
  getBoldSignEmbeddedRequestUrl,
  getBoldSignEmbeddedSignLink,
  listBoldSignDocuments,
  addRecipientsToBoldSignTemplate,
  getBoldSignTemplateRecipients,
  mergeAndSendBoldSignTemplates,
  prefillBoldSignFields,
  sendBoldSignDocument,
  sendBoldSignTemplate,
  voidBoldSignDocument,
} from "../actions/boldSignActions";

interface BoldSignState {
  loading: boolean;
  success: boolean;
  error: string | null;
  oauthUrl: string | null;
  callbackData: any | null;
  sentDocument: any | null;
  sentTemplate: any | null;
  embeddedRequestUrl: string | null;
  embeddedSignLink: string | null;
  voidResponse: any | null;
  documentProperties: any | null;
  downloadedPdf: { blob: Blob; headers?: any } | null;
  documents: any[];
  pagination: any | null;
  prefillFieldsResponse: any | null;
  mergeAndSendResponse: {
    success: boolean;
    documentId?: string;
    sendUrl?: string;
    data?: any;
    message?: string;
  } | null;
  addRecipientsResponse: any | null;
  templateRecipients: {
    success?: boolean;
    templateId?: string;
    roles?: Array<{
      roleName: string;
      signerName?: string;
      signerEmail?: string;
      signerOrder?: number | null;
      locale?: string;
    }>;
    raw?: any;
  } | null;
}

const initialState: BoldSignState = {
  loading: false,
  success: false,
  error: null,
  oauthUrl: null,
  callbackData: null,
  sentDocument: null,
  sentTemplate: null,
  embeddedRequestUrl: null,
  embeddedSignLink: null,
  voidResponse: null,
  documentProperties: null,
  downloadedPdf: null,
  documents: [],
  pagination: null,
  prefillFieldsResponse: null,
  mergeAndSendResponse: null,
  addRecipientsResponse: null,
  templateRecipients: null,
};

export const boldSignSlice = createSlice({
  name: "boldSign",
  initialState,
  reducers: {
    resetBoldSignState: (state) => {
      state.loading = false;
      state.success = false;
      state.error = null;
    },
    clearBoldSignDownload: (state) => {
      state.downloadedPdf = null;
    },
  },
  extraReducers: (builder) => {
    builder

      .addCase(sendBoldSignDocument.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(sendBoldSignDocument.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.sentDocument = action.payload?.data ?? action.payload;
      })
      .addCase(sendBoldSignDocument.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(sendBoldSignTemplate.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(sendBoldSignTemplate.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.sentTemplate = action.payload?.data ?? action.payload;
      })
      .addCase(sendBoldSignTemplate.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(getBoldSignEmbeddedRequestUrl.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(getBoldSignEmbeddedRequestUrl.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        const payload = action.payload?.data ?? action.payload;
        state.embeddedRequestUrl = payload?.url ?? payload?.embeddedRequestUrl ?? null;
      })
      .addCase(getBoldSignEmbeddedRequestUrl.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(getBoldSignEmbeddedSignLink.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(getBoldSignEmbeddedSignLink.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        const payload = action.payload?.data ?? action.payload;
        state.embeddedSignLink = payload?.url ?? payload?.embeddedSignLink ?? null;
      })
      .addCase(getBoldSignEmbeddedSignLink.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(voidBoldSignDocument.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(voidBoldSignDocument.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.voidResponse = action.payload?.data ?? action.payload;
      })
      .addCase(voidBoldSignDocument.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(getBoldSignDocumentProperties.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(getBoldSignDocumentProperties.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.documentProperties = action.payload?.data ?? action.payload;
      })
      .addCase(getBoldSignDocumentProperties.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(downloadBoldSignSignedPdf.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(downloadBoldSignSignedPdf.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.downloadedPdf = action.payload as { blob: Blob; headers?: any };
      })
      .addCase(downloadBoldSignSignedPdf.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(listBoldSignDocuments.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(listBoldSignDocuments.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        const payload = action.payload?.data ?? action.payload;
        state.documents = payload?.documents ?? payload?.data ?? [];
        state.pagination = payload?.pagination ?? null;
      })
      .addCase(listBoldSignDocuments.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      })
      .addCase(mergeAndSendBoldSignTemplates.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
        state.mergeAndSendResponse = null;
      })
      .addCase(mergeAndSendBoldSignTemplates.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        const payload = action.payload?.data ?? action.payload;
        state.mergeAndSendResponse = {
          success: Boolean(payload?.success ?? true),
          documentId: payload?.documentId ?? payload?.data?.documentId,
          sendUrl: payload?.sendUrl ?? payload?.data?.sendUrl,
          data: payload?.data ?? payload,
          message: payload?.message ?? null,
        };
      })
      .addCase(mergeAndSendBoldSignTemplates.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
        state.mergeAndSendResponse = null;
      })
      .addCase(addRecipientsToBoldSignTemplate.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
        state.addRecipientsResponse = null;
      })
      .addCase(addRecipientsToBoldSignTemplate.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.addRecipientsResponse = action.payload?.data ?? action.payload;
      })
      .addCase(addRecipientsToBoldSignTemplate.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
        state.addRecipientsResponse = null;
      })
      .addCase(getBoldSignTemplateRecipients.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
        state.templateRecipients = null;
      })
      .addCase(getBoldSignTemplateRecipients.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.templateRecipients = action.payload?.data ?? action.payload;
      })
      .addCase(getBoldSignTemplateRecipients.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
        state.templateRecipients = null;
      })
      .addCase(prefillBoldSignFields.pending, (state) => {
        state.loading = true;
        state.success = false;
        state.error = null;
      })
      .addCase(prefillBoldSignFields.fulfilled, (state, action) => {
        state.loading = false;
        state.success = true;
        state.prefillFieldsResponse = action.payload?.data ?? action.payload;
      })
      .addCase(prefillBoldSignFields.rejected, (state, action) => {
        state.loading = false;
        state.success = false;
        state.error = action.payload as string;
      });
  },
});

export const { resetBoldSignState, clearBoldSignDownload } = boldSignSlice.actions;
export default boldSignSlice.reducer;
