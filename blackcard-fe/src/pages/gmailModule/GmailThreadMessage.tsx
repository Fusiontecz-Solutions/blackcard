import { useState } from 'react';
import { ChevronDown, CornerUpLeft, CornerUpRight, Paperclip, ReplyAll, Star, User, File as FileIcon } from 'lucide-react';
import {
  displayName,
  formatFileSize,
  formatFullDate,
  getMessageAttachments,
  getMessageHtml,
  headerValue,
  parseAddressList,
  type MessageAttachment,
} from './gmailUtils';

interface Props {
  message: any;
  defaultExpanded: boolean;
  myEmail: string | null;
  onReply: (message: any, mode: 'reply' | 'replyAll' | 'forward') => void;
  onToggleStar: (message: any) => void;
  onDownload: (message: any, attachment: MessageAttachment) => void;
  onOpenDraft?: (message: any) => void;
}

const AttachmentIcon = ({ mimeType, filename }: { mimeType: string; filename: string }) => {
  const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
  const isImage = mimeType.startsWith('image/');
  const tone = isPdf
    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    : isImage
      ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
      : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
  return (
    <div className={`flex-shrink-0 w-10 h-10 rounded flex items-center justify-center text-[10px] font-bold ${tone}`}>
      {isPdf ? 'PDF' : <FileIcon size={18} />}
    </div>
  );
};

const GmailThreadMessage = ({
  message,
  defaultExpanded,
  myEmail,
  onReply,
  onToggleStar,
  onDownload,
  onOpenDraft,
}: Props) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showDetails, setShowDetails] = useState(false);

  const headers = message?.payload?.headers ?? [];
  const from = headerValue(headers, 'From');
  const to = headerValue(headers, 'To');
  const cc = headerValue(headers, 'Cc');
  const bcc = headerValue(headers, 'Bcc');
  const date = headerValue(headers, 'Date');
  const labelIds: string[] = message?.labelIds ?? [];
  const isDraft = labelIds.includes('DRAFT');
  const isStarred = labelIds.includes('STARRED');
  const sender = parseAddressList(from)[0];
  const me = String(myEmail || '').toLowerCase();
  const recipientsSummary = [...parseAddressList(to), ...parseAddressList(cc)]
    .map((a) => (me && a.email.toLowerCase() === me ? 'me' : a.name || a.email))
    .join(', ');

  if (!expanded) {
    return (
      <div
        onClick={() => setExpanded(true)}
        className="flex items-center gap-3 px-2 py-3 border-b border-border cursor-pointer hover:bg-muted/40"
      >
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User size={16} className="opacity-40" />
        </div>
        <span className="font-semibold text-sm w-48 truncate">
          {isDraft ? <span className="text-red-500">Draft</span> : displayName(from)}
        </span>
        <span className="flex-1 text-sm text-muted-foreground truncate">{message?.snippet}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatFullDate(message?.internalDate, date)}
        </span>
      </div>
    );
  }

  const html = getMessageHtml(message?.payload);
  const attachments = getMessageAttachments(message?.payload);

  return (
    <div className="py-4 border-b border-border">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="opacity-40" />
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 min-w-0" onClick={() => setExpanded(false)}>
              <span className="font-bold text-sm truncate cursor-pointer">
                {sender?.name || sender?.email || 'Unknown sender'}
              </span>
              {sender?.name && (
                <span className="text-xs opacity-60 truncate">&lt;{sender.email}&gt;</span>
              )}
              {isDraft && <span className="text-xs text-red-500 font-medium">Draft</span>}
            </div>
            <button
              type="button"
              className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1 hover:opacity-80 text-left"
              onClick={() => setShowDetails((v) => !v)}
            >
              to {recipientsSummary || 'undisclosed recipients'}
              <ChevronDown size={14} className={`transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            </button>
            {showDetails && (
              <div className="mt-2 text-xs text-muted-foreground space-y-1 rounded-md bg-muted/40 px-2 py-1.5">
                <div><span className="font-medium text-foreground/80">From: </span>{from || 'N/A'}</div>
                <div><span className="font-medium text-foreground/80">To: </span>{to || 'N/A'}</div>
                {cc && <div><span className="font-medium text-foreground/80">Cc: </span>{cc}</div>}
                {bcc && <div><span className="font-medium text-foreground/80">Bcc: </span>{bcc}</div>}
                <div><span className="font-medium text-foreground/80">Date: </span>{date}</div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <span className="mr-2">{formatFullDate(message?.internalDate, date)}</span>
          {!isDraft && (
            <>
              <button
                type="button"
                title={isStarred ? 'Unstar' : 'Star'}
                onClick={() => onToggleStar(message)}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <Star size={18} className={isStarred ? 'fill-yellow-400 text-yellow-400' : 'opacity-60'} />
              </button>
              <button
                type="button"
                title="Reply"
                onClick={() => onReply(message, 'reply')}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10"
              >
                <CornerUpLeft size={18} className="opacity-70" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-sm leading-relaxed mb-4 pl-[52px]">
        {html ? (
          <div
            className="prose prose-sm dark:prose-invert max-w-full overflow-x-auto break-words [&_img]:max-w-full [&_table]:w-full"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <span className="opacity-70">{message?.snippet || 'No preview available.'}</span>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="mb-4 pl-[52px]">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium">
            <Paperclip size={16} className="opacity-60" />
            Attachments ({attachments.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {attachments.map((att) => (
              <div
                key={`${att.partId}-${att.filename}`}
                onClick={() => onDownload(message, att)}
                className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/60 transition-colors group cursor-pointer"
              >
                <AttachmentIcon mimeType={att.mimeType} filename={att.filename} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                    {att.filename}
                  </div>
                  <div className="text-xs opacity-60">{formatFileSize(att.size)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pl-[52px]">
        {isDraft ? (
          <button
            type="button"
            onClick={() => onOpenDraft?.(message)}
            className="flex items-center gap-2 px-5 py-2 border border-border rounded-full text-sm font-medium hover:bg-muted"
          >
            Edit draft
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onReply(message, 'reply')}
              className="flex items-center gap-2 px-5 py-2 border border-border rounded-full text-sm font-medium hover:bg-muted"
            >
              <CornerUpLeft size={16} /> Reply
            </button>
            <button
              type="button"
              onClick={() => onReply(message, 'replyAll')}
              className="flex items-center gap-2 px-5 py-2 border border-border rounded-full text-sm font-medium hover:bg-muted"
            >
              <ReplyAll size={16} /> Reply all
            </button>
            <button
              type="button"
              onClick={() => onReply(message, 'forward')}
              className="flex items-center gap-2 px-5 py-2 border border-border rounded-full text-sm font-medium hover:bg-muted"
            >
              <CornerUpRight size={16} /> Forward
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GmailThreadMessage;
