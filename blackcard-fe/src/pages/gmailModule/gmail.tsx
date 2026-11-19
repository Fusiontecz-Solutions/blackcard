import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { toast } from 'react-toastify';
import {
  getGmailMessageDetails,
  getGmailAttachments,
  syncGmail,
  fetchGmailConnection,
  markGmailMessageInCrmLabel,
  fetchGmailLabels,
  createGmailLabel,
  renameGmailLabel,
  deleteGmailLabel,
  modifyGmailMessages,
  trashGmailMessages,
  untrashGmailMessages,
  fetchGmailThread,
  findGmailDraftByMessage,
  downloadGmailAttachmentById,
} from '@/redux/actions/gmailActions';
import { parseApplicationPdfForClientPrefill } from '@/redux/actions/applicationActions';
import { getIsos } from '@/redux/actions/isoActions';
import type { GmailLabel, GmailMailboxLabel } from '@/redux/actions/gmailActions';
import { setActiveLabel, clearThread } from '@/redux/slices/gmailSlice';
import type { RootState, AppDispatch } from '@/redux/store';
import {
  Menu, Plus, Inbox, File, Send as SendIcon,
  RefreshCw, ChevronLeft, ChevronRight, X, MailX,
  Paperclip,
  ArrowLeft, AlertCircle, Mail, User, ExternalLink,
  Search,
  Loader2,
  LogOut,
  Star, Archive, ArchiveRestore, Trash2, MailOpen, ShieldAlert, ShieldCheck,
  Tag, Layers, Square, SquareCheck, SquareMinus, EllipsisVertical, Pencil, FilePlus,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import GmailComposeWindow from './GmailComposeWindow';
import GmailNewTemplateDialog from './GmailNewTemplateDialog';
import GmailThreadMessage from './GmailThreadMessage';
import {
  buildComposeFromDraft,
  buildComposeFromMessage,
  displayName,
  formatListDate,
  type ComposeInitial,
  type MessageAttachment,
} from './gmailUtils';

const IN_CRM_LABEL_NAME = 'in-crm';
const LIST_POLL_INTERVAL_MS = 30_000;

const SYSTEM_LABEL_TITLES: Record<string, string> = {
  INBOX: 'Inbox',
  STARRED: 'Starred',
  IMPORTANT: 'Important',
  SENT: 'Sent',
  DRAFT: 'Drafts',
  ALL: 'All Mail',
  SPAM: 'Spam',
  TRASH: 'Trash',
};
import { buildGoogleOAuthConnectUrl } from '@/lib/googleOAuth';

function isGmailReconnectNeeded(message: string | null | undefined): boolean {
  const m = String(message || '').toLowerCase();
  return (
    m.includes('invalid authentication credentials') ||
    m.includes('invalid_grant') ||
    m.includes('reconnect google') ||
    m.includes('gmail connection expired') ||
    m.includes('gmail is not connected')
  );
}
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { logout } from '@/redux/actions/authActions';
import type { user as SessionUser } from '@/redux/slices/authSlice';
import { clearApplicationStats } from '@/redux/slices/applicationSlice';
import { clearPaymentDashboard } from '@/redux/slices/paymentDashboardSlice';
import { resetOperationsDashboard } from '@/redux/slices/operationsDashboardSlice';
import { clearVoiceMicSessionFlags } from '@/voice/microphoneWarmup';
import { clearCrmCacheOnLogout } from '@/lib/crmCache';


const IconButton = ({ icon, className = "", onClick, title }: { icon: React.ReactNode, className?: string, onClick?: React.MouseEventHandler<HTMLButtonElement>, title?: string }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    onClick={onClick}
    className={`p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors flex items-center justify-center ${className}`}
  >
    {icon}
  </button>
);

// Extract a specific header (e.g., Subject, From, Date) from Gmail payload headers
const getHeaderValue = (headers: any[] | undefined, name: string): string => {
  if (!headers) return '';
  const h = headers.find(
    (hdr) => typeof hdr.name === 'string' && hdr.name.toLowerCase() === name.toLowerCase(),
  );
  return h?.value || '';
};

const extractEmailFromFromHeader = (fromHeader: string): string => {
  const raw = String(fromHeader || '').trim();
  if (!raw) return '';
  const angleMatch = raw.match(/<([^>]+)>/);
  return String(angleMatch?.[1] || raw).trim().toLowerCase();
};

// Walk the payload tree to extract attachment metadata (filename, size, mimeType)
type AttachmentMeta = { filename: string; mimeType: string; size: number; attachmentId: string };

const getAttachmentsFromPayload = (payload: any): AttachmentMeta[] => {
  const results: AttachmentMeta[] = [];
  const walk = (part: any) => {
    if (!part) return;
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      results.push({
        filename: part.filename,
        mimeType: part.mimeType || 'application/octet-stream',
        size: part.body.size || 0,
        attachmentId: part.body.attachmentId,
      });
    }
    if (Array.isArray(part.parts)) {
      for (const p of part.parts) walk(p);
    }
  };
  walk(payload);
  return results;
};

const GoogleOAuthButton = ({
  onClick,
  className = '',
}: {
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`flex items-center justify-center gap-3 py-2.5 px-4 rounded-full border border-gray-300 bg-white hover:bg-gray-50 text-sm font-semibold text-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 cursor-pointer ${className}`}
  >
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
    Connect to Gmail
  </button>
);

