import { useMemo, useState, useRef, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    MessageCircle,
    Send,
    Users,
    Video,
    Phone,
    MoreVertical,
    Search,
    Paperclip,
    Mic,
    Smile,
    Reply,
    Check,
    CheckCheck,
    MoreHorizontal,
} from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTeamChat } from '@/hooks/useTeamChat';
import { useChat } from '@/hooks/useChat';
import type { RootState, AppDispatch } from '@/redux/store';
import type { Conversation, Message as ReduxMessage, MessageSender } from '@/redux/slices/chatSlice';
import { fetchUsers } from '@/redux/actions/userActions';
import { createConversation } from '@/redux/actions/chatActions';
import { addConversation } from '@/redux/slices/chatSlice';

type DisplayMessage = {
    id: string | number;
    author: string;
    initials: string;
    isMe: boolean;
    time: string;
    text: string;
    status: 'sent' | 'delivered' | 'read';
};

function getInitials(sender: MessageSender | undefined): string {
    if (!sender) return '?';
    const first = sender.firstName?.trim().charAt(0) ?? '';
    const last = sender.lastName?.trim().charAt(0) ?? '';
    if (first || last) return `${first}${last}`.toUpperCase();
    return (sender.email ?? '').charAt(0).toUpperCase() || '?';
}

function getAuthorName(sender: MessageSender | undefined): string {
    if (!sender) return 'Unknown';
    const name = [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim();
    return name || sender.email || 'Unknown';
}

function toDisplayMessage(msg: ReduxMessage, currentUserId: string): DisplayMessage {
    const senderId = String(msg.senderId ?? (msg.sender as MessageSender)?._id ?? (msg.sender as MessageSender)?.id ?? '');
    const isMe = senderId === String(currentUserId);
    const sender = msg.sender as MessageSender | undefined;
    const time = new Date(msg.createdAt).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
    let status: 'sent' | 'delivered' | 'read' = 'sent';
    if (msg.messageReads?.length) status = 'read';
    else if (msg.deliveredAt) status = 'delivered';
    return {
        id: msg.id ?? msg._id ?? msg.createdAt,
        author: getAuthorName(sender),
        initials: getInitials(sender),
        isMe,
        time,
        text: msg.content ?? '',
        status,
    };
}

const EMOJI_CATEGORIES: Record<string, string[]> = {
    'Recently Used': ['😀', '😂', '❤️', '👍', '😊', '🎉', '🔥', '💯'],
    'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰'],
};

export interface MessageProps {
    /** When provided (e.g. from Team Chat page), this conversation is shown. Otherwise default Team Chat is used. */
    selectedConversationId?: string | null;
    /** Optional class for the root container (e.g. h-full when embedded in a layout). */
    className?: string;
    /** When provided, called to change the selected conversation (e.g. from sidebar agent click). */
    onSelectConversation?: (conversationId: string | null) => void;
}

type SidebarAgent = {
    name: string;
    initials: string;
    status: string;
    lastMsg: string;
    active: boolean;
    userId?: string | null;
    isChannel?: boolean;
};

function getConversationTitle(conv: Conversation | null, currentUserId: string): string {
    if (!conv) return 'Team Chat';
    if (conv.type === 'DIRECT') {
        const other = conv.participants?.find((p) => p.userId !== currentUserId)?.user as
            | (MessageSender & { firstName?: string; lastName?: string; email?: string })
            | undefined;
        if (!other) return 'Direct Message';
        const name = [other.firstName, other.lastName].filter(Boolean).join(' ').trim();
        return name || other.email || 'Direct Message';
    }
    return conv.name || 'Team Chat';
}

