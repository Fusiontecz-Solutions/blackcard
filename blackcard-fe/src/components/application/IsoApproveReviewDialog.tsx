import { useEffect, useRef, useState, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateClient } from "@/redux/actions/clientActions";
import { resetUpdateClient } from "@/redux/slices/clientSlice";
import { getApplicationById, uploadApplicationDocuments } from "@/redux/actions/applicationActions";
import { toast } from "react-toastify";
import {
    CheckCircle2,
    Loader2,
    Upload,
    FileCheck2,
    ClipboardCheck,
    IdCard,
    Banknote,
    Files,
    Pin,
    ChevronDown,
    ChevronUp,
} from "lucide-react";
import { normalizeDocumentSlug } from "@/constants/documentRequestTypes";
import { useApplicationClientOwners } from "@/hooks/useApplicationClientOwners";

type ApprovalSummary = {
    borrowerName?: string;
    businessName?: string;
    loanAmount?: string;
    factorRate?: string;
    term?: string;
    frequency?: string;
    purchaseAmount?: string;
    payback?: string;
    payment?: string;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Falls back to this when redux app detail hasn't loaded yet. */
    applicationData?: any;
    /** Brief merchant + approval figures shown at the top of the window. */
    summary?: ApprovalSummary;
    /** Existing approve handler from Approval.tsx; invoked at the final step. */
    onApprove: () => Promise<void> | void;
    approving?: boolean;
};

type IsoDocSlot = {
    /** Canonical catalog slug (sent as documentType / requestedDocumentSlug). */
    slug: string;
    label: string;
    icon: typeof IdCard;
    /** Key identity/banking docs — highlighted here and pinned in the CRM table. */
    pinned?: boolean;
    multiple?: boolean;
};

/** The two key documents the ISO is asked to capture at approval. */
const KEY_DOC_SLOTS: IsoDocSlot[] = [
    { slug: "driver-license", label: "Driver's License", icon: IdCard, pinned: true },
    { slug: "voided-check", label: "Voided Check", icon: Banknote, pinned: true },
];

const OTHER_DOC_SLOT: IsoDocSlot = {
    slug: "other",
    label: "Other documents",
    icon: Files,
    multiple: true,
};

const STEPS = ["Review details", "Documents", "Confirm & approve"] as const;

