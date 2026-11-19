import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchUsers } from '@/redux/actions/userActions';
import type { RootState } from '@/redux/store';
import type { AppDispatch } from '@/redux/store';
import type { User } from '@/types/userTypes';

interface ChatUserListProps {
  currentUserId: string;
  selectedUserId: string | null;
  onSelectUser: (user: User) => void;
}

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

export const ChatUserList = ({ currentUserId, selectedUserId, onSelectUser }: ChatUserListProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const { data: users, loading, error } = useSelector((state: RootState) => state.users);

  useEffect(() => {
    dispatch(fetchUsers({}));
  }, [dispatch]);

  const list = (users || []).filter((u) => (u._id || (u as any).id) !== currentUserId);

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-w-[220px]">
        <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Loading users...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-w-[220px]">
        <div className="p-4 text-sm text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 min-w-[220px] overflow-hidden">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Users</h4>
      </div>
      <div className="flex-1 overflow-y-auto">
        {list.length === 0 ? (
          <div className="p-4 text-sm text-gray-500 dark:text-gray-400">No other users found.</div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {list.map((user) => {
              const id = user._id || (user as any).id;
              const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
              const role = roleLabel(user.role);
              const isSelected = selectedUserId === id;

              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onSelectUser(user)}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100'
                    }`}
                  >
                    <span className="font-medium">{name}</span>
                    <span className="text-gray-500 dark:text-gray-400"> ({role})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
