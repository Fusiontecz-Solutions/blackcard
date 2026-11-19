import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { X, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { ChatWindow } from './ChatWindow';
import { fetchUsers } from '@/redux/actions/userActions';
import { createConversation, deleteConversation } from '@/redux/actions/chatActions';
import { addConversation } from '@/redux/slices/chatSlice';
import { formatLastSeen, formatLastSeenExact, formatLastSeenWithTime } from '@/lib/utils';
import type { RootState } from '@/redux/store';
import type { AppDispatch } from '@/redux/store';
import type { User } from '@/types/userTypes';
import type { Conversation } from '@/redux/slices/chatSlice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const roleLabel = (role: string): string => {
  const labels: Record<string, string> = {
    AGENT: 'Agent',
    SCRUBBING: 'Scrubbing',
    UNDERWRITER: 'Underwriter',
    ACCOUNTANT: 'Accountant',
    ADMIN: 'Admin',
    SUPER_ADMIN: 'Super Admin',
  };
  return labels[role] || role;
};

// Helper function to get first letter of user's name
const getInitial = (user: User): string => {
  const firstName = user.firstName || '';
  const lastName = user.lastName || '';
  const email = user.email || '';
  
  if (firstName) {
    return firstName.charAt(0).toUpperCase();
  }
  if (lastName) {
    return lastName.charAt(0).toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return '?';
};

// Helper function to generate a consistent color for avatar based on user ID
const getAvatarColor = (userId: string): string => {
  const colors = [
    '#5C6B7C', '#4F5C6A', '#6B7C8D', '#5A6B7C', '#4A5B6C',
    '#6C7D8E', '#5B6C7D', '#4B5C6D', '#7C8D9E', '#6D7E8F'
  ];
  // Use a simple hash of the user ID to pick a consistent color
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

interface ChatPanelProps {
  currentUserId: string;
  selectedUser: User | null;
  selectedConversation: Conversation | null;
  conversationId: string | null;
  onClose: () => void;
  onSelectUser: (user: User | null) => void;
  onSelectConversation: (conv: Conversation | null) => void;
  onGroupCreated: (conv: Conversation) => void;
  onSendMessage: (content: string) => void;
  /** When true, panel is embedded in Team Chat page – no close button, full height */
  embeddedInPage?: boolean;
}

export const ChatPanel = ({
  currentUserId,
  selectedUser,
  selectedConversation,
  conversationId,
  onClose,
  onSelectUser,
  onSelectConversation,
  onGroupCreated,
  onSendMessage,
  embeddedInPage = false,
}: ChatPanelProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const { data: users, loading, error } = useSelector((state: RootState) => state.users);
  const onlineUsers = useSelector((state: RootState) => state.chat.onlineUsers);
  const conversations = useSelector((state: RootState) => state.chat.conversations);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [activeTab, setActiveTab] = useState<'direct' | 'groups'>('direct');

  const unreadCounts = useSelector((state: RootState) => state.chat.unreadCounts);
  const directUnread = (conversations || []).filter((c) => c.type === 'DIRECT').reduce((sum, c) => sum + (unreadCounts[c.id] ?? 0), 0);
  const groupsUnread = (conversations || []).filter((c) => c.type === 'GROUP').reduce((sum, c) => sum + (unreadCounts[c.id] ?? 0), 0);

  useEffect(() => {
    dispatch(fetchUsers({}));
  }, [dispatch]);

  const userList = (users || []).filter((u) => (u._id || (u as any).id) !== currentUserId);
  const groupConversations = (conversations || []).filter((c) => c.type === 'GROUP');
  const isUserOnline = (userId: string) => onlineUsers.includes(userId);

  const showConversation = conversationId && (selectedUser || selectedConversation);
  const selectedUserId = selectedUser ? (selectedUser._id || (selectedUser as any).id) : '';
  const selectedUserOnline = showConversation && selectedUser && isUserOnline(selectedUserId);
  const selectedUserName = selectedUser
    ? `${selectedUser.firstName} ${selectedUser.lastName}`.trim() || selectedUser.email
    : '';
  const selectedUserRole = selectedUser ? roleLabel(selectedUser.role) : '';
  const headerTitle = selectedConversation
    ? (selectedConversation.name || 'Group')
    : showConversation
      ? `${selectedUserName} (${selectedUserRole})`
      : 'Chat Support';
  const headerSubtitle = selectedConversation
    ? `${(selectedConversation.participants?.length ?? 0)} members`
    : showConversation && selectedUser
? selectedUserOnline
                ? 'Online'
                : (selectedUser?.lastSeenAt ? formatLastSeenWithTime(selectedUser.lastSeenAt) : 'Last seen')
      : null;

  const handleCreateGroup = () => {
    if (!groupName.trim() || groupMemberIds.length === 0) return;
    setCreatingGroup(true);
    dispatch(
      createConversation({
        type: 'GROUP',
        name: groupName.trim(),
        participantIds: groupMemberIds,
      })
    )
      .then((result) => {
        if (createConversation.fulfilled.match(result)) {
          const conv = result.payload;
          dispatch(addConversation(conv));
          onGroupCreated(conv);
          setShowCreateGroup(false);
          setGroupName('');
          setGroupMemberIds([]);
        }
      })
      .finally(() => setCreatingGroup(false));
  };

  const toggleGroupMember = (id: string) => {
    setGroupMemberIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleDeleteGroup = (convId: string, groupName: string) => {
    if (!window.confirm(`Delete group "${groupName || 'Unnamed group'}"? This cannot be undone.`)) return;
    dispatch(deleteConversation(convId))
      .then(() => {
        if (conversationId === convId) {
          onSelectConversation(null);
          onSelectUser(null);
        }
      })
      .catch((err) => console.error('Delete group failed:', err));
  };

  return (
    <div className="flex flex-col w-full h-full bg-[#1a1a1e] rounded-xl shadow-xl overflow-hidden">
      {/* Header: Back (when in conversation) + Title + Online/Last seen + Close */}
      <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b border-gray-700/80 bg-[#1e1e24]">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showConversation && (
            <button
              type="button"
              onClick={() => { onSelectUser(null); onSelectConversation(null); }}
              className="p-1.5 rounded-full hover:bg-gray-700 transition-colors shrink-0"
              aria-label="Back to list"
            >
              <ArrowLeft className="h-5 w-5 text-gray-400" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-100 truncate">
              {headerTitle}
            </h3>
            {headerSubtitle != null && (
              <p className="text-xs text-gray-400 truncate">
                {selectedUserOnline ? (
                  <span className="text-green-400">Online</span>
                ) : selectedConversation ? (
                  <span>{headerSubtitle}</span>
                ) : (
                  <span title={formatLastSeenExact(selectedUser?.lastSeenAt)}>
                    {formatLastSeen(selectedUser?.lastSeenAt)}
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showConversation && selectedConversation?.type === 'GROUP' && conversationId && (
            <button
              type="button"
              onClick={() => handleDeleteGroup(conversationId, selectedConversation?.name || '')}
              className="p-1.5 rounded-full hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition-colors"
              aria-label="Delete group"
              title="Delete group"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          )}
          {!embeddedInPage && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-gray-700 transition-colors shrink-0"
              aria-label="Close chat"
            >
              <X className="h-5 w-5 text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Body: user list OR conversation */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {showConversation ? (
          <ChatWindow
            conversationId={conversationId!}
            currentUserId={currentUserId}
            onClose={onClose}
            onSendMessage={onSendMessage}
            showHeader={false}
          />
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
            {/* Tabs: Direct / Groups with unread badges */}
            <div className="shrink-0 flex border-b border-gray-700/80 bg-[#1e1e24]">
              <button
                type="button"
                onClick={() => setActiveTab('direct')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'direct'
                    ? 'border-blue-500 text-gray-100'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                Direct
                {directUnread > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">
                    {directUnread > 99 ? '99+' : directUnread}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('groups')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'groups'
                    ? 'border-blue-500 text-gray-100'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                Groups
                {groupsUnread > 0 && (
                  <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-gray-600 text-gray-200 text-xs font-semibold flex items-center justify-center">
                    {groupsUnread > 99 ? '99+' : groupsUnread}
                  </span>
                )}
              </button>
            </div>

            {activeTab === 'groups' && (
              <>
                <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-gray-700/50">
                  <span className="text-sm font-medium text-gray-400">Groups</span>
                  <button
                    type="button"
                    onClick={() => setShowCreateGroup(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-200 bg-gray-700 hover:bg-gray-600 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Create group
                  </button>
                </div>
                {groupConversations.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">No groups yet. Create one to get started.</div>
                ) : (
                  <ul className="divide-y divide-gray-700/50 flex-1">
                    {groupConversations.map((conv) => {
                      const unread = unreadCounts[conv.id] ?? 0;
                      return (
                        <li key={conv.id} className="flex items-stretch group/list-item">
                          <button
                            type="button"
                            onClick={() => onSelectConversation(conv)}
                            className="flex-1 min-w-0 text-left px-4 py-3 text-sm hover:bg-gray-700/50 transition-colors"
                          >
                            <span className="font-medium text-gray-100 block">
                              {conv.name || 'Unnamed group'}
                            </span>
                            <span className="text-xs text-gray-400 flex items-center gap-2">
                              {(conv.participants?.length ?? 0)} members
                              {unread > 0 && (
                                <span className="rounded-full bg-primary text-primary-foreground text-xs px-1.5">
                                  {unread}
                                </span>
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteGroup(conv.id, conv.name || '');
                            }}
                            className="shrink-0 px-3 flex items-center justify-center text-gray-400 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                            aria-label={`Delete ${conv.name || 'group'}`}
                            title="Delete group"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {activeTab === 'direct' && (
              <>
                <div className="px-4 py-2 text-xs font-medium text-gray-400 border-b border-gray-700/50">
                  Users
                </div>
                {loading ? (
                  <div className="p-4 text-sm text-gray-400">Loading users...</div>
                ) : error ? (
                  <div className="p-4 text-sm text-red-400">{error}</div>
                ) : userList.length === 0 ? (
                  <div className="p-4 text-sm text-gray-400">
                    No other users. Create a group to chat with multiple people.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-700/50 flex-1">
                    {userList.map((user) => {
                      const id = user._id || (user as any).id;
                      const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
                      const role = roleLabel(user.role);
                      const online = isUserOnline(id);
                      const exactTime = formatLastSeenExact(user.lastSeenAt);
                      const directConv = (conversations || []).find(
                        (c) =>
                          c.type === 'DIRECT' &&
                          c.participants?.some((p) => p.userId === id) &&
                          c.participants?.some((p) => p.userId === currentUserId)
                      );
                      const unread = directConv ? (unreadCounts[directConv.id] ?? 0) : 0;
                      const initial = getInitial(user);
                      const avatarColor = getAvatarColor(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => onSelectUser(user)}
                            className="w-full text-left px-4 py-3 text-sm hover:bg-gray-700/50 transition-colors flex items-center gap-3"
                          >
                            {/* Avatar Circle */}
                            <div
                              className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm"
                              style={{ backgroundColor: avatarColor }}
                            >
                              {initial}
                            </div>
                            {/* User Info */}
                            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-gray-100 truncate">{name}</span>
                                <div className="flex items-center gap-2 shrink-0">
                                  {unread > 0 && (
                                    <span className="rounded-full bg-primary text-primary-foreground text-xs min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center font-medium">
                                      {unread > 99 ? '99+' : unread}
                                    </span>
                                  )}
                                  <span className="text-gray-400 text-xs">({role})</span>
                                </div>
                              </div>
                              <div className="text-xs text-gray-400" title={exactTime || undefined}>
                                {online ? (
                                  <span className="text-green-400">Online</span>
                                ) : (
                                  <span>{formatLastSeenWithTime(user.lastSeenAt)}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {showCreateGroup && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
                <div className="bg-[#1e1e24] rounded-xl shadow-xl border border-gray-700/80 max-w-md w-full max-h-[80vh] flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b border-gray-700/80">
                    <h3 className="font-semibold text-gray-100">Create group</h3>
                    <button
                      type="button"
                      onClick={() => { setShowCreateGroup(false); setGroupName(''); setGroupMemberIds([]); }}
                      className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="p-4 space-y-4 overflow-y-auto flex-1 min-h-0">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Group name</label>
                      <Input
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        placeholder="Enter group name"
                        className="w-full bg-gray-700/50 border-gray-600 text-gray-100 placeholder:text-gray-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Add members</label>
                      <ul className="border border-gray-600 rounded-xl divide-y divide-gray-700 max-h-48 overflow-y-auto bg-gray-800/30">
                        {userList.map((user) => {
                          const id = user._id || (user as any).id;
                          const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
                          const checked = groupMemberIds.includes(id);
                          return (
                            <li key={id}>
                              <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700/50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleGroupMember(id)}
                                  className="rounded border-gray-500 bg-gray-700 text-blue-500"
                                />
                                <span className="text-sm text-gray-100">{name}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                  <div className="p-4 border-t border-gray-700/80 flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => { setShowCreateGroup(false); setGroupName(''); setGroupMemberIds([]); }}
                      className="border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-gray-100"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateGroup}
                      disabled={!groupName.trim() || groupMemberIds.length === 0 || creatingGroup}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      {creatingGroup ? 'Creating...' : 'Create'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
