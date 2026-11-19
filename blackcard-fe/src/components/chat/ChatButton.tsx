import { MessageCircle } from 'lucide-react';
import { useSelector } from 'react-redux';
import type { RootState } from '@/redux/store';

interface ChatButtonProps {
  onClick: () => void;
  unreadCount?: number;
}

export const ChatButton = ({ onClick, unreadCount = 0 }: ChatButtonProps) => {
  const totalUnread = useSelector((state: RootState) => {
    return Object.values(state.chat.unreadCounts).reduce((sum, count) => sum + count, 0);
  });

  const displayCount = unreadCount || totalUnread;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 bg-[#2a2a2e] text-white rounded-full shadow-xl hover:bg-[#35353a] transition-all duration-200 flex items-center justify-center z-50 border border-gray-600/40"
      aria-label="Open chat"
    >
      <MessageCircle className="h-6 w-6 text-gray-200" />
      {displayCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-xs font-bold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center">
          {displayCount > 9 ? '9+' : displayCount}
        </span>
      )}
    </button>
  );
};
