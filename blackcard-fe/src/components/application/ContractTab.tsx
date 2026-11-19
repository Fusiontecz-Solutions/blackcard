import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { store, type AppDispatch, type RootState } from "@/redux/store";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import {
    getApplicationByApplicationId,
    getApplicationById,
    reinitiateContract,
    updateApplication,
} from "@/redux/actions/applicationActions";
import { applicationNeedsContractReinitiation } from "@/lib/contractReinitiation";
import { isApplicationUuid } from "@/lib/paymentDealApplicationId";
import {
    OFFER_DECISION_UPDATED_EVENT,
    offerDecisionUpdateMatchesApplication,
} from "@/lib/offerDecisionSync";
import {
    CONTRACT_PREFILL_UPDATED_EVENT,
    contractPrefillUpdateMatchesApplication,
} from "@/lib/contractPrefillSync";
import {
    createContract,
    getBoldSignTemplates,
    getAllACH,
    getAllAddendum,
    getAllContractGuarantors,
    getAllContractOwners,
    getAllEPO,
    getByApplicationIdContract,
    getByIdContract,
    updateContract,
} from "@/redux/actions/contractActions";
import { getBankDetails } from "@/redux/actions/bankDetailActions";
import {
    mergeAndSendDocuSignEnvelope,
    voidBoldSignDocument,
    resendDocusignEnvelope,
} from "@/redux/actions/boldSignActions";
import { mergeWithDefaultCcEmails } from "./docusignCcList";
import { funderNamesEquivalent, formatFunderSelectLabel, useFunderProfiles } from "@/hooks/useFunderProfiles";
import { useTheme } from "@/context/ThemeContext";
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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import AddendumModal, { type AddendumEntry } from "./AddendumModal";
import EPOModal, { type EPOEntry } from "./EPOModal";
import ACHModal, { type ACHEntry } from "./ACHModal";
import GuarantorModal, { type GuarantorEntry } from "./GuarantorModal";
import OwnerModal, { type OwnerEntry } from "./OwnerModal";
import BusinessInfoModal from "./BusinessInfoModal";
import type { TermsOffer } from "@/types/termsOfferTypes";
import { toast } from "react-toastify";
import { Ban, FileText, Landmark, Loader2, RefreshCw, Send } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    filterBankDetailsForApplication,
} from "@/lib/bankDetailUtils";
import PDFViewerModal from "./PDFViewerModal";
import PDFViewerDocsModal from "./PDFViewerDocsModal";
import ReverseDisbursementScheduleSection from "./ReverseDisbursementScheduleSection";
import ACHFormViewerModal from "./ACHFormViewerModal";
import { axiosGet, axiosPost } from "@/redux/axios";
import { fetchLatestContractTemplate } from "@/utils/contractTemplate";
// import { US_STATES } from "@/constants/usStates";
import {
    buildContractPrefillFieldsFromApplication,
    CONTRACT_PREFILL_OVERRIDES_SECTION,
    getSignerRecipientEmailForContract,
    getApplicationPrimaryRecipientName,
    resolveBalanceTransferMerchantContext,
    mergeContractPrefillOverrideLayers,
    normalizeContractPrefillOverrides,
    parseNoteStructuredSection,
    applySeparatedAddressPrefillFields,
    applyClientPersonNamePrefillFields,
    applyLiveOfferSyncToPrefillPartial,
    applyTexasContractUsdMoneyToPrefillFields,
    applyLiveClientIdentitySyncToPrefillPartial,
    contractPrefillFieldsToPartial,
    mergeSyncedPartialIntoPrefillFields,
    stripStaleOfferOverridesFromPersisted,
    LIVE_OFFER_MONEY_PREFILL_KEYS,
    type BuildContractPrefillFieldsArgs,
    type ContractPrefillContractRecords,
    type ContractPrefillField,
} from "./contractdata/Contract";
import {
    applyDocumentTemplateMappingPrefillOverrides,
    DOCUMENT_SEND_HISTORY_KEY,
    DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY,
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    isAchEnvelopeDraftLikeStatus,
    LAST_ACH_SENT_FUNDER_KEY,
    mergeStateDisclosurePrefillFallback,
    parseDocumentSendHistory,
    parseDocumentTemplateEnvelopeByMappingId,
    parseDocumentTemplatePrefillByMappingId,
    parseLastAchSentFunder,
    preferNonDraftAchStatus,
    stripDocumentTemplateBlobFromPrefillOverrides,
    upsertDocumentSendHistory,
} from "./contractdata/documentTemplateMappingPrefill";
import { stripAchAuthorizationKeysFromPrefillFields, isAchAuthorizationPrefillKey } from "./contractdata/documentPrefillScope";
import {
    isAchMappingOrTemplate,
} from "./contractdata/achFunderDocumentRef";
import {
    achCamelPartialToTabValues,
    ACH_PREFILL_MAPPING_ALIAS_KEY,
    applyAchSignerPersonNameToPrefillFields,
    resolveAchSavedMappingOverrides,
} from "./contractdata/achFormEditConfig";
import {
    achCapsuleClassName,
    achCapsuleStatusToInternal,
    appendAchSendHistoryEntry,
    formatAchAuthorizationTableLabel,
    mapInternalEnvelopeStatusToAchCapsule,
    mergeAchAuthorizationDocuSignIntoPrefill,
    parseAchAuthorizationDocuSignFromPrefill,
    parseAchSendHistoryFromPrefill,
    type AchAuthorizationDocuSignCapsuleStatus,
} from "./contractdata/achAuthorizationDocuSign";
import {
    buildContractSendTableRows,
    buildContractSendHistoryTermsSnapshot,
    canResendEnvelopeNotification,
    canVoidContractSendTableRow,
    formatAchTableStatusLabel,
    getContractSendRowTermsSnapshot,
    isAchSigningFinished,
    isContractFullySigned,
    isContractVoidedOrTerminal,
    mergeMainContractSendPackageIntoPrefill,
    pickContractEnvelopeDocument,
    pickPreservedDocuSignEnvelopeMetaFromPrefill,
    resolveContractSendRowFunderAuth,
    resolveTermsSnapshotFromContractPrefill,
    upsertContractSendHistoryTermsSnapshot,
    type ContractSendTableRow,
} from "./contractdata/contractSendHistory";
import { syncDocuSignEnvelopeStatus } from "./contractdata/syncDocuSignEnvelopeStatus";
import {
    isDocuSignPollingLimitError,
    isDocuSignStatusTerminal,
    markDocuSignEnvelopeTerminal,
} from "./contractdata/docusignPolling";
import { useContractSigningStatusRealtime } from "@/hooks/useContractSigningStatusRealtime";
import { useApplicationClientOwners } from "@/hooks/useApplicationClientOwners";
import { applicationWithClientOwners } from "./contractdata/contractSignerOwnersSync";
import {
    buildAchFormEnvelopeEmailSubject,
    buildPackageEnvelopeEmailMessage,
    buildPackageEnvelopeEmailSubject,
    type ContractSendPackageSelection,
} from "./contractdata/contractSendPackage";
import { resolveOfferAmountFromPrefillFields } from "./contractdata/resolveOfferAmountFromPrefillFields";
import { resolveBusinessNameFromPrefillFields } from "./contractdata/resolveBusinessNameFromPrefillFields";
import {
    formatStandalonePackageTableStatusLabel,
    isStandalonePackageSigningFinished,
    mergeStandalonePackageDocuSignIntoPrefill,
    parseStandalonePackageDocuSignFromPrefill,
    type StandalonePackageDocuSignCapsuleStatus,
} from "./contractdata/standalonePackageDocuSign";
import {
    buildDocuSignEnvelopeEmailSubject,
    buildAchFormEnvelopeDocumentName,
    buildContractEnvelopeDocumentName,
    DOCUSIGN_EMAIL_LENDER_NAME,
} from "./contractdata/docusignTemplateConfig";
import { formatFunderNameWithDealIdPrefix } from "./contractdata/BALANCE_TRANSFER_SHEET_ADDENDUM";
import { applyFunderDisclosureContactPrefill } from "./contractdata/funderDisclosureContact";
import {
    CONTRACT_SIGNER_OVERRIDES_KEY,
    parseContractSignerOverridesFromPrefill,
    parseBoldSignTemplateRolesFromRecipientsPayload,
    resolveDocuSignRolesForEnvelopeSend,
    type DocuSignTemplateRolePayload,
} from "./contractdata/templateRecipients";
import {
    applyPrimaryGuarantorNamesToPrefillFields,
    applySecondOwnerNameToPrefillFields,
    clearParty2PrefillFieldPayload,
    collapseDocuSignRolesToSignerSlots,
    resolveActiveOwnerCount,
    resolveOwnerRowFullName,
    resolveSecondOwnerSignerName,
} from "./contractdata/contractPartyCounts";
import {
    formatCurrency,
    formatCurrencyFull,
    formatDate,
    formatDateET,
    formatDateTimeUS,
    formatNumberUSForInput,
    formatTimeET,
    parseNumberUS,
    type DateInput,
} from "@/lib/utils";
import {
    resolveOfferDecisionFeesRaw,
    resolveOfferDecisionFundedAmount,
    resolveOfferFeeAmountForDeal,
} from "@/lib/offerDecisionFees";
import {
    deriveOfferRepaymentStack,
    isOfferFactorRate,
    parseTerm,
    recalculateOfferFields,
    resolveOfferFactorRate,
    resolveOfferPayback,
} from "@/lib/offerRepaymentCalculations";
import {
    boldSignTemplateIsPreviewable,
    getBoldSignTemplateMappingRef,
} from "./contractdata/boldSignTemplateDocument";
import {
    getPlatformSignerRoleRows,
    isAchAuthorizationLayoutKey,
    PLATFORM_LAYOUT_KEYS,
} from "./contractdata/platformDocumentConfig";

/** Supplemental PDF in a DocuSign send; `before_main` places it ahead of the main contract. */
type SupplementalDocumentForSend = {
    documentRef: string;
    prefillFields: Array<{ id: string; value: string }>;
    position?: "before_main";
};

type AchDocumentTemplateMappingRow = {
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
    } | null;
};

const DOCUSIGN_SENDER_VIEW_RETRY_DELAYS_MS = {
    existing: [0, 800, 1600, 2600],
    justCreated: [0, 800, 1600, 2600],
} as const;

function formatContractCurrency(value: number | string | null | undefined) {
    return formatCurrency(value, { fallback: "—" });
}

const parseMaybeNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const n = typeof value === "number" ? value : parseNumberUS(value);
    return Number.isFinite(n) ? n : null;
};

const CONTRACT_VALUES_SECTION = "CONTRACT_VALUES";

function formatContractTableStatusLabel(
    contractStatus: unknown,
    documentStatus?: unknown,
    hasEnvelope?: boolean,
): string {
    if (!hasEnvelope) return "Pending";
    const ds = String(documentStatus ?? "").trim().toLowerCase();
    const cs = String(contractStatus ?? "").trim().toUpperCase();
    // The table shows only Sent / Viewed / Signed / Voided once an envelope exists.
    if (ds === "completed" || ds === "signed" || cs === "COMPLETED" || cs === "SIGNED") {
        return "Signed";
    }
    if (
        ["revoked", "voided", "declined", "expired"].includes(ds) ||
        ["REVOKED", "VOIDED", "DECLINED", "EXPIRED"].includes(cs)
    ) {
        return "Voided";
    }
    if (ds === "viewed" || ds === "delivered" || cs === "VIEWED") return "Viewed";
    // Drafts are excluded from Contracts Generated; never show Draft here.
    if (ds === "draft" || ds === "created" || cs === "DRAFT") return "Pending";
    return "Sent";
}

function contractStatusToCapsuleStatus(
    contractStatus: unknown,
    documentStatus?: unknown,
): AchAuthorizationDocuSignCapsuleStatus {
    const label = formatContractTableStatusLabel(contractStatus, documentStatus, true);
    if (label === "Signed") return "SIGNED";
    if (label === "Viewed") return "VIEWED";
    if (label === "Sent") return "SENT";
    if (label === "Voided") return "VOIDED";
    return "DRAFT";
}

function formatTableDateTimeParts(value: unknown): { date: string; time: string } | null {
    const date = formatDateET(value as DateInput, "");
    const time = formatTimeET(value as DateInput, "");
    if (!date || !time) return null;
    return { date, time };
}

/** DocuSign when signers are rejected; show success toast instead of raw validation noise. */
function isDocuSignMissingSignerMessage(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes("minimum one signer") ||
        m.includes("one signer is needed") ||
        m.includes('"signers"') ||
        (m.includes("boldsign validation error") && m.includes("signer")) ||
        (m.includes("docusign error") && m.includes("signer"))
    );
}

/** Legacy `sendViewOption: "Prepare"` caused DocuSign 400; treat like soft-success for toast UX. */
function isDocuSignSendViewOptionPageViewError(message: string): boolean {
    const m = message.toLowerCase();
    return m.includes("sendviewoption") && m.includes("pageviewoption");
}

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseStructuredSection = <T,>(note: string, sectionLabel: string): T | null => {
    if (!note || !sectionLabel) return null;
    const sectionPattern = new RegExp(
        `\\[${escapeRegExp(sectionLabel)}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\n\\[[^\\]]+\\]\\s*\\n|$)`,
        "g",
    );
    let match: RegExpExecArray | null = null;
    let lastPayload = "";
    while ((match = sectionPattern.exec(note)) !== null) {
        lastPayload = String(match[1] || "").trim();
    }
    if (!lastPayload) return null;
    try {
        return JSON.parse(lastPayload) as T;
    } catch {
        return null;
    }
};

const upsertStructuredSection = (
    existingNote: string,
    sectionLabel: string,
    payload: unknown,
) => {
    const serialized = JSON.stringify(payload);
    const blockRegex = new RegExp(
        `(?:\\n\\n)?\\[${escapeRegExp(sectionLabel)}\\]\\s*\\n[\\s\\S]*?(?=(?:\\n\\n\\[[^\\]]+\\]\\s*\\n)|$)`,
        "g",
    );
    const stripped = String(existingNote || "").replace(blockRegex, "").trim();
    const nextBlock = `[${sectionLabel}]\n${serialized}`;
    return stripped ? `${stripped}\n\n${nextBlock}` : nextBlock;
};

type PersistedContractValues = {
    amountFinancedInput: string;
    recipientFundsInput: string;
    financeChargeInput: string;
    estimatedTotalPaymentInput: string;
    paymentTotalInput: string;
    estimatedMonthlyCostInput: string;
    estimatedPaymentInput: string;
    frequencyInput: string;
    numberOfPaymentsInput: string;
    termLengthInput: string;
};

interface ContractTabProps {
    /** When true, hide all edit/generate actions (Agent view) */
    readOnly?: boolean;
}

