import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosDelete, axiosGet, axiosPatch, axiosPost } from "../axios";

export type GmailSystemLabel =
  | "INBOX"
  | "SENT"
  | "DRAFT"
  | "IMPORTANT"
  | "STARRED"
  | "SPAM"
  | "TRASH"
  | "ALL";
/** System label or a Gmail user label id (e.g. `Label_123`). */
export type GmailLabel = GmailSystemLabel | (string & {});
export interface SendGmailOptions {
  to: string | string[];
  subject?: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  from?: string;
  replyTo?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export const getGoogleAccessToken = createAsyncThunk<string, void>(
  "gmail/getGoogleAccessToken",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet("/google/test");
      const { success, accessToken, message } = response.data || {};

      if (!success || !accessToken) {
        return rejectWithValue(message || "Failed to generate access token");
      }

      return accessToken as string;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to get access token"
      );
    }
  }
);

export interface GmailConnectionInfo {
  connected: boolean;
  gmailEmail: string | null;
  crmEmail: string | null;
  needsReconnect?: boolean;
  message?: string | null;
}

export const fetchGmailConnection = createAsyncThunk<GmailConnectionInfo, void>(
  "gmail/fetchConnection",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet("/gmail/me");
      const data = response.data || {};
      if (!data.success) {
        return rejectWithValue(data.message || "Failed to check Gmail connection");
      }
      return {
        connected: Boolean(data.connected),
        gmailEmail: data.gmailEmail ?? null,
        crmEmail: data.crmEmail ?? null,
        needsReconnect: Boolean(data.needsReconnect),
        message: data.message ?? null,
      };
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to check Gmail connection"
      );
    }
  }
);

// ==============================
// 🔵 Sync Gmail (fetch by label)
// ==============================
export const syncGmail = createAsyncThunk(
  "gmail/sync",
  async (
    {
      label,
      pageToken,
      limit,
      query,
    }: {
      label?: GmailLabel;
      pageToken?: string;
      limit?: number;
      query?: string;
      /** Background refresh — don't show the list spinner. */
      silent?: boolean;
    } = {},
    { rejectWithValue }
  ) => {
    try {
      // Mailbox list resolves the Gmail token server-side from the CRM session.
      const response = await axiosPost("/gmail/mailbox/list", {
        labelId: label,
        pageToken,
        limit,
        query,
      });

      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to sync Gmail"
      );
    }
  },
  {
    condition: (arg, { getState }) => {
      const state = (getState() as {
        gmail?: { syncing?: boolean; syncingLabel?: string | null };
      }).gmail;
      if (!state?.syncing) return true;
      // Allow a label switch to supersede an in-flight sync; skip exact duplicates.
      return (arg?.label ?? null) !== (state.syncingLabel ?? null);
    },
  }
);

// ==============================
// 📬 Mailbox (labels, star, archive, trash, threads, reply/forward, drafts)
// ==============================

export interface GmailMailboxLabel {
  id: string;
  name: string;
  type: "system" | "user";
  messagesTotal: number;
  messagesUnread: number;
  threadsTotal: number;
  threadsUnread: number;
  color: { textColor?: string; backgroundColor?: string } | null;
  protected: boolean;
}

export interface GmailOutgoingAttachment {
  filename: string;
  contentType: string;
  /** Base64 (no data: prefix). */
  data: string;
}

export interface GmailSourceAttachmentRef {
  messageId: string;
  partIds: string[];
}

export interface GmailMailboxSendPayload {
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: GmailOutgoingAttachment[];
  sourceAttachments?: GmailSourceAttachmentRef[];
  draftId?: string;
}

const apiError = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

export const fetchGmailLabels = createAsyncThunk<GmailMailboxLabel[], void>(
  "gmail/fetchLabels",
  async (_, { rejectWithValue }) => {
    try {
      const response = await axiosGet("/gmail/mailbox/labels");
      return (response.data?.data ?? []) as GmailMailboxLabel[];
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to load labels"));
    }
  }
);

export const createGmailLabel = createAsyncThunk(
  "gmail/createLabel",
  async (name: string, { rejectWithValue }) => {
    try {
      const response = await axiosPost("/gmail/mailbox/labels", { name });
      return response.data?.data;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to create label"));
    }
  }
);

