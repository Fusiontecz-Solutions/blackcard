import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText, Loader2, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getPaymentTemplates,
  TEMPLATE_CATEGORY_LABELS,
  type TemplateCategory,
  type TemplateItem,
} from '@/pages/payment/paymentTemplateApi';
import { sanitizeEmailHtml, type ComposeMode } from './gmailUtils';
import GmailNewTemplateDialog from './GmailNewTemplateDialog';

const CATEGORY_ORDER: TemplateCategory[] = ['email', 'letter', 'contract'];

function isActiveTemplate(t: TemplateItem): boolean {
  const status = String(t.status || 'active').trim().toLowerCase();
  return status === 'active' || status === '';
}

type Props = {
  composeMode: ComposeMode;
  subject: string;
  onApplyTemplate: (next: { bodyHtml: string; subject?: string }) => void;
  getEditorPlainText: () => string;
  disabled?: boolean;
};

export default function GmailComposePaymentTemplates({
  composeMode,
  subject,
  onApplyTemplate,
  getEditorPlainText,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getPaymentTemplates('all', { force: false });
      setTemplates(list.filter(isActiveTemplate));
      setLoadedOnce(true);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load payment templates',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !loadedOnce && !loading) {
      void loadTemplates();
    }
  }, [open, loadedOnce, loading, loadTemplates]);

  const grouped = useMemo(() => {
    const byCat = new Map<TemplateCategory, TemplateItem[]>();
    for (const cat of CATEGORY_ORDER) byCat.set(cat, []);
    for (const t of templates) {
      const list = byCat.get(t.category);
      if (list) list.push(t);
    }
    for (const [, list] of byCat) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    }
    return CATEGORY_ORDER.map((cat) => ({ cat, items: byCat.get(cat) ?? [] })).filter(
      (g) => g.items.length > 0,
    );
  }, [templates]);

  const applyTemplate = (template: TemplateItem) => {
    const bodyHtml = sanitizeEmailHtml(String(template.body || '').trim());
    if (!bodyHtml) {
      toast.warn('This template has no body content');
      return;
    }

    const editorHasText = Boolean(getEditorPlainText().trim());
    if (editorHasText) {
      const ok = window.confirm(
        'Replace the current message text with this template? (Quoted reply text below is kept when you send.)',
      );
      if (!ok) return;
    }

    const isNewCompose = composeMode === 'new';
    const subjectUpdate =
      isNewCompose && !subject.trim() && template.name.trim()
        ? { subject: template.name.trim() }
        : {};

    onApplyTemplate({ bodyHtml, ...subjectUpdate });
    setOpen(false);
    toast.success(`Template “${template.name}” inserted`);
  };

  const totalCount = templates.length;

  const handleTemplateCreated = (created: TemplateItem) => {
    if (isActiveTemplate(created)) {
      setTemplates((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
    }
  };

  return (
    <>
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Insert payment template"
          disabled={disabled}
          className="p-1.5 rounded hover:bg-black/5 dark:hover:bg-white/10 text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1"
        >
          <FileText size={16} />
          <span className="text-xs font-medium hidden sm:inline">Templates</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="crm-keep-case w-72 max-h-80 overflow-y-auto">
        {loading && (
          <div className="flex items-center gap-2 px-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading templates…
          </div>
        )}
        {!loading && loadedOnce && totalCount === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            No active templates yet. Use New template below to add one.
          </p>
        )}
        {!loading &&
          grouped.map(({ cat, items }, groupIndex) => (
            <DropdownMenuGroup key={cat}>
              {groupIndex > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {TEMPLATE_CATEGORY_LABELS[cat]}
              </DropdownMenuLabel>
              {items.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onSelect={(e: Event) => {
                    e.preventDefault();
                    applyTemplate(t);
                  }}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="font-medium truncate w-full">{t.name}</span>
                  {t.variables?.length ? (
                    <span className="text-[10px] text-muted-foreground truncate w-full">
                      {t.variables.length} variable{t.variables.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        {!loading && !loadedOnce && (
          <p className="px-2 py-2 text-xs text-muted-foreground">Open to load templates</p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            setOpen(false);
            window.setTimeout(() => setShowNewTemplate(true), 0);
          }}
          className="gap-2 font-medium text-[var(--brand)]"
        >
          <Plus className="size-4" />
          New template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <GmailNewTemplateDialog
      open={showNewTemplate}
      onOpenChange={setShowNewTemplate}
      onCreated={handleTemplateCreated}
    />
    </>
  );
}
