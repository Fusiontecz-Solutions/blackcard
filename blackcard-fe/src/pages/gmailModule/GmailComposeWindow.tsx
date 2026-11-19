import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import {
  Bold, Italic, Underline, List, Link2, Paperclip, Trash2, X, Minus, Maximize2, Minimize2,
  MoreHorizontal, File as FileIcon,
} from 'lucide-react';
import {
  deleteGmailDraft,
  saveGmailDraft,
  sendGmailMailboxEmail,
  type GmailMailboxSendPayload,
} from '@/redux/actions/gmailActions';
import type { AppDispatch, RootState } from '@/redux/store';
import {
  fileToBase64,
  formatFileSize,
  groupSourceAttachments,
  sanitizeEmailHtml,
  type ComposeInitial,
  type ComposeSourceAttachment,
} from './gmailUtils';
import GmailComposePaymentTemplates from './GmailComposePaymentTemplates';
import LockedCcChips from '@/components/application/LockedCcChips';
import { useAlwaysCcEmails } from '@/hooks/useAlwaysCcEmails';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const TITLES: Record<ComposeInitial['mode'], string> = {
  new: 'New Message',
  reply: 'Reply',
  replyAll: 'Reply all',
  forward: 'Forward',
  draft: 'Draft',
};

const ToolbarButton = ({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground"
  >
    {children}
  </button>
);

interface Props {
  initial: ComposeInitial;
  onClose: () => void;
  /** Called after a successful send or draft save so the page can refresh. */
  onChanged: (event: { type: 'sent' | 'draftSaved' | 'draftDeleted'; threadId?: string }) => void;
}

const GmailComposeWindow = ({ initial, onClose, onChanged }: Props) => {
  const dispatch = useDispatch<AppDispatch>();
  const sendingEmail = useSelector((state: RootState) => state.gmail.sendingEmail);

  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState(initial.bcc);
  const [showCcBcc, setShowCcBcc] = useState(Boolean(initial.cc || initial.bcc));
  const alwaysCc = useAlwaysCcEmails();
  const [subject, setSubject] = useState(initial.subject);
  const [files, setFiles] = useState<File[]>([]);
  const [sourceAttachments, setSourceAttachments] = useState<ComposeSourceAttachment[]>(
    initial.sourceAttachments ?? [],
  );
  const [showQuoted, setShowQuoted] = useState(initial.mode === 'forward');
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [draftId, setDraftId] = useState(initial.draftId);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeEmailHtml(initial.bodyHtml || '');
      if (initial.mode !== 'draft') {
        editorRef.current.focus();
      }
    }
  }, [initial.key, initial.bodyHtml, initial.mode]);

  const totalAttachmentBytes = useMemo(
    () =>
      files.reduce((sum, f) => sum + f.size, 0) +
      sourceAttachments.reduce((sum, a) => sum + a.size, 0),
    [files, sourceAttachments],
  );

  const markDirty = () => setDirty(true);

  const getEditorPlainText = () => editorRef.current?.innerText ?? '';

  const handleApplyPaymentTemplate = (next: { bodyHtml: string; subject?: string }) => {
    if (editorRef.current) {
      editorRef.current.innerHTML = next.bodyHtml;
    }
    if (next.subject) {
      setSubject(next.subject);
    }
    markDirty();
    editorRef.current?.focus();
  };

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    markDirty();
  };

  const insertLink = () => {
    const url = window.prompt('Link URL');
    if (!url) return;
    exec('createLink', /^https?:\/\//i.test(url) || url.startsWith('mailto:') ? url : `https://${url}`);
  };

  const onPickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const picked = Array.from(list);
    const added = picked.reduce((sum, f) => sum + f.size, 0);
    if (totalAttachmentBytes + added > MAX_ATTACHMENT_BYTES) {
      toast.error('Attachments can’t exceed 25 MB in total');
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
    markDirty();
  };

  const buildPayload = async (): Promise<GmailMailboxSendPayload> => {
    const editorHtml = editorRef.current?.innerHTML ?? '';
    const body = initial.quotedHtml
      ? `<div>${editorHtml}</div><br>${initial.quotedHtml}`
      : `<div>${editorHtml}</div>`;
    const attachments = await Promise.all(
      files.map(async (file) => ({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        data: await fileToBase64(file),
      })),
    );
    return {
      to: to.trim(),
      cc: cc.trim(),
      bcc: bcc.trim(),
      subject: subject.trim(),
      body,
      threadId: initial.threadId,
      inReplyTo: initial.inReplyTo,
      references: initial.references,
      attachments,
      sourceAttachments: groupSourceAttachments(sourceAttachments),
      draftId,
    };
  };

  const hasContent = () =>
    Boolean(
      to.trim() ||
        cc.trim() ||
        bcc.trim() ||
        files.length ||
        (editorRef.current?.innerText || '').trim() ||
        (initial.mode === 'new' && subject.trim()),
    );

  const handleSend = async () => {
    if (!to.trim() && !cc.trim() && !bcc.trim()) {
      toast.error('Please specify at least one recipient');
      return;
    }
    if (!subject.trim() && !(editorRef.current?.innerText || '').trim()) {
      if (!window.confirm('Send this message without a subject or text in the body?')) return;
    }
    setBusy(true);
    try {
      const payload = await buildPayload();
      const sent = await dispatch(sendGmailMailboxEmail(payload)).unwrap();
      toast.success('Message sent');
      onChanged({ type: 'sent', threadId: sent?.threadId ?? sent?.message?.threadId ?? initial.threadId });
      onClose();
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : error?.message || 'Failed to send email');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    const shouldSave = (dirty || initial.mode === 'draft') && hasContent();
    if (!shouldSave) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      const payload = await buildPayload();
      const saved = await dispatch(saveGmailDraft(payload)).unwrap();
      if (saved?.id) setDraftId(saved.id);
      toast.info('Draft saved');
      onChanged({ type: 'draftSaved' });
      onClose();
    } catch (error: any) {
      toast.error(typeof error === 'string' ? error : 'Failed to save draft');
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    if (draftId) {
      try {
        await dispatch(deleteGmailDraft(draftId)).unwrap();
        toast.info('Draft discarded');
        onChanged({ type: 'draftDeleted' });
      } catch (error: any) {
        toast.error(typeof error === 'string' ? error : 'Failed to discard draft');
        return;
      }
    }
    onClose();
  };

  const containerClass = maximized
    ? 'crm-keep-case fixed inset-6 md:inset-x-[10%] md:inset-y-[6%] z-50 shadow-2xl flex flex-col'
    : `crm-keep-case fixed right-8 bottom-0 z-50 w-[560px] max-w-[calc(100vw-2rem)] shadow-2xl ${minimized ? '' : 'flex flex-col'}`;

  return (
    <div className={containerClass}>
      <div className={`rounded-t-lg border border-b-0 border-border bg-card flex flex-col ${maximized ? 'h-full rounded-lg border-b' : ''}`}>
        <div
          className="flex items-center justify-between px-3 py-2 rounded-t-lg cursor-pointer bg-muted/60"
          onClick={() => !maximized && setMinimized((v) => !v)}
        >
          <span className="text-[14px] font-medium text-foreground truncate">
            {subject.trim() || TITLES[initial.mode]}
          </span>
          <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
            {!maximized && (
              <ToolbarButton title={minimized ? 'Expand' : 'Minimize'} onClick={() => setMinimized((v) => !v)}>
                <Minus size={16} />
              </ToolbarButton>
            )}
            <ToolbarButton
              title={maximized ? 'Exit full screen' : 'Full screen'}
              onClick={() => {
                setMaximized((v) => !v);
                setMinimized(false);
              }}
            >
              {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </ToolbarButton>
            <ToolbarButton title="Save & close" onClick={() => void handleClose()}>
              <X size={16} />
            </ToolbarButton>
          </div>
        </div>

        {!minimized && (
          <div className={`flex flex-col ${maximized ? 'flex-1 min-h-0' : ''}`}>
            <div className="px-4 py-1.5 border-b border-border flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-8">To</span>
              <input
                type="text"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  markDirty();
                }}
                placeholder="Recipients (comma separated)"
                className="flex-1 bg-transparent outline-none text-sm py-1"
              />
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cc Bcc
                </button>
              )}
            </div>
            {/* Cc row: always shown when the server copies an address on every
                mail (locked chip, cannot be removed); otherwise behind "Cc Bcc". */}
            {(showCcBcc || alwaysCc.length > 0) && (
              <div className="px-4 py-1.5 border-b border-border flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground w-8">Cc</span>
                <LockedCcChips />
                <input
                  type="text"
                  value={cc}
                  onChange={(e) => {
                    setCc(e.target.value);
                    markDirty();
                  }}
                  className="flex-1 min-w-[8rem] bg-transparent outline-none text-sm py-1"
                />
              </div>
            )}
            {showCcBcc && (
              <>
                <div className="px-4 py-1.5 border-b border-border flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-8">Bcc</span>
                  <input
                    type="text"
                    value={bcc}
                    onChange={(e) => {
                      setBcc(e.target.value);
                      markDirty();
                    }}
                    className="flex-1 bg-transparent outline-none text-sm py-1"
                  />
                </div>
              </>
            )}
            <div className="px-4 border-b border-border">
              <input
                type="text"
                placeholder="Subject"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  markDirty();
                }}
                className="w-full bg-transparent outline-none text-sm py-2.5"
              />
            </div>

            <div className={`px-4 py-3 overflow-y-auto ${maximized ? 'flex-1 min-h-0' : 'h-72'}`}>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={markDirty}
                className="min-h-[120px] outline-none text-[14px] leading-relaxed prose prose-sm dark:prose-invert max-w-none break-words"
              />
              {initial.quotedHtml && (
                <div className="mt-2">
                  <button
                    type="button"
                    title={showQuoted ? 'Hide quoted text' : 'Show trimmed content'}
                    onClick={() => setShowQuoted((v) => !v)}
                    className="px-2 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {showQuoted && (
                    <div
                      className="mt-2 text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none break-words"
                      dangerouslySetInnerHTML={{ __html: initial.quotedHtml }}
                    />
                  )}
                </div>
              )}

              {(files.length > 0 || sourceAttachments.length > 0) && (
                <div className="mt-4 flex flex-col gap-1.5">
                  {sourceAttachments.map((att) => (
                    <div
                      key={`${att.messageId}-${att.partId}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/60 text-sm"
                    >
                      <FileIcon size={14} className="opacity-60" />
                      <span className="truncate flex-1 text-[#1a73e8]">{att.filename}</span>
                      <span className="text-xs text-muted-foreground">{formatFileSize(att.size)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setSourceAttachments((prev) => prev.filter((a) => a !== att));
                          markDirty();
                        }}
                        className="p-0.5 rounded hover:bg-black/10"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {files.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-muted/60 text-sm"
                    >
                      <FileIcon size={14} className="opacity-60" />
                      <span className="truncate flex-1 text-[#1a73e8]">{file.name}</span>
                      <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFiles((prev) => prev.filter((_, i) => i !== index));
                          markDirty();
                        }}
                        className="p-0.5 rounded hover:bg-black/10"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="flex items-center gap-1">
                <button
                  className="bg-[#1a73e8] hover:bg-[#1557b0] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2 rounded-full transition-colors mr-2"
                  onClick={() => void handleSend()}
                  disabled={busy || sendingEmail}
                >
                  {busy || sendingEmail ? 'Sending…' : 'Send'}
                </button>
                <ToolbarButton title="Bold" onClick={() => exec('bold')}>
                  <Bold size={16} />
                </ToolbarButton>
                <ToolbarButton title="Italic" onClick={() => exec('italic')}>
                  <Italic size={16} />
                </ToolbarButton>
                <ToolbarButton title="Underline" onClick={() => exec('underline')}>
                  <Underline size={16} />
                </ToolbarButton>
                <ToolbarButton title="Bulleted list" onClick={() => exec('insertUnorderedList')}>
                  <List size={16} />
                </ToolbarButton>
                <ToolbarButton title="Insert link" onClick={insertLink}>
                  <Link2 size={16} />
                </ToolbarButton>
                <ToolbarButton title="Attach files" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip size={16} />
                </ToolbarButton>
                <GmailComposePaymentTemplates
                  composeMode={initial.mode}
                  subject={subject}
                  getEditorPlainText={getEditorPlainText}
                  onApplyTemplate={handleApplyPaymentTemplate}
                  disabled={busy || sendingEmail}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    onPickFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </div>
              <ToolbarButton title="Discard draft" onClick={() => void handleDiscard()}>
                <Trash2 size={16} />
              </ToolbarButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GmailComposeWindow;