/** Display DOB as mm-dd-yy (e.g. 03-15-85). */
const toDobDisplay = (raw: unknown) => {
    if (!raw) return "";
    const s = String(raw).trim();
    if (!s) return "";

    // Already mm-dd-yy
    if (/^\d{2}-\d{2}-\d{2}$/.test(s)) return s;

    // mm-dd-yyyy or mm/dd/yyyy
    const m4 = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(s);
    if (m4) return `${m4[1]}-${m4[2]}-${m4[3].slice(-2)}`;

    // ISO yyyy-mm-dd (parse parts directly — avoids timezone shift)
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return `${iso[2]}-${iso[3]}-${iso[1].slice(-2)}`;

    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}-${dd}-${yy}`;
};

/** Parse mm-dd-yy or mm-dd-yyyy back to ISO date (yyyy-mm-dd) for the API. */
const fromDobDisplay = (display: string): string | null => {
    const trimmed = display.trim();
    if (!trimmed) return null;

    const toIso = (mm: string, dd: string, fullYear: number) => {
        const month = parseInt(mm, 10);
        const day = parseInt(dd, 10);
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;
        const iso = `${fullYear}-${mm}-${dd}`;
        const check = new Date(iso);
        return Number.isNaN(check.getTime()) ? null : iso;
    };

    // mm-dd-yy
    let m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (m) {
        const yNum = parseInt(m[3], 10);
        const fullYear = yNum > 30 ? 1900 + yNum : 2000 + yNum;
        return toIso(m[1], m[2], fullYear);
    }

    // mm-dd-yyyy (also accepts what users type, e.g. 09-06-2003)
    m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
    if (m) return toIso(m[1], m[2], parseInt(m[3], 10));

    return null;
};

type OwnerForm = {
    firstName: string;
    lastName: string;
    email: string;
    mobileNumber: string;
    ssn: string;
    dateOfBirth: string;
    address1: string;
    city: string;
    state: string;
    zipCode: string;
};

type MandatoryFieldKey =
    | "businessName"
    | "businessEmail"
    | "businessNumber"
    | "einNumber"
    | "businessAddress1"
    | `owner-${number}-ssn`;

const buildFormPlaceholder = () => ({
    businessName: "",
    businessEmail: "",
    businessNumber: "",
    einNumber: "",
    businessAddress1: "",
    businessCity: "",
    businessState: "",
    businessZipCode: "",
});

const getMandatoryFieldErrors = (
    businessForm: ReturnType<typeof buildFormPlaceholder>,
    ownerForms: OwnerForm[],
): Partial<Record<MandatoryFieldKey, string>> => {
    const errors: Partial<Record<MandatoryFieldKey, string>> = {};
    if (!businessForm.businessName.trim()) errors.businessName = "Required";
    if (!businessForm.businessEmail.trim()) errors.businessEmail = "Required";
    if (!businessForm.businessNumber.trim()) errors.businessNumber = "Required";
    if (!businessForm.einNumber.trim()) errors.einNumber = "Required";
    if (!businessForm.businessAddress1.trim()) errors.businessAddress1 = "Required";
    ownerForms.forEach((owner, index) => {
        if (!owner.ssn.trim()) errors[`owner-${index}-ssn`] = "Required";
    });
    return errors;
};

const buildOwnerForm = (owner: any): OwnerForm => ({
    firstName: String(owner?.firstName ?? ""),
    lastName: String(owner?.lastName ?? ""),
    email: String(owner?.email ?? ""),
    mobileNumber: String(owner?.mobileNumber ?? ""),
    ssn: String(owner?.ssn ?? ""),
    dateOfBirth: toDobDisplay(owner?.dateOfBirth),
    address1: String(owner?.address?.address1 ?? ""),
    city: String(owner?.address?.city ?? ""),
    state: String(owner?.address?.state ?? ""),
    zipCode: String(owner?.address?.zipCode ?? ""),
});

const buildUploadedFromFiles = (files: unknown[] | undefined): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const f of files ?? []) {
        const file = f as {
            originalName?: string;
            documentType?: string;
            requestedDocumentSlug?: string;
            type?: string;
        };
        const slug = normalizeDocumentSlug(
            file.requestedDocumentSlug || file.documentType || file.type,
        );
        if (!slug) continue;
        const name = String(file.originalName || "Uploaded file");
        map[slug] = [...(map[slug] ?? []), name];
    }
    return map;
};

const buildUploadedSlotsFromFiles = (files: unknown[] | undefined): Record<string, boolean> => {
    const slots: Record<string, boolean> = {};
    for (const [slug, names] of Object.entries(buildUploadedFromFiles(files))) {
        if (names.length > 0) slots[slug] = true;
    }
    return slots;
};

const mergeUploadedMaps = (
    fromServer: Record<string, string[]>,
    local: Record<string, string[]>,
): Record<string, string[]> => {
    const merged = { ...fromServer };
    for (const [slot, names] of Object.entries(local)) {
        const existing = merged[slot] ?? [];
        const extra = names.filter((name) => !existing.includes(name));
        if (extra.length > 0) merged[slot] = [...existing, ...extra];
        else if (existing.length > 0) merged[slot] = existing;
        else if (names.length > 0) merged[slot] = names;
    }
    return merged;
};

const mergeUploadedSlots = (
    fromServer: Record<string, boolean>,
    local: Record<string, boolean>,
): Record<string, boolean> => ({ ...local, ...fromServer });

const IsoApproveReviewDialog = ({ open, onOpenChange, applicationData, summary, onApprove, approving }: Props) => {
    const dispatch = useDispatch<AppDispatch>();
    const reduxApp = useSelector((s: RootState) => s.applicationDetail.data) as any;
    const app = reduxApp ?? applicationData;

    const clientId = String(
        typeof app?.client === "string"
            ? app.client
            : (app?.client?.id ?? app?.client?._id ?? ""),
    );
    const applicationId = String(app?.id ?? app?._id ?? applicationData?.id ?? applicationData?._id ?? "");
    const business = app?.client?.business ?? {};
    const { owners: resolvedOwnerRecords } = useApplicationClientOwners(open ? app?.client : null);

    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState<string | null>(null);
    const [uploaded, setUploaded] = useState<Record<string, string[]>>({});
    const [uploadedSlots, setUploadedSlots] = useState<Record<string, boolean>>({});
    const [expandedOwnerIndex, setExpandedOwnerIndex] = useState(0);
    const dialogSessionKeyRef = useRef("");

    const buildForm = () => ({
        ...buildFormPlaceholder(),
        businessName: String(business?.name ?? ""),
        businessEmail: String(business?.email ?? ""),
        businessNumber: String(business?.number ?? ""),
        einNumber: String(business?.einNumber ?? ""),
        businessAddress1: String(business?.address?.address1 ?? ""),
        businessCity: String(business?.address?.city ?? ""),
        businessState: String(business?.address?.state ?? ""),
        businessZipCode: String(business?.address?.zipCode ?? ""),
    });
    const [form, setForm] = useState(buildForm);
    const [owners, setOwners] = useState<OwnerForm[]>([buildOwnerForm({})]);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<MandatoryFieldKey, string>>>({});

    const mapResolvedOwnersToForm = () =>
        resolvedOwnerRecords.length
            ? resolvedOwnerRecords.map(buildOwnerForm)
            : [buildOwnerForm({})];

    // Reset wizard only when the dialog opens for a (new) application — not when
    // client/files refetch mid-flow (that was clearing upload button state).
    useEffect(() => {
        if (!open) {
            dialogSessionKeyRef.current = "";
            return;
        }
        if (!applicationId) return;
        if (dialogSessionKeyRef.current === applicationId) return;
        dialogSessionKeyRef.current = applicationId;

        setStep(0);
        setForm(buildForm());
        setOwners(mapResolvedOwnersToForm());
        setExpandedOwnerIndex(resolvedOwnerRecords.length > 1 ? -1 : 0);
        const initialUploaded = buildUploadedFromFiles(app?.files);
        setUploaded(initialUploaded);
        setUploadedSlots(buildUploadedSlotsFromFiles(app?.files));
        setFieldErrors({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, applicationId]);

    useEffect(() => {
        if (!open) return;
        const nextOwners = mapResolvedOwnersToForm();
        setOwners(nextOwners);
        // Preserve open accordion across owner refetches; only clamp index.
        setExpandedOwnerIndex((current) => {
            if (nextOwners.length <= 1) return 0;
            if (current < 0) return current;
            if (current >= nextOwners.length) return Math.max(0, nextOwners.length - 1);
            return current;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, resolvedOwnerRecords]);

    // Keep the uploaded list in sync with the server without disturbing step or slots.
    useEffect(() => {
        if (!open) return;
        const fromServer = buildUploadedFromFiles(app?.files);
        const fromServerSlots = buildUploadedSlotsFromFiles(app?.files);
        setUploaded((prev) => mergeUploadedMaps(fromServer, prev));
        setUploadedSlots((prev) => mergeUploadedSlots(fromServerSlots, prev));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [app?.files, open]);

    const clearFieldError = (key: MandatoryFieldKey) => {
        setFieldErrors((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    };

    const set = (k: keyof ReturnType<typeof buildForm>, v: string) => {
        setForm((p) => ({ ...p, [k]: v }));
        clearFieldError(k as MandatoryFieldKey);
    };

    const setOwner = (index: number, k: keyof OwnerForm, v: string) => {
        setOwners((prev) => prev.map((o, i) => (i === index ? { ...o, [k]: v } : o)));
        if (k === "ssn") clearFieldError(`owner-${index}-ssn`);
    };

    const validateMandatoryFields = () => {
        const errors = getMandatoryFieldErrors(form, owners);
        setFieldErrors(errors);
        if (Object.keys(errors).length > 0) {
            const ownerErrorIndex = owners.findIndex((_, i) => errors[`owner-${i}-ssn`]);
            if (ownerErrorIndex >= 0) setExpandedOwnerIndex(ownerErrorIndex);
            toast.error("Business name, email, phone, EIN, address, and owner SSN are required before approving.");
            return false;
        }
        return true;
    };

    const validateMerchantDetails = () => {
        if (!clientId) {
            toast.info("Merchant details are still loading — please wait a moment.");
            return false;
        }
        if (!validateMandatoryFields()) return false;
        const hasInvalidDob = owners.some(
            (o) => o.dateOfBirth.trim() && !fromDobDisplay(o.dateOfBirth),
        );
        if (hasInvalidDob) {
            toast.error("Date of birth must be in mm-dd-yy format (e.g. 03-15-85). You can also use mm-dd-yyyy.");
            return false;
        }
        return true;
    };

    const saveCorrections = async () => {
        if (!validateMerchantDetails()) return false;
        setSaving(true);
        try {
            const ownersPayload = owners.map((o) => ({
                firstName: o.firstName,
                lastName: o.lastName,
                email: o.email,
                mobileNumber: o.mobileNumber,
                ssn: o.ssn,
                dateOfBirth: fromDobDisplay(o.dateOfBirth),
                address: {
                    address1: o.address1,
                    city: o.city,
                    state: o.state,
                    zipCode: o.zipCode,
                },
            }));
            await dispatch(
                updateClient({
                    id: clientId,
                    data: {
                        business: {
                            name: form.businessName,
                            email: form.businessEmail,
                            number: form.businessNumber,
                            einNumber: form.einNumber,
                            address: {
                                address1: form.businessAddress1,
                                city: form.businessCity,
                                state: form.businessState,
                                zipCode: form.businessZipCode,
                            },
                        },
                        owners: ownersPayload,
                        owner: ownersPayload[0],
                    } as any,
                }),
            ).unwrap();
            if (applicationId) void dispatch(getApplicationById(applicationId));
            toast.success("Merchant details updated.");
            return true;
        } catch (e: any) {
            toast.error(e?.message || String(e) || "Couldn't verify and save.");
            return false;
        } finally {
            dispatch(resetUpdateClient());
            setSaving(false);
        }
    };

    const uploadFiles = async (slot: string, fileList: FileList | null) => {
        if (!fileList || fileList.length === 0) return;
        if (!applicationId) {
            toast.info("Application is still loading — please wait a moment.");
            return;
        }

        const fileNames = Array.from(fileList).map((f) => f.name);
        setUploading(slot);
        setUploadedSlots((prev) => ({ ...prev, [slot]: true }));
        setUploaded((prev) => ({
            ...prev,
            [slot]: [...(prev[slot] ?? []), ...fileNames],
        }));

        try {
            const response = await dispatch(
                uploadApplicationDocuments({
                    id: applicationId,
                    files: Array.from(fileList),
                    requestedDocumentSlug: slot,
                }),
            ).unwrap();
            const updatedApp = response?.data ?? response;
            const fromResponse = buildUploadedFromFiles(updatedApp?.files);

            setUploaded((prev) => mergeUploadedMaps(fromResponse, prev));
            setUploadedSlots((prev) => ({
                ...prev,
                ...buildUploadedSlotsFromFiles(updatedApp?.files),
                [slot]: true,
            }));

            if (applicationId) void dispatch(getApplicationById(applicationId));
            toast.success("Document uploaded.");
        } catch (e: any) {
            setUploaded((prev) => {
                const remaining = (prev[slot] ?? []).filter((name) => !fileNames.includes(name));
                const next = { ...prev };
                if (remaining.length > 0) next[slot] = remaining;
                else delete next[slot];
                return next;
            });
            setUploadedSlots((prev) => {
                const hadBefore = buildUploadedSlotsFromFiles(app?.files)[slot];
                if (hadBefore) return { ...prev, [slot]: true };
                const next = { ...prev };
                delete next[slot];
                return next;
            });
            toast.error(e?.response?.data?.message || e?.message || "Upload failed.");
        } finally {
            setUploading(null);
        }
    };

    const totalUploaded = Object.values(uploaded).reduce((sum, names) => sum + names.length, 0);

    const handleStep0Next = () => {
        if (validateMerchantDetails()) setStep(1);
    };

    const finalApprove = async () => {
        if (!validateMerchantDetails()) {
            setStep(0);
            return;
        }
        await onApprove();
        onOpenChange(false);
    };

    const ownerLabel = (owner: OwnerForm, index: number) => {
        const lastRaw = String(owner.lastName ?? "").trim();
        const lastName =
            !lastRaw || lastRaw === "—" || /^\d+$/.test(lastRaw) ? "" : lastRaw;
        const name = `${owner.firstName} ${lastName}`.trim();
        return name || `Owner ${index + 1}`;
    };

    const primaryOwner = owners[0];
    const primaryOwnerName = primaryOwner
        ? `${primaryOwner.firstName} ${primaryOwner.lastName}`.trim()
        : "";
    const fullName =
        (primaryOwnerName || "—") + (owners.length > 1 ? ` (+${owners.length - 1} more)` : "");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ClipboardCheck className="h-5 w-5 text-[var(--brand)]" /> Review &amp; approve application
                    </DialogTitle>
                </DialogHeader>

                {/* Brief merchant + approval summary */}
                {summary && (
                    <div className="rounded-lg border bg-muted/30 p-3 mt-1">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                            <SummaryStat label="Merchant" value={summary.businessName || "—"} />
                            <SummaryStat label="Owner" value={summary.borrowerName || "—"} />
                            <SummaryStat label="Approved amount" value={summary.loanAmount || "—"} accent />
                            <SummaryStat label="Factor rate" value={summary.factorRate || "—"} />
                            <SummaryStat label="Term" value={summary.term || "—"} />
                            <SummaryStat label="Frequency" value={summary.frequency || "—"} />
                            {summary.payback ? <SummaryStat label="Payback" value={summary.payback} /> : null}
                            {summary.payment ? <SummaryStat label={`${summary.frequency || ""} payment`.trim()} value={summary.payment} /> : null}
                        </div>
                    </div>
                )}

                {/* Stepper */}
                <div className="flex items-center gap-2 mt-3 mb-3">
                    {STEPS.map((label, i) => (
                        <div key={label} className="flex items-center gap-2">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ${i <= step ? "bg-[image:var(--brand-gradient)] text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                            <span className={`text-xs ${i === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
                            {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-border" />}
                        </div>
                    ))}
                </div>

                {/* Step 1 — Review details */}
                {step === 0 && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Please confirm the merchant's details are correct. Fields marked with <span className="text-red-500">*</span> are required before you can approve.</p>
                        <Section title="Business">
                            <Field label="Business name" value={form.businessName} onChange={(v) => set("businessName", v)} required error={fieldErrors.businessName} />
                            <Field label="Business email" value={form.businessEmail} onChange={(v) => set("businessEmail", v)} required error={fieldErrors.businessEmail} />
                            <Field label="Business phone" value={form.businessNumber} onChange={(v) => set("businessNumber", v)} required error={fieldErrors.businessNumber} />
                            <Field label="EIN" value={form.einNumber} onChange={(v) => set("einNumber", v)} required error={fieldErrors.einNumber} />
                            <Field label="Address" value={form.businessAddress1} onChange={(v) => set("businessAddress1", v)} full required error={fieldErrors.businessAddress1} />
                            <Field label="City" value={form.businessCity} onChange={(v) => set("businessCity", v)} />
                            <Field label="State" value={form.businessState} onChange={(v) => set("businessState", v)} />
                            <Field label="Zip" value={form.businessZipCode} onChange={(v) => set("businessZipCode", v)} />
                        </Section>
                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {owners.length > 1 ? `Owners (${owners.length})` : "Owner"}
                            </p>
                            {owners.map((owner, index) => {
                                const isExpanded = expandedOwnerIndex === index;
                                return (
                                    <div key={index} className="rounded-lg border overflow-hidden">
                                        <button
                                            type="button"
                                            onClick={() => setExpandedOwnerIndex(isExpanded ? -1 : index)}
                                            className="flex w-full items-center justify-between gap-2 bg-muted/40 px-3 py-2 text-left"
                                        >
                                            <span className="text-sm font-medium">{ownerLabel(owner, index)}</span>
                                            {isExpanded ? (
                                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </button>
                                        {isExpanded && (
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3">
                                                <Field label="First name" value={owner.firstName} onChange={(v) => setOwner(index, "firstName", v)} />
                                                <Field label="Last name" value={owner.lastName} onChange={(v) => setOwner(index, "lastName", v)} />
                                                <Field label="Email" value={owner.email} onChange={(v) => setOwner(index, "email", v)} />
                                                <Field label="Mobile" value={owner.mobileNumber} onChange={(v) => setOwner(index, "mobileNumber", v)} />
                                                <Field label="SSN" value={owner.ssn} onChange={(v) => setOwner(index, "ssn", v)} required error={fieldErrors[`owner-${index}-ssn`]} />
                                                <Field
                                                    label="Date of birth"
                                                    value={owner.dateOfBirth}
                                                    onChange={(v) => setOwner(index, "dateOfBirth", v)}
                                                    placeholder="mm-dd-yy"
                                                    onBlur={() => {
                                                        const iso = fromDobDisplay(owner.dateOfBirth);
                                                        if (iso) setOwner(index, "dateOfBirth", toDobDisplay(iso));
                                                    }}
                                                />
                                                <Field label="Address" value={owner.address1} onChange={(v) => setOwner(index, "address1", v)} full />
                                                <Field label="City" value={owner.city} onChange={(v) => setOwner(index, "city", v)} />
                                                <Field label="State" value={owner.state} onChange={(v) => setOwner(index, "state", v)} />
                                                <Field label="Zip" value={owner.zipCode} onChange={(v) => setOwner(index, "zipCode", v)} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex justify-between gap-2 pt-1">
                            <Button variant="outline" onClick={() => void saveCorrections()} disabled={saving}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />} Verify and Save
                            </Button>
                            <Button onClick={handleStep0Next} disabled={saving} className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Next →
                            </Button>
                        </div>
                    </div>
                )}

                {/* Step 2 — Documents */}
                {step === 1 && (
                    <div className="space-y-4">
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300">
                            Recommended: upload a driver's license and a voided check — these are pinned in the CRM. You can still approve without them.
                        </div>

                        <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Key documents</p>
                            {KEY_DOC_SLOTS.map((doc) => (
                                <DocRow
                                    key={doc.slug}
                                    icon={doc.icon}
                                    label={doc.label}
                                    slot={doc.slug}
                                    pinned={doc.pinned}
                                    uploaded={uploaded[doc.slug] ?? []}
                                    isUploaded={Boolean(uploadedSlots[doc.slug]) || (uploaded[doc.slug]?.length ?? 0) > 0}
                                    uploading={uploading}
                                    onPick={uploadFiles}
                                />
                            ))}
                            <DocRow
                                icon={OTHER_DOC_SLOT.icon}
                                label={OTHER_DOC_SLOT.label}
                                slot={OTHER_DOC_SLOT.slug}
                                multiple={OTHER_DOC_SLOT.multiple}
                                uploaded={uploaded[OTHER_DOC_SLOT.slug] ?? []}
                                isUploaded={Boolean(uploadedSlots[OTHER_DOC_SLOT.slug]) || (uploaded[OTHER_DOC_SLOT.slug]?.length ?? 0) > 0}
                                uploading={uploading}
                                onPick={uploadFiles}
                            />
                        </div>

                        <div className="flex justify-between gap-2 pt-1">
                            <Button variant="outline" onClick={() => setStep(0)}>← Back</Button>
                            <Button onClick={() => setStep(2)} className="bg-[image:var(--brand-gradient)] hover:opacity-90 text-white">Next →</Button>
                        </div>
                    </div>
                )}

                {/* Step 3 — Confirm & approve */}
                {step === 2 && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">You're approving this application:</p>
                        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1.5">
                            <Row label="Business" value={form.businessName || "—"} />
                            <Row label={owners.length > 1 ? "Owners" : "Owner"} value={fullName} />
                            <Row label="Documents uploaded" value={`${totalUploaded} file(s)`} />
                        </div>
                        <div className="flex justify-between gap-2 pt-1">
                            <Button variant="outline" onClick={() => setStep(1)}>← Back</Button>
                            <Button onClick={() => void finalApprove()} disabled={approving} className="bg-[#16A34A] hover:bg-[#15803d] text-white">
                                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve application
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-lg border p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
        </div>
    );
}

function Field({
    label,
    value,
    onChange,
    full,
    type,
    placeholder,
    onBlur,
    required,
    error,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    full?: boolean;
    type?: string;
    placeholder?: string;
    onBlur?: () => void;
    required?: boolean;
    error?: string;
}) {
    return (
        <div className={full ? "col-span-2" : ""}>
            <label className="text-[11px] font-medium text-muted-foreground">
                {label}
                {required ? <span className="text-red-500"> *</span> : null}
            </label>
            <Input
                type={type ?? "text"}
                value={value}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                aria-invalid={Boolean(error)}
                className={`h-8 mt-0.5 text-sm ${error ? "border-red-500 focus-visible:ring-red-500" : ""}`}
            />
            {error ? <p className="text-[10px] text-red-500 mt-0.5">{error}</p> : null}
        </div>
    );
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className={`text-sm font-semibold truncate ${accent ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</p>
        </div>
    );
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium text-right break-words">{value}</span>
        </div>
    );
}

function DocRow({
    icon: Icon,
    label,
    slot,
    uploaded,
    isUploaded,
    uploading,
    multiple,
    pinned,
    onPick,
}: {
    icon: typeof IdCard;
    label: string;
    slot: string;
    uploaded: string[];
    isUploaded: boolean;
    uploading: string | null;
    multiple?: boolean;
    pinned?: boolean;
    onPick: (slot: string, files: FileList | null) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    const busy = uploading === slot;
    const hasUpload = isUploaded || uploaded.length > 0;
    const buttonLabel = busy ? "Uploading…" : hasUpload ? "Uploaded" : "Upload";
    const buttonDisabled = busy || (hasUpload && !multiple);

    return (
        <div
            className={`flex items-center justify-between gap-3 rounded-lg border p-3 ${pinned
                ? "border-[var(--brand)]/40 bg-[#EAF1FA]/50 dark:border-[#C07BE0]/30 dark:bg-[#1f2937]/40"
                : ""
                }`}
        >
            <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF1FA] text-[var(--brand)] dark:bg-[#1f2937] dark:text-[#C07BE0]">
                    <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium leading-tight">
                        {label}
                        {pinned && (
                            <span className="inline-flex items-center gap-0.5 rounded-md bg-[image:var(--brand-gradient)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                                <Pin className="h-2.5 w-2.5" /> Pinned
                            </span>
                        )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                        {uploaded.length ? uploaded.join(", ") : "No file uploaded"}
                    </p>
                </div>
            </div>
            <input ref={ref} type="file" multiple={multiple} className="hidden" onChange={(e) => { onPick(slot, e.target.files); e.target.value = ""; }} />
            <Button
                variant="outline"
                size="sm"
                disabled={buttonDisabled}
                onClick={() => ref.current?.click()}
                className={`shrink-0 gap-1.5 ${hasUpload ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400" : ""}`}
            >
                {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasUpload ? (
                    <FileCheck2 className="h-4 w-4 text-emerald-600" />
                ) : (
                    <Upload className="h-4 w-4" />
                )}
                {buttonLabel}
            </Button>
        </div>
    );
}

export default IsoApproveReviewDialog;
