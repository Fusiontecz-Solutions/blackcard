import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import { Document, Page, pdfjs } from "react-pdf";
import {
    Building2,
    CheckCircle2,
    FileText,
    Info,
    Landmark,
    Loader2,
    Mail,
    Pencil,
    Plus,
    Trash2,
    User,
    X,
} from "lucide-react";
import { toast } from "react-toastify";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { axiosGet, axiosPatch, axiosPost, axiosDelete } from "@/redux/axios";
import type { AppDispatch, RootState } from "@/redux/store";
import { getByApplicationIdContract, updateContract, getAllACH } from "@/redux/actions/contractActions";
import { voidBoldSignDocument } from "@/redux/actions/boldSignActions";
import { getApplicationById } from "@/redux/actions/applicationActions";
import { getBankDetails } from "@/redux/actions/bankDetailActions";
import {
    CONTRACT_PREFILL_UPDATED_EVENT,
    contractPrefillUpdateMatchesApplication,
} from "@/lib/contractPrefillSync";
import {
    findFunderProfile,
    formatFunderSelectLabel,
    isWoodmereFunderProfile,
    persistedFunderProfileIdForApi,
    useFunderProfiles,
} from "@/hooks/useFunderProfiles";
import { useContractSigningStatusRealtime } from "@/hooks/useContractSigningStatusRealtime";
import {
    DOCUSIGN_CRM_STATUS_POLL_MS,
    DOCUSIGN_WEBHOOK_STALE_MS,
    shouldFallbackPollDocuSign,
} from "./contractdata/docusignPolling";
import type { FunderProfile } from "@/types/integrationSettingsTypes";
import { APP_COMPANY_NAME } from "@/constants/appBranding";
import { pickUsStateForSelect } from "@/components/ui/searchable-state-select";
import {
    buildContractCcMergeOptions,
    contractCcFunderKey,
    contractDefaultCcIsFunderOverride,
    isReservedContractCcEmail,
    loadBoldSignCcEmailList,
    mergeWithDefaultCcEmails,
    resolveContractDefaultCcEmails,
    saveBoldSignCcEmailList,
    setTenantDefaultContractCcEmail,
} from "./docusignCcList";
import {
    fetchContractCcDefaults,
    type ContractCcDefaults,
} from "@/redux/actions/integrationSettingsActions";
import {
    boldSignTemplateIsPreviewable,
    getBoldSignTemplateMappingRef,
} from "./contractdata/boldSignTemplateDocument";
import {
    findFunderScopedAchTemplate,
    resolveAchCoordinateChoiceForFunder,
    resolveAchDocumentRefForSelectedFunder,
    type AchCoordinateLayoutChoice,
} from "./contractdata/achFunderDocumentRef";
import {
    canPreviewFilledOrSignedEnvelope,
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    formatDocumentSendStatusLabel,
    getDocumentSendStatusCapsuleClasses,
    isAchEnvelopeDraftLikeStatus,
    isAchEnvelopePastCcSendStep,
    isAchEnvelopeSigningFinished,
    parseDocumentSendHistory,
    parseDocumentTemplateEnvelopeByMappingId,
    parseDocumentTemplatePrefillByMappingId,
    resolveAchEnvelopeDisplayStatus,
    resolveAchLinkedEnvelopeMeta,
    resolveAchPdfEnvelopeId,
    getDocumentTemplatePrefillFieldRowsForEditor,
    parseLastAchSentFunder,
    type DocumentTemplateEnvelopeMeta,
} from "./contractdata/documentTemplateMappingPrefill";
import {
    TemplateMappingPrefillEditDialog,
    type TemplateMappingPrefillEditRow,
} from "./contractdata/TemplateMappingPrefillEditDialog";
import {
    ACH_PREFILL_MAPPING_ALIAS_KEY,
    resolveAchSavedMappingOverrides,
} from "./contractdata/achFormEditConfig";
import {
    normalizeContractPrefillOverrides,
    resolveContractBusinessLegalNameForPrefill,
    type BuildContractPrefillFieldsArgs,
    type ContractPrefillContractRecords,
} from "./contractdata/Contract";
import {
    buildAchFormEnvelopeEmailSubject,
    DOCUSIGN_EMAIL_SUBJECT_MAX_LEN,
} from "./contractdata/docusignTemplateConfig";
import { resolveBusinessNameFromPrefillFields } from "./contractdata/resolveBusinessNameFromPrefillFields";
import {
    buildDocuSignRolesFromEditorRows,
    mergeContractPrefillWithSignerOverrides,
    parseContractSignerOverridesFromPrefill,
    validateDocuSignSignerRoles,
    type ContractSignerOverrideRow,
    type DocuSignTemplateRolePayload,
} from "./contractdata/templateRecipients";
import { parseAchAuthorizationDocuSignFromPrefill } from "./contractdata/achAuthorizationDocuSign";
import LockedCcChips from "./LockedCcChips";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const DOCUSIGN_PRIMARY_BTN_CLASS =
    "h-9 shrink-0 cursor-pointer border-0 bg-[image:var(--brand-gradient)] px-6 text-white shadow-sm hover:opacity-90 focus-visible:ring-[var(--brand)]/40";

const ACH_STATUS_POLL_MS = DOCUSIGN_CRM_STATUS_POLL_MS;

const ACH_TERMINAL_VOID_STATUSES = new Set(["revoked", "voided", "declined", "expired"]);
const ACH_DRAFT_STATUSES = new Set(["", "draft"]);

function resolveDealStateFromApplication(applicationData: unknown): string {
    const ad = applicationData as Record<string, unknown> | null | undefined;
    if (!ad || typeof ad !== "object") return "";
    const bi0 = Array.isArray(ad.businessInfo)
        ? (ad.businessInfo[0] as Record<string, unknown>)
        : undefined;
    const client = ad.client as Record<string, unknown> | undefined;
    return pickUsStateForSelect(client?.state ?? bi0?.state);
}

function maskAccountTail(account: unknown): string {
    const digits = String(account ?? "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length <= 4) return digits;
    return `••••${digits.slice(-4)}`;
}

function formatAchRecordOptionLabel(row: Record<string, unknown>, index: number): string {
    const bank = String(row.bankName ?? "").trim();
    const holder = String(row.accountHolderName ?? "").trim();
    const tail = maskAccountTail(row.accountNumber);
    const parts = [bank || holder || `ACH entry #${index + 1}`, tail].filter(Boolean);
    return parts.join(" · ");
}

function toPreviewableTemplate(template: {
    id?: string;
    layoutKey?: string | null;
    templateId?: string | null;
    type?: string | null;
    name?: string | null;
    pdfUrl?: string | null;
    pdf_url?: string | null;
}): {
    id?: string;
    name?: string;
    layoutKey?: string;
    templateId?: string;
    type?: string;
    pdfUrl?: string;
    pdf_url?: string;
} {
    return {
        id: template.id,
        name: template.name == null ? undefined : String(template.name),
        layoutKey: template.layoutKey == null ? undefined : String(template.layoutKey),
        templateId: template.templateId == null ? undefined : String(template.templateId),
        type: template.type == null ? undefined : String(template.type),
        pdfUrl: template.pdfUrl == null ? undefined : String(template.pdfUrl),
        pdf_url: template.pdf_url == null ? undefined : String(template.pdf_url),
    };
}

function isPlatformAchTemplateRow(template: {
    layoutKey?: string | null;
    templateId?: string | null;
    type?: string | null;
    name?: string | null;
}): boolean {
    const layoutKey = String(template.layoutKey ?? "").trim().toLowerCase();
    const templateId = String(template.templateId ?? "").trim().toLowerCase();
    const type = String(template.type ?? "").trim().toLowerCase();
    const name = String(template.name ?? "").trim().toLowerCase();
    if (layoutKey.startsWith("funder_") || templateId.startsWith("funder_")) return false;
    return (
        layoutKey === "ach_authorization" ||
        layoutKey === "ach_authorization_standalone" ||
        layoutKey === "ach_authorization_texas" ||
        layoutKey === "woodmere_ach_authorization" ||
        type === "ach" ||
        type === "ach_authorization" ||
        (name.includes("ach") &&
            (name.includes("woodmere") || name.includes("black card") || name.includes("blackcard") || name.includes("black rok") || name.includes("blackrok")) &&
            !name.includes("attach"))
    );
}

function findPlatformAchTemplate(
    templates: Array<{
        id?: string;
        layoutKey?: string | null;
        templateId?: string | null;
        type?: string | null;
        name?: string | null;
        pdfUrl?: string | null;
        pdf_url?: string | null;
    }>,
) {
    const previewable = templates.filter(
        (t) => isPlatformAchTemplateRow(t) && boldSignTemplateIsPreviewable(toPreviewableTemplate(t)),
    );
    return (
        previewable.find((t) => String(t.layoutKey ?? "").toLowerCase() === "ach_authorization") ||
        previewable.find(
            (t) => String(t.layoutKey ?? "").toLowerCase() === "ach_authorization_standalone",
        ) ||
        previewable[0] ||
        null
    );
}

/** True when this funder can send an ACH form (platform Woodmere ACH, or uploaded ACH PDF). */
function funderHasAchAuthorizationForm(
    profile: FunderProfile,
    templates: Array<{ layoutKey?: string | null; templateId?: string | null; type?: string | null }>,
): boolean {
    if (isWoodmereFunderProfile(profile)) return true;
    const source = String(
        profile.addendumDocumentsSource ?? profile.documentsSource ?? "",
    )
        .trim()
        .toLowerCase();
    if (source === "platform") return true;

    const docsFunderId =
        source === "shared"
            ? String(
                  profile.sharedAddendumFunderId ??
                      profile.sharedDocumentsFunderId ??
                      "",
              ).trim() || profile.id
            : profile.id;
    const id = String(docsFunderId || "").trim();
    if (!id || id.startsWith("fallback-")) return false;

    const prefix = `funder_${id}_`.toLowerCase();
    return templates.some((row) => {
        const key = String(row.layoutKey ?? row.templateId ?? "")
            .trim()
            .toLowerCase();
        const type = String(row.type ?? "")
            .trim()
            .toLowerCase();
        if (!key.startsWith(prefix)) return false;
        return (
            type === "ach" ||
            type === "ach_authorization" ||
            type === "ach_authorization_texas" ||
            key.includes("ach_authorization")
        );
    });
}

const ACH_OUT_FOR_SIGNATURE_STATUSES = new Set(["sent", "viewed", "delivered"]);

function getAchEnvelopeView(status: string, envelopeId: string) {
    const s = String(status || "").trim().toLowerCase();
    const hasEnvelope = Boolean(String(envelopeId || "").trim());
    const isDraft = !hasEnvelope || ACH_DRAFT_STATUSES.has(s);
    const isCompleted = s === "completed" || s === "signed";
    const isTerminal = ACH_TERMINAL_VOID_STATUSES.has(s);
    const isOutForSignature =
        hasEnvelope &&
        !isDraft &&
        !isCompleted &&
        !isTerminal &&
        ACH_OUT_FOR_SIGNATURE_STATUSES.has(s);
    return { isDraft, isCompleted, isTerminal, isOutForSignature, hasEnvelope };
}

function canVoidAchEnvelope(status: string, envelopeId: string): boolean {
    const view = getAchEnvelopeView(status, envelopeId);
    if (view.isCompleted) return false;
    return view.isOutForSignature;
}

function canResendAchEnvelope(status: string, envelopeId: string): boolean {
    const view = getAchEnvelopeView(status, envelopeId);
    if (view.isOutForSignature) return true;
    if (view.isCompleted) return true;
    if (view.isTerminal) return true;
    return false;
}

function canReviewAndSendAchEnvelope(status: string, envelopeId: string): boolean {
    if (canResendAchEnvelope(status, envelopeId)) return true;
    const view = getAchEnvelopeView(status, envelopeId);
    return view.isDraft || !view.hasEnvelope;
}

type PdfPaneTab = "template" | "docusign";

export type AchDocumentTemplateMappingRow = {
    id: string;
    contractId: number;
    templateId: string;
    documentType: string;
    order: number;
    template?: {
        id: string;
        name?: string;
        type?: string;
        templateId?: string;
        pdfUrl?: string;
        layoutKey?: string;
        state?: string | null;
        frequency?: string | null;
    } | null;
};

function tryOpenDocuSignSenderUrl(senderUrl: string): boolean {
    const opened = window.open(senderUrl, "_blank");
    if (!opened) return false;
    try {
        opened.opener = null;
    } catch {
        /* ignore */
    }
    return true;
}

function writeDocuSignLoadingTab(doc: Document): void {
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Opening DocuSign</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;color:#334155}
.box{text-align:center;padding:2rem}.spin{width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:var(--brand);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1rem}
@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="box"><div class="spin"></div><p>Opening DocuSign…</p></div></body></html>`);
    doc.close();
}

function writeDocuSignErrorTab(doc: Document, message: string): void {
    const safe = String(message)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>DocuSign</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fef2f2;color:#991b1b;padding:1rem}
.box{max-width:28rem;text-align:center}</style></head><body><div class="box"><p><strong>Could not open DocuSign</strong></p><p>${safe}</p></div></body></html>`);
    doc.close();
}

function formatSigningStatusLabel(raw: unknown): string {
    const k = String(raw ?? "").trim().toUpperCase();
    const labels: Record<string, string> = {
        DRAFT: "Draft",
        SENT: "Sent — awaiting signature",
        VIEWED: "Viewed by signer",
        SIGNED: "Signed",
        COMPLETED: "Completed",
        DECLINED: "Declined",
        REVOKED: "Revoked",
        EXPIRED: "Expired",
    };
    if (labels[k]) return labels[k];
    if (!k) return "Not sent";
    return formatDocumentSendStatusLabel(k);
}

