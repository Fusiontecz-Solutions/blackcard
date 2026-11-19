import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import {
  Copy,
  FileText,
  Mail,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { toast } from "react-toastify";
import {
  createPaymentTemplate,
  deletePaymentTemplate,
  getPaymentTemplates,
  readPaymentTemplatesCache,
  writePaymentTemplatesCache,
  type TemplateCategory,
  type TemplateItem,
  updatePaymentTemplate,
} from "./paymentTemplateApi";
import {
  isBrandedLetterTemplateId,
  isPayoffLetterName,
  isPayoffWireLetterName,
  isZeroBalanceLetterName,
  withBrandedLetterTemplates,
} from "./brandedLetterTemplates";
import { renderPayOffLetterEmailHtml } from "@/pages/templates/payOffLetterEmailHtml";
import { renderZeroBalanceLetterEmailHtml } from "@/pages/templates/zeroBalanceLetterEmailHtml";
import { renderPayoffWireInstructionsHtml } from "@/pages/templates/payoffWireInstructionsEmailHtml";

const FILTER_TABS: { id: "all" | TemplateCategory; label: string }[] = [
  { id: "all", label: "All Templates" },
  { id: "contract", label: "Contract" },
  { id: "email", label: "Email" },
  { id: "letter", label: "Letter" },
];

const TEMPLATE_CATEGORY_OPTIONS: { value: TemplateCategory; label: string }[] = [
  { value: "contract", label: "Contract" },
  { value: "email", label: "Email" },
  { value: "letter", label: "Letter" },
];

function formatTemplateDate(dateValue?: string) {
  if (!dateValue) return "N/A";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toISOString().slice(0, 10);
}

function templateBodyIsHtml(body: string): boolean {
  return /<\/?(?:table|html|div|p|pre|br|span|strong|ul|ol|li)\b/i.test(body);
}

/** Strip optional `{{` `}}` from storage or pasted tokens. */
function normalizeVariableKey(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(t);
  return (m ? m[1] : t.replace(/^\{\{|\}\}$/g, "")).trim();
}

function variableLabelFromKey(key: string): string {
  const k = normalizeVariableKey(key);
  return k
    .split(/_+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtmlAttr(s: string): string {
  return escapeHtmlText(s).replace(/'/g, "&#39;");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtmlTextPreservingMergeTokens(text: string): string {
  return text
    .split(/(\{\{\s*[^}]+?\s*\}\})/g)
    .map((part) => (/^\{\{\s*[^}]+?\s*\}\}$/.test(part) ? part : escapeHtmlText(part)))
    .join("");
}

function plainTextBodyToHtml(body: string): string {
  const normalizedText = body.replace(/\r\n?/g, "\n");
  const escaped = escapeHtmlTextPreservingMergeTokens(normalizedText);
  return `<pre style="white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;margin:0">${escaped}</pre>`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

function looksLikeCsvGrid(text: string): boolean {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  if (!lines.every((l) => l.includes(","))) return false;
  const counts = lines.map((l) => parseCsvLine(l).length);
  const first = counts[0];
  return first >= 2 && counts.every((c) => c === first);
}

function csvBodyToHtmlTable(body: string): string {
  const lines = body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = lines.map(parseCsvLine);
  const [header, ...dataRows] = rows;
  const headerHtml = header
    .map(
      (cell) =>
        `<th style="border:1px solid #111;padding:8px;text-align:left">${escapeHtmlTextPreservingMergeTokens(cell)}</th>`
    )
    .join("");
  const bodyHtml = dataRows
    .map((row) => {
      const td = row
        .map(
          (cell) =>
            `<td style="border:1px solid #111;padding:8px;vertical-align:top">${escapeHtmlTextPreservingMergeTokens(cell)}</td>`
        )
        .join("");
      return `<tr>${td}</tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;table-layout:auto"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

/**
 * Clean HTML copied from Gmail / Outlook / Word so its look (inline styles,
 * tables, images, links) survives paste while scripts, handlers and doc-level
 * tags are dropped. Class names are removed because their stylesheets don't come along.
 */
function sanitizePastedHtml(rawHtml: string): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  doc
    .querySelectorAll("script,style,link,meta,title,base,iframe,object,embed,form,xml")
    .forEach((node) => node.remove());
  doc.querySelectorAll("*").forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith("on") || name === "class" || name === "id" || name === "contenteditable") {
        el.removeAttribute(attr.name);
      }
    }
    for (const attrName of ["href", "src"]) {
      const value = el.getAttribute(attrName);
      if (value && /^\s*(javascript|vbscript):/i.test(value)) el.removeAttribute(attrName);
    }
  });
  return (doc.body?.innerHTML || "").replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** Plain text whose layout depends on exact spacing (aligned columns, box drawing). */
function plainTextNeedsPreformatting(text: string): boolean {
  return / {2,}|\t|[─│┌┐└┘├┤┬┴┼═║╔╗╚╝]/.test(text);
}

/**
 * HTML to insert for a paste into the rich template editor, or null to let the
 * browser handle it (simple plain text).
 */
function htmlForTemplatePaste(clipboard: DataTransfer): string | null {
  const html = clipboard.getData("text/html");
  if (html.trim()) {
    const cleaned = sanitizePastedHtml(html);
    if (cleaned) return cleaned;
  }
  const text = clipboard.getData("text/plain");
  if (!text.trim()) return null;
  if (looksLikeCsvGrid(text)) return csvBodyToHtmlTable(text);
  if (plainTextNeedsPreformatting(text)) return plainTextBodyToHtml(text);
  return null;
}

function pasteIntoRichTemplateEditor(e: ClipboardEvent<HTMLDivElement>): boolean {
  const html = htmlForTemplatePaste(e.clipboardData);
  if (html === null) return false;
  e.preventDefault();
  document.execCommand("insertHTML", false, html);
  return true;
}

/** Body to store from the rich editor; empty when it only holds whitespace / stray breaks. */
function richEditorBody(editor: HTMLDivElement): string {
  const html = visualEditorToHtmlBody(editor.innerHTML).trim();
  const hasVisibleContent =
    Boolean(editor.innerText.trim()) || /<(img|table|hr)\b/i.test(html);
  if (!hasVisibleContent) return "";
  return templateBodyIsHtml(html) ? html : `<div>${html}</div>`;
}

function normalizeTemplateBodyForStorage(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  if (templateBodyIsHtml(trimmed)) return trimmed;
  if (looksLikeCsvGrid(trimmed)) return csvBodyToHtmlTable(trimmed);
  return plainTextBodyToHtml(trimmed);
}

function canonicalVariableKey(raw: string): string {
  return normalizeVariableKey(raw).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function variableChipHtml(keyRaw: string): string {
  const key = normalizeVariableKey(keyRaw);
  const label = variableLabelFromKey(key);
  return `<span data-merge-key="${escapeHtmlAttr(key)}" contenteditable="false" style="display:inline-block;background:#ede9fe;color:#5b21b6;padding:1px 6px;border-radius:6px;font-size:11px;line-height:1.4;font-family:system-ui,sans-serif;border:1px solid #c4b5fd;white-space:nowrap">${escapeHtmlText(label)}</span>`;
}

function tokenKeysFromBody(body: string): Set<string> {
  const out = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.add(normalizeVariableKey(m[1]));
  }
  return out;
}

function replacePlainVariableWords(
  text: string,
  variableKeys: string[],
  tokenKeys: Set<string>
): string {
  let out = text;
  const tokenCanon = new Set(Array.from(tokenKeys).map((k) => canonicalVariableKey(k)));
  for (const raw of variableKeys) {
    const key = normalizeVariableKey(raw);
    const keyCanon = canonicalVariableKey(key);
    // If template already contains {{key}}, keep plain labels as normal text.
    if (!key || tokenCanon.has(keyCanon)) continue;
    const label = variableLabelFromKey(key);
    const aliasParts = [escapeRegex(key)];
    if (label) aliasParts.push(escapeRegex(label));
    const aliasPattern = new RegExp(`\\b(?:${aliasParts.join("|")})\\b`, "gi");
    out = out.replace(aliasPattern, variableChipHtml(key));
  }
  return out;
}

/** Replace merge tokens in HTML with readable labels for admin preview only. */
function adminHtmlBodyPreview(body: string, variableKeys: string[] = []): string {
  const tokenKeys = tokenKeysFromBody(body);
  const withTokenChips = body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) =>
    variableChipHtml(rawKey.trim())
  );
  // Also highlight plain words that match known variables (e.g. "Part").
  return withTokenChips.replace(/>([^<]+)</g, (_, text: string) => {
    const replaced = replacePlainVariableWords(text, variableKeys, tokenKeys);
    return `>${replaced}<`;
  });
}

/** Map merge tokens to non-editable chips for visual editing. */
function htmlBodyToVisualEditor(body: string, variableKeys: string[] = []): string {
  const tokenKeys = tokenKeysFromBody(body);
  const withTokenChips = body.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, rawKey: string) =>
    variableChipHtml(rawKey.trim())
  );
  return withTokenChips.replace(/>([^<]+)</g, (_, text: string) => {
    const replaced = replacePlainVariableWords(text, variableKeys, tokenKeys);
    return `>${replaced}<`;
  });
}

/** Convert visual editor chips back to merge token syntax for storage. */
function visualEditorToHtmlBody(editorHtml: string): string {
  return editorHtml.replace(
    /<span\b[^>]*data-merge-key=(['"])(.*?)\1[^>]*>[\s\S]*?<\/span>/gi,
    (_, _q: string, key: string) => `{{${normalizeVariableKey(key)}}}`
  );
}

function highlightTemplateBody(body: string) {
  return body.split(/(\{\{[^}]+\}\})/).map((part, i) =>
    /^\{\{[^}]+\}\}$/.test(part) ? (
      <span
        key={i}
        className="rounded bg-violet-100 px-1 py-0.5 text-[11px] font-medium text-violet-800"
      >
        {variableLabelFromKey(part.slice(2, -2))}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatVariableInputOnChange(raw: string) {
  const hasTrailingComma = /,\s*$/.test(raw);
  const tokens = raw.split(",");

  return tokens
    .map((token, index) => {
      const trimmed = token.trim();
      if (!trimmed) return "";

      const isLastToken = index === tokens.length - 1;
      const isCompletedToken = !isLastToken || hasTrailingComma;

      return isCompletedToken ? normalizeVariableKey(trimmed) : trimmed;
    })
    .join(", ");
}

function pickSelectedFromList(
  data: TemplateItem[],
  prev: TemplateItem | null,
): TemplateItem | null {
  if (!prev) return data[0] ?? null;
  return data.find((item) => item.id === prev.id) ?? data[0] ?? null;
}

/**
 * The branded letters render from code, so they arrive with an empty body.
 * Rendering them with each merge key as its own token gives the Templates tab
 * the same layout Letters sends, with the variable chips still highlighted.
 */
function brandedLetterPreviewBody(template: TemplateItem): string {
  const values = Object.fromEntries(
    (template.variables ?? []).map((key) => [String(key), `{{${String(key)}}}`],
    ),
  );
  if (isZeroBalanceLetterName(template.name)) {
    return renderZeroBalanceLetterEmailHtml(values);
  }
  if (isPayoffWireLetterName(template.name)) {
    return renderPayoffWireInstructionsHtml(values);
  }
  if (isPayoffLetterName(template.name)) {
    return renderPayOffLetterEmailHtml(values);
  }
  return template.body;
}

/** Same catalog the Letters tab lists, so both tabs offer the same letters. */
function withBrandedLetterCatalog(list: TemplateItem[]): TemplateItem[] {
  return withBrandedLetterTemplates(list).map((t) =>
    isBrandedLetterTemplateId(t.id)
      ? { ...t, body: brandedLetterPreviewBody(t) }
      : t,
  );
}

export default function Templates() {
  const [templates, setTemplates] = useState<TemplateItem[]>(() =>
    withBrandedLetterCatalog(readPaymentTemplatesCache() ?? []),
  );
  const [selected, setSelected] = useState<TemplateItem | null>(() => {
    const c = withBrandedLetterCatalog(readPaymentTemplatesCache() ?? []);
    return c.length ? pickSelectedFromList(c, null) : null;
  });
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [isLoading, setIsLoading] = useState(
    () => readPaymentTemplatesCache() === undefined,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [filterCat, setFilterCat] = useState<"all" | TemplateCategory>("all");
  const [newTpl, setNewTpl] = useState({
    name: "",
    category: "contract" as TemplateCategory,
    body: "",
    variables: "",
  });
  const [editTpl, setEditTpl] = useState({
    id: "",
    name: "",
    category: "contract" as TemplateCategory,
    body: "",
    variables: "",
  });
  const editHtmlBodyRef = useRef<HTMLDivElement | null>(null);
  const newHtmlBodyRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(
    () =>
      filterCat === "all"
        ? templates
        : templates.filter((t) => t.category === filterCat),
    [templates, filterCat]
  );

  const retryLoad = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getPaymentTemplates(undefined, { force: true });
      writePaymentTemplatesCache(data);
      const listed = withBrandedLetterCatalog(data);
      setTemplates(listed);
      setSelected((prev) => pickSelectedFromList(listed, prev));
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        "Failed to load payment templates";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const cached = readPaymentTemplatesCache();

    if (cached !== undefined) {
      const listedCached = withBrandedLetterCatalog(cached);
      setTemplates(listedCached);
      setSelected((prev) => pickSelectedFromList(listedCached, prev));
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
    setLoadError(null);

    (async () => {
      try {
        const data = await getPaymentTemplates(undefined, { force: true });
        if (cancelled) return;
        writePaymentTemplatesCache(data);
        const listed = withBrandedLetterCatalog(data);
        setTemplates(listed);
        setSelected((prev) => pickSelectedFromList(listed, prev));
      } catch (error: any) {
        if (cancelled) return;
        const message =
          error?.response?.data?.message ||
          error?.message ||
          "Failed to load payment templates";
        if (cached === undefined) {
          setLoadError(message);
          toast.error(message);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const parseVariableInput = (raw: string) =>
    raw
      .split(",")
      .map((v) => normalizeVariableKey(v))
      .filter(Boolean);

  const addTemplate = async () => {
    const bodyToSave = newHtmlBodyRef.current
      ? richEditorBody(newHtmlBodyRef.current)
      : normalizeTemplateBodyForStorage(newTpl.body);
    if (!bodyToSave) {
      toast.error("Template body is required.");
      return;
    }
    setIsSaving(true);
    try {
      const created = await createPaymentTemplate({
        name: newTpl.name.trim(),
        category: newTpl.category,
        variables: parseVariableInput(newTpl.variables),
        body: bodyToSave,
        status: "active",
      });
      if (!created) throw new Error("Template creation returned no data");
      setTemplates((prev) => {
        const next = [created, ...prev];
        writePaymentTemplatesCache(next);
        return next;
      });
      setSelected(created);
      setNewTpl({
        name: "",
        category: "contract",
        body: "",
        variables: "",
      });
      setShowAdd(false);
      toast.success("Template created successfully");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to create payment template"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    setIsSaving(true);
    try {
      await deletePaymentTemplate(id);
      setTemplates((prev) => {
        const next = prev.filter((t) => t.id !== id);
        writePaymentTemplatesCache(next);
        return next;
      });
      setSelected((prev) => {
        if (prev?.id !== id) return prev;
        return pickSelectedFromList(readPaymentTemplatesCache() ?? [], null);
      });
      toast.success("Template deleted successfully");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to delete payment template"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const duplicateTemplate = async (template: TemplateItem) => {
    setIsSaving(true);
    try {
      const copy = await createPaymentTemplate({
        name: `${template.name} (Copy)`,
        category: template.category,
        variables: template.variables,
        body: template.body,
        status: template.status || "active",
      });
      if (!copy) throw new Error("Template duplicate returned no data");
      setTemplates((prev) => {
        const next = [copy, ...prev];
        writePaymentTemplatesCache(next);
        return next;
      });
      setSelected(copy);
      toast.success("Template duplicated successfully");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to duplicate payment template"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const openEditDialog = (template: TemplateItem) => {
    setEditTpl({
      id: template.id,
      name: template.name,
      category: template.category,
      body: template.body,
      variables: template.variables.map((v) => normalizeVariableKey(v)).join(", "),
    });
    setShowEdit(true);
  };

  const syncEditHtmlBodyFromDom = () => {
    if (!editHtmlBodyRef.current) return;
    const nextBody = visualEditorToHtmlBody(editHtmlBodyRef.current.innerHTML);
    setEditTpl((p) => ({ ...p, body: nextBody }));
  };

  const syncNewHtmlBodyFromDom = () => {
    if (!newHtmlBodyRef.current) return;
    const nextBody = richEditorBody(newHtmlBodyRef.current);
    setNewTpl((p) => ({ ...p, body: nextBody }));
  };

  // Seed the uncontrolled editor only when the dialog opens, so typing never resets the caret.
  useEffect(() => {
    if (!showAdd) return;
    requestAnimationFrame(() => {
      if (!newHtmlBodyRef.current) return;
      newHtmlBodyRef.current.innerHTML = newTpl.body
        ? htmlBodyToVisualEditor(
            normalizeTemplateBodyForStorage(newTpl.body),
            parseVariableInput(newTpl.variables),
          )
        : "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd]);

  /** Rich paste into a plain-text body switches the template to HTML, keeping the pasted design. */
  const pasteRichIntoEditTextarea = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html.trim()) return;
    const pasted = sanitizePastedHtml(html);
    if (!pasted) return;
    e.preventDefault();
    const el = e.currentTarget;
    const before = el.value.slice(0, el.selectionStart ?? el.value.length);
    const after = el.value.slice(el.selectionEnd ?? el.value.length);
    const nextBody = [
      before.trim() ? normalizeTemplateBodyForStorage(before) : "",
      pasted,
      after.trim() ? normalizeTemplateBodyForStorage(after) : "",
    ].join("");
    setEditTpl((p) => ({ ...p, body: nextBody }));
  };

  useEffect(() => {
    if (!showEdit || !templateBodyIsHtml(editTpl.body)) return;
    requestAnimationFrame(() => {
      if (!editHtmlBodyRef.current) return;
      editHtmlBodyRef.current.innerHTML = htmlBodyToVisualEditor(
        editTpl.body,
        parseVariableInput(editTpl.variables)
      );
    });
  }, [showEdit, editTpl.body, editTpl.variables]);

  const saveEditTemplate = async () => {
    let bodyToSave = normalizeTemplateBodyForStorage(editTpl.body);
    if (templateBodyIsHtml(editTpl.body) && editHtmlBodyRef.current) {
      bodyToSave = visualEditorToHtmlBody(editHtmlBodyRef.current.innerHTML).trim();
    }
    if (!bodyToSave) {
      toast.error("Template body is required.");
      return;
    }

    setIsSaving(true);
    try {
      const updated = await updatePaymentTemplate(editTpl.id, {
        name: editTpl.name.trim(),
        category: editTpl.category,
        body: bodyToSave,
        variables: parseVariableInput(editTpl.variables),
      });
      if (!updated) throw new Error("Template update returned no data");
      setTemplates((prev) => {
        const next = prev.map((item) =>
          item.id === updated.id ? updated : item,
        );
        writePaymentTemplatesCache(next);
        return next;
      });
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      setShowEdit(false);
      toast.success("Template updated successfully");
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || "Failed to update payment template"
      );
    } finally {
      setIsSaving(false);
    }
  };

  const accentBtn =
    "bg-[image:var(--brand-gradient)] text-white shadow-sm hover:opacity-90 focus-visible:ring-[var(--brand)]/30";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 lg:h-[min(78vh,880px)] lg:flex-row lg:gap-6">
      {/* List */}
      <div className="flex min-h-0 w-full flex-1 flex-col gap-3 lg:w-[min(100%,300px)] lg:max-w-[350px] lg:flex-none lg:shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1 dark:border-white/10 dark:bg-white/[0.04]">
            {FILTER_TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilterCat(id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  filterCat === id
                    ? cn(accentBtn)
                    : "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-white/[0.06]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            className={cn("ml-auto shrink-0", accentBtn)}
            onClick={() => setShowAdd(true)}
          >
            <Plus className="size-3.5" aria-hidden />
            New Template
          </Button>
        </div>

        <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
          {isLoading ? (
            <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Loading templates...
            </li>
          ) : loadError ? (
            <li className="rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium text-destructive">{loadError}</p>
              <p className="mt-2 text-muted-foreground">
                Check that the API is running and you are signed in, then retry.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void retryLoad()}
              >
                Retry
              </Button>
            </li>
          ) : filtered.length === 0 ? (
            <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              {filterCat === "all"
                ? "No templates yet. Use New Template to add one, or restart the API to seed the default payoff letter if your database is empty."
                : "No templates found for this category."}
            </li>
          ) : (
            filtered.map((t) => {
              const isSel = selected?.id === t.id;
              const isContract = t.category === "contract";
              const isLetter = t.category === "letter";
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(t)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left shadow-sm transition-all",
                      "bg-card hover:border-[var(--brand)]/35 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03]",
                      isSel
                        ? "border-[var(--brand)]/50 ring-2 ring-[var(--brand)]/20"
                        : "border-border"
                    )}
                  >
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {isContract ? (
                          <FileText
                            className="size-4 shrink-0 text-amber-500"
                            aria-hidden
                          />
                        ) : isLetter ? (
                          <FileText
                            className="size-4 shrink-0 text-sky-600"
                            aria-hidden
                          />
                        ) : (
                          <Mail
                            className="size-4 shrink-0 text-teal-600"
                            aria-hidden
                          />
                        )}
                        <span className="truncate text-sm font-semibold text-foreground">
                          {t.name}
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border-0 text-[10px] font-bold uppercase tracking-wide",
                          isContract
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300"
                            : isLetter
                              ? "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-300"
                              : "bg-teal-100 text-teal-900 dark:bg-teal-400/15 dark:text-teal-300"
                        )}
                      >
                        {isContract
                          ? "Contract"
                          : isLetter
                            ? "Letter"
                            : "Email"}
                      </Badge>
                    </div>
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {t.variables.slice(0, 4).map((v) => (
                        <span
                          key={v}
                            className="rounded-md bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-400/15 dark:text-violet-300"
                        >
                          {variableLabelFromKey(v)}
                        </span>
                      ))}
                      {t.variables.length > 4 && (
                        <span className="text-[10px] font-medium text-muted-foreground">
                          +{t.variables.length - 4} more
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Last edited: {formatTemplateDate(t.updatedAt ?? t.createdAt)}
                    </p>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>

      {/* Preview */}
      <aside
        className={cn(
          "flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]",
          "lg:min-h-0 lg:min-w-0 lg:flex-1 lg:shrink"
        )}
      >
        {selected ? (
          <>
            <div className="border-b border-border px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-base font-bold tracking-tight text-foreground">
                  {selected.name}

                  <Badge
                    variant="outline"
                    className={cn(
                      "mt-2 ml-3 border-0 text-[10px] font-bold uppercase",
                      selected.category === "contract"
                        ? "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300"
                        : selected.category === "letter"
                          ? "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-300"
                          : "bg-teal-100 text-teal-900 dark:bg-teal-400/15 dark:text-teal-300"
                    )}
                  >
                    {selected.category === "contract"
                      ? "Contract"
                      : selected.category === "letter"
                        ? "Letter"
                        : "Email"}
                  </Badge>
                </h2>

                <div className="flex shrink-0 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => void duplicateTemplate(selected)}
                    aria-label="Duplicate template"
                    disabled={isSaving}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="size-8"
                    onClick={() => void deleteTemplate(selected.id)}
                    aria-label="Delete template"
                    title={
                      isBrandedLetterTemplateId(selected.id)
                        ? "Built-in letter - cannot be deleted"
                        : "Delete template"
                    }
                    disabled={isSaving || isBrandedLetterTemplateId(selected.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>

            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Variables
              </p>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {selected.variables.map((v) => (
                  <span
                    key={v}
                    className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:border-violet-300/20 dark:bg-violet-400/15 dark:text-violet-300"
                  >
                    {variableLabelFromKey(v)}
                  </span>
                ))}
              </div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Template body
              </p>
              <div className="rounded-lg border border-border bg-white p-4 text-xs leading-relaxed text-slate-900 shadow-inner [&_table]:w-full [&_td]:align-top">
                {templateBodyIsHtml(selected.body) ? (
                  <div
                    className="font-sans"
                    dangerouslySetInnerHTML={{
                      __html: adminHtmlBodyPreview(selected.body, selected.variables),
                    }}
                  />
                ) : (
                  <div className="whitespace-pre-wrap">
                    {highlightTemplateBody(selected.body)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 border-t border-border px-5 py-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => openEditDialog(selected)}
                disabled={isSaving || isBrandedLetterTemplateId(selected.id)}
                title={
                  isBrandedLetterTemplateId(selected.id)
                    ? "Built-in letter - edit the layout in code"
                    : "Edit template"
                }
              >
                <Pencil className="size-3.5" />
                {isBrandedLetterTemplateId(selected.id)
                  ? "Built-in Letter"
                  : "Edit Template"}
              </Button>
              {/* <Button type="button" className={cn("flex-1", accentBtn)}>
                <Send className="size-3.5" />
                Use in Email
              </Button> */}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center text-muted-foreground">
            <FileText className="size-10 opacity-40" aria-hidden />
            <p className="text-sm font-medium">Select a template to preview</p>
          </div>
        )}
      </aside>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-6 sm:max-w-[1220px]">
          <DialogHeader className="shrink-0 pb-4">
            <DialogTitle>Create New Template</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-4 pb-4">
              <div className="grid gap-2">
                <Label htmlFor="tpl-name">Template name</Label>
                <Input
                  id="tpl-name"
                  value={newTpl.name}
                  onChange={(e) =>
                    setNewTpl((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Default Notice"
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={newTpl.category}
                  onValueChange={(v: TemplateCategory) =>
                    setNewTpl((p) => ({ ...p, category: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tpl-vars">Variables (comma separated)</Label>
                <Input
                  id="tpl-vars"
                  value={newTpl.variables}
                  onChange={(e) =>
                    setNewTpl((p) => ({
                      ...p,
                      variables: formatVariableInputOnChange(e.target.value),
                    }))
                  }
                  placeholder="merchant_name, payoff_amount"
                />
              </div>
              <div className="grid min-h-0 gap-2">
                <Label htmlFor="tpl-body">Template body</Label>
                <p className="text-[11px] text-muted-foreground">
                  Paste straight from Gmail, Outlook or Word — fonts, colours, tables and images are kept.
                  Type <code>{"{{merchant_name}}"}</code> for merge fields.
                </p>
                <div
                  id="tpl-body"
                  ref={newHtmlBodyRef}
                  role="textbox"
                  aria-multiline="true"
                  contentEditable
                  suppressContentEditableWarning
                  data-placeholder="Paste or type your template here…"
                  onPaste={(e) => {
                    pasteIntoRichTemplateEditor(e);
                    syncNewHtmlBodyFromDom();
                  }}
                  onInput={syncNewHtmlBodyFromDom}
                  onBlur={syncNewHtmlBodyFromDom}
                  className="max-h-[min(48vh,430px)] min-h-[220px] overflow-y-auto rounded-md border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 shadow-inner outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/30 empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_img]:max-w-full [&_table]:w-full [&_td]:align-top"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAdd(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={accentBtn}
              disabled={!newTpl.name.trim() || !newTpl.body.trim() || isSaving}
              onClick={() => void addTemplate()}
            >
              <Plus className="size-3.5" />
              Create Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-lg flex-col gap-0 overflow-hidden sm:max-w-[1220px]" >
          <DialogHeader className="shrink-0 pb-4">
            <DialogTitle>Edit Template</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-4 pb-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-tpl-name">Template name</Label>
                <Input
                  id="edit-tpl-name"
                  value={editTpl.name}
                  onChange={(e) =>
                    setEditTpl((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. Default Notice"
                />
              </div>
              <div className="grid gap-2">
                <Label>Category</Label>
                <Select
                  value={editTpl.category}
                  onValueChange={(v: TemplateCategory) =>
                    setEditTpl((p) => ({ ...p, category: v }))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-tpl-vars">Variables (comma separated)</Label>
                <Input
                  id="edit-tpl-vars"
                  value={editTpl.variables}
                  onChange={(e) =>
                    setEditTpl((p) => ({
                      ...p,
                      variables: formatVariableInputOnChange(e.target.value),
                    }))
                  }
                  placeholder="merchant_name, payoff_amount"
                />
              </div>
              <div className="grid min-h-0 gap-2">
                <Label htmlFor="edit-tpl-body">Template body</Label>
                {templateBodyIsHtml(editTpl.body) ? (
                  <div className="grid gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Visual editor mode: merge fields show as fixed labels.
                    </p>
                    <div
                      id="edit-tpl-body"
                      ref={editHtmlBodyRef}
                      contentEditable
                      suppressContentEditableWarning
                      onPaste={pasteIntoRichTemplateEditor}
                      onBlur={syncEditHtmlBodyFromDom}
                      className="max-h-[min(48vh,430px)] min-h-[220px] overflow-y-auto rounded-md border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-900 shadow-inner [&_table]:w-full [&_td]:align-top"
                    />
                  </div>
                ) : (
                  <Textarea
                    id="edit-tpl-body"
                    onPaste={pasteRichIntoEditTextarea}
                    value={editTpl.body}
                    onChange={(e) =>
                      setEditTpl((p) => ({ ...p, body: e.target.value }))
                    }
                    placeholder="Paste your content as-is (lines, boxes, spacing). HTML is optional; formatting is preserved automatically."
                    rows={8}
                    className="field-sizing-fixed max-h-[min(42vh,380px)] min-h-[120px] resize-y overflow-y-auto [field-sizing:fixed]"
                  />
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 gap-2 border-t border-border pt-4 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowEdit(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className={accentBtn}
              disabled={!editTpl.name.trim() || !editTpl.body.trim() || isSaving}
              onClick={() => void saveEditTemplate()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