const GmailPage = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const {
    messages,
    selectedMessage,
    loadingList,
    loadingDetail,
    detailError,
    syncError,
    nextPageToken,
    activeLabel,
    autoCreating,
    gmailConnected,
    gmailEmail,
    connectionLoading,
    connectionChecked,
    labels,
    thread,
    threadLoading,
  } = useSelector((state: RootState) => state.gmail);
  const { data: loginData } = useSelector((state: RootState) => state.login);
  const userRole =
    loginData?.user?.role ||
    (typeof window !== "undefined" ? localStorage.getItem("role") : "") ||
    "";
  const isOperationsRole =
    String(userRole || "").replace(/-/g, "_").toUpperCase() === "OPERATIONS";
  const isAdminRole = ["ADMIN", "SUPER_ADMIN"].includes(
    String(userRole || "").replace(/-/g, "_").toUpperCase(),
  );

  // View States
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Compose (one window at a time, like Gmail's default)
  const [compose, setCompose] = useState<ComposeInitial | null>(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [isBypassProcessing, setIsBypassProcessing] = useState(false);
  const sendToCrmInFlightRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState('');
  /** Query submitted with Enter — searched server-side in Gmail. */
  const [activeQuery, setActiveQuery] = useState('');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [loadedMorePages, setLoadedMorePages] = useState(false);
  const [labelDialog, setLabelDialog] = useState<
    { mode: 'create' } | { mode: 'rename'; label: GmailMailboxLabel } | null
  >(null);
  const [labelDialogName, setLabelDialogName] = useState('');
  const [isAccountSwitcherOpen, setIsAccountSwitcherOpen] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    const u = loginData?.user;
    if (u && typeof u === 'object' && (u as SessionUser)?.email) {
      setSessionUser(u as SessionUser);
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const parsed = JSON.parse(raw) as SessionUser;
        if (parsed?.email) setSessionUser(parsed);
        else setSessionUser(null);
      } else setSessionUser(null);
    } catch {
      setSessionUser(null);
    }
  }, [loginData]);

  const accountInitials = useMemo(() => {
    const fn = String(sessionUser?.firstName || '').trim();
    const ln = String(sessionUser?.lastName || '').trim();
    if (fn && ln) return `${fn[0]!}${ln[0]!}`.toUpperCase();
    if (fn.length >= 2) return fn.slice(0, 2).toUpperCase();
    if (fn.length === 1) return fn.toUpperCase();
    const em = String(sessionUser?.email || '').trim();
    if (em.length >= 2) return em.slice(0, 2).toUpperCase();
    return 'U';
  }, [sessionUser]);

  const accountDisplayName = useMemo(() => {
    const fn = String(sessionUser?.firstName || '').trim();
    const ln = String(sessionUser?.lastName || '').trim();
    const full = `${fn} ${ln}`.trim();
    if (full) return full;
    return sessionUser?.email || 'User';
  }, [sessionUser]);

  const accountEmail = sessionUser?.email?.trim() || '';

  const [signingOut, setSigningOut] = useState(false);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    // Submitted searches are already filtered by Gmail (including message bodies).
    if (!q || searchQuery.trim() === activeQuery) return messages;
    return messages.filter((m: any) => {
      const from = String(m?.from || '').toLowerCase();
      const to = String(m?.to || '').toLowerCase();
      const subject = String(m?.subject || '').toLowerCase();
      const snippet = String(m?.snippet || '').toLowerCase();
      return from.includes(q) || to.includes(q) || subject.includes(q) || snippet.includes(q);
    });
  }, [messages, searchQuery, activeQuery]);

  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  /** List rows are conversations — actions target every message in the thread. */
  const expandRowIds = (rowIds: string[]) =>
    Array.from(new Set(rowIds.flatMap((id) => messagesById.get(id)?.messageIds ?? [id])));

  const formatSenders = (m: { senders?: string[]; from?: string; messageCount?: number }) => {
    const me = String(gmailEmail || '').toLowerCase();
    const names: string[] = [];
    (m.senders?.length ? m.senders : [m.from || '']).forEach((from) => {
      const email = extractEmailFromFromHeader(from);
      const name = me && email === me ? 'me' : displayName(from).split(' ')[0] || email;
      if (name && !names.includes(name)) names.push(name);
    });
    const label =
      names.length === 1 && names[0] !== 'me'
        ? displayName((m.senders?.length ? m.senders[0] : m.from) || '')
        : names.join(', ');
    return { label: label || 'Unknown', count: (m.messageCount ?? 0) > 1 ? m.messageCount : undefined };
  };
  const labelById = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const inCrmLabelId = useMemo(
    () => labels.find((l) => l.name.trim().toLowerCase() === IN_CRM_LABEL_NAME)?.id ?? null,
    [labels],
  );
  const userLabels = useMemo(
    () =>
      labels
        .filter((l) => l.type === 'user')
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [labels],
  );
  const activeLabelTitle =
    SYSTEM_LABEL_TITLES[activeLabel] ?? labelById.get(activeLabel)?.name ?? String(activeLabel);

  useEffect(() => {
    dispatch(fetchGmailConnection());
  }, [dispatch]);

  const refreshLabels = useCallback(() => {
    void dispatch(fetchGmailLabels());
  }, [dispatch]);

  const refreshList = useCallback(
    (options?: { silent?: boolean }) => {
      setLoadedMorePages(false);
      void dispatch(
        syncGmail({ label: activeLabel, query: activeQuery || undefined, silent: options?.silent }),
      );
    },
    [dispatch, activeLabel, activeQuery],
  );

  useEffect(() => {
    if (!connectionChecked || connectionLoading) return;
    if (!gmailConnected) return;
    setCheckedIds(new Set());
    refreshList();
  }, [connectionChecked, connectionLoading, gmailConnected, refreshList]);

  useEffect(() => {
    if (gmailConnected) refreshLabels();
  }, [gmailConnected, refreshLabels]);

  // Gmail-like freshness: poll the first page + counts while the tab is visible.
  const pollStateRef = useRef({ viewMode, loadedMorePages, checked: 0 });
  pollStateRef.current = { viewMode, loadedMorePages, checked: checkedIds.size };
  useEffect(() => {
    if (!gmailConnected) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      refreshLabels();
      const s = pollStateRef.current;
      if (s.viewMode === 'list' && !s.loadedMorePages && s.checked === 0) {
        refreshList({ silent: true });
      }
    }, LIST_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [gmailConnected, refreshList, refreshLabels]);

  const handleLoadMore = () => {
    if (!nextPageToken) return;
    setLoadedMorePages(true);
    dispatch(syncGmail({ label: activeLabel, pageToken: nextPageToken, query: activeQuery || undefined }));
  };

  const handleLabelChange = (label: GmailLabel) => {
    dispatch(setActiveLabel(label));
    dispatch(clearThread());
    setViewMode('list');
    setSelectedMessageId(null);
    setCheckedIds(new Set());
    setSearchQuery('');
    setActiveQuery('');
  };

  const submitSearch = () => {
    const q = searchQuery.trim();
    if (q === activeQuery) {
      refreshList();
      return;
    }
    setActiveQuery(q);
    setViewMode('list');
    setSelectedMessageId(null);
  };

  const sidebarItems: { icon: any; label: string; value: GmailLabel; count?: number }[] = [
    { icon: Inbox, label: 'Inbox', value: 'INBOX', count: labelById.get('INBOX')?.threadsUnread },
    { icon: Star, label: 'Starred', value: 'STARRED' },
    { icon: AlertCircle, label: 'Important', value: 'IMPORTANT' },
    { icon: SendIcon, label: 'Sent', value: 'SENT' },
    { icon: File, label: 'Drafts', value: 'DRAFT', count: labelById.get('DRAFT')?.messagesTotal },
    { icon: Layers, label: 'All Mail', value: 'ALL' },
    { icon: ShieldAlert, label: 'Spam', value: 'SPAM', count: labelById.get('SPAM')?.threadsUnread },
    { icon: Trash2, label: 'Trash', value: 'TRASH' },
  ];

  // ---------- Selection ----------
  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allVisibleChecked =
    filteredMessages.length > 0 && filteredMessages.every((m) => checkedIds.has(m.id));
  const toggleAllChecked = () => {
    setCheckedIds(allVisibleChecked ? new Set() : new Set(filteredMessages.map((m) => m.id)));
  };

  // ---------- Mailbox actions ----------
  type MailAction =
    | 'archive' | 'inbox' | 'trash' | 'untrash' | 'spam' | 'notSpam'
    | 'read' | 'unread' | 'star' | 'unstar';

  /** Archive/trash/spam pull mail out of INBOX, which the CRM auto-create cron scans. */
  const confirmCrmGuard = (ids: string[], verb: string) => {
    const pending = ids
      .map((id) => messagesById.get(id))
      .filter(
        (m) =>
          m?.hasAttachment &&
          m.labelIds?.includes('INBOX') &&
          !(inCrmLabelId && m.labelIds?.includes(inCrmLabelId)),
      );
    if (pending.length === 0) return true;
    const one = pending.length === 1;
    return window.confirm(
      `${one ? 'This email has' : `${pending.length} emails have`} attachments and ${one ? "hasn't" : "haven't"} been sent to CRM yet.\n\n` +
        `${verb} removes ${one ? 'it' : 'them'} from the Inbox, so CRM auto-create won't pick ${one ? 'it' : 'them'} up. Continue?`,
    );
  };

  const performAction = async (ids: string[], action: MailAction) => {
    switch (action) {
      case 'archive':
        return dispatch(modifyGmailMessages({ ids, removeLabelIds: ['INBOX'] })).unwrap();
      case 'inbox':
        return dispatch(modifyGmailMessages({ ids, addLabelIds: ['INBOX'] })).unwrap();
      case 'trash':
        return dispatch(trashGmailMessages(ids)).unwrap();
      case 'untrash':
        return dispatch(untrashGmailMessages(ids)).unwrap();
      case 'spam':
        return dispatch(modifyGmailMessages({ ids, addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] })).unwrap();
      case 'notSpam':
        return dispatch(modifyGmailMessages({ ids, addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] })).unwrap();
      case 'read':
        return dispatch(modifyGmailMessages({ ids, removeLabelIds: ['UNREAD'] })).unwrap();
      case 'unread':
        return dispatch(modifyGmailMessages({ ids, addLabelIds: ['UNREAD'] })).unwrap();
      case 'star':
        return dispatch(modifyGmailMessages({ ids, addLabelIds: ['STARRED'] })).unwrap();
      case 'unstar':
        return dispatch(modifyGmailMessages({ ids, removeLabelIds: ['STARRED'] })).unwrap();
    }
  };

  const UNDO: Partial<Record<MailAction, MailAction>> = {
    archive: 'inbox',
    trash: 'untrash',
    spam: 'notSpam',
    notSpam: 'spam',
    untrash: 'trash',
  };
  const DONE_MESSAGE: Partial<Record<MailAction, string>> = {
    archive: 'Archived',
    inbox: 'Moved to Inbox',
    trash: 'Moved to Trash',
    untrash: 'Restored',
    spam: 'Reported as spam',
    notSpam: 'Moved to Inbox (not spam)',
    unread: 'Marked as unread',
  };

  const runMailAction = async (ids: string[], action: MailAction) => {
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return;
    if (action === 'archive' && !confirmCrmGuard(unique, 'Archiving')) return;
    if (action === 'trash' && !confirmCrmGuard(unique, 'Moving to Trash')) return;
    if (action === 'spam' && !confirmCrmGuard(unique, 'Reporting spam')) return;

    const leavesDetail = ['archive', 'trash', 'untrash', 'spam', 'notSpam', 'unread'].includes(action);
    if (viewMode === 'detail' && leavesDetail) {
      setViewMode('list');
      setSelectedMessageId(null);
    }
    setCheckedIds(new Set());

    try {
      await performAction(unique, action);
      refreshLabels();
      const doneText = DONE_MESSAGE[action];
      const undo = UNDO[action];
      if (doneText) {
        const count = unique.length > 1 ? ` (${unique.length})` : '';
        toast.info(
          <span className="flex items-center gap-3">
            {doneText}{count}
            {undo && (
              <button
                type="button"
                className="font-semibold underline"
                onClick={() => {
                  void performAction(unique, undo)
                    .then(() => {
                      refreshList({ silent: true });
                      refreshLabels();
                    })
                    .catch(() => toast.error('Undo failed'));
                }}
              >
                Undo
              </button>
            )}
          </span>,
          { autoClose: 5000 },
        );
      }
      if (['inbox', 'untrash', 'notSpam'].includes(action) && activeLabel !== 'INBOX') {
        refreshList({ silent: true });
      }
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Gmail action failed');
      refreshList({ silent: true });
    }
  };

  const applyLabelToMessages = async (ids: string[], labelId: string, add: boolean) => {
    if (ids.length === 0) return;
    try {
      await dispatch(
        modifyGmailMessages(add ? { ids, addLabelIds: [labelId] } : { ids, removeLabelIds: [labelId] }),
      ).unwrap();
      refreshLabels();
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Failed to update label');
      refreshList({ silent: true });
    }
  };

  // ---------- Labels ----------
  const openCreateLabel = () => {
    setLabelDialogName('');
    setLabelDialog({ mode: 'create' });
  };

  const submitLabelDialog = async () => {
    const name = labelDialogName.trim();
    if (!name || !labelDialog) return;
    try {
      if (labelDialog.mode === 'create') {
        await dispatch(createGmailLabel(name)).unwrap();
        toast.success(`Label "${name}" created`);
      } else {
        await dispatch(renameGmailLabel({ labelId: labelDialog.label.id, name })).unwrap();
        toast.success('Label renamed');
      }
      setLabelDialog(null);
      refreshLabels();
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Label update failed');
    }
  };

  const handleDeleteLabel = async (label: GmailMailboxLabel) => {
    if (!window.confirm(`Delete the label "${label.name}"? Emails with this label won't be deleted.`)) return;
    try {
      await dispatch(deleteGmailLabel(label.id)).unwrap();
      if (activeLabel === label.id) handleLabelChange('INBOX');
      refreshLabels();
      toast.info('Label deleted');
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Failed to delete label');
    }
  };

  // ---------- Compose / drafts ----------
  const openCompose = (initial: ComposeInitial) => {
    if (compose && !window.confirm('You have a message open. Replace it? (Close it first to keep it as a draft.)')) {
      return;
    }
    setCompose(initial);
  };

  const openNewCompose = () =>
    openCompose({ key: `new-${Date.now()}`, mode: 'new', to: '', cc: '', bcc: '', subject: '', bodyHtml: '<br>' });

  const handleReply = (message: any, mode: 'reply' | 'replyAll' | 'forward') =>
    openCompose(buildComposeFromMessage(message, mode, gmailEmail));

  const openDraftMessage = async (message: any) => {
    try {
      const draftId = await dispatch(findGmailDraftByMessage(message.id)).unwrap();
      if (!draftId) {
        toast.error('Draft not found — it may have been sent or deleted');
        refreshList({ silent: true });
        return;
      }
      openCompose(buildComposeFromDraft(message, draftId));
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Failed to open draft');
    }
  };

  const openDraftFromList = async (id: string, threadId: string) => {
    try {
      const t = await dispatch(fetchGmailThread(threadId)).unwrap();
      const message = t?.messages?.find((m: any) => m.id === id);
      if (!message) {
        toast.error('Draft not found — it may have been sent or deleted');
        refreshList({ silent: true });
        return;
      }
      await openDraftMessage(message);
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Failed to open draft');
    }
  };

  const handleComposeChanged = ({ threadId }: { type: string; threadId?: string }) => {
    refreshLabels();
    refreshList({ silent: true });
    const currentThreadId = thread?.id;
    if (viewMode === 'detail' && currentThreadId && (!threadId || threadId === currentThreadId)) {
      void dispatch(fetchGmailThread(currentThreadId));
    }
  };

  const handleDownloadAttachment = async (message: any, att: MessageAttachment) => {
    try {
      const blob = await dispatch(
        downloadGmailAttachmentById({
          messageId: message.id,
          attachmentId: att.attachmentId,
          filename: att.filename,
          mimeType: att.mimeType,
        }),
      ).unwrap();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename || 'attachment';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download attachment');
    }
  };

  /** Drafts view rows, or conversations that only contain a draft, open the composer. */
  const isDraftOnlyRow = (m: any) =>
    activeLabel === 'DRAFT' || (Boolean(m.hasDraft) && (m.messageCount ?? 0) === 0);

  const openListItem = (m: any) => {
    if (isDraftOnlyRow(m)) {
      void openDraftFromList(m.id, m.threadId);
      return;
    }
    void handleSelectMessage(m.id);
  };

  const handleSelectMessage = async (id: string) => {
    setSelectedMessageId(id);
    setViewMode('detail');

    const threadId = messagesById.get(id)?.threadId;
    if (threadId) {
      dispatch(fetchGmailThread(threadId))
        .unwrap()
        .then((t) => {
          const unread = (t?.messages ?? [])
            .filter((msg: any) => msg.labelIds?.includes('UNREAD'))
            .map((msg: any) => msg.id);
          if (unread.length > 0) {
            void dispatch(modifyGmailMessages({ ids: unread, removeLabelIds: ['UNREAD'] }))
              .unwrap()
              .then(refreshLabels)
              .catch(() => undefined);
          }
        })
        .catch(() => undefined);
    } else {
      dispatch(clearThread());
    }

    try {
      // Fetch message details
      await dispatch(getGmailMessageDetails(id)).unwrap();

      // Fetch attachments for the message
      try {
        await dispatch(getGmailAttachments(id)).unwrap();
      } catch (attachmentErr) {
        // Attachments are optional, so we don't show error if they fail
        console.warn('Failed to fetch attachments:', attachmentErr);
      }
    } catch (error) {
      console.error('Failed to fetch message details:', error);
    }
  };

  const threadMessages = useMemo(() => {
    const all = thread?.messages ?? [];
    if (activeLabel === 'TRASH') return all;
    return all.filter((m: any) => !m.labelIds?.includes('TRASH'));
  }, [thread, activeLabel]);

  const detailIds = useMemo(() => {
    const ids = threadMessages
      .filter((m: any) => !m.labelIds?.includes('DRAFT'))
      .map((m: any) => m.id as string);
    return ids.length > 0 ? ids : selectedMessageId ? [selectedMessageId] : [];
  }, [threadMessages, selectedMessageId]);

  const detailLabelIds = useMemo(() => {
    const set = new Set<string>();
    threadMessages.forEach((m: any) => (m.labelIds ?? []).forEach((id: string) => set.add(id)));
    if (set.size === 0 && selectedMessageId) {
      (messagesById.get(selectedMessageId)?.labelIds ?? []).forEach((id) => set.add(id));
    }
    return set;
  }, [threadMessages, selectedMessageId, messagesById]);

  const detailSubject = useMemo(() => {
    const first = threadMessages[0];
    const fromThread = first?.payload?.headers?.find(
      (h: any) => String(h?.name).toLowerCase() === 'subject',
    )?.value;
    return (
      fromThread ||
      (selectedMessageId ? messagesById.get(selectedMessageId)?.subject : '') ||
      '(no subject)'
    );
  }, [threadMessages, selectedMessageId, messagesById]);

  /** Label checkbox menu shared by the list toolbar and the conversation toolbar. */
  const renderLabelMenu = (ids: string[], labelSet: (labelId: string) => 'all' | 'some' | 'none') => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Labels"
          className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
        >
          <Tag size={18} className="opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 max-h-80 overflow-y-auto">
        <DropdownMenuLabel>Label as:</DropdownMenuLabel>
        {userLabels.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No labels yet</div>
        )}
        {userLabels.map((label) => {
          const state = labelSet(label.id);
          const lockedOn = label.protected && state === 'all';
          return (
            <DropdownMenuCheckboxItem
              key={label.id}
              checked={state === 'all' ? true : state === 'some' ? 'indeterminate' : false}
              disabled={lockedOn}
              onSelect={(e: Event) => e.preventDefault()}
              onCheckedChange={() => void applyLabelToMessages(ids, label.id, state !== 'all')}
            >
              <span className="truncate">{label.name}</span>
              {label.protected && <span className="ml-auto text-[10px] text-muted-foreground">CRM</span>}
            </DropdownMenuCheckboxItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={openCreateLabel}>
          <Plus size={14} /> Create new label
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const labelStateFor = (ids: string[]) => (labelId: string): 'all' | 'some' | 'none' => {
    const items = ids.map((id) => messagesById.get(id)).filter(Boolean);
    if (items.length === 0) return 'none';
    const withLabel = items.filter((m) => m!.labelIds?.includes(labelId)).length;
    if (withLabel === 0) return 'none';
    return withLabel === items.length ? 'all' : 'some';
  };

  const detailLabelState = (labelId: string): 'all' | 'some' | 'none' => {
    if (threadMessages.length === 0) return labelStateFor(detailIds)(labelId);
    const relevant = threadMessages.filter((m: any) => detailIds.includes(m.id));
    const withLabel = relevant.filter((m: any) => m.labelIds?.includes(labelId)).length;
    if (withLabel === 0) return 'none';
    return withLabel === relevant.length ? 'all' : 'some';
  };

  const handlePreviousMessage = () => {
    if (!selectedMessageId || filteredMessages.length === 0) return;
    const currentIndex = filteredMessages.findIndex((m) => m.id === selectedMessageId);
    if (currentIndex > 0) {
      handleSelectMessage(filteredMessages[currentIndex - 1].id);
    }
  };

  const handleNextMessage = () => {
    if (!selectedMessageId || filteredMessages.length === 0) return;
    const currentIndex = filteredMessages.findIndex((m) => m.id === selectedMessageId);
    if (currentIndex >= 0 && currentIndex < filteredMessages.length - 1) {
      handleSelectMessage(filteredMessages[currentIndex + 1].id);
    }
  };

  const handleGoogleConnect = () => {
    const apiBase =
      import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api/v1";
    window.location.href = buildGoogleOAuthConnectUrl(apiBase);
  };

  const handleConnectGmailFromSwitcher = () => {
    setIsAccountSwitcherOpen(false);
    handleGoogleConnect();
  };

  const handleAccountLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const res = await dispatch(logout()).unwrap();
      if ((res as { success?: boolean })?.success) {
        toast.success((res as { message?: string }).message || 'Signed out');
      } else {
        toast.error((res as { message?: string })?.message || 'Sign out failed');
      }
    } catch (err: unknown) {
      const message =
        typeof err === 'string' ? err : (err as { message?: string })?.message;
      toast.error(message || 'Sign out failed');
    } finally {
      dispatch(clearApplicationStats());
      dispatch(clearPaymentDashboard());
      dispatch(resetOperationsDashboard());
      clearCrmCacheOnLogout();
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
      clearVoiceMicSessionFlags();
      setIsAccountSwitcherOpen(false);
      navigate('/login', { replace: true });
      setSigningOut(false);
    }
  };

  return (
    <div className="crm-keep-case h-[calc(100vh-64px)] min-h-[600px] flex flex-col bg-background text-foreground">

      {/* --- TOP HEADER --- */}
      <header className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="flex items-center gap-3 min-w-[220px]">
          <Button variant="ghost" size="icon" className="rounded-lg" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {/* <img src="https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico" alt="Gmail" className="w-6 h-6" /> */}
            <span className="text-lg font-semibold tracking-tight">Welcome !</span>
          </div>
        </div>

        <div className="flex-1 max-w-3xl">
          <div className="flex items-center gap-3 w-full rounded-lg border border-border bg-background px-4 py-2.5 transition-colors focus-within:border-[var(--brand)]">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!e.target.value.trim() && activeQuery) setActiveQuery('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch();
                if (e.key === 'Escape') {
                  setSearchQuery('');
                  if (activeQuery) setActiveQuery('');
                }
              }}
              placeholder={`Search in ${activeLabelTitle} (press Enter to search Gmail)`}
              className="w-full bg-transparent text-sm outline-none border-none placeholder:text-muted-foreground"
            />
            {searchQuery && (
              <button
                type="button"
                title="Clear search"
                onClick={() => {
                  setSearchQuery('');
                  if (activeQuery) setActiveQuery('');
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>




        <div className="flex items-center gap-2 ml-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsAccountSwitcherOpen(true)}
            className="h-8 w-8 shrink-0 rounded-full bg-[image:var(--brand-gradient)] flex items-center justify-center text-white text-[10px] font-semibold cursor-pointer ring-offset-2 ring-offset-background transition-shadow hover:ring-2 hover:ring-[var(--brand)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
            title="Google account"
            aria-label="Open account menu"
          >
            {accountInitials}
          </button>
        </div>
      </header>

      <Dialog open={isAccountSwitcherOpen} onOpenChange={setIsAccountSwitcherOpen}>
        <DialogContent
          className="max-w-[420px] gap-0 overflow-hidden rounded-2xl border-0 bg-slate-100 p-0 shadow-2xl dark:bg-slate-900 sm:rounded-2xl sm:max-w-[420px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Account switcher</DialogTitle>
          <div className="relative border-b border-slate-200/80 bg-slate-100 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2 pr-10">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--brand-gradient)] text-[10px] font-semibold text-white">
                {accountInitials}
              </div>
              <span className="min-w-0 truncate text-center text-sm font-medium text-slate-800 dark:text-slate-100">
                {accountEmail || accountDisplayName}
              </span>
            </div>
            <button
              type="button"
              className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/70 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Close account menu"
              onClick={() => setIsAccountSwitcherOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 px-6 pb-6 pt-5">
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-3 flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-[image:var(--brand-gradient)] text-2xl font-semibold text-white shadow-md ring-2 ring-slate-200 dark:ring-slate-700">
                {accountInitials.slice(0, 1)}
              </div>
              <p className="text-xl font-normal text-slate-800 dark:text-slate-100">
                Hi, {sessionUser?.firstName?.trim() || accountEmail.split('@')[0] || 'there'}!
              </p>
              <p className="mt-0.5 max-w-[280px] text-xs text-slate-600 dark:text-slate-400">
                {gmailConnected && gmailEmail
                  ? `Connected as ${gmailEmail}`
                  : accountEmail}
              </p>
              <a
                href="https://myaccount.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center justify-center rounded-full border border-[#1a73e8] px-5 py-2 text-sm font-medium text-[#1a73e8] transition-colors hover:bg-[#1a73e8]/10"
              >
                Manage your Google Account
                <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" aria-hidden />
              </a>
            </div>

            <div className="rounded-2xl border border-slate-200/90 bg-white p-1 shadow-sm dark:border-slate-700 dark:bg-slate-950">
              <div className="px-3 pb-2 pt-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Accounts
                </p>
              </div>
              <div className="space-y-0.5 pb-2">
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                  onClick={handleConnectGmailFromSwitcher}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/15 text-[var(--brand)]">
                    <Plus className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      Add another account
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      Link Gmail via Google — opens secure sign-in
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-900"
                  onClick={() => {
                    setIsAccountSwitcherOpen(false);
                    navigate('/user-setting');
                  }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    <User className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      CRM profile &amp; settings
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                      Name, password, preferences in Finexus CRM
                    </span>
                  </span>
                </button>
              </div>
              <div className="mx-3 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                disabled={signingOut}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/30"
                onClick={() => void handleAccountLogout()}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
                  <LogOut className="h-4 w-4" />
                </span>
                <span className="font-semibold">
                  {signingOut ? 'Signing out…' : 'Sign out of CRM'}
                </span>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={labelDialog !== null} onOpenChange={(open: boolean) => !open && setLabelDialog(null)}>
        <DialogContent className="max-w-[400px]">
          <DialogTitle>{labelDialog?.mode === 'rename' ? 'Edit label' : 'New label'}</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submitLabelDialog();
            }}
          >
            <input
              autoFocus
              type="text"
              value={labelDialogName}
              onChange={(e) => setLabelDialogName(e.target.value)}
              placeholder="Label name (use / to nest, e.g. Deals/Pending)"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-[var(--brand)]"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setLabelDialog(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!labelDialogName.trim()}>
                {labelDialog?.mode === 'rename' ? 'Save' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="flex flex-1 overflow-hidden p-3 gap-3">
        {/* --- SIDEBAR --- */}
        <aside className={`transition-all duration-300 flex flex-col rounded-xl border border-border bg-card ${isSidebarOpen ? 'w-64' : 'w-20'} p-2`}>
          <div className="px-1 py-1">
            <button
              className={`w-full flex items-center gap-3 transition-all hover:shadow-sm border border-[var(--brand)]/25 ${isSidebarOpen ? 'px-4 py-3 rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]' : 'p-3 rounded-lg bg-[var(--brand)]/10 justify-center'}`}
              onClick={openNewCompose}
              disabled={!gmailConnected}
              title={gmailConnected ? 'Compose' : 'Connect Gmail to compose'}
            >
              <Plus className="h-5 w-5" />
              {isSidebarOpen && <span className="font-semibold text-sm">Compose</span>}
            </button>
            <button
              type="button"
              className={`mt-2 w-full flex items-center gap-3 rounded-lg border border-border text-foreground/80 transition-colors hover:bg-muted ${isSidebarOpen ? 'px-4 py-2' : 'p-3 justify-center'}`}
              onClick={() => setShowNewTemplate(true)}
              title="New email template"
            >
              <FilePlus className="h-4 w-4 shrink-0" />
              {isSidebarOpen && <span className="text-sm font-medium">New template</span>}
            </button>
          </div>
          <nav className="flex-1 mt-3 space-y-1 overflow-y-auto">
            {sidebarItems.map((item) => {
              const isActive = activeLabel === item.value;
              return (
                <div
                  key={item.value}
                  onClick={() => handleLabelChange(item.value)}
                  title={item.label}
                  className={`flex items-center gap-3 cursor-pointer text-sm rounded-md transition-colors ${isSidebarOpen ? 'px-3 py-2' : 'px-2 py-2 justify-center'} ${isActive
                    ? 'bg-[image:var(--brand-gradient)] text-white font-semibold'
                    : 'text-foreground/80 hover:bg-muted'
                    }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {isSidebarOpen && (
                    <div className="flex justify-between w-full">
                      <span>{item.label}</span>
                      {Boolean(item.count) && (
                        <span className={`text-xs ${isActive ? 'opacity-90' : 'font-semibold'}`}>{item.count}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {isSidebarOpen && gmailConnected && (
              <div className="pt-4">
                <div className="flex items-center justify-between px-3 pb-1">
                  <span className="text-sm font-semibold text-foreground/80">Labels</span>
                  <button
                    type="button"
                    title="Create new label"
                    onClick={openCreateLabel}
                    className="p-1 rounded-full hover:bg-muted"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {userLabels.map((label) => {
                  const isActive = activeLabel === label.id;
                  return (
                    <div
                      key={label.id}
                      onClick={() => handleLabelChange(label.id)}
                      className={`group flex items-center gap-3 cursor-pointer text-sm rounded-md px-3 py-1.5 transition-colors ${isActive
                        ? 'bg-[var(--brand)] text-white font-semibold'
                        : 'text-foreground/80 hover:bg-muted'
                        }`}
                    >
                      <Tag
                        className="h-4 w-4 shrink-0"
                        style={label.color?.backgroundColor ? { color: label.color.backgroundColor } : undefined}
                      />
                      <span className="flex-1 truncate" title={label.name}>{label.name}</span>
                      {label.threadsUnread > 0 && (
                        <span className="text-xs font-semibold group-hover:hidden">{label.threadsUnread}</span>
                      )}
                      {!label.protected && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title="Label options"
                              onClick={(e) => e.stopPropagation()}
                              className="hidden group-hover:flex p-0.5 rounded hover:bg-black/10"
                            >
                              <EllipsisVertical className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                            <DropdownMenuItem
                              onSelect={() => {
                                setLabelDialogName(label.name);
                                setLabelDialog({ mode: 'rename', label });
                              }}
                            >
                              <Pencil size={14} /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600"
                              onSelect={() => void handleDeleteLabel(label)}
                            >
                              <Trash2 size={14} /> Remove label
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </nav>
        </aside>

        {/* --- MAIN CONTENT --- */}
        <main className="flex-1 flex flex-col rounded-xl overflow-hidden border border-border bg-card shadow-sm">

          {viewMode === 'list' ? (
            <>
              {/* List Toolbar */}
              <div className="flex items-center justify-between p-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1">
                  <IconButton
                    title={allVisibleChecked ? 'Deselect all' : 'Select all'}
                    onClick={toggleAllChecked}
                    icon={
                      allVisibleChecked ? (
                        <SquareCheck className="h-4 w-4 text-[var(--brand)]" />
                      ) : checkedIds.size > 0 ? (
                        <SquareMinus className="h-4 w-4 text-[var(--brand)]" />
                      ) : (
                        <Square className="h-4 w-4 opacity-60" />
                      )
                    }
                  />
                  {checkedIds.size === 0 ? (
                    <>
                      <IconButton
                        title="Refresh"
                        icon={<RefreshCw className={`h-4 w-4 opacity-60 ${loadingList && 'animate-spin'}`} />}
                        onClick={() => {
                          refreshList();
                          refreshLabels();
                        }}
                      />
                      {isAdminRole && (
                        <IconButton
                          title="Auto-create skipped emails"
                          icon={<MailX className="h-4 w-4 opacity-60" />}
                          onClick={() => navigate('/gmail/skipped')}
                        />
                      )}
                    </>
                  ) : (
                    (() => {
                      const rowIds = Array.from(checkedIds);
                      const ids = expandRowIds(rowIds);
                      return (
                        <>
                          {activeLabel === 'TRASH' ? (
                            <IconButton title="Restore" icon={<ArchiveRestore size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'untrash')} />
                          ) : activeLabel === 'SPAM' ? (
                            <IconButton title="Not spam" icon={<ShieldCheck size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'notSpam')} />
                          ) : activeLabel === 'INBOX' ? (
                            <IconButton title="Archive" icon={<Archive size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'archive')} />
                          ) : (
                            <IconButton title="Move to Inbox" icon={<Inbox size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'inbox')} />
                          )}
                          {activeLabel !== 'SPAM' && activeLabel !== 'TRASH' && (
                            <IconButton title="Report spam" icon={<ShieldAlert size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'spam')} />
                          )}
                          {activeLabel !== 'TRASH' && (
                            <IconButton title="Delete" icon={<Trash2 size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'trash')} />
                          )}
                          <div className="w-[1px] h-5 bg-border mx-1" />
                          {rowIds.some((id) => !messagesById.get(id)?.isRead) ? (
                            <IconButton title="Mark as read" icon={<MailOpen size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'read')} />
                          ) : (
                            <IconButton title="Mark as unread" icon={<Mail size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'unread')} />
                          )}
                          {rowIds.some((id) => !messagesById.get(id)?.isStarred) ? (
                            <IconButton title="Star" icon={<Star size={18} className="opacity-70" />} onClick={() => void runMailAction(ids, 'star')} />
                          ) : (
                            <IconButton title="Remove star" icon={<Star size={18} className="fill-yellow-400 text-yellow-400" />} onClick={() => void runMailAction(ids, 'unstar')} />
                          )}
                          {renderLabelMenu(ids, labelStateFor(rowIds))}
                          <span className="ml-2 text-xs text-muted-foreground">{rowIds.length} selected</span>
                        </>
                      );
                    })()
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  {activeQuery && (
                    <span className="rounded bg-muted px-2 py-0.5">Results for “{activeQuery}”</span>
                  )}
                  <span>
                    {filteredMessages.length > 0 ? `1-${filteredMessages.length}` : 0} of {messages.length}
                    {nextPageToken ? '+' : ''}
                  </span>
                </div>
              </div>

              {gmailConnected && syncError && messages.length > 0 && (
                <div className="flex items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="truncate">Sync failed — showing last loaded mail. {syncError}</span>
                  </div>
                  {isGmailReconnectNeeded(syncError) ? (
                    <GoogleOAuthButton onClick={handleGoogleConnect} className="shrink-0" />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => dispatch(syncGmail({ label: activeLabel }))}
                    >
                      Retry
                    </Button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto bg-background">
                {connectionLoading && !connectionChecked ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="h-5 w-5 animate-spin opacity-50 mr-2" />
                    <span className="text-sm opacity-60">Checking Gmail connection…</span>
                  </div>
                ) : connectionChecked && !gmailConnected ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 min-h-[min(60vh,420px)]">
                    <div className="flex flex-col items-center text-center opacity-60">
                      <Mail className="h-10 w-10 mb-3 opacity-40" />
                      <span className="text-sm mb-2">Connect Gmail to view your inbox</span>
                      <span className="text-xs opacity-50 mb-6 max-w-xs">
                        Sign in with the Google account linked to your CRM email.
                      </span>
                    </div>
                    <GoogleOAuthButton onClick={handleGoogleConnect} className="w-full max-w-sm" />
                  </div>
                ) : loadingList && messages.length === 0 ? (
                  <div className="flex items-center justify-center py-16">
                    <RefreshCw className="h-5 w-5 animate-spin opacity-50 mr-2" />
                    <span className="text-sm opacity-60">Loading {activeLabel.toLowerCase()} mails…</span>
                  </div>
                ) : syncError && messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-4 min-h-[min(60vh,420px)]">
                    <div className="flex flex-col items-center text-center opacity-60">
                      <AlertCircle className="h-10 w-10 mb-3 text-red-400" />
                      <span className="text-sm text-red-500 mb-2">
                        {isGmailReconnectNeeded(syncError) ? 'Gmail connection expired' : 'Sync failed'}
                      </span>
                      <span className="text-xs opacity-50 mb-2 max-w-xs">{syncError}</span>
                      {gmailEmail && !isGmailReconnectNeeded(syncError) && (
                        <span className="text-xs text-muted-foreground mb-6">
                          Connected as {gmailEmail}
                        </span>
                      )}
                    </div>
                    {isGmailReconnectNeeded(syncError) ? (
                      <GoogleOAuthButton onClick={handleGoogleConnect} className="w-full max-w-sm" />
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full max-w-sm"
                        onClick={() => dispatch(syncGmail({ label: activeLabel }))}
                      >
                        Retry sync
                      </Button>
                    )}
                  </div>
                ) : filteredMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 opacity-50">
                    <Mail className="h-12 w-12 mb-3 opacity-30" />
                    <span className="text-sm">
                      {searchQuery.trim() ? 'No matching emails found' : `No messages in ${activeLabel.toLowerCase()}`}
                    </span>
                  </div>
                ) : (
                  <>
                    {filteredMessages.map((m: any) => {
                      const isChecked = checkedIds.has(m.id);
                      const isDraftRow = isDraftOnlyRow(m);
                      const showRecipient = activeLabel === 'SENT' || isDraftRow;
                      const threadIds: string[] = m.messageIds ?? [m.id];
                      const senders = formatSenders(m);
                      const chipLabels = (m.labelIds ?? [])
                        .map((id: string) => labelById.get(id))
                        .filter((l: GmailMailboxLabel | undefined): l is GmailMailboxLabel => Boolean(l && l.type === 'user' && l.id !== activeLabel));
                      return (
                        <div
                          key={m.id}
                          onClick={() => openListItem(m)}
                          className={`group relative flex items-center px-3 py-2 border-b border-border cursor-pointer transition-colors ${isChecked
                            ? 'bg-[var(--brand)]/15'
                            : selectedMessageId === m.id
                              ? 'bg-[var(--brand)]/10'
                              : m.isRead
                                ? 'bg-muted/20 hover:bg-muted/70'
                                : 'bg-background hover:bg-muted/70'
                            }`}
                        >
                          <button
                            type="button"
                            title={isChecked ? 'Deselect' : 'Select'}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleChecked(m.id);
                            }}
                            className="p-1.5 mr-1 rounded hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            {isChecked ? (
                              <SquareCheck className="h-4 w-4 text-[var(--brand)]" />
                            ) : (
                              <Square className="h-4 w-4 opacity-40 group-hover:opacity-70" />
                            )}
                          </button>
                          {!isDraftRow && (
                            <button
                              type="button"
                              title={m.isStarred ? 'Starred' : 'Not starred'}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Gmail stars the newest message but unstars the whole conversation.
                                void runMailAction(m.isStarred ? threadIds : [m.id], m.isStarred ? 'unstar' : 'star');
                              }}
                              className="p-1.5 mr-2 rounded hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              <Star
                                className={`h-4 w-4 ${m.isStarred ? 'fill-yellow-400 text-yellow-400' : 'opacity-40 group-hover:opacity-70'}`}
                              />
                            </button>
                          )}
                          <div className={`w-56 shrink-0 truncate text-sm mr-4 ${m.isRead ? 'font-normal text-muted-foreground' : 'font-semibold text-foreground'}`}>
                            {isDraftRow ? (
                              <>
                                <span className="text-red-500 mr-1">Draft</span>
                                {`To: ${displayName(m.to || '') || '(no recipients)'}`}
                              </>
                            ) : (
                              <>
                                {showRecipient
                                  ? `To: ${displayName(m.to || '') || '(no recipients)'}`
                                  : senders.label}
                                {m.hasDraft && <span className="text-red-500">, Draft</span>}
                                {senders.count && (
                                  <span className="ml-1 text-xs font-normal text-muted-foreground">{senders.count}</span>
                                )}
                              </>
                            )}
                          </div>
                          <div className="flex-1 min-w-0 flex items-center gap-2 text-sm">
                            {chipLabels.map((label: GmailMailboxLabel) => (
                              <span
                                key={label.id}
                                className={`shrink-0 rounded px-1.5 text-[11px] leading-5 ${label.protected ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}`}
                              >
                                {label.name}
                              </span>
                            ))}
                            <span className="truncate">
                              <span className={m.isRead ? 'font-normal' : 'font-bold'}>{m.subject || '(no subject)'}</span>
                              <span className="opacity-60"> — {m.snippet}</span>
                            </span>
                          </div>
                          {m.hasAttachment && <Paperclip className="h-4 w-4 ml-2 shrink-0 opacity-50" />}
                          <div className={`text-xs ml-3 min-w-[64px] text-right group-hover:invisible ${m.isRead ? 'text-muted-foreground' : 'font-semibold text-foreground'}`}>
                            {formatListDate(m.internalDate, m.date)}
                          </div>
                          {!isDraftRow && (
                            <div
                              className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center bg-card/95 rounded shadow-sm"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {activeLabel === 'TRASH' ? (
                                <IconButton title="Restore" icon={<ArchiveRestore size={16} className="opacity-70" />} onClick={() => void runMailAction(threadIds, 'untrash')} />
                              ) : activeLabel === 'SPAM' ? (
                                <IconButton title="Not spam" icon={<ShieldCheck size={16} className="opacity-70" />} onClick={() => void runMailAction(threadIds, 'notSpam')} />
                              ) : m.labelIds?.includes('INBOX') ? (
                                <IconButton title="Archive" icon={<Archive size={16} className="opacity-70" />} onClick={() => void runMailAction(threadIds, 'archive')} />
                              ) : (
                                <IconButton title="Move to Inbox" icon={<Inbox size={16} className="opacity-70" />} onClick={() => void runMailAction(threadIds, 'inbox')} />
                              )}
                              {activeLabel !== 'TRASH' && (
                                <IconButton title="Delete" icon={<Trash2 size={16} className="opacity-70" />} onClick={() => void runMailAction(threadIds, 'trash')} />
                              )}
                              <IconButton
                                title={m.isRead ? 'Mark as unread' : 'Mark as read'}
                                icon={m.isRead ? <Mail size={16} className="opacity-70" /> : <MailOpen size={16} className="opacity-70" />}
                                onClick={() => void runMailAction(threadIds, m.isRead ? 'unread' : 'read')}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Load More */}
                    {nextPageToken && (
                      <div className="flex justify-center py-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleLoadMore}
                          disabled={loadingList}
                          className="text-xs"
                        >
                          {loadingList ? (
                            <>
                              <RefreshCw className="h-3 w-3 animate-spin mr-1.5" />
                              Loading…
                            </>
                          ) : (
                            'Load More'
                          )}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            /* --- MESSAGE DETAIL VIEW --- */
            <div className="flex flex-col h-full bg-background relative">
              {/* Floating Send to CRM Button */}
              <button
                onClick={async () => {
                  if (!selectedMessageId) {
                    toast.error('No message selected');
                    return;
                  }
                  if (sendToCrmInFlightRef.current || isBypassProcessing) {
                    return;
                  }
                  sendToCrmInFlightRef.current = true;

                  try {
                    setIsBypassProcessing(true);
                    const headers = (selectedMessage as any)?.payload?.headers as any[] | undefined;
                    const fromHeader = getHeaderValue(headers, 'From');
                    const senderEmail = extractEmailFromFromHeader(fromHeader);

                    let isoId: string | undefined = undefined;
                    if (senderEmail) {
                      try {
                        const isoRes = await dispatch(getIsos()).unwrap();
                        const isoList: any[] = Array.isArray((isoRes as any)?.data)
                          ? (isoRes as any).data
                          : Array.isArray(isoRes)
                            ? (isoRes as any)
                            : [];
                        const matchedIso = isoList.find((iso: any) =>
                          String(iso?.email || '').trim().toLowerCase() === senderEmail
                        );
                        if (matchedIso?.id) {
                          isoId = String(matchedIso.id);
                        }
                      } catch {
                        // Non-blocking; application creation still works without ISO mapping.
                      }
                    }
                    // 1) Get attachments for the selected message
                    const att = await dispatch(getGmailAttachments(selectedMessageId)).unwrap();

                    // Note: current getGmailAttachments returns a single { blob, filename } object
                    if (!att || !att.blob) {
                      toast.error("No attachments found");
                      return;
                    }

                    // Prefer Gmail payload metadata — response headers are often hidden by CORS without exposedHeaders
                    const payloadList = getAttachmentsFromPayload((selectedMessage as any)?.payload);
                    const pdfFromPayload =
                      payloadList.find((a) => a.filename.toLowerCase().endsWith('.pdf')) ||
                      payloadList[0];
                    const nameFromPayload = pdfFromPayload?.filename?.trim();

                    // 2) Convert Blob -> File (assume PDF if filename ends with .pdf)
                    const filename: string =
                      (nameFromPayload && nameFromPayload.length > 0 ? nameFromPayload : null) ||
                      (att.filename && att.filename !== 'attachment' ? att.filename : null) ||
                      'application.pdf';
                    const inferredType = filename.toLowerCase().endsWith('.pdf')
                      ? 'application/pdf'
                      : 'application/octet-stream';
                    const FileCtor = (globalThis as any).File;
                    const file: any = FileCtor
                      ? new FileCtor([att.blob], filename, { type: inferredType })
                      : att.blob;

                    // 3) Send to auto-create (parse + create client/application)
                    const autoCreateResult = await dispatch(
                      parseApplicationPdfForClientPrefill({
                        pdfFile: file,
                        applicationType: isOperationsRole ? "Bypass" : undefined,
                        isoId,
                        gmailMessageId: selectedMessageId,
                      }),
                    ).unwrap();

                    try {
                      await dispatch(markGmailMessageInCrmLabel(selectedMessageId)).unwrap();
                      void dispatch(syncGmail({ label: 'INBOX' }));
                    } catch (labelError) {
                      console.warn('Application created but Gmail in-crm label failed:', labelError);
                    }

                    const alreadyExisted = Boolean((autoCreateResult as any)?.data?.alreadyExisted);
                    toast.success(
                      alreadyExisted
                        ? "Application already exists for this PDF"
                        : "Application created successfully",
                    );

                    if (isOperationsRole) {
                      const createdApplication =
                        (autoCreateResult as any)?.data?.application;
                      const createdApplicationId =
                        createdApplication?._id ||
                        createdApplication?.id ||
                        createdApplication?.applicationId;

                      if (createdApplicationId) {
                        navigate(`/applications/${String(createdApplicationId)}/contract`);
                      } else {
                        toast.warning("Application created, but unable to open Contract tab automatically.");
                      }
                    }
                  } catch (err) {
                    console.error("Error auto-creating applications:", err);
                    toast.error("Failed to auto-create applications");
                  } finally {
                    sendToCrmInFlightRef.current = false;
                    setIsBypassProcessing(false);
                  }
                }}
                disabled={autoCreating || isBypassProcessing}
                className="absolute cursor-pointer bottom-6 right-6 z-40 flex items-center gap-2 px-5 py-2.5 bg-[image:var(--brand-gradient)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
              >
                {autoCreating || isBypassProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ExternalLink size={16} />
                    {isOperationsRole ? "Bypass Application" : "Send to CRM"}
                  </>
                )}
              </button>

              <div className="flex items-center justify-between p-2.5 border-b border-border bg-muted/30">
                <div className="flex items-center gap-1">
                  <IconButton title="Back" icon={<ArrowLeft className="h-5 w-5 opacity-70" />} onClick={() => setViewMode('list')} />
                  <div className="w-[1px] h-5 bg-border mx-1" />
                  {detailLabelIds.has('TRASH') ? (
                    <IconButton title="Restore" icon={<ArchiveRestore size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'untrash')} />
                  ) : detailLabelIds.has('SPAM') ? (
                    <IconButton title="Not spam" icon={<ShieldCheck size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'notSpam')} />
                  ) : detailLabelIds.has('INBOX') ? (
                    <IconButton title="Archive" icon={<Archive size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'archive')} />
                  ) : (
                    <IconButton title="Move to Inbox" icon={<Inbox size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'inbox')} />
                  )}
                  {!detailLabelIds.has('SPAM') && !detailLabelIds.has('TRASH') && (
                    <IconButton title="Report spam" icon={<ShieldAlert size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'spam')} />
                  )}
                  {!detailLabelIds.has('TRASH') && (
                    <IconButton title="Delete" icon={<Trash2 size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'trash')} />
                  )}
                  <div className="w-[1px] h-5 bg-border mx-1" />
                  <IconButton title="Mark as unread" icon={<Mail size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'unread')} />
                  {detailLabelIds.has('STARRED') ? (
                    <IconButton title="Remove star" icon={<Star size={18} className="fill-yellow-400 text-yellow-400" />} onClick={() => void runMailAction(detailIds, 'unstar')} />
                  ) : (
                    <IconButton title="Star" icon={<Star size={18} className="opacity-70" />} onClick={() => void runMailAction(detailIds, 'star')} />
                  )}
                  {renderLabelMenu(detailIds, detailLabelState)}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {selectedMessageId ? messages.findIndex(m => m.id === selectedMessageId) + 1 : 0} of {messages.length}
                  </span>
                  <IconButton
                    icon={<ChevronLeft size={16} />}
                    onClick={handlePreviousMessage}
                    className={selectedMessageId && filteredMessages.findIndex(m => m.id === selectedMessageId) <= 0 ? 'opacity-30 cursor-not-allowed' : ''}
                  />
                  <IconButton
                    icon={<ChevronRight size={16} />}
                    onClick={handleNextMessage}
                    className={selectedMessageId && filteredMessages.findIndex(m => m.id === selectedMessageId) >= filteredMessages.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 px-8 pb-24 bg-card">
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <h2 className="text-2xl font-normal">{detailSubject}</h2>
                  {Array.from(detailLabelIds)
                    .map((id) => labelById.get(id))
                    .filter((l): l is GmailMailboxLabel => Boolean(l && (l.type === 'user' || l.id === 'INBOX')))
                    .map((label) => (
                      <span
                        key={label.id}
                        className={`text-[11px] px-1.5 rounded ${label.protected ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}`}
                      >
                        {label.id === 'INBOX' ? 'Inbox' : label.name}
                      </span>
                    ))}
                </div>

                {detailError && !thread && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-sm text-red-500">Error loading message: {detailError}</div>
                  </div>
                )}

                {threadMessages.length > 0 ? (
                  threadMessages.map((msg: any, index: number) => (
                    <GmailThreadMessage
                      key={msg.id}
                      message={msg}
                      defaultExpanded={
                        msg.id === selectedMessageId ||
                        index === threadMessages.length - 1 ||
                        Boolean(msg.labelIds?.includes('UNREAD'))
                      }
                      myEmail={gmailEmail}
                      onReply={handleReply}
                      onToggleStar={(m) =>
                        void runMailAction([m.id], m.labelIds?.includes('STARRED') ? 'unstar' : 'star')
                      }
                      onDownload={handleDownloadAttachment}
                      onOpenDraft={openDraftMessage}
                    />
                  ))
                ) : (threadLoading || loadingDetail) ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin opacity-50 mr-2" />
                    <div className="text-sm opacity-60">Loading conversation…</div>
                  </div>
                ) : selectedMessage ? (
                  <GmailThreadMessage
                    key={selectedMessage.id}
                    message={selectedMessage}
                    defaultExpanded
                    myEmail={gmailEmail}
                    onReply={handleReply}
                    onToggleStar={(m) =>
                      void runMailAction([m.id], m.labelIds?.includes('STARRED') ? 'unstar' : 'star')
                    }
                    onDownload={handleDownloadAttachment}
                    onOpenDraft={openDraftMessage}
                  />
                ) : null}
              </div>
            </div>
          )}
        </main>

        {/* <aside className="w-14 rounded-xl border border-border bg-card flex flex-col items-center py-4 gap-6 text-muted-foreground">
          <img src="https://www.gstatic.com/companion/icon_assets/calendar_2020q4_2x.png" className="w-5 h-5 cursor-pointer" alt="Cal" />
          <img src="https://www.gstatic.com/companion/icon_assets/keep_2020q4_v3_2x.png" className="w-5 h-5 cursor-pointer" alt="Keep" />
          <img src="https://www.gstatic.com/companion/icon_assets/tasks_2021_2x.png" className="w-5 h-5 cursor-pointer" alt="Tasks" />
          <div className="h-[1px] w-6 bg-border" />
          <Plus className="h-5 w-5 cursor-pointer" />
        </aside> */}
      </div>

      {/* --- COMPOSE WINDOW (always sends through the connected Gmail account) --- */}
      {compose && (
        <GmailComposeWindow
          key={compose.key}
          initial={compose}
          onClose={() => setCompose(null)}
          onChanged={handleComposeChanged}
        />
      )}

      <GmailNewTemplateDialog open={showNewTemplate} onOpenChange={setShowNewTemplate} />
    </div>
  );
};

export default GmailPage;