function DirectPdfViewer({
    fileUrl,
    errorMessage = "Could not render this PDF in the viewer.",
}: {
    fileUrl: string;
    errorMessage?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageWidth, setPageWidth] = useState(640);

    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const measure = () => {
            const w = el.clientWidth;
            if (w > 0) setPageWidth(Math.max(280, w - 4));
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={wrapRef}
            className="absolute inset-0 overflow-y-auto overflow-x-hidden bg-slate-100 dark:bg-slate-950"
        >
            <Document
                file={fileUrl}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                loading={
                    <div className="flex min-h-[200px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
                    </div>
                }
                error={
                    <div className="flex min-h-[200px] items-center justify-center px-4 text-center text-xs text-slate-500">
                        {errorMessage}
                    </div>
                }
                className="flex w-full flex-col items-center gap-3 py-3"
            >
                {numPages
                    ? Array.from({ length: numPages }, (_, i) => (
                          <Page
                              key={i + 1}
                              pageNumber={i + 1}
                              width={pageWidth}
                              className="bg-white shadow-md"
                              renderTextLayer
                              renderAnnotationLayer
                          />
                      ))
                    : null}
            </Document>
        </div>
    );
}

export interface ACHFormViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    contractId: number | null;
    applicationId: string | null;
    applicationData: unknown;
    achMapping: AchDocumentTemplateMappingRow | null;
    /** All ACH mapping instances for multi-form send (one PDF / envelope). */
    achMappings?: AchDocumentTemplateMappingRow[];
    contract: Record<string, unknown> | null;
    contractPrefillRecords?: ContractPrefillContractRecords;
    /** Info Required ACH rows — when more than one, show a selector in the modal. */
    achRecordOptions?: Record<string, unknown>[];
    selectedAchRecordId?: string | null;
    onSelectedAchRecordIdChange?: (id: string) => void;
    readOnly?: boolean;
    onContractDocumentsChanged?: () => void;
    onPrepareDocuSignDraft?: (payload: {
        ccEmails: string[];
        achDocumentRef?: string | null;
        standaloneAchOnly?: boolean;
        addendumDocuments?: Array<{ mappingId: string; documentRef: string }>;
        roles?: DocuSignTemplateRolePayload[];
        funderName?: string | null;
        funderProfileId?: string | null;
        contractState?: string | null;
        title?: string | null;
        documentName?: string | null;
        /** "Send ACH in new envelope" — never reuse / update the linked ACH envelope. */
        forceNewEnvelope?: boolean;
    }) => Promise<{
        envelopeId?: string;
        sendUrl?: string | null;
    }>;
    persistAchEnvelopeOnContract: (
        mappingId: string,
        envelopeId: string,
        status?: string,
        funderMeta?: { funderName?: string | null; funderProfileId?: string | null } | null,
        persistOptions?: { keepDraftPriors?: boolean },
    ) => Promise<void>;
    fetchDocuSignSenderViewUrlWithRetry: (
        envelopeId: string,
        ccForSync: string[],
        justCreated: boolean,
        rolesOverride?: DocuSignTemplateRolePayload[],
    ) => Promise<{ url: string | null; error: string | null }>;
    getSignerEmail: () => string;
    getSignerName: () => string;
}

