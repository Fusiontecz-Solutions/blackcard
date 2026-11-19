import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosGet, axiosPost } from "../axios";

/**
 * Connect DocuSign (Get OAuth URL)
 */
export const connectDocusign = createAsyncThunk(
  "docusign/connect",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet("/docusign/connect");
      console.log("response", response);
      return response.data;
    } catch (error: any) {
      console.error("Connect DocuSign error:", error);
      return rejectWithValue(
        error.response?.data?.message || "Failed to connect DocuSign"
      );
    }
  }
);

/**
 * Create Draft Envelope
 */
export const createDraftEnvelope = createAsyncThunk(
  "docusign/createDraftEnvelope",
  async (
    {
      documentBase64,
      recipientEmail,
      applicationId,
      ccEmails,
      isResend
    }: {
      documentBase64: string;
      recipientEmail: string;
      applicationId: string;
      ccEmails?: string[];
      isResend?: boolean;
    },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosPost("/docusign/create-draft-envelope", {
        documentBase64,
        recipientEmail,
        applicationId,
        ccEmails,
        isResend
      });
      console.log("response", response);
      return response.data;
    } catch (error: any) {
      console.error("Create draft envelope error:", error);
      return rejectWithValue(
        error.response?.data?.message || error.message
      );
    }
  }
);

/**
 * Get Sender View URL (for editing envelope)
 */
export const getSenderView = createAsyncThunk(
  "docusign/getSenderView",
  async (
    {
      envelopeId,
      returnUrl
    }: {
      envelopeId: string;
      returnUrl: string;
    },
    { rejectWithValue }
  ) => {
    console.log("envelopeId from getSenderView", envelopeId);
    console.log("returnUrl from getSenderView", returnUrl);
    try {
      const response = await axiosPost("/docusign/sender-view", {
        envelopeId,
        returnUrl
      });

      console.log("response", response);
      return response.data;
    } catch (error: any) {
      console.error("Get sender view error:", error);
      return rejectWithValue(
        error.response?.data?.message || "Failed to get sender view"
      );
    }
  }
);

/**
 * Send Envelope
 */
export const sendEnvelope = createAsyncThunk(
  "docusign/sendEnvelope",
  async (envelopeId: string, { rejectWithValue }) => {
    try {
      const response = await axiosPost("/docusign/send-envelope", {
        envelopeId
      });

      console.log("response", response);
      return response.data;
    } catch (error: any) {
      console.error("Send envelope error:", error);
      return rejectWithValue(
        error.response?.data?.message || "Failed to send envelope"
      );
    }
  }
);

/**
 * Download Signed PDF
 */
export const getSignedPdf = createAsyncThunk(
  "docusign/getSignedPdf",
  async (envelopeId: string, { rejectWithValue }) => {
    try {
      const response = await axiosGet(`/docusign/signed-pdf/${envelopeId}`, {
        responseType: "blob"
      });

      console.log("response", response);
      return response.data;
    } catch (error: any) {
      console.error("Get signed PDF error:", error);
      return rejectWithValue(
        error.response?.data?.message || "Failed to download signed PDF"
      );
    }
  }
);