const Message = ({ selectedConversationId, className, onSelectConversation }: MessageProps) => {
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';
    const dispatch = useDispatch<AppDispatch>();
    const [input, setInput] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const emojiPickerRef = useRef<HTMLDivElement | null>(null);

    const teamChat = useTeamChat();
    const selectedChat = useChat(selectedConversationId ?? null);

    const useSelected = !!selectedConversationId;
    const {
        conversationId,
        currentUserId,
        conversation,
        messages: reduxMessages,
        typingUsers,
        loading,
        sendMessage,
        messagesEndRef,
        emitTypingStart,
        emitTypingStop,
        isConnected,
    } = useSelected ? selectedChat : teamChat;

    const onlineUsers = useSelector((state: RootState) => state.chat.onlineUsers);
    const allUsers = useSelector((state: RootState) => state.users.data || []);
    const conversations = useSelector((state: RootState) => state.chat.conversations as Conversation[]);

    // Ensure we have the full user list so the sidebar can show all members
    useEffect(() => {
        dispatch(fetchUsers({}));
    }, [dispatch]);

    const displayMessages = useMemo<DisplayMessage[]>(
        () => reduxMessages.map((m) => toDisplayMessage(m, currentUserId)),
        [reduxMessages, currentUserId]
    );

    const onlineAgents = useMemo<SidebarAgent[]>(() => {
        const currentId = currentUserId || '';

        const list: SidebarAgent[] = (allUsers as any[])
            .filter((u) => {
                const id = u._id || (u as any).id;
                if (!id) return false;
                return id !== currentId;
            })
            .map((u) => {
                const id = u._id || (u as any).id;
                const name =
                    [u.firstName, u.lastName].filter(Boolean).join(' ').trim() ||
                    u.email ||
                    'Unknown';
                const initials =
                    (name || u.email || 'U')
                        .split(' ')
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((part: string) => part.charAt(0).toUpperCase())
                        .join('') || 'U';
                const isOnline = id ? onlineUsers.includes(String(id)) : false;
                // Find existing DIRECT conversation with this user (same logic as FloatingChatWidget)
                const directConv = (conversations || []).find(
                    (c) =>
                        c.type === 'DIRECT' &&
                        c.participants?.some((p) => p.userId === id) &&
                        c.participants?.some((p) => p.userId === currentId)
                );
                const isActive = useSelected && !!selectedConversationId && directConv?.id === selectedConversationId;
                return {
                    name,
                    initials,
                    status: isOnline ? 'Online' : 'Away',
                    lastMsg: '',
                    active: isActive,
                    userId: id ?? null,
                    isChannel: false,
                };
            });
        const channelName = conversation?.name ?? 'Team Chat';
        const channelInitials =
            channelName
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part.charAt(0).toUpperCase())
                .join('') || 'TC';
        const channelItem: SidebarAgent = {
            name: channelName,
            initials: channelInitials,
            status: 'Online',
            lastMsg: '',
            active: !useSelected,
            userId: null,
            isChannel: true,
        };
        return [channelItem, ...list];
    }, [allUsers, conversation?.name, conversations, currentUserId, onlineUsers, selectedConversationId, useSelected]);

    const handleAgentClick = (agent: SidebarAgent) => {
        // Clicking on the channel item returns to Team Chat
        if (agent.isChannel) {
            if (onSelectConversation) {
                onSelectConversation(null);
            }
            return;
        }

        if (!agent.userId || !currentUserId) return;

        const targetId = agent.userId;
        const currentId = currentUserId;

        // Try to find an existing DIRECT conversation with this agent (mirror FloatingChatWidget)
        const existing = (conversations || []).find(
            (c) =>
                c.type === 'DIRECT' &&
                c.participants?.some((p) => p.userId === targetId) &&
                c.participants?.some((p) => p.userId === currentId)
        );

        if (existing) {
            if (onSelectConversation) {
                onSelectConversation(existing.id);
            }
            return;
        }

        // No conversation exists yet – create a new DIRECT conversation
        dispatch(
            createConversation({
                type: 'DIRECT',
                participantIds: [targetId],
            })
        ).then((result) => {
            if (createConversation.fulfilled.match(result) && result.payload) {
                const conv = result.payload;
                dispatch(addConversation(conv));
                if (onSelectConversation) {
                    onSelectConversation(conv.id);
                }
            }
        });
    };

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        sendMessage(input);
        setInput('');
        emitTypingStop();
    };

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

    const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files?.length) return;
        const names = Array.from(files).map((f) => f.name).join(', ');
        setInput((prev) => `${prev}${prev ? ' ' : ''}[Attached: ${names}]`);
        e.target.value = '';
    };

    return (
        <div className={`flex overflow-hidden ${className ? 'h-full min-h-0' : 'h-screen'} ${isDark ? 'bg-[#0b141a] text-white' : 'bg-[#f0f2f5] text-black'} ${className ?? ''}`}>
            {/* Sidebar - Conversation list */}
            <div className={`hidden md:flex flex-col w-80 lg:w-96 border-r ${isDark ? 'border-[#222d34] bg-[#111b21]' : 'border-gray-300 bg-white'}`}>
                <div className="p-4 flex justify-between items-center bg-[#f0f2f5] dark:bg-[#202c33]">
                    <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-slate-500 text-white">JC</AvatarFallback>
                    </Avatar>
                    <div className="flex gap-4 text-muted-foreground">
                        <Users className="size-5 cursor-pointer" />
                        <MessageCircle className="size-5 cursor-pointer" />
                        <MoreVertical className="size-5 cursor-pointer" />
                    </div>
                </div>
                <div className="p-2">
                    <div className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${isDark ? 'bg-[#202c33]' : 'bg-gray-100'}`}>
                        <Search className="size-4 text-muted-foreground" />
                        <input placeholder="Search or start new chat" className="bg-transparent border-none text-sm focus:outline-none w-full" />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {onlineAgents.map((agent) => (
                        <div
                            key={agent.name}
                            className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-[#f5f6f6] dark:hover:bg-[#2a3942] ${agent.active ? 'bg-[#ebebeb] dark:bg-[#2a3942]' : ''}`}
                            onClick={() => handleAgentClick(agent)}
                        >
                            <div className="relative">
                                <Avatar>
                                    <AvatarFallback className="bg-[image:var(--brand-gradient)] text-white">{agent.initials}</AvatarFallback>
                                </Avatar>
                                <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 ${isDark ? 'border-[#111b21]' : 'border-white'} ${agent.status === 'Online' ? 'bg-emerald-500' : 'bg-yellow-400'}`} />
                            </div>
                            <div className="flex-1 border-b dark:border-[#222d34] pb-3">
                                <div className="flex justify-between">
                                    <span className="font-medium">{agent.name}</span>
                                    <span className="text-xs text-muted-foreground">09:18 AM</span>
                                </div>
                                <p className="text-sm text-muted-foreground truncate">{agent.lastMsg}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main chat area */}
            <div className="flex-1 flex flex-col relative">
                <div className={`px-4 py-2 flex items-center justify-between border-b ${isDark ? 'bg-[#202c33] border-none' : 'bg-[#f0f2f5] border-gray-300'}`}>
                    <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-[image:var(--brand-gradient)] text-white">GT</AvatarFallback>
                        </Avatar>
                        <div>
                            <h2 className="font-semibold text-sm md:text-base">
                                {getConversationTitle(useSelected ? conversation : teamChat.conversation, currentUserId)}
                            </h2>
                            {!useSelected && (
                                <p className="text-xs text-muted-foreground">
                                    {onlineAgents.length ? ` · ${onlineAgents.length} members` : ''}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-5 text-muted-foreground">
                        <Video className="size-5 cursor-pointer hover:text-primary transition-colors" />
                        <Phone className="size-5 cursor-pointer hover:text-primary transition-colors" />
                        <div className="h-6 w-[1px] bg-gray-400/30 mx-1" />
                        <Search className="size-5 cursor-pointer" />
                        <DropdownMenu>
                            <DropdownMenuTrigger><MoreVertical className="size-5 cursor-pointer" /></DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem>Contact Info</DropdownMenuItem>
                                <DropdownMenuItem>Select Messages</DropdownMenuItem>
                                <DropdownMenuItem>Mute Notifications</DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive">Clear Chat</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                <div
                    className="flex-1 p-4 md:p-8 overflow-y-auto space-y-4"
                    style={{ backgroundImage: isDark ? 'url("https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png")' : 'none' }}
                >
                    {loading && (
                        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                            Setting up Team Chat...
                        </div>
                    )}
                    {!loading && !conversationId && (
                        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                            {useSelected ? 'Select a conversation' : 'No team channel available. Try again in a moment.'}
                        </div>
                    )}
                    {!loading && conversationId && displayMessages.map((msg) => (
                        <div key={String(msg.id)} className={`flex ${msg.isMe ? 'justify-end' : 'justify-start'} group`}>
                            <div className={`relative max-w-[70%] px-3 py-2 rounded-lg shadow-sm ${msg.isMe ? (isDark ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#dcf8c6] text-black') : (isDark ? 'bg-[#202c33] text-[#e9edef]' : 'bg-white text-black')}`}>
                                {!msg.isMe && <p className="text-xs font-bold text-orange-400 mb-1">{msg.author}</p>}
                                <div className="flex flex-col">
                                    <span className="text-sm pr-12">{msg.text}</span>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground self-end mt-1 uppercase">
                                        <span>{msg.time}</span>
                                        {msg.isMe && (
                                            <>
                                                {msg.status === 'sent' && <Check className="w-3 h-3 text-gray-400" />}
                                                {msg.status === 'delivered' && <CheckCheck className="w-3 h-3 text-gray-400" />}
                                                {msg.status === 'read' && <CheckCheck className="w-3 h-3 text-[#53bdeb]" />}
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button className="p-1 hover:bg-black/10 rounded-full"><MoreHorizontal className="size-4" /></button>
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
                    ))}
                    {!loading && conversationId && typingUsers.length > 0 && (
                        <div className="flex justify-start">
                            <div className={`px-3 py-2 rounded-lg text-sm ${isDark ? 'bg-[#202c33]' : 'bg-white'}`}>
                                <span className="text-muted-foreground text-xs">{typingUsers.map((t) => t.userName).join(', ')} typing...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className={`relative p-3 flex items-center gap-4 ${isDark ? 'bg-[#202c33]' : 'bg-[#f0f2f5]'}`}>
                    {showEmojiPicker && (
                        <div ref={emojiPickerRef} className={`absolute bottom-full left-0 mb-2 w-[280px] max-h-[320px] rounded-lg shadow-2xl border overflow-y-auto ${isDark ? 'bg-[#1e2329] border-[#2a3942]' : 'bg-white border-gray-200'}`} style={{ zIndex: 1000 }}>
                            <div className="p-2">
                                {Object.entries(EMOJI_CATEGORIES).map(([category, emojis]) => (
                                    <div key={category} className="mb-2">
                                        <h3 className={`text-xs font-semibold mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{category}</h3>
                                        <div className="grid grid-cols-8 gap-1">
                                            {emojis.map((emoji, idx) => (
                                                <button key={`${category}-${idx}`} type="button" onClick={() => handleEmojiSelect(emoji)} className={`text-2xl p-1 rounded hover:bg-opacity-20 ${isDark ? 'hover:bg-white' : 'hover:bg-gray-200'}`}>
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="flex gap-3 text-muted-foreground">
                        <Smile className={`size-6 cursor-pointer ${showEmojiPicker ? 'text-[#00a884]' : ''}`} onClick={() => setShowEmojiPicker((p) => !p)} data-emoji-button />
                        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFilesSelected} />
                        <Paperclip className="size-6 cursor-pointer" onClick={() => fileInputRef.current?.click()} />
                    </div>
                    <form className="flex-1" onSubmit={handleSendMessage}>
                        <Input
                            value={input}
                            onChange={(e) => { setInput(e.target.value); if (e.target.value.trim()) emitTypingStart(); }}
                            onBlur={emitTypingStop}
                            placeholder={isConnected ? 'Type a message' : 'Connecting...'}
                            disabled={!conversationId || !isConnected}
                            className={`border-none focus-visible:ring-0 ${isDark ? 'bg-[#2a3942]' : 'bg-white'}`}
                        />
                    </form>
                    {input.trim() ? (
                        <Button type="submit" onClick={handleSendMessage} size="icon" className="rounded-full bg-[#00a884] hover:bg-[#008f6f]" disabled={!conversationId || !isConnected}>
                            <Send className="size-5 text-white" />
                        </Button>
                    ) : (
                        <Mic className="size-6 text-muted-foreground cursor-pointer" />
                    )}
                </div>
            </div>
        </div>
    );
};

export default Message;