export default function ACHFormViewerModal({
    isOpen,
    onClose,
    contractId,
    applicationId,
    applicationData,
    achMapping,
    achMappings: achMappingsProp,
    contract,
    contractPrefillRecords,
    achRecordOptions = [],
    selectedAchRecordId = null,
    onSelectedAchRecordIdChange,
    readOnly = false,
    onContractDocumentsChanged,
    onPrepareDocuSignDraft,
    persistAchEnvelopeOnContract,
    fetchDocuSignSenderViewUrlWithRetry,
    getSignerEmail,
    getSignerName,
}: ACHFormViewerModalProps) {
    const dispatch = useDispatch<AppDispatch>();
    const [resolvedContract, setResolvedContract] = useState<Record<string, unknown> | null>(
        contract,
    );
    const [pdfPaneTab, setPdfPaneTab] = useState<PdfPaneTab>("template");
    const [templatePdfUrl, setTemplatePdfUrl] = useState<string | null>(null);
    const [templatePdfLoading, setTemplatePdfLoading] = useState(false);
    const [docuSignPdfUrl, setDocuSignPdfUrl] = useState<string | null>(null);
    const [docuSignPdfLoading, setDocuSignPdfLoading] = useState(false);
    const [docuSignPdfHint, setDocuSignPdfHint] = useState<string | null>(null);
    const [isSendingAch, setIsSendingAch] = useState(false);
    const [isVoidingAch, setIsVoidingAch] = useState(false);
    const [statusRefreshing, setStatusRefreshing] = useState(false);
    const [lastStatusSyncAt, setLastStatusSyncAt] = useState<Date | null>(null);
    const [prefillEditOpen, setPrefillEditOpen] = useState(false);
    const [prefillEditMappingId, setPrefillEditMappingId] = useState<string | null>(null);
    const [addingAchForm, setAddingAchForm] = useState(false);
    const [removingAchMappingIds, setRemovingAchMappingIds] = useState<Set<string>>(() => new Set());
    const [localAchMappings, setLocalAchMappings] = useState<AchDocumentTemplateMappingRow[]>([]);
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [ccEmailDraft, setCcEmailDraft] = useState("");
    const [envelopeEmailSubject, setEnvelopeEmailSubject] = useState("");
    const envelopeEmailSubjectDirtyRef = useRef(false);
    const [achSigner, setAchSigner] = useState<ContractSignerOverrideRow>({
        role: "Receiver",
        name: "",
        email: "",
    });
    const [achSecondSigner, setAchSecondSigner] = useState<ContractSignerOverrideRow>({
        role: "Owner 2",
        name: "",
        email: "",
    });
    const [showAchSignerEditor, setShowAchSignerEditor] = useState(false);
    const [signerDraft, setSignerDraft] = useState<ContractSignerOverrideRow>({
        role: "Receiver",
        name: "",
        email: "",
    });
    const [secondSignerDraft, setSecondSignerDraft] = useState<ContractSignerOverrideRow>({
        role: "Owner 2",
        name: "",
        email: "",
    });
    const [savingSigner, setSavingSigner] = useState(false);
    const [selectedFunder, setSelectedFunder] = useState("");
    const [selectedFunderProfileId, setSelectedFunderProfileId] = useState("");
    const userSelectedFunderRef = useRef(false);
    const [achCoordinateLayout, setAchCoordinateLayout] =
        useState<AchCoordinateLayoutChoice>("woodmere");
    const templateBlobUrlRef = useRef<string | null>(null);
    /** Ignores stale ACH template downloads when funder selection changes mid-flight. */
    const templatePdfLoadGenRef = useRef(0);
    const docuSignBlobUrlRef = useRef<string | null>(null);
    const achCcEmailDeliveredRef = useRef(false);
    const lastAchStatusSyncAtRef = useRef(0);
    const lastAchCrmStatusChangeAtRef = useRef(Date.now());
    const lastAchPrefillSyncKeyRef = useRef<string | null>(null);
    const achPrefillSyncInFlightRef = useRef(new Map<string, Promise<boolean>>());
    const automaticAchPrefillTriggerRef = useRef<string | null>(null);
    /** After Review & send opens DocuSign, freeze CRM→tab patches so sender edits stick. */
    const achCrmPrefillFrozenForSenderViewRef = useRef(false);

    const contractStateForFunders = useMemo(() => {
        const fromContract = String(
            (resolvedContract as { state?: string | null } | null)?.state ?? "",
        ).trim();
        if (fromContract) return pickUsStateForSelect(fromContract) || fromContract;
        return resolveDealStateFromApplication(applicationData);
    }, [resolvedContract, applicationData]);

    const {
        funders,
        funderSelectEntries,
        findFunder,
        findFunderById,
        resolveDefaultFunder,
    } = useFunderProfiles(null);

    const boldSignTemplatesState = useSelector((state: RootState) => state.boldSignTemplates);
    const boldSignTemplates = useMemo(
        () =>
            Array.isArray(boldSignTemplatesState.data)
                ? (boldSignTemplatesState.data as Array<{
                      layoutKey?: string | null;
                      templateId?: string | null;
                      type?: string | null;
                  }>)
                : [],
        [boldSignTemplatesState.data],
    );

    const achCapableFunderEntries = useMemo(() => {
        return funderSelectEntries.filter((entry) => {
            const profile = findFunderById(entry.value);
            if (!profile) return false;
            return funderHasAchAuthorizationForm(profile, boldSignTemplates);
        });
    }, [funderSelectEntries, findFunderById, boldSignTemplates]);

    const woodmereAchFunderEntry = useMemo(() => {
        return (
            achCapableFunderEntries.find((entry) => {
                const profile = findFunderById(entry.value);
                return profile ? isWoodmereFunderProfile(profile) : false;
            }) ?? null
        );
    }, [achCapableFunderEntries, findFunderById]);

    const funderSelectOptions = useMemo(() => {
        const base = achCapableFunderEntries;
        const curId = String(selectedFunderProfileId || "").trim();
        if (curId && !base.some((x) => x.value === curId)) {
            const profile = findFunderById(curId);
            if (profile && funderHasAchAuthorizationForm(profile, boldSignTemplates)) {
                return [
                    ...base,
                    {
                        value: profile.id,
                        label: formatFunderSelectLabel(profile),
                        funderName: profile.name,
                    },
                ];
            }
        }
        return base;
    }, [
        achCapableFunderEntries,
        selectedFunderProfileId,
        findFunderById,
        boldSignTemplates,
    ]);

    const selectedFunderProfile = useMemo(
        () =>
            findFunderById(selectedFunderProfileId) ?? findFunder(selectedFunder),
        [findFunderById, findFunder, selectedFunderProfileId, selectedFunder],
    );

    const selectedFunderDefaultCcEmail = useMemo(
        () => String(selectedFunderProfile?.defaultCcEmail ?? "").trim() || null,
        [selectedFunderProfile],
    );

    const [tenantContractCcDefaults, setTenantContractCcDefaults] =
        useState<ContractCcDefaults | null>(null);
    const [tenantCcDefaultsFunderKey, setTenantCcDefaultsFunderKey] = useState("");
    const selectedCcFunderKey = useMemo(
        () => contractCcFunderKey(selectedFunderProfileId, selectedFunder),
        [selectedFunderProfileId, selectedFunder],
    );

    const contractCcMergeOptions = useMemo(
        () =>
            buildContractCcMergeOptions({
                selectedFunderDefaultCcEmail,
                selectedFunderKey: selectedCcFunderKey,
                apiDefaults: tenantContractCcDefaults,
                apiFunderKey: tenantCcDefaultsFunderKey,
                funderDefaultCcValues: funders.map((f) => f.defaultCcEmail),
            }),
        [
            selectedFunderDefaultCcEmail,
            selectedCcFunderKey,
            tenantContractCcDefaults,
            tenantCcDefaultsFunderKey,
            funders,
        ],
    );

    const contractDefaultCcEmails = useMemo(
        () => resolveContractDefaultCcEmails(contractCcMergeOptions),
        [contractCcMergeOptions],
    );

    const contractDefaultCcUsesFunderOverride = useMemo(
        () => contractDefaultCcIsFunderOverride(contractCcMergeOptions),
        [contractCcMergeOptions],
    );

    const funderSelectionStorageKey = useMemo(
        () =>
            contractId != null ? `achFormSelectedFunderProfileId:${contractId}` : null,
        [contractId],
    );

    const applyFunderSelection = useCallback(
        (profileId: string, funderName: string, options?: { persist?: boolean }) => {
            setSelectedFunderProfileId(profileId);
            setSelectedFunder(funderName);
            if (funderSelectionStorageKey && typeof window !== "undefined" && profileId) {
                try {
                    window.sessionStorage.setItem(funderSelectionStorageKey, profileId);
                } catch {
                    /* ignore */
                }
            }
            if (options?.persist && contractId != null && funderName.trim()) {
                void dispatch(
                    updateContract({
                        id: Number(contractId),
                        data: { funderName: funderName.trim() },
                    }),
                )
                    .unwrap()
                    .then(() => onContractDocumentsChanged?.())
                    .catch(() => {
                        /* non-blocking */
                    });
            }
        },
        [contractId, dispatch, funderSelectionStorageKey, onContractDocumentsChanged],
    );

    useEffect(() => {
        if (!isOpen) return;
        setAchCoordinateLayout(
            resolveAchCoordinateChoiceForFunder(
                selectedFunderProfile,
                boldSignTemplates,
            ),
        );
    }, [isOpen, selectedFunderProfile, boldSignTemplates]);

    useEffect(() => {
        if (!isOpen) {
            userSelectedFunderRef.current = false;
            return;
        }
        if (userSelectedFunderRef.current) return;
        if (!achCapableFunderEntries.length) return;

        const isAchCapableId = (id: string) =>
            achCapableFunderEntries.some((e) => e.value === id);

        const lastSent = parseLastAchSentFunder(
            (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides,
        );
        const pickAchCapableProfile = (
            profileId?: string | null,
            funderName?: string | null,
        ) => {
            const byId =
                profileId && isAchCapableId(profileId) ? findFunderById(profileId) : null;
            if (byId) return byId;
            const byName = findFunderProfile(
                funders,
                funderName,
                contractStateForFunders,
            );
            if (byName && isAchCapableId(byName.id)) return byName;
            const entryByName = achCapableFunderEntries.find(
                (e) =>
                    String(funderName || "").trim() &&
                    (e.funderName.toLowerCase() === String(funderName).trim().toLowerCase() ||
                        e.label.toLowerCase() === String(funderName).trim().toLowerCase()),
            );
            return entryByName ? findFunderById(entryByName.value) ?? null : null;
        };

        if (lastSent) {
            const lastSentProfile = pickAchCapableProfile(
                lastSent.funderProfileId,
                lastSent.funderName,
            );
            if (lastSentProfile) {
                setSelectedFunderProfileId(lastSentProfile.id);
                setSelectedFunder(lastSentProfile.name);
                return;
            }
        }

        // Contract funder from a prior ACH send/select (legacy before lastAchSentFunder).
        const contractFunderName = String(
            (resolvedContract as { funderName?: unknown } | null)?.funderName ?? "",
        ).trim();
        const contractFunderProfile = pickAchCapableProfile(null, contractFunderName);
        if (contractFunderProfile && !isWoodmereFunderProfile(contractFunderProfile)) {
            setSelectedFunderProfileId(contractFunderProfile.id);
            setSelectedFunder(contractFunderProfile.name);
            return;
        }

        let preferredProfileId = "";
        if (funderSelectionStorageKey && typeof window !== "undefined") {
            try {
                preferredProfileId = String(
                    window.sessionStorage.getItem(funderSelectionStorageKey) || "",
                ).trim();
            } catch {
                preferredProfileId = "";
            }
        }

        const storedProfile =
            preferredProfileId && isAchCapableId(preferredProfileId)
                ? findFunderById(preferredProfileId)
                : null;
        if (storedProfile) {
            setSelectedFunderProfileId(storedProfile.id);
            setSelectedFunder(storedProfile.name);
            return;
        }

        // Default: Woodmere when it has ACH (platform), else first ACH-capable funder.
        if (woodmereAchFunderEntry) {
            setSelectedFunderProfileId(woodmereAchFunderEntry.value);
            setSelectedFunder(woodmereAchFunderEntry.funderName);
            return;
        }

        const defaultName = resolveDefaultFunder();
        const defaultProfile = findFunderProfile(
            funders,
            defaultName,
            contractStateForFunders,
        );
        if (defaultProfile && isAchCapableId(defaultProfile.id)) {
            setSelectedFunderProfileId(defaultProfile.id);
            setSelectedFunder(defaultProfile.name);
            return;
        }

        const first = achCapableFunderEntries[0];
        if (first) {
            setSelectedFunderProfileId(first.value);
            setSelectedFunder(first.funderName);
        }
    }, [
        isOpen,
        funders,
        achCapableFunderEntries,
        woodmereAchFunderEntry,
        contractStateForFunders,
        funderSelectionStorageKey,
        findFunderById,
        resolveDefaultFunder,
        resolvedContract,
    ]);

    const documentTemplateEnvelopeByMappingId = useMemo(
        () =>
            parseDocumentTemplateEnvelopeByMappingId(
                (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides,
            ),
        [resolvedContract],
    );

    const linkedAchEnvelope = useMemo((): DocumentTemplateEnvelopeMeta | null => {
        const prefill = (resolvedContract as { contractPrefillOverrides?: unknown } | null)
            ?.contractPrefillOverrides;
        const capsule = parseAchAuthorizationDocuSignFromPrefill(prefill);
        return resolveAchLinkedEnvelopeMeta({
            mappingId: achMapping?.id,
            envelopeByMappingId: documentTemplateEnvelopeByMappingId,
            sendHistory: parseDocumentSendHistory(prefill).filter((h) => h.documentKind === "ach"),
            capsule,
        });
    }, [achMapping?.id, documentTemplateEnvelopeByMappingId, resolvedContract]);

    const achSendHistory = useMemo(
        () =>
            parseDocumentSendHistory(
                (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides,
            ).filter((h) => h.documentKind === "ach"),
        [resolvedContract],
    );

    const achEnvelopeId = String(linkedAchEnvelope?.envelopeId ?? "").trim();
    const achStatus = String(linkedAchEnvelope?.status ?? "").trim();
    const achDisplayStatus = useMemo(
        () => resolveAchEnvelopeDisplayStatus(linkedAchEnvelope, achSendHistory),
        [linkedAchEnvelope, achSendHistory],
    );
    const achStatusLabel = formatDocumentSendStatusLabel(achDisplayStatus);
    const isSignedAch =
        isAchEnvelopeSigningFinished(achDisplayStatus) ||
        isAchEnvelopeSigningFinished(achStatus);
    const achPdfEnvelopeId = useMemo(
        () =>
            resolveAchPdfEnvelopeId(linkedAchEnvelope, achSendHistory, {
                preferSigned: isSignedAch,
            }),
        [linkedAchEnvelope, achSendHistory, isSignedAch],
    );
    /** Only after send — draft envelopes stay on the ACH template tab. */
    const canPreviewDocuSignPdf = Boolean(
        achPdfEnvelopeId &&
            (canPreviewFilledOrSignedEnvelope(achStatus) ||
                canPreviewFilledOrSignedEnvelope(achDisplayStatus) ||
                isSignedAch),
    );

    const documentTemplatePrefillByMappingId = useMemo(
        () =>
            parseDocumentTemplatePrefillByMappingId(
                (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides,
            ),
        [resolvedContract],
    );

    const envelopeFunderLabel = String(
        selectedFunder || selectedFunderProfile?.name || "",
    ).trim();
    const envelopeBusinessName = useMemo(() => {
        const achPrefillFields: Array<{ id: string; value: string }> = [];
        for (const row of Object.values(documentTemplatePrefillByMappingId)) {
            if (!row) continue;
            for (const [id, value] of Object.entries(row)) {
                achPrefillFields.push({ id, value: String(value ?? "") });
            }
        }
        return (
            resolveBusinessNameFromPrefillFields(achPrefillFields, { preferAch: true }) ||
            resolveContractBusinessLegalNameForPrefill(
                (resolvedContract ?? {}) as Record<string, unknown>,
                applicationData,
            ) ||
            "Business"
        );
    }, [documentTemplatePrefillByMappingId, resolvedContract, applicationData]);
    const defaultEnvelopeEmailSubject = useMemo(
        () => buildAchFormEnvelopeEmailSubject(envelopeBusinessName, null, envelopeFunderLabel),
        [envelopeBusinessName, envelopeFunderLabel],
    );

    useEffect(() => {
        if (!isOpen) {
            envelopeEmailSubjectDirtyRef.current = false;
            setEnvelopeEmailSubject("");
            return;
        }
        if (!envelopeEmailSubjectDirtyRef.current) {
            setEnvelopeEmailSubject(defaultEnvelopeEmailSubject);
        }
    }, [isOpen, defaultEnvelopeEmailSubject]);

    const mainPrefillOverridesForDialog = useMemo(() => {
        const raw = normalizeContractPrefillOverrides(
            (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides,
        );
        if (!raw) return null;
        const o = { ...raw } as Record<string, unknown>;
        delete o[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
        return o as Partial<BuildContractPrefillFieldsArgs>;
    }, [resolvedContract]);

    const achTemplateLabel = useMemo(() => {
        const funderName = String(
            selectedFunder || selectedFunderProfile?.name || "",
        ).trim();
        if (funderName) return funderName;

        const profile = selectedFunderProfile;
        const usesPlatformAch =
            !profile ||
            isWoodmereFunderProfile(profile) ||
            String(profile.addendumDocumentsSource ?? profile.documentsSource ?? "")
                .trim()
                .toLowerCase() === "platform";
        if (usesPlatformAch) {
            const platformAch = findPlatformAchTemplate(boldSignTemplates);
            const platformName = String(platformAch?.name ?? "").trim();
            if (platformName && !/^ach\s*authorization$/i.test(platformName)) {
                return platformName;
            }
            return APP_COMPANY_NAME;
        }
        const docsFunderId =
            String(profile.addendumDocumentsSource ?? profile.documentsSource ?? "")
                .trim()
                .toLowerCase() === "shared"
                ? String(
                      profile.sharedAddendumFunderId ??
                          profile.sharedDocumentsFunderId ??
                          "",
                  ).trim() || profile.id
                : profile.id;
        const scopedAch = findFunderScopedAchTemplate(docsFunderId, boldSignTemplates);
        const scopedName = String(scopedAch?.name ?? "").trim();
        if (scopedName && !/^ach\s*authorization$/i.test(scopedName)) return scopedName;
        const mapped = String(achMapping?.template?.name ?? "").trim();
        if (mapped && !/^ach\s*authorization$/i.test(mapped)) return mapped;
        return "ACH form";
    }, [achMapping, selectedFunder, selectedFunderProfile, boldSignTemplates]);

    const sortedAchMappings = useMemo(() => {
        const fromProp = Array.isArray(achMappingsProp) ? achMappingsProp : [];
        const source =
            localAchMappings.length > 0
                ? localAchMappings
                : fromProp.length > 0
                  ? fromProp
                  : achMapping
                    ? [achMapping]
                    : [];
        return [...source]
            .filter((row) => row?.id && !String(row.id).startsWith("ach-template-"))
            .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    }, [achMapping, achMappingsProp, localAchMappings]);

    const prefillEditRow = useMemo(() => {
        const editId = String(prefillEditMappingId ?? "").trim();
        return (
            (editId ? sortedAchMappings.find((row) => row.id === editId) : null) ??
            sortedAchMappings[0] ??
            achMapping
        );
    }, [achMapping, prefillEditMappingId, sortedAchMappings]);

    const refreshAchMappingsLocal = useCallback(async () => {
        if (contractId == null) return;
        try {
            const res = await axiosGet(`/contract/${contractId}/document-template-mappings`);
            const rows = (res?.data?.data ?? []) as AchDocumentTemplateMappingRow[];
            setLocalAchMappings(
                rows
                    .filter((row) => String(row.documentType || "").toLowerCase() === "ach")
                    .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0)),
            );
        } catch {
            /* keep prior */
        }
    }, [contractId]);

    useEffect(() => {
        if (!isOpen) return;
        // Always re-read ACH mappings from the API on open so added forms
        // are not overwritten by a stale parent prop that still has one row.
        void refreshAchMappingsLocal();
    }, [isOpen, refreshAchMappingsLocal]);

    useEffect(() => {
        if (!isOpen) return;
        const fromProp = Array.isArray(achMappingsProp) ? achMappingsProp : [];
        if (fromProp.length === 0) return;
        setLocalAchMappings((prev) => {
            // Prefer the longer list — stale parent props must not collapse
            // forms the user just added (and that exist in the DB).
            if (prev.length > fromProp.length) return prev;
            return [...fromProp].sort(
                (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
            );
        });
    }, [isOpen, achMappingsProp]);

    const addAchFormInstance = useCallback(async () => {
        if (contractId == null || !achMapping?.template) {
            toast.error("Create or open a contract before adding ACH forms.");
            return;
        }
        const templateRef =
            getBoldSignTemplateMappingRef(achMapping.template) ||
            String(achMapping.template?.layoutKey ?? "").trim();
        if (!templateRef) {
            toast.error("ACH form template is not configured.");
            return;
        }
        if (addingAchForm) return;
        setAddingAchForm(true);
        try {
            await axiosPost(`/contract/${contractId}/document-template-mappings`, {
                documentType: "ach",
                templateRef,
            });
            await refreshAchMappingsLocal();
            onContractDocumentsChanged?.();
            toast.success("ACH form added. Edit its values, then Review & send (one envelope).");
        } catch (error: unknown) {
            toast.error((error as { message?: string })?.message || "Failed to add ACH form.");
        } finally {
            setAddingAchForm(false);
        }
    }, [
        achMapping?.template,
        addingAchForm,
        contractId,
        onContractDocumentsChanged,
        refreshAchMappingsLocal,
    ]);

    const removeAchFormInstance = useCallback(
        async (mappingId: string) => {
            if (contractId == null) return;
            const id = String(mappingId || "").trim();
            if (!id) return;
            if (sortedAchMappings.length <= 1) {
                toast.info("Keep at least one ACH form.");
                return;
            }
            let alreadyRemoving = false;
            setRemovingAchMappingIds((prev) => {
                if (prev.has(id)) {
                    alreadyRemoving = true;
                    return prev;
                }
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            if (alreadyRemoving) return;
            try {
                await axiosDelete(`/contract/${contractId}/document-template-mappings/${id}`);
                const nextPrefillBlob = { ...documentTemplatePrefillByMappingId };
                if (Object.prototype.hasOwnProperty.call(nextPrefillBlob, id)) {
                    delete nextPrefillBlob[id];
                    const existingOverrides =
                        resolvedContract?.contractPrefillOverrides &&
                        typeof resolvedContract.contractPrefillOverrides === "object" &&
                        !Array.isArray(resolvedContract.contractPrefillOverrides)
                            ? {
                                  ...(resolvedContract.contractPrefillOverrides as Record<
                                      string,
                                      unknown
                                  >),
                              }
                            : {};
                    const contractPrefillOverrides = {
                        ...existingOverrides,
                        [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: nextPrefillBlob,
                    };
                    await dispatch(
                        updateContract({
                            id: contractId,
                            data: { contractPrefillOverrides },
                        }),
                    ).unwrap();
                    setResolvedContract((prev) =>
                        prev ? { ...prev, contractPrefillOverrides } : prev,
                    );
                }
                if (prefillEditMappingId === id) {
                    setPrefillEditOpen(false);
                    setPrefillEditMappingId(null);
                }
                await refreshAchMappingsLocal();
                onContractDocumentsChanged?.();
                toast.success("ACH form removed.");
            } catch (error: unknown) {
                toast.error(
                    (error as { message?: string })?.message || "Failed to remove ACH form.",
                );
            } finally {
                setRemovingAchMappingIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            }
        },
        [
            contractId,
            dispatch,
            documentTemplatePrefillByMappingId,
            onContractDocumentsChanged,
            prefillEditMappingId,
            refreshAchMappingsLocal,
            resolvedContract,
            sortedAchMappings.length,
        ],
    );

    const selectableAchRecords = useMemo(() => {
        return (achRecordOptions ?? [])
            .map((row, index) => {
                const id = String(row.id ?? "").trim();
                if (!id) return null;
                return {
                    id,
                    label: formatAchRecordOptionLabel(row, index),
                };
            })
            .filter(Boolean) as Array<{ id: string; label: string }>;
    }, [achRecordOptions]);

    const showAchRecordSelector = selectableAchRecords.length > 1;

    const effectiveSelectedAchRecordId = useMemo(() => {
        if (!selectableAchRecords.length) return "";
        if (
            selectedAchRecordId &&
            selectableAchRecords.some((r) => r.id === selectedAchRecordId)
        ) {
            return selectedAchRecordId;
        }
        return selectableAchRecords[0].id;
    }, [selectableAchRecords, selectedAchRecordId]);

    const refreshContractRow = useCallback(
        async (options?: { notifyParent?: boolean }) => {
            if (!applicationId && contractId == null) return null;
            try {
                let row: unknown = null;
                if (applicationId) {
                    const res = await dispatch(
                        getByApplicationIdContract(String(applicationId)),
                    ).unwrap();
                    row = (res as { data?: unknown })?.data ?? res;
                }
                if (row && typeof row === "object") {
                    setResolvedContract(row as Record<string, unknown>);
                }
                // Polls must not notify the parent — that re-fetched the same contract in a loop.
                if (options?.notifyParent) {
                    onContractDocumentsChanged?.();
                }
                return row as Record<string, unknown> | null;
            } catch {
                return null;
            }
        },
        [applicationId, contractId, dispatch, onContractDocumentsChanged],
    );

    const resolveCcForSend = useCallback((): string[] => {
        const draft = ccEmailDraft.trim();
        let userCc = [...ccEmails];
        if (draft && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft)) {
            const dup = userCc.some((e) => e.toLowerCase() === draft.toLowerCase());
            if (!dup) {
                userCc = [...userCc, draft];
            }
        }
        return mergeWithDefaultCcEmails(userCc, contractCcMergeOptions);
    }, [ccEmailDraft, ccEmails, contractCcMergeOptions]);

    const buildAchSignerRoles = useCallback((): DocuSignTemplateRolePayload[] => {
        const role = String(achSigner.role || "Receiver").trim() || "Receiver";
        const email = String(achSigner.email || "").trim();
        const name = String(achSigner.name || "").trim();
        if (!email) return [];
        const owner2Email = String(achSecondSigner.email || "").trim();
        return buildDocuSignRolesFromEditorRows([
            { role, name, email },
            ...(owner2Email
                ? [
                      {
                          role:
                              String(achSecondSigner.role || "Owner 2").trim() || "Owner 2",
                          name: String(achSecondSigner.name || "").trim(),
                          email: owner2Email,
                      },
                  ]
                : []),
        ]);
    }, [achSigner, achSecondSigner]);

    useEffect(() => {
        if (!isOpen) {
            setShowAchSignerEditor(false);
            return;
        }
        const loaded = loadBoldSignCcEmailList(contractCcMergeOptions);
        setCcEmails(loaded);
        // Drop stale funder defaults (e.g. EJM CC left over after switching to Woodmere).
        saveBoldSignCcEmailList(loaded, contractCcMergeOptions);
        setCcEmailDraft("");

        const overrides = parseContractSignerOverridesFromPrefill(
            (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides,
        );
        const primary = overrides?.[0];
        const secondary = overrides?.[1];
        if (primary?.email?.trim()) {
            setAchSigner({
                role: primary.role?.trim() || "Receiver",
                name: primary.name?.trim() || "",
                email: primary.email.trim(),
            });
        } else {
            setAchSigner({
                role: "Receiver",
                name: getSignerName().trim(),
                email: getSignerEmail().trim(),
            });
        }
        setAchSecondSigner({
            role: secondary?.role?.trim() || "Owner 2",
            name: secondary?.name?.trim() || "",
            email: secondary?.email?.trim() || "",
        });
    }, [isOpen, resolvedContract, getSignerName, getSignerEmail, contractCcMergeOptions]);

    // Fetch tenant contract CC defaults for this book (platform + funder-resolved).
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        const funderName = String(selectedFunder || selectedFunderProfile?.name || "").trim();
        const funderProfileId = String(
            persistedFunderProfileIdForApi(selectedFunderProfile) || selectedFunderProfileId || "",
        ).trim();
        const fetchKey = selectedCcFunderKey;
        const state = String(contractStateForFunders || "").trim();
        const contractIdParam =
            contractId != null && Number.isFinite(Number(contractId)) && Number(contractId) > 0
                ? Number(contractId)
                : null;

        void (async () => {
            try {
                const data = await fetchContractCcDefaults({
                    funderName: funderName || null,
                    state: state || null,
                    funderProfileId: funderProfileId || null,
                    contractId: contractIdParam,
                });
                if (cancelled) return;
                setTenantDefaultContractCcEmail(data.defaultCcEmail);
                setTenantContractCcDefaults(data);
                setTenantCcDefaultsFunderKey(fetchKey);
            } catch {
                if (cancelled) return;
                setTenantDefaultContractCcEmail(null);
                setTenantContractCcDefaults(null);
                setTenantCcDefaultsFunderKey("");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [
        isOpen,
        selectedFunder,
        selectedFunderProfile,
        selectedFunderProfileId,
        selectedCcFunderKey,
        contractStateForFunders,
        contractId,
    ]);

    const syncAchEnvelopeStatus = useCallback(
        async (silent = false, options?: { force?: boolean; crmOnly?: boolean }) => {
            if (!achEnvelopeId) return;
            const mappingKey =
                String(achMapping?.id ?? "").trim() || ACH_PREFILL_MAPPING_ALIAS_KEY;
            if (isAchEnvelopeSigningFinished(achStatus) || isAchEnvelopeSigningFinished(achDisplayStatus)) {
                return;
            }

            const now = Date.now();
            const webhookStale = shouldFallbackPollDocuSign({
                force: options?.force === true,
                signingFinished:
                    isAchEnvelopeSigningFinished(achStatus) ||
                    isAchEnvelopeSigningFinished(achDisplayStatus),
                lastCrmStatusAtMs: lastAchCrmStatusChangeAtRef.current || now,
                staleMs: DOCUSIGN_WEBHOOK_STALE_MS,
            });
            // Webhook-first: CRM refetch without DocuSign unless forced or Connect looks stale.
            if (options?.crmOnly || (!options?.force && !webhookStale)) {
                if (!options?.force && now - lastAchStatusSyncAtRef.current < ACH_STATUS_POLL_MS) {
                    return;
                }
                lastAchStatusSyncAtRef.current = now;
                if (!silent) setStatusRefreshing(true);
                try {
                    await refreshContractRow();
                    setLastStatusSyncAt(new Date());
                } finally {
                    if (!silent) setStatusRefreshing(false);
                }
                return;
            }

            if (!options?.force && now - lastAchStatusSyncAtRef.current < ACH_STATUS_POLL_MS) {
                return;
            }
            lastAchStatusSyncAtRef.current = now;

            if (!silent) setStatusRefreshing(true);
            try {
                const shouldPassCc =
                    !achCcEmailDeliveredRef.current &&
                    !isAchEnvelopePastCcSendStep(achStatus) &&
                    !isAchEnvelopePastCcSendStep(achDisplayStatus);
                const ccForSync = shouldPassCc ? resolveCcForSend() : [];
                const syncRes = await axiosPost("/docusign/sync-envelope-status", {
                    envelopeId: achEnvelopeId,
                    ...(applicationId ? { applicationId: String(applicationId) } : {}),
                    ...(ccForSync.length ? { ccEmails: ccForSync } : {}),
                });
                const ccResult = (
                    syncRes.data as
                        | {
                              ccPrefilledEmail?: {
                                  emailed?: string[];
                                  skippedReason?: string;
                                  delivery?: string;
                              };
                          }
                        | undefined
                )?.ccPrefilledEmail;
                if (
                    ccResult?.emailed?.length ||
                    ccResult?.skippedReason === "already_emailed" ||
                    ccResult?.skippedReason === "already_sent_in_crm" ||
                    ccResult?.delivery === "docusign_carbon_copy" ||
                    ccResult?.skippedReason === "docusign_carbon_copy"
                ) {
                    achCcEmailDeliveredRef.current = true;
                }
                const syncedStatus = String(
                    (syncRes.data as { internalStatus?: string } | undefined)?.internalStatus ??
                        "",
                ).trim();
                if (syncedStatus) {
                    if (isAchEnvelopePastCcSendStep(syncedStatus)) {
                        achCcEmailDeliveredRef.current = true;
                    }
                    await persistAchEnvelopeOnContract(
                        mappingKey,
                        achEnvelopeId,
                        syncedStatus,
                    );
                    if (
                        isAchEnvelopeSigningFinished(syncedStatus) ||
                        isAchEnvelopePastCcSendStep(syncedStatus)
                    ) {
                        setPdfPaneTab("docusign");
                    }
                } else {
                    await refreshContractRow();
                }
                lastAchCrmStatusChangeAtRef.current = Date.now();
                setLastStatusSyncAt(new Date());
            } catch (err: unknown) {
                lastAchCrmStatusChangeAtRef.current = Date.now();
                if (!silent) {
                    const msg =
                        (err as { response?: { data?: { message?: string } } })?.response?.data
                            ?.message || "Could not refresh ACH signing status.";
                    toast.error(String(msg));
                }
            } finally {
                if (!silent) setStatusRefreshing(false);
            }
        },
        [
            achEnvelopeId,
            achMapping?.id,
            achStatus,
            achDisplayStatus,
            applicationId,
            persistAchEnvelopeOnContract,
            refreshContractRow,
            resolveCcForSend,
        ],
    );

    const revokeTemplatePdfUrl = useCallback(() => {
        templatePdfLoadGenRef.current += 1;
        if (templateBlobUrlRef.current) {
            URL.revokeObjectURL(templateBlobUrlRef.current);
            templateBlobUrlRef.current = null;
        }
        setTemplatePdfUrl(null);
    }, []);

    /** Platform/funder ACH PDF via DocuSign layout download (Woodmere or funder-uploaded). */
    const loadTemplatePdf = useCallback(async () => {
        const funderName = String(
            selectedFunder || selectedFunderProfile?.name || "",
        ).trim();
        const funderProfileId =
            persistedFunderProfileIdForApi(selectedFunderProfile) ||
            String(selectedFunderProfileId || "").trim() ||
            null;
        const layoutKey = resolveAchDocumentRefForSelectedFunder(
            selectedFunderProfile,
            boldSignTemplates,
        );
        const loadGen = ++templatePdfLoadGenRef.current;
        setTemplatePdfLoading(true);
        try {
            const response = await axiosGet(
                `/docusign/template/${encodeURIComponent(layoutKey)}/download`,
                {
                    responseType: "blob",
                    params: {
                        ...(funderProfileId ? { funderProfileId } : {}),
                        ...(funderName ? { funderName } : {}),
                        ...(contractStateForFunders
                            ? { state: contractStateForFunders }
                            : {}),
                    },
                },
            );
            if (loadGen !== templatePdfLoadGenRef.current) return;
            const blob =
                response?.data instanceof Blob
                    ? response.data
                    : new Blob([response?.data], { type: "application/pdf" });
            if (!blob.size) {
                toast.error("ACH template PDF is empty.");
                revokeTemplatePdfUrl();
                return;
            }
            if (templateBlobUrlRef.current) {
                URL.revokeObjectURL(templateBlobUrlRef.current);
            }
            const url = URL.createObjectURL(blob);
            templateBlobUrlRef.current = url;
            setTemplatePdfUrl(url);
        } catch (err: unknown) {
            if (loadGen !== templatePdfLoadGenRef.current) return;
            const msg =
                (err as { response?: { data?: { message?: string } }; message?: string })
                    ?.response?.data?.message ||
                (err as { message?: string })?.message ||
                "Failed to load ACH template PDF.";
            toast.error(String(msg));
            revokeTemplatePdfUrl();
        } finally {
            if (loadGen === templatePdfLoadGenRef.current) {
                setTemplatePdfLoading(false);
            }
        }
    }, [
        selectedFunder,
        selectedFunderProfile,
        selectedFunderProfileId,
        boldSignTemplates,
        contractStateForFunders,
        revokeTemplatePdfUrl,
    ]);

    const achDownloadFunderName = useMemo(() => {
        const fromHistory = [...achSendHistory]
            .reverse()
            .map((h) => String(h.funderName ?? "").trim())
            .find(Boolean);
        if (fromHistory) return fromHistory;
        const lastSent = parseLastAchSentFunder(
            (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides,
        );
        const fromLastSent = String(lastSent?.funderName ?? "").trim();
        if (fromLastSent) return fromLastSent;
        return String(selectedFunder || selectedFunderProfile?.name || "").trim();
    }, [
        achSendHistory,
        resolvedContract,
        selectedFunder,
        selectedFunderProfile?.name,
    ]);

    const loadDocuSignPdf = useCallback(async () => {
        if (!achPdfEnvelopeId) {
            setDocuSignPdfUrl(null);
            setDocuSignPdfHint("Send the ACH form via DocuSign to preview the filled envelope.");
            return;
        }
        setDocuSignPdfLoading(true);
        setDocuSignPdfHint(null);
        try {
            const res = await axiosGet(
                `/docusign/download/${encodeURIComponent(achPdfEnvelopeId)}`,
                {
                    responseType: "blob",
                    timeout: 120000,
                    params: {
                        ...(applicationId ? { applicationId: String(applicationId) } : {}),
                        ...(contractId != null ? { contractId } : {}),
                        ...(achDownloadFunderName
                            ? { funderName: achDownloadFunderName }
                            : {}),
                    },
                },
            );
            const blob = res.data instanceof Blob ? res.data : new Blob([res.data]);
            if (!blob.size) {
                setDocuSignPdfHint("DocuSign returned an empty PDF. Try again shortly.");
                return;
            }
            if (docuSignBlobUrlRef.current) {
                URL.revokeObjectURL(docuSignBlobUrlRef.current);
            }
            const url = URL.createObjectURL(blob);
            docuSignBlobUrlRef.current = url;
            setDocuSignPdfUrl(url);
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } }; message?: string })?.response
                    ?.data?.message ||
                (err as { message?: string })?.message ||
                "Could not load ACH PDF from DocuSign.";
            setDocuSignPdfHint(String(msg));
            setDocuSignPdfUrl(null);
        } finally {
            setDocuSignPdfLoading(false);
        }
    }, [achPdfEnvelopeId, applicationId, contractId, achDownloadFunderName]);

    const syncAchPrefillToDraftEnvelope = useCallback(async (
        overrideTabValues?: Record<string, string> | null,
    ): Promise<
        true | false | "skipped_no_envelope" | "skipped_not_draft" | "skipped_multi_form" | "skipped_frozen"
    > => {
        if (achCrmPrefillFrozenForSenderViewRef.current) return "skipped_frozen";
        const envelopeId = String(achEnvelopeId || "").trim();
        if (!envelopeId || !achMapping?.id) return "skipped_no_envelope";
        // Patching tabs by field id cannot target one of several ACH forms — the
        // envelope has to be rebuilt so each form keeps its own values.
        if (sortedAchMappings.length > 1) return "skipped_multi_form";

        const statusNorm = String(achStatus || "").trim().toLowerCase();
        const draftLike =
            isAchEnvelopeDraftLikeStatus(achStatus) ||
            ACH_DRAFT_STATUSES.has(statusNorm) ||
            statusNorm === "created";
        if (!draftLike || isAchEnvelopeSigningFinished(achStatus)) {
            return "skipped_not_draft";
        }

        // Prefer the exact values just saved in the edit modal — do not re-merge
        // stale contract defaults that can wipe user edits before the tab PUT.
        let fields: Array<{ id: string; value: string }> = [];
        if (overrideTabValues && Object.keys(overrideTabValues).length > 0) {
            fields = Object.entries(overrideTabValues)
                .map(([id, value]) => ({
                    id: String(id || "").trim(),
                    value: String(value ?? "").trim(),
                }))
                .filter((f) => f.id && f.value);
        } else {
            const saved = resolveAchSavedMappingOverrides(
                documentTemplatePrefillByMappingId,
                achMapping.id,
                { allowAliasFallback: sortedAchMappings.length <= 1 },
            );
            const rows = getDocumentTemplatePrefillFieldRowsForEditor({
                templateId: achMapping.template?.templateId ?? achMapping.templateId ?? null,
                templateName: achMapping.template?.name ?? null,
                templateType: achMapping.template?.type ?? achMapping.documentType ?? null,
                templateLayoutKey: achMapping.template?.layoutKey ?? null,
                templateState: achMapping.template?.state ?? null,
                templateFrequency: achMapping.template?.frequency ?? null,
                documentType: achMapping.documentType ?? null,
                contract: resolvedContract,
                application: applicationData as Record<string, unknown> | null,
                contractRecords: contractPrefillRecords,
                bankDetail: contractPrefillRecords?.bankDetail ?? null,
                agreementDate: new Date().toLocaleDateString("en-US"),
                mainPrefillOverrides: mainPrefillOverridesForDialog ?? undefined,
                savedOverridesForMapping: saved,
            });
            fields = rows
                .map((f) => ({ id: f.id, value: String(f.value ?? "").trim() }))
                .filter((f) => f.id && f.value);
        }
        if (!fields.length) return false;

        // Envelope tabs are CRM-scoped (`ach_form_*` / `ach_form_texas_*`); send both forms.
        const achDocRef = resolveAchDocumentRefForSelectedFunder(
            selectedFunderProfile,
            boldSignTemplates,
        ).toLowerCase();
        const achPrefix =
            achDocRef.includes("texas") || achCoordinateLayout === "texas"
                ? "ach_form_texas_"
                : "ach_form_";
        const expandedFields: Array<{ id: string; value: string }> = [];
        const seen = new Set<string>();
        for (const f of fields) {
            for (const id of [f.id, f.id.startsWith("ach_form_") ? f.id : `${achPrefix}${f.id}`]) {
                if (seen.has(id)) continue;
                seen.add(id);
                expandedFields.push({ id, value: f.value });
            }
        }

        const payloadKey = JSON.stringify({
            envelopeId,
            fields: [...expandedFields].sort((a, b) => a.id.localeCompare(b.id)),
        });
        if (lastAchPrefillSyncKeyRef.current === payloadKey) return true;
        const inFlight = achPrefillSyncInFlightRef.current.get(payloadKey);
        if (inFlight) return inFlight;

        const request = (async (): Promise<boolean> => {
            try {
                await axiosPatch("/docusign/prefill-fields", {
                    documentId: envelopeId,
                    fields: expandedFields,
                });
                lastAchPrefillSyncKeyRef.current = payloadKey;
                if (pdfPaneTab === "docusign") {
                    void loadDocuSignPdf();
                }
                return true;
            } catch (err) {
                console.warn("[DocuSign] ACH prefill sync to draft envelope failed:", err);
                return false;
            }
        })();
        achPrefillSyncInFlightRef.current.set(payloadKey, request);
        try {
            return await request;
        } finally {
            if (achPrefillSyncInFlightRef.current.get(payloadKey) === request) {
                achPrefillSyncInFlightRef.current.delete(payloadKey);
            }
        }
    }, [
        achEnvelopeId,
        achMapping,
        achStatus,
        achCoordinateLayout,
        selectedFunderProfile,
        boldSignTemplates,
        documentTemplatePrefillByMappingId,
        resolvedContract,
        applicationData,
        contractPrefillRecords,
        mainPrefillOverridesForDialog,
        sortedAchMappings,
        pdfPaneTab,
        loadDocuSignPdf,
    ]);
    const syncAchPrefillToDraftEnvelopeRef = useRef(syncAchPrefillToDraftEnvelope);

    useEffect(() => {
        syncAchPrefillToDraftEnvelopeRef.current = syncAchPrefillToDraftEnvelope;
    }, [syncAchPrefillToDraftEnvelope]);

    const refreshAchSigningPreview = useCallback(
        async (silent = false) => {
            const finished =
                isAchEnvelopeSigningFinished(achStatus) ||
                isAchEnvelopeSigningFinished(achDisplayStatus);
            if (!finished && achEnvelopeId) {
                await syncAchEnvelopeStatus(silent, { force: true });
            }
            await loadDocuSignPdf();
        },
        [achEnvelopeId, achStatus, achDisplayStatus, syncAchEnvelopeStatus, loadDocuSignPdf],
    );

    useEffect(() => {
        if (!isOpen) return;
        setResolvedContract(contract);
    }, [isOpen, contract]);

    // Overview / Scrubbing → keep open ACH modal + draft envelope tabs in sync.
    useEffect(() => {
        if (!isOpen || !applicationId) return;
        const onContractPrefillUpdated = (event: Event) => {
            const detail = (
                event as CustomEvent<{ applicationUuid?: string; contract?: unknown }>
            ).detail;
            if (
                !contractPrefillUpdateMatchesApplication(
                    detail?.applicationUuid,
                    String(applicationId),
                )
            ) {
                return;
            }
            if (detail?.contract && typeof detail.contract === "object") {
                setResolvedContract(detail.contract as Record<string, unknown>);
            } else {
                void refreshContractRow();
            }
            void dispatch(getApplicationById(String(applicationId)));
            void dispatch(getBankDetails({ application: String(applicationId) }));
            if (contractId != null) {
                void dispatch(getAllACH({ contractId }));
            }
            lastAchPrefillSyncKeyRef.current = null;
            queueMicrotask(() => {
                void syncAchPrefillToDraftEnvelopeRef.current();
            });
        };
        window.addEventListener(CONTRACT_PREFILL_UPDATED_EVENT, onContractPrefillUpdated);
        return () => {
            window.removeEventListener(
                CONTRACT_PREFILL_UPDATED_EVENT,
                onContractPrefillUpdated,
            );
        };
    }, [isOpen, applicationId, contractId, dispatch, refreshContractRow]);

    useEffect(() => {
        if (!isOpen) return;
        // Wait until ACH funder defaulting finishes so we never flash the Woodmere
        // platform PDF and then overwrite it with the selected funder's form.
        if (achCapableFunderEntries.length > 0 && !selectedFunderProfileId) {
            return;
        }
        void loadTemplatePdf();
    }, [
        isOpen,
        loadTemplatePdf,
        achCapableFunderEntries.length,
        selectedFunderProfileId,
    ]);

    /**
     * Push platform values once when an ACH draft/record is opened. Keep the latest sync
     * callback in a ref so unrelated callback dependency changes cannot retrigger DocuSign.
     * Explicit saves still call syncAchPrefillToDraftEnvelope directly.
     */
    useEffect(() => {
        if (!isOpen) {
            automaticAchPrefillTriggerRef.current = null;
            achCrmPrefillFrozenForSenderViewRef.current = false;
            return;
        }
        const envelopeId = String(achEnvelopeId || "").trim();
        const recordId = String(effectiveSelectedAchRecordId || "").trim();
        if (!envelopeId || !recordId) return;
        if (achCrmPrefillFrozenForSenderViewRef.current) return;

        const triggerKey = `${envelopeId}::${recordId}`;
        if (automaticAchPrefillTriggerRef.current === triggerKey) return;
        automaticAchPrefillTriggerRef.current = triggerKey;
        void syncAchPrefillToDraftEnvelopeRef.current();
    }, [isOpen, effectiveSelectedAchRecordId, achEnvelopeId]);

    useEffect(() => {
        if (!isOpen) return;
        if (canPreviewDocuSignPdf) {
            setPdfPaneTab("docusign");
        } else {
            setPdfPaneTab("template");
        }
    }, [isOpen, canPreviewDocuSignPdf]);

    useEffect(() => {
        if (!isOpen || pdfPaneTab !== "docusign") return;
        void loadDocuSignPdf();
    }, [isOpen, pdfPaneTab, loadDocuSignPdf, achPdfEnvelopeId, achDisplayStatus, achStatus]);

    useEffect(() => {
        if (!isOpen) {
            achCcEmailDeliveredRef.current = false;
            lastAchStatusSyncAtRef.current = 0;
            return;
        }
        if (isAchEnvelopePastCcSendStep(achStatus) || isAchEnvelopePastCcSendStep(achDisplayStatus)) {
            achCcEmailDeliveredRef.current = true;
        }
    }, [isOpen, achStatus, achDisplayStatus]);

    useEffect(() => {
        lastAchCrmStatusChangeAtRef.current = Date.now();
    }, [achStatus]);

    const syncAchEnvelopeStatusRef = useRef(syncAchEnvelopeStatus);
    syncAchEnvelopeStatusRef.current = syncAchEnvelopeStatus;

    const achSigningFinishedForPoll =
        isAchEnvelopeSigningFinished(achStatus) ||
        isAchEnvelopeSigningFinished(achDisplayStatus);

    useEffect(() => {
        if (!isOpen || !achEnvelopeId || achSigningFinishedForPoll) return;
        void syncAchEnvelopeStatusRef.current(true, { crmOnly: true });
        const id = window.setInterval(() => {
            // CRM refresh every tick; DocuSign API only when Connect looks stale.
            void syncAchEnvelopeStatusRef.current(true);
        }, ACH_STATUS_POLL_MS);
        return () => window.clearInterval(id);
    }, [isOpen, achEnvelopeId, achSigningFinishedForPoll]);

    useContractSigningStatusRealtime(applicationId, () => {
        lastAchCrmStatusChangeAtRef.current = Date.now();
        void refreshContractRow();
    });

    useEffect(() => {
        return () => {
            if (templateBlobUrlRef.current) {
                URL.revokeObjectURL(templateBlobUrlRef.current);
                templateBlobUrlRef.current = null;
            }
            if (docuSignBlobUrlRef.current) {
                URL.revokeObjectURL(docuSignBlobUrlRef.current);
                docuSignBlobUrlRef.current = null;
            }
        };
    }, []);

    const canVoidAch = canVoidAchEnvelope(achStatus, achEnvelopeId);
    const canResendAch = canResendAchEnvelope(achStatus, achEnvelopeId);
    const canReviewAndSendAch = canReviewAndSendAchEnvelope(achStatus, achEnvelopeId);
    const achEnvelopeView = getAchEnvelopeView(achStatus, achEnvelopeId);
    const canEditRecipients = !readOnly;
    /** Changes apply to the next ACH envelope and never alter one already out for signature. */
    const canEditAchFunder = !readOnly;

    const handleAchFunderChange = useCallback(
        (profileId: string) => {
            userSelectedFunderRef.current = true;
            const profile = findFunderById(profileId);
            const funderName = profile?.name ?? "";

            revokeTemplatePdfUrl();
            setPdfPaneTab("template");

            applyFunderSelection(profileId, funderName, { persist: true });
            setAchCoordinateLayout(
                resolveAchCoordinateChoiceForFunder(profile, boldSignTemplates),
            );
            setTenantCcDefaultsFunderKey("");

            const nextCcOptions = buildContractCcMergeOptions({
                selectedFunderDefaultCcEmail:
                    String(profile?.defaultCcEmail ?? "").trim() || null,
                selectedFunderKey: contractCcFunderKey(profileId, funderName),
                apiDefaults: null,
                apiFunderKey: "",
                funderDefaultCcValues: funders.map((f) => f.defaultCcEmail),
            });
            const nextCc = loadBoldSignCcEmailList(nextCcOptions);
            setCcEmails(nextCc);
            saveBoldSignCcEmailList(nextCc, nextCcOptions);
            setCcEmailDraft("");

            if (
                achEnvelopeView.hasEnvelope &&
                (achEnvelopeView.isDraft ||
                    achEnvelopeView.isCompleted ||
                    achEnvelopeView.isTerminal)
            ) {
                toast.info(
                    achEnvelopeView.isCompleted || achEnvelopeView.isTerminal
                        ? "Funder changed. Click Resend ACH form (or Send ACH form) to create a new DocuSign envelope with the selected funder."
                        : "Funder changed. Use Resend ACH form to create a new DocuSign draft with the selected funder's PDF.",
                );
            }
        },
        [
            findFunderById,
            revokeTemplatePdfUrl,
            applyFunderSelection,
            funders,
            boldSignTemplates,
            achEnvelopeView.hasEnvelope,
            achEnvelopeView.isDraft,
            achEnvelopeView.isCompleted,
            achEnvelopeView.isTerminal,
        ],
    );

    const addAchCcFromDraft = () => {
        const raw = ccEmailDraft.trim();
        if (!raw) {
            toast.info("Enter an email address to add.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
            toast.error("Enter a valid email address.");
            return;
        }
        if (
            isReservedContractCcEmail(raw, contractCcMergeOptions) ||
            ccEmails.some((e) => e.toLowerCase() === raw.toLowerCase())
        ) {
            toast.info("That address is already in the CC list.");
            return;
        }
        const next = [...ccEmails, raw];
        setCcEmails(next);
        saveBoldSignCcEmailList(next, contractCcMergeOptions);
        setCcEmailDraft("");
    };

    const emptySecondSigner = (): ContractSignerOverrideRow => ({
        role: "Owner 2",
        name: "",
        email: "",
    });

    const openAchSignerEditor = () => {
        if (showAchSignerEditor) {
            setShowAchSignerEditor(false);
            return;
        }
        setSignerDraft({ ...achSigner });
        setSecondSignerDraft({ ...achSecondSigner });
        setShowAchSignerEditor(true);
    };

    const saveAchSigner = async () => {
        const role = String(signerDraft.role || "Receiver").trim() || "Receiver";
        const email = String(signerDraft.email || "").trim();
        const name = String(signerDraft.name || "").trim();
        if (!email) {
            toast.error("Signer email is required.");
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            toast.error("Enter a valid signer email address.");
            return;
        }
        const row: ContractSignerOverrideRow = { role, name, email };
        const secondEmail = String(secondSignerDraft.email || "").trim();
        const secondRow: ContractSignerOverrideRow = secondEmail
            ? {
                  role: String(secondSignerDraft.role || "Owner 2").trim() || "Owner 2",
                  name: String(secondSignerDraft.name || "").trim(),
                  email: secondEmail,
              }
            : emptySecondSigner();
        if (secondEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(secondEmail)) {
            toast.error("Enter a valid second signer email address.");
            return;
        }
        // Only persist Signer 1 when Signer 2 email is empty — drops Owner 2 from overrides.
        const signerRows = [row, ...(secondEmail ? [secondRow] : [])];
        const roles = buildDocuSignRolesFromEditorRows(signerRows);
        const validation = validateDocuSignSignerRoles(roles);
        if (!validation.valid) {
            toast.error(validation.message || "Invalid signer details.");
            return;
        }

        setSavingSigner(true);
        try {
            setAchSigner(row);
            setAchSecondSigner(secondRow);
            if (contractId != null) {
                const prefillBase =
                    (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                        ?.contractPrefillOverrides ?? null;
                const contractPrefillOverrides = mergeContractPrefillWithSignerOverrides(
                    prefillBase,
                    signerRows,
                );
                const updated = await dispatch(
                    updateContract({
                        id: contractId,
                        data: {
                            contractPrefillOverrides,
                            clientEmail: email,
                            ...(name ? { clientName: name } : {}),
                        },
                    }),
                ).unwrap();
                const payload = (updated as { data?: unknown })?.data ?? updated;
                if (payload && typeof payload === "object") {
                    setResolvedContract((prev) =>
                        prev && typeof prev === "object"
                            ? { ...prev, ...(payload as Record<string, unknown>), contractPrefillOverrides }
                            : (payload as Record<string, unknown>),
                    );
                }
                await refreshContractRow({ notifyParent: true });
            }
            setShowAchSignerEditor(false);
            toast.success(
                !secondEmail
                    ? "Signer 2 removed. Only Signer 1 will be used on the next ACH send."
                    : achEnvelopeView.hasEnvelope && !achEnvelopeView.isOutForSignature
                      ? "Signer saved. Click Review & send again to open DocuSign with the updated signer."
                      : "Signer saved. It will be used when you review and send the ACH form.",
            );
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message || "Failed to save signer.";
            toast.error(String(msg));
        } finally {
            setSavingSigner(false);
        }
    };

    /** Remove Signer 2 and persist overrides with Signer 1 only. */
    const removeAchSecondSigner = async () => {
        if (!canEditRecipients || savingSigner) return;
        setSecondSignerDraft(emptySecondSigner());
        const role = String(achSigner.role || "Receiver").trim() || "Receiver";
        const email = String(achSigner.email || "").trim();
        const name = String(achSigner.name || "").trim();
        if (!email) {
            setAchSecondSigner(emptySecondSigner());
            toast.info("Signer 2 cleared.");
            return;
        }
        const row: ContractSignerOverrideRow = { role, name, email };
        setSavingSigner(true);
        try {
            setAchSigner(row);
            setAchSecondSigner(emptySecondSigner());
            if (contractId != null) {
                const prefillBase =
                    (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                        ?.contractPrefillOverrides ?? null;
                const contractPrefillOverrides = mergeContractPrefillWithSignerOverrides(
                    prefillBase,
                    [row],
                );
                const updated = await dispatch(
                    updateContract({
                        id: contractId,
                        data: { contractPrefillOverrides },
                    }),
                ).unwrap();
                const payload = (updated as { data?: unknown })?.data ?? updated;
                if (payload && typeof payload === "object") {
                    setResolvedContract((prev) =>
                        prev && typeof prev === "object"
                            ? {
                                  ...prev,
                                  ...(payload as Record<string, unknown>),
                                  contractPrefillOverrides,
                              }
                            : (payload as Record<string, unknown>),
                    );
                }
                await refreshContractRow({ notifyParent: true });
            }
            setShowAchSignerEditor(false);
            toast.success(
                "Signer 2 removed. Only Signer 1 will be on the next ACH envelope.",
            );
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message || "Failed to remove Signer 2.";
            toast.error(String(msg));
        } finally {
            setSavingSigner(false);
        }
    };

    const handleVoidAch = async () => {
        if (readOnly || !achEnvelopeId || !achMapping?.id) return;
        const confirmed = window.confirm(
            "Void this ACH form in DocuSign? Signers will no longer be able to sign. You can send a new ACH form afterward.",
        );
        if (!confirmed) return;

        setIsVoidingAch(true);
        try {
            await dispatch(
                voidBoldSignDocument({
                    documentId: achEnvelopeId,
                    reason: "Cancelled by user from CRM",
                    ...(applicationId ? { applicationId: String(applicationId) } : {}),
                    ...(contractId != null ? { contractId } : {}),
                    funderName: String(selectedFunder || selectedFunderProfile?.name || "").trim(),
                    funderProfileId: persistedFunderProfileIdForApi(selectedFunderProfile),
                }),
            ).unwrap();
            await persistAchEnvelopeOnContract(achMapping.id, achEnvelopeId, "revoked");
            if (docuSignBlobUrlRef.current) {
                URL.revokeObjectURL(docuSignBlobUrlRef.current);
                docuSignBlobUrlRef.current = null;
            }
            setDocuSignPdfUrl(null);
            setDocuSignPdfHint(null);
            setPdfPaneTab("template");
            achCrmPrefillFrozenForSenderViewRef.current = false;
            automaticAchPrefillTriggerRef.current = null;
            await refreshContractRow({ notifyParent: true });
            toast.success(
                "ACH form voided in DocuSign. Use Review & send when you are ready to send again.",
            );
        } catch (error: unknown) {
            const msg =
                (error as { message?: string })?.message || "Failed to void ACH form in DocuSign.";
            toast.error(String(msg));
        } finally {
            setIsVoidingAch(false);
        }
    };

    const handleReviewAndSend = async (sendOptions?: { forceNewEnvelope?: boolean }) => {
        if (readOnly || !onPrepareDocuSignDraft || !achMapping) return;
        const forceNewEnvelope = sendOptions?.forceNewEnvelope === true;
        if (!canReviewAndSendAch) {
            toast.info("This ACH form cannot be sent in its current state.");
            return;
        }
        const hasAchTemplate =
            Boolean(getBoldSignTemplateMappingRef(achMapping.template)) ||
            Boolean(String(achMapping.template?.layoutKey ?? "").trim()) ||
            Boolean(selectedFunderProfile);
        if (!hasAchTemplate) {
            toast.info("ACH form template is not configured.");
            return;
        }
        if (canResendAch) {
            toast.info(
                achEnvelopeView.isOutForSignature
                    ? "Creating another ACH envelope. The previous form will remain active."
                    : "Creating a new DocuSign envelope to resend the ACH form.",
            );
        }

        let docuSignTab: Window | null = null;
        try {
            docuSignTab = window.open("about:blank", "_blank");
            if (docuSignTab) {
                try {
                    writeDocuSignLoadingTab(docuSignTab.document);
                } catch {
                    /* ignore */
                }
            }
            flushSync(() => setIsSendingAch(true));
            // Allow this Review & send to rebuild from CRM; freeze again after sender opens.
            achCrmPrefillFrozenForSenderViewRef.current = false;
            automaticAchPrefillTriggerRef.current = null;

            const userCc = [...ccEmails];
            const draft = ccEmailDraft.trim();
            if (draft && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft)) {
                const dup = userCc.some((e) => e.toLowerCase() === draft.toLowerCase());
                if (!dup) userCc.push(draft);
            }
            const toSend = mergeWithDefaultCcEmails(userCc, contractCcMergeOptions);
            saveBoldSignCcEmailList(userCc, contractCcMergeOptions);
            setCcEmails(userCc);
            setCcEmailDraft("");

            const signerRoles = buildAchSignerRoles();
            const signerValidation = validateDocuSignSignerRoles(signerRoles);
            if (!signerValidation.valid) {
                const msg =
                    signerValidation.message ||
                    "Add a signer name and email before sending the ACH form.";
                if (docuSignTab) writeDocuSignErrorTab(docuSignTab.document, msg);
                toast.error(msg);
                return;
            }

            // Persist both ACH signers before envelope create so status/persist
            // updates cannot drop Owner 2 from contractSignerOverrides.
            if (contractId != null) {
                const signerRowsForPrefill = signerRoles.map((r) => ({
                    role: String(r.signerRole || "").trim() || "Receiver",
                    name: String(r.signerName || "").trim(),
                    email: String(r.signerEmail || "").trim(),
                }));
                const prefillBase =
                    (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                        ?.contractPrefillOverrides ?? null;
                const contractPrefillOverrides = mergeContractPrefillWithSignerOverrides(
                    prefillBase,
                    signerRowsForPrefill,
                );
                try {
                    const updated = await dispatch(
                        updateContract({
                            id: contractId,
                            data: { contractPrefillOverrides },
                        }),
                    ).unwrap();
                    const payload = (updated as { data?: unknown })?.data ?? updated;
                    if (payload && typeof payload === "object") {
                        setResolvedContract((prev) =>
                            prev && typeof prev === "object"
                                ? {
                                      ...prev,
                                      ...(payload as Record<string, unknown>),
                                      contractPrefillOverrides,
                                  }
                                : (payload as Record<string, unknown>),
                        );
                    }
                } catch {
                    /* non-blocking — send still uses in-memory signerRoles */
                }
            }

            const funderName = String(selectedFunder || selectedFunderProfile?.name || "").trim();
            if (!funderName && funderSelectOptions.length > 0) {
                const msg = "Select a funder before sending the ACH form.";
                if (docuSignTab) writeDocuSignErrorTab(docuSignTab.document, msg);
                toast.error(msg);
                return;
            }

            // Always resolve from the selected funder — mapping template UUIDs point at
            // whatever ACH row was linked first (usually platform default).
            const achDocumentRef = resolveAchDocumentRefForSelectedFunder(
                selectedFunderProfile,
                boldSignTemplates,
            );
            const prepared = await onPrepareDocuSignDraft({
                ccEmails: toSend,
                achDocumentRef,
                standaloneAchOnly: true,
                addendumDocuments: sortedAchMappings
                    .map((row) => ({
                        mappingId: String(row.id || "").trim(),
                        documentRef: achDocumentRef,
                    }))
                    .filter((item) => item.mappingId && item.documentRef),
                roles: signerRoles,
                funderName: funderName || null,
                funderProfileId: persistedFunderProfileIdForApi(selectedFunderProfile),
                contractState: contractStateForFunders || null,
                title: String(envelopeEmailSubject || "").trim() || defaultEnvelopeEmailSubject,
                documentName:
                    String(envelopeEmailSubject || "").trim() || defaultEnvelopeEmailSubject,
                ...(forceNewEnvelope ? { forceNewEnvelope: true } : {}),
            });
            const envelopeId = String(prepared?.envelopeId ?? "").trim();
            const preparedSenderUrl = String(prepared?.sendUrl ?? "").trim() || null;
            if (!envelopeId) {
                const msg = "Could not create the ACH DocuSign draft.";
                if (docuSignTab) writeDocuSignErrorTab(docuSignTab.document, msg);
                toast.error(msg);
                return;
            }

            const senderViewResult = preparedSenderUrl
                ? { url: preparedSenderUrl, error: null }
                : await fetchDocuSignSenderViewUrlWithRetry(
                      envelopeId,
                      toSend,
                      true,
                      signerRoles,
                  );
            const senderUrl = senderViewResult.url;
            if (!senderUrl) {
                const msg =
                    senderViewResult.error ||
                    "ACH draft was created but DocuSign did not return a review URL yet.";
                if (docuSignTab) writeDocuSignErrorTab(docuSignTab.document, msg);
                toast.error(msg, { autoClose: 12000 });
                return;
            }

            // Open DocuSign immediately — do not block the loading tab on CRM persist.
            setPdfPaneTab("template");
            achCrmPrefillFrozenForSenderViewRef.current = true;

            let opened = false;
            if (docuSignTab) {
                try {
                    docuSignTab.location.href = senderUrl;
                    opened = true;
                } catch {
                    /* fall through */
                }
            }
            if (!opened) {
                opened = tryOpenDocuSignSenderUrl(senderUrl);
            }
            if (!opened) {
                toast.info(
                    "Your browser blocked the DocuSign tab. Allow pop-ups for this site and try again.",
                    { autoClose: 12000 },
                );
            } else {
                toast.success(
                    "ACH opened with the latest CRM values. Edit freely in DocuSign — those edits go to the signer. CRM will not update this open draft.",
                    { autoClose: 14000 },
                );
            }

            void (async () => {
                try {
                    await persistAchEnvelopeOnContract(
                        sortedAchMappings[0]?.id || achMapping.id,
                        envelopeId,
                        "draft",
                        {
                            funderName: funderName || null,
                            funderProfileId: persistedFunderProfileIdForApi(selectedFunderProfile),
                        },
                        forceNewEnvelope ? { keepDraftPriors: true } : undefined,
                    );
                    await refreshContractRow({ notifyParent: true });
                } catch {
                    /* non-blocking — envelope already open */
                }
            })();
            return;
        } catch (error: unknown) {
            const msg =
                typeof error === "string"
                    ? error
                    : (error as Error)?.message || "Failed to prepare ACH form in DocuSign.";
            if (docuSignTab) writeDocuSignErrorTab(docuSignTab.document, msg);
            toast.error(msg);
        } finally {
            setIsSendingAch(false);
        }
    };

    const handleSendAchInNewEnvelope = () => {
        void handleReviewAndSend({ forceNewEnvelope: true });
    };

    if (!isOpen || !achMapping) return null;

    const statusChain = [
        { key: "SENT", label: "Sent", hint: "Envelope sent" },
        { key: "VIEWED", label: "Viewed", hint: "Signer opened" },
        { key: "SIGNED", label: "Signed", hint: "Signature captured" },
        { key: "COMPLETED", label: "Completed", hint: "All done" },
    ];
    const statusRank: Record<string, number> = {
        DRAFT: -1,
        SENT: 0,
        VIEWED: 1,
        SIGNED: 2,
        COMPLETED: 3,
    };
    const normalizedStatus = String(achDisplayStatus).trim().toUpperCase();
    const terminalStatuses = ["DECLINED", "REVOKED", "EXPIRED"];
    const isTerminal = terminalStatuses.includes(normalizedStatus);
    const showDraftOnly =
        isAchEnvelopeDraftLikeStatus(achDisplayStatus) &&
        !isAchEnvelopePastCcSendStep(achDisplayStatus);
    const activeIndex =
        showDraftOnly || isTerminal ? -1 : statusRank[normalizedStatus] ?? -1;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open: boolean) => !open && onClose()}>
                <DialogContent className="flex h-[min(94vh,calc(100dvh-1.5rem))] max-h-[min(94vh,calc(100dvh-1.5rem))] min-h-0 w-[1400px] max-w-[95vw] flex-col gap-0 overflow-hidden bg-white p-0 dark:bg-slate-900 dark:text-slate-100">
                    <div className="flex shrink-0 flex-col border-b bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-900">
                        <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            ACH Authorization — {achTemplateLabel}
                        </DialogTitle>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Preview the ACH form, edit prefilled fields, then review and send in
                            DocuSign. Status updates when DocuSign webhooks are received.
                        </p>
                    </div>

                    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                        <div className="flex min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto border-r border-slate-200 p-4 dark:border-slate-700 lg:w-[42%] lg:min-w-[22rem]">
                            {funderSelectOptions.length > 0 ? (
                                <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                    <label
                                        className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                                        htmlFor="ach-form-funder-select"
                                    >
                                        <Building2
                                            className="h-3.5 w-3.5 text-[var(--brand)]"
                                            aria-hidden
                                        />
                                        ACH funder
                                    </label>
                                    <Select
                                        value={selectedFunderProfileId || undefined}
                                        disabled={!canEditAchFunder}
                                        onValueChange={handleAchFunderChange}
                                    >
                                        <SelectTrigger
                                            id="ach-form-funder-select"
                                            className="h-10 w-full rounded-md border border-[var(--brand)]/20 bg-background px-3 py-2 text-sm shadow-sm focus:ring-[var(--brand)]/25 disabled:opacity-60 dark:border-slate-600"
                                        >
                                            <SelectValue placeholder="Select funder" />
                                        </SelectTrigger>
                                        <SelectContent
                                            position="popper"
                                            className="z-[10100] max-h-72"
                                        >
                                            {funderSelectOptions.map((f) => (
                                                <SelectItem key={f.value} value={f.value}>
                                                    {f.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {selectedFunder ? (
                                        <p className="mt-2 truncate text-[11px] text-slate-500 dark:text-slate-400">
                                            Sending as {selectedFunder}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}

                            {showAchRecordSelector ? (
                                <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                    <div className="mb-2 flex min-w-0 items-start gap-2.5">
                                        <div
                                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                            aria-hidden
                                        >
                                            <Landmark className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <label
                                                htmlFor="ach-form-record-select"
                                                className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]"
                                            >
                                                ACH form
                                            </label>
                                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                Multiple ACH entries found. Defaults to the first
                                                entry or your last selection.
                                            </p>
                                        </div>
                                    </div>
                                    <select
                                        id="ach-form-record-select"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                        value={effectiveSelectedAchRecordId}
                                        disabled={readOnly || !onSelectedAchRecordIdChange}
                                        onChange={(e) => {
                                            const next = String(e.target.value || "").trim();
                                            if (next) onSelectedAchRecordIdChange?.(next);
                                        }}
                                    >
                                        {selectableAchRecords.map((opt) => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : null}

                            <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                <div className="mb-3 flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 items-start gap-2.5">
                                        <div
                                            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                            aria-hidden
                                        >
                                            <Landmark className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                ACH Authorization
                                            </h4>
                                            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                                                {achTemplateLabel}
                                            </p>
                                        </div>
                                    </div>
                                    <span
                                        className={getDocumentSendStatusCapsuleClasses(
                                            achDisplayStatus,
                                        )}
                                    >
                                        {achStatusLabel}
                                    </span>
                                </div>

                                <div className="mb-3 space-y-2">
                                    {(sortedAchMappings.length
                                        ? sortedAchMappings
                                        : achMapping
                                          ? [achMapping]
                                          : []
                                    ).map((row, index) => {
                                        const removing = removingAchMappingIds.has(row.id);
                                        const realMapping = !String(row.id).startsWith(
                                            "ach-template-",
                                        );
                                        return (
                                            <div
                                                key={row.id}
                                                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--brand)]/20 bg-gradient-to-r from-[var(--brand)]/5 to-white px-2.5 py-2.5 dark:border-slate-600 dark:from-[var(--brand)]/10 dark:to-slate-900/80"
                                            >
                                                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[image:var(--brand-gradient)] text-white shadow-sm">
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                                                        ACH form {index + 1}
                                                        {sortedAchMappings.length > 1
                                                            ? ` of ${sortedAchMappings.length}`
                                                            : ""}
                                                    </p>
                                                </div>
                                                {!readOnly ? (
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 shrink-0 text-slate-600 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                                                        title="Edit ACH prefill fields"
                                                        onClick={() => {
                                                            setPrefillEditMappingId(row.id);
                                                            setPrefillEditOpen(true);
                                                        }}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : null}
                                                {!readOnly &&
                                                realMapping &&
                                                sortedAchMappings.length > 1 ? (
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-8 w-8 shrink-0 text-slate-600 hover:bg-red-50 hover:text-red-600"
                                                        title="Remove ACH form"
                                                        disabled={removing}
                                                        onClick={() =>
                                                            void removeAchFormInstance(row.id)
                                                        }
                                                    >
                                                        {removing ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        )}
                                                    </Button>
                                                ) : null}
                                            </div>
                                        );
                                    })}
                                </div>
                                {!readOnly &&
                                sortedAchMappings.some(
                                    (row) => !String(row.id).startsWith("ach-template-"),
                                ) ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="mb-1 h-9 w-full border-dashed"
                                        disabled={addingAchForm || isSendingAch}
                                        onClick={() => void addAchFormInstance()}
                                    >
                                        {addingAchForm ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Adding…
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-2">
                                                <Plus className="h-4 w-4" />
                                                Add another ACH form
                                            </span>
                                        )}
                                    </Button>
                                ) : null}
                            </div>

                            <div className="rounded-2xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                <div className="space-y-3">
                                    <div>
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-bold tracking-tight text-slate-800 dark:text-slate-100">
                                                ACH Signers
                                            </h3>
                                            {!achSigner.email ? (
                                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                                                    Required before send
                                                </span>
                                            ) : null}
                                        </div>
                                        {canEditRecipients ? (
                                            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                Both contract signers can initial the ACH form. Use the pencil to edit.
                                            </p>
                                        ) : null}
                                    </div>

                                    <div
                                        className={cn(
                                            "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                                            showAchSignerEditor
                                                ? "border-[var(--brand)]/40 bg-[var(--brand)]/5 ring-1 ring-[var(--brand)]/20"
                                                : "border-[var(--brand)]/10 bg-[var(--brand)]/5 hover:border-[var(--brand)]/25 dark:border-slate-600 dark:bg-[var(--brand)]/10",
                                            canEditRecipients && "cursor-pointer",
                                        )}
                                        onClick={
                                            canEditRecipients
                                                ? () => openAchSignerEditor()
                                                : undefined
                                        }
                                        onKeyDown={
                                            canEditRecipients
                                                ? (e) => {
                                                      if (e.key === "Enter" || e.key === " ") {
                                                          e.preventDefault();
                                                          openAchSignerEditor();
                                                      }
                                                  }
                                                : undefined
                                        }
                                        role={canEditRecipients ? "button" : undefined}
                                        tabIndex={canEditRecipients ? 0 : undefined}
                                    >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900">
                                            <User className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                {achSigner.role || "Receiver"}
                                            </p>
                                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                {achSigner.name.trim() || "Add signer name"}
                                            </p>
                                            <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                                                {achSigner.email || "Add signer email"}
                                            </p>
                                        </div>
                                        {canEditRecipients ? (
                                            <button
                                                type="button"
                                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/5 hover:text-[var(--brand)] dark:border-slate-600 dark:bg-slate-900"
                                                title={showAchSignerEditor ? "Close editor" : "Edit signer"}
                                                aria-label={showAchSignerEditor ? "Close signer editor" : "Edit signer"}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    openAchSignerEditor();
                                                }}
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                        ) : null}
                                    </div>

                                    {achSecondSigner.email ? (
                                        <div
                                            className={cn(
                                                "flex items-center gap-3 rounded-xl border p-3 transition-colors",
                                                showAchSignerEditor
                                                    ? "border-[var(--brand)]/40 bg-[var(--brand)]/5 ring-1 ring-[var(--brand)]/20"
                                                    : "border-[var(--brand)]/10 bg-[var(--brand)]/5 hover:border-[var(--brand)]/25 dark:border-slate-600 dark:bg-[var(--brand)]/10",
                                                canEditRecipients && "cursor-pointer",
                                            )}
                                            onClick={canEditRecipients ? openAchSignerEditor : undefined}
                                            role={canEditRecipients ? "button" : undefined}
                                            tabIndex={canEditRecipients ? 0 : undefined}
                                        >
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-600 shadow-sm dark:border-emerald-500/30 dark:bg-slate-900">
                                                <User className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                                    {achSecondSigner.role || "Owner 2"}
                                                </p>
                                                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {achSecondSigner.name.trim() || "Second signer"}
                                                </p>
                                                <p className="truncate text-xs text-slate-600 dark:text-slate-400">
                                                    {achSecondSigner.email}
                                                </p>
                                            </div>
                                            {canEditRecipients ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:bg-slate-900"
                                                    title="Remove Signer 2"
                                                    aria-label="Remove Signer 2"
                                                    disabled={savingSigner}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        void removeAchSecondSigner();
                                                    }}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : null}

                                    {showAchSignerEditor && canEditRecipients ? (
                                        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-900/60">
                                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                                Role, name, and email for each DocuSign signer. Signer 2 is optional.
                                            </p>
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                Signer 1
                                            </p>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                <Input
                                                    placeholder="Role"
                                                    className="h-9 bg-white text-xs dark:bg-slate-950"
                                                    value={signerDraft.role}
                                                    onChange={(e) =>
                                                        setSignerDraft((prev) => ({
                                                            ...prev,
                                                            role: e.target.value,
                                                        }))
                                                    }
                                                />
                                                <Input
                                                    placeholder="Name"
                                                    className="h-9 bg-white text-xs dark:bg-slate-950"
                                                    value={signerDraft.name}
                                                    onChange={(e) =>
                                                        setSignerDraft((prev) => ({
                                                            ...prev,
                                                            name: e.target.value,
                                                        }))
                                                    }
                                                />
                                                <Input
                                                    placeholder="Email"
                                                    type="email"
                                                    autoComplete="email"
                                                    className="h-9 bg-white text-xs dark:bg-slate-950"
                                                    value={signerDraft.email}
                                                    onChange={(e) =>
                                                        setSignerDraft((prev) => ({
                                                            ...prev,
                                                            email: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                    Signer 2 (optional)
                                                </p>
                                                {(secondSignerDraft.email.trim() ||
                                                    secondSignerDraft.name.trim() ||
                                                    achSecondSigner.email) && (
                                                    <button
                                                        type="button"
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
                                                        disabled={savingSigner}
                                                        onClick={() => void removeAchSecondSigner()}
                                                    >
                                                        <Trash2 className="h-3 w-3" />
                                                        Remove Signer 2
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                <Input
                                                    placeholder="Role"
                                                    className="h-9 bg-white text-xs dark:bg-slate-950"
                                                    value={secondSignerDraft.role}
                                                    onChange={(e) =>
                                                        setSecondSignerDraft((prev) => ({
                                                            ...prev,
                                                            role: e.target.value,
                                                        }))
                                                    }
                                                />
                                                <Input
                                                    placeholder="Name"
                                                    className="h-9 bg-white text-xs dark:bg-slate-950"
                                                    value={secondSignerDraft.name}
                                                    onChange={(e) =>
                                                        setSecondSignerDraft((prev) => ({
                                                            ...prev,
                                                            name: e.target.value,
                                                        }))
                                                    }
                                                />
                                                <Input
                                                    placeholder="Email (optional)"
                                                    type="email"
                                                    autoComplete="email"
                                                    className="h-9 bg-white text-xs dark:bg-slate-950"
                                                    value={secondSignerDraft.email}
                                                    onChange={(e) =>
                                                        setSecondSignerDraft((prev) => ({
                                                            ...prev,
                                                            email: e.target.value,
                                                        }))
                                                    }
                                                />
                                            </div>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-xs text-slate-500"
                                                    disabled={savingSigner}
                                                    onClick={() => setShowAchSignerEditor(false)}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    className="h-8 bg-[#3B8BD1] px-4 text-xs text-white hover:bg-[#2d6fad]"
                                                    disabled={
                                                        savingSigner ||
                                                        !String(signerDraft.role || "").trim()
                                                    }
                                                    onClick={() => void saveAchSigner()}
                                                >
                                                    {savingSigner ? "Saving..." : "Save"}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : null}

                                    <div className="min-w-0 space-y-1">
                                        <label
                                            htmlFor="ach-viewer-docusign-subject-name"
                                            className="text-[11px] font-semibold text-[var(--brand)] dark:text-[var(--brand-accent)]"
                                        >
                                            Subject name
                                        </label>
                                        <Input
                                            id="ach-viewer-docusign-subject-name"
                                            value={envelopeEmailSubject}
                                            maxLength={DOCUSIGN_EMAIL_SUBJECT_MAX_LEN}
                                            disabled={!canEditRecipients || isSendingAch}
                                            placeholder={defaultEnvelopeEmailSubject}
                                            className="h-8 bg-white text-xs dark:bg-slate-950"
                                            onChange={(e) => {
                                                envelopeEmailSubjectDirtyRef.current = true;
                                                setEnvelopeEmailSubject(e.target.value);
                                            }}
                                        />
                                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                            {envelopeEmailSubject.length}/{DOCUSIGN_EMAIL_SUBJECT_MAX_LEN}{" "}
                                            characters — used for the email subject and PDF name
                                        </p>
                                    </div>

                                    <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                            <Mail className="h-3 w-3" aria-hidden />
                                            CC (copy only — not a signer)
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                            <LockedCcChips />
                                            {contractDefaultCcEmails.map((email) => (
                                                <span
                                                    key={`default-cc-${email}`}
                                                    className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium text-slate-800 shadow-sm dark:text-slate-100 ${
                                                        contractDefaultCcUsesFunderOverride
                                                            ? "border-emerald-500/30 bg-emerald-500/10 dark:border-emerald-500/40 dark:bg-emerald-500/15"
                                                            : "border-[var(--brand)]/30 bg-[var(--brand)]/12 dark:border-[var(--brand)]/40 dark:bg-[var(--brand)]/20"
                                                    }`}
                                                    title={
                                                        contractDefaultCcUsesFunderOverride
                                                            ? `Funder default CC: ${email}`
                                                            : `Default CC: ${email}`
                                                    }
                                                >
                                                    <Mail
                                                        className={`h-3 w-3 shrink-0 opacity-80 ${
                                                            contractDefaultCcUsesFunderOverride
                                                                ? "text-emerald-600 dark:text-emerald-400"
                                                                : "text-[var(--brand)]"
                                                        }`}
                                                        aria-hidden
                                                    />
                                                    <span className="max-w-[220px] truncate">{email}</span>
                                                    <span
                                                        className={`text-[10px] font-normal uppercase tracking-wide ${
                                                            contractDefaultCcUsesFunderOverride
                                                                ? "text-emerald-700/80 dark:text-emerald-300/80"
                                                                : "text-[var(--brand)]/80"
                                                        }`}
                                                    >
                                                        {contractDefaultCcUsesFunderOverride
                                                            ? "Funder"
                                                            : "Default"}
                                                    </span>
                                                </span>
                                            ))}
                                            {ccEmails.map((email) => (
                                                <span
                                                    key={email}
                                                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--brand)]/20 bg-[var(--brand)]/8 px-2.5 py-0.5 text-xs font-medium text-slate-800 shadow-sm dark:border-[var(--brand)]/30 dark:bg-[var(--brand)]/15 dark:text-slate-100"
                                                >
                                                    <Mail className="h-3 w-3 shrink-0 text-[var(--brand)] opacity-80" aria-hidden />
                                                    <span className="max-w-[220px] truncate" title={email}>
                                                        {email}
                                                    </span>
                                                    {canEditRecipients ? (
                                                        <button
                                                            type="button"
                                                            className="shrink-0 rounded p-0.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
                                                            aria-label={`Remove ${email}`}
                                                            onClick={() => {
                                                                const next = ccEmails.filter((e) => e !== email);
                                                                setCcEmails(next);
                                                                saveBoldSignCcEmailList(
                                                                    next,
                                                                    contractCcMergeOptions,
                                                                );
                                                            }}
                                                        >
                                                            <X className="h-3.5 w-3.5" />
                                                        </button>
                                                    ) : null}
                                                </span>
                                            ))}
                                        </div>
                                        {canEditRecipients ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Input
                                                    type="email"
                                                    autoComplete="email"
                                                    placeholder="name@company.com"
                                                    value={ccEmailDraft}
                                                    onChange={(e) => setCcEmailDraft(e.target.value)}
                                                    className="h-8 max-w-xs bg-white text-xs dark:bg-slate-950"
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault();
                                                            addAchCcFromDraft();
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-8 border-[var(--brand)]/30 text-xs text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                                    onClick={addAchCcFromDraft}
                                                >
                                                    Add CC
                                                </Button>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex items-start gap-2">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                                            <Info className="h-4 w-4" aria-hidden />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                ACH signing status
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                                Updated via DocuSign webhooks (viewed, signed,
                                                completed).
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-xs"
                                        disabled={statusRefreshing || !achEnvelopeId}
                                        title={
                                            achEnvelopeId
                                                ? "Refresh ACH signing status from DocuSign"
                                                : "No ACH envelope to refresh yet"
                                        }
                                        onClick={() => void refreshAchSigningPreview(false)}
                                    >
                                        {statusRefreshing ? (
                                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                        ) : null}
                                        Refresh
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    <span className="inline-flex items-center rounded-full bg-[var(--brand)]/12 px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                                        {formatSigningStatusLabel(
                                            showDraftOnly ? "DRAFT" : normalizedStatus,
                                        )}
                                    </span>
                                    {lastStatusSyncAt ? (
                                        <p className="text-[10px] text-slate-400">
                                            Last synced {lastStatusSyncAt.toLocaleTimeString()}
                                        </p>
                                    ) : null}
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                                        <div className="flex items-start">
                                            {statusChain.map((step, index) => {
                                                const isDone = activeIndex >= index;
                                                const isCurrent = activeIndex === index;
                                                return (
                                                    <Fragment key={step.key}>
                                                        <div className="flex min-w-[70px] flex-1 flex-col items-center text-center">
                                                            <div
                                                                className={cn(
                                                                    "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                                                                    isDone
                                                                        ? "border-[var(--brand)] bg-[image:var(--brand-gradient)] text-white"
                                                                        : "border-slate-300 bg-white text-slate-400",
                                                                )}
                                                            >
                                                                {isDone ? (
                                                                    <CheckCircle2
                                                                        className="h-4 w-4"
                                                                        aria-hidden
                                                                    />
                                                                ) : (
                                                                    index + 1
                                                                )}
                                                            </div>
                                                            <div className="mt-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                                                {step.label}
                                                            </div>
                                                            <div
                                                                className={cn(
                                                                    "mt-0.5 text-[10px]",
                                                                    isCurrent
                                                                        ? "text-[var(--brand)]"
                                                                        : "text-slate-400",
                                                                )}
                                                            >
                                                                {step.hint}
                                                            </div>
                                                        </div>
                                                        {index < statusChain.length - 1 ? (
                                                            <div
                                                                className={cn(
                                                                    "mt-4 h-0.5 w-8 shrink-0 rounded-full",
                                                                    activeIndex > index
                                                                        ? "bg-[image:var(--brand-gradient)]"
                                                                        : "bg-slate-200",
                                                                )}
                                                            />
                                                        ) : null}
                                                    </Fragment>
                                                );
                                            })}
                                        </div>
                                        {isTerminal ? (
                                            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                                                Signing ended:{" "}
                                                {formatSigningStatusLabel(normalizedStatus)}.
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div className="relative flex min-h-0 w-full min-w-0 flex-col gap-2 bg-slate-700 p-3 lg:w-[58%] lg:max-w-[58%]">
                            <div
                                className="flex shrink-0 rounded-lg border border-slate-600 bg-slate-800/80 p-0.5"
                                role="tablist"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={pdfPaneTab === "template"}
                                    className={cn(
                                        "flex-1 rounded-md px-3 py-1.5 text-center text-[11px] font-semibold transition-colors",
                                        pdfPaneTab === "template"
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-300 hover:text-white",
                                    )}
                                    onClick={() => setPdfPaneTab("template")}
                                >
                                    ACH template
                                </button>
                                {canPreviewDocuSignPdf ? (
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={pdfPaneTab === "docusign"}
                                        className={cn(
                                            "flex-1 rounded-md px-3 py-1.5 text-center text-[11px] font-semibold transition-colors",
                                            pdfPaneTab === "docusign"
                                                ? "bg-white text-slate-900 shadow-sm"
                                                : "text-slate-300 hover:text-white",
                                        )}
                                        onClick={() => setPdfPaneTab("docusign")}
                                    >
                                        {isSignedAch ? "Signed ACH form" : "DocuSign envelope"}
                                    </button>
                                ) : null}
                            </div>
                            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded bg-white shadow-2xl">
                                {pdfPaneTab === "template" || !canPreviewDocuSignPdf ? (
                                    templatePdfLoading ? (
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Loader2 className="h-8 w-8 animate-spin text-[var(--brand)]" />
                                        </div>
                                    ) : templatePdfUrl ? (
                                        <DirectPdfViewer fileUrl={templatePdfUrl} />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
                                            ACH template PDF is not available.
                                        </div>
                                    )
                                ) : docuSignPdfLoading ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-slate-500">
                                        <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" />
                                        Loading ACH form from DocuSign…
                                    </div>
                                ) : docuSignPdfUrl ? (
                                    <DirectPdfViewer fileUrl={docuSignPdfUrl} />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-slate-500">
                                        {docuSignPdfHint ||
                                            "Send the ACH form via DocuSign to preview the filled envelope here."}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6 py-3 dark:border-slate-700">
                        <Button type="button" variant="ghost" className="h-9 shrink-0" onClick={onClose}>
                            Close
                        </Button>
                        {!readOnly && canVoidAch ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-9 shrink-0 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                                disabled={isVoidingAch || isSendingAch}
                                onClick={() => void handleVoidAch()}
                            >
                                {isVoidingAch ? "Voiding ACH form…" : "Void last ACH document"}
                            </Button>
                        ) : null}
                        {!readOnly && canResendAch ? (
                            <Button
                                type="button"
                                variant="default"
                                className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                disabled={isSendingAch || isVoidingAch || !onPrepareDocuSignDraft}
                                onClick={() => void handleReviewAndSend()}
                            >
                                {isSendingAch ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Preparing DocuSign…
                                    </>
                                ) : (
                                    achEnvelopeView.isOutForSignature
                                        ? "Send another ACH form"
                                        : "Resend ACH form"
                                )}
                            </Button>
                        ) : null}
                        {!readOnly && canReviewAndSendAch && !canResendAch ? (
                            <Button
                                type="button"
                                variant="default"
                                className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                disabled={isSendingAch || isVoidingAch || !onPrepareDocuSignDraft}
                                onClick={() => void handleReviewAndSend()}
                            >
                                {isSendingAch ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Preparing DocuSign…
                                    </>
                                ) : (
                                    "Review & send ACH form"
                                )}
                            </Button>
                        ) : null}
                        {!readOnly &&
                        (canResendAch || canReviewAndSendAch) &&
                        Boolean(String(achEnvelopeId ?? "").trim()) ? (
                            <Button
                                type="button"
                                variant="outline"
                                className="h-9 shrink-0"
                                disabled={isSendingAch || isVoidingAch || !onPrepareDocuSignDraft}
                                onClick={handleSendAchInNewEnvelope}
                            >
                                Send ACH in new envelope
                            </Button>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>

            <TemplateMappingPrefillEditDialog
                open={prefillEditOpen}
                onOpenChange={(open) => {
                    setPrefillEditOpen(open);
                    if (!open) setPrefillEditMappingId(null);
                }}
                row={prefillEditRow as TemplateMappingPrefillEditRow}
                contractId={contractId}
                applicationUuid={applicationId}
                applicationData={applicationData}
                resolvedContract={resolvedContract}
                contractRecords={contractPrefillRecords}
                agreementDate={new Date().toLocaleDateString("en-US")}
                documentTemplatePrefillByMappingId={documentTemplatePrefillByMappingId}
                mainPrefillOverrides={mainPrefillOverridesForDialog}
                offerDecision={
                    ((applicationData as { offerDecision?: unknown } | null)?.offerDecision as
                        | Record<string, unknown>
                        | null
                        | undefined) ??
                    ((applicationData as { OfferDecision?: unknown } | null)?.OfferDecision as
                        | Record<string, unknown>
                        | null
                        | undefined) ??
                    ((resolvedContract as { offer?: unknown } | null)?.offer as
                        | Record<string, unknown>
                        | null
                        | undefined) ??
                    null
                }
                allowAchAliasFallback={sortedAchMappings.length <= 1}
                titleSuffix={
                    String(selectedFunder || selectedFunderProfile?.name || "").trim() || null
                }
                onSaved={(savedTabValues) => {
                    void (async () => {
                        // Sync draft envelope first with the exact saved values, then refresh CRM.
                        const synced = await syncAchPrefillToDraftEnvelope(savedTabValues);
                        await refreshContractRow();
                        if (synced === "skipped_frozen") {
                            toast.info(
                                "ACH fields saved in CRM. The open DocuSign draft will not be overwritten — click Review & send again to apply these values.",
                                { autoClose: 10000 },
                            );
                        } else if (synced === true) {
                            toast.success("ACH fields updated on the DocuSign draft envelope.");
                        } else if (synced === false) {
                            toast.warn(
                                "ACH fields saved in CRM, but DocuSign draft tabs could not be updated. Click Review & send again to open a fresh envelope with your edits.",
                            );
                            // Stale / deleted envelope IDs (ENVELOPE_DOES_NOT_EXIST) block future sync —
                            // clear draft linkage so the next Review & send creates a clean envelope.
                            if (achMapping?.id && achEnvelopeId) {
                                try {
                                    await persistAchEnvelopeOnContract(achMapping.id, "", "");
                                } catch {
                                    /* non-blocking */
                                }
                            }
                        } else if (synced === "skipped_not_draft") {
                            toast.info(
                                "ACH fields saved in CRM. This envelope is already out for signature — void it, then Review & send again to apply the new values.",
                            );
                        } else if (synced === "skipped_no_envelope") {
                            toast.info(
                                "ACH fields saved. Click Review & send to open DocuSign with these values.",
                            );
                        } else if (synced === "skipped_multi_form") {
                            toast.info(
                                "ACH values saved. Review & send will rebuild one envelope with each form's own values.",
                                { autoClose: 8000 },
                            );
                        }
                        if (pdfPaneTab === "template") void loadTemplatePdf();
                    })();
                }}
            />

        </>
    );
}
