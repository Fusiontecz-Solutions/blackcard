import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import {
  syncGmail,
  getGmailMessageDetails,
  getGmailAttachments,
  autoCreateApplications,
  sendGmailCompose,
  fetchGmailConnection,
  fetchGmailLabels,
  fetchGmailThread,
  modifyGmailMessages,
  trashGmailMessages,
  untrashGmailMessages,
  sendGmailMailboxEmail,
} from '../actions/gmailActions';
import type { GmailLabel, GmailMailboxLabel } from '../actions/gmailActions';


// ===============================
// 🔵 Types
// ===============================
interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  cc?: string;
  internalDate?: number;
  labelIds?: string[];
  isRead?: boolean;
  isStarred?: boolean;
  hasAttachment?: boolean;
  /** Conversation rows: every message id in the thread. */
  messageIds?: string[];
  messageCount?: number;
  senders?: string[];
  hasDraft?: boolean;
}

const rowMatches = (m: GmailMessage, idSet: Set<string>) =>
  idSet.has(m.id) || Boolean(m.messageIds?.some((id) => idSet.has(id)));

function applyLabelChange<T extends { labelIds?: string[] }>(
  item: T,
  add: string[],
  remove: string[],
): T {
  const next = new Set(item.labelIds ?? []);
  remove.forEach((id) => next.delete(id));
  add.forEach((id) => next.add(id));
  const labelIds = Array.from(next);
  return {
    ...item,
    labelIds,
    isRead: !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
  };
}

interface GmailState {
  // List
  loadingList: boolean;
  messages: GmailMessage[];
  listError: string | null;
  nextPageToken: string | null;
  activeLabel: GmailLabel;

  // Detail
  loadingDetail: boolean;
  selectedMessage: any | null;
  detailError: string | null;

  // Attachments
  loadingAttachments: boolean;
  attachments: any[];
  attachmentError: string | null;

  // Sync
  syncing: boolean;
  syncSuccess: boolean;
  syncError: string | null;

  // Gmail OAuth connection (from /gmail/me)
  gmailConnected: boolean;
  gmailEmail: string | null;
  crmEmail: string | null;
  connectionLoading: boolean;
  connectionChecked: boolean;
  connectionError: string | null;

  // Auto-create applications
  autoCreating: boolean;
  autoCreateResults: any[];
  autoCreateTotal: number;
  autoCreateMessage: string | null;
  autoCreateError: string | null;

  // Compose/send email
  sendingEmail: boolean;
  sendEmailSuccess: boolean;
  sendEmailError: string | null;
  sentEmailResponse: any | null;

  // Mailbox
  syncingLabel: string | null;
  labels: GmailMailboxLabel[];
  labelsLoading: boolean;
  thread: { id: string; messages: any[] } | null;
  threadLoading: boolean;
  threadError: string | null;
}

const initialState: GmailState = {
  loadingList: false,
  messages: [],
  listError: null,
  nextPageToken: null,
  activeLabel: 'INBOX',

  loadingDetail: false,
  selectedMessage: null,
  detailError: null,

  loadingAttachments: false,
  attachments: [],
  attachmentError: null,

  syncing: false,
  syncSuccess: false,
  syncError: null,

  gmailConnected: false,
  gmailEmail: null,
  crmEmail: null,
  connectionLoading: false,
  connectionChecked: false,
  connectionError: null,

  autoCreating: false,
  autoCreateResults: [],
  autoCreateTotal: 0,
  autoCreateMessage: null,
  autoCreateError: null,

  sendingEmail: false,
  sendEmailSuccess: false,
  sendEmailError: null,
  sentEmailResponse: null,

  syncingLabel: null,
  labels: [],
  labelsLoading: false,
  thread: null,
  threadLoading: false,
  threadError: null,
};


