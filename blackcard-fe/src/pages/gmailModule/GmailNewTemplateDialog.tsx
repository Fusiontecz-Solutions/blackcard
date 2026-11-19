import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createPaymentTemplate,
  readPaymentTemplatesCache,
  TEMPLATE_CATEGORY_LABELS,
  writePaymentTemplatesCache,
  type TemplateCategory,
  type TemplateItem,
} from '@/pages/payment/paymentTemplateApi';
import { sanitizeEmailHtml } from './gmailUtils';

const CATEGORIES: TemplateCategory[] = ['email', 'letter', 'contract'];

function stripPastedHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(sanitizeEmailHtml(rawHtml), 'text/html');
  doc.querySelectorAll('form,xml').forEach((node) => node.remove());
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === 'class' || name === 'id' || name === 'contenteditable') el.removeAttribute(attr.name);
    }
  });
  return (doc.body?.innerHTML || '').replace(/<!--[\s\S]*?-->/g, '').trim();
}

function extractMergeVariables(text: string): string[] {
  const keys = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    const key = m[1].trim();
    if (key) keys.add(key);
  }
  return Array.from(keys);
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (template: TemplateItem) => void;
};

export default function GmailNewTemplateDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory>('email');
  const [hasBody, setHasBody] = useState(false);
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName('');
    setCategory('email');
    setSaving(false);
    const id = window.setTimeout(() => {
      if (editorRef.current) editorRef.current.innerHTML = '';
      setHasBody(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const syncHasBody = () => {
    const el = editorRef.current;
    setHasBody(Boolean(el && (el.innerText.trim() || /<(img|table|hr)\b/i.test(el.innerHTML))));
  };

  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html.trim()) return;
    const cleaned = stripPastedHtml(html);
    if (!cleaned) return;
    e.preventDefault();
    document.execCommand('insertHTML', false, cleaned);
    syncHasBody();
  };

  const handleCreate = async () => {
    const el = editorRef.current;
    const trimmedName = name.trim();
    if (!el || !trimmedName) return;
    const html = el.innerHTML.trim();
    if (!el.innerText.trim() && !/<(img|table|hr)\b/i.test(html)) {
      toast.error('Template body is required.');
      return;
    }
    const body = /<\/?(?:table|html|div|p|pre|br|span|strong|ul|ol|li)\b/i.test(html)
      ? html
      : `<div>${html}</div>`;

    setSaving(true);
    try {
      const created = await createPaymentTemplate({
        name: trimmedName,
        category,
        variables: extractMergeVariables(el.innerText),
        body,
        status: 'active',
      });
      if (!created) throw new Error('Template creation returned no data');
      const cached = readPaymentTemplatesCache();
      if (cached !== undefined) writePaymentTemplatesCache([created, ...cached]);
      toast.success(`Template “${created.name}” created`);
      onCreated?.(created);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || error?.message || 'Failed to create template',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next: boolean) => !saving && onOpenChange(next)}>
      <DialogContent className="crm-keep-case flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-6 sm:max-w-[900px]">
        <DialogHeader className="shrink-0 pb-4">
          <DialogTitle>New template</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="grid gap-4 pb-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <div className="grid gap-2">
                <Label htmlFor="gmail-tpl-name">Template name</Label>
                <Input
                  id="gmail-tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Payment reminder"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v: TemplateCategory) => setCategory(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {TEMPLATE_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gmail-tpl-body">Template body</Label>
              <p className="text-[11px] text-muted-foreground">
                Paste straight from Gmail, Outlook or Word — fonts, colours, tables and images are kept.
                Type <code>{'{{merchant_name}}'}</code> for merge fields.
              </p>
              <div
                id="gmail-tpl-body"
                ref={editorRef}
                role="textbox"
                aria-multiline="true"
                contentEditable
                suppressContentEditableWarning
                data-placeholder="Paste or type your template here…"
                onPaste={handlePaste}
                onInput={syncHasBody}
                onBlur={syncHasBody}
                className="max-h-[min(50vh,440px)] min-h-[220px] overflow-y-auto rounded-md border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_img]:max-w-full [&_table]:w-full [&_td]:align-top"
              />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4 sm:gap-0">
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!name.trim() || !hasBody || saving}
            onClick={() => void handleCreate()}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Create template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
