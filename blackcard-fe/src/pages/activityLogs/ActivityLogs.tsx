import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Search, RefreshCw, Filter, Activity, Globe, Eye, Mail,
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  getActivityLogs,
  getActivityLogContent,
  type ActivityLog,
  type ActivityLogContent,
} from '@/redux/actions/activityLogActions';
import type { AppDispatch, RootState } from '@/redux/store';
import { formatDateTimeUS } from '@/lib/utils';

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  return formatDateTimeUS(dateStr, '—');
}

function getUserName(user: ActivityLog['user']): string {
  if (!user) return '—';
  if (typeof user === 'string') return user;
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || '—';
}

function getUserEmail(user: ActivityLog['user']): string {
  if (!user) return '';
  if (typeof user === 'string') return '';
  return user.email || '';
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  LOGIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  LOGOUT: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
  SEND: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  VIEW: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function getActionColor(action: string): string {
  const key = action?.toUpperCase();
  return ACTION_COLORS[key] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
}

function channelLabel(channel: string | null | undefined): string {
  if (!channel) return '—';
  const map: Record<string, string> = {
    EMAIL: 'Email',
    TEMPLATE: 'Template',
    DOCUMENT: 'Document',
  };
  return map[channel.toUpperCase()] ?? channel;
}

function bodyLooksLikeHtml(body: string): boolean {
  return /<[a-z][\s\S]*>/i.test(body);
}

export default function ActivityLogs() {
  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const { logs, loading, pagination } = useSelector(
    (state: RootState) => state.activityLogs,
  );

  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [viewOpen, setViewOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewContent, setViewContent] = useState<ActivityLogContent | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  const loadLogs = useCallback(() => {
    dispatch(
      getActivityLogs({
        page,
        limit,
        action: actionFilter !== 'all' ? actionFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
        channel: channelFilter !== 'all' ? channelFilter : undefined,
        recipientType: recipientFilter !== 'all' ? recipientFilter : undefined,
        search: search || undefined,
      }),
    );
  }, [dispatch, page, limit, actionFilter, categoryFilter, channelFilter, recipientFilter, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const systemLogs = logs.filter((log): log is ActivityLog => '_id' in log && Boolean((log as ActivityLog)._id));

  const openView = async (log: ActivityLog) => {
    setViewOpen(true);
    setViewLoading(true);
    setViewContent(null);
    setViewError(null);
    try {
      const result = await dispatch(getActivityLogContent(log._id)).unwrap();
      setViewContent(result as ActivityLogContent);
    } catch (e) {
      setViewError(typeof e === 'string' ? e : 'Failed to load content');
    } finally {
      setViewLoading(false);
    }
  };

  const surfaceBase = isDark ? 'bg-[#1e293b] border-[#334155]' : 'bg-white border-[#e2e8f0]';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';

  const previewBody = viewContent?.body?.trim() ?? '';
  const previewIsHtml = previewBody ? bodyLooksLikeHtml(previewBody) : false;

  return (
    <div className={`min-h-screen p-6 space-y-6 ${isDark ? 'bg-[#0f172a] text-slate-100' : 'bg-[#f8fafc] text-slate-900'}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">System Audit Logs</h1>
          <p className={textMuted}>
            System-wide events only (login, global changes). Open a deal and use Activity log for emails and templates sent to ISO, client, or merchant.
          </p>
        </div>
        <Button variant="outline" className="gap-2 border-inherit" onClick={loadLogs}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      <div className={`p-4 rounded-xl border ${surfaceBase}`}>
        <AuditStatCard title="Total Events" value={pagination.total || 0} icon={<Activity className="text-blue-500" />} />
      </div>

      <div className={`p-4 rounded-xl border flex flex-wrap items-center gap-3 ${surfaceBase}`}>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search description, recipient, template…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10 bg-transparent border-slate-200 dark:border-slate-700"
          />
        </div>

        <Select value={categoryFilter} onValueChange={(v: string) => { setCategoryFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px] bg-transparent">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="GENERAL">General</SelectItem>
            <SelectItem value="COMMUNICATION">Communications</SelectItem>
            <SelectItem value="AUTH">Auth</SelectItem>
          </SelectContent>
        </Select>

        <Select value={channelFilter} onValueChange={(v: string) => { setChannelFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] bg-transparent">
            <SelectValue placeholder="Channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="EMAIL">Email</SelectItem>
            <SelectItem value="TEMPLATE">Template</SelectItem>
            <SelectItem value="DOCUMENT">Document</SelectItem>
          </SelectContent>
        </Select>

        <Select value={recipientFilter} onValueChange={(v: string) => { setRecipientFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px] bg-transparent">
            <SelectValue placeholder="Recipient" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All recipients</SelectItem>
            <SelectItem value="ISO">ISO</SelectItem>
            <SelectItem value="CLIENT">Client</SelectItem>
            <SelectItem value="MERCHANT">Merchant</SelectItem>
            <SelectItem value="USER">User</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>

        <Select value={actionFilter} onValueChange={(v: string) => { setActionFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[140px] bg-transparent">
            <Filter size={14} className="mr-2 opacity-50" />
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            <SelectItem value="SEND">Sent</SelectItem>
            <SelectItem value="CREATE">Create</SelectItem>
            <SelectItem value="UPDATE">Update</SelectItem>
            <SelectItem value="DELETE">Delete</SelectItem>
            <SelectItem value="LOGIN">Login</SelectItem>
            <SelectItem value="LOGOUT">Logout</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className={`rounded-xl border shadow-sm overflow-hidden ${surfaceBase}`}>
        <Table>
          <TableHeader className={isDark ? 'bg-slate-800/50' : 'bg-slate-50'}>
            <TableRow className="border-inherit hover:bg-transparent">
              <TableHead className="text-[11px] font-bold">OPERATOR</TableHead>
              <TableHead className="text-[11px] font-bold">ACTION</TableHead>
              <TableHead className="text-[11px] font-bold">CHANNEL</TableHead>
              <TableHead className="text-[11px] font-bold">TO (ISO / CLIENT / MERCHANT)</TableHead>
              <TableHead className="text-[11px] font-bold">DESCRIPTION</TableHead>
              <TableHead className="text-[11px] font-bold">VIEW</TableHead>
              <TableHead className="text-[11px] font-bold">TIME</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-left opacity-50">Loading audit logs…</TableCell>
              </TableRow>
            ) : systemLogs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No audit entries match your filters.
                </TableCell>
              </TableRow>
            ) : (
              systemLogs.map((log) => (
                <TableRow key={log._id} className="border-inherit">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">{getUserName(log.user)}</span>
                      <span className="text-[11px] text-slate-400">{getUserEmail(log.user)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {log.category === 'COMMUNICATION' ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3 opacity-60" />
                        {channelLabel(log.channel)}
                      </span>
                    ) : (
                      log.category ?? '—'
                    )}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {log.recipientName ? (
                      <div className="text-xs">
                        <span className="font-medium">{log.recipientName}</span>
                        {log.recipientType && (
                          <span className="ml-1 text-[10px] uppercase text-muted-foreground">
                            ({log.recipientType})
                          </span>
                        )}
                      </div>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="text-xs line-clamp-2">{log.description}</p>
                    {log.templateName && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Template: {log.templateName}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {log.canView ? (
                      <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => openView(log)}>
                        <Eye className="size-3.5" /> View
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    <div>{formatDateTime(log.createdAt)}</div>
                    {log.ipAddress && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <Globe className="size-3" /> {log.ipAddress}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="p-4 border-t border-inherit flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Page {page} of {pagination.totalPages || 1} ({pagination.total ?? 0} total)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= (pagination.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sent communication</DialogTitle>
          </DialogHeader>
          {viewLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {viewError && <p className="text-sm text-red-500">{viewError}</p>}
          {!viewLoading && !viewError && viewContent && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Channel</p>
                  <p>{channelLabel(viewContent.channel)}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Recipient type</p>
                  <p>{viewContent.recipientType ?? '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Recipient</p>
                <p className="break-all">{viewContent.recipient ?? '—'}</p>
              </div>
              {viewContent.templateName && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Template</p>
                  <p>{viewContent.templateName}</p>
                </div>
              )}
              {viewContent.documentName && (
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Document</p>
                  <p>{viewContent.documentName}</p>
                </div>
              )}
              <div>
                <p className="text-xs uppercase text-muted-foreground">Subject</p>
                <p>{viewContent.subject ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted-foreground">Message</p>
                <div className="rounded-md border border-border bg-muted/20 p-3 mt-1">
                  {previewBody ? (
                    previewIsHtml ? (
                      <div
                        className="max-h-[50vh] overflow-y-auto prose prose-sm dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: previewBody }}
                      />
                    ) : (
                      <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-xs">{previewBody}</pre>
                    )
                  ) : (
                    <p className="text-muted-foreground text-xs">No message body stored for this entry.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditStatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  const isDark = useTheme().resolvedTheme === 'dark';
  return (
    <div className={`flex items-center justify-between ${isDark ? '' : ''}`}>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{title}</p>
        <h3 className="text-2xl font-black">{value}</h3>
      </div>
      <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl">{icon}</div>
    </div>
  );
}