// ===============================
// 🔵 Slice
// ===============================
export const gmailSlice = createSlice({
  name: 'gmail',
  initialState,
  reducers: {
    clearGmailErrors: (state) => {
      state.listError = null;
      state.detailError = null;
      state.attachmentError = null;
      state.syncError = null;
    },

    clearSelectedMessage: (state) => {
      state.selectedMessage = null;
      state.attachments = [];
    },

    clearAttachments: (state) => {
      state.attachments = [];
      state.attachmentError = null;
    },

    resetSyncStatus: (state) => {
      state.syncSuccess = false;
      state.syncError = null;
    },

    setActiveLabel: (state, action: PayloadAction<GmailLabel>) => {
      state.activeLabel = action.payload;
      state.messages = [];          // clear when switching label
      state.nextPageToken = null;
    },

    clearAutoCreateStatus: (state) => {
      state.autoCreateResults = [];
      state.autoCreateTotal = 0;
      state.autoCreateMessage = null;
      state.autoCreateError = null;
    },

    resetSendEmailStatus: (state) => {
      state.sendingEmail = false;
      state.sendEmailSuccess = false;
      state.sendEmailError = null;
      state.sentEmailResponse = null;
    },

    clearThread: (state) => {
      state.thread = null;
      state.threadError = null;
    },
  },

  extraReducers: (builder) => {
    builder

      // ===============================
      // 🔵 Sync Gmail
      // ===============================
      .addCase(syncGmail.pending, (state, action) => {
        state.syncing = true;
        state.syncingLabel = action.meta.arg?.label ?? null;
        if (!action.meta.arg?.silent) state.loadingList = true;
        state.listError = null;
        state.syncError = null;
        state.syncSuccess = false;
      })

      .addCase(syncGmail.fulfilled, (state, action) => {
        // 🔒 Stale-response guard: if the user already switched to a
        //    different label, discard the outdated response entirely.
        const requestedLabel = action.meta.arg?.label;
        if (requestedLabel && requestedLabel !== state.activeLabel) {
          if (state.syncingLabel === requestedLabel) {
            state.syncing = false;
            state.syncingLabel = null;
          }
          return;
        }

        state.syncing = false;
        state.syncingLabel = null;
        state.loadingList = false;
        state.syncSuccess = true;
        state.syncError = null;
        state.listError = null;

        // Backend returns { success, data: messages[], nextPageToken }
        const raw = action.payload;
        const data = raw?.data ?? raw;
        const newMessages: GmailMessage[] = Array.isArray(data)
          ? data
          : (data?.messages ?? []);
        const nextToken: string | null =
          raw?.nextPageToken ?? data?.nextPageToken ?? null;

        // pageToken present → "Load More" → append
        // no pageToken      → fresh fetch / refresh → replace
        if (action.meta.arg?.pageToken) {
          const seen = new Set(state.messages.map((m) => m.id));
          state.messages = [
            ...state.messages,
            ...newMessages.filter((m) => !seen.has(m.id)),
          ];
        } else {
          state.messages = newMessages;
        }
        state.nextPageToken = nextToken;
      })

      .addCase(syncGmail.rejected, (state, action) => {
        // Stale guard – don't overwrite if label already changed
        const requestedLabel = action.meta.arg?.label;
        if (requestedLabel && requestedLabel !== state.activeLabel) {
          if (state.syncingLabel === requestedLabel) {
            state.syncing = false;
            state.syncingLabel = null;
          }
          return;
        }

        state.syncing = false;
        state.syncingLabel = null;
        state.loadingList = false;
        if (action.meta.arg?.silent) return;
        const errMsg = action.payload as string;
        state.syncError = errMsg;
        state.syncSuccess = false;

        // Keep last good inbox when still connected — don't flip to "connect" UI
        if (state.gmailConnected || state.messages.length > 0) {
          state.listError = null;
        } else {
          state.listError = errMsg;
        }
      })

      // ===============================
      // 🔵 Gmail connection status
      // ===============================
      .addCase(fetchGmailConnection.pending, (state) => {
        state.connectionLoading = true;
        state.connectionError = null;
      })
      .addCase(fetchGmailConnection.fulfilled, (state, action) => {
        state.connectionLoading = false;
        state.connectionChecked = true;
        state.gmailConnected = action.payload.connected;
        state.gmailEmail = action.payload.gmailEmail;
        state.crmEmail = action.payload.crmEmail;
        if (!action.payload.connected) {
          state.listError = null;
        }
      })
      .addCase(fetchGmailConnection.rejected, (state, action) => {
        state.connectionLoading = false;
        state.connectionChecked = true;
        state.connectionError = action.payload as string;
        state.gmailConnected = false;
      })


      // ===============================
      // 🔵 Get Gmail Message Details
      // ===============================
      .addCase(getGmailMessageDetails.pending, (state) => {
        state.loadingDetail = true;
        state.detailError = null;
      })
      .addCase(getGmailMessageDetails.fulfilled, (state, action) => {
        state.loadingDetail = false;
        state.selectedMessage = action.payload.data || action.payload;
      })
      .addCase(getGmailMessageDetails.rejected, (state, action) => {
        state.loadingDetail = false;
        state.detailError = action.payload as string;
      })


      // ===============================
      // 🔵 Get Gmail Attachments
      // ===============================
      .addCase(getGmailAttachments.pending, (state) => {
        state.loadingAttachments = true;
        state.attachmentError = null;
      })
      .addCase(getGmailAttachments.fulfilled, (state, action) => {
        state.loadingAttachments = false;
        state.attachments =
          (action.payload as any).attachments || action.payload || [];
      })
      .addCase(getGmailAttachments.rejected, (state, action) => {
        state.loadingAttachments = false;
        state.attachmentError = action.payload as string;
      })


      // ===============================
      // 🔵 Auto-Create Applications
      // ===============================
      .addCase(autoCreateApplications.pending, (state) => {
        state.autoCreating = true;
        state.autoCreateError = null;
        state.autoCreateMessage = null;
      })
      .addCase(autoCreateApplications.fulfilled, (state, action) => {
        state.autoCreating = false;
        const raw = action.payload;
        const payload = raw?.data ?? raw;
        state.autoCreateResults = payload?.data ?? [];
        state.autoCreateTotal = payload?.total ?? 0;
        state.autoCreateMessage = payload?.message ?? 'Applications created successfully';
      })
      .addCase(autoCreateApplications.rejected, (state, action) => {
        state.autoCreating = false;
        state.autoCreateError = action.payload as string;
      })

      // ===============================
      // 🔵 Gmail Compose / Send
      // ===============================
      .addCase(sendGmailCompose.pending, (state) => {
        state.sendingEmail = true;
        state.sendEmailSuccess = false;
        state.sendEmailError = null;
      })
      .addCase(sendGmailCompose.fulfilled, (state, action) => {
        state.sendingEmail = false;
        state.sendEmailSuccess = true;
        state.sentEmailResponse = action.payload?.data ?? action.payload;
      })
      .addCase(sendGmailCompose.rejected, (state, action) => {
        state.sendingEmail = false;
        state.sendEmailSuccess = false;
        state.sendEmailError = action.payload as string;
      })

      // ===============================
      // 📬 Mailbox
      // ===============================
      .addCase(sendGmailMailboxEmail.pending, (state) => {
        state.sendingEmail = true;
        state.sendEmailSuccess = false;
        state.sendEmailError = null;
      })
      .addCase(sendGmailMailboxEmail.fulfilled, (state, action) => {
        state.sendingEmail = false;
        state.sendEmailSuccess = true;
        state.sentEmailResponse = action.payload ?? null;
      })
      .addCase(sendGmailMailboxEmail.rejected, (state, action) => {
        state.sendingEmail = false;
        state.sendEmailSuccess = false;
        state.sendEmailError = action.payload as string;
      })

      .addCase(fetchGmailLabels.pending, (state) => {
        state.labelsLoading = true;
      })
      .addCase(fetchGmailLabels.fulfilled, (state, action) => {
        state.labelsLoading = false;
        state.labels = action.payload;
      })
      .addCase(fetchGmailLabels.rejected, (state) => {
        state.labelsLoading = false;
      })

      .addCase(fetchGmailThread.pending, (state, action) => {
        state.threadLoading = true;
        state.threadError = null;
        if (state.thread?.id !== action.meta.arg) state.thread = null;
      })
      .addCase(fetchGmailThread.fulfilled, (state, action) => {
        state.threadLoading = false;
        state.thread = action.payload ?? null;
      })
      .addCase(fetchGmailThread.rejected, (state, action) => {
        state.threadLoading = false;
        state.threadError = action.payload as string;
      })

      // Optimistic updates — the page re-syncs if the Gmail call fails.
      .addCase(modifyGmailMessages.pending, (state, action) => {
        const { ids, addLabelIds = [], removeLabelIds = [] } = action.meta.arg;
        const idSet = new Set(ids);
        const leavesView =
          state.activeLabel !== 'ALL' && removeLabelIds.includes(state.activeLabel);
        state.messages = state.messages
          .filter((m) => !(leavesView && rowMatches(m, idSet)))
          .map((m) => (rowMatches(m, idSet) ? applyLabelChange(m, addLabelIds, removeLabelIds) : m));
        if (state.thread) {
          state.thread.messages = state.thread.messages.map((m: any) =>
            idSet.has(m.id) ? applyLabelChange(m, addLabelIds, removeLabelIds) : m,
          );
        }
        if (state.selectedMessage && idSet.has(state.selectedMessage.id)) {
          state.selectedMessage = applyLabelChange(state.selectedMessage, addLabelIds, removeLabelIds);
        }
      })
      .addCase(trashGmailMessages.pending, (state, action) => {
        const idSet = new Set(action.meta.arg);
        if (state.activeLabel !== 'TRASH') {
          state.messages = state.messages.filter((m) => !rowMatches(m, idSet));
        }
      })
      .addCase(untrashGmailMessages.pending, (state, action) => {
        const idSet = new Set(action.meta.arg);
        if (state.activeLabel === 'TRASH') {
          state.messages = state.messages.filter((m) => !rowMatches(m, idSet));
        }
      });
  },
});


// ===============================
// 🔵 Export Actions
// ===============================
export const {
  clearGmailErrors,
  clearSelectedMessage,
  clearAttachments,
  resetSyncStatus,
  setActiveLabel,
  clearAutoCreateStatus,
  resetSendEmailStatus,
  clearThread,
} = gmailSlice.actions;

export default gmailSlice.reducer;
