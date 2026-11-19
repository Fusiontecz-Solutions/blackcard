import { memo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { User } from '@/types/userTypes';
import { formatDate as formatDateUtil } from "@/lib/utils";
import DeleteUserButton from './DeleteUserButton';
function formatDate(dateStr: string | undefined): string {
  return formatDateUtil(dateStr ?? "", "—");
}

interface UnderwriterProps {
  users: User[];
  loading: boolean;
  error: string | null;
}

function SCRUBBING({ users, loading, error }: UnderwriterProps) {
  const list = users ?? [];

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading scrubbing users...
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
        No scrubbing users found.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-[#003465] dark:bg-primary hover:bg-[#003465] dark:hover:bg-primary border-b-0">
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
            const roleId = user.role || 'SCRUBBING';
            return (
              <TableRow key={id ?? ''} className="border-b border-border">
                <TableCell className="font-medium text-foreground">{name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell className="text-muted-foreground">{user.phone ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-left">
                  <DeleteUserButton user={user} roleId={roleId} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default memo(SCRUBBING);
