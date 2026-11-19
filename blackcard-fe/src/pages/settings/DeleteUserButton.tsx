import { useDispatch } from 'react-redux';
import { Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import type { User } from '@/types/userTypes';
import type { AppDispatch } from '@/redux/store';
import { deleteUser } from '@/redux/actions/settingsUserActions';

interface DeleteUserButtonProps {
  user: User;
  roleId: string;
}

export default function DeleteUserButton({ user, roleId }: DeleteUserButtonProps) {
  const dispatch = useDispatch<AppDispatch>();
  const id = user._id ?? (user as { id?: string }).id;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'this user';

  const handleClick = async () => {
    if (!id) return;
    if (!window.confirm(`Delete ${name}? This will permanently remove the user from the database.`)) {
      return;
    }
    try {
      await dispatch(deleteUser({ roleId, userId: id, user })).unwrap();
      toast.success('User deleted successfully');
    } catch (err: unknown) {
      const message =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message ?? 'Failed to delete user';
      toast.error(message);
    }
  };

  return (
    <button
      type="button"
      className="inline-flex items-center justify-center rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
      onClick={() => void handleClick()}
    >
      <Trash2 className="h-3 w-3 mr-1" />
      Delete
    </button>
  );
}
