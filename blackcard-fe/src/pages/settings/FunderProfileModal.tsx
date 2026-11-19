import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  Info,
  Loader2,
  Mail,
  MapPin,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "react-toastify";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { US_STATES } from "@/constants/usStates";
import {
  DEFAULT_CONTRACT_FILENAME,
  deleteFunderDocument,
  fetchFunderDocuments,
  updateFunderProfile,
  uploadFunderAddendumDocument,
  uploadFunderDisclosureDocument,
  type FunderProfileFiles,
} from "@/redux/actions/integrationSettingsActions";
import type { FunderProfile, FunderProfileInput } from "@/types/integrationSettingsTypes";
import {
  DISCLOSURE_FREQUENCY_OPTIONS,
  FUNDER_ADDENDUM_COORDINATE_LAYOUT_OPTIONS,
  isFunderAddendumRow,
  isFunderDisclosureRow,
  type FunderDocumentTemplateRow,
} from "@/utils/funderLayoutKeys";
import {
  canManageFunderAddendums,
  canManageFunderDisclosures,
  FUNDER_ADDENDUM_SOURCE_OPTIONS,
  FUNDER_DISCLOSURE_SOURCE_OPTIONS,
  resolveAddendumDocumentsSource,
  resolveDisclosureDocumentsSource,
} from "@/utils/funderDocumentSource";
import { resolveLetterEmailBranding } from "@/pages/templates/letterEmailBranding";

type Props = {
  open: boolean;
  saving?: boolean;
  initial?: FunderProfile | null;
  allFunders?: FunderProfile[];
  docusignOptions: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (payload: FunderProfileInput, files?: FunderProfileFiles | null) => Promise<void>;
};

const emptyForm: FunderProfileInput = {
  name: "",
  defaultCcEmail: "",
  contactEmail: "",
  contactPhone: "",
  addressLine1: "",
  addressCity: "",
  addressState: "",
  addressZip: "",
  isActive: true,
  allowedStates: [],
  documentsSource: "own",
  sharedDocumentsFunderId: null,
  addendumDocumentsSource: "own",
  disclosureDocumentsSource: "platform",
  sharedAddendumFunderId: null,
  sharedDisclosureFunderId: null,
  letterCompanyName: "",
  letterLogoUrl: "",
  letterWatermarkUrl: "",
  letterAccentStripLight: "",
  letterAccentStripDark: "",
  letterInfoTableIconBg: "",
  letterWireBankName: "",
  letterWireAddressLine1: "",
  letterWireCityStateZip: "",
  letterWireRoutingNumber: "",
  letterWireAccountNumber: "",
};

const ADDENDUM_PRESETS = [
  { name: "Flex Addendum", type: "flex_addendum" },
  { name: "Pre-Payment Addendum", type: "pre_payment_addendum" },
  { name: "Balance Transfer", type: "balance_transfer" },
  { name: "Case Takeover Balance Transfer", type: "case_takeover_addendum" },
  { name: "ACH Authorization", type: "ach_authorization" },
] as const;

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

function UploadCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function DocBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}

