import type React from 'react';
import { Check, CheckCheck } from 'lucide-react';
import type { Message } from '@/redux/slices/chatSlice';
import { formatDate, formatTimeET, isTodayET, isYesterdayET } from '@/lib/utils';

const roleLabel = (role: string | undefined): string => {
  if (!role) return '';
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

/** Split content by @Name patterns and render @mentions in bold */
function renderContentWithMentions(content: string): React.ReactNode {
  if (!content) return null;
  const parts: React.ReactNode[] = [];
  const regex = /@([^\s@]+(?:\s+[^\s@]+)*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <strong key={match.index} className="font-semibold text-blue-300">
        @{match[1]}
      </strong>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  return parts.length > 0 ? <>{parts}</> : content;
}

/** "Today at 14:13" or "Yesterday at 14:13" or short date */
const formatMessageTime = (dateString: string): string => {
  const date = new Date(dateString);
  const time = formatTimeET(date);
  if (isTodayET(date)) return `Today at ${time}`;
  if (isYesterdayET(date)) return `Yesterday at ${time}`;
  return `${formatDate(date)} ${time}`;
};

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  currentUserId: string;
  /** When true (group chat), show sender name for every message */
  isGroupChat?: boolean;
  /** Optional role override (e.g. from conversation participant) */
  senderRole?: string;
}

export const MessageBubble = ({
  message,
  isOwnMessage,
  currentUserId,
  isGroupChat = false,
  senderRole,
}: MessageBubbleProps) => {
  if (message.isDeleted) {
    return (
      <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
        <div className="max-w-[75%] px-4 py-2 rounded-xl bg-gray-700/50 text-gray-400 italic text-sm">
          Message deleted
        </div>
      </div>
    );
  }

  const sender = message.sender;
  const senderName = sender
    ? `${sender.firstName} ${sender.lastName}`.trim() || 'Unknown'
    : 'Unknown';
  const role = senderRole ?? (sender?.role as string | undefined);
  const roleDisplay = roleLabel(role);
  const messageTime = formatMessageTime(message.createdAt);
  const avatarInitial = senderName.charAt(0).toUpperCase();
  const avatarUrl = sender?.profilePicture;

  const msgId = message.id ?? message._id;
  const isTempMessage = typeof msgId === 'string' && msgId.startsWith('temp-');
  const isDelivered = message.deliveredAt != null || (msgId != null && !isTempMessage);
  const isRead = Array.isArray(message.messageReads) && message.messageReads.length > 0;

  const statusTicks = isOwnMessage && (
    <span className="inline-flex items-center shrink-0" title={isRead ? 'Read' : isDelivered ? 'Delivered' : 'Sending'}>
      {isRead ? (
        <CheckCheck className="h-3.5 w-3.5 text-blue-400" aria-label="Read" />
      ) : isDelivered ? (
        <Check className="h-3.5 w-3.5 text-gray-400" aria-label="Delivered" />
      ) : null}
    </span>
  );

  /** For own messages: never show avatar (sender only sees "You"); for others show name + avatar */
  const showSenderLine = isGroupChat || !isOwnMessage;
  const displayName = isOwnMessage ? 'You' : senderName;

  const avatarEl = (
    <div className="shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gray-600 flex items-center justify-center text-white text-sm font-medium">
      {avatarUrl ? (
        <img src={avatarUrl} alt={senderName} className="w-full h-full object-cover" />
      ) : (
        avatarInitial
      )}
    </div>
  );

  return (
    <div className={`flex gap-2 ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isOwnMessage && avatarEl}
      {/* Sender's own messages: no avatar, only bubble + time + ticks ("You" in group) */}
      <div className={`flex flex-col max-w-[75%] min-w-0 ${isOwnMessage ? 'items-end' : 'items-start'}`}>
        {showSenderLine && (
          <div className="flex items-center gap-2 mb-0.5 px-1 w-full justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-semibold text-gray-100 truncate">{displayName}</span>
              {!isOwnMessage && roleDisplay && (
                <span className="shrink-0 text-xs px-1.5 py-0.5 rounded bg-gray-600 text-gray-300">
                  {roleDisplay}
                </span>
              )}
            </div>
            <span className="text-xs text-gray-400 shrink-0">{messageTime}</span>
          </div>
        )}

        <div
          className={`px-4 py-2.5 rounded-2xl ${
            isOwnMessage
              ? 'bg-primary text-primary-foreground rounded-br-md'
              : 'bg-gray-700 text-gray-100 rounded-bl-md'
          }`}
        >
          {message.replyTo && (
            <div className="mb-2 pb-2 border-b border-gray-500/50">
              <div className="text-xs opacity-80">
                {message.replyTo.sender.firstName} {message.replyTo.sender.lastName}
              </div>
              <div className="text-sm opacity-90 truncate max-w-[200px]">
                {message.replyTo.content}
              </div>
            </div>
          )}

          <div className="text-sm whitespace-pre-wrap break-words">
            {renderContentWithMentions(message.content)}
          </div>

          {message.attachments && message.attachments.length > 0 && (
            <div className="mt-2 space-y-2">
              {message.attachments.map((attachment) => (
                <div key={attachment.id} className="mt-2">
                  {attachment.fileType.startsWith('image/') ? (
                    <img
                      src={attachment.url}
                      alt={attachment.fileName}
                      className="max-w-full max-h-48 h-auto rounded-lg object-contain"
                    />
                  ) : (
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={attachment.fileName}
                      className="inline-flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-600/50 hover:bg-gray-600 text-sm text-blue-300 hover:underline"
                    >
                      <span>📎</span>
                      <span className="truncate max-w-[180px]" title={attachment.fileName}>
                        {attachment.fileName}
                      </span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 mt-1 px-1 flex-wrap">
          {isOwnMessage && (
            <>
              <span className="text-xs text-gray-400">{messageTime}</span>
              {statusTicks}
            </>
          )}
          {message.isEdited && (
            <span className="text-xs text-gray-400 italic">(edited)</span>
          )}
        </div>
      </div>
      {/* No avatar for own messages – sender only sees "You" / bubble / time / ticks */}
    </div>
  );
};
