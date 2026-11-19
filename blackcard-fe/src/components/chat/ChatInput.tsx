import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Send, Plus, X } from 'lucide-react';
import { axiosPostFormData } from '@/redux/axios';

export interface ChatAttachment {
  url: string;
  publicId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface MentionParticipant {
  id: string;
  firstName: string;
  lastName: string;
}

interface ChatInputProps {
  onSendMessage: (message: string, attachments?: ChatAttachment[]) => void;
  disabled?: boolean;
  placeholder?: string;
  participants?: MentionParticipant[];
  onTypingStart?: () => void;
  onTypingStop?: () => void;
}

export const ChatInput = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Comment or add others with @',
  participants = [],
  onTypingStart,
  onTypingStop,
}: ChatInputProps) => {
  const [message, setMessage] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filteredParticipants = mentionQuery
    ? participants
        .filter(
          (p) =>
            p.id !== undefined &&
            `${p.firstName} ${p.lastName}`.toLowerCase().includes(mentionQuery.toLowerCase())
        )
        .slice(0, 8)
    : [];
  const showMentionDropdown = mentionStartIndex !== null && filteredParticipants.length > 0;

  useEffect(() => {
    if (!showMentionDropdown) setSelectedMentionIndex(0);
  }, [showMentionDropdown, filteredParticipants.length]);

  const insertMention = (participant: MentionParticipant) => {
    const name = `@${participant.firstName} ${participant.lastName} `;
    if (textareaRef.current && mentionStartIndex !== null) {
      const before = message.slice(0, mentionStartIndex);
      const after = message.slice(textareaRef.current.selectionStart);
      const newMessage = before + name + after;
      setMessage(newMessage);
      setMentionQuery('');
      setMentionStartIndex(null);
      setTimeout(() => {
        textareaRef.current?.focus();
        const pos = mentionStartIndex + name.length;
        textareaRef.current?.setSelectionRange(pos, pos);
      }, 0);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setMessage(value);

    onTypingStart?.();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTypingStop?.();
      typingTimeoutRef.current = null;
    }, 2000);

    const textBeforeCursor = value.slice(0, cursor);
    const lastAt = textBeforeCursor.lastIndexOf('@');
    if (lastAt !== -1) {
      const between = textBeforeCursor.slice(lastAt + 1);
      if (/^[\w\s]*$/.test(between) && !between.includes('\n')) {
        setMentionStartIndex(lastAt);
        setMentionQuery(between.trim());
        return;
      }
    }
    setMentionStartIndex(null);
    setMentionQuery('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentionDropdown) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex((i) => Math.min(i + 1, filteredParticipants.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const selected = filteredParticipants[selectedMentionIndex];
        if (selected) insertMention(selected);
        return;
      }
      if (e.key === 'Escape') {
        setMentionStartIndex(null);
        setMentionQuery('');
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    onTypingStop?.();
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    const trimmed = message.trim();
    if ((trimmed || pendingAttachments.length > 0) && !disabled) {
      onSendMessage(trimmed || '', pendingAttachments.length > 0 ? pendingAttachments : undefined);
      setMessage('');
      setPendingAttachments([]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.append('file', file);
        const res = await axiosPostFormData('/uploads/single', formData);
        const d = res.data?.data;
        if (d?.url && d?.publicId) {
          setPendingAttachments((prev) => [
            ...prev,
            {
              url: d.url,
              publicId: d.publicId,
              fileName: d.originalName ?? file.name,
              fileType: file.type || 'application/octet-stream',
              fileSize: d.size ?? file.size ?? 0,
            },
          ]);
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col p-3 border-t border-gray-700/80 bg-[#1e1e24]">
      {pendingAttachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pendingAttachments.map((att, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-700 text-gray-200 text-sm"
            >
              <span className="truncate max-w-[120px]" title={att.fileName}>
                {att.fileName}
              </span>
              <button
                type="button"
                onClick={() => removeAttachment(i)}
                className="p-0.5 rounded hover:bg-gray-600 text-gray-400"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2 relative">
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 w-9 h-9 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center cursor-pointer mb-2 justify-center text-gray-300 transition-colors disabled:opacity-50"
          aria-label="Attach file"
        >
          <Plus className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          onChange={handleFileSelect}
        />
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => onTypingStart?.()}
            onBlur={() => {
              onTypingStop?.();
              if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
                typingTimeoutRef.current = null;
              }
            }}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className="w-full min-h-[42px] max-h-32 py-2.5 px-4 rounded-2xl bg-gray-700/80 border border-gray-600/50 text-gray-100 placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 disabled:opacity-50 text-sm"
          />
          {showMentionDropdown && (
            <div className="absolute bottom-full left-0 right-0 mb-1 py-1 bg-gray-800 border border-gray-600 rounded-xl shadow-xl z-10 max-h-48 overflow-y-auto">
              {filteredParticipants.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm text-gray-100 hover:bg-gray-700 ${
                    i === selectedMentionIndex ? 'bg-gray-700' : ''
                  }`}
                  onClick={() => insertMention(p)}
                >
                  {p.firstName} {p.lastName}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={disabled || (!message.trim() && pendingAttachments.length === 0)}
          className="shrink-0 w-9 h-9 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