export const renameGmailLabel = createAsyncThunk(
  "gmail/renameLabel",
  async ({ labelId, name }: { labelId: string; name: string }, { rejectWithValue }) => {
    try {
      const response = await axiosPatch(
        `/gmail/mailbox/labels/${encodeURIComponent(labelId)}`,
        { name }
      );
      return response.data?.data;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to rename label"));
    }
  }
);

export const deleteGmailLabel = createAsyncThunk(
  "gmail/deleteLabel",
  async (labelId: string, { rejectWithValue }) => {
    try {
      await axiosDelete(`/gmail/mailbox/labels/${encodeURIComponent(labelId)}`);
      return labelId;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to delete label"));
    }
  }
);

export const modifyGmailMessages = createAsyncThunk(
  "gmail/modifyMessages",
  async (
    payload: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] },
    { rejectWithValue }
  ) => {
    try {
      await axiosPost("/gmail/mailbox/modify", {
        ids: payload.ids,
        addLabelIds: payload.addLabelIds ?? [],
        removeLabelIds: payload.removeLabelIds ?? [],
      });
      return payload;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to update messages"));
    }
  }
);

export const trashGmailMessages = createAsyncThunk(
  "gmail/trashMessages",
  async (ids: string[], { rejectWithValue }) => {
    try {
      await axiosPost("/gmail/mailbox/trash", { ids });
      return ids;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to move to trash"));
    }
  }
);

export const untrashGmailMessages = createAsyncThunk(
  "gmail/untrashMessages",
  async (ids: string[], { rejectWithValue }) => {
    try {
      await axiosPost("/gmail/mailbox/untrash", { ids });
      return ids;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to restore messages"));
    }
  }
);

export const fetchGmailThread = createAsyncThunk(
  "gmail/fetchThread",
  async (threadId: string, { rejectWithValue }) => {
    try {
      const response = await axiosGet(
        `/gmail/mailbox/threads/${encodeURIComponent(threadId)}`
      );
      return response.data?.data as { id: string; messages: any[] };
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to load conversation"));
    }
  }
);

export const sendGmailMailboxEmail = createAsyncThunk(
  "gmail/sendMailboxEmail",
  async (payload: GmailMailboxSendPayload, { rejectWithValue }) => {
    try {
      const response = await axiosPost("/gmail/mailbox/send", payload);
      return response.data?.data;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to send email"));
    }
  }
);

export const saveGmailDraft = createAsyncThunk(
  "gmail/saveDraft",
  async (payload: GmailMailboxSendPayload, { rejectWithValue }) => {
    try {
      const response = await axiosPost("/gmail/mailbox/drafts", payload);
      return response.data?.data as { id: string; message?: { id: string; threadId: string } };
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to save draft"));
    }
  }
);

export const deleteGmailDraft = createAsyncThunk(
  "gmail/deleteDraft",
  async (draftId: string, { rejectWithValue }) => {
    try {
      await axiosDelete(`/gmail/mailbox/drafts/${encodeURIComponent(draftId)}`);
      return draftId;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to discard draft"));
    }
  }
);

export const findGmailDraftByMessage = createAsyncThunk(
  "gmail/findDraftByMessage",
  async (messageId: string, { rejectWithValue }) => {
    try {
      const response = await axiosGet(
        `/gmail/mailbox/drafts/by-message/${encodeURIComponent(messageId)}`
      );
      return (response.data?.data?.draftId ?? null) as string | null;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to open draft"));
    }
  }
);

export const downloadGmailAttachmentById = createAsyncThunk(
  "gmail/downloadAttachmentById",
  async (
    args: { messageId: string; attachmentId: string; filename: string; mimeType: string },
    { rejectWithValue }
  ) => {
    try {
      const response = await axiosGet(
        `/gmail/mailbox/messages/${encodeURIComponent(args.messageId)}/attachments/${encodeURIComponent(args.attachmentId)}`,
        {
          params: { filename: args.filename, mimeType: args.mimeType },
          responseType: "blob",
        }
      );
      return response.data as Blob;
    } catch (error: any) {
      return rejectWithValue(apiError(error, "Failed to download attachment"));
    }
  }
);


// ==============================
// 🔵 Get All Messages
// ==============================