function EmptyDocList({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(value.trim()) ? value.trim() : "#002147";
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} color picker`}
          value={hex}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-9 w-11 cursor-pointer rounded border bg-transparent p-0.5"
        />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#18181B"
          className="font-mono text-sm uppercase"
        />
      </div>
    </div>
  );
}

export default function FunderProfileModal({
  open,
  saving,
  initial,
  allFunders = [],
  docusignOptions,
  onClose,
  onSave,
}: Props) {
  const [activeTab, setActiveTab] = useState("setup");
  const [showStateRules, setShowStateRules] = useState(false);

  const [form, setForm] = useState<FunderProfileInput>(emptyForm);
  const [statesText, setStatesText] = useState("");
  const [excludedStatesText, setExcludedStatesText] = useState("");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [letterLogoFile, setLetterLogoFile] = useState<File | null>(null);
  const [letterLogoPreviewUrl, setLetterLogoPreviewUrl] = useState<string | null>(null);
  const [letterLogoRemoved, setLetterLogoRemoved] = useState(false);

  const [documents, setDocuments] = useState<FunderDocumentTemplateRow[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [docActionId, setDocActionId] = useState<string | null>(null);

  const [disclosureState, setDisclosureState] = useState("Texas");
  const [disclosureFrequency, setDisclosureFrequency] = useState("daily");
  const [disclosureFile, setDisclosureFile] = useState<File | null>(null);
  const [disclosureUploading, setDisclosureUploading] = useState(false);

  const [addendumName, setAddendumName] = useState("Flex Addendum");
  const [addendumCoordKey, setAddendumCoordKey] = useState("flex_addendum");
  const [addendumFile, setAddendumFile] = useState<File | null>(null);
  const [addendumUploading, setAddendumUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const letterLogoInputRef = useRef<HTMLInputElement>(null);
  const disclosureInputRef = useRef<HTMLInputElement>(null);
  const addendumInputRef = useRef<HTMLInputElement>(null);
  /** Tracks DB-persisted document sources so upload can auto-save without requiring Setup → Save. */
  const persistedDocSourcesRef = useRef<{
    addendum: string;
    disclosure: string;
    sharedAddendumId: string;
    sharedDisclosureId: string;
  } | null>(null);

  const loadDocuments = useCallback(async (funderId: string) => {
    setDocumentsLoading(true);
    try {
      const rows = await fetchFunderDocuments(funderId);
      setDocuments(rows);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load documents");
      setDocuments([]);
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;

    setActiveTab("setup");
    setShowStateRules(false);
    setContractFile(null);
    setLogoFile(null);
    setLetterLogoFile(null);
    setLetterLogoRemoved(false);
    setDisclosureFile(null);
    setAddendumFile(null);
    setAddendumName("Flex Addendum");
    setAddendumCoordKey("flex_addendum");
    setDisclosureState("Texas");
    setDisclosureFrequency("daily");
    setDocuments([]);

    if (initial) {
      const legacyLetter = resolveLetterEmailBranding(initial);
      const hasSavedLetter = Boolean(
        String(initial.letterCompanyName ?? "").trim() ||
          String(initial.letterLogoUrl ?? "").trim() ||
          String(initial.letterWatermarkUrl ?? "").trim() ||
          String(initial.letterAccentStripLight ?? "").trim() ||
          String(initial.letterAccentStripDark ?? "").trim() ||
          String(initial.letterInfoTableIconBg ?? "").trim(),
      );
      setForm({
        name: initial.name,
        dealIdPrefix: initial.dealIdPrefix ?? "",
        docusignAccountProfileId: initial.docusignAccountProfileId ?? null,
        defaultCcEmail: initial.defaultCcEmail ?? "",
        contactEmail: initial.contactEmail ?? "",
        contactPhone: initial.contactPhone ?? "",
        addressLine1: initial.addressLine1 ?? "",
        addressCity: initial.addressCity ?? "",
        addressState: initial.addressState ?? "",
        addressZip: initial.addressZip ?? "",
        isActive: initial.isActive,
        documentsSource: initial.documentsSource ?? "own",
        sharedDocumentsFunderId: initial.sharedDocumentsFunderId ?? null,
        addendumDocumentsSource:
          initial.addendumDocumentsSource ?? initial.documentsSource ?? "own",
        disclosureDocumentsSource:
          initial.disclosureDocumentsSource ?? initial.documentsSource ?? "own",
        sharedAddendumFunderId:
          initial.sharedAddendumFunderId ?? initial.sharedDocumentsFunderId ?? null,
        sharedDisclosureFunderId:
          initial.sharedDisclosureFunderId ?? initial.sharedDocumentsFunderId ?? null,
        letterCompanyName: hasSavedLetter
          ? (initial.letterCompanyName ?? "")
          : legacyLetter.companyName,
        letterLogoUrl: hasSavedLetter
          ? (initial.letterLogoUrl ?? "")
          : legacyLetter.logoSrc,
        letterWatermarkUrl: hasSavedLetter
          ? (initial.letterWatermarkUrl ?? "")
          : legacyLetter.watermarkSrc,
        letterAccentStripLight: hasSavedLetter
          ? (initial.letterAccentStripLight ?? "")
          : legacyLetter.accentStripLight,
        letterAccentStripDark: hasSavedLetter
          ? (initial.letterAccentStripDark ?? "")
          : legacyLetter.accentStripDark,
        letterInfoTableIconBg: hasSavedLetter
          ? (initial.letterInfoTableIconBg ?? "")
          : legacyLetter.infoTableIconBg,
        letterWireBankName: initial.letterWireBankName ?? "",
        letterWireAddressLine1: initial.letterWireAddressLine1 ?? "",
        letterWireCityStateZip: initial.letterWireCityStateZip ?? "",
        letterWireRoutingNumber: initial.letterWireRoutingNumber ?? "",
        letterWireAccountNumber: initial.letterWireAccountNumber ?? "",
      });
      setStatesText((initial.allowedStates ?? []).join(", "));
      setExcludedStatesText((initial.excludedStates ?? []).join(", "));
      setShowStateRules(
        Boolean(initial.allowedStates?.length || initial.excludedStates?.length),
      );
      persistedDocSourcesRef.current = {
        addendum: resolveAddendumDocumentsSource(initial),
        disclosure: resolveDisclosureDocumentsSource(initial),
        sharedAddendumId: String(initial.sharedAddendumFunderId ?? ""),
        sharedDisclosureId: String(initial.sharedDisclosureFunderId ?? ""),
      };
      void loadDocuments(initial.id);
    } else {
      setForm(emptyForm);
      setStatesText("");
      setExcludedStatesText("");
      persistedDocSourcesRef.current = null;
    }
  }, [open, initial, loadDocuments]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(initial?.logoUrl ?? null);
      return;
    }
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile, initial?.logoUrl]);

  useEffect(() => {
    if (letterLogoFile) {
      const objectUrl = URL.createObjectURL(letterLogoFile);
      setLetterLogoPreviewUrl(objectUrl);
      return () => URL.revokeObjectURL(objectUrl);
    }
    if (letterLogoRemoved) {
      setLetterLogoPreviewUrl(null);
      return;
    }
    const saved = String(initial?.letterLogoUrl ?? "").trim();
    if (saved) {
      setLetterLogoPreviewUrl(saved);
      return;
    }
    if (initial) {
      const legacy = resolveLetterEmailBranding(initial);
      setLetterLogoPreviewUrl(legacy.logoSrc || null);
      return;
    }
    setLetterLogoPreviewUrl(null);
  }, [letterLogoFile, letterLogoRemoved, initial]);

  const set = (key: keyof FunderProfileInput, value: string | number | boolean | null) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const currentContractLabel =
    contractFile?.name || initial?.contractPdfFileName || DEFAULT_CONTRACT_FILENAME;

  const disclosureRows = documents.filter(isFunderDisclosureRow);
  const addendumRows = documents.filter(isFunderAddendumRow);

  const addendumSource = resolveAddendumDocumentsSource({
    documentsSource: form.documentsSource,
    addendumDocumentsSource: form.addendumDocumentsSource,
  });
  const disclosureSource = resolveDisclosureDocumentsSource({
    documentsSource: form.documentsSource,
    disclosureDocumentsSource: form.disclosureDocumentsSource,
  });
  const effectiveProfile = initial
    ? {
        id: initial.id,
        documentsSource: form.documentsSource,
        sharedDocumentsFunderId: form.sharedDocumentsFunderId ?? null,
        addendumDocumentsSource: form.addendumDocumentsSource,
        disclosureDocumentsSource: form.disclosureDocumentsSource,
        sharedAddendumFunderId: form.sharedAddendumFunderId ?? null,
        sharedDisclosureFunderId: form.sharedDisclosureFunderId ?? null,
      }
    : null;
  const canUploadAddendums = effectiveProfile
    ? canManageFunderAddendums(effectiveProfile)
    : false;
  const canUploadDisclosures = effectiveProfile
    ? canManageFunderDisclosures(effectiveProfile)
    : false;

  const sharedAddendumOwner = allFunders.find(
    (f) => f.id === form.sharedAddendumFunderId,
  );
  const sharedDisclosureOwner = allFunders.find(
    (f) => f.id === form.sharedDisclosureFunderId,
  );
  const otherFundersForShare = allFunders.filter((f) => f.id !== initial?.id);

  const addendumTypeLabel = (type: string) =>
    FUNDER_ADDENDUM_COORDINATE_LAYOUT_OPTIONS.find((o) => o.value === type)?.label ?? type;

  const handleSubmit = async () => {
    if (!form.name.trim()) return;

    const allowedStates = statesText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const excludedStates = excludedStatesText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: FunderProfileInput = {
      name: form.name.trim(),
      dealIdPrefix: form.dealIdPrefix?.trim() || undefined,
      allowedStates,
      excludedStates,
      docusignAccountProfileId: form.docusignAccountProfileId || null,
      defaultCcEmail: form.defaultCcEmail?.trim() ?? "",
      contactEmail: form.contactEmail?.trim() ?? "",
      contactPhone: form.contactPhone?.trim() ?? "",
      addressLine1: form.addressLine1?.trim() ?? "",
      addressCity: form.addressCity?.trim() ?? "",
      addressState: form.addressState?.trim() ?? "",
      addressZip: form.addressZip?.trim() ?? "",
      isActive: form.isActive,
      addendumDocumentsSource: addendumSource,
      disclosureDocumentsSource: disclosureSource,
      documentsSource: addendumSource,
      sharedAddendumFunderId:
        addendumSource === "shared" ? form.sharedAddendumFunderId || null : null,
      sharedDisclosureFunderId:
        disclosureSource === "shared" ? form.sharedDisclosureFunderId || null : null,
      sharedDocumentsFunderId:
        addendumSource === "shared" ? form.sharedAddendumFunderId || null : null,
      letterCompanyName: form.letterCompanyName?.trim() ?? "",
      letterWatermarkUrl: form.letterWatermarkUrl?.trim() ?? "",
      letterAccentStripLight: form.letterAccentStripLight?.trim() ?? "",
      letterAccentStripDark: form.letterAccentStripDark?.trim() ?? "",
      letterInfoTableIconBg: form.letterInfoTableIconBg?.trim() ?? "",
      letterWireBankName: form.letterWireBankName?.trim() ?? "",
      letterWireAddressLine1: form.letterWireAddressLine1?.trim() ?? "",
      letterWireCityStateZip: form.letterWireCityStateZip?.trim() ?? "",
      letterWireRoutingNumber: form.letterWireRoutingNumber?.trim() ?? "",
      letterWireAccountNumber: form.letterWireAccountNumber?.trim() ?? "",
    };

    if (letterLogoRemoved && !letterLogoFile) {
      payload.letterLogoUrl = "";
    }

    if (initial) {
      payload.mainContractLayoutKey = initial.mainContractLayoutKey;
      payload.assignsDealId = initial.assignsDealId;
      payload.sortOrder = initial.sortOrder;
    }

    await onSave(payload, {
      contractFile,
      logoFile,
      letterLogoFile: letterLogoRemoved ? null : letterLogoFile,
    });
  };

  /** Upload APIs enforce the *saved* DB source; UI only reflects the form. Persist first. */
  const ensureDocumentSourcesPersisted = async () => {
    if (!initial?.id) return;
    const sharedAddendumId =
      addendumSource === "shared" ? String(form.sharedAddendumFunderId ?? "") : "";
    const sharedDisclosureId =
      disclosureSource === "shared" ? String(form.sharedDisclosureFunderId ?? "") : "";
    const saved = persistedDocSourcesRef.current;
    if (
      saved &&
      saved.addendum === addendumSource &&
      saved.disclosure === disclosureSource &&
      saved.sharedAddendumId === sharedAddendumId &&
      saved.sharedDisclosureId === sharedDisclosureId
    ) {
      return;
    }
    await updateFunderProfile(initial.id, {
      name: form.name.trim() || initial.name,
      addendumDocumentsSource: addendumSource,
      disclosureDocumentsSource: disclosureSource,
      documentsSource: addendumSource,
      sharedAddendumFunderId:
        addendumSource === "shared" ? form.sharedAddendumFunderId || null : null,
      sharedDisclosureFunderId:
        disclosureSource === "shared" ? form.sharedDisclosureFunderId || null : null,
      sharedDocumentsFunderId:
        addendumSource === "shared" ? form.sharedAddendumFunderId || null : null,
    });
    persistedDocSourcesRef.current = {
      addendum: addendumSource,
      disclosure: disclosureSource,
      sharedAddendumId,
      sharedDisclosureId,
    };
  };

  const handleUploadDisclosure = async () => {
    if (!initial?.id) return;
    if (!disclosureFile) {
      toast.error("Select a PDF file first.");
      return;
    }
    setDisclosureUploading(true);
    try {
      await ensureDocumentSourcesPersisted();
      await uploadFunderDisclosureDocument(initial.id, {
        state: disclosureState,
        frequency: disclosureFrequency,
        file: disclosureFile,
      });
      toast.success(`Saved: ${disclosureState} · ${disclosureFrequency}`);
      setDisclosureFile(null);
      if (disclosureInputRef.current) disclosureInputRef.current.value = "";
      await loadDocuments(initial.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setDisclosureUploading(false);
    }
  };

  const handleUploadAddendum = async () => {
    if (!initial?.id) return;
    if (!addendumName.trim()) {
      toast.error("Enter a name for this addendum.");
      return;
    }
    if (!addendumFile) {
      toast.error("Select a PDF file first.");
      return;
    }
    setAddendumUploading(true);
    try {
      await ensureDocumentSourcesPersisted();
      await uploadFunderAddendumDocument(initial.id, {
        name: addendumName.trim(),
        coordinateLayoutKey: addendumCoordKey,
        file: addendumFile,
      });
      toast.success(`Saved: ${addendumName.trim()}`);
      setAddendumFile(null);
      if (addendumInputRef.current) addendumInputRef.current.value = "";
      await loadDocuments(initial.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAddendumUploading(false);
    }
  };

  const handleDeleteDocument = async (row: FunderDocumentTemplateRow) => {
    if (!initial?.id) return;
    if (!window.confirm(`Remove "${row.name}"?`)) return;
    setDocActionId(row.id);
    try {
      await deleteFunderDocument(initial.id, row.id);
      toast.success("Removed");
      await loadDocuments(initial.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setDocActionId(null);
    }
  };

  const applyAddendumPreset = (preset: (typeof ADDENDUM_PRESETS)[number]) => {
    setAddendumName(preset.name);
    setAddendumCoordKey(preset.type);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? `Edit ${initial.name}` : "Add funder"}</DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            {initial
              ? "Update funder settings, manage PDFs used on contracts, and configure letter branding. Set default CC email(s) on the setup tab."
              : "Create the funder first, then set default CC email(s) and upload disclosure/addendum PDFs."}
          </p>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="setup">1. Funder setup</TabsTrigger>
            <TabsTrigger value="documents" disabled={!initial}>
              2. Upload PDFs
            </TabsTrigger>
            <TabsTrigger value="letter" disabled={!initial}>
              3. Letter Info
            </TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-5 mt-2">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="f-name">Funder name</Label>
                <Input
                  id="f-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Black Card"
                />
              </div>

              <div className="grid gap-2">
                <Label>Funder logo</Label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 5 * 1024 * 1024) {
                      toast.error("Funder logo must be 5 MB or smaller.");
                      e.target.value = "";
                      setLogoFile(null);
                      return;
                    }
                    setLogoFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  {logoPreviewUrl ? (
                    <img
                      src={logoPreviewUrl}
                      alt={`${form.name || "Funder"} logo`}
                      className="h-12 w-20 shrink-0 rounded border bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded border bg-muted">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {logoFile ? "Change selected logo" : "Choose funder logo"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {logoFile?.name || (initial?.logoUrl ? "Current uploaded logo" : "PNG, JPG, WebP, or SVG · max 5 MB")}
                    </p>
                  </div>
                </button>
                <p className="text-xs text-muted-foreground">
                  Used on the reverse disbursement schedule and other funder-branded generated pages.
                </p>
              </div>

              <div className="rounded-lg border border-[var(--brand)]/25 bg-[var(--brand)]/5 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-[var(--brand)]" aria-hidden />
                  <Label htmlFor="f-default-cc" className="text-sm font-semibold">
                    Default CC email(s)
                  </Label>
                </div>
                <Input
                  id="f-default-cc"
                  type="text"
                  value={form.defaultCcEmail ?? ""}
                  onChange={(e) => set("defaultCcEmail", e.target.value)}
                  placeholder="comma-separated emails"
                />
              </div>

              <div className="grid gap-2">
                <Label>DocuSign account</Label>
                <Select
                  value={form.docusignAccountProfileId || "__none__"}
                  onValueChange={(v: string) =>
                    set("docusignAccountProfileId", v === "__none__" ? null : v)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {docusignOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Contracts for this funder are sent from this DocuSign account.
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Main contract PDF</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {contractFile ? "Change contract PDF" : "Click to choose contract PDF"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{currentContractLabel}</p>
                  </div>
                </button>
                {!initial && (
                  <p className="text-xs text-muted-foreground">
                    Optional — uses default ({DEFAULT_CONTRACT_FILENAME}) if empty.
                  </p>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="f-prefix">Deal ID prefix</Label>
                  <Input
                    id="f-prefix"
                    value={form.dealIdPrefix ?? ""}
                    onChange={(e) => set("dealIdPrefix", e.target.value)}
                    placeholder="BCF"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isActive !== false}
                      onChange={(e) => set("isActive", e.target.checked)}
                    />
                    Funder is active
                  </label>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <h3 className="text-sm font-semibold">Disclosure contact</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used on state disclosures (e.g. Connecticut) for the selected funder&apos;s
                  address, phone, and email.
                </p>
                <div className="grid gap-2">
                  <Label htmlFor="f-address">Street address</Label>
                  <Input
                    id="f-address"
                    value={form.addressLine1 ?? ""}
                    onChange={(e) => set("addressLine1", e.target.value)}
                    placeholder="123 Main St"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-3 sm:gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="f-city">City</Label>
                    <Input
                      id="f-city"
                      value={form.addressCity ?? ""}
                      onChange={(e) => set("addressCity", e.target.value)}
                      placeholder="City"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="f-state">State</Label>
                    <Input
                      id="f-state"
                      value={form.addressState ?? ""}
                      onChange={(e) => set("addressState", e.target.value)}
                      placeholder="CT"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="f-zip">ZIP</Label>
                    <Input
                      id="f-zip"
                      value={form.addressZip ?? ""}
                      onChange={(e) => set("addressZip", e.target.value)}
                      placeholder="06103"
                    />
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="f-phone">Phone</Label>
                    <Input
                      id="f-phone"
                      type="tel"
                      value={form.contactPhone ?? ""}
                      onChange={(e) => set("contactPhone", e.target.value)}
                      placeholder="(860) 555-0100"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="f-contact-email">Email</Label>
                    <Input
                      id="f-contact-email"
                      type="email"
                      value={form.contactEmail ?? ""}
                      onChange={(e) => set("contactEmail", e.target.value)}
                      placeholder="disclosures@example.com"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                onClick={() => setShowStateRules((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  State rules (optional)
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${showStateRules ? "rotate-180" : ""}`}
                />
              </button>
              {showStateRules && (
                <div className="space-y-4 border-t px-4 pb-4 pt-3">
                  <div className="grid gap-2">
                    <Label htmlFor="f-states">Only show in these states</Label>
                    <Input
                      id="f-states"
                      value={statesText}
                      onChange={(e) => setStatesText(e.target.value)}
                      placeholder="Texas, TX"
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to show in all states. Limit this funder to{" "}
                      <strong>Texas</strong> only (Texas or TX) to use the Texas
                      13-page contract layout automatically.
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="f-excluded-states">Hide in these states</Label>
                    <Input
                      id="f-excluded-states"
                      value={excludedStatesText}
                      onChange={(e) => setExcludedStatesText(e.target.value)}
                      placeholder="Texas, TX"
                    />
                    <p className="text-xs text-muted-foreground">
                      Example: hide Black Card when the deal is in Texas so the
                      Texas-only funder is selected instead.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {!initial && (
              <InfoBanner>
                After you click <strong>Add funder</strong>, reopen this funder to upload state
                disclosures and addendum PDFs on the <strong>Upload PDFs</strong> tab.
              </InfoBanner>
            )}
          </TabsContent>

          <TabsContent value="documents" className="space-y-5 mt-2">
            <UploadCard
              title="Addendum source"
              description="Choose where this funder gets flex / pre-payment / balance-transfer / ACH addendum PDFs. Independent from disclosures. The main contract PDF is always per funder."
            >
              <div className="space-y-2">
                {FUNDER_ADDENDUM_SOURCE_OPTIONS.map((opt) => (
                  <label
                    key={`addendum-${opt.value}`}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                      addendumSource === opt.value
                        ? "border-[var(--brand)] bg-[var(--brand)]/5"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="addendumDocumentsSource"
                      className="mt-1"
                      checked={addendumSource === opt.value}
                      onChange={() => {
                        set("addendumDocumentsSource", opt.value);
                        set("documentsSource", opt.value);
                        if (opt.value !== "shared") {
                          set("sharedAddendumFunderId", null);
                          set("sharedDocumentsFunderId", null);
                        }
                      }}
                    />
                    <span>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </span>
                  </label>
                ))}
              </div>

              {addendumSource === "shared" && (
                <div className="grid gap-2 pt-1">
                  <Label>Share addendums with</Label>
                  <Select
                    value={form.sharedAddendumFunderId || "__pick__"}
                    onValueChange={(v: string) => {
                      const id = v === "__pick__" ? null : v;
                      set("sharedAddendumFunderId", id);
                      set("sharedDocumentsFunderId", id);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select funder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__pick__">Select funder…</SelectItem>
                      {otherFundersForShare.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {addendumSource === "platform" && (
                <InfoBanner>
                  This funder uses platform addendums. No addendum uploads needed here.
                </InfoBanner>
              )}

              {addendumSource === "shared" && sharedAddendumOwner && !canUploadAddendums && (
                <InfoBanner>
                  Addendums are managed on <strong>{sharedAddendumOwner.name}</strong>. Edit that
                  funder to upload or change them.
                </InfoBanner>
              )}
            </UploadCard>

            <UploadCard
              title="Disclosure source"
              description="Choose where this funder gets state disclosure PDFs. You can keep platform defaults here while uploading custom addendums above."
            >
              <div className="space-y-2">
                {FUNDER_DISCLOSURE_SOURCE_OPTIONS.map((opt) => (
                  <label
                    key={`disclosure-${opt.value}`}
                    className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                      disclosureSource === opt.value
                        ? "border-[var(--brand)] bg-[var(--brand)]/5"
                        : "hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="disclosureDocumentsSource"
                      className="mt-1"
                      checked={disclosureSource === opt.value}
                      onChange={() => {
                        set("disclosureDocumentsSource", opt.value);
                        if (opt.value !== "shared") {
                          set("sharedDisclosureFunderId", null);
                        }
                      }}
                    />
                    <span>
                      <span className="text-sm font-medium">{opt.label}</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                    </span>
                  </label>
                ))}
              </div>

              {disclosureSource === "shared" && (
                <div className="grid gap-2 pt-1">
                  <Label>Share disclosures with</Label>
                  <Select
                    value={form.sharedDisclosureFunderId || "__pick__"}
                    onValueChange={(v: string) =>
                      set("sharedDisclosureFunderId", v === "__pick__" ? null : v)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select funder" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__pick__">Select funder…</SelectItem>
                      {otherFundersForShare.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {disclosureSource === "platform" && (
                <InfoBanner>
                  This funder uses platform state disclosures (same as Black Card).
                </InfoBanner>
              )}

              {disclosureSource === "shared" &&
                sharedDisclosureOwner &&
                !canUploadDisclosures && (
                  <InfoBanner>
                    Disclosures are managed on <strong>{sharedDisclosureOwner.name}</strong>. Edit
                    that funder to upload or change them.
                  </InfoBanner>
                )}

              <p className="text-xs text-muted-foreground">
                Save setup (tab 1) after changing these settings.
              </p>
            </UploadCard>

            {canUploadDisclosures ? (
              <>
            <UploadCard
              title="State disclosure PDFs"
              description="Some states require a disclosure page on the contract. Upload one PDF for each state + payment schedule combination."
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>State</Label>
                  <Select value={disclosureState} onValueChange={setDisclosureState}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {US_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Merchant pays</Label>
                  <Select value={disclosureFrequency} onValueChange={setDisclosureFrequency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DISCLOSURE_FREQUENCY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <input
                ref={disclosureInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setDisclosureFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => disclosureInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left hover:bg-muted/40"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">
                  {disclosureFile ? disclosureFile.name : "Choose disclosure PDF"}
                </span>
              </button>

              <Button
                type="button"
                className="w-full bg-[image:var(--brand-gradient)] hover:opacity-90"
                disabled={disclosureUploading || !disclosureFile}
                onClick={() => void handleUploadDisclosure()}
              >
                {disclosureUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  `Save disclosure for ${disclosureState} (${disclosureFrequency})`
                )}
              </Button>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Uploaded ({disclosureRows.length})
                </p>
                {documentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : disclosureRows.length > 0 ? (
                  <ul className="divide-y rounded-md border text-sm">
                    {disclosureRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <DocBadge>{row.state || "—"}</DocBadge>
                          <DocBadge>{row.frequency || "—"}</DocBadge>
                          <span className="truncate text-muted-foreground">{row.name}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          disabled={docActionId === row.id}
                          onClick={() => void handleDeleteDocument(row)}
                          title="Remove"
                        >
                          {docActionId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyDocList message="No disclosures yet. Pick a state, frequency, and PDF above." />
                )}
              </div>
            </UploadCard>
              </>
            ) : null}

            {canUploadAddendums ? (
              <>
            <UploadCard
              title="Addendum PDFs"
              description="Upload flex, pre-payment, balance transfer, or ACH addendum PDFs for this funder."
            >
              <div className="flex flex-wrap gap-2">
                {ADDENDUM_PRESETS.map((preset) => (
                  <Button
                    key={preset.type}
                    type="button"
                    size="sm"
                    variant={
                      addendumCoordKey === preset.type && addendumName === preset.name
                        ? "default"
                        : "outline"
                    }
                    className={
                      addendumCoordKey === preset.type && addendumName === preset.name
                        ? "bg-[image:var(--brand-gradient)] hover:opacity-90"
                        : undefined
                    }
                    onClick={() => applyAddendumPreset(preset)}
                  >
                    {preset.name}
                  </Button>
                ))}
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="addendum-name">Display name</Label>
                  <Input
                    id="addendum-name"
                    value={addendumName}
                    onChange={(e) => setAddendumName(e.target.value)}
                    placeholder="Flex Addendum"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Addendum type</Label>
                  <Select
                    value={addendumCoordKey}
                    onValueChange={(v: string) => {
                      setAddendumCoordKey(v);
                      const match = ADDENDUM_PRESETS.find((p) => p.type === v);
                      if (match && !addendumName.trim()) setAddendumName(match.name);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FUNDER_ADDENDUM_COORDINATE_LAYOUT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Signature field positions come from the platform template — you only upload the
                    PDF for this funder.
                  </p>
                </div>
              </div>

              <input
                ref={addendumInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setAddendumFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => addendumInputRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3 text-left hover:bg-muted/40"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">
                  {addendumFile ? addendumFile.name : "Choose addendum PDF"}
                </span>
              </button>

              <Button
                type="button"
                className="w-full bg-[image:var(--brand-gradient)] hover:opacity-90"
                disabled={addendumUploading || !addendumFile || !addendumName.trim()}
                onClick={() => void handleUploadAddendum()}
              >
                {addendumUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  `Save addendum: ${addendumName.trim() || "…"}`
                )}
              </Button>

              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Uploaded ({addendumRows.length})
                </p>
                {documentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : addendumRows.length > 0 ? (
                  <ul className="divide-y rounded-md border text-sm">
                    {addendumRows.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {addendumTypeLabel(row.type)}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive"
                          disabled={docActionId === row.id}
                          onClick={() => void handleDeleteDocument(row)}
                          title="Remove"
                        >
                          {docActionId === row.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyDocList message="No addendums yet. Use a quick pick above or enter a name and upload." />
                )}
              </div>
            </UploadCard>
              </>
            ) : null}
          </TabsContent>

          <TabsContent value="letter" className="space-y-5 mt-2">
            <InfoBanner>
              Branding and wire details for payoff and zero-balance letter emails.
              Upload a logo image to store it on Cloudinary. Leave optional fields blank
              to fall back to platform defaults.
            </InfoBanner>

            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="letter-company">Letter company name</Label>
                <Input
                  id="letter-company"
                  value={form.letterCompanyName ?? ""}
                  onChange={(e) => set("letterCompanyName", e.target.value)}
                  placeholder={form.name || "Company name on letters"}
                />
              </div>

              <div className="grid gap-2">
                <Label>Letter logo</Label>
                <input
                  ref={letterLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file && file.size > 5 * 1024 * 1024) {
                      toast.error("Letter logo must be 5 MB or smaller.");
                      e.target.value = "";
                      setLetterLogoFile(null);
                      return;
                    }
                    setLetterLogoRemoved(false);
                    setLetterLogoFile(file);
                  }}
                />
                <div className="flex w-full items-center gap-3 rounded-lg border border-dashed px-4 py-3">
                  {letterLogoPreviewUrl ? (
                    <img
                      src={letterLogoPreviewUrl}
                      alt="Letter logo preview"
                      className="h-12 w-20 shrink-0 rounded border bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded border bg-muted">
                      <Upload className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {letterLogoFile
                        ? "New logo selected"
                        : letterLogoRemoved
                          ? "Logo will be removed on save"
                          : initial?.letterLogoUrl
                            ? "Current letter logo"
                            : "No letter logo uploaded"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {letterLogoFile?.name ||
                        (letterLogoRemoved
                          ? "Save to delete from Cloudinary"
                          : initial?.letterLogoUrl
                            ? "Upload a new file to replace, or remove"
                            : "PNG, JPG, WebP, or SVG · max 5 MB")}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => letterLogoInputRef.current?.click()}
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      {letterLogoPreviewUrl && !letterLogoRemoved
                        ? "Upload new"
                        : "Upload"}
                    </Button>
                    {(letterLogoFile ||
                      (!letterLogoRemoved &&
                        Boolean(String(initial?.letterLogoUrl ?? "").trim()))) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => {
                          setLetterLogoFile(null);
                          setLetterLogoRemoved(true);
                          if (letterLogoInputRef.current) {
                            letterLogoInputRef.current.value = "";
                          }
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Saved to Cloudinary and used on payoff / zero-balance letter emails.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="letter-watermark">Watermark URL (optional)</Label>
                <Input
                  id="letter-watermark"
                  value={form.letterWatermarkUrl ?? ""}
                  onChange={(e) => set("letterWatermarkUrl", e.target.value)}
                  placeholder="https://…"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <ColorField
                  id="letter-accent-light"
                  label="Accent strip (light)"
                  value={form.letterAccentStripLight ?? ""}
                  onChange={(v) => set("letterAccentStripLight", v)}
                />
                <ColorField
                  id="letter-accent-dark"
                  label="Accent strip (dark)"
                  value={form.letterAccentStripDark ?? ""}
                  onChange={(v) => set("letterAccentStripDark", v)}
                />
                <ColorField
                  id="letter-icon-bg"
                  label="Info table icon background"
                  value={form.letterInfoTableIconBg ?? ""}
                  onChange={(v) => set("letterInfoTableIconBg", v)}
                />
              </div>

              <div className="overflow-hidden rounded-lg border">
                <div className="flex h-3">
                  <div
                    className="w-1/2"
                    style={{
                      backgroundColor:
                        form.letterAccentStripLight?.trim() || "#3d6fa0",
                    }}
                  />
                  <div
                    className="w-1/2"
                    style={{
                      backgroundColor:
                        form.letterAccentStripDark?.trim() || "#002147",
                    }}
                  />
                </div>
                <div className="flex items-stretch">
                  <div
                    className="flex w-12 shrink-0 items-center justify-center text-xs font-semibold text-white"
                    style={{
                      backgroundColor:
                        form.letterInfoTableIconBg?.trim() || "#002147",
                    }}
                  >
                    i
                  </div>
                  <div className="flex-1 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    Preview of accent strip and info-table icon column
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 border-t pt-5">
              <div>
                <h3 className="text-sm font-semibold">Wire information</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Payment Address block shown on payoff letters for this funder.
                </p>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="wire-bank">Bank / payment name</Label>
                  <Input
                    id="wire-bank"
                    value={form.letterWireBankName ?? ""}
                    onChange={(e) => set("letterWireBankName", e.target.value)}
                    placeholder="OPTIMUM BANK"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="wire-address1">Address line 1</Label>
                  <Input
                    id="wire-address1"
                    value={form.letterWireAddressLine1 ?? ""}
                    onChange={(e) => set("letterWireAddressLine1", e.target.value)}
                    placeholder="652 N Broad St, Suite 201"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="wire-city-state-zip">City, state, ZIP</Label>
                  <Input
                    id="wire-city-state-zip"
                    value={form.letterWireCityStateZip ?? ""}
                    onChange={(e) => set("letterWireCityStateZip", e.target.value)}
                    placeholder="Middletown, DE 19709"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="wire-routing">Routing number</Label>
                    <Input
                      id="wire-routing"
                      value={form.letterWireRoutingNumber ?? ""}
                      onChange={(e) => set("letterWireRoutingNumber", e.target.value)}
                      placeholder="067015096"
                      className="font-mono"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="wire-account">Account number</Label>
                    <Input
                      id="wire-account"
                      value={form.letterWireAccountNumber ?? ""}
                      onChange={(e) => set("letterWireAccountNumber", e.target.value)}
                      placeholder="0210047692"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {(form.letterWireBankName?.trim() ||
                form.letterWireAddressLine1?.trim() ||
                form.letterWireCityStateZip?.trim() ||
                form.letterWireRoutingNumber?.trim() ||
                form.letterWireAccountNumber?.trim()) && (
                <div className="rounded-lg border bg-white px-4 py-4 text-sm dark:bg-background">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Payment Address
                  </p>
                  {form.letterWireBankName?.trim() ? (
                    <p className="mt-1 font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-100">
                      {form.letterWireBankName.trim()}
                    </p>
                  ) : null}
                  {form.letterWireAddressLine1?.trim() ? (
                    <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                      {form.letterWireAddressLine1.trim()}
                    </p>
                  ) : null}
                  {form.letterWireCityStateZip?.trim() ? (
                    <p className="text-zinc-600 dark:text-zinc-400">
                      {form.letterWireCityStateZip.trim()}
                    </p>
                  ) : null}
                  <div className="mt-4 grid grid-cols-2 gap-6">
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Routing
                      </p>
                      <p className="mt-0.5 font-mono text-zinc-600 dark:text-zinc-400">
                        {form.letterWireRoutingNumber?.trim() || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                        Account Number
                      </p>
                      <p className="mt-0.5 font-mono text-zinc-600 dark:text-zinc-400">
                        {form.letterWireAccountNumber?.trim() || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {activeTab === "setup" ? (
            <Button
              className="bg-[image:var(--brand-gradient)] hover:opacity-90"
              disabled={saving || !form.name.trim()}
              onClick={() => void handleSubmit()}
            >
              {saving ? "Saving…" : initial ? "Save setup" : "Add funder"}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  setActiveTab(activeTab === "letter" ? "documents" : "setup")
                }
              >
                {activeTab === "letter" ? "Back to PDFs" : "Back to setup"}
              </Button>
              <Button
                className="bg-[image:var(--brand-gradient)] hover:opacity-90"
                disabled={saving || !form.name.trim()}
                onClick={() => void handleSubmit()}
              >
                {saving ? "Saving…" : activeTab === "letter" ? "Save letter info" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
