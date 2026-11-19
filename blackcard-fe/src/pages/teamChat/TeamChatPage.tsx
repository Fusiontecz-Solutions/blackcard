import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '@/context/ThemeContext';
import {
    initChatSocket,
    disconnectChatSocket,
    getChatSocket,
    joinChannel as svcJoinChannel,
    leaveChannel as svcLeaveChannel,
    sendMessage as svcSendMessage,
    onNewChannelMessage,
    offNewChannelMessage,
    onNewDM,
    offNewDM,
} from '@/services/teamChatService';
import type { ApiChatMessage } from '@/services/teamChatService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { axiosPostFormData } from '@/redux/axios';
import {
    Send,
    Search,
    // Paperclip,
    Smile,
    Reply,
    Check,
    CheckCheck,
    MoreHorizontal,
    Plus,
    Hash,
    User,
    Loader2,
    X,
    Paperclip,
    // Phone,
    // Video,
    // Settings,
    // MoreVertical,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { RootState, AppDispatch } from '@/redux/store';
import { fetchChannels, fetchUserDMs, fetchChannelMessages, createTeamChannel } from '@/redux/actions/teamChatActions';
import { setActiveChannel, addChannelMessage } from '@/redux/slices/teamChatSlice';
import type { ChannelMember, ChannelMessage } from '@/redux/slices/teamChatSlice';
import { fetchUsers } from '@/redux/actions/userActions';
import { cn } from '@/lib/utils';
import { ChatAttachmentPreviewDialog } from '@/components/chat/ChatAttachmentPreviewDialog';
import { ChatButton } from '@/components/chat/ChatButton';
import { OnlineStatusSync } from '@/components/chat/OnlineStatusSync';

// ─── Emoji data ───
const EMOJI_CATEGORIES: Record<string, string[]> = {
    'Recently Used': ['😀', '😂', '❤️', '👍', '😊', '🎉', '🔥', '💯'],
    'Smileys & People': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡'],
    'Gestures & Body': ['👋', '🤚', '🖐', '✋', '🖖', '👌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'],
    'Animals & Nature': ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦇'],
    'Food & Drink': ['🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🥦', '🍕', '🍔', '🍟', '☕️', '🍵', '🍺', '🍷', '🥂', '🍸', '🍹'],
};

function getInitials(firstName?: string, lastName?: string): string {
    return `${(firstName?.[0] || '').toUpperCase()}${(lastName?.[0] || '').toUpperCase()}` || '??';
}

function formatMemberRoleDisplay(role?: string): string {
    if (!role || !String(role).trim()) return 'MEMBER';
    return String(role).trim().replace(/-/g, '_').toUpperCase();
}

function roleTitleCase(role?: string): string {
    const raw = formatMemberRoleDisplay(role).replace(/_/g, ' ').toLowerCase();
    return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function usernameHandleFromEmail(email?: string): string {
    if (!email) return '@—';
    const local = email.split('@')[0]?.trim();
    if (!local) return '@—';
    return `@${local}`;
}

type SharedMediaItem = {
    id: string;
    name: string;
    date: Date;
    url?: string;
    kind: 'file' | 'media' | 'link';
};

function collectSharedItemsFromMessages(
    messages: ChannelMessage[],
    senderUserId: string,
): { files: SharedMediaItem[]; media: SharedMediaItem[]; links: SharedMediaItem[] } {
    const files: SharedMediaItem[] = [];
    const media: SharedMediaItem[] = [];
    const links: SharedMediaItem[] = [];
    const urlRe = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

    for (const msg of messages) {
        if (!msg.senderId || msg.senderId !== senderUserId) continue;
        const created = msg.createdAt ? new Date(msg.createdAt) : new Date();
        const atts = msg.attachments;
        if (Array.isArray(atts)) {
            for (const a of atts) {
                const ft = String(a.fileType || '').toLowerCase();
                const name = a.fileName || 'Attachment';
                const item: SharedMediaItem = {
                    id: String(a.id ?? `${msg.id}-${name}`),
                    name,
                    date: created,
                    url: a.url,
                    kind: 'file',
                };
                if (ft.startsWith('image/') || ft.startsWith('video/')) {
                    item.kind = 'media';
                    media.push(item);
                } else {
                    files.push(item);
                }
            }
        }
        const content = msg.content || '';
        let m: RegExpExecArray | null;
        const re = new RegExp(urlRe.source, urlRe.flags);
        while ((m = re.exec(content)) !== null) {
            const url = m[0].replace(/[),.;]+$/, '');
            links.push({
                id: `${String(msg.id)}-${m.index}`,
                name: url,
                date: created,
                url,
                kind: 'link',
            });
        }
    }

    const byDate = (a: SharedMediaItem, b: SharedMediaItem) => b.date.getTime() - a.date.getTime();
    files.sort(byDate);
    media.sort(byDate);
    links.sort(byDate);
    return { files, media, links };
}

function formatSharedItemDate(d: Date): string {
    if (Number.isNaN(d.getTime())) return '—';
    const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    const day = d.getDate();
    const month = d.toLocaleDateString('en-US', { month: 'long' });
    const year = d.getFullYear();
    return `${t}, ${day} ${month} ${year}`;
}

/** Socket/API attachment shape for outgoing `sendMessage` */
type TeamChatPendingAttachment = { name: string; type: string; url: string };

function mapApiMessageAttachments(
    msg: ApiChatMessage,
): { id: string; url: string; fileName: string; fileType: string }[] | undefined {
    const raw = msg.attachments;
    if (!raw?.length) return undefined;
    return raw.map((a, i) => ({
        id: `att-${msg.id}-${i}`,
        url: a.url,
        fileName: a.name,
        fileType: a.type || 'application/octet-stream',
    }));
}

/** Normalize stored message attachments (REST may use fileName or name) */
function normalizeMessageAttachmentsForDisplay(
    msg: ChannelMessage,
): { id: string; url: string; fileName: string; fileType: string }[] {
    const raw = msg.attachments;
    if (!raw?.length) return [];
    return raw.map((a: Record<string, unknown>, i: number) => ({
        id: String(a.id ?? `a-${i}`),
        url: String(a.url ?? ''),
        fileName: String(a.fileName ?? a.name ?? 'Attachment'),
        fileType: String(a.fileType ?? a.type ?? 'application/octet-stream'),
    }));
}

/** Short label for the bubble (e.g. PDF, Word) — no duplicate filename row */
function fileTypeLabel(fileName: string, fileType: string): string {
    const ext = fileName.includes('.') ? (fileName.split('.').pop() || '').toLowerCase() : '';
    const mime = (fileType || '').toLowerCase();
    if (mime.includes('pdf') || ext === 'pdf') return 'PDF';
    if (mime.startsWith('image/')) {
        if (ext === 'png') return 'PNG';
        if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
        if (ext === 'gif') return 'GIF';
        if (ext === 'webp') return 'WebP';
        return 'Image';
    }
    if (mime.startsWith('video/')) return 'Video';
    if (mime.includes('wordprocessingml') || ext === 'docx') return 'Word';
    if (mime.includes('msword') || ext === 'doc') return 'Word';
    if (mime.includes('spreadsheetml') || ext === 'xlsx') return 'Excel';
    if (mime.includes('excel') || ext === 'xls') return 'Excel';
    if (mime.includes('presentation') || ext === 'pptx' || ext === 'ppt') return 'Presentation';
    if (mime.includes('zip') || ext === 'zip') return 'ZIP';
    if (mime.includes('text/plain') || ext === 'txt') return 'Text';
    if (ext) return ext.toUpperCase();
    const part = mime.split('/').pop();
    return part ? part.toUpperCase() : 'File';
}

/** Hide message text when it only repeats attachment summary (avoids double filename line) */
function attachmentBodyTextIsRedundant(
    content: string | undefined,
    attachments: { fileName: string }[],
): boolean {
    const t = (content ?? '').trim();
    if (attachments.length === 0) return false;
    if (!t) return true;
    if (attachments.length === 1 && t === attachments[0].fileName) return true;
    if (attachments.length > 1 && /^\d+\s+files$/i.test(t)) return true;
    return false;
}

/** Group messages by date for date separator rendering */
function groupMessagesByDate(messages: ChannelMessage[]) {
    const groups: { date: string; messages: ChannelMessage[] }[] = [];
    let currentDate = '';
    for (const msg of messages) {
        const d = new Date(msg.createdAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        });
        if (d !== currentDate) {
            currentDate = d;
            groups.push({ date: d, messages: [msg] });
        } else {
            groups[groups.length - 1].messages.push(msg);
        }
    }
    return groups;
}