export const getGmailMessageDetails = createAsyncThunk(
  "gmail/getDetails",
  async (messageId: string, { dispatch, rejectWithValue }) => {
    console.log("messageId", messageId);
    try {
      const tokenResponse = await dispatch(
        getGoogleAccessToken()
      ).unwrap();
      console.log("tokenResponse", tokenResponse);

      const accessToken = tokenResponse as string;

      console.log("accessToken", accessToken);

      const response = await axiosGet("/gmail/message/" + messageId, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      console.log("response getGmailMessageDetailsssss", response.data);

      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch message details"
      );
    }
  }
);

// ==============================
// 🔵 Auto-Create Applications from Emails
// ==============================
export const autoCreateApplications = createAsyncThunk(
  "gmail/autoCreateApplications",
  async (params: { messageId?: string } | void, { dispatch, rejectWithValue }) => {
    try {
      const accessToken = await dispatch(getGoogleAccessToken()).unwrap();

      // Get current userId from localStorage.user (backend expects userId)
      let userId: string | undefined;
      try {
        const stored = localStorage.getItem("user");
        if (stored) {
          const parsed = JSON.parse(stored) as { _id?: string } | null;
          userId = parsed?._id || undefined;
        }
      } catch {
        // ignore JSON/localStorage errors
      }

      const response = await axiosPost("/gmail/auto-create-applications", {
        accessToken,
        userId,
        messageId: params && typeof params === "object" ? params.messageId : undefined,
      });

      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to auto-create applications from emails"
      );
    }
  }
);

// ==============================
// 🏷️ Label Gmail message in-crm
// ==============================
export const markGmailMessageInCrmLabel = createAsyncThunk(
  "gmail/markMessageInCrmLabel",
  async (messageId: string, { dispatch, rejectWithValue }) => {
    try {
      const accessToken = await dispatch(getGoogleAccessToken()).unwrap();
      const response = await axiosPost(`/gmail/message/${messageId}/in-crm`, {
        accessToken,
      });
      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to label Gmail message in-crm",
      );
    }
  },
);

// ==============================
// 🔵 Send Email (Compose)
// ==============================
export const sendGmailCompose = createAsyncThunk(
  "gmail/sendCompose",
  async (payload: SendGmailOptions, { dispatch, rejectWithValue }) => {
    try {
      const accessToken = await dispatch(getGoogleAccessToken()).unwrap();

      const response = await axiosPost("/gmail/send", {
        accessToken,
        ...payload,
      });

      return response.data;
    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to send email"
      );
    }
  }
);

/** Parse filename from Content-Disposition (quoted, unquoted, or RFC 5987 filename*). */
function parseFilenameFromContentDisposition(header: string | undefined): string | null {
  if (!header || typeof header !== "string") return null;
  const star = header.match(/filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\s]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].replace(/^["']|["']$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const quoted = header.match(/filename\s*=\s*"((?:\\.|[^"\\])*)"/i);
  if (quoted?.[1]) return quoted[1].replace(/\\(.)/g, "$1");
  const single = header.match(/filename\s*=\s*'([^']*)'/i);
  if (single?.[1]) return single[1];
  const plain = header.match(/filename\s*=\s*([^;\s]+)/i);
  if (plain?.[1]) return plain[1].replace(/^["']|["']$/g, "");
  return null;
}

// ==============================
// 🔵 Get Attachments
// ==============================

export const getGmailAttachments = createAsyncThunk(
  "gmail/getAttachments",
  async (messageId: string, { dispatch, rejectWithValue }) => {
    try {
      // 1️⃣ Get fresh access token
      const accessToken = await dispatch(
        getGoogleAccessToken()
      ).unwrap();

      // 2️⃣ Call API (token in header, NOT body)
      const response = await axiosPost(
        "/gmail/attachment",
        { messageId }, // ✅ only messageId
        {
          responseType: "blob", // 🔥 required for file
          headers: {
            Authorization: `Bearer ${accessToken}`, // ✅ correct way
          },
        }
      );

      // Filename from header (requires CORS exposedHeaders Content-Disposition on the API)
      const rawCd =
        response.headers["content-disposition"] ||
        (response.headers as any)["Content-Disposition"];
      const fromHeader = parseFilenameFromContentDisposition(rawCd);
      const filename = fromHeader?.trim() || "attachment";

      return {
        blob: response.data,
        filename,
      };

    } catch (error: any) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch attachments"
      );
    }
  }
);