export default function ContractTab({
    readOnly = false,
}: ContractTabProps = {}) {
    const { applicationId } = useParams<{ applicationId: string }>();
    const dispatch = useDispatch<AppDispatch>();
    const { data: applicationData } = useSelector(
        (state: RootState) => state.applicationDetail,
    );
    const { owners: fullClientOwners } = useApplicationClientOwners(
        (applicationData as { client?: unknown } | null)?.client,
    );
    const applicationForPrefill = useMemo(
        () => applicationWithClientOwners(applicationData, fullClientOwners),
        [applicationData, fullClientOwners],
    );
    const { data: termsOffers, loading: termsOffersLoading } = useSelector(
        (state: RootState) => state.termsOffers,
    );
    const { data: offerDecision, loading: offerDecisionLoading } = useSelector(
        (state: RootState) => state.offerDecision,
    );
    const { data: loginData } = useSelector((state: RootState) => state.login);
    const { data: bankDetailsList } = useSelector(
        (state: RootState) => state.bankDetails,
    );
    const achListState = useSelector((state: RootState) => state.achList);
    const boldSignTemplatesState = useSelector((state: RootState) => state.boldSignTemplates);
    const boldSignTemplates = Array.isArray(boldSignTemplatesState.data)
        ? boldSignTemplatesState.data
        : [];
    const addendumListState = useSelector((state: RootState) => state.addendumList);
    const epoListState = useSelector((state: RootState) => state.epoList);
    const contractOwnerListState = useSelector((state: RootState) => state.contractOwnerList);
    const contractGuarantorListState = useSelector(
        (state: RootState) => state.contractGuarantorList,
    );
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === "dark";
    const userRoleRaw =
        (loginData as any)?.user?.role ||
        (typeof window !== "undefined" ? localStorage.getItem("role") : "") ||
        "";
    const roleKey = String(userRoleRaw || "").replace(/-/g, "_").toUpperCase();
    const applicationTypeRaw = (applicationData as any)?.type || "";
    const isBypassApplication =
        String(applicationTypeRaw || "").trim().toUpperCase() === "BYPASS";
    const isOperationsBypassEditable = roleKey === "OPERATIONS" && isBypassApplication;
    const isReadOnly = readOnly && !isOperationsBypassEditable;

    // const [addendum, setAddendum] = useState(true);
    // const [epo, setEpo] = useState(false);
    // const [ach, setAch] = useState(false);
    // const [guarantor, setGuarantor] = useState(false);
    // const [owner, setOwner] = useState(false);
    const [businessInfoModalOpen, setBusinessInfoModalOpen] = useState(false);
    const [addendumModalOpen, setAddendumModalOpen] = useState(false);
    const [epoModalOpen, setEPOModalOpen] = useState(false);
    const [achModalOpen, setACHModalOpen] = useState(false);
    const [guarantorModalOpen, setGuarantorModalOpen] = useState(false);
    const [ownerModalOpen, setOwnerModalOpen] = useState(false);
    const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
    const [pdfViewerInitialRightPaneTab, setPdfViewerInitialRightPaneTab] = useState<"template" | "prefilled">("template");
    const [achTemplateMappings, setAchTemplateMappings] = useState<AchDocumentTemplateMappingRow[]>([]);
    const [loadingAchMappings, setLoadingAchMappings] = useState(false);
    const [achViewerOpen, setAchViewerOpen] = useState(false);
    const [preparingAchViewer, setPreparingAchViewer] = useState(false);
    /** Which Info Required ACH row feeds the ACH Form modal (first / last picked). */
    const [selectedAchRecordId, setSelectedAchRecordId] = useState<string | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfName, setPdfName] = useState<string>("Contract.pdf");
    const [selectedContractId, setSelectedContractId] = useState<number | null>(null);
    const [globalTemplateUrl, setGlobalTemplateUrl] = useState<string | null>(
        null,
    );
    const [globalTemplateName, setGlobalTemplateName] = useState<string | null>(
        null,
    );
    const [creatingEnvelope, setCreatingEnvelope] = useState(false);
    const [regeneratingContract, setRegeneratingContract] = useState(false);
    const [viewingSignedContract, setViewingSignedContract] = useState(false);
    const [viewingSignedEnvelopeId, setViewingSignedEnvelopeId] = useState<string | null>(null);
    const [voidingContract, setVoidingContract] = useState(false);
    const [resendingEnvelopeRowKey, setResendingEnvelopeRowKey] = useState<string | null>(null);
    const [refreshingSigningStatus, setRefreshingSigningStatus] = useState(false);
    const [contractSyncError, setContractSyncError] = useState<string | null>(null);
    const [achSyncError, setAchSyncError] = useState<string | null>(null);
    const [packageSyncError, setPackageSyncError] = useState<string | null>(null);
    const [signedPdfPreviewOpen, setSignedPdfPreviewOpen] = useState(false);
    const [signedPdfPreviewUrl, setSignedPdfPreviewUrl] = useState<string | null>(null);
    const [signedPdfPreviewName, setSignedPdfPreviewName] = useState("Signed contract.pdf");
    const [fetchedContract, setFetchedContract] = useState<any | null>(null);
    const contractStateForFunders = String(
        (fetchedContract as { state?: string | null } | null)?.state ?? "",
    ).trim();
    const { resolveLayoutKey, findFunder, findFunderById } = useFunderProfiles(contractStateForFunders || null);

    const persistContractFunderMeta = useCallback(
        async (
            contractId: number,
            patch: { funderName?: string | null; state?: string | null },
            contractRow?: Record<string, unknown> | null,
        ) => {
            const row =
                contractRow ??
                (fetchedContract && typeof fetchedContract === "object"
                    ? (fetchedContract as Record<string, unknown>)
                    : null);
            const data: { funderName?: string | null; state?: string | null } = {};
            if (patch.funderName !== undefined) {
                const next =
                    patch.funderName === "" || patch.funderName == null
                        ? null
                        : String(patch.funderName).trim();
                const db = String((row as { funderName?: unknown } | null)?.funderName ?? "").trim();
                if (!funderNamesEquivalent(next, db)) {
                    data.funderName = next;
                }
            }
            if (patch.state !== undefined) {
                const next =
                    patch.state === "" || patch.state == null
                        ? null
                        : String(patch.state).trim();
                const db = String((row as { state?: unknown } | null)?.state ?? "").trim();
                if (next !== db) {
                    data.state = next;
                }
            }
            if (!Object.keys(data).length) return;
            try {
                const res = await dispatch(
                    updateContract({ id: contractId, data }),
                ).unwrap();
                const updated =
                    (res as { data?: Record<string, unknown> } | null)?.data ??
                    (res as Record<string, unknown> | null);
                if (updated && typeof updated === "object") {
                    setFetchedContract(updated);
                } else {
                    setFetchedContract((prev: Record<string, unknown> | null) =>
                        prev && typeof prev === "object" ? { ...prev, ...data } : prev,
                    );
                }
            } catch (err) {
                console.warn("[ContractTab] persist funder/state skipped:", err);
            }
        },
        [dispatch, fetchedContract],
    );

    const appId =
        applicationId ??
        (applicationData as { _id?: string; id?: string })?.id ??
        (applicationData as { _id?: string })?._id;
    // Prefer Application.id (UUID). URL `:applicationId` is often the display Int (e.g. 1115).
    const applicationUuid = useMemo(() => {
        const fromData = String(
            (applicationData as { _id?: string; id?: string } | null)?._id ??
                (applicationData as { id?: string } | null)?.id ??
                "",
        ).trim();
        if (fromData && isApplicationUuid(fromData)) return fromData;
        const fromRoute = String(applicationId ?? "").trim();
        if (fromRoute && isApplicationUuid(fromRoute)) return fromRoute;
        // Backend now accepts numeric display ids; keep as fallback for early loads.
        return fromData || fromRoute || (appId ? String(appId) : null);
    }, [applicationData, applicationId, appId]);
    useEffect(() => {
        const termsApplicationKey = applicationUuid ?? appId;
        if (termsApplicationKey) {
            dispatch(getTermsOffers({ application: String(termsApplicationKey) }));
        }
    }, [applicationUuid, appId, dispatch]);

    // Load existing contract by application so "Contracts Generated" can show
    // persisted backend data even before creating/selecting a contract in this session.
    useEffect(() => {
        const fetchByApplication = async () => {
            if (!applicationUuid) {
                setFetchedContract(null);
                setSelectedContractId(null);
                return;
            }
            try {
                const res = await dispatch(
                    getByApplicationIdContract(String(applicationUuid)),
                ).unwrap();
                const contract = (res as any)?.data ?? res ?? null;
                setFetchedContract(contract);
                const contractId = Number((contract as any)?.id);
                setSelectedContractId(Number.isFinite(contractId) ? contractId : null);
            } catch {
                setFetchedContract(null);
                setSelectedContractId(null);
            }
        };

        fetchByApplication();
    }, [dispatch, applicationUuid]);

    // Fetch created contract details by id when available
    useEffect(() => {
        const fetchById = async () => {
            if (!selectedContractId) return;
            try {
                const res = await dispatch(getByIdContract(Number(selectedContractId))).unwrap();
                console.log("fetched contract", res);
                setFetchedContract((res as any)?.data ?? res ?? null);
            } catch {
                setFetchedContract(null);
            }
        };
        fetchById();
    }, [dispatch, selectedContractId]);

    useEffect(() => {
        if (!selectedContractId) return;
        const id = selectedContractId;
        void dispatch(getAllACH({ contractId: id }));
        void dispatch(getAllAddendum({ contractId: id }));
        void dispatch(getAllEPO({ contractId: id }));
        void dispatch(getAllContractOwners({ contractId: id }));
        void dispatch(getAllContractGuarantors({ contractId: id }));
    }, [dispatch, selectedContractId]);

    useEffect(() => {
        void dispatch(getBoldSignTemplates({}));
    }, [dispatch]);

    const fetchAchTemplateMappings = useCallback(
        async (contractIdOverride?: number): Promise<AchDocumentTemplateMappingRow[]> => {
            const contractId = contractIdOverride ?? selectedContractId;
            if (!contractId) {
                setAchTemplateMappings([]);
                return [];
            }
            try {
                setLoadingAchMappings(true);
                const res = await axiosGet(
                    `/contract/${contractId}/document-template-mappings`,
                );
                const rows = (res?.data?.data ?? []) as AchDocumentTemplateMappingRow[];
                const achRows = Array.isArray(rows)
                    ? rows.filter((row) => String(row.documentType || "").toLowerCase() === "ach")
                    : [];
                setAchTemplateMappings(achRows);
                return achRows;
            } catch {
                setAchTemplateMappings([]);
                return [];
            } finally {
                setLoadingAchMappings(false);
            }
        },
        [selectedContractId],
    );

    useEffect(() => {
        void fetchAchTemplateMappings();
    }, [fetchAchTemplateMappings]);

    const achTemplateOptions = useMemo(
        () =>
            boldSignTemplates.filter((template: { type?: string; name?: string; layoutKey?: string }) => {
                const typeText = String(template?.type || "").toLowerCase();
                const nameText = String(template?.name || "").toLowerCase();
                const layoutKey = String(template?.layoutKey || "").toLowerCase();
                return (
                    typeText === "ach" ||
                    layoutKey === "ach_authorization" ||
                    (nameText.includes("ach") && !nameText.includes("attach"))
                );
            }),
        [boldSignTemplates],
    );

    const primaryAchTemplate = useMemo(() => {
        const previewable = achTemplateOptions.filter((template) =>
            boldSignTemplateIsPreviewable(template),
        );
        const platformFirst = previewable.find((template) => {
            const layoutKey = String(template?.layoutKey || "").toLowerCase();
            const templateId = String(template?.templateId || "").toLowerCase();
            if (layoutKey.startsWith("funder_") || templateId.startsWith("funder_")) {
                return false;
            }
            return (
                layoutKey === "ach_authorization" ||
                layoutKey === "ach_authorization_standalone" ||
                layoutKey === "ach_authorization_texas" ||
                layoutKey === "woodmere_ach_authorization"
            );
        });
        return platformFirst ?? previewable[0] ?? null;
    }, [achTemplateOptions]);

    const linkedAchMapping = useMemo(() => {
        if (!achTemplateMappings.length) return null;
        return [...achTemplateMappings].sort(
            (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
        )[0];
    }, [achTemplateMappings]);

    const sortedAchTemplateMappings = useMemo(
        () =>
            [...achTemplateMappings].sort(
                (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
            ),
        [achTemplateMappings],
    );

    /** ACH template for the viewer — uses contract mapping when present, else the global ACH template. */
    const effectiveAchMapping = useMemo((): AchDocumentTemplateMappingRow | null => {
        if (linkedAchMapping) return linkedAchMapping;
        const template = primaryAchTemplate;
        if (!template || !boldSignTemplateIsPreviewable(template)) return null;
        const ref = getBoldSignTemplateMappingRef(template);
        if (!ref) return null;
        const templateId = String(template.id ?? ref);
        return {
            id: `ach-template-${ref}`,
            contractId: Number(selectedContractId) || 0,
            templateId,
            documentType: "ach",
            order: 0,
            template: {
                id: templateId,
                name: template.name,
                type: template.type,
                templateId: template.templateId,
                pdfUrl: template.pdfUrl,
                layoutKey: template.layoutKey,
            },
        };
    }, [linkedAchMapping, primaryAchTemplate, selectedContractId]);

    const ensureAchTemplateMapping = useCallback(
        async (templateRef: string | null) => {
            if (!selectedContractId) return;
            const ref = String(templateRef || "").trim();
            try {
                const res = await axiosGet(
                    `/contract/${selectedContractId}/document-template-mappings`,
                );
                const rows = (res?.data?.data ?? []) as AchDocumentTemplateMappingRow[];
                const achRows = rows.filter(
                    (row) => String(row.documentType || "").toLowerCase() === "ach",
                );
                // Never delete existing ACH mappings — users may have multiple forms.
                // Only auto-link a default template when none are linked yet.
                if (achRows.length > 0) {
                    await fetchAchTemplateMappings();
                    return;
                }
                if (ref) {
                    await axiosPost(`/contract/${selectedContractId}/document-template-mappings`, {
                        documentType: "ach",
                        templateRef: ref,
                    });
                }
                await fetchAchTemplateMappings();
            } catch (error: unknown) {
                const msg =
                    (error as { message?: string })?.message ||
                    "Failed to link ACH template to contract.";
                toast.error(msg);
            }
        },
        [selectedContractId, fetchAchTemplateMappings],
    );

    useEffect(() => {
        if (!selectedContractId || loadingAchMappings || linkedAchMapping) return;
        const ref = getBoldSignTemplateMappingRef(primaryAchTemplate);
        if (!ref) return;
        void ensureAchTemplateMapping(ref);
    }, [
        selectedContractId,
        loadingAchMappings,
        linkedAchMapping,
        primaryAchTemplate,
        ensureAchTemplateMapping,
    ]);

    const bankDetailApplicationKeys = useMemo(
        () => [
            applicationUuid,
            (applicationData as { applicationId?: number })?.applicationId,
            appId,
        ],
        [applicationUuid, applicationData, appId],
    );

    const bankDetailsForApplication = useMemo(
        () => filterBankDetailsForApplication(bankDetailsList, bankDetailApplicationKeys),
        [bankDetailsList, bankDetailApplicationKeys],
    );

    const achRecordRows = useMemo((): Record<string, unknown>[] => {
        const data = achListState.data;
        return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    }, [achListState.data]);

    const achFormSelectionStorageKey = useMemo(
        () =>
            selectedContractId != null
                ? `achFormSelectedRecordId:${selectedContractId}`
                : null,
        [selectedContractId],
    );

    useEffect(() => {
        if (!achRecordRows.length) {
            setSelectedAchRecordId(null);
            return;
        }
        const ids = achRecordRows.map((row) => String(row.id ?? "").trim()).filter(Boolean);
        if (!ids.length) {
            setSelectedAchRecordId(null);
            return;
        }
        let preferred: string | null = null;
        if (achFormSelectionStorageKey && typeof window !== "undefined") {
            try {
                const stored = String(
                    window.sessionStorage.getItem(achFormSelectionStorageKey) || "",
                ).trim();
                if (stored && ids.includes(stored)) preferred = stored;
            } catch {
                /* ignore */
            }
        }
        setSelectedAchRecordId((prev) => {
            if (prev && ids.includes(prev)) return prev;
            return preferred ?? ids[0];
        });
    }, [achRecordRows, achFormSelectionStorageKey]);

    const handleSelectedAchRecordIdChange = useCallback(
        (nextId: string) => {
            const id = String(nextId || "").trim();
            if (!id) return;
            setSelectedAchRecordId(id);
            if (achFormSelectionStorageKey && typeof window !== "undefined") {
                try {
                    window.sessionStorage.setItem(achFormSelectionStorageKey, id);
                } catch {
                    /* ignore */
                }
            }
        },
        [achFormSelectionStorageKey],
    );

    const contractPrefillRecords: ContractPrefillContractRecords = useMemo(() => {
        const firstRow = (data: unknown): Record<string, unknown> | null =>
            Array.isArray(data) && data.length ? (data[0] as Record<string, unknown>) : null;
        const rows = bankDetailsForApplication;
        const latestBank =
            rows.length > 0
                ? [...rows].sort((a, b) => {
                      const ta = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
                      const tb = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
                      return ta - tb;
                  })[0]
                : null;
        const selectedAch =
            (selectedAchRecordId
                ? achRecordRows.find((row) => String(row.id ?? "").trim() === selectedAchRecordId)
                : null) ??
            achRecordRows[0] ??
            null;
        return {
            contract: fetchedContract && typeof fetchedContract === "object" ? fetchedContract : null,
            ach: selectedAch,
            bankDetail: latestBank
                ? {
                      bankName: latestBank.bankName,
                      accountNumber: latestBank.accountNumber,
                      routingNumber: latestBank.routingNumber,
                  }
                : null,
            addendum: firstRow(addendumListState.data),
            epo: firstRow(epoListState.data),
            owners: Array.isArray(contractOwnerListState.data)
                ? contractOwnerListState.data
                : [],
            guarantors: Array.isArray(contractGuarantorListState.data)
                ? contractGuarantorListState.data
                : [],
        };
    }, [
        achRecordRows,
        selectedAchRecordId,
        addendumListState.data,
        epoListState.data,
        contractOwnerListState.data,
        contractGuarantorListState.data,
        fetchedContract,
        bankDetailsForApplication,
    ]);

    useEffect(() => {
        if (!appId) return;
        dispatch(getOfferDecisionByApplication(String(appId)));
    }, [appId, dispatch]);

    // Refresh offer / prefill when Live Offer is saved elsewhere (scrubbing Offer Decision).
    useEffect(() => {
        const matchId = applicationUuid ?? appId;
        if (!matchId) return;
        const onOfferDecisionUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ applicationId?: string }>).detail;
            if (
                !offerDecisionUpdateMatchesApplication(detail?.applicationId, matchId) &&
                !offerDecisionUpdateMatchesApplication(detail?.applicationId, appId)
            ) {
                return;
            }
            void dispatch(getOfferDecisionByApplication(String(matchId)));
            if (applicationUuid) {
                void dispatch(getApplicationById(String(applicationUuid)));
            }
            void dispatch(getTermsOffers({ application: String(matchId) }));
        };
        window.addEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
        return () => {
            window.removeEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
        };
    }, [applicationUuid, appId, dispatch]);

    // Refresh contract + owners when Overview saves client identity (owner name → Signer Details).
    useEffect(() => {
        if (!applicationUuid) return;
        const onContractPrefillUpdated = (event: Event) => {
            const detail = (
                event as CustomEvent<{ applicationUuid?: string; contract?: unknown }>
            ).detail;
            if (
                !contractPrefillUpdateMatchesApplication(
                    detail?.applicationUuid,
                    applicationUuid,
                )
            ) {
                return;
            }
            if (detail?.contract) {
                setFetchedContract(detail.contract);
                const contractId = Number((detail.contract as { id?: unknown })?.id);
                if (Number.isFinite(contractId) && contractId > 0) {
                    setSelectedContractId(contractId);
                    void dispatch(getAllContractOwners({ contractId }));
                }
            }
            void dispatch(getApplicationById(String(applicationUuid)));
            void dispatch(getBankDetails({ application: String(applicationUuid) }));
        };
        window.addEventListener(CONTRACT_PREFILL_UPDATED_EVENT, onContractPrefillUpdated);
        return () => {
            window.removeEventListener(
                CONTRACT_PREFILL_UPDATED_EVENT,
                onContractPrefillUpdated,
            );
        };
    }, [applicationUuid, dispatch]);

    useEffect(() => {
        if (!applicationUuid) return;
        dispatch(getBankDetails({ application: String(applicationUuid) }));
    }, [applicationUuid, dispatch]);

    useEffect(() => {
        if (!applicationUuid) return;
        const refreshBankDetails = () => {
            if (document.visibilityState === "visible") {
                void dispatch(getBankDetails({ application: String(applicationUuid) }));
            }
        };
        window.addEventListener("focus", refreshBankDetails);
        document.addEventListener("visibilitychange", refreshBankDetails);
        return () => {
            window.removeEventListener("focus", refreshBankDetails);
            document.removeEventListener("visibilitychange", refreshBankDetails);
        };
    }, [applicationUuid, dispatch]);

    // Note: BoldSign callback is handled in RootLayout.tsx to ensure it runs on every page load

    const latestTermsOffer: TermsOffer | undefined = termsOffers?.[0];

    const effectiveTermsOffer = useMemo((): TermsOffer | undefined => {
        const normalize = (raw: unknown): TermsOffer | undefined => {
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
            const row = raw as Record<string, unknown>;
            const id = String(row._id ?? row.id ?? "");
            return { ...(row as unknown as TermsOffer), _id: id || String(row._id ?? "") };
        };
        return (
            latestTermsOffer ??
            normalize((fetchedContract as { termsOffers?: unknown[] } | null)?.termsOffers?.[0]) ??
            normalize(
                (fetchedContract as { application?: { termsOffers?: unknown[] } } | null)
                    ?.application?.termsOffers?.[0],
            )
        );
    }, [latestTermsOffer, fetchedContract]);

    const needsContractReinitiation = applicationNeedsContractReinitiation(
        applicationData as Record<string, unknown> | null,
    );

    const contractsForTable = termsOffers ?? [];
    const hasGeneratedContract = useMemo(() => {
        const fetchedId = Number((fetchedContract as { id?: unknown } | null)?.id);
        if (Number.isFinite(fetchedId) && fetchedId > 0) return true;
        return Number.isFinite(Number(selectedContractId)) && Number(selectedContractId) > 0;
    }, [fetchedContract, selectedContractId]);

    const contractEnvelopeDocument = useMemo(
        () =>
            pickContractEnvelopeDocument(
                fetchedContract as Record<string, unknown> | null | undefined,
            ),
        [fetchedContract],
    );

    const mainContractEnvelopeId = useMemo(
        () => String(contractEnvelopeDocument?.envelopeId ?? "").trim() || null,
        [contractEnvelopeDocument],
    );

    const achAuthorizationDocuSign = useMemo(
        () =>
            parseAchAuthorizationDocuSignFromPrefill(
                (fetchedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides,
                { excludeEnvelopeId: mainContractEnvelopeId },
            ),
        [fetchedContract, mainContractEnvelopeId],
    );

    const standalonePackageDocuSign = useMemo(
        () =>
            parseStandalonePackageDocuSignFromPrefill(
                (fetchedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides,
                { excludeEnvelopeId: mainContractEnvelopeId },
            ),
        [fetchedContract, mainContractEnvelopeId],
    );

    const packageCapsuleStatus: StandalonePackageDocuSignCapsuleStatus =
        standalonePackageDocuSign?.status ?? "DRAFT";

    const achCapsuleStatus: AchAuthorizationDocuSignCapsuleStatus =
        achAuthorizationDocuSign?.status ?? "DRAFT";

    const contractFullySigned = isContractFullySigned(
        (fetchedContract as { status?: unknown } | null)?.status,
        contractEnvelopeDocument?.status,
    );

    const contractRecordForActions =
        fetchedContract && typeof fetchedContract === "object"
            ? (fetchedContract as Record<string, unknown>)
            : null;

    const contractSendTableRows = useMemo(
        () =>
            buildContractSendTableRows(
                fetchedContract && typeof fetchedContract === "object"
                    ? (fetchedContract as Record<string, unknown>)
                    : null,
            ),
        [fetchedContract],
    );

    const offerRecord =
        offerDecision != null && typeof offerDecision === "object"
            ? (offerDecision as Record<string, unknown>)
            : null;

    const decisionFrequency = String(
        offerRecord?.frequency ?? effectiveTermsOffer?.frequency ?? "",
    );

    const paymentsPerMonth =
        decisionFrequency === "Daily"
            ? 22
            : decisionFrequency === "Weekly"
                ? 4
                : decisionFrequency === "Monthly"
                    ? 1
                    : 0;

    const approvedAmount =
        resolveOfferDecisionFundedAmount(offerRecord) ??
        parseMaybeNumber(offerRecord?.offer) ??
        effectiveTermsOffer?.approvedAmount ??
        0;

    const factorRate = resolveOfferFactorRate({
        offerDecisionRate: parseMaybeNumber(offerRecord?.rate),
        termsFactorRate: effectiveTermsOffer?.factorRate,
        fallback: 1.499,
    });

    const paymentTermStr =
        offerRecord?.term != null ? String(offerRecord.term).trim() : "";
    const paymentTermCount = paymentTermStr ? parseTerm(paymentTermStr) : NaN;

    const termLength =
        parseMaybeNumber(offerRecord?.termLength) ??
        effectiveTermsOffer?.termLength ??
        (Number.isFinite(paymentTermCount) &&
        paymentTermCount > 0 &&
        paymentsPerMonth > 0
            ? Math.round(paymentTermCount / paymentsPerMonth)
            : 0);

    const feesRaw = resolveOfferDecisionFeesRaw(offerRecord);
    const commissionAmount = resolveOfferFeeAmountForDeal({
        fundedAmount: approvedAmount,
        factorRate,
        feesRaw,
        termsCommissionPercent: effectiveTermsOffer?.commissionPercent,
        applicationCommissionPercentage: (applicationData as { commissionPercentage?: unknown })
            ?.commissionPercentage,
    });

    const paybackAmount = resolveOfferPayback(approvedAmount, factorRate, {
        termsPaybackAmount: effectiveTermsOffer?.paybackAmount,
        offerPaybackAmount: parseMaybeNumber(offerRecord?.paybackAmount),
        totalRemit: parseMaybeNumber(offerRecord?.totalRemit),
    });

    const repaymentStack =
        approvedAmount > 0 && paymentTermStr
            ? deriveOfferRepaymentStack({
                  advance: approvedAmount,
                  factorRate,
                  term: paymentTermStr,
                  frequency: decisionFrequency || "Daily",
              })
            : null;

    const numberOfPayments =
        parseMaybeNumber(offerRecord?.numberOfPayments) ??
        (Number.isFinite(paymentTermCount) && paymentTermCount > 0
            ? paymentTermCount
            : termLength > 0 && paymentsPerMonth > 0
              ? termLength * paymentsPerMonth
              : effectiveTermsOffer?.numberOfPayments ?? 0);

    const rawPaymentAmount =
        parseMaybeNumber(offerRecord?.repayPerPeriod) ??
        parseMaybeNumber(offerRecord?.paymentAmount) ??
        parseMaybeNumber(offerRecord?.daysWeeks) ??
        effectiveTermsOffer?.paymentAmount ??
        0;

    const amountFinanced = approvedAmount;
    const recipientFunds = approvedAmount - commissionAmount;
    const feeAmount = commissionAmount;

    const estimatedTotalPayment = repaymentStack?.payback ?? paybackAmount;

    const ensureAchTemplateLinked = useCallback(
        async (contractId: number) => {
            const res = await axiosGet(`/contract/${contractId}/document-template-mappings`);
            const rows = (res?.data?.data ?? []) as Array<{
                id: string;
                documentType?: string;
                template?: { layoutKey?: string; templateId?: string } | null;
                templateId?: string;
            }>;
            const achRows = rows.filter((row) => {
                const docType = String(row.documentType ?? "").toLowerCase();
                if (docType === "ach") return true;
                const key = String(
                    row.template?.layoutKey ?? row.template?.templateId ?? row.templateId ?? "",
                )
                    .trim()
                    .toLowerCase();
                return isAchAuthorizationLayoutKey(key);
            });
            // Keep every ACH mapping instance — multiple forms share one envelope/PDF.
            if (achRows.length > 0) return;
            const templateRef =
                getBoldSignTemplateMappingRef(primaryAchTemplate) ??
                PLATFORM_LAYOUT_KEYS.achAuthorization;
            await axiosPost(`/contract/${contractId}/document-template-mappings`, {
                documentType: "ach",
                templateRef,
            });
        },
        [primaryAchTemplate],
    );

    const ensureContractRecordForAch = useCallback(async (): Promise<number> => {
        const fromSelection = Number(selectedContractId);
        if (Number.isFinite(fromSelection) && fromSelection > 0) return fromSelection;

        const fromFetched = Number((fetchedContract as { id?: unknown } | null)?.id);
        if (Number.isFinite(fromFetched) && fromFetched > 0) {
            setSelectedContractId(fromFetched);
            return fromFetched;
        }

        if (!applicationUuid) {
            throw new Error("Application is required to send the ACH form.");
        }

        const anyApp = applicationData as unknown as Record<string, unknown>;
        const userFromRedux = loginData?.user as { _id?: string; id?: string } | undefined;
        const userFromStorage = (() => {
            if (typeof window === "undefined") return null;
            try {
                return JSON.parse(localStorage.getItem("user") || "null") as {
                    _id?: string;
                    id?: string;
                } | null;
            } catch {
                return null;
            }
        })();
        const createdById =
            userFromRedux?._id ||
            userFromRedux?.id ||
            userFromStorage?._id ||
            userFromStorage?.id ||
            "";
        const offerIdRaw =
            (offerDecision as { id?: unknown; _id?: unknown } | null)?.id ??
            (offerDecision as { id?: unknown; _id?: unknown } | null)?._id ??
            latestTermsOffer?._id;
        const referringIsoId = parseMaybeNumber(
            anyApp?.referringIsoId ??
                (anyApp?.referringISO as { id?: unknown } | undefined)?.id ??
                (anyApp?.referringIso as { id?: unknown } | undefined)?.id,
        );
        const paymentTermsId = parseMaybeNumber(
            (offerDecision as { paymentTermsId?: unknown } | null)?.paymentTermsId ??
                anyApp?.paymentTermsId,
        );
        const paymentBankIdRaw =
            anyApp?.paymentBankId ??
            (anyApp?.paymentBank as { id?: unknown } | undefined)?.id ??
            (anyApp?.bankDetail as { id?: unknown } | undefined)?.id;

        const createRes = await dispatch(
            createContract({
                applicationId: String(applicationUuid),
                clientId:
                    (anyApp?.clientId as string | undefined) ??
                    ((anyApp?.client as { _id?: string; id?: string } | undefined)?._id ||
                        (anyApp?.client as { _id?: string; id?: string } | undefined)?.id),
                referringIsoId: referringIsoId ?? undefined,
                salesRepId: parseMaybeNumber(anyApp?.salesRepId) ?? undefined,
                offerId: offerIdRaw ? String(offerIdRaw) : undefined,
                contractLenght: termLength != null ? Number(termLength) : undefined,
                approvedAmount: approvedAmount != null ? Number(approvedAmount) : undefined,
                totalAmount:
                    estimatedTotalPayment != null ? Number(estimatedTotalPayment) : undefined,
                status: "DRAFT",
                createdById: createdById || undefined,
                paymentTermsId: paymentTermsId ?? undefined,
                paymentBankId: paymentBankIdRaw ? String(paymentBankIdRaw) : undefined,
            }),
        ).unwrap();

        const createdContract =
            (createRes as { data?: Record<string, unknown> } | null)?.data ??
            (createRes as Record<string, unknown> | null);
        let contractId = Number((createdContract as { id?: unknown } | null)?.id);
        if (!Number.isFinite(contractId) || contractId <= 0) {
            const byApp = await dispatch(
                getByApplicationIdContract(String(applicationUuid)),
            ).unwrap();
            const contract = (byApp as { data?: Record<string, unknown> } | null)?.data ?? byApp;
            contractId = Number((contract as { id?: unknown } | null)?.id);
            if (contract && typeof contract === "object") {
                setFetchedContract(contract);
            }
        } else if (createdContract && typeof createdContract === "object") {
            setFetchedContract(createdContract);
        }

        if (!Number.isFinite(contractId) || contractId <= 0) {
            throw new Error("Could not create a contract record for this application.");
        }

        setSelectedContractId(contractId);
        return contractId;
    }, [
        applicationData,
        applicationUuid,
        approvedAmount,
        dispatch,
        estimatedTotalPayment,
        fetchedContract,
        latestTermsOffer?._id,
        loginData?.user,
        offerDecision,
        selectedContractId,
        termLength,
    ]);

    const estimatedPayment =
        repaymentStack?.perPeriodPayment ??
        (numberOfPayments > 0
            ? Number((estimatedTotalPayment / numberOfPayments).toFixed(2))
            : rawPaymentAmount);

    let lastPayment = estimatedPayment;
    let paymentTotal = estimatedPayment * numberOfPayments;

    if (numberOfPayments > 0) {
        const diff = Number((estimatedTotalPayment - paymentTotal).toFixed(2));
        if (Math.abs(diff) >= 0.01) {
            lastPayment = Number((estimatedPayment + diff).toFixed(2));
            paymentTotal = estimatedPayment * (numberOfPayments - 1) + lastPayment;
        }
    }

    const estimatedMonthlyCost =
        repaymentStack?.monthlyPayment ??
        (estimatedPayment > 0 && paymentsPerMonth > 0
            ? Number((estimatedPayment * paymentsPerMonth).toFixed(2))
            : 0);

    const contractTableMetrics = useMemo(() => {
        const offerDecisionRate = parseMaybeNumber(offerRecord?.rate);
        const buyRateFromOfferDecision =
            offerDecisionRate != null &&
            offerDecisionRate > 0 &&
            offerDecisionRate < 2
                ? offerDecisionRate
                : null;

        const buyRate =
            effectiveTermsOffer?.buyRate ?? buyRateFromOfferDecision ?? null;
        const upsell =
            effectiveTermsOffer?.percentOfGross ??
            effectiveTermsOffer?.commissionPercent ??
            parseMaybeNumber(
                (applicationData as { commissionPercentage?: unknown })
                    ?.commissionPercentage,
            );
        const factor = effectiveTermsOffer?.factorRate ?? factorRate;

        const perPeriodPayment =
            parseMaybeNumber(fetchedContract?.offer?.repayPerPeriod) ??
            repaymentStack?.perPeriodPayment ??
            parseMaybeNumber(offerRecord?.repayPerPeriod) ??
            effectiveTermsOffer?.paymentAmount ??
            estimatedPayment;

        const formatRatePercent = (value: number | null | undefined) => {
            if (value == null || !Number.isFinite(value)) return "—";
            return `${value}%`;
        };

        const formatFactor = (value: number | null | undefined) => {
            if (value == null || !Number.isFinite(value)) return "—";
            return String(value);
        };

        return {
            buyRate: formatRatePercent(buyRate ?? undefined),
            upsell: formatRatePercent(upsell ?? undefined),
            factor: formatFactor(factor ?? undefined),
            perPeriodPayment,
        };
    }, [
        applicationData,
        estimatedPayment,
        effectiveTermsOffer,
        factorRate,
        fetchedContract,
        offerRecord,
        repaymentStack,
    ]);

    // Local editable copies for Final Calculation fields
    const [amountFinancedInput, setAmountFinancedInput] = useState<string>("");
    const [recipientFundsInput, setRecipientFundsInput] = useState<string>("");
    const [financeChargeInput, setFinanceChargeInput] = useState<string>("");
    const [estimatedTotalPaymentInput, setEstimatedTotalPaymentInput] =
        useState<string>("");
    const [paymentTotalInput, setPaymentTotalInput] = useState<string>("");
    const [estimatedMonthlyCostInput, setEstimatedMonthlyCostInput] =
        useState<string>("");
    const [estimatedPaymentInput, setEstimatedPaymentInput] =
        useState<string>("");
    const [frequencyInput, setFrequencyInput] = useState<string>("");
    const [numberOfPaymentsInput, setNumberOfPaymentsInput] =
        useState<string>("");
    const [termLengthInput, setTermLengthInput] = useState<string>("");
    const [contractValuesSaved, setContractValuesSaved] = useState(false);
    const [savingContractValues, setSavingContractValues] = useState(false);
    const [isEditingContractValues, setIsEditingContractValues] = useState(false);
    const [savedContractValuesSnapshot, setSavedContractValuesSnapshot] =
        useState<PersistedContractValues | null>(null);
    /** Lock finance-charge % while Amount Financed changes (same as scrubbing / Verify Prefill). */
    const financeChargePercentRef = useRef<number | null>(null);

    const getCurrentContractValues = (): PersistedContractValues => ({
        amountFinancedInput,
        recipientFundsInput,
        financeChargeInput,
        estimatedTotalPaymentInput,
        paymentTotalInput,
        estimatedMonthlyCostInput,
        estimatedPaymentInput,
        frequencyInput,
        numberOfPaymentsInput,
        termLengthInput,
    });

    const refinanceAmountForCalc =
        parseMaybeNumber(offerRecord?.refinanceAmount) ??
        parseMaybeNumber(offerRecord?.RefinanceAmount) ??
        0;

    /**
     * Scrubbing-aligned stack: offer × rate → payback; payback ÷ term → per-period;
     * fee $ scales with locked %; recipient funds = offer − fees − refinance.
     */
    const applyFinalCalculationOfferStack = useCallback(
        (
            driver: "advance" | "payback" | "daily",
            rawDriverValue: string,
        ) => {
            const stripped = rawDriverValue.replace(/^\$\s*/, "");
            const formatted = formatNumberUSForInput(stripped);
            const display = formatted ? `$ ${formatted}` : "";
            const driverNum = parseNumberUS(formatted);

            if (driver === "advance") {
                setAmountFinancedInput(display);
            } else if (driver === "payback") {
                setEstimatedTotalPaymentInput(display);
            } else {
                setEstimatedPaymentInput(display);
            }

            if (!Number.isFinite(driverNum) || driverNum <= 0) return;

            const termStr =
                String(numberOfPaymentsInput || paymentTermStr || numberOfPayments || "").trim();
            const freq =
                String(frequencyInput || decisionFrequency || "Daily").trim() || "Daily";
            const currentAdvance = parseNumberUS(amountFinancedInput);
            const currentPayback = parseNumberUS(estimatedTotalPaymentInput);
            const currentDaily = parseNumberUS(estimatedPaymentInput);

            const stack = recalculateOfferFields(
                {
                    advance: driver === "advance" ? driverNum : currentAdvance || 0,
                    factorRate,
                    payback: driver === "payback" ? driverNum : currentPayback || 0,
                    daily: driver === "daily" ? driverNum : currentDaily || 0,
                    term: termStr,
                    frequency: freq,
                },
                driver,
            );
            if (!stack) {
                // Fallback when rate/term incomplete: still derive payback from offer × rate if possible.
                if (driver === "advance" && isOfferFactorRate(factorRate)) {
                    const payback = Math.round(driverNum * factorRate * 100) / 100;
                    setEstimatedTotalPaymentInput(formatCurrencyFull(payback));
                }
                return;
            }

            const prevOffer = parseNumberUS(amountFinancedInput);
            const prevFee = parseNumberUS(financeChargeInput);
            let feePct = financeChargePercentRef.current;
            if (
                (feePct == null || !Number.isFinite(feePct)) &&
                Number.isFinite(prevOffer) &&
                prevOffer > 0 &&
                Number.isFinite(prevFee) &&
                prevFee >= 0
            ) {
                feePct = (prevFee / prevOffer) * 100;
            }
            const feeDollars =
                feePct != null && Number.isFinite(feePct)
                    ? Math.round(((stack.advance * feePct) / 100) * 100) / 100
                    : Number.isFinite(prevFee)
                      ? prevFee
                      : 0;
            if (feePct != null && Number.isFinite(feePct)) {
                financeChargePercentRef.current = feePct;
            }

            const recipient = Math.max(
                0,
                Math.round((stack.advance - feeDollars - refinanceAmountForCalc) * 100) / 100,
            );

            const nPayments =
                parseNumberUS(numberOfPaymentsInput) ||
                (Number.isFinite(parseTerm(termStr)) ? parseTerm(termStr) : 0) ||
                numberOfPayments ||
                0;

            let paymentTotal = stack.payback;
            if (nPayments > 0 && stack.daily > 0) {
                paymentTotal = stack.daily * nPayments;
                const diff = Number((stack.payback - paymentTotal).toFixed(2));
                if (Math.abs(diff) >= 0.01) {
                    const lastPayment = Number((stack.daily + diff).toFixed(2));
                    paymentTotal = stack.daily * (nPayments - 1) + lastPayment;
                }
            }

            setAmountFinancedInput(
                driver === "advance" ? display : formatCurrencyFull(stack.advance),
            );
            setEstimatedTotalPaymentInput(
                driver === "payback" ? display : formatCurrencyFull(stack.payback),
            );
            setEstimatedPaymentInput(
                driver === "daily" ? display : formatCurrencyFull(stack.daily),
            );
            setEstimatedMonthlyCostInput(formatCurrencyFull(stack.monthlyPayment));
            setFinanceChargeInput(formatCurrencyFull(feeDollars));
            setRecipientFundsInput(formatCurrencyFull(recipient));
            setPaymentTotalInput(formatCurrencyFull(paymentTotal));
            if (nPayments > 0) {
                setNumberOfPaymentsInput(String(Math.trunc(nPayments)));
            }
        },
        [
            amountFinancedInput,
            decisionFrequency,
            estimatedPaymentInput,
            estimatedTotalPaymentInput,
            factorRate,
            financeChargeInput,
            frequencyInput,
            numberOfPayments,
            numberOfPaymentsInput,
            paymentTermStr,
            refinanceAmountForCalc,
        ],
    );

    useEffect(() => {
        // Prefer persisted contract values from backend note; fallback to computed defaults.
        const note = String((applicationData as any)?.note || "");
        const persisted = parseStructuredSection<PersistedContractValues>(
            note,
            CONTRACT_VALUES_SECTION,
        );

        if (persisted) {
            setAmountFinancedInput(String(persisted.amountFinancedInput || ""));
            setRecipientFundsInput(
                String(persisted.recipientFundsInput || "").trim() ||
                    (recipientFunds ? formatCurrencyFull(recipientFunds) : ""),
            );
            setFinanceChargeInput(
                String(persisted.financeChargeInput || "").trim() ||
                    (feeAmount ? formatCurrencyFull(feeAmount) : ""),
            );
            setEstimatedTotalPaymentInput(
                String(persisted.estimatedTotalPaymentInput || ""),
            );
            setPaymentTotalInput(String(persisted.paymentTotalInput || ""));
            setEstimatedMonthlyCostInput(
                String(persisted.estimatedMonthlyCostInput || ""),
            );
            setEstimatedPaymentInput(String(persisted.estimatedPaymentInput || ""));
            setFrequencyInput(String(persisted.frequencyInput || ""));
            setNumberOfPaymentsInput(String(persisted.numberOfPaymentsInput || ""));
            setTermLengthInput(String(persisted.termLengthInput || ""));
            setContractValuesSaved(true);
            setIsEditingContractValues(false);
            setSavedContractValuesSnapshot(persisted);
            {
                const offerN = parseNumberUS(persisted.amountFinancedInput);
                const feeN = parseNumberUS(
                    String(persisted.financeChargeInput || "").trim() || String(feeAmount || ""),
                );
                financeChargePercentRef.current =
                    Number.isFinite(offerN) && offerN > 0 && Number.isFinite(feeN) && feeN >= 0
                        ? (feeN / offerN) * 100
                        : null;
            }
            return;
        }

        setContractValuesSaved(false);
        setIsEditingContractValues(false);
        setSavedContractValuesSnapshot(null);
        setAmountFinancedInput(amountFinanced ? formatCurrencyFull(amountFinanced) : "");
        setRecipientFundsInput(recipientFunds ? formatCurrencyFull(recipientFunds) : "");
        setFinanceChargeInput(feeAmount ? formatCurrencyFull(feeAmount) : "");
        setEstimatedTotalPaymentInput(
            estimatedTotalPayment ? formatCurrencyFull(estimatedTotalPayment) : "",
        );
        setPaymentTotalInput(paymentTotal ? formatCurrencyFull(paymentTotal) : "");
        setEstimatedMonthlyCostInput(
            estimatedMonthlyCost ? formatCurrencyFull(estimatedMonthlyCost) : "",
        );
        setEstimatedPaymentInput(
            estimatedPayment ? formatCurrencyFull(estimatedPayment) : "",
        );
        setFrequencyInput(decisionFrequency || "");
        setNumberOfPaymentsInput(numberOfPayments ? String(numberOfPayments) : "");
        setTermLengthInput(termLength ? String(termLength) : "");
        financeChargePercentRef.current =
            amountFinanced > 0 && feeAmount >= 0
                ? (feeAmount / amountFinanced) * 100
                : null;
    }, [
        applicationData,
        amountFinanced,
        recipientFunds,
        feeAmount,
        estimatedTotalPayment,
        paymentTotal,
        estimatedMonthlyCost,
        estimatedPayment,
        decisionFrequency,
        numberOfPayments,
        termLength,
    ]);

    useEffect(() => {
        const fetchTemplate = async () => {
            const template = await fetchLatestContractTemplate();
            if (!template?.url) return;
            setGlobalTemplateUrl(template.url);
            setGlobalTemplateName(template.originalName);
        };

        fetchTemplate();
    }, []);

    /**
     * Open the PDF viewer for any existing contract on this application — regardless of status.
     * Re-opening a contract that has advanced past DRAFT (SENT/VIEWED/SIGNED/COMPLETED via BoldSign
     * webhooks) must NOT trigger a fresh `createContract` call, because the upsert would overwrite
     * the webhook-driven status back to DRAFT and break the signing flow.
     */
    const tryOpenExistingDraftViewer = async (): Promise<boolean> => {
        if (!applicationUuid) return false;
        try {
            const byApp = await dispatch(
                getByApplicationIdContract(String(applicationUuid)),
            ).unwrap();
            const contract = (byApp as any)?.data ?? byApp;
            const byAppContractId = Number((contract as any)?.id);
            if (!Number.isFinite(byAppContractId) || byAppContractId <= 0) {
                return false;
            }
            setSelectedContractId(byAppContractId);
            setFetchedContract(contract);
            setPdfUrl(globalTemplateUrl || "platform://contract");
            setPdfName(globalTemplateName || "Contract.pdf");
            const linkedEnvelopeId = String(
                (contract as any)?.application?.document?.envelopeId ?? "",
            ).trim();
            setPdfViewerInitialRightPaneTab(linkedEnvelopeId ? "prefilled" : "template");
            setPdfViewerOpen(true);
            return true;
        } catch {
            return false;
        }
    };

    const closeSignedPdfPreview = () => {
        setSignedPdfPreviewOpen(false);
        setSignedPdfPreviewUrl((prev) => {
            if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
            return null;
        });
    };

    const refreshFetchedContract = async () => {
        if (!applicationUuid) return;
        try {
            const res = await dispatch(
                getByApplicationIdContract(String(applicationUuid)),
            ).unwrap();
            const contract = (res as { data?: unknown })?.data ?? res ?? null;
            setFetchedContract(contract);
            const contractId = Number((contract as { id?: unknown })?.id);
            setSelectedContractId(Number.isFinite(contractId) ? contractId : null);
            if (Number.isFinite(contractId) && contractId > 0) {
                await fetchAchTemplateMappings(contractId);
            }
        } catch {
            /* ignore */
        }
    };

    const handleViewSignedContract = async (envelopeIdOverride?: string) => {
        if (!applicationUuid) {
            toast.error("Missing application ID.");
            return;
        }

        const envelopeKey = String(envelopeIdOverride ?? "").trim() || null;
        setViewingSignedEnvelopeId(envelopeKey);
        setViewingSignedContract(true);
        try {
            let contract = fetchedContract;
            if (!contract) {
                const byApp = await dispatch(
                    getByApplicationIdContract(String(applicationUuid)),
                ).unwrap();
                contract = (byApp as { data?: unknown })?.data ?? byApp;
                setFetchedContract(contract);
            }

            const contractId = Number((contract as { id?: unknown })?.id);
            if (!Number.isFinite(contractId) || contractId <= 0) {
                toast.info("No contract is available to view.");
                return;
            }

            const envelopeId = String(
                envelopeIdOverride ??
                    (contract as { application?: { document?: { envelopeId?: string } } })
                        ?.application?.document?.envelopeId ??
                    "",
            ).trim();
            if (!envelopeId) {
                toast.error(
                    "No DocuSign envelope found. Refresh contract status after signing completes.",
                );
                return;
            }

            const contractRecord = contract as Record<string, unknown>;
            const sendRows = buildContractSendTableRows(contractRecord);
            const matchingRow =
                sendRows.find(
                    (row) => String(row.envelopeId ?? "").trim() === envelopeId,
                ) ?? null;
            const funderAuth = matchingRow
                ? resolveContractSendRowFunderAuth(contractRecord, matchingRow)
                : {
                      funderName: String(
                          (contract as { funderName?: unknown })?.funderName ?? "",
                      ).trim(),
                      contractState: String(
                          (contract as { state?: unknown })?.state ?? "",
                      ).trim(),
                  };

            const res = await axiosGet(
                `/docusign/download/${encodeURIComponent(envelopeId)}`,
                {
                    responseType: "blob",
                    timeout: 120000,
                    params: {
                        ...(applicationUuid
                            ? { applicationId: String(applicationUuid) }
                            : {}),
                        ...(Number.isFinite(contractId) && contractId > 0
                            ? { contractId }
                            : {}),
                        ...(funderAuth.funderName
                            ? { funderName: funderAuth.funderName }
                            : {}),
                        ...(funderAuth.funderProfileId
                            ? { funderProfileId: funderAuth.funderProfileId }
                            : {}),
                        ...(funderAuth.contractState
                            ? { contractState: funderAuth.contractState }
                            : {}),
                    },
                },
            );
            const blob =
                res.data instanceof Blob
                    ? res.data
                    : new Blob([res.data], { type: "application/pdf" });
            if (!blob.size) {
                toast.error("DocuSign returned an empty PDF.");
                return;
            }

            const objectUrl = URL.createObjectURL(blob);
            const fileLabel = String(
                (applicationData as { applicationId?: unknown })?.applicationId ??
                    applicationUuid,
            ).replace(/[^\w.-]+/g, "_");
            const fileName = `${
                matchingRow?.rowType === "ach" ? "ach-form" : "contract"
            }-${fileLabel}.pdf`;

            setSignedPdfPreviewUrl((prev) => {
                if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                return objectUrl;
            });
            setSignedPdfPreviewName(fileName);
            setSignedPdfPreviewOpen(true);
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } }; message?: string })
                    ?.response?.data?.message ||
                (err as { message?: string })?.message ||
                "Could not load the contract document.";
            toast.error(String(msg));
        } finally {
            setViewingSignedContract(false);
            setViewingSignedEnvelopeId(null);
        }
    };

    const reloadFetchedContract = useCallback(async () => {
        if (!applicationUuid) return null;
        const res = await dispatch(getByApplicationIdContract(String(applicationUuid))).unwrap();
        const contract = (res as { data?: unknown })?.data ?? res ?? null;
        setFetchedContract(contract);
        const contractId = Number((contract as { id?: unknown })?.id);
        if (Number.isFinite(contractId)) setSelectedContractId(contractId);
        return contract;
    }, [applicationUuid, dispatch]);

    const refreshContractEnvelopeStatus = useCallback(
        async (silent?: boolean, options?: { force?: boolean }) => {
            const mainEnvelopeId = String(contractEnvelopeDocument?.envelopeId ?? "").trim();
            if (!mainEnvelopeId || contractFullySigned) {
                if (!silent) setContractSyncError(null);
                return;
            }

            if (!silent) setRefreshingSigningStatus(true);
            const appId = applicationUuid ? String(applicationUuid) : undefined;
            try {
                const result = await syncDocuSignEnvelopeStatus(mainEnvelopeId, {
                    applicationId: appId,
                    contractId: selectedContractId,
                    force: options?.force,
                    silent,
                });
                if (result.rateLimited) {
                    if (!silent) {
                        setContractSyncError(
                            "DocuSign polling limit reached for contract. Wait a few minutes or rely on webhook updates.",
                        );
                    }
                } else {
                    setContractSyncError(null);
                }
            } catch (err: unknown) {
                const msg =
                    err instanceof Error ? err.message : "Could not refresh contract status.";
                setContractSyncError(msg);
                if (!silent) toast.error(msg);
            } finally {
                try {
                    await reloadFetchedContract();
                } catch {
                    /* partial sync still useful */
                }
                if (!silent) setRefreshingSigningStatus(false);
            }
        },
        [
            applicationUuid,
            contractEnvelopeDocument?.envelopeId,
            contractFullySigned,
            reloadFetchedContract,
            selectedContractId,
        ],
    );

    const refreshAchEnvelopeStatus = useCallback(
        async (
            silent?: boolean,
            options?: { force?: boolean; envelopeId?: string | null },
        ) => {
            const prefill = (fetchedContract as { contractPrefillOverrides?: unknown } | null)
                ?.contractPrefillOverrides;
            const envelopeBlob = parseDocumentTemplateEnvelopeByMappingId(prefill);
            const aliasId = String(
                envelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.envelopeId ?? "",
            ).trim();
            const historyAch = parseDocumentSendHistory(prefill)
                .filter((h) => h.documentKind === "ach")
                .sort((a, b) =>
                    String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
                );
            const historyId = String(historyAch[0]?.envelopeId ?? "").trim();
            const achEnvelopeId =
                String(options?.envelopeId ?? "").trim() ||
                String(achAuthorizationDocuSign?.envelopeId ?? "").trim() ||
                aliasId ||
                historyId;
            const mainEnvelopeId = String(contractEnvelopeDocument?.envelopeId ?? "").trim();
            if (!achEnvelopeId || achEnvelopeId === mainEnvelopeId) {
                if (!silent) setAchSyncError(null);
                return;
            }
            const resolvedCapsuleStatus = mapInternalEnvelopeStatusToAchCapsule(
                historyAch.find((h) => String(h.envelopeId ?? "").trim() === achEnvelopeId)
                    ?.status ??
                    envelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.status ??
                    achCapsuleStatus,
            );
            if (isAchSigningFinished(resolvedCapsuleStatus)) {
                if (!silent) setAchSyncError(null);
                return;
            }

            if (!silent) setRefreshingSigningStatus(true);
            const appId = applicationUuid ? String(applicationUuid) : undefined;
            try {
                const result = await syncDocuSignEnvelopeStatus(achEnvelopeId, {
                    applicationId: appId,
                    contractId: selectedContractId,
                    force: options?.force,
                    silent,
                });
                if (result.rateLimited) {
                    if (!silent) {
                        setAchSyncError(
                            "DocuSign polling limit reached for ACH. Wait a few minutes or rely on webhook updates.",
                        );
                    }
                } else {
                    setAchSyncError(null);
                }
            } catch (err: unknown) {
                const msg =
                    err instanceof Error ? err.message : "Could not refresh ACH status.";
                setAchSyncError(msg);
                if (!silent) toast.error(msg);
            } finally {
                try {
                    await reloadFetchedContract();
                } catch {
                    /* partial sync still useful */
                }
                if (!silent) setRefreshingSigningStatus(false);
            }
        },
        [
            achAuthorizationDocuSign?.envelopeId,
            achCapsuleStatus,
            applicationUuid,
            contractEnvelopeDocument?.envelopeId,
            fetchedContract,
            reloadFetchedContract,
            selectedContractId,
        ],
    );

    const refreshPackageEnvelopeStatus = useCallback(
        async (silent?: boolean, options?: { force?: boolean }) => {
            const packageEnvelopeId = String(standalonePackageDocuSign?.envelopeId ?? "").trim();
            const mainEnvelopeId = String(contractEnvelopeDocument?.envelopeId ?? "").trim();
            if (!packageEnvelopeId || packageEnvelopeId === mainEnvelopeId) {
                if (!silent) setPackageSyncError(null);
                return;
            }
            if (isStandalonePackageSigningFinished(packageCapsuleStatus)) {
                if (!silent) setPackageSyncError(null);
                return;
            }

            if (!silent) setRefreshingSigningStatus(true);
            const appId = applicationUuid ? String(applicationUuid) : undefined;
            try {
                const result = await syncDocuSignEnvelopeStatus(packageEnvelopeId, {
                    applicationId: appId,
                    contractId: selectedContractId,
                    force: options?.force,
                    silent,
                });
                if (result.rateLimited) {
                    if (!silent) {
                        setPackageSyncError(
                            "DocuSign polling limit reached for supplemental documents. Wait a few minutes or rely on webhook updates.",
                        );
                    }
                } else {
                    setPackageSyncError(null);
                }
            } catch (err: unknown) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : "Could not refresh supplemental document status.";
                setPackageSyncError(msg);
                if (!silent) toast.error(msg);
            } finally {
                try {
                    await reloadFetchedContract();
                } catch {
                    /* partial sync still useful */
                }
                if (!silent) setRefreshingSigningStatus(false);
            }
        },
        [
            applicationUuid,
            contractEnvelopeDocument?.envelopeId,
            packageCapsuleStatus,
            reloadFetchedContract,
            selectedContractId,
            standalonePackageDocuSign?.envelopeId,
        ],
    );

    /** Instant UI when DocuSign Connect webhook updates envelope status. */
    useContractSigningStatusRealtime(applicationUuid, (payload) => {
        const status = String(payload?.status ?? "").trim();
        if (isDocuSignStatusTerminal(status) && payload?.envelopeId) {
            markDocuSignEnvelopeTerminal(String(payload.envelopeId));
        }
        void reloadFetchedContract();
    });

    /**
     * Heal envelopes stuck at DRAFT after DocuSign already sent/signed (missed Connect).
     * At most once per envelope — never re-force on every contract reload (that looped
     * get_contract_by_application + DocuSign sync and slowed sender view).
     */
    const draftHealAttemptedRef = useRef<Set<string>>(new Set());
    const refreshContractEnvelopeStatusRef = useRef(refreshContractEnvelopeStatus);
    const refreshAchEnvelopeStatusRef = useRef(refreshAchEnvelopeStatus);
    const refreshPackageEnvelopeStatusRef = useRef(refreshPackageEnvelopeStatus);
    refreshContractEnvelopeStatusRef.current = refreshContractEnvelopeStatus;
    refreshAchEnvelopeStatusRef.current = refreshAchEnvelopeStatus;
    refreshPackageEnvelopeStatusRef.current = refreshPackageEnvelopeStatus;

    useEffect(() => {
        if (!applicationUuid || !hasGeneratedContract) return;
        const mainEnvId = String(mainContractEnvelopeId ?? "").trim();
        const mainDocStatus = String(contractEnvelopeDocument?.status ?? "")
            .trim()
            .toLowerCase();
        const mainIsDraft =
            mainDocStatus === "draft" ||
            mainDocStatus === "created" ||
            !mainDocStatus;
        if (mainEnvId && !mainIsDraft) {
            draftHealAttemptedRef.current.delete(`main:${mainEnvId}`);
        } else if (
            mainEnvId &&
            mainIsDraft &&
            !draftHealAttemptedRef.current.has(`main:${mainEnvId}`)
        ) {
            draftHealAttemptedRef.current.add(`main:${mainEnvId}`);
            void refreshContractEnvelopeStatusRef.current(true, { force: true });
        }

        const achEnvId = String(achAuthorizationDocuSign?.envelopeId ?? "").trim();
        if (achEnvId && achEnvId !== mainEnvId && achCapsuleStatus !== "DRAFT") {
            draftHealAttemptedRef.current.delete(`ach:${achEnvId}`);
        } else if (
            achEnvId &&
            achEnvId !== mainEnvId &&
            achCapsuleStatus === "DRAFT" &&
            !draftHealAttemptedRef.current.has(`ach:${achEnvId}`)
        ) {
            draftHealAttemptedRef.current.add(`ach:${achEnvId}`);
            void refreshAchEnvelopeStatusRef.current(true, { force: true });
        }

        const packageEnvId = String(standalonePackageDocuSign?.envelopeId ?? "").trim();
        if (
            packageEnvId &&
            packageEnvId !== mainEnvId &&
            packageCapsuleStatus !== "DRAFT"
        ) {
            draftHealAttemptedRef.current.delete(`pkg:${packageEnvId}`);
        } else if (
            packageEnvId &&
            packageEnvId !== mainEnvId &&
            packageCapsuleStatus === "DRAFT" &&
            !draftHealAttemptedRef.current.has(`pkg:${packageEnvId}`)
        ) {
            draftHealAttemptedRef.current.add(`pkg:${packageEnvId}`);
            void refreshPackageEnvelopeStatusRef.current(true, { force: true });
        }
    }, [
        achAuthorizationDocuSign?.envelopeId,
        achCapsuleStatus,
        applicationUuid,
        contractEnvelopeDocument?.status,
        hasGeneratedContract,
        mainContractEnvelopeId,
        packageCapsuleStatus,
        standalonePackageDocuSign?.envelopeId,
    ]);

    const handleVoidSentEnvelopeRow = async (row: ContractSendTableRow) => {
        const envelopeId = String(row.envelopeId ?? "").trim();
        if (
            !envelopeId ||
            voidingContract ||
            !canVoidContractSendTableRow(contractRecordForActions, row)
        ) {
            return;
        }
        const confirmed = window.confirm(
            `Void "${row.label}" in DocuSign? Signers will no longer be able to sign this document.`,
        );
        if (!confirmed) return;

        setVoidingContract(true);
        try {
            const funderAuth = resolveContractSendRowFunderAuth(contractRecordForActions, row);
            await dispatch(
                voidBoldSignDocument({
                    documentId: envelopeId,
                    reason: "Voided by user from CRM",
                    ...(applicationUuid ? { applicationId: String(applicationUuid) } : {}),
                    ...(selectedContractId != null ? { contractId: selectedContractId } : {}),
                    ...funderAuth,
                }),
            ).unwrap();
            await reloadFetchedContract();
            toast.success(`${row.label} voided in DocuSign.`);
        } catch (err: unknown) {
            const msg =
                typeof err === "string"
                    ? err
                    : String(
                          (err as { message?: string })?.message || "Failed to void document.",
                      );
            toast.error(msg);
        } finally {
            setVoidingContract(false);
        }
    };

    /** One-click DocuSign notification resend — same envelope, no modal. */
    const handleResendEnvelopeRow = async (row: ContractSendTableRow) => {
        const envelopeId = String(row.envelopeId ?? "").trim();
        if (
            !envelopeId ||
            resendingEnvelopeRowKey ||
            !canResendEnvelopeNotification(row)
        ) {
            return;
        }
        setResendingEnvelopeRowKey(row.key);
        try {
            const funderAuth = resolveContractSendRowFunderAuth(contractRecordForActions, row);
            await dispatch(
                resendDocusignEnvelope({
                    documentId: envelopeId,
                    applicationId: applicationUuid ? String(applicationUuid) : undefined,
                    contractId: selectedContractId ?? undefined,
                    funderName:
                        funderAuth.funderName ??
                        (fetchedContract as { funderName?: string | null } | null)?.funderName ??
                        undefined,
                }),
            ).unwrap();
            await reloadFetchedContract();
            toast.success(`Signing email resent for ${row.label}.`);
        } catch (err: unknown) {
            const msg =
                typeof err === "string"
                    ? err
                    : String(
                          (err as { message?: string })?.message ||
                              "Failed to resend DocuSign email.",
                      );
            toast.error(msg);
        } finally {
            setResendingEnvelopeRowKey(null);
        }
    };

    /** Draft created — Contract Generated (not sent until DocuSign envelope is delivered). */
    const persistContractGeneratedStage = async () => {
        if (!applicationUuid) return;
        try {
            await dispatch(
                updateApplication({
                    id: String(applicationUuid),
                    data: {
                        currentQueue: "Contract Generated",
                        currentState: "Contract Generated",
                    },
                }),
            ).unwrap();
        } catch (err) {
            console.error(
                "Failed to set application currentQueue/currentState to Contract Generated:",
                err,
            );
        }
    };

    const handleGenerateContract = async () => {
        if (isReadOnly) {
            const opened = await tryOpenExistingDraftViewer();
            if (!opened) {
                toast.info("No contract draft is available to view.");
            }
            return;
        }

        if (!applicationUuid) {
            toast.error("Missing application ID.");
            return;
        }

        if (needsContractReinitiation) {
            setRegeneratingContract(true);
            try {
                await dispatch(reinitiateContract(String(applicationUuid))).unwrap();
                const byApp = await dispatch(
                    getByApplicationIdContract(String(applicationUuid)),
                ).unwrap();
                const contract = (byApp as { data?: Record<string, unknown> } | null)?.data ?? byApp;
                if (contract && typeof contract === "object") {
                    setFetchedContract(contract);
                    const contractId = Number((contract as { id?: unknown }).id);
                    setSelectedContractId(Number.isFinite(contractId) ? contractId : null);
                }
                if (applicationUuid) {
                    void dispatch(getApplicationById(String(applicationUuid)));
                }
            } catch (error: unknown) {
                const message =
                    typeof error === "string"
                        ? error
                        : (error as { message?: string })?.message ||
                          "Failed to archive the prior contract before generating a new one.";
                toast.error(String(message));
                return;
            } finally {
                setRegeneratingContract(false);
            }
        } else {
            // Re-open existing contract before any DB-mutating createContract call so a webhook-driven
            // status (SENT/VIEWED/SIGNED/COMPLETED) is never clobbered back to DRAFT by the upsert.
            const reopenedExisting = await tryOpenExistingDraftViewer();
            if (reopenedExisting) return;
        }

        const anyApp = applicationData as any;

        await persistContractGeneratedStage();

        const userFromRedux = loginData?.user as { _id?: string; id?: string } | undefined;
        const userFromStorage = (() => {
            if (typeof window === "undefined") return null;
            try {
                return JSON.parse(localStorage.getItem("user") || "null") as {
                    _id?: string;
                    id?: string;
                } | null;
            } catch {
                return null;
            }
        })();

        const createdById =
            userFromRedux?._id ||
            userFromRedux?.id ||
            userFromStorage?._id ||
            userFromStorage?.id ||
            "";
        const offerIdRaw =
            (offerDecision as any)?.id ??
            (offerDecision as any)?._id ??
            latestTermsOffer?._id;
        const referringIsoId = parseMaybeNumber(
            anyApp?.referringIsoId ??
            anyApp?.referringISO?.id ??
            anyApp?.referringIso?.id,
        );
        const paymentTermsId = parseMaybeNumber(
            (offerDecision as any)?.paymentTermsId ??
            anyApp?.paymentTermsId,
        );
        const paymentBankIdRaw =
            anyApp?.paymentBankId ??
            anyApp?.paymentBank?.id ??
            anyApp?.bankDetail?.id;

        setCreatingEnvelope(true);
        try {
            await dispatch(
                createContract({
                    applicationId: String(applicationUuid),
                    clientId: anyApp?.clientId ?? anyApp?.client?._id ?? anyApp?.client?.id,
                    referringIsoId: referringIsoId ?? undefined,
                    salesRepId: parseMaybeNumber(anyApp?.salesRepId) ?? undefined,
                    offerId: offerIdRaw ? String(offerIdRaw) : undefined,
                    contractLenght:
                        termLength != null ? Number(termLength) : undefined,
                    approvedAmount:
                        approvedAmount != null ? Number(approvedAmount) : undefined,
                    totalAmount:
                        estimatedTotalPayment != null
                            ? Number(estimatedTotalPayment)
                            : undefined,
                    status: "DRAFT",
                    createdById: createdById || undefined,
                    paymentTermsId: paymentTermsId ?? undefined,
                    paymentBankId: paymentBankIdRaw
                        ? String(paymentBankIdRaw)
                        : undefined,
                }),
            ).unwrap();

            const numericAppId = anyApp?.applicationId;
            if (numericAppId != null && String(numericAppId).trim() !== "" && !Number.isNaN(Number(numericAppId))) {
                void dispatch(getApplicationByApplicationId(Number(numericAppId)));
            } else if (applicationUuid) {
                void dispatch(getApplicationById(String(applicationUuid)));
            }

            try {
                const byApp = await dispatch(
                    getByApplicationIdContract(String(applicationUuid)),
                ).unwrap();
                const contract = (byApp as any)?.data ?? byApp;
                const byAppContractId = Number((contract as any)?.id);
                setSelectedContractId(Number.isFinite(byAppContractId) ? byAppContractId : null);
            } catch {
                /* contract id may already be set from create response */
            }
            setPdfUrl(globalTemplateUrl || "platform://contract");
            setPdfName(globalTemplateName || "Contract.pdf");
            setPdfViewerInitialRightPaneTab("template");
            setPdfViewerOpen(true);
        } catch (error: any) {
            // `createContract` is a thunk that rejects via `rejectWithValue(<string>)`, so
            // `.unwrap()` throws a plain string. Fall back to object shapes for other errors.
            const message =
                typeof error === "string"
                    ? error
                    : error?.response?.data?.message ||
                      error?.message ||
                      "Failed to create contract.";
            toast.error(String(message));
        } finally {
            setCreatingEnvelope(false);
        }
    };

    const getPrimaryRecipientEmail = () =>
        getSignerRecipientEmailForContract(applicationData, fetchedContract);

    const buildPrefillFields = (contractRow?: Record<string, unknown> | null) => {
        const source =
            contractRow ??
            (fetchedContract && typeof fetchedContract === "object"
                ? (fetchedContract as Record<string, unknown>)
                : null);
        const fromContract = stripDocumentTemplateBlobFromPrefillOverrides(
            normalizeContractPrefillOverrides(
                (source as { contractPrefillOverrides?: unknown } | null)?.contractPrefillOverrides,
            ) ?? null,
        );
        const note = String((applicationData as { note?: string })?.note || "");
        const fromNote = parseNoteStructuredSection<Partial<BuildContractPrefillFieldsArgs>>(
            note,
            CONTRACT_PREFILL_OVERRIDES_SECTION,
        );
        const mergedOverrides = mergeContractPrefillOverrideLayers(fromNote, fromContract);
        const overrides =
            Object.keys(mergedOverrides).length > 0 ? mergedOverrides : undefined;
        const recordsForBuild: ContractPrefillContractRecords | undefined = selectedContractId
            ? {
                  ...contractPrefillRecords,
                  contract: source,
              }
            : undefined;
        return buildContractPrefillFieldsFromApplication(applicationData, {
            agreementDate: formatDate(new Date()),
            contractRecords: recordsForBuild,
            overrides,
            offerDecision: (offerDecision as Record<string, unknown> | null) ?? null,
        });
    };

    const getPrimaryRecipientName = () =>
        getApplicationPrimaryRecipientName(applicationData);

    const runDocuSignEnvelope = async (
        sendPayload: {
            ccEmails: string[];
            /** CRM document-template row id for optional addendum PDF. */
            addendumDocumentRef?: string | null;
            /** @deprecated use addendumDocumentRef */
            addendumBoldSignTemplateId?: string | null;
            /** Ordered addendum mapping instances; duplicate templates are allowed. */
            addendumDocuments?: Array<{ mappingId: string; documentRef: string }>;
            /** CRM document-template row id for state disclosure PDF. */
            disclosureDocumentRef?: string | null;
            /** "first" (default) = before main contract; "last" = after contract and addenda. */
            disclosurePosition?: "first" | "last";
            /** CRM document-template row id for optional ACH PDF. */
            achDocumentRef?: string | null;
            /** When true, envelope contains only the ACH form (no main contract PDF). */
            standaloneAchOnly?: boolean;
            /** When false, send supplemental docs only (no main contract PDF). */
            includeMainContract?: boolean;
            /** Create Contract — which documents are in this envelope. */
            sendPackage?: ContractSendPackageSelection;
            roles?: DocuSignTemplateRolePayload[];
            /** Current funder from contract modal (may not be persisted yet). */
            funderName?: string | null;
            /** CRM funder profile id — resolves funder-specific addendum/disclosure PDFs. */
            funderProfileId?: string | null;
            /** Contract state from modal (may not be persisted yet). */
            contractState?: string | null;
            /** Main contract layout key (Woodmere vs Texas Funding Group). */
            mainContractLayoutKey?: string | null;
            /** Deal Review values from the contract modal (latest UI state). */
            prefillFields?: Array<{ id: string; value: string }>;
            /** Editable DocuSign email subject from the PDF / ACH modal. */
            title?: string | null;
            /** Editable DocuSign PDF / document name from the PDF / ACH modal. */
            documentName?: string | null;
            /** "Create in new envelope" — backend skips every reuse path. */
            forceNewEnvelope?: boolean;
        },
        options: { autoSend: boolean; suppressSuccessToast?: boolean },
    ): Promise<{
        envelopeId: string;
        prefillTabsApplied?: number;
        prefillFieldCount?: number;
        sendUrl?: string | null;
    }> => {
        const failDocuSignEnvelope = (message: string): never => {
            toast.error(message);
            throw new Error(message);
        };

        const addendumDocumentRef = String(
            sendPayload.addendumDocumentRef ?? sendPayload.addendumBoldSignTemplateId ?? "",
        ).trim();
        const addendumDocuments = (sendPayload.addendumDocuments ?? [])
            .map((item) => ({
                mappingId: String(item?.mappingId || "").trim(),
                documentRef: String(item?.documentRef || "").trim(),
            }))
            .filter((item) => item.mappingId && item.documentRef);
        if (!addendumDocuments.length && addendumDocumentRef) {
            addendumDocuments.push({ mappingId: "", documentRef: addendumDocumentRef });
        }
        const disclosureDocumentRef = String(sendPayload.disclosureDocumentRef ?? "").trim();
        const disclosureFirst = sendPayload.disclosurePosition !== "last";
        const achDocumentRef = String(sendPayload.achDocumentRef ?? "").trim();
        const standaloneAchOnly = sendPayload.standaloneAchOnly === true;
        const includeMainContract = sendPayload.includeMainContract !== false;

        if (achDocumentRef && !standaloneAchOnly) {
            failDocuSignEnvelope(
                "ACH forms are sent individually only. Use Send ACH Form on the Contract tab.",
            );
        }

        if (!applicationUuid) {
            failDocuSignEnvelope("Application is required to send via DocuSign.");
        }
        if (standaloneAchOnly) {
            if (!achDocumentRef && addendumDocuments.length === 0) {
                failDocuSignEnvelope("Select an ACH template before sending.");
            }
        } else if (!includeMainContract) {
            const supplementalOnlyRefs = [
                ...addendumDocuments.map((item) => item.documentRef),
                disclosureDocumentRef,
            ].filter(Boolean);
            if (!supplementalOnlyRefs.length) {
                failDocuSignEnvelope(
                    "Select at least one addendum or state disclosure to send without the main contract.",
                );
            }
        }

        const sendPackageSelection: ContractSendPackageSelection | undefined =
            sendPayload.sendPackage ??
            (standaloneAchOnly
                ? undefined
                : includeMainContract
                  ? {
                        includeMainContract: true,
                        includeAddendum: addendumDocuments.length > 0,
                        includeDisclosure: Boolean(disclosureDocumentRef),
                    }
                  : {
                        includeMainContract: false,
                        includeAddendum: addendumDocuments.length > 0,
                        includeDisclosure: Boolean(disclosureDocumentRef),
                    });

        const userCcEmails = (sendPayload.ccEmails || [])
            .map((e) => String(e).trim())
            .filter(Boolean);
        const resolvedFunderForCc = String(sendPayload.funderName ?? "").trim();
        const funderProfileForSend =
            (sendPayload.funderProfileId
                ? findFunderById(String(sendPayload.funderProfileId).trim())
                : null) ??
            (resolvedFunderForCc ? findFunder(resolvedFunderForCc) : null);
        const envelopeFunderLabel =
            String(resolvedFunderForCc || "").trim() ||
            formatFunderSelectLabel(funderProfileForSend ?? undefined) ||
            DOCUSIGN_EMAIL_LENDER_NAME;
        const funderDefaultCcEmail =
            String(funderProfileForSend?.defaultCcEmail ?? "").trim() || null;
        const effectiveCcEmails = mergeWithDefaultCcEmails(userCcEmails, {
            funderDefaultCcEmail,
        });

        const applicationSignerEmail = getPrimaryRecipientEmail().trim();
        const applicationSignerName = getPrimaryRecipientName();

        setCreatingEnvelope(true);
        try {
            let recipientsPayload: unknown = null;
            const cachedRecipients = store.getState().boldSign?.templateRecipients ?? null;
            const cachedRolesEarly =
                parseBoldSignTemplateRolesFromRecipientsPayload(cachedRecipients);
            if (cachedRolesEarly.length > 0) {
                recipientsPayload = cachedRecipients;
            } else {
                // Platform layouts: roles from code — no DocuSign /templates/.../recipients.
                const ownerRowsForSlots = Array.isArray(contractOwnerListState.data)
                    ? contractOwnerListState.data
                    : [];
                recipientsPayload = {
                    success: true,
                    source: "platform-layout",
                    roles: getPlatformSignerRoleRows(Math.max(1, ownerRowsForSlots.length || 1)),
                };
            }

            let templateRoles =
                parseBoldSignTemplateRolesFromRecipientsPayload(
                    recipientsPayload,
                );
            if (templateRoles.length === 0) {
                const cached =
                    store.getState().boldSign?.templateRecipients ?? null;
                templateRoles =
                    parseBoldSignTemplateRolesFromRecipientsPayload(cached);
            }

            let latestContract: any = fetchedContract;
            try {
                const refreshed = await dispatch(
                    getByApplicationIdContract(String(applicationUuid)),
                ).unwrap();
                const c = (refreshed as any)?.data ?? refreshed;
                if (c) {
                    latestContract = c;
                    setFetchedContract(c);
                }
            } catch {
                /* use fetchedContract */
            }

            const contractNumericIdForPersist = Number((latestContract as { id?: unknown })?.id);
            if (Number.isFinite(contractNumericIdForPersist) && contractNumericIdForPersist > 0) {
                await persistContractFunderMeta(
                    contractNumericIdForPersist,
                    {
                        funderName: sendPayload.funderName,
                        state: sendPayload.contractState,
                    },
                    latestContract as Record<string, unknown>,
                );
                try {
                    const refreshedAfterMeta = await dispatch(
                        getByApplicationIdContract(String(applicationUuid)),
                    ).unwrap();
                    const refreshedContract =
                        (refreshedAfterMeta as { data?: unknown })?.data ?? refreshedAfterMeta;
                    if (refreshedContract) {
                        latestContract = refreshedContract;
                        setFetchedContract(refreshedContract);
                    }
                } catch {
                    /* use latestContract */
                }
            }

            const signerOverridesFromContract = parseContractSignerOverridesFromPrefill(
                (latestContract as { contractPrefillOverrides?: unknown })
                    ?.contractPrefillOverrides,
            );

            let roles = resolveDocuSignRolesForEnvelopeSend({
                payloadRoles: sendPayload.roles,
                contractSignerOverrides: signerOverridesFromContract,
                templateRoles,
                applicationSignerEmail,
                applicationSignerName,
            });

            const ownerRows = Array.isArray(contractOwnerListState.data)
                ? contractOwnerListState.data
                : [];
            /** Manage Signers / send payload roles win — do not bump Owner 2 from stale Info Required owners. */
            const ownerCount = resolveActiveOwnerCount({
                owners: roles.length > 0 ? null : ownerRows,
                signerRoles: roles,
            });
            const secondOwnerNameBeforeCollapse = resolveSecondOwnerSignerName(
                roles,
                ownerCount,
                ownerRows,
            );
            roles = collapseDocuSignRolesToSignerSlots(roles, ownerCount);

            if (roles.length === 0) {
                failDocuSignEnvelope(
                    "Could not resolve any DocuSign signers. Add a client email on this application.",
                );
            }

            const missingEmailIndexes = roles
                .map((role, i) =>
                    String(role.signerEmail || "").trim() ? -1 : i,
                )
                .filter((i) => i >= 0);
            if (missingEmailIndexes.length > 0) {
                failDocuSignEnvelope(
                    `Signer role(s) missing email (roles ${missingEmailIndexes
                        .map((i) => i + 1)
                        .join(
                            ", ",
                        )}). Add signer emails in CRM (Manage Signers) or a client email on this application.`,
                );
            }

            const primarySignerEmail = String(roles[0]?.signerEmail || "").trim();
            let prefillFieldsPayload: ContractPrefillField[] = buildPrefillFields(latestContract);
            if (sendPayload.prefillFields?.length) {
                const overlay = new Map(
                    sendPayload.prefillFields
                        .filter((f) => String(f.id || "").trim() && String(f.value || "").trim())
                        .map((f) => [String(f.id).trim(), String(f.value).trim()]),
                );
                prefillFieldsPayload = prefillFieldsPayload.map((field) =>
                    overlay.has(field.id)
                        ? { ...field, value: overlay.get(field.id)! }
                        : field,
                );
                for (const [id, value] of overlay.entries()) {
                    if (!prefillFieldsPayload.some((field) => field.id === id)) {
                        prefillFieldsPayload.push({ id, label: id, value });
                    }
                }
            }
            /**
             * Final Calculation / live OfferDecision money must match Verify Prefill on every
             * DocuSign data label — re-sync after modal overlay in case base rebuild was stale.
             */
            {
                const moneySynced = applyLiveOfferSyncToPrefillPartial(
                    contractPrefillFieldsToPartial(prefillFieldsPayload),
                    applicationData,
                    (offerDecision as Record<string, unknown> | null) ?? null,
                    {
                        contract:
                            (latestContract as Record<string, unknown> | null | undefined) ?? null,
                    },
                );
                prefillFieldsPayload = mergeSyncedPartialIntoPrefillFields(
                    prefillFieldsPayload,
                    moneySynced,
                );
            }
            if (primarySignerEmail) {
                prefillFieldsPayload = prefillFieldsPayload.map((field) =>
                    field.id === "client_email" || field.id === "customer_email"
                        ? { ...field, value: primarySignerEmail }
                        : field,
                );
            }

            const redirectUrlDocusign =
                typeof window !== "undefined"
                    ? window.location.href
                    : "https://www.docusign.com";

            const merchantContext = resolveBalanceTransferMerchantContext(
                latestContract,
                applicationData,
            );
            const docuSignClientName =
                merchantContext.clientName.trim() ||
                applicationSignerName.trim() ||
                "Client";

            const supplementalDocumentRefs = standaloneAchOnly
                ? (addendumDocuments.length
                      ? addendumDocuments.map((item) => item.documentRef)
                      : achDocumentRef
                        ? [achDocumentRef]
                        : [])
                : disclosureFirst
                  ? [
                        // Envelope order: state disclosure → main contract → addenda.
                        disclosureDocumentRef,
                        ...addendumDocuments.map((item) => item.documentRef),
                    ].filter(Boolean)
                  : [
                        // Envelope order: main contract → addenda → state disclosure.
                        ...addendumDocuments.map((item) => item.documentRef),
                        disclosureDocumentRef,
                    ].filter(Boolean);
            const mergedTemplateIdsForPrefill = supplementalDocumentRefs;
            const disclosureLeadsEnvelope =
                !standaloneAchOnly && disclosureFirst && Boolean(disclosureDocumentRef);
            const disclosureTrailsEnvelope =
                !standaloneAchOnly && !disclosureFirst && Boolean(disclosureDocumentRef);
            let supplementalDocuments: SupplementalDocumentForSend[] = (
                standaloneAchOnly && addendumDocuments.length > 0
                    ? addendumDocuments.map((item) => item.documentRef)
                    : supplementalDocumentRefs
            ).map((documentRef, index) => ({
                documentRef,
                prefillFields: prefillFieldsPayload,
                ...(disclosureLeadsEnvelope && index === 0
                    ? { position: "before_main" as const }
                    : {}),
            }));

            const firstOwnerFromDb = ownerRows[0] as {
                firstName?: string;
                lastName?: string;
                ssnNumber?: string;
                ssn?: string;
                driverLicenseNumber?: string;
                driverLicense?: string;
            } | undefined;
            const secondOwnerFromDb = ownerRows[1] as {
                firstName?: string;
                lastName?: string;
                ssnNumber?: string;
                ssn?: string;
                driverLicenseNumber?: string;
                driverLicense?: string;
            } | undefined;
            const primaryOwnerName =
                `${String(firstOwnerFromDb?.firstName || "").trim()} ${String(firstOwnerFromDb?.lastName || "").trim()}`.trim() ||
                applicationSignerName.trim() ||
                merchantContext.clientNameBy.trim() ||
                docuSignClientName;
            prefillFieldsPayload = applyPrimaryGuarantorNamesToPrefillFields(
                prefillFieldsPayload,
                primaryOwnerName,
                {
                    primarySs: String(
                        firstOwnerFromDb?.ssnNumber || firstOwnerFromDb?.ssn || "",
                    ).trim(),
                    primaryDriverLicense: String(
                        firstOwnerFromDb?.driverLicenseNumber ||
                            firstOwnerFromDb?.driverLicense ||
                            "",
                    ).trim(),
                },
            );

            const secondOwnerName =
                secondOwnerNameBeforeCollapse ||
                String(
                    roles.find((r) => /owner\s*2/i.test(String(r.signerRole || "")))?.signerName ||
                        "",
                ).trim() ||
                resolveOwnerRowFullName(secondOwnerFromDb);
            prefillFieldsPayload = applySecondOwnerNameToPrefillFields(prefillFieldsPayload, {
                ownerCount,
                secondOwnerName,
                secondOwnerSs: String(
                    secondOwnerFromDb?.ssnNumber || secondOwnerFromDb?.ssn || "",
                ).trim(),
                secondOwnerDriverLicense: String(
                    secondOwnerFromDb?.driverLicenseNumber ||
                        secondOwnerFromDb?.driverLicense ||
                        "",
                ).trim(),
            });
            prefillFieldsPayload = clearParty2PrefillFieldPayload(
                prefillFieldsPayload,
                ownerCount,
            );

            try {
                const contractNumericId = Number((latestContract as { id?: unknown })?.id);
                let multipleAchForms =
                    addendumDocuments.filter((item) =>
                        isAchAuthorizationLayoutKey(item.documentRef),
                    ).length > 1;
                const rawOverrides = (latestContract as { contractPrefillOverrides?: unknown })
                    ?.contractPrefillOverrides;
                const mainOverrides = normalizeContractPrefillOverrides(rawOverrides);
                const offerDecisionForPrefill =
                    (offerDecision as Record<string, unknown> | null) ?? null;
                const mainPrefillForTemplates = mainOverrides
                    ? (() => {
                          const o = { ...mainOverrides } as Record<string, unknown>;
                          delete o[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
                          const stripped = stripStaleOfferOverridesFromPersisted(
                              o as Partial<BuildContractPrefillFieldsArgs>,
                              offerDecisionForPrefill,
                              applicationData,
                              latestContract as Record<string, unknown>,
                          );
                          const dealMoney = contractPrefillFieldsToPartial(prefillFieldsPayload);
                          const dealMoneyOverlay: Partial<BuildContractPrefillFieldsArgs> = {};
                          for (const key of LIVE_OFFER_MONEY_PREFILL_KEYS) {
                              const v = dealMoney[key];
                              if (v != null && String(v).trim()) {
                                  (dealMoneyOverlay as Record<string, unknown>)[key] = v;
                              }
                          }
                          return applyLiveOfferSyncToPrefillPartial(
                              { ...stripped, ...dealMoneyOverlay },
                              applicationData,
                              offerDecisionForPrefill,
                              {
                                  // Prefer Verify Prefill saves; only re-seed when offer face
                                  // amount changed (scrubbing) — see applyLiveOfferSync.
                                  contract: latestContract as Record<string, unknown>,
                              },
                          );
                      })()
                    : null;
                if (Number.isFinite(contractNumericId) && mergedTemplateIdsForPrefill.length > 0) {
                    const mapRes = await axiosGet(
                        `/contract/${contractNumericId}/document-template-mappings`,
                    );
                    const mapRows = (mapRes?.data?.data ?? []) as Array<{
                        id: string;
                        documentType?: string | null;
                        template?: {
                            id?: string;
                            templateId?: string;
                            layoutKey?: string | null;
                            name?: string | null;
                            state?: string | null;
                            frequency?: string | null;
                            type?: string | null;
                        } | null;
                    }>;
                    const mergedLayoutKeysForPrefill = supplementalDocumentRefs.filter((ref) =>
                        /balance_transfer|flex_addendum|pre_payment_addendum|ach_authorization/i.test(
                            ref,
                        ),
                    );
                    const rows = Array.isArray(mapRows) ? mapRows : [];
                    const achRowCount = rows.filter(
                        (row) =>
                            String(row.documentType ?? "").toLowerCase() === "ach" ||
                            isAchAuthorizationLayoutKey(String(row.template?.layoutKey ?? "")),
                    ).length;
                    multipleAchForms = multipleAchForms || achRowCount > 1;
                    const buildInstancePrefill = (
                        documentRef: string,
                        instanceRows: typeof rows,
                    ) => {
                        const forAch =
                            isAchAuthorizationLayoutKey(documentRef) ||
                            instanceRows.some((row) =>
                                isAchMappingOrTemplate({
                                    documentType: row.documentType,
                                    layoutKey: row.template?.layoutKey,
                                    templateType: row.template?.type,
                                    templateName: row.template?.name,
                                    documentRef,
                                }),
                            );
                        return applyDocumentTemplateMappingPrefillOverrides({
                            prefillFieldsPayload: forAch
                                ? stripAchAuthorizationKeysFromPrefillFields(prefillFieldsPayload)
                                : prefillFieldsPayload,
                            mergedTemplateIds: [documentRef],
                            mergedLayoutKeys: [
                                ...mergedLayoutKeysForPrefill.filter((key) => key === documentRef),
                                // ACH addenda often arrive as UUID or funder key — still include
                                // ach_authorization layout keys so mapping rows merge.
                                ...(forAch
                                    ? mergedLayoutKeysForPrefill.filter((key) =>
                                          /ach_authorization/i.test(String(key || "")),
                                      )
                                    : []),
                                ...(forAch && isAchAuthorizationLayoutKey(documentRef)
                                    ? [documentRef]
                                    : []),
                            ],
                            templateMappingRows: instanceRows,
                            contractPrefillOverridesRaw: rawOverrides,
                            contract: latestContract as Record<string, unknown>,
                            application: applicationForPrefill as unknown as Record<string, unknown>,
                            offerDecision: offerDecisionForPrefill,
                            agreementDate: formatDate(new Date()),
                            mainPrefillOverrides: mainPrefillForTemplates,
                            allowAchAliasFallback: !multipleAchForms,
                        });
                    };

                    supplementalDocuments =
                        standaloneAchOnly && addendumDocuments.length === 0 && achDocumentRef
                            ? [
                                  {
                                      documentRef: achDocumentRef,
                                      prefillFields: buildInstancePrefill(achDocumentRef, rows),
                                  },
                              ]
                            : [
                                  // State disclosure leads the envelope (before the main contract).
                                  ...(disclosureLeadsEnvelope
                                      ? [
                                            {
                                                documentRef: disclosureDocumentRef,
                                                prefillFields: buildInstancePrefill(
                                                    disclosureDocumentRef,
                                                    rows,
                                                ),
                                                position: "before_main" as const,
                                            },
                                        ]
                                      : []),
                                  ...addendumDocuments.map((item) => ({
                                      documentRef: item.documentRef,
                                      prefillFields: buildInstancePrefill(
                                          item.documentRef,
                                          item.mappingId
                                              ? rows.filter((row) => row.id === item.mappingId)
                                              : rows,
                                      ),
                                  })),
                                  // State disclosure placed last (after contract and addenda).
                                  ...(disclosureTrailsEnvelope
                                      ? [
                                            {
                                                documentRef: disclosureDocumentRef,
                                                prefillFields: buildInstancePrefill(
                                                    disclosureDocumentRef,
                                                    rows,
                                                ),
                                            },
                                        ]
                                      : []),
                              ];
                }

                // Standalone ACH: always apply the stable ACH edit alias + camelCase overrides.
                // Platform ACH often has no contract mapping row, so the loop above skips them.
                if (standaloneAchOnly) {
                    const achBlob = parseDocumentTemplatePrefillByMappingId(rawOverrides);
                    // With several ACH forms these shared values would land on every
                    // form, so each form keeps only its own per-document prefill.
                    const achSaved = multipleAchForms
                        ? {}
                        : resolveAchSavedMappingOverrides(achBlob, null);
                    const achFromCamel = achCamelPartialToTabValues(mainPrefillForTemplates);
                    const achTabs = { ...achFromCamel, ...achSaved };
                    // Business signer-line stays canonical from contract/client legal name.
                    const signerLine = String(
                        achFromCamel.authorization_client_signer_name ?? "",
                    ).trim();
                    if (signerLine) {
                        achTabs.authorization_client_signer_name = signerLine;
                    }
                    const byId = new Map(
                        prefillFieldsPayload.map((f) => [f.id, { ...f }]),
                    );
                    for (const [id, value] of Object.entries(achTabs)) {
                        const v = String(value ?? "").trim();
                        if (!id || !v) continue;
                        const existing = byId.get(id);
                        byId.set(
                            id,
                            existing
                                ? { ...existing, value: v }
                                : { id, label: id, value: v },
                        );
                        // Also seed CRM-scoped envelope labels used after coordinate scoping.
                        const texas = /ach_authorization_texas|texas_ach/i.test(achDocumentRef);
                        const scopedId = `${texas ? "ach_form_texas_" : "ach_form_"}${id}`;
                        if (!byId.has(scopedId)) {
                            byId.set(scopedId, { id: scopedId, label: scopedId, value: v });
                        }
                    }
                    prefillFieldsPayload = Array.from(byId.values());
                }

                // Printed client + consent name must track live Signer 1 (Manage Signers /
                // ACH signer), not stale Edit ACH saves or business legal name.
                const primarySignerPersonName =
                    String(roles[0]?.signerName || "").trim() ||
                    applicationSignerName.trim();
                if (standaloneAchOnly && primarySignerPersonName) {
                    const texas = /ach_authorization_texas|texas_ach/i.test(
                        String(achDocumentRef || ""),
                    );
                    const achPrefix = texas ? "ach_form_texas_" : "ach_form_";
                    prefillFieldsPayload = applyAchSignerPersonNameToPrefillFields(
                        prefillFieldsPayload,
                        primarySignerPersonName,
                        { achPrefix },
                    );
                    supplementalDocuments = supplementalDocuments.map((doc) => {
                        if (
                            !isAchAuthorizationLayoutKey(doc.documentRef) &&
                            !/ach/i.test(String(doc.documentRef || ""))
                        ) {
                            return doc;
                        }
                        const docTexas = /ach_authorization_texas|texas_ach/i.test(
                            String(doc.documentRef || ""),
                        );
                        return {
                            ...doc,
                            prefillFields: applyAchSignerPersonNameToPrefillFields(
                                doc.prefillFields,
                                primarySignerPersonName,
                                {
                                    achPrefix: docTexas
                                        ? "ach_form_texas_"
                                        : "ach_form_",
                                },
                            ),
                        };
                    });
                }

                prefillFieldsPayload = mergeStateDisclosurePrefillFallback({
                    payload: prefillFieldsPayload,
                    supplementalRefs: supplementalDocumentRefs,
                    contract: latestContract as Record<string, unknown>,
                    application: applicationForPrefill as unknown as Record<string, unknown>,
                    offerDecision: offerDecisionForPrefill,
                    agreementDate: formatDate(new Date()),
                    mainPrefillOverrides: mainPrefillForTemplates,
                });
            } catch (mapErr) {
                console.warn("[ContractTab] document template mapping prefill skipped:", mapErr);
            }

            if (!standaloneAchOnly && includeMainContract) {
                prefillFieldsPayload = applyPrimaryGuarantorNamesToPrefillFields(
                    prefillFieldsPayload,
                    primaryOwnerName,
                    {
                        primarySs: String(
                            firstOwnerFromDb?.ssnNumber || firstOwnerFromDb?.ssn || "",
                        ).trim(),
                        primaryDriverLicense: String(
                            firstOwnerFromDb?.driverLicenseNumber ||
                                firstOwnerFromDb?.driverLicense ||
                                "",
                        ).trim(),
                    },
                );
                prefillFieldsPayload = applySecondOwnerNameToPrefillFields(prefillFieldsPayload, {
                    ownerCount,
                    secondOwnerName:
                        secondOwnerNameBeforeCollapse ||
                        String(
                            roles.find((r) => /owner\s*2/i.test(String(r.signerRole || "")))
                                ?.signerName || "",
                        ).trim() ||
                        resolveOwnerRowFullName(secondOwnerFromDb),
                    secondOwnerSs: String(
                        secondOwnerFromDb?.ssnNumber || secondOwnerFromDb?.ssn || "",
                    ).trim(),
                    secondOwnerDriverLicense: String(
                        secondOwnerFromDb?.driverLicenseNumber ||
                            secondOwnerFromDb?.driverLicense ||
                            "",
                    ).trim(),
                });
                prefillFieldsPayload = clearParty2PrefillFieldPayload(
                    prefillFieldsPayload,
                    ownerCount,
                );

                const syncedPartial = applyLiveClientIdentitySyncToPrefillPartial(
                    applySeparatedAddressPrefillFields(
                        applyClientPersonNamePrefillFields(
                            contractPrefillFieldsToPartial(prefillFieldsPayload),
                            applicationData,
                        ),
                        applicationData,
                    ),
                    applicationData,
                );
                prefillFieldsPayload = mergeSyncedPartialIntoPrefillFields(
                    prefillFieldsPayload,
                    syncedPartial,
                );

                // Do NOT rewrite contractPrefillOverrides / money columns from the
                // live-synced send payload. That merge replaced intentional Verify
                // Prefill saves with Final Calc / OD after every DocuSign send.
                // Envelope history + DocuSign meta are persisted elsewhere on send.
            }

            const contractNumericIdForSend = Number((latestContract as { id?: unknown })?.id);
            const resolvedFunderName =
                sendPayload.funderName ??
                (latestContract as { funderName?: string | null })?.funderName ??
                null;
            const contractStateForSend =
                String(sendPayload.contractState ?? "").trim() ||
                String((latestContract as { state?: string | null })?.state ?? "").trim() ||
                undefined;
            const mainContractLayoutKey =
                String(sendPayload.mainContractLayoutKey ?? "").trim() ||
                resolveLayoutKey(
                    resolvedFunderName,
                    sendPayload.funderProfileId,
                );
            const funderProfileForPrefill =
                funderProfileForSend ??
                (sendPayload.funderProfileId
                    ? findFunderById(String(sendPayload.funderProfileId).trim())
                    : null) ??
                (resolvedFunderName ? findFunder(String(resolvedFunderName).trim()) : null);
            const funderPlainName = formatFunderSelectLabel(
                funderProfileForPrefill ?? undefined,
            );
            applyFunderDisclosureContactPrefill(
                prefillFieldsPayload,
                funderProfileForPrefill,
                { funderDisplayName: funderPlainName || resolvedFunderName },
            );
            const funderNameWithDealPrefix = formatFunderNameWithDealIdPrefix(
                funderProfileForPrefill?.name ?? resolvedFunderName,
                funderProfileForPrefill?.dealIdPrefix,
                funderProfileForPrefill?.displayName,
            );
            if (funderNameWithDealPrefix) {
                const existing = prefillFieldsPayload.find(
                    (f) => f.id === "funder_name_with_deal_prefix",
                );
                if (existing) {
                    existing.value = funderNameWithDealPrefix;
                } else {
                    prefillFieldsPayload.push({
                        id: "funder_name_with_deal_prefix",
                        label: "Funder name (Deal ID prefix)",
                        value: funderNameWithDealPrefix,
                    });
                }
            }
            const caseTakeoverInPackage = (supplementalDocumentRefs || []).some((ref) =>
                /case_takeover/i.test(String(ref || "")),
            );
            if (caseTakeoverInPackage && (funderPlainName || resolvedFunderName)) {
                const selectedLabel =
                    String(funderPlainName || resolvedFunderName || "").trim();
                for (const id of ["case_takeover_addendum_funder_name", "funder_name"] as const) {
                    const existing = prefillFieldsPayload.find((f) => f.id === id);
                    if (existing) {
                        existing.value = selectedLabel;
                    } else {
                        prefillFieldsPayload.push({
                            id,
                            label: id === "funder_name" ? "Funder name" : "Funder Name",
                            value: selectedLabel,
                        });
                    }
                }
            }
            prefillFieldsPayload = applyTexasContractUsdMoneyToPrefillFields(
                prefillFieldsPayload,
                {
                    funderName:
                        funderProfileForPrefill?.name ||
                        resolvedFunderName ||
                        funderPlainName,
                    state: contractStateForSend,
                    layoutKey: mainContractLayoutKey,
                    allowedStates: funderProfileForPrefill?.allowedStates,
                },
            );
            // Supplemental prefill snapshots are built before the final owner, live-offer,
            // and selected-funder normalization above. Refresh shared identity/funder fields
            // from the final payload — but NEVER overwrite ACH form fields: each ACH
            // document keeps its own Edit ACH / mapping-blob values (fee, txn count, bank).
            if (supplementalDocuments.length > 0) {
                const finalPrefillById = new Map(
                    prefillFieldsPayload.map((field) => [field.id, field] as const),
                );
                const requiredSupplementalIds = new Set([
                    "client_name",
                    "addendum_client_name",
                    "owner1_guarantor_name",
                    "guaranty_owner1_name",
                    "guaranty_guarantor1_name",
                    "merchant2_name",
                    "owner2_guarantor_name",
                    "guaranty_owner2_name",
                    "guaranty_guarantor2_name",
                    "funder_name",
                    "funder_address",
                    "funder_phone",
                    "funder_email",
                    "deal_id_prefix",
                    "funder_name_with_deal_prefix",
                    "frequency",
                    "paymentTerms",
                ]);
                supplementalDocuments = supplementalDocuments.map((document) => {
                    const isAchDoc =
                        standaloneAchOnly ||
                        isAchAuthorizationLayoutKey(document.documentRef) ||
                        document.prefillFields.some((field) =>
                            isAchAuthorizationPrefillKey(field.id),
                        );
                    const isFlexDoc = /flex_addendum/i.test(
                        String(document.documentRef || ""),
                    );
                    const refreshed = document.prefillFields.map((field) => {
                        if (isAchDoc && isAchAuthorizationPrefillKey(field.id)) {
                            return field;
                        }
                        // Flex page 1 merchant line uses Client.businessName, not
                        // main-contract legal name (`client_legal_name`).
                        if (
                            isFlexDoc &&
                            (field.id === "client_legal_name" ||
                                field.id === "flex_addendum_merchant_legal_name")
                        ) {
                            return field;
                        }
                        const current = finalPrefillById.get(field.id);
                        const incoming = String(current?.value ?? "").trim();
                        if (!incoming) return field;
                        return { ...field, value: incoming };
                    });
                    const present = new Set(refreshed.map((field) => field.id));
                    for (const id of requiredSupplementalIds) {
                        if (present.has(id)) continue;
                        if (isAchDoc && isAchAuthorizationPrefillKey(id)) continue;
                        const current = finalPrefillById.get(id);
                        if (current?.value) refreshed.push({ ...current });
                    }
                    return { ...document, prefillFields: refreshed };
                });
            }

            // Subject / PDF name must follow Edit Prefill + Edit ACH business name,
            // not the stale Client/Overview snapshot. Build after final prefill merge.
            const envelopeNameFields = [
                ...prefillFieldsPayload,
                ...supplementalDocuments.flatMap((document) => document.prefillFields),
            ];
            const docuSignBusinessName =
                resolveBusinessNameFromPrefillFields(envelopeNameFields, {
                    // Edit ACH seller/business name must beat stale Client legal name.
                    preferAch: true,
                }) ||
                merchantContext.businessName.trim() ||
                docuSignClientName;
            const envelopeOfferAmount =
                resolveOfferAmountFromPrefillFields(envelopeNameFields) ??
                approvedAmount;
            const autoEmailSubject = standaloneAchOnly
                ? buildAchFormEnvelopeEmailSubject(
                      docuSignBusinessName,
                      envelopeOfferAmount,
                      envelopeFunderLabel,
                  )
                : sendPackageSelection
                  ? buildPackageEnvelopeEmailSubject(
                        docuSignBusinessName,
                        sendPackageSelection,
                        envelopeOfferAmount,
                        envelopeFunderLabel,
                    )
                  : buildDocuSignEnvelopeEmailSubject(
                        docuSignBusinessName,
                        envelopeOfferAmount,
                        envelopeFunderLabel,
                    );
            const requestedTitle = String(sendPayload.title || "").trim();
            const docuSignEmailSubject = requestedTitle || autoEmailSubject;
            const autoDocumentName = standaloneAchOnly
                ? buildAchFormEnvelopeDocumentName(
                      docuSignBusinessName,
                      envelopeFunderLabel,
                  )
                : buildContractEnvelopeDocumentName(docuSignEmailSubject);
            const envelopeDocumentName =
                String(sendPayload.documentName || "").trim() || autoDocumentName;
            const docuSignEmailMessage = standaloneAchOnly
                ? `Please review and sign the ACH authorization form with ${envelopeFunderLabel}.`
                : sendPackageSelection
                  ? buildPackageEnvelopeEmailMessage(
                        docuSignBusinessName,
                        sendPackageSelection,
                        envelopeFunderLabel,
                    )
                  : `Please review and sign your agreement with ${envelopeFunderLabel}.`;

            const mergeRequest = {
                ...(standaloneAchOnly
                    ? {
                          supplementalDocuments:
                              supplementalDocuments.length > 0
                                  ? supplementalDocuments
                                  : [
                                        {
                                            documentRef: achDocumentRef,
                                            prefillFields: prefillFieldsPayload,
                                        },
                                    ],
                          skipApplicationEnvelopeLink: true,
                          standaloneLinkKind: "ach",
                          includeMainContract: false,
                          funderName: resolvedFunderName
                              ? String(resolvedFunderName).trim()
                              : undefined,
                          funderProfileId: sendPayload.funderProfileId
                              ? String(sendPayload.funderProfileId).trim()
                              : undefined,
                          contractState: contractStateForSend,
                      }
                    : {
                          supplementalDocuments,
                          includeMainContract,
                          mainContractLayoutKey,
                          funderName: resolvedFunderName ? String(resolvedFunderName).trim() : undefined,
                          funderProfileId: sendPayload.funderProfileId
                              ? String(sendPayload.funderProfileId).trim()
                              : undefined,
                          contractState: contractStateForSend,
                          ...(sendPackageSelection ? { sendPackage: sendPackageSelection } : {}),
                          ...(!includeMainContract ? { skipApplicationEnvelopeLink: true } : {}),
                      }),
                ownerCount,
                roles,
                prefillFields: prefillFieldsPayload,
                applicationId: String(applicationUuid),
                contractId:
                    Number.isFinite(contractNumericIdForSend) && contractNumericIdForSend > 0
                        ? contractNumericIdForSend
                        : undefined,
                redirectUrl: redirectUrlDocusign,
                showToolbar: true,
                sendViewOption: "PreparePage",
                showSaveButton: true,
                showSendButton: true,
                showPreviewButton: true,
                showNavigationButtons: true,
                ccEmails: effectiveCcEmails,
                autoSend: options.autoSend,
                title: docuSignEmailSubject,
                documentName: envelopeDocumentName,
                message: docuSignEmailMessage,
                ...(sendPayload.forceNewEnvelope === true ? { forceNewEnvelope: true } : {}),
            };
            console.log(
                standaloneAchOnly
                    ? "[ContractTab] DocuSign layout send (standalone ACH):"
                    : "[ContractTab] DocuSign layout send (contract PDF + optional supplemental docs):",
                mergeRequest,
            );
            const sendResponse = await dispatch(
                mergeAndSendDocuSignEnvelope(mergeRequest),
            ).unwrap();
            console.log("[ContractTab] DocuSign layout send response:", sendResponse);

            const documentId =
                (sendResponse as any)?.envelopeId ||
                (sendResponse as any)?.documentId ||
                (sendResponse as any)?.data?.envelopeId ||
                (sendResponse as any)?.data?.documentId ||
                (sendResponse as any)?.id;
            const senderUrl =
                (sendResponse as any)?.sendUrl ||
                (sendResponse as any)?.data?.sendUrl ||
                (sendResponse as any)?.url;

            if (!documentId) {
                failDocuSignEnvelope("DocuSign did not return a document ID.");
            }

            if (
                !standaloneAchOnly &&
                !includeMainContract &&
                sendPackageSelection
            ) {
                const contractNumericId = Number((latestContract as { id?: unknown })?.id);
                if (Number.isFinite(contractNumericId) && contractNumericId > 0) {
                    try {
                        const prefillBase =
                            (latestContract as { contractPrefillOverrides?: unknown } | null)
                                ?.contractPrefillOverrides ?? null;
                        const contractPrefillOverrides = mergeStandalonePackageDocuSignIntoPrefill(
                            prefillBase,
                            {
                                envelopeId: String(documentId),
                                package: {
                                    includeMainContract: sendPackageSelection.includeMainContract,
                                    includeAddendum: sendPackageSelection.includeAddendum,
                                    includeDisclosure: sendPackageSelection.includeDisclosure,
                                },
                            },
                        );
                        const updated = await dispatch(
                            updateContract({
                                id: contractNumericId,
                                data: { contractPrefillOverrides },
                            }),
                        ).unwrap();
                        const payload = (updated as { data?: unknown })?.data ?? updated;
                        setFetchedContract({
                            ...(latestContract as Record<string, unknown>),
                            ...(payload as Record<string, unknown>),
                            contractPrefillOverrides,
                        });
                    } catch (persistErr) {
                        console.warn(
                            "[ContractTab] persist standalone package DocuSign failed:",
                            persistErr,
                        );
                    }
                }
            } else if (
                !standaloneAchOnly &&
                includeMainContract &&
                sendPackageSelection
            ) {
                const contractNumericId = Number((latestContract as { id?: unknown })?.id);
                if (Number.isFinite(contractNumericId) && contractNumericId > 0) {
                    try {
                        const prefillBase =
                            (latestContract as { contractPrefillOverrides?: unknown } | null)
                                ?.contractPrefillOverrides ?? null;
                        const sendSnap = buildContractSendHistoryTermsSnapshot(
                            latestContract as Record<string, unknown>,
                        );
                        const envelopeStatusEarly = String(
                            (sendResponse as { data?: { envelopeStatus?: string } })?.data
                                ?.envelopeStatus ?? "",
                        )
                            .trim()
                            .toLowerCase();
                        const autoSentEarly =
                            envelopeStatusEarly === "sent" ||
                            (sendResponse as { data?: { autoSend?: boolean } })?.data
                                ?.autoSend === true;
                        const contractPrefillOverrides = upsertContractSendHistoryTermsSnapshot(
                            mergeMainContractSendPackageIntoPrefill(prefillBase, {
                                envelopeId: String(documentId),
                                includeMainContract: sendPackageSelection.includeMainContract,
                                includeAddendum: sendPackageSelection.includeAddendum,
                                includeDisclosure: sendPackageSelection.includeDisclosure,
                                termsSnapshot: sendSnap,
                            }),
                            {
                                envelopeId: String(documentId),
                                status: autoSentEarly ? "sent" : "draft",
                                sentAt: autoSentEarly ? new Date().toISOString() : undefined,
                                termsSnapshot: sendSnap,
                                // Always capture the amounts used for this envelope (not a stale draft snap).
                                forceTermsSnapshot: true,
                            },
                        );
                        const updated = await dispatch(
                            updateContract({
                                id: contractNumericId,
                                data: { contractPrefillOverrides },
                            }),
                        ).unwrap();
                        const payload = (updated as { data?: unknown })?.data ?? updated;
                        setFetchedContract({
                            ...(latestContract as Record<string, unknown>),
                            ...(payload as Record<string, unknown>),
                            contractPrefillOverrides,
                        });
                    } catch (persistErr) {
                        console.warn(
                            "[ContractTab] persist main contract send package failed:",
                            persistErr,
                        );
                    }
                }
            }

            const envelopeStatus = (sendResponse as { data?: { envelopeStatus?: string } })
                ?.data?.envelopeStatus;
            const autoSent =
                envelopeStatus === "sent" ||
                (sendResponse as { data?: { autoSend?: boolean } })?.data?.autoSend === true;

            const recipientList = roles
                .map((r) => String(r.signerEmail || "").trim())
                .filter(Boolean)
                .join(", ");

            const contractStateRaw = String(latestContract?.state ?? "").trim();
            const mergeNote = supplementalDocumentRefs.length
                ? ` Contract${contractStateRaw ? ` (${contractStateRaw})` : ""} with ${supplementalDocumentRefs.length} supplemental document(s).`
                : "";
            const prefillApplied = (sendResponse as { data?: { prefillTabsApplied?: number } })
                ?.data?.prefillTabsApplied;
            const prefillAttempted = (sendResponse as { data?: { prefillFieldCount?: number } })
                ?.data?.prefillFieldCount;
            const prefillNote =
                prefillApplied != null && prefillApplied > 0
                    ? ` ${prefillApplied} field(s) prefilled.`
                    : "";
            if (
                prefillAttempted != null &&
                prefillAttempted > 0 &&
                (prefillApplied == null || prefillApplied === 0)
            ) {
                toast.warning(
                    "Contract sent, but DocuSign field labels did not match CRM prefill ids. Signer may need to fill fields manually. Check template Data Labels in DocuSign Admin.",
                    { autoClose: 8000 },
                );
            }

            if (!options.autoSend && !options.suppressSuccessToast) {
                toast.success(
                    recipientList
                        ? `DocuSign draft is ready.${mergeNote}${prefillNote} Signer(s): ${recipientList}.`
                        : `DocuSign draft is ready.${mergeNote}${prefillNote}`,
                );
            } else if (
                !autoSent &&
                senderUrl &&
                !options.suppressSuccessToast &&
                typeof window !== "undefined"
            ) {
                window.open(senderUrl, "_blank", "noopener,noreferrer");
                toast.success(
                    recipientList
                        ? `Draft opened in DocuSign.${mergeNote}${prefillNote} Review and click Send in DocuSign to email signers. Signer(s): ${recipientList}.`
                        : `Draft opened in DocuSign.${mergeNote}${prefillNote} Review and click Send in DocuSign to email signers.`,
                );
            } else if (autoSent) {
                toast.success(
                    recipientList
                        ? `Contract sent via DocuSign.${mergeNote}${prefillNote} Signing email sent to: ${recipientList}.`
                        : `Contract sent via DocuSign.${mergeNote}${prefillNote}`,
                );
            } else if (!senderUrl) {
                toast.success(
                    autoSent
                        ? `Contract sent via DocuSign.${mergeNote}${prefillNote}`
                        : "Envelope created, but no DocuSign review URL was returned.",
                );
            }

            return {
                envelopeId: String(documentId),
                prefillTabsApplied:
                    (sendResponse as { data?: { prefillTabsApplied?: number } })?.data
                        ?.prefillTabsApplied,
                prefillFieldCount:
                    (sendResponse as { data?: { prefillFieldCount?: number } })?.data
                        ?.prefillFieldCount,
                sendUrl: senderUrl ? String(senderUrl) : null,
            };
        } catch (error: unknown) {
            const raw =
                typeof error === "string"
                    ? error
                    : (error as { payload?: unknown })?.payload ??
                    (error as { response?: { data?: { message?: string } } })
                        ?.response?.data?.message ??
                    (error as Error)?.message ??
                    "Failed to send template via DocuSign.";
            const msg =
                typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
            if (isDocuSignMissingSignerMessage(msg)) {
                toast.success("Contract sent successfully.");
                throw new Error(msg);
            }
            if (isDocuSignSendViewOptionPageViewError(msg)) {
                toast.success("Contract generated successfully.");
                throw new Error(msg);
            }
            return failDocuSignEnvelope(msg);
        } finally {
            setCreatingEnvelope(false);
        }
    };

    const prepareDocuSignDraft = async (payload: {
        ccEmails: string[];
        addendumDocumentRef?: string | null;
        addendumBoldSignTemplateId?: string | null;
        addendumDocuments?: Array<{ mappingId: string; documentRef: string }>;
        disclosureDocumentRef?: string | null;
        disclosurePosition?: "first" | "last";
        achDocumentRef?: string | null;
        standaloneAchOnly?: boolean;
        includeMainContract?: boolean;
        sendPackage?: ContractSendPackageSelection;
        roles?: DocuSignTemplateRolePayload[];
        funderName?: string | null;
        funderProfileId?: string | null;
        contractState?: string | null;
        mainContractLayoutKey?: string | null;
        prefillFields?: Array<{ id: string; value: string }>;
        title?: string | null;
        documentName?: string | null;
        forceNewEnvelope?: boolean;
    }) => {
        const result = await runDocuSignEnvelope(payload, {
            autoSend: false,
            suppressSuccessToast: true,
        });
        const envelopeId = String(result?.envelopeId ?? "").trim();
        if (!envelopeId) {
            throw new Error("DocuSign did not return an envelope ID after creating the draft.");
        }
        if (!payload.standaloneAchOnly && payload.includeMainContract !== false) {
            const cid = Number((fetchedContract as { id?: unknown })?.id);
            if (Number.isFinite(cid) && cid > 0) {
                await persistContractFunderMeta(cid, {
                    funderName: payload.funderName,
                    state: payload.contractState,
                });
                try {
                    const raw =
                        normalizeContractPrefillOverrides(
                            (fetchedContract as { contractPrefillOverrides?: unknown })
                                ?.contractPrefillOverrides,
                        ) ?? {};
                    const main = stripDocumentTemplateBlobFromPrefillOverrides(
                        raw,
                    ) as Record<string, unknown>;
                    const sendHistory = upsertDocumentSendHistory(
                        parseDocumentSendHistory(raw),
                        {
                            envelopeId,
                            documentKind: "contract",
                            label: "Contract",
                            status: "draft",
                            updatedAt: new Date().toISOString(),
                            termsSnapshot:
                                resolveTermsSnapshotFromContractPrefill(raw, envelopeId) ??
                                buildContractSendHistoryTermsSnapshot(
                                    fetchedContract as Record<string, unknown> | null,
                                ),
                        },
                    );
                    const termsSnapshot =
                        sendHistory.find((h) => h.envelopeId === envelopeId)?.termsSnapshot ??
                        buildContractSendHistoryTermsSnapshot(
                            fetchedContract as Record<string, unknown> | null,
                        );
                    const envelopeBlob = parseDocumentTemplateEnvelopeByMappingId(raw);
                    const prefillBlob = (raw as Record<string, unknown>)[
                        DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY
                    ];
                    const contractPrefillOverrides = upsertContractSendHistoryTermsSnapshot(
                        {
                            ...pickPreservedDocuSignEnvelopeMetaFromPrefill(raw),
                            ...main,
                            ...(prefillBlob != null
                                ? {
                                      [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]:
                                          prefillBlob,
                                  }
                                : {}),
                            ...(Object.keys(envelopeBlob).length
                                ? {
                                      [DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY]:
                                          envelopeBlob,
                                  }
                                : {}),
                            [DOCUMENT_SEND_HISTORY_KEY]: sendHistory,
                        },
                        {
                            envelopeId,
                            status: "draft",
                            termsSnapshot,
                        },
                    );
                    await dispatch(
                        updateContract({
                            id: cid,
                            data: {
                                contractPrefillOverrides,
                            },
                        }),
                    ).unwrap();
                    void refreshFetchedContract();
                } catch (historyErr) {
                    console.warn("[ContractTab] contract send history save skipped:", historyErr);
                }
            }
        }
        return {
            envelopeId,
            prefillTabsApplied: result.prefillTabsApplied,
            prefillFieldCount: result.prefillFieldCount,
            sendUrl: result.sendUrl ?? null,
        };
    };

    const persistAchEnvelopeOnContract = useCallback(
        async (
            mappingId: string,
            envelopeId: string,
            status = "draft",
            funderMeta?: { funderName?: string | null; funderProfileId?: string | null } | null,
            persistOptions?: { keepDraftPriors?: boolean },
        ) => {
            const cid = selectedContractId;
            if (cid == null || !Number.isFinite(Number(cid))) return;
            const eid = String(envelopeId ?? "").trim();
            if (!eid) return;

            // Always load the latest contract row so envelope status updates cannot
            // clobber a just-saved Signer 2 (stripDocumentTemplateBlob removes overrides).
            let latestPrefill: unknown =
                (fetchedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides;
            try {
                const res = await dispatch(getByIdContract(Number(cid))).unwrap();
                const row = (res as { data?: unknown })?.data ?? res;
                if (row && typeof row === "object") {
                    setFetchedContract(row);
                    latestPrefill = (row as { contractPrefillOverrides?: unknown })
                        .contractPrefillOverrides;
                }
            } catch {
                /* fall back to in-memory fetchedContract */
            }

            const rawOverrides = normalizeContractPrefillOverrides(latestPrefill) ?? {};
            const main = stripDocumentTemplateBlobFromPrefillOverrides(
                rawOverrides,
            ) as Record<string, unknown>;
            const preservedSigners = parseContractSignerOverridesFromPrefill(rawOverrides);
            const statusTrim = String(status ?? "").trim() || "draft";
            const updatedAt = new Date().toISOString();
            const previousEnvelopeBlob = parseDocumentTemplateEnvelopeByMappingId(rawOverrides);
            const previousCapsule = parseAchAuthorizationDocuSignFromPrefill(rawOverrides);
            let sendHistory = parseDocumentSendHistory(rawOverrides);
            const funderName = String(funderMeta?.funderName ?? "").trim();
            const funderProfileId = String(funderMeta?.funderProfileId ?? "").trim();
            const funderFields = {
                ...(funderName ? { funderName } : {}),
                ...(funderProfileId ? { funderProfileId } : {}),
            };

            type PriorAch = {
                envelopeId: string;
                status: string;
                updatedAt: string;
                funderName?: string;
                funderProfileId?: string;
            };
            const priorById = new Map<string, PriorAch>();
            const rememberPriorAch = (
                envelopeId: string | null | undefined,
                status?: string | null,
                at?: string | null,
                priorFunderName?: string | null,
                priorFunderProfileId?: string | null,
            ) => {
                const id = String(envelopeId ?? "").trim();
                if (!id || id === eid) return;
                const existing = priorById.get(id);
                const nextStatus = preferNonDraftAchStatus(status, existing?.status);
                const nextFunder =
                    String(priorFunderName ?? "").trim() || existing?.funderName || "";
                const nextProfile =
                    String(priorFunderProfileId ?? "").trim() || existing?.funderProfileId || "";
                priorById.set(id, {
                    envelopeId: id,
                    status: nextStatus,
                    updatedAt: String(at ?? existing?.updatedAt ?? updatedAt),
                    ...(nextFunder ? { funderName: nextFunder } : {}),
                    ...(nextProfile ? { funderProfileId: nextProfile } : {}),
                });
            };

            rememberPriorAch(
                previousCapsule?.envelopeId,
                previousCapsule?.status,
                previousCapsule?.updatedAt ?? previousCapsule?.sentAt,
                previousCapsule?.funderName,
            );
            rememberPriorAch(
                previousEnvelopeBlob[mappingId]?.envelopeId,
                previousEnvelopeBlob[mappingId]?.status,
                previousEnvelopeBlob[mappingId]?.updatedAt,
                previousEnvelopeBlob[mappingId]?.funderName,
                previousEnvelopeBlob[mappingId]?.funderProfileId,
            );
            rememberPriorAch(
                previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.envelopeId,
                previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.status,
                previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.updatedAt,
                previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.funderName,
                previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.funderProfileId,
            );
            for (const [key, meta] of Object.entries(previousEnvelopeBlob)) {
                const envId = String(meta?.envelopeId ?? "").trim();
                if (!envId || envId === eid) continue;
                const isAchKey =
                    key === mappingId ||
                    key === ACH_PREFILL_MAPPING_ALIAS_KEY ||
                    sendHistory.some(
                        (h) =>
                            h.documentKind === "ach" &&
                            String(h.envelopeId ?? "").trim() === envId,
                    );
                if (!isAchKey) continue;
                rememberPriorAch(
                    envId,
                    meta.status,
                    meta.updatedAt,
                    meta.funderName,
                    meta.funderProfileId,
                );
            }
            for (const entry of sendHistory) {
                if (entry.documentKind !== "ach") continue;
                rememberPriorAch(
                    entry.envelopeId,
                    entry.status,
                    entry.updatedAt,
                    entry.funderName,
                    entry.funderProfileId,
                );
            }
            for (const entry of parseAchSendHistoryFromPrefill(rawOverrides)) {
                rememberPriorAch(
                    entry.envelopeId,
                    achCapsuleStatusToInternal(entry.status),
                    entry.sentAt ?? entry.archivedAt,
                    entry.funderName,
                );
            }

            let historyPrefill: Record<string, unknown> = { ...rawOverrides };
            for (const prior of priorById.values()) {
                if (!prior.status) continue;
                // New-envelope sends keep the replaced draft visible in history.
                if (
                    isAchEnvelopeDraftLikeStatus(prior.status) &&
                    persistOptions?.keepDraftPriors !== true
                ) {
                    continue;
                }
                sendHistory = upsertDocumentSendHistory(sendHistory, {
                    envelopeId: prior.envelopeId,
                    documentKind: "ach",
                    label: formatAchAuthorizationTableLabel(prior.funderName),
                    status: prior.status,
                    updatedAt: prior.updatedAt,
                    ...(prior.funderName ? { funderName: prior.funderName } : {}),
                    ...(prior.funderProfileId ? { funderProfileId: prior.funderProfileId } : {}),
                });
                historyPrefill = appendAchSendHistoryEntry(historyPrefill, {
                    envelopeId: prior.envelopeId,
                    status: mapInternalEnvelopeStatusToAchCapsule(prior.status),
                    sentAt: prior.updatedAt,
                    funderName: prior.funderName ?? null,
                });
            }

            const previousSameMeta =
                previousEnvelopeBlob[mappingId]?.envelopeId === eid
                    ? previousEnvelopeBlob[mappingId]
                    : previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]?.envelopeId === eid
                      ? previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]
                      : null;
            const envelopeMeta = {
                envelopeId: eid,
                status: statusTrim,
                updatedAt,
                ...(previousSameMeta?.funderName && !funderName
                    ? { funderName: previousSameMeta.funderName }
                    : {}),
                ...(previousSameMeta?.funderProfileId && !funderProfileId
                    ? { funderProfileId: previousSameMeta.funderProfileId }
                    : {}),
                ...funderFields,
            };
            // Persist under both the live mapping id and a stable alias so status
            // survives synthetic → DB mapping id swaps. Keep prior ACH envelopes
            // (same mapping id / alias) so Contracts Generated can list every send.
            const nextEnvelopeBlob = {
                ...previousEnvelopeBlob,
            };
            const rememberMappedAch = (
                meta: (typeof previousEnvelopeBlob)[string] | undefined,
            ) => {
                const priorId = String(meta?.envelopeId ?? "").trim();
                if (!priorId || priorId === eid) return;
                nextEnvelopeBlob[`ach_history_${priorId}`] = meta!;
            };
            rememberMappedAch(previousEnvelopeBlob[mappingId]);
            rememberMappedAch(previousEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY]);
            nextEnvelopeBlob[mappingId] = envelopeMeta;
            nextEnvelopeBlob[ACH_PREFILL_MAPPING_ALIAS_KEY] = envelopeMeta;
            if (!isAchEnvelopeDraftLikeStatus(statusTrim)) {
                sendHistory = upsertDocumentSendHistory(sendHistory, {
                    envelopeId: eid,
                    documentKind: "ach",
                    label: formatAchAuthorizationTableLabel(funderName),
                    status: statusTrim,
                    updatedAt,
                    ...funderFields,
                });
            }
            const prefillBlob = (rawOverrides as Record<string, unknown>)[
                DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY
            ];
            const priorLastAch = parseLastAchSentFunder(rawOverrides);
            const nextLastAch =
                funderName
                    ? {
                          funderName,
                          ...(funderProfileId ? { funderProfileId } : {}),
                          envelopeId: eid,
                          updatedAt,
                      }
                    : priorLastAch;

            const capsuleStatus = mapInternalEnvelopeStatusToAchCapsule(statusTrim);
            const withCapsule = mergeAchAuthorizationDocuSignIntoPrefill(
                {
                    ...main,
                    ...pickPreservedDocuSignEnvelopeMetaFromPrefill(historyPrefill),
                    ...(preservedSigners?.length
                        ? { [CONTRACT_SIGNER_OVERRIDES_KEY]: preservedSigners }
                        : {}),
                    ...(prefillBlob != null
                        ? {
                              [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: prefillBlob,
                          }
                        : {}),
                    [DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY]: nextEnvelopeBlob,
                    [DOCUMENT_SEND_HISTORY_KEY]: sendHistory,
                    ...(nextLastAch ? { [LAST_ACH_SENT_FUNDER_KEY]: nextLastAch } : {}),
                },
                {
                    envelopeId: eid,
                    status: capsuleStatus,
                    updatedAt,
                    ...(funderName ? { funderName } : {}),
                },
            );

            await dispatch(
                updateContract({
                    id: Number(cid),
                    data: {
                        contractPrefillOverrides: withCapsule,
                    },
                }),
            ).unwrap();
            await refreshFetchedContract();
        },
        [selectedContractId, fetchedContract, dispatch],
    );

    const fetchDocuSignSenderViewUrl = useCallback(
        async (
            envelopeId: string,
            ccForSync: string[],
            rolesOverride?: DocuSignTemplateRolePayload[],
        ): Promise<{ url: string | null; error: string | null }> => {
            const returnUrl =
                typeof window !== "undefined"
                    ? window.location.href
                    : "https://www.docusign.com";
            const signerEmail = getPrimaryRecipientEmail().trim();
            const funderName = String(
                (fetchedContract as { funderName?: unknown } | null)?.funderName ?? "",
            ).trim();
            const contractState = String(
                (fetchedContract as { state?: unknown } | null)?.state ?? "",
            ).trim();
            const contractIdNum = Number(selectedContractId);
            try {
                const res = await axiosPost("/docusign/sender-view", {
                    envelopeId,
                    returnUrl,
                    ccEmails: [...new Set(ccForSync.map((e) => e.trim()).filter(Boolean))],
                    ...(rolesOverride?.length ? { roles: rolesOverride } : {}),
                    ...(applicationUuid ? { applicationId: String(applicationUuid) } : {}),
                    ...(Number.isFinite(contractIdNum) && contractIdNum > 0
                        ? { contractId: contractIdNum }
                        : {}),
                    ...(funderName ? { funderName } : {}),
                    ...(contractState ? { contractState } : {}),
                    ...(signerEmail
                        ? {
                              signerEmail,
                              signerName: getPrimaryRecipientName(),
                          }
                        : {}),
                });
                const url = String((res as { data?: { url?: string } })?.data?.url ?? "").trim();
                return { url: url || null, error: null };
            } catch (err: unknown) {
                const ax = err as {
                    response?: { data?: { message?: string } };
                    message?: string;
                };
                const apiMessage = String(
                    ax?.response?.data?.message || ax?.message || "",
                ).trim();
                return { url: null, error: apiMessage || null };
            }
        },
        [applicationUuid, applicationData, fetchedContract, selectedContractId],
    );

    const fetchDocuSignSenderViewUrlWithRetry = useCallback(
        async (
            envelopeId: string,
            ccForSync: string[],
            justCreated: boolean,
            rolesOverride?: DocuSignTemplateRolePayload[],
        ): Promise<{ url: string | null; error: string | null }> => {
            const delays = justCreated
                ? DOCUSIGN_SENDER_VIEW_RETRY_DELAYS_MS.justCreated
                : DOCUSIGN_SENDER_VIEW_RETRY_DELAYS_MS.existing;
            let lastError: string | null = null;
            for (const delay of delays) {
                if (delay > 0) {
                    await new Promise((r) => setTimeout(r, delay));
                }
                const result = await fetchDocuSignSenderViewUrl(
                    envelopeId,
                    ccForSync,
                    rolesOverride,
                );
                if (result.url) return result;
                if (result.error) {
                    lastError = result.error;
                    if (isDocuSignPollingLimitError(result.error)) break;
                }
            }
            return { url: null, error: lastError };
        },
        [fetchDocuSignSenderViewUrl],
    );

    const openAchViewer = async () => {
        if (!applicationUuid) {
            toast.error("Application is required to send the ACH form.");
            return;
        }
        setPreparingAchViewer(true);
        try {
            const contractId = await ensureContractRecordForAch();
            await ensureAchTemplateLinked(contractId);
            await fetchAchTemplateMappings(contractId);
            setAchViewerOpen(true);
        } catch (error) {
            console.error("Failed to prepare ACH viewer:", error);
            const message =
                typeof error === "string"
                    ? error
                    : (error as { response?: { data?: { message?: string } }; message?: string })
                          ?.response?.data?.message ||
                      (error as { message?: string })?.message ||
                      "Could not open ACH form viewer.";
            toast.error(String(message));
        } finally {
            setPreparingAchViewer(false);
        }
    };

    const appendStructuredNote = (sectionLabel: string, payload: unknown) => {
        const existingNote = (applicationData as any)?.note ?? "";
        const serialized = JSON.stringify(payload);
        const sectionHeader = `[${sectionLabel}]`;
        if (!existingNote) {
            return `${sectionHeader}\n${serialized}`;
        }
        return `${existingNote}\n\n${sectionHeader}\n${serialized}`;
    };

    /** Editable calculation fields; disabled styling applies when read-only and values are not yet shown as the saved grid. */
    const calculationInputClass = isDark
        ? "bg-muted border-gray-700 text-gray-200"
        : "bg-white border-[#D1D5DB]";
    const contractsCardClass = isDark
        ? "rounded-xl border overflow-hidden bg-[#1F2021] border-[#374151] shadow-sm"
        : "rounded-xl border overflow-hidden bg-white border-[#E5E7EB] shadow-sm";
    const contractsHeaderClass = isDark
        ? "px-6 py-4 text-base font-semibold text-gray-100 border-b border-[#374151] bg-[#111827]"
        : "px-6 py-4 text-base font-semibold text-[#1F2937] border-b border-[#D1D5DB] bg-[#E8F0F8]";
    const tableHeaderRowClass = isDark
        ? "border-[#374151] bg-[#242526] hover:bg-[#242526]"
        : "border-[#E5E7EB] bg-[#F8FAFC] hover:bg-[#F8FAFC]";
    const tableHeaderCellClass = isDark
        ? "text-[11px] uppercase tracking-wide font-semibold text-gray-400 h-11"
        : "text-[11px] uppercase tracking-wide font-semibold text-[#687182] h-11";
    const tableRowClass = isDark
        ? "border-[#374151] hover:bg-[#2A2C2D]/60 transition-colors"
        : "border-[#EEF2F7] hover:bg-[#F8FAFC] transition-colors";
    const tableCellClass = isDark ? "text-gray-200" : "text-[#334155]";
    const statusBadgeClass = isDark
        ? "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
        : "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200";

    const isContractValuesReadOnly = isReadOnly || !isEditingContractValues;
    /** Saved grid for anyone when values are persisted (incl. Operations read-only) — avoids disabled-input fade. */
    const showSavedContractGrid = contractValuesSaved;

    const brandActionButtonClass = isDark
        ? "text-[#5AACEA] hover:bg-[#5AACEA]/10"
        : "text-[var(--brand)] hover:bg-[var(--brand)]/10";

    const renderContractSendTableRow = (row: ContractSendTableRow) => {
        const isAchRow = row.rowType === "ach";
        const isPackageRow = row.rowType === "package";
        const isNonContractDocument =
            row.documentKind === "addendum" ||
            row.documentKind === "disclosure" ||
            row.documentKind === "ach" ||
            row.documentKind === "package";
        const isSupplementalRow = isAchRow || isPackageRow || isNonContractDocument;
        const rowStatusLabel = isAchRow
            ? formatAchTableStatusLabel({
                  envelopeId: row.envelopeId,
                  status: row.achStatus,
              })
            : isPackageRow
              ? formatStandalonePackageTableStatusLabel(row.packageStatus, row.envelopeId)
              : formatContractTableStatusLabel(
                    row.contractStatus,
                    row.documentStatus,
                    Boolean(row.envelopeId),
                );
        const rowCapsuleStatus: AchAuthorizationDocuSignCapsuleStatus = isAchRow
            ? (row.achStatus ?? "DRAFT")
            : isPackageRow
              ? ((row.packageStatus ?? "DRAFT") as AchAuthorizationDocuSignCapsuleStatus)
              : contractStatusToCapsuleStatus(row.contractStatus, row.documentStatus);
        const rowFullySigned = isAchRow
            ? row.achStatus === "SIGNED"
            : isPackageRow
              ? row.packageStatus === "SIGNED"
              : isContractFullySigned(row.contractStatus, row.documentStatus);
        const rowSentParts = formatTableDateTimeParts(row.sentAt);
        const rowResentParts = row.lastResentAt
            ? formatTableDateTimeParts(row.lastResentAt)
            : null;
        const rowEnvelopeId = String(row.envelopeId ?? "").trim();
        const snap = !isSupplementalRow ? getContractSendRowTermsSnapshot(row) : null;
        // Only an unsent draft may fall back to the live CRM offer. Sent / viewed /
        // completed / voided rows must keep the frozen send-time snapshot forever.
        const statusKey = String(row.documentStatus ?? row.contractStatus ?? "")
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, "_");
        const draftLike =
            !statusKey ||
            statusKey === "draft" ||
            statusKey === "created" ||
            statusKey === "generated";
        const allowLiveTermsFallback = Boolean(row.isCurrent) && draftLike;
        const liveOfferAmount =
            fetchedContract?.offer?.offer ??
            fetchedContract?.approvedAmount ??
            fetchedContract?.program ??
            null;
        // Never use offer.totalRemit as payback — in Woodmere it is often "our remit"
        // (e.g. $125), not total repayment. Prefer Final Calc / resolveOfferPayback.
        const livePayback =
            (Number.isFinite(estimatedTotalPayment) && estimatedTotalPayment > 0
                ? estimatedTotalPayment
                : null) ??
            (Number.isFinite(paybackAmount) && paybackAmount > 0 ? paybackAmount : null) ??
            fetchedContract?.totalAmount ??
            null;
        const rowProgram =
            snap?.approvedAmount != null
                ? snap.approvedAmount
                : allowLiveTermsFallback
                  ? (liveOfferAmount ?? "—")
                  : "—";
        const rowTerm =
            snap?.term != null && String(snap.term).trim()
                ? String(snap.term)
                : snap?.contractLength != null
                  ? snap.contractLength
                  : allowLiveTermsFallback
                    ? (fetchedContract?.offer?.term ?? "—")
                    : "—";
        const rowPosition =
            snap?.position != null && String(snap.position).trim()
                ? String(snap.position)
                : allowLiveTermsFallback
                  ? "1"
                  : "—";
        const rowAdvance =
            snap?.approvedAmount != null
                ? snap.approvedAmount
                : allowLiveTermsFallback
                  ? liveOfferAmount
                  : null;
        const snapPaybackRaw =
            snap?.paybackAmount != null
                ? snap.paybackAmount
                : snap?.totalAmount != null
                  ? snap.totalAmount
                  : null;
        const snapAdvanceNum =
            typeof rowAdvance === "number" && Number.isFinite(rowAdvance)
                ? rowAdvance
                : parseMaybeNumber(
                      snap?.approvedAmount ??
                          (allowLiveTermsFallback ? liveOfferAmount : null),
                  );
        // Reject frozen snapshots that stored leverage / "our remit" instead of payback.
        const snapPaybackLooksValid =
            snapPaybackRaw != null &&
            Number.isFinite(snapPaybackRaw) &&
            (snapAdvanceNum == null || snapPaybackRaw >= snapAdvanceNum - 0.01);
        const rowPayback = snapPaybackLooksValid
            ? snapPaybackRaw
            : allowLiveTermsFallback
              ? livePayback
              : null;
        const rowPaymentAmount =
            snap?.paymentAmount != null
                ? snap.paymentAmount
                : allowLiveTermsFallback
                  ? (fetchedContract?.offer?.repayPerPeriod ??
                    contractTableMetrics.perPeriodPayment)
                  : null;
        const formatSnapRate = (value: number | null | undefined) => {
            if (value == null || !Number.isFinite(value)) return null;
            return `${value}%`;
        };
        const rowBuyRate =
            formatSnapRate(snap?.buyRate ?? null) ??
            (allowLiveTermsFallback ? contractTableMetrics.buyRate : "—");
        const rowUpsell =
            formatSnapRate(snap?.percentOfGross ?? null) ??
            (allowLiveTermsFallback ? contractTableMetrics.upsell : "—");
        const rowFactor =
            snap?.factorRate != null && Number.isFinite(snap.factorRate)
                ? String(snap.factorRate)
                : allowLiveTermsFallback
                  ? contractTableMetrics.factor
                  : "—";
        // One void control per envelope when addendum + disclosure share a package send.
        const isPrimaryVoidRowForEnvelope =
            !rowEnvelopeId ||
            contractSendTableRows.find((r) => String(r.envelopeId ?? "").trim() === rowEnvelopeId)
                ?.key === row.key;
        const rowCanVoid =
            !isReadOnly &&
            isPrimaryVoidRowForEnvelope &&
            canVoidContractSendTableRow(contractRecordForActions, row);
        const rowCanResend =
            !isReadOnly && canResendEnvelopeNotification(row);
        const isResendingRow = resendingEnvelopeRowKey === row.key;
        const rowIsVoided = isAchRow
            ? row.achStatus === "VOIDED"
            : isPackageRow
              ? row.packageStatus === "VOIDED"
              : isContractVoidedOrTerminal(row.contractStatus, row.documentStatus);
        const rowSyncError = isAchRow
            ? achSyncError
            : isPackageRow
              ? packageSyncError
              : contractSyncError;
        const isViewingRow =
            viewingSignedContract &&
            (viewingSignedEnvelopeId
                ? viewingSignedEnvelopeId === rowEnvelopeId
                : !isAchRow && !isPackageRow && row.isCurrent);

        return (
            <TableRow key={row.key} className={tableRowClass}>
                <TableCell className={tableCellClass}>
                    <span className="inline-flex items-center gap-1.5">
                        {isAchRow ? (
                            <Landmark
                                className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-300"
                                aria-hidden
                            />
                        ) : isPackageRow ? (
                            <FileText
                                className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300"
                                aria-hidden
                            />
                        ) : (
                            <FileText
                                className={`h-3.5 w-3.5 shrink-0 ${isDark ? "text-[#5AACEA]" : "text-[var(--brand)]"}`}
                                aria-hidden
                            />
                        )}
                        {row.label}
                    </span>
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : rowProgram}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : rowTerm}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : rowPosition}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : formatContractCurrency(rowAdvance)}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : formatContractCurrency(rowPayback)}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow
                        ? "—"
                        : formatContractCurrency(rowPaymentAmount)}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : rowBuyRate}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : rowUpsell}
                </TableCell>
                <TableCell className={tableCellClass}>
                    {isSupplementalRow ? "—" : rowFactor}
                </TableCell>
                <TableCell>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <span
                                className={
                                    rowEnvelopeId && rowCapsuleStatus !== "DRAFT"
                                        ? `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${achCapsuleClassName(rowCapsuleStatus)}`
                                        : statusBadgeClass
                                }
                            >
                                {rowStatusLabel}
                            </span>
                            {rowEnvelopeId ? (
                                <>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() =>
                                            void handleViewSignedContract(rowEnvelopeId)
                                        }
                                        disabled={isViewingRow}
                                        className={`h-7 w-7 shrink-0 ${brandActionButtonClass}`}
                                        title={
                                            isAchRow
                                                ? rowFullySigned
                                                    ? "View signed ACH form"
                                                    : rowIsVoided
                                                      ? "View voided ACH form"
                                                      : "View ACH form"
                                                : isPackageRow
                                                  ? rowFullySigned
                                                      ? "View signed supplemental documents"
                                                      : rowIsVoided
                                                        ? "View voided supplemental documents"
                                                        : "View supplemental documents"
                                                  : rowFullySigned
                                                    ? "View signed contract"
                                                    : rowIsVoided
                                                      ? "View voided contract"
                                                      : "View contract"
                                        }
                                    >
                                        {isViewingRow ? (
                                            <Loader2
                                                className="h-3.5 w-3.5 animate-spin"
                                                aria-hidden
                                            />
                                        ) : (
                                            <FileText className="h-3.5 w-3.5" aria-hidden />
                                        )}
                                    </Button>
                                    {row.isCurrent && !rowFullySigned && !rowIsVoided ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() =>
                                                void (isAchRow
                                                    ? refreshAchEnvelopeStatus(false, {
                                                          force: true,
                                                          envelopeId: rowEnvelopeId,
                                                      })
                                                    : isPackageRow
                                                      ? refreshPackageEnvelopeStatus(false, {
                                                            force: true,
                                                        })
                                                      : refreshContractEnvelopeStatus(false, {
                                                            force: true,
                                                        }))
                                            }
                                            disabled={refreshingSigningStatus}
                                            className={`h-7 w-7 shrink-0 ${brandActionButtonClass}`}
                                            title={
                                                isAchRow
                                                    ? "Refresh ACH status"
                                                    : isPackageRow
                                                      ? "Refresh supplemental document status"
                                                      : "Refresh contract status"
                                            }
                                        >
                                            <RefreshCw
                                                className={`h-3.5 w-3.5 ${refreshingSigningStatus ? "animate-spin" : ""}`}
                                                aria-hidden
                                            />
                                        </Button>
                                    ) : null}
                                    {rowCanResend ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => void handleResendEnvelopeRow(row)}
                                            disabled={Boolean(resendingEnvelopeRowKey)}
                                            className={`h-7 w-7 shrink-0 ${brandActionButtonClass}`}
                                            title="Resend signing email"
                                        >
                                            {isResendingRow ? (
                                                <Loader2
                                                    className="h-3.5 w-3.5 animate-spin"
                                                    aria-hidden
                                                />
                                            ) : (
                                                <Send className="h-3.5 w-3.5" aria-hidden />
                                            )}
                                        </Button>
                                    ) : null}
                                    {rowCanVoid ? (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => void handleVoidSentEnvelopeRow(row)}
                                            disabled={voidingContract}
                                            className={`h-7 w-7 shrink-0 ${isDark
                                                ? "text-red-400 hover:bg-red-500/10"
                                                : "text-red-600 hover:bg-red-50"
                                                }`}
                                            title={`Void ${row.label}`}
                                        >
                                            {voidingContract ? (
                                                <Loader2
                                                    className="h-3.5 w-3.5 animate-spin"
                                                    aria-hidden
                                                />
                                            ) : (
                                                <Ban className="h-3.5 w-3.5" aria-hidden />
                                            )}
                                        </Button>
                                    ) : null}
                                </>
                            ) : null}
                        </div>
                        {rowSyncError ? (
                            <p className="text-[10px] leading-snug text-amber-700 dark:text-amber-300">
                                {rowSyncError}
                            </p>
                        ) : null}
                    </div>
                </TableCell>
                <TableCell
                    className={`${tableCellClass} text-xs tabular-nums whitespace-nowrap`}
                >
                    <div className="flex flex-col gap-1.5">
                        <div className="flex flex-col leading-tight">
                            <span className="font-medium">{rowSentParts?.date ?? "—"}</span>
                            {rowSentParts?.time ? (
                                <span
                                    className={`text-[10px] ${
                                        isDark ? "text-gray-400" : "text-[#687182]"
                                    }`}
                                >
                                    {rowSentParts.time}
                                </span>
                            ) : null}
                        </div>
                        {rowResentParts ? (
                            <Tooltip delayDuration={200}>
                                <TooltipTrigger asChild>
                                    <div
                                        className={`flex flex-col leading-tight border-t pt-1.5 cursor-default ${
                                            isDark
                                                ? "border-amber-500/30 text-amber-300"
                                                : "border-amber-200 text-amber-900"
                                        }`}
                                    >
                                        <span className="text-[10px] font-semibold uppercase tracking-wide">
                                            Resent
                                            {row.resentCount && row.resentCount > 1
                                                ? ` · ${row.resentCount}×`
                                                : ""}
                                        </span>
                                        <span className="font-medium">{rowResentParts.date}</span>
                                        <span
                                            className={`text-[10px] ${
                                                isDark ? "text-amber-300/80" : "text-amber-800/90"
                                            }`}
                                        >
                                            {rowResentParts.time}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent
                                    side="top"
                                    className="max-w-xs px-3 py-2 text-left"
                                >
                                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                                        All resends
                                    </p>
                                    <ul className="space-y-0.5 text-xs tabular-nums">
                                        {(row.resentAtHistory?.length
                                            ? row.resentAtHistory
                                            : row.lastResentAt
                                              ? [String(row.lastResentAt)]
                                              : []
                                        )
                                            .slice()
                                            .reverse()
                                            .map((iso, index, list) => {
                                                const label =
                                                    formatDateTimeUS(iso as DateInput, "") ||
                                                    String(iso);
                                                return (
                                                    <li key={`${iso}-${index}`}>
                                                        {list.length - index}. {label}
                                                    </li>
                                                );
                                            })}
                                    </ul>
                                </TooltipContent>
                            </Tooltip>
                        ) : null}
                    </div>
                </TableCell>
            </TableRow>
        );
    };

    const calculationSummaryFields = [
        { label: "Amount Financed", value: amountFinancedInput },
        { label: "Recipient Funds", value: recipientFundsInput },
        { label: "Finance Charge", value: financeChargeInput },
        { label: "Estimated Total Payment Amount", value: estimatedTotalPaymentInput },
        { label: "Payment Total", value: paymentTotalInput },
        { label: "Estimated Monthly Cost", value: estimatedMonthlyCostInput },
        { label: "Estimated Payments", value: estimatedPaymentInput },
        { label: "Payments Terms", value: numberOfPaymentsInput },
        { label: "Frequency", value: frequencyInput },
        { label: "Estimated Term (months)", value: termLengthInput },
    ];

    const handleSaveContractValues = async () => {
        if (!applicationUuid) {
            toast.error("Cannot save contract values: missing application ID.");
            return;
        }
        setSavingContractValues(true);
        try {
            const payload: PersistedContractValues = getCurrentContractValues();
            const existingNote = String((applicationData as any)?.note || "");
            const note = upsertStructuredSection(
                existingNote,
                CONTRACT_VALUES_SECTION,
                payload,
            );
            await dispatch(
                updateApplication({
                    id: String(applicationUuid),
                    data: { note },
                }),
            ).unwrap();
            setContractValuesSaved(true);
            setIsEditingContractValues(false);
            setSavedContractValuesSnapshot(payload);
            toast.success("Contract values saved.");
        } catch (err) {
            console.error("Failed to save contract values:", err);
            toast.error("Failed to save contract values.");
        } finally {
            setSavingContractValues(false);
        }
    };

    const handleEditContractValues = () => {
        setSavedContractValuesSnapshot(getCurrentContractValues());
        setIsEditingContractValues(true);
        setContractValuesSaved(false);
    };

    const handleCancelContractValuesEdit = () => {
        if (savedContractValuesSnapshot) {
            setAmountFinancedInput(savedContractValuesSnapshot.amountFinancedInput || "");
            setRecipientFundsInput(savedContractValuesSnapshot.recipientFundsInput || "");
            setFinanceChargeInput(savedContractValuesSnapshot.financeChargeInput || "");
            setEstimatedTotalPaymentInput(
                savedContractValuesSnapshot.estimatedTotalPaymentInput || "",
            );
            setPaymentTotalInput(savedContractValuesSnapshot.paymentTotalInput || "");
            setEstimatedMonthlyCostInput(
                savedContractValuesSnapshot.estimatedMonthlyCostInput || "",
            );
            setEstimatedPaymentInput(savedContractValuesSnapshot.estimatedPaymentInput || "");
            setFrequencyInput(savedContractValuesSnapshot.frequencyInput || "");
            setNumberOfPaymentsInput(
                savedContractValuesSnapshot.numberOfPaymentsInput || "",
            );
            setTermLengthInput(savedContractValuesSnapshot.termLengthInput || "");
        }
        setIsEditingContractValues(false);
        setContractValuesSaved(true);
    };

    return (
        <div className="space-y-6">
            {/* Contract Filter Section - Light blue-grey background */}
            <div
                className={`rounded-lg border p-6 ${isDark ? "bg-[#1F2021] border-[#374151]" : "bg-[#E8F0F8] border-[#D1D5DB]"}`}
            >
                <div className="flex flex-wrap items-end justify-between gap-6">
                    <div className="flex flex-wrap items-end gap-6">

                    </div>
                    <div className="flex items-center gap-3">
                        {!isReadOnly && applicationUuid ? (
                            <Button
                                type="button"
                                onClick={() => void openAchViewer()}
                                disabled={creatingEnvelope || preparingAchViewer}
                                className="rounded-md bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer px-6 py-2 h-10 font-medium disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {preparingAchViewer ? (
                                    <span className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Opening ACH form...
                                    </span>
                                ) : (
                                    "Send ACH Form"
                                )}
                            </Button>
                        ) : null}
                        <Button
                            type="button"
                            onClick={handleGenerateContract}
                            disabled={creatingEnvelope || regeneratingContract}
                            className="rounded-md bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer  px-6 py-2 h-10 font-medium disabled:opacity-70 disabled:cursor-not-allowed"


                        >
                            {creatingEnvelope || regeneratingContract ? (
                                <span className="inline-flex items-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    {regeneratingContract
                                        ? "Reinitiating contract..."
                                        : "Generating contract..."}
                                </span>
                            ) : needsContractReinitiation ? (
                                "Regenerate Contract"
                            ) : isReadOnly || hasGeneratedContract ? (
                                "View Contract"
                            ) : (
                                "Generate Contract"
                            )}
                        </Button>

                    </div>
                </div>

            </div>

            <ReverseDisbursementScheduleSection
                contractId={selectedContractId}
                fetchedContract={
                    fetchedContract && typeof fetchedContract === "object"
                        ? (fetchedContract as Record<string, unknown>)
                        : null
                }
                readOnly={isReadOnly}
                isDark={isDark}
                onSaved={reloadFetchedContract}
            />

            {/* Final Calculations - White background */}
            <div
                className={`rounded-lg border p-6 ${isDark ? "bg-[#1F2021] border-[#374151]" : "bg-white border-[#D1D5DB]"}`}
            >
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3
                        className={`text-base font-semibold ${isDark ? "text-gray-200" : "text-[#374151]"} ${isReadOnly && !contractValuesSaved ? "opacity-70" : ""}`}
                    >
                        Final Calculation
                    </h3>
                    {!isReadOnly && !isEditingContractValues && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleEditContractValues}
                            className="h-9 px-4 bg-[image:var(--brand-gradient)] text-white hover:opacity-90 cursor-pointer"
                        >
                            Edit Values
                        </Button>
                    )}
                </div>
                {!isReadOnly && isEditingContractValues && (
                    <div className="mb-4 text-xs text-[#687182]">
                        Editing is enabled. Update values and save.
                    </div>
                )}
                {offerDecisionLoading || (offerDecision == null && termsOffersLoading) ? (
                    <p
                        className={`text-sm ${isDark ? "text-white/70" : "text-[#687182]"}`}
                    >
                        Loading…
                    </p>
                ) : showSavedContractGrid ? (
                    <div className={`border rounded-lg overflow-hidden ${isDark ? "border-[#374151]" : "border-[#D1D5DB] bg-white"}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {calculationSummaryFields.map((field) => (
                                <div
                                    key={field.label}
                                    className={`min-h-[56px] px-4 py-3 border-b md:border-r md:[&:nth-child(3n)]:border-r-0 ${isDark
                                        ? "border-[#374151] bg-[#1F2021] text-gray-200"
                                        : "border-[#E5E7EB] bg-white text-[#0F172A]"
                                        }`}
                                >
                                    <div className="flex items-center justify-between gap-3 text-sm">
                                        <span
                                            className={`shrink-0 font-normal ${isDark ? "text-gray-400" : "text-[#4B5563]"}`}
                                        >
                                            {field.label}
                                        </span>
                                        <span
                                            className={`text-right text-[15px] font-bold tabular-nums ${isDark ? "text-gray-100" : "text-[#1E3A8A]"}`}
                                        >
                                            {String(field.value || "").trim() || "—"}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div
                        className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${isReadOnly ? "[&_label]:opacity-60" : ""}`}
                    >

                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Amount Financed
                            </Label>
                            <Input
                                value={amountFinancedInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    applyFinalCalculationOfferStack("advance", e.target.value);
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Recipient Funds
                            </Label>
                            <Input
                                value={recipientFundsInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    const stripped = e.target.value.replace(/^\$\s*/, "");
                                    const formatted = formatNumberUSForInput(stripped);
                                    setRecipientFundsInput(formatted ? `$ ${formatted}` : "");
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        {/* <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Estimated Annual Percentage Rate
                            </Label>
              <Input
                value={aprInput}
                onChange={(e) => setAprInput(e.target.value)}
                className={calculationInputClass}
              />
                        </div> */}
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Finance Charge
                            </Label>
                            <Input
                                value={financeChargeInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    const stripped = e.target.value.replace(/^\$\s*/, "");
                                    const formatted = formatNumberUSForInput(stripped);
                                    const feeNum = parseNumberUS(formatted);
                                    const offerNum = parseNumberUS(amountFinancedInput);
                                    if (
                                        Number.isFinite(feeNum) &&
                                        feeNum >= 0 &&
                                        Number.isFinite(offerNum) &&
                                        offerNum > 0
                                    ) {
                                        financeChargePercentRef.current =
                                            (feeNum / offerNum) * 100;
                                    }
                                    setFinanceChargeInput(formatted ? `$ ${formatted}` : "");
                                    if (
                                        Number.isFinite(feeNum) &&
                                        Number.isFinite(offerNum) &&
                                        offerNum > 0
                                    ) {
                                        setRecipientFundsInput(
                                            formatCurrencyFull(
                                                Math.max(
                                                    0,
                                                    offerNum - feeNum - refinanceAmountForCalc,
                                                ),
                                            ),
                                        );
                                    }
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Estimated Total Payment Amount
                            </Label>
                            <Input
                                value={estimatedTotalPaymentInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    applyFinalCalculationOfferStack("payback", e.target.value);
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Payment Total
                            </Label>
                            <Input
                                value={paymentTotalInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    const stripped = e.target.value.replace(/^\$\s*/, "");
                                    const formatted = formatNumberUSForInput(stripped);
                                    setPaymentTotalInput(formatted ? `$ ${formatted}` : "");
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Estimated Monthly Cost
                            </Label>
                            <Input
                                value={estimatedMonthlyCostInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    const stripped = e.target.value.replace(/^\$\s*/, "");
                                    const formatted = formatNumberUSForInput(stripped);
                                    setEstimatedMonthlyCostInput(
                                        formatted ? `$ ${formatted}` : "",
                                    );
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Estimated Payments
                            </Label>
                            <Input
                                value={estimatedPaymentInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => {
                                    applyFinalCalculationOfferStack("daily", e.target.value);
                                }}
                                className={calculationInputClass}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Payments Terms
                            </Label>
                            <Input
                                value={numberOfPaymentsInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => setNumberOfPaymentsInput(e.target.value)}
                                className={calculationInputClass}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Frequency
                            </Label>
                            <Select
                                value={frequencyInput}
                                onValueChange={(value: string) => setFrequencyInput(value)}
                                disabled={isContractValuesReadOnly}
                            >
                                <SelectTrigger className={`w-full justify-between ${calculationInputClass}`}>
                                    <SelectValue placeholder="Select frequency" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Daily">Daily</SelectItem>
                                    <SelectItem value="Weekly">Weekly</SelectItem>
                                    <SelectItem value="Monthly">Monthly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label
                                className={`text-sm ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                            >
                                Estimated Term (months)
                            </Label>
                            <Input
                                value={termLengthInput}
                                disabled={isContractValuesReadOnly}
                                onChange={(e) => setTermLengthInput(e.target.value)}
                                className={calculationInputClass}
                            />
                        </div>

                    </div>
                )}
                {!isReadOnly && isEditingContractValues && (
                    <div className="mt-6 flex items-center justify-end gap-3">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCancelContractValuesEdit}
                            disabled={savingContractValues}
                            className="h-9 px-4"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={handleSaveContractValues}
                            disabled={savingContractValues}
                            className="h-9 px-4 bg-[image:var(--brand-gradient)] text-white hover:opacity-90"
                        >
                            {savingContractValues ? "Saving..." : "Save Values"}
                        </Button>
                    </div>
                )}
            </div>

            {/* Contracts Generated Table */}
            <div className={contractsCardClass}>
                <h3 className={contractsHeaderClass}>Contracts Generated</h3>
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow className={tableHeaderRowClass}>
                                <TableHead className={tableHeaderCellClass}>
                                    DOCUMENT
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    PROGRAM
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    EST. TERM
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    POSITIONS
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    ADVANCE
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    PAYBACK
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    PAYMENT AMOUNT
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    BUY RATE
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    UPSELL
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    FACTOR
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    STATUS
                                </TableHead>
                                <TableHead className={tableHeaderCellClass}>
                                    SENT
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {(!hasGeneratedContract && contractsForTable.length === 0) ? (
                                <TableRow className={tableRowClass}>
                                    <TableCell
                                        colSpan={11}
                                        className={`text-center py-8 ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                                    >
                                        No contracts generated yet.
                                    </TableCell>
                                </TableRow>
                            ) : contractSendTableRows.length > 0 ? (
                                contractSendTableRows.map(renderContractSendTableRow)
                            ) : hasGeneratedContract ? (
                                <TableRow className={tableRowClass}>
                                    <TableCell
                                        colSpan={11}
                                        className={`text-center py-8 ${isDark ? "text-gray-400" : "text-[#687182]"}`}
                                    >
                                        No DocuSign sends yet. Rows appear here after a
                                        contract, addendum, disclosure, or ACH form is sent
                                        (each document listed separately). Sent, viewed,
                                        signed, completed, and voided stays visible; drafts
                                        are hidden.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contractsForTable.map((offer) => (
                                    <TableRow
                                        key={offer._id}
                                        className={tableRowClass}
                                    >
                                        <TableCell className={tableCellClass}>
                                            {offer.position || "—"}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {offer.termLength ?? "—"}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            1
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {formatContractCurrency(offer.approvedAmount)}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {formatContractCurrency(offer.paybackAmount)}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {formatContractCurrency(
                                                offer.paymentAmount ??
                                                    contractTableMetrics.perPeriodPayment,
                                            )}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {offer.buyRate != null
                                                ? `${offer.buyRate}%`
                                                : contractTableMetrics.buyRate}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {offer.percentOfGross != null
                                                ? `${offer.percentOfGross}%`
                                                : contractTableMetrics.upsell}
                                        </TableCell>
                                        <TableCell className={tableCellClass}>
                                            {offer.factorRate != null
                                                ? String(offer.factorRate)
                                                : contractTableMetrics.factor}
                                        </TableCell>
                                        <TableCell>
                                            <span className={statusBadgeClass}>
                                                Generated
                                            </span>
                                        </TableCell>
                                        <TableCell className={tableCellClass}>—</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* Addendum, EPO, ACH Modals - not rendered in readOnly */}
            {!isReadOnly && (
                <>
                    <BusinessInfoModal
                        open={businessInfoModalOpen}
                        onOpenChange={setBusinessInfoModalOpen}
                        applicationId={applicationUuid}
                    />
                    <AddendumModal
                        open={addendumModalOpen}
                        onOpenChange={setAddendumModalOpen}
                        applicationId={appId}
                        onSave={async (data: AddendumEntry[]) => {
                            if (!applicationUuid) {
                                console.error("No application ID available to save Addendum");
                                toast.error("Cannot save Addendum: missing application ID.");
                                return;
                            }
                            try {
                                const note = appendStructuredNote("ADDENDUM", data);
                                await dispatch(
                                    updateApplication({ id: applicationUuid, data: { note } }),
                                ).unwrap();
                            } catch (err) {
                                console.error("Failed to save Addendum:", err);
                                toast.error("Failed to save Addendum details.");
                            }
                        }}
                    />
                    <EPOModal
                        open={epoModalOpen}
                        onOpenChange={setEPOModalOpen}
                        applicationId={appId}
                        onSave={async (data: EPOEntry[]) => {
                            if (!applicationUuid) {
                                console.error("No application ID available to save EPO");
                                toast.error("Cannot save EPO: missing application ID.");
                                return;
                            }
                            try {
                                const note = appendStructuredNote("EPO", data);
                                await dispatch(
                                    updateApplication({ id: applicationUuid, data: { note } }),
                                ).unwrap();
                            } catch (err) {
                                console.error("Failed to save EPO:", err);
                                toast.error("Failed to save EPO details.");
                            }
                        }}
                    />
                    <ACHModal
                        open={achModalOpen}
                        onOpenChange={setACHModalOpen}
                        applicationId={appId}
                        onSave={async (data: ACHEntry[]) => {
                            if (!applicationUuid) {
                                console.error("No application ID available to save ACH");
                                toast.error("Cannot save ACH: missing application ID.");
                                return;
                            }
                            try {
                                const note = appendStructuredNote("ACH", data);
                                await dispatch(
                                    updateApplication({ id: applicationUuid, data: { note } }),
                                ).unwrap();
                            } catch (err) {
                                console.error("Failed to save ACH:", err);
                                toast.error("Failed to save ACH details.");
                            }
                        }}
                    />
                    <GuarantorModal
                        open={guarantorModalOpen}
                        onOpenChange={setGuarantorModalOpen}
                        onSave={async (data: GuarantorEntry) => {
                            if (!applicationUuid) {
                                toast.error("Cannot save Guarantor: missing application ID.");
                                return;
                            }
                            try {
                                const note = appendStructuredNote("GUARANTOR", data);
                                await dispatch(updateApplication({ id: applicationUuid, data: { note } })).unwrap();
                            } catch (err) {
                                console.error("Failed to save Guarantor:", err);
                                toast.error("Failed to save Guarantor details.");
                            }
                        }}
                    />
                    <OwnerModal
                        open={ownerModalOpen}
                        onOpenChange={setOwnerModalOpen}
                        onSave={async (data: OwnerEntry) => {
                            if (!applicationUuid) {
                                toast.error("Cannot save Owner: missing application ID.");
                                return;
                            }
                            try {
                                const note = appendStructuredNote("OWNER", data);
                                await dispatch(updateApplication({ id: applicationUuid, data: { note } })).unwrap();
                            } catch (err) {
                                console.error("Failed to save Owner:", err);
                                toast.error("Failed to save Owner details.");
                            }
                        }}
                    />
                </>
            )}

            {/* Mark as Funded Button - hidden in readOnly */}
            {!isReadOnly && (
                <div className="flex justify-end">
                    <Button
                        disabled
                        variant="outline"
                        className={`px-6 ${isDark ? "border-gray-600 text-gray-400 opacity-60" : "border-gray-300 text-gray-500"}`}
                    >
                        Mark as Funded
                    </Button>
                </div>
            )}

            {/* Document Viewer for generated contract */}

            <ACHFormViewerModal
                isOpen={achViewerOpen}
                onClose={() => {
                    setAchViewerOpen(false);
                    void refreshFetchedContract();
                }}
                contractId={selectedContractId}
                applicationId={applicationUuid ? String(applicationUuid) : null}
                applicationData={applicationData}
                achMapping={effectiveAchMapping}
                achMappings={sortedAchTemplateMappings}
                contract={
                    fetchedContract && typeof fetchedContract === "object"
                        ? (fetchedContract as Record<string, unknown>)
                        : null
                }
                contractPrefillRecords={contractPrefillRecords}
                achRecordOptions={achRecordRows}
                selectedAchRecordId={selectedAchRecordId}
                onSelectedAchRecordIdChange={handleSelectedAchRecordIdChange}
                readOnly={isReadOnly}
                onContractDocumentsChanged={() => {
                    void refreshFetchedContract();
                    void fetchAchTemplateMappings();
                }}
                onPrepareDocuSignDraft={
                    isReadOnly ? undefined : (payload) => prepareDocuSignDraft(payload)
                }
                persistAchEnvelopeOnContract={persistAchEnvelopeOnContract}
                fetchDocuSignSenderViewUrlWithRetry={fetchDocuSignSenderViewUrlWithRetry}
                getSignerEmail={getPrimaryRecipientEmail}
                getSignerName={getPrimaryRecipientName}
            />

            <PDFViewerModal
                isOpen={pdfViewerOpen}
                onClose={() => {
                    setPdfViewerOpen(false);
                    setPdfViewerInitialRightPaneTab("template");
                    void refreshFetchedContract();
                }}
                onContractDocumentsChanged={() => void refreshFetchedContract()}
                fileUrl={pdfUrl}
                fileName={pdfName}
                contractId={selectedContractId}
                applicationId={applicationUuid ? String(applicationUuid) : null}
                templateId={null}
                initialRightPaneTab={pdfViewerInitialRightPaneTab}
                onPrepareDocuSignDraft={
                    isReadOnly ? undefined : (payload) => prepareDocuSignDraft(payload)
                }
            />

            <PDFViewerDocsModal
                isOpen={signedPdfPreviewOpen}
                onClose={closeSignedPdfPreview}
                fileUrl={signedPdfPreviewUrl}
                fileName={signedPdfPreviewName}
                showPrintButton
            />

        </div>
    );
}