const TeamChat = () => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const dispatch = useDispatch<AppDispatch>();

    // ─── Redux selectors ───
    const loginData = useSelector((state: RootState) => state.login?.data);
    // Redux state resets on page refresh — fall back to localStorage (set during login)
    const currentUser = useMemo(() => {
        if (loginData?.user?._id) return loginData.user;
        try {
            const stored = localStorage.getItem('user');
            if (stored) return JSON.parse(stored);
        } catch { /* ignore */ }
        return null;
    }, [loginData]);
    const currentUserId = currentUser?._id ?? '';

    const channels = useSelector((state: RootState) => state.teamChat.channels);
    const dms = useSelector((state: RootState) => state.teamChat.dms);
    const activeChannelId = useSelector((state: RootState) => state.teamChat.activeChannelId);
    const channelMessages = useSelector((state: RootState) =>
        activeChannelId ? state.teamChat.messages[activeChannelId] ?? [] : []
    );
    const channelsLoading = useSelector((state: RootState) => state.teamChat.channelsLoading);
    const messagesLoading = useSelector((state: RootState) => state.teamChat.messagesLoading);
    const createChannelLoading = useSelector((state: RootState) => state.teamChat.createChannelLoading);

    // ─── Users (for DM modal) ───
    const allUsers = useSelector((state: RootState) => state.users?.data ?? []);
    const usersLoading = useSelector((state: RootState) => state.users?.loading ?? false);

    // ─── Local state ───
    const [input, setInput] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateChannel, setShowCreateChannel] = useState(false);
    const [newChannelName, setNewChannelName] = useState('');
    const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [showNewDM, setShowNewDM] = useState(false);
    const [dmSearchQuery, setDmSearchQuery] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const emojiPickerRef = useRef<HTMLDivElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const [memberProfileOpen, setMemberProfileOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState<ChannelMember | null>(null);
    const [profileMediaTab, setProfileMediaTab] = useState<'files' | 'media' | 'links'>('files');
    const [pendingAttachments, setPendingAttachments] = useState<TeamChatPendingAttachment[]>([]);
    const [attachmentUploading, setAttachmentUploading] = useState(false);
    const [attachmentPreview, setAttachmentPreview] = useState<{
        url: string;
        fileName: string;
        fileType: string;
    } | null>(null);

    // ─── Derived ───
    const activeChannel = useMemo(
        () => channels.find((c) => c.id === activeChannelId) ?? null,
        [channels, activeChannelId]
    );

    const activeDM = useMemo(
        () => dms.find((d) => d.id === activeChannelId) ?? null,
        [dms, activeChannelId]
    );

    const chatTitle = useMemo(() => {
        if (activeChannel?.name) return activeChannel.name;
        if (activeDM) {
            const other = activeDM.participants?.find((p) => p.userId !== currentUserId);
            const n = `${other?.firstName || ''} ${other?.lastName || ''}`.trim();
            return n || 'Direct message';
        }
        return 'Select a conversation';
    }, [activeChannel, activeDM, currentUserId]);

    /** Members for the right rail: full channel roster or DM counterpart */
    const sidebarMembers = useMemo((): ChannelMember[] => {
        if (activeChannel?.members && activeChannel.members.length > 0) {
            return activeChannel.members;
        }
        if (activeDM?.participants?.length) {
            return activeDM.participants.filter((p) => p.userId !== currentUserId);
        }
        return [];
    }, [activeChannel, activeDM, currentUserId]);

    const messageGroups = useMemo(() => groupMessagesByDate(channelMessages), [channelMessages]);

    const onlineCount = useMemo(
        () => sidebarMembers.length,
        [sidebarMembers]
    );

    const sharedWithSelectedMember = useMemo(() => {
        const uid = selectedMember?.userId;
        if (!uid) return { files: [] as SharedMediaItem[], media: [] as SharedMediaItem[], links: [] as SharedMediaItem[] };
        return collectSharedItemsFromMessages(channelMessages, uid);
    }, [selectedMember?.userId, channelMessages]);

    // ─── Init service socket on mount ───
    useEffect(() => {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        if (!token) return;
        initChatSocket(token);
        return () => disconnectChatSocket();
    }, []);

    // ─── Fetch channels & DMs on mount ───
    useEffect(() => {
        if (!currentUserId) return;
        dispatch(fetchChannels());
        dispatch(fetchUserDMs());
    }, [currentUserId, dispatch]);

    // ─── Auto-select first channel ───
    useEffect(() => {
        if (!activeChannelId && channels.length > 0) {
            dispatch(setActiveChannel(channels[0].id));
        }
    }, [channels, activeChannelId, dispatch]);

    // ─── Fetch messages when active channel changes ───
    useEffect(() => {
        if (!activeChannelId) return;
        dispatch(fetchChannelMessages({ channelId: activeChannelId }));
    }, [activeChannelId, dispatch]);

    // ─── Scroll to bottom on new messages ───
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [channelMessages]);

    useEffect(() => {
        setMemberProfileOpen(false);
        setSelectedMember(null);
        setPendingAttachments([]);
    }, [activeChannelId]);

    const openMemberProfile = useCallback((m: ChannelMember) => {
        setSelectedMember(m);
        setProfileMediaTab('files');
        setMemberProfileOpen(true);
    }, []);

    // ─── Socket: join/leave channel & listen for new channel messages ───
    useEffect(() => {
        const sock = getChatSocket();
        const joinActive = () => {
            if (activeChannelId) svcJoinChannel(activeChannelId);
        };
        joinActive();
        sock?.on('connect', joinActive); // re-join after reconnect

        const handleNewChannelMsg = (msg: ApiChatMessage) => {
            const incomingChannelId = String(msg.channelId || '');
            if (!incomingChannelId) return;
            dispatch(addChannelMessage({
                id: msg.id,
                channelId: incomingChannelId,
                content: msg.message,
                senderId: msg.senderId,
                createdAt: msg.createdAt,
                sender: msg.senderName
                    ? { id: msg.senderId, firstName: msg.senderName }
                    : undefined,
                attachments: mapApiMessageAttachments(msg),
            }));
            // Keep sidebar ordering/freshness in sync for receiver + sender.
            dispatch(fetchChannels());
        };

        onNewChannelMessage(handleNewChannelMsg);

        return () => {
            sock?.off('connect', joinActive);
            offNewChannelMessage(handleNewChannelMsg);
            if (activeChannelId) svcLeaveChannel(activeChannelId);
        };
    }, [activeChannelId, dispatch]);

    // ─── Socket: listen for new DM messages ───
    useEffect(() => {
        const handleNewDMMsg = (msg: ApiChatMessage) => {
            dispatch(addChannelMessage({
                id: msg.id,
                channelId: msg.channelId ?? '',
                content: msg.message,
                senderId: msg.senderId,
                createdAt: msg.createdAt,
                sender: msg.senderName
                    ? { id: msg.senderId, firstName: msg.senderName }
                    : undefined,
                attachments: mapApiMessageAttachments(msg),
            }));
            // Re-fetch DMs to update sidebar order / unread counts
            dispatch(fetchUserDMs());
        };

        onNewDM(handleNewDMMsg);
        return () => offNewDM(handleNewDMMsg);
    }, [dispatch]);

    // ─── Send message (channel or DM) ───
    const handleSendMessage = useCallback(
        async (e?: React.FormEvent) => {
            e?.preventDefault();
            const trimmed = input.trim();
            if ((!trimmed && pendingAttachments.length === 0) || !activeChannelId) return;

            const attachmentsPayload = pendingAttachments.map((a) => ({
                name: a.name,
                type: a.type,
                url: a.url,
            }));

            const displayText =
                trimmed ||
                (pendingAttachments.length === 1
                    ? pendingAttachments[0].name
                    : pendingAttachments.length > 1
                        ? `${pendingAttachments.length} files`
                        : '');

            const tempId = `temp-${Date.now()}`;
            const optimisticAttachments =
                pendingAttachments.length > 0
                    ? pendingAttachments.map((a, i) => ({
                        id: `temp-att-${tempId}-${i}`,
                        url: a.url,
                        fileName: a.name,
                        fileType: a.type,
                    }))
                    : undefined;

            const optimistic: ChannelMessage = {
                id: tempId,
                channelId: activeChannelId,
                senderId: currentUserId,
                content: displayText,
                createdAt: new Date().toISOString(),
                sender: currentUser
                    ? { id: currentUser._id, firstName: currentUser.firstName, lastName: currentUser.lastName, email: currentUser.email }
                    : undefined,
                attachments: optimisticAttachments,
            };
            dispatch(addChannelMessage(optimistic));
            setInput('');
            setPendingAttachments([]);

            const activeDM = dms.find((d) => d.id === activeChannelId);
            const messageBody = trimmed || (attachmentsPayload.length ? ' ' : '');
            const msgType = attachmentsPayload.length > 0 ? 'file' : 'text';

            try {
                if (activeDM) {
                    const otherUser = activeDM.participants?.find((p) => p.userId !== currentUserId);
                    await svcSendMessage({
                        message: messageBody,
                        receiverId: otherUser?.userId,
                        messageType: 'dm',
                        type: msgType,
                        attachments: attachmentsPayload,
                    });
                } else {
                    await svcSendMessage({
                        message: messageBody,
                        channelId: activeChannelId,
                        messageType: 'channel',
                        type: msgType,
                        attachments: attachmentsPayload,
                    });
                }
            } catch (err) {
                console.error('Failed to send message:', err);
            }
        },
        [input, pendingAttachments, activeChannelId, currentUserId, currentUser, dms, dispatch]
    );

    // ─── Create channel ───
    const handleCreateChannel = useCallback(async () => {
        const name = newChannelName.trim();
        if (!name) return;
        const result = await dispatch(
            createTeamChannel({
                name,
                type: 'channel',
                isPrivate: false,
                members: selectedMemberIds.length > 0 ? selectedMemberIds : [],
            })
        );
        if (createTeamChannel.fulfilled.match(result)) {
            setShowCreateChannel(false);
            setNewChannelName('');
            setSelectedMemberIds([]);
            setMemberSearchQuery('');
            // Re-fetch channels so the new one appears with correct data
            const refreshed = await dispatch(fetchChannels());
            // Auto-select the newly created channel
            if (fetchChannels.fulfilled.match(refreshed) && result.payload) {
                const newId = result.payload.id;
                if (newId) dispatch(setActiveChannel(String(newId)));
            }
        }
    }, [newChannelName, selectedMemberIds, dispatch]);

    // ─── Open Create Channel modal ───
    const handleOpenCreateChannel = useCallback(() => {
        setShowCreateChannel(true);
        setNewChannelName('');
        setSelectedMemberIds([]);
        setMemberSearchQuery('');
        dispatch(fetchUsers({ limit: 100 }));
    }, [dispatch]);

    // ─── Filtered users for Create Channel modal ───
    const filteredMemberUsers = useMemo(() => {
        const users = allUsers.filter((u: any) => u._id !== currentUserId && u.isActive);
        if (!memberSearchQuery) return users;
        const q = memberSearchQuery.toLowerCase();
        return users.filter(
            (u: any) =>
                u.firstName?.toLowerCase().includes(q) ||
                u.lastName?.toLowerCase().includes(q) ||
                u.role?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q)
        );
    }, [allUsers, memberSearchQuery, currentUserId]);

    // ─── Toggle member selection ───
    const toggleMemberSelection = useCallback((userId: string) => {
        setSelectedMemberIds((prev) =>
            prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
        );
    }, []);

    // ─── Open New DM modal ───
    const handleOpenNewDM = useCallback(() => {
        setShowNewDM(true);
        setDmSearchQuery('');
        dispatch(fetchUsers({ limit: 100 }));
    }, [dispatch]);

    // ─── Select user to DM ───
    const handleSelectUserForDM = useCallback(
        (userId: string) => {
            // Check if a DM already exists with this user
            const existingDM = dms.find((dm) =>
                dm.participants?.some((p) => p.userId === userId)
            );
            if (existingDM) {
                dispatch(setActiveChannel(existingDM.id));
            } else {
                // Emit socket event to create a new DM via the service socket
                getChatSocket()?.emit('create_dm', { participantId: userId });
            }
            setShowNewDM(false);
            setDmSearchQuery('');
        },
        [dms, dispatch]
    );

    // ─── Filtered users for DM modal ───
    const filteredUsers = useMemo(() => {
        const users = allUsers.filter((u) => u._id !== currentUserId && u.isActive);
        if (!dmSearchQuery) return users;
        const q = dmSearchQuery.toLowerCase();
        return users.filter(
            (u) =>
                u.firstName?.toLowerCase().includes(q) ||
                u.lastName?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q)
        );
    }, [allUsers, dmSearchQuery, currentUserId]);

    // ─── Emoji helpers ───
    const handleEmojiClick = () => setShowEmojiPicker((prev) => !prev);
    const handleEmojiSelect = (emoji: string) => setInput((prev) => prev + emoji);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                const target = event.target as HTMLElement;
                if (!target.closest('[data-emoji-button]')) setShowEmojiPicker(false);
            }
        };
        if (showEmojiPicker) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showEmojiPicker]);

    const removePendingAttachment = useCallback((index: number) => {
        setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // ─── File attachment: upload then queue for send (same endpoint as ChatInput) ───
    const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length || !activeChannelId) {
            e.target.value = '';
            return;
        }
        setAttachmentUploading(true);
        try {
            const uploaded: TeamChatPendingAttachment[] = [];
            for (const file of Array.from(files)) {
                const formData = new FormData();
                formData.append('file', file);
                const res = await axiosPostFormData('/uploads/single', formData);
                const d = res.data?.data;
                if (d?.url) {
                    uploaded.push({
                        name: (d.originalName as string) ?? file.name,
                        type: file.type || 'application/octet-stream',
                        url: d.url as string,
                    });
                }
            }
            if (uploaded.length) {
                setPendingAttachments((prev) => [...prev, ...uploaded]);
            }
        } catch (err) {
            console.error('Attachment upload failed:', err);
        } finally {
            setAttachmentUploading(false);
            e.target.value = '';
        }
    };

    // ─── Filtered sidebar items ───
    const filteredChannels = useMemo(() => {
        if (!searchQuery) return channels;
        const q = searchQuery.toLowerCase();
        return channels.filter((c) => c.name?.toLowerCase().includes(q));
    }, [channels, searchQuery]);

    const filteredDMs = useMemo(() => {
        if (!searchQuery) return dms;
        const q = searchQuery.toLowerCase();
        return dms.filter((dm) =>
            dm.participants?.some(
                (p) => p.firstName?.toLowerCase().includes(q) || p.lastName?.toLowerCase().includes(q)
            )
        );
    }, [dms, searchQuery]);

    // ─── Message status icon ───
    const renderStatusIcon = (msg: ChannelMessage) => {
        const isMine = msg.senderId === currentUserId;
        if (!isMine) return null;
        const id = msg.id;
        if (id && String(id).startsWith('temp-')) {
            return <Check className="w-3 h-3 text-gray-400" />;
        }
        return <CheckCheck className="w-3 h-3 text-[#C07BE0]" />;
    };

    // ════════════════════════════════════════════════════════════════
    // RENDER
    // ════════════════════════════════════════════════════════════════
    return (
        <div className={`flex h-[calc(100vh-64px)] min-h-[600px] overflow-hidden ${isDark ? 'bg-[#0f1f2f] text-[#e1e3e6]' : 'bg-[#F4F9FF] text-black'}`}>
            <OnlineStatusSync />

            {/* ══════════ LEFT SIDEBAR ══════════ */}
            <div className={`hidden md:flex flex-col w-60 lg:w-64 border-r shadow-sm ${isDark ? 'border-[#1f3b57] bg-[var(--brand-accent-strong)]' : 'border-[var(--brand-soft)] bg-white'}`}>
                {/* Search */}
                <div className="p-3">
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${isDark ? 'bg-[var(--brand-mid)] border-[var(--brand-mid)]' : 'bg-[var(--brand-soft)] border-[var(--brand-soft)]'}`}>
                        <span className={`inline-flex items-center justify-center rounded-full p-1 ${isDark ? 'bg-[var(--brand)]/35 text-[var(--brand-accent)]' : 'bg-[var(--brand-soft)] text-[var(--brand)]'}`}>
                            <Search className="size-3.5" />
                        </span>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search conversations..."
                            className="bg-transparent border-none text-sm focus:outline-none w-full placeholder:text-gray-500"
                        />
                    </div>
                </div>

                {/* Scrollable sections */}
                <div className="flex-1 overflow-y-auto px-2 pb-3">
                    {channelsLoading && (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="size-5 animate-spin text-gray-500" />
                        </div>
                    )}

                    {/* ── CHANNELS Section ── */}
                    {!channelsLoading && (
                        <>
                            <div className="flex items-center justify-between px-4 py-2 bg-[#1F6FA4] rounded-t-lg mt-1">
                                <span className={`text-[11px] font-semibold tracking-widest uppercase ${isDark ? 'text-white' : 'text-white'}`}>
                                    Channels
                                </span>
                                <button
                                    onClick={handleOpenCreateChannel}
                                    title="Create new channel"
                                    className={`p-1.5 rounded-full transition-colors ${isDark ? 'bg-[#184F74] text-[#B9DDF5] hover:bg-[#1F6FA4]' : 'bg-[#DCEFFD] text-[#1F6FA4] hover:bg-[#C8E6FB]'}`}
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            </div>

                            <div className={`rounded-b-lg border border-t-0 overflow-hidden ${isDark ? 'border-[#1f3b57] bg-[#11283c]' : 'border-[var(--brand-soft)] bg-[#F7FBFF]'}`}>
                            {filteredChannels.map((channel) => (
                                <button
                                    key={channel.id}
                                    onClick={() => dispatch(setActiveChannel(channel.id))}
                                    className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${activeChannelId === channel.id
                                        ? (isDark ? 'bg-[#1F6FA4] text-white' : 'bg-[#DCEFFD] text-[#184F74]')
                                        : (isDark ? 'text-[#B9DDF5] hover:bg-[#184F74]/70' : 'text-gray-700 hover:bg-[#EDF7FF]')
                                        }`}
                                >
                                    <span className={`inline-flex items-center justify-center rounded-full p-1 ${activeChannelId === channel.id ? 'bg-white/20 text-white' : isDark ? 'bg-[#205A81] text-[#B9DDF5]' : 'bg-[#DCEFFD] text-[#1F6FA4]'}`}>
                                        <Hash className="size-3.5 shrink-0" />
                                    </span>
                                    <span className="truncate">{channel.name}</span>
                                </button>
                            ))}
                            </div>

                            {filteredChannels.length === 0 && !channelsLoading && (
                                <p className="text-xs text-gray-500 text-center py-3 rounded-b-lg border border-t-0 border-[var(--brand-soft)] bg-[#F7FBFF]">No channels found</p>
                            )}
                        </>
                    )}

                    {/* ── DIRECT MESSAGES Section ── */}
                    {!channelsLoading && (
                        <>
                            <div className="flex items-center justify-between px-4 py-2 bg-[#1F6FA4] rounded-t-lg mt-3">
                                <span className={`text-[11px] font-semibold tracking-widest uppercase ${isDark ? 'text-white' : 'text-white'}`}>
                                    Direct Messages
                                </span>
                                <button
                                    onClick={handleOpenNewDM}
                                    title="New direct message"
                                    className={`p-1.5 rounded-full transition-colors ${isDark ? 'bg-[#184F74] text-[#B9DDF5] hover:bg-[#1F6FA4]' : 'bg-[#DCEFFD] text-[#1F6FA4] hover:bg-[#C8E6FB]'}`}
                                >
                                    <Plus className="size-3.5" />
                                </button>
                            </div>

                            <div className={`rounded-b-lg border border-t-0 overflow-hidden ${isDark ? 'border-[#1f3b57] bg-[#11283c]' : 'border-[var(--brand-soft)] bg-[#F7FBFF]'}`}>
                            {filteredDMs.map((dm) => {
                                const otherUser = dm.participants?.find((p) => p.userId !== currentUserId);
                                const displayName = otherUser
                                    ? `${otherUser.firstName || ''} ${otherUser.lastName || ''}`.trim() || 'DM'
                                    : 'DM';

                                return (
                                    <button
                                        key={dm.id}
                                        onClick={() => dispatch(setActiveChannel(dm.id))}
                                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${activeChannelId === dm.id
                                            ? (isDark ? 'bg-[#1F6FA4] text-white' : 'bg-[#DCEFFD] text-[#184F74]')
                                            : (isDark ? 'text-[#b8d5ef] hover:bg-[#214760]/70' : 'text-gray-700 hover:bg-[#EEF6FF]')
                                            }`}
                                    >
                                        <span className={`inline-flex items-center justify-center rounded-full p-1 ${activeChannelId === dm.id ? 'bg-white/20 text-white' : isDark ? 'bg-[var(--brand-mid)] text-[var(--brand-accent)]' : 'bg-[var(--brand-soft)] text-[var(--brand)]'}`}>
                                            <User className="size-3.5 shrink-0" />
                                        </span>
                                        <span className="truncate">{displayName}</span>
                                        {!!dm.unreadCount && dm.unreadCount > 0 && (
                                            <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-[image:var(--brand-gradient)] text-white rounded-full">
                                                {dm.unreadCount}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                            </div>

                            {filteredDMs.length === 0 && !channelsLoading && (
                                <p className="text-xs text-gray-500 text-center py-3 rounded-b-lg border border-t-0 border-[var(--brand-soft)] bg-[#F7FBFF]">No conversations found</p>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* ══════════ MAIN CHAT AREA ══════════ */}
            <div className="flex-1 flex flex-col relative min-w-0">
                {/* ── Chat Header ── */}
                <div className={`px-4 py-2.5 flex items-center justify-between border-b shadow-sm ${isDark ? 'bg-[var(--brand-accent-strong)] border-[#1f3b57]' : 'bg-white border-[var(--brand-soft)]'}`}>
                    <div className="flex items-center gap-2 min-w-0">
                        {activeChannel ? (
                            <span className={`inline-flex items-center justify-center rounded-full p-1.5 ${isDark ? 'bg-[var(--brand-mid)] text-[var(--brand-accent)]' : 'bg-[var(--brand-soft)] text-[var(--brand)]'}`}>
                                <Hash className="size-4 shrink-0" />
                            </span>
                        ) : activeDM ? (
                            <span className={`inline-flex items-center justify-center rounded-full p-1.5 ${isDark ? 'bg-[var(--brand-mid)] text-[var(--brand-accent)]' : 'bg-[var(--brand-soft)] text-[var(--brand)]'}`}>
                                <User className="size-4 shrink-0" />
                            </span>
                        ) : (
                            <span className={`inline-flex items-center justify-center rounded-full p-1.5 opacity-60 ${isDark ? 'bg-[var(--brand-mid)] text-[var(--brand-accent)]' : 'bg-[var(--brand-soft)] text-[var(--brand)]'}`}>
                                <Hash className="size-4 shrink-0" />
                            </span>
                        )}
                        <h2 className="font-semibold text-base truncate">{chatTitle}</h2>
                        {(activeChannel || activeDM) && sidebarMembers.length > 0 && (
                            <span className={`text-sm ml-2 shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                {onlineCount} online
                            </span>
                        )}
                    </div>
                    <div className={`flex items-center gap-2 shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="p-1.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10"
                                    aria-label="Chat options"
                                >
                                    <MoreHorizontal className="size-5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {activeChannel && <DropdownMenuItem>Channel Info</DropdownMenuItem>}
                                <DropdownMenuItem>Mute Notifications</DropdownMenuItem>
                                {activeChannel && (
                                    <DropdownMenuItem className="text-destructive">Leave Channel</DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* ── Messages ── */}
                <div
                    className={`flex-1 overflow-y-auto p-4 md:px-6 space-y-1 ${isDark ? 'bg-[#0f1f2f]' : 'bg-[#F0F7FF]'}`}
                >
                    {messagesLoading && channelMessages.length === 0 && (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="size-6 animate-spin text-gray-500" />
                        </div>
                    )}

                    {!activeChannelId && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            <p>Select a channel or DM to start chatting</p>
                        </div>
                    )}

                    {messageGroups.map((group) => (
                        <div key={group.date}>
                            {/* Date separator */}
                            <div className="flex items-center justify-center my-4">
                                <span className={`text-xs px-3 py-1 rounded-full shadow-sm ${isDark ? 'bg-[#214760] text-[#b8d5ef]' : 'bg-white text-[#5A7C99]'}`}>
                                    {group.date}
                                </span>
                            </div>

                            {/* Messages in this group */}
                            {group.messages.map((msg) => {
                                const isMine = msg.senderId === currentUserId;
                                const senderName = msg.sender
                                    ? `${msg.sender.firstName || ''} ${msg.sender.lastName || ''}`.trim()
                                    : 'Unknown';
                                const displayAttachments = normalizeMessageAttachmentsForDisplay(msg);
                                const hideBodyText = attachmentBodyTextIsRedundant(msg.content, displayAttachments);

                                return (
                                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 group`}>
                                        <div
                                            className={`relative w-fit max-w-[65%] min-w-0 shrink px-3 py-1.5 rounded-lg shadow-sm ${isMine
                                                ? (isDark ? 'bg-[image:var(--brand-gradient)] text-[#e1e3e6]' : 'bg-[var(--brand-soft)] text-black')
                                                : (isDark ? 'bg-[#214760] text-[#e1e3e6]' : 'bg-white text-black')
                                                }`}
                                        >

                                            {!isMine && (
                                                <p className="text-xs font-semibold text-[#C07BE0] mb-0.5">{senderName}</p>
                                            )}

                                            <div className="flex w-fit min-w-0 max-w-full flex-col">
                                                {displayAttachments.length > 0 && (
                                                    <div className="flex w-fit min-w-0 max-w-full flex-col gap-2 mb-1">
                                                        {displayAttachments.map((att) => {
                                                            const isImg = att.fileType.startsWith('image/') && att.url;
                                                            if (isImg) {
                                                                return (
                                                                    <button
                                                                        key={att.id}
                                                                        type="button"
                                                                        onClick={() =>
                                                                            att.url &&
                                                                            setAttachmentPreview({
                                                                                url: att.url,
                                                                                fileName: att.fileName,
                                                                                fileType: att.fileType,
                                                                            })
                                                                        }
                                                                        className="block cursor-pointer rounded-md overflow-hidden max-w-[240px] border border-black/10 text-left dark:border-white/10"
                                                                    >
                                                                        <img
                                                                            src={att.url}
                                                                            alt={att.fileName}
                                                                            className="max-h-48 w-full object-cover"
                                                                        />
                                                                    </button>
                                                                );
                                                            }
                                                            const fileTitleClass = isMine
                                                                ? isDark
                                                                    ? 'text-[#e1e3e6]'
                                                                    : 'text-gray-900'
                                                                : isDark
                                                                    ? 'text-[#e1e3e6]'
                                                                    : 'text-gray-900';
                                                            const fileTypeClass = isMine
                                                                ? isDark
                                                                    ? 'text-gray-400'
                                                                    : 'text-gray-600'
                                                                : isDark
                                                                    ? 'text-gray-400'
                                                                    : 'text-gray-600';
                                                            return (
                                                                <button
                                                                    key={att.id}
                                                                    type="button"
                                                                    onClick={() =>
                                                                        att.url &&
                                                                        setAttachmentPreview({
                                                                            url: att.url,
                                                                            fileName: att.fileName,
                                                                            fileType: att.fileType,
                                                                        })
                                                                    }
                                                                    className="block w-max max-w-[280px] min-w-0 rounded-md border border-black/10 bg-black/[0.04] px-2.5 py-2 text-left transition-opacity hover:opacity-90 dark:border-white/10 dark:bg-white/[0.06]"
                                                                >
                                                                    <p
                                                                        className={`text-sm font-semibold leading-snug break-words ${fileTitleClass}`}
                                                                    >
                                                                        {att.fileName}
                                                                    </p>
                                                                    <p className={`text-xs mt-1 ${fileTypeClass}`}>
                                                                        {fileTypeLabel(att.fileName, att.fileType)}
                                                                    </p>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {Boolean(msg.content?.trim()) && !hideBodyText && (
                                                    <span className="text-sm pr-14 leading-snug whitespace-pre-wrap">{msg.content}</span>
                                                )}
                                                <div className="flex items-center gap-1 text-[10px] self-end -mt-1 opacity-60">
                                                    <span>
                                                        {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                    </span>
                                                    {renderStatusIcon(msg)}
                                                </div>
                                            </div>

                                            {/* Context menu */}
                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="p-1 hover:bg-black/10 rounded-full">
                                                            <MoreHorizontal className="size-3.5" />
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent>
                                                        <DropdownMenuItem className="gap-2"><Reply className="size-4" /> Reply</DropdownMenuItem>
                                                        <DropdownMenuItem>Copy</DropdownMenuItem>
                                                        <DropdownMenuItem>Forward</DropdownMenuItem>
                                                        <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* ── Input Area ── */}
                <div
                    className={`relative flex flex-col border-t ${isDark ? 'bg-[var(--brand-accent-strong)] border-[#1f3b57]' : 'bg-white border-[var(--brand-soft)]'}`}
                >
                    {pendingAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-0">
                            {pendingAttachments.map((att, idx) => (
                                <span
                                    key={`${att.url}-${idx}`}
                                    className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${isDark
                                        ? 'border-[var(--brand-mid)] bg-[var(--brand-mid)] text-[#e1e3e6]'
                                        : 'border-gray-200 bg-gray-100 text-gray-800'
                                        }`}
                                >
                                    <Paperclip className="size-3 shrink-0 opacity-70" />
                                    <span className="truncate max-w-[180px]" title={att.name}>
                                        {att.name}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removePendingAttachment(idx)}
                                        className="shrink-0 rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
                                        aria-label={`Remove ${att.name}`}
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}
                    <div className="relative px-4 py-3 flex items-center gap-3">
                        {/* Emoji Picker */}
                        {showEmojiPicker && (
                            <div
                                ref={emojiPickerRef}
                                className={`absolute bottom-full right-16 mb-2 w-[340px] h-[400px] rounded-lg shadow-2xl border ${isDark ? 'bg-[var(--brand-accent-strong)] border-[var(--brand-mid)]' : 'bg-white border-[var(--brand-soft)]'}`}
                                style={{ zIndex: 1000 }}
                            >
                                <div className={`flex flex-col h-full`}>
                                    <div className={`flex gap-1 p-2 border-b ${isDark ? 'border-[var(--brand-mid)]' : 'border-[var(--brand-soft)]'}`}>
                                        {Object.keys(EMOJI_CATEGORIES).slice(0, 5).map((category) => (
                                            <button
                                                key={category}
                                                className={`px-3 py-1 text-xs rounded ${isDark ? 'hover:bg-[var(--brand-mid)]' : 'hover:bg-[var(--brand-soft)]'}`}
                                            >
                                                {category === 'Smileys & People' ? '😀' : category === 'Gestures & Body' ? '👋' : category === 'Animals & Nature' ? '🐶' : category === 'Food & Drink' ? '🍕' : '⚽️'}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3">
                                        {Object.entries(EMOJI_CATEGORIES).slice(0, 5).map(([category, emojis]) => (
                                            <div key={category} className="mb-4">
                                                <h3 className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-500' : 'text-gray-600'}`}>{category}</h3>
                                                <div className="grid grid-cols-8 gap-1">
                                                    {emojis.slice(0, 40).map((emoji, idx) => (
                                                        <button
                                                            key={`${category}-${idx}`}
                                                            onClick={() => handleEmojiSelect(emoji)}
                                                            className={`text-xl p-1.5 rounded ${isDark ? 'hover:bg-[var(--brand-mid)]' : 'hover:bg-[var(--brand-soft)]'} transition-colors`}
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            className="hidden"
                            onChange={handleFilesSelected}
                        />
                        <button
                            type="button"
                            disabled={!activeChannelId || attachmentUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className={`shrink-0 p-0.5 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark
                                ? 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                                }`}
                            title="Attach files"
                            aria-label="Attach files"
                        >
                            {attachmentUploading ? (
                                <Loader2 className="size-5 animate-spin" />
                            ) : (
                                <Paperclip className="size-5" />
                            )}
                        </button>

                        {/* Message input */}
                        <form className="flex-1 flex items-center" onSubmit={handleSendMessage}>
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={
                                    activeChannel
                                        ? `Message #${activeChannel.name}`
                                        : activeDM
                                            ? `Message ${chatTitle}`
                                            : 'Type a message'
                                }
                                className={`border rounded-md focus-visible:ring-1 ${isDark
                                    ? 'bg-[var(--brand-mid)] border-[var(--brand-mid)] text-[#e1e3e6] placeholder:text-gray-400 focus-visible:ring-[var(--brand)]'
                                    : 'bg-[#F7FBFF] border-[var(--brand-soft)] focus-visible:ring-[#C07BE0]'
                                    }`}
                                disabled={!activeChannelId || attachmentUploading}
                            />
                        </form>

                        {/* Emoji */}
                        <Smile
                            className={`size-5 shrink-0 cursor-pointer transition-colors ${showEmojiPicker
                                ? 'text-[#C07BE0]'
                                : (isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700')
                                }`}
                            onClick={handleEmojiClick}
                            data-emoji-button
                        />

                        {/* Send */}
                        <button
                            type="button"
                            onClick={() => void handleSendMessage()}
                            disabled={
                                (!input.trim() && pendingAttachments.length === 0) ||
                                !activeChannelId ||
                                attachmentUploading
                            }
                            className={`p-2 rounded-full transition-colors ${(input.trim() || pendingAttachments.length > 0) && activeChannelId && !attachmentUploading
                                ? 'bg-[image:var(--brand-gradient)] hover:opacity-90 text-white'
                                : (isDark ? 'text-gray-600' : 'text-gray-400')
                                }`}
                        >
                            <Send className="size-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* ══════════ RIGHT PANEL – TEAM MEMBERS ══════════ */}
            <div
                className={`hidden lg:flex flex-col w-64 xl:w-72 border-l shrink-0 ${isDark ? 'border-[#1f3b57] bg-[var(--brand-accent-strong)]' : 'border-[var(--brand-soft)] bg-white'
                    }`}
            >
                <div
                    className={`px-4 pt-4 pb-3 border-b ${isDark ? 'border-[#1f3b57]' : 'border-[var(--brand-soft)]'
                        }`}
                >
                    <h3
                        className={`text-[11px] font-semibold tracking-[0.12em] uppercase ${isDark ? 'text-gray-500' : 'text-gray-400'
                            }`}
                    >
                        Team members
                    </h3>
                </div>

                <div className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
                    {sidebarMembers.length > 0 ? (
                        sidebarMembers.map((member) => {
                            const initials = getInitials(member.firstName, member.lastName);
                            const fullName =
                                `${member.firstName || ''} ${member.lastName || ''}`.trim() || 'Unknown';
                            const ringClass = isDark ? 'ring-[#17212b]' : 'ring-white';

                            return (
                                <button
                                    key={member.userId || member.id}
                                    type="button"
                                    onClick={() => openMemberProfile(member)}
                                    className={cn(
                                        'w-full flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors',
                                        isDark ? 'hover:bg-[#214760]' : 'hover:bg-[#EEF6FF]',
                                    )}
                                >
                                    <div className="relative shrink-0">
                                        <Avatar className="h-11 w-11 rounded-full">
                                            {member.profilePicture ? (
                                                <AvatarImage
                                                    src={member.profilePicture}
                                                    alt=""
                                                    className="object-cover"
                                                />
                                            ) : null}
                                            <AvatarFallback
                                                className={cn(
                                                    'text-[13px] font-semibold rounded-full',
                                                    isDark
                                                        ? 'bg-sky-900/50 text-sky-200'
                                                        : 'bg-[var(--brand-soft)] text-[var(--brand)]',
                                                )}
                                            >
                                                {initials}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span
                                            className={cn(
                                                'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-[#22c55e] ring-2',
                                                ringClass,
                                            )}
                                            aria-hidden
                                        />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className={cn(
                                                'text-sm font-medium truncate',
                                                isDark ? 'text-sky-100' : 'text-[var(--brand)]',
                                            )}
                                        >
                                            {fullName}
                                        </p>
                                        <p
                                            className={cn(
                                                'text-[10px] tracking-wide truncate mt-0.5',
                                                isDark ? 'text-gray-500' : 'text-gray-400',
                                            )}
                                        >
                                            {formatMemberRoleDisplay(member.role)}
                                        </p>
                                    </div>
                                </button>
                            );
                        })
                    ) : (
                        <p
                            className={`text-xs text-center py-8 px-2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}
                        >
                            {activeChannelId ? 'No members in this chat' : 'Select a channel or DM'}
                        </p>
                    )}
                </div>
            </div>

            {/* Member profile (matches design: avatar, info card, shared media tabs) */}
            <Sheet
                open={memberProfileOpen}
                onOpenChange={(open: boolean) => {
                    setMemberProfileOpen(open);
                    if (!open) setSelectedMember(null);
                }}
            >
                <SheetContent
                    side="right"
                    className="z-[10000] flex w-full flex-col gap-0 overflow-y-auto border-l p-0 sm:max-w-[400px]"
                >
                    {selectedMember && (
                        <>
                            <SheetHeader className="sr-only">
                                <SheetTitle>Member profile</SheetTitle>
                                <SheetDescription>
                                    {`${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`.trim()}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="px-6 pt-10 pb-6 space-y-6">
                                <div className="flex flex-col items-center text-center">
                                    <Avatar className="h-28 w-28 rounded-2xl shadow-sm">
                                        {selectedMember.profilePicture ? (
                                            <AvatarImage
                                                src={selectedMember.profilePicture}
                                                alt=""
                                                className="object-cover rounded-2xl"
                                            />
                                        ) : null}
                                        <AvatarFallback
                                            className={cn(
                                                'rounded-2xl text-2xl font-bold',
                                                isDark
                                                    ? 'bg-sky-900/50 text-sky-200'
                                                    : 'bg-[var(--brand-soft)] text-[var(--brand)]',
                                            )}
                                        >
                                            {getInitials(selectedMember.firstName, selectedMember.lastName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <h2 className="mt-4 text-xl font-bold text-foreground">
                                        {`${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`.trim() ||
                                            'Unknown'}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground break-all">
                                        {selectedMember.email || '—'}
                                    </p>
                                </div>

                                <div
                                    className={cn(
                                        'rounded-xl border p-4 space-y-4',
                                        isDark ? 'border-border/60 bg-muted/30' : 'border-border/50 bg-sky-50/60',
                                    )}
                                >
                                    <div>
                                        <p className="text-xs text-muted-foreground">Username</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5">
                                            {usernameHandleFromEmail(selectedMember.email)}
                                        </p>
                                    </div>
                                    <Separator />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Role</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5">
                                            {roleTitleCase(selectedMember.role)}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase mb-3">
                                        Media files
                                    </h4>
                                    <div
                                        className={cn(
                                            'rounded-xl p-1 flex gap-1',
                                            isDark ? 'bg-muted/40' : 'bg-muted/50',
                                        )}
                                    >
                                        {(
                                            [
                                                ['files', 'Files'] as const,
                                                ['media', 'Media'] as const,
                                                ['links', 'Links'] as const,
                                            ]
                                        ).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setProfileMediaTab(key)}
                                                className={cn(
                                                    'flex-1 py-2 px-2 text-xs font-semibold rounded-lg transition-all',
                                                    profileMediaTab === key
                                                        ? 'bg-background text-foreground shadow-sm border border-border/70'
                                                        : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
                                        {(() => {
                                            const list =
                                                profileMediaTab === 'files'
                                                    ? sharedWithSelectedMember.files
                                                    : profileMediaTab === 'media'
                                                        ? sharedWithSelectedMember.media
                                                        : sharedWithSelectedMember.links;
                                            if (list.length === 0) {
                                                return (
                                                    <li className="py-8 text-center text-sm text-muted-foreground">
                                                        No {profileMediaTab} shared in this chat yet
                                                    </li>
                                                );
                                            }
                                            return list.map((item) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        disabled={!item.url && item.kind !== 'link'}
                                                        onClick={() => {
                                                            const u = item.url ?? (item.kind === 'link' ? item.name : '');
                                                            if (u) window.open(u, '_blank', 'noopener,noreferrer');
                                                        }}
                                                        className={cn(
                                                            'w-full py-3 text-left transition-colors',
                                                            item.url || item.kind === 'link'
                                                                ? 'hover:bg-muted/50 cursor-pointer'
                                                                : 'opacity-80 cursor-default',
                                                        )}
                                                    >
                                                        <p className="text-sm font-semibold text-foreground truncate pr-2">
                                                            {item.name}
                                                        </p>
                                                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                                            <span>{formatSharedItemDate(item.date)}</span>
                                                            <span className="shrink-0 tabular-nums">—</span>
                                                        </div>
                                                    </button>
                                                </li>
                                            ));
                                        })()}
                                    </ul>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* Member profile (matches design: avatar, info card, shared media tabs) */}
            <Sheet
                open={memberProfileOpen}
                onOpenChange={(open: boolean) => {
                    setMemberProfileOpen(open);
                    if (!open) setSelectedMember(null);
                }}
            >
                <SheetContent
                    side="right"
                    className="z-[10000] flex w-full flex-col gap-0 overflow-y-auto border-l p-0 sm:max-w-[400px]"
                >
                    {selectedMember && (
                        <>
                            <SheetHeader className="sr-only">
                                <SheetTitle>Member profile</SheetTitle>
                                <SheetDescription>
                                    {`${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`.trim()}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="px-6 pt-10 pb-6 space-y-6">
                                <div className="flex flex-col items-center text-center">
                                    <Avatar className="h-28 w-28 rounded-2xl shadow-sm">
                                        {selectedMember.profilePicture ? (
                                            <AvatarImage
                                                src={selectedMember.profilePicture}
                                                alt=""
                                                className="object-cover rounded-2xl"
                                            />
                                        ) : null}
                                        <AvatarFallback
                                            className={cn(
                                                'rounded-2xl text-2xl font-bold',
                                                isDark
                                                    ? 'bg-sky-900/50 text-sky-200'
                                                    : 'bg-[var(--brand-soft)] text-[var(--brand)]',
                                            )}
                                        >
                                            {getInitials(selectedMember.firstName, selectedMember.lastName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <h2 className="mt-4 text-xl font-bold text-foreground">
                                        {`${selectedMember.firstName || ''} ${selectedMember.lastName || ''}`.trim() ||
                                            'Unknown'}
                                    </h2>
                                    <p className="mt-1 text-sm text-muted-foreground break-all">
                                        {selectedMember.email || '—'}
                                    </p>
                                </div>

                                <div
                                    className={cn(
                                        'rounded-xl border p-4 space-y-4',
                                        isDark ? 'border-border/60 bg-muted/30' : 'border-border/50 bg-sky-50/60',
                                    )}
                                >
                                    <div>
                                        <p className="text-xs text-muted-foreground">Username</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5">
                                            {usernameHandleFromEmail(selectedMember.email)}
                                        </p>
                                    </div>
                                    <Separator />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Role</p>
                                        <p className="text-sm font-semibold text-foreground mt-0.5">
                                            {roleTitleCase(selectedMember.role)}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase mb-3">
                                        Media files
                                    </h4>
                                    <div
                                        className={cn(
                                            'rounded-xl p-1 flex gap-1',
                                            isDark ? 'bg-muted/40' : 'bg-muted/50',
                                        )}
                                    >
                                        {(
                                            [
                                                ['files', 'Files'] as const,
                                                ['media', 'Media'] as const,
                                                ['links', 'Links'] as const,
                                            ]
                                        ).map(([key, label]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setProfileMediaTab(key)}
                                                className={cn(
                                                    'flex-1 py-2 px-2 text-xs font-semibold rounded-lg transition-all',
                                                    profileMediaTab === key
                                                        ? 'bg-background text-foreground shadow-sm border border-border/70'
                                                        : 'text-muted-foreground hover:text-foreground',
                                                )}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>

                                    <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
                                        {(() => {
                                            const list =
                                                profileMediaTab === 'files'
                                                    ? sharedWithSelectedMember.files
                                                    : profileMediaTab === 'media'
                                                        ? sharedWithSelectedMember.media
                                                        : sharedWithSelectedMember.links;
                                            if (list.length === 0) {
                                                return (
                                                    <li className="py-8 text-center text-sm text-muted-foreground">
                                                        No {profileMediaTab} shared in this chat yet
                                                    </li>
                                                );
                                            }
                                            return list.map((item) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        disabled={!item.url && item.kind !== 'link'}
                                                        onClick={() => {
                                                            const u = item.url ?? (item.kind === 'link' ? item.name : '');
                                                            if (u) window.open(u, '_blank', 'noopener,noreferrer');
                                                        }}
                                                        className={cn(
                                                            'w-full py-3 text-left transition-colors',
                                                            item.url || item.kind === 'link'
                                                                ? 'hover:bg-muted/50 cursor-pointer'
                                                                : 'opacity-80 cursor-default',
                                                        )}
                                                    >
                                                        <p className="text-sm font-semibold text-foreground truncate pr-2">
                                                            {item.name}
                                                        </p>
                                                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                                            <span>{formatSharedItemDate(item.date)}</span>
                                                            <span className="shrink-0 tabular-nums">—</span>
                                                        </div>
                                                    </button>
                                                </li>
                                            ));
                                        })()}
                                    </ul>
                                </div>
                            </div>
                        </>
                    )}
                </SheetContent>
            </Sheet>

            {/* ══════════ Create Channel Dialog ══════════ */}
            <Dialog open={showCreateChannel} onOpenChange={setShowCreateChannel}>
                <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
                        <DialogTitle className="text-lg">Create New Channel</DialogTitle>
                        <DialogDescription className="sr-only">
                            Create a new channel and add members.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="px-6 pt-5 pb-2 space-y-4">
                        {/* Channel Name */}
                        <div className="space-y-2">
                            <Label htmlFor="channel-name" className="text-sm font-semibold">Channel Name</Label>
                            <Input
                                id="channel-name"
                                placeholder="Enter channel name"
                                value={newChannelName}
                                onChange={(e) => setNewChannelName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); handleCreateChannel(); }
                                }}
                                autoFocus
                            />
                        </div>

                        {/* Add Members */}
                        <div className="space-y-2">
                            <Label className="text-sm font-semibold">
                                Add Members ({selectedMemberIds.length} selected)
                            </Label>
                            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted">
                                <Search className="size-4 text-muted-foreground shrink-0" />
                                <input
                                    value={memberSearchQuery}
                                    onChange={(e) => setMemberSearchQuery(e.target.value)}
                                    placeholder="Search users by name, role, or email..."
                                    className="bg-transparent border-none text-sm text-foreground focus:outline-none w-full placeholder:text-muted-foreground"
                                />
                            </div>
                        </div>
                    </div>

                    {/* User list */}
                    <div className="mx-6 mb-4 max-h-[240px] overflow-y-auto rounded-md border border-border">
                        {usersLoading && (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {!usersLoading && filteredMemberUsers.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                <User className="size-6 mb-2 opacity-40" />
                                <p className="text-sm">No users found</p>
                            </div>
                        )}

                        {!usersLoading && filteredMemberUsers.map((user: any) => {
                            const initials = getInitials(user.firstName, user.lastName);
                            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
                            const isSelected = selectedMemberIds.includes(user._id);

                            return (
                                <label
                                    key={user._id}
                                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-border last:border-b-0 hover:bg-accent ${isSelected ? 'bg-accent/50' : ''}`}
                                >
                                    <Avatar className="h-9 w-9 shrink-0">
                                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-foreground">
                                            {fullName}
                                        </p>
                                        <p className="text-xs truncate text-muted-foreground">
                                            {user.role?.toLowerCase() || 'member'} &bull; {user.email}
                                        </p>
                                    </div>
                                    <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleMemberSelection(user._id)}
                                        className="shrink-0 cursor-pointer"
                                    />
                                </label>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                        <Button
                            variant="outline"
                            onClick={() => { setShowCreateChannel(false); setNewChannelName(''); setSelectedMemberIds([]); setMemberSearchQuery(''); }}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleCreateChannel}
                            disabled={!newChannelName.trim() || createChannelLoading}
                        >
                            {createChannelLoading ? (
                                <><Loader2 className="size-4 mr-2 animate-spin" />Creating…</>
                            ) : (
                                'Create Channel'
                            )}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* ══════════ New DM Dialog ══════════ */}
            <Dialog open={showNewDM} onOpenChange={setShowNewDM}>
                <DialogContent className="sm:max-w-[440px] p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-5 pt-5 pb-3">
                        <DialogTitle>New Direct Message</DialogTitle>
                        <DialogDescription>
                            Select a team member to start a conversation.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Search input */}
                    <div className="px-5 pb-3">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-muted">
                            <Search className="size-4 text-muted-foreground shrink-0" />
                            <input
                                value={dmSearchQuery}
                                onChange={(e) => setDmSearchQuery(e.target.value)}
                                placeholder="Search by name or email..."
                                className="bg-transparent border-none text-sm text-foreground focus:outline-none w-full placeholder:text-muted-foreground"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* User list */}
                    <div className="max-h-[350px] overflow-y-auto border-t border-border">
                        {usersLoading && (
                            <div className="flex items-center justify-center py-10">
                                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                            </div>
                        )}

                        {!usersLoading && filteredUsers.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                <User className="size-8 mb-2 opacity-40" />
                                <p className="text-sm">No users found</p>
                            </div>
                        )}

                        {!usersLoading && filteredUsers.map((user) => {
                            const initials = getInitials(user.firstName, user.lastName);
                            const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
                            const hasDM = dms.some((dm) =>
                                dm.participants?.some((p) => p.userId === user._id)
                            );

                            return (
                                <button
                                    key={user._id}
                                    onClick={() => handleSelectUserForDM(user._id)}
                                    className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-accent"
                                >
                                    <Avatar className="h-9 w-9 shrink-0">
                                        <AvatarFallback className="text-xs font-semibold bg-secondary text-secondary-foreground">
                                            {initials}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate text-foreground">
                                            {fullName}
                                        </p>
                                        <p className="text-xs truncate text-muted-foreground">
                                            {user.email}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] px-1.5 py-0.5 rounded capitalize bg-muted text-muted-foreground">
                                            {user.role}
                                        </span>
                                        {hasDM && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                                                Open
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            <ChatAttachmentPreviewDialog
                open={!!attachmentPreview}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setAttachmentPreview(null);
                }}
                fileUrl={attachmentPreview?.url ?? ''}
                fileName={attachmentPreview?.fileName ?? ''}
                fileType={attachmentPreview?.fileType ?? ''}
            />

            <ChatButton onClick={() => setShowNewDM(true)} />
        </div>
    );
};

export default TeamChat;
