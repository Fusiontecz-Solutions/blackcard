import { memo } from 'react';
import { useDispatch } from 'react-redux';
import { Trash2 } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { User } from '@/types/userTypes';
import type { AppDispatch } from '@/redux/store';
import { deleteUser } from '@/redux/actions/settingsUserActions';
import { formatDate as formatDateUtil } from "@/lib/utils";

function formatDate(dateStr: string | undefined): string {
  return formatDateUtil(dateStr ?? "", "—");
}

interface FinalUnderwriterProps {
  users: User[];
  loading: boolean;
  error: string | null;
}

function FINALUNDERWRITER({ users, loading, error }: FinalUnderwriterProps) {
  const dispatch = useDispatch<AppDispatch>();
  const list = users ?? [];

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading final underwriters...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-destructive">
        {error}
      </div>
    );
  }
  if (!list.length) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No final underwriters found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-[image:var(--brand-gradient)] hover:bg-[image:var(--brand-gradient)] dark:bg-primary border-b-0">
            <TableHead className="text-white font-medium">REPRESENTATIVE</TableHead>
            <TableHead className="text-white font-medium">EMAIL</TableHead>
            <TableHead className="text-white font-medium">PHONE</TableHead>
            <TableHead className="text-white font-medium">DATE</TableHead>
            <TableHead className="text-white font-medium text-left">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.map((user) => {
            const id = user._id ?? (user as { id?: string }).id;
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
            const roleId = user.role || 'FINAL_UNDERWRITER';
            return (
              <TableRow key={id ?? ''} className="border-b border-border">
                <TableCell className="font-medium text-foreground">{name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell className="text-muted-foreground">{user.phone ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-left">
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-md border border-destructive/40 px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/5 transition-colors"
                    onClick={() => {
                      if (!id) return;
                      dispatch(
                        deleteUser({
                          roleId,
                          userId: id,
                          user,
                        })
                      );
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default memo(FINALUNDERWRITER);
