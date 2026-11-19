import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
    AlertCircle,
    BadgeCheck,
    Building2,
    Calculator,
    CheckCircle2,
    Clock,
    Download,
    Eye,
    FileSignature,
    FileText,
    Info,
    Landmark,
    Layers,
    Loader2,
    Mail,
    MapPin,
    MoreVertical,
    Pencil,
    Plus,
    RefreshCw,
    ScrollText,
    Send,
    Trash2,
    UploadCloud,
    User,

    X,
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useDispatch, useSelector } from "react-redux";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { SearchableStateSelect, pickUsStateForSelect } from "@/components/ui/searchable-state-select";
import {
    funderNamesForContractState,
    findFunderProfile,
    normalizeLegacyFunderName,
    pickFunderForSelect,
} from "@/constants/contractFunder";
import {
    funderAvailableForContractState,
    funderNamesEquivalent,
    formatFunderSelectLabel,
    findFunderProfileById,
    isTexasContractState,
    isTexasFundingGroupFunderProfile,
    isWoodmereFunderProfile,
    persistedFunderProfileIdForApi,
    useFunderProfiles,
} from "@/hooks/useFunderProfiles";
import { fetchLatestContractTemplate } from "@/utils/contractTemplate";
import { replaceLegacyBrandInDisplayName } from "@/constants/appBranding";
import { resolveDocumentPreview } from "@/lib/documentPreview";
import {
    resolveAddendumDocumentsLayoutFunderId,
    resolveDisclosureDocumentsLayoutFunderId,
} from "@/utils/funderDocumentSource";
import {
    funderDisclosureLayoutKeyForState,
    isPlatformScopedBoldSignTemplateRow,
} from "@/utils/funderLayoutKeys";
import { fetchMainContractTemplatePreview } from "./contractdata/contractTemplatePreview";
import { fetchDocuSignTemplateIdForFunder } from "@/utils/contractDocuSignTemplate";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    getAllACH,
    getAllAddendum,
    getAllContractGuarantors,
    getAllContractOwners,
    getAllEPO,
    createACH,
    updateACH,
    createAddendum,
    updateAddendum,
    createEPO,
    updateEPO,
    createContractOwner,
    updateContractOwner,
    createContractGuarantor,
    updateContractGuarantor,
    // deleteACH,
    // deleteEPO,
    // deleteAddendum,
    // deleteContractGuarantor,
    deleteUploadedContractDocument,
    getBoldSignTemplates,
    getUploadedContractDocumentById,
    getUploadedContractDocuments,
    uploadContractDocuments,
    updateUploadedContractDocument,
    updateContract,
    getByApplicationIdContract,
    getByIdContract,
    syncKycPrefillToContract,
    type UpdateContractData,
} from "@/redux/actions/contractActions";
import { getBankDetails } from "@/redux/actions/bankDetailActions";
import { getDocumentRequestsByApplication, removeDocumentRequest } from "@/redux/actions/notificationActions";
import { toast } from "react-toastify";
import {
    buildContractPrefillFieldsFromApplication,
    contractPrefillToContractColumnUpdate,
    mergeContractPrefillOverrideLayers,
    categorizeDealReviewPrefillFieldId,
    dealReviewPrefillSubsection,
    overlaySavedAppendixFeeOnPrefillFields,
    prepareDealReviewPrefillDisplay,
    applyTexasContractUsdMoneyToPrefillFields,
    CONTRACT_PREFILL_OVERRIDES_SECTION,
    getApplicationPrimaryRecipientName,
    resolveContractBusinessLegalNameForPrefill,
    resolveEffectiveDocuSignSignerEmail,
    normalizeContractPrefillOverrides,
    parseNoteStructuredSection,
    clientIdentityPrefillFingerprint,
    stripStaleOfferOverridesFromPersisted,
    applyLiveOfferSyncToPrefillPartial,
    applyLiveClientIdentitySyncToPrefillPartial,
    contractPrefillFieldsToPartial,
    LIVE_OFFER_MONEY_PREFILL_KEYS,
    type BuildContractPrefillFieldsArgs,
    type ContractPrefillContractRecords,
    type ContractPrefillField,
} from "./contractdata/Contract";
import {
    applyKycPanelsToAchEntries,
    applyKycPanelsToGuarantorEntries,
    applyKycPanelsToOwnerEntries,
    mergeKycExtractionIntoPrefill,
    parseKycExtractionsFromUploadResponse,
    finalizeKycExtractionForSync,
    kycExtractionHasReadableFields,
    type KycExtractionResult,
} from "./contractdata/kycDocumentPrefill";
import KycExtractionReviewCard from "./contractdata/KycExtractionReviewCard";
import { cn, formatDate, formatDateTimeUS } from "@/lib/utils";
import { findApplicationFileForDocumentRequest } from "@/lib/documentRequestMatch";
import { normalizeRoleKey } from "@/lib/sessionRole";
import { isApplicationUuid } from "@/lib/paymentDealApplicationId";
import RequestMissingDocumentsModal from "./RequestMissingDocumentsModal";
import RequestedDocumentUploadRows, {
    getRequestedDocumentLabel,
} from "./RequestedDocumentUploadRows";
import {
    uploadApplicationDocuments,
    getApplicationById,
} from "@/redux/actions/applicationActions";
import { resolveOfferDecisionFeesDisplayDollars } from "@/lib/offerDecisionFees";
import {
    resolveApplicationUuidForUpdate,
    syncContractPrefillToSourceRecords,
} from "./contractdata/contractPrefillSourceSync";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** Primary DocuSign actions in the contract modal footer (matches Review & send / Done). */
const DOCUSIGN_PRIMARY_BTN_CLASS =
    "h-9 shrink-0 cursor-pointer border-0 bg-[image:var(--brand-gradient)] px-6 text-white shadow-sm hover:opacity-90 focus-visible:ring-[var(--brand)]/40";
import {
    voidBoldSignDocument,
} from "@/redux/actions/boldSignActions";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import {
    OFFER_DECISION_UPDATED_EVENT,
    offerDecisionUpdateMatchesApplication,
} from "@/lib/offerDecisionSync";
import {
    CONTRACT_PREFILL_UPDATED_EVENT,
    contractPrefillUpdateMatchesApplication,
} from "@/lib/contractPrefillSync";
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
import { ContractPrefillEditForm } from "./contractdata/ContractPrefillEditForm";
import { ExhibitACompaniesSummarySection } from "./contractdata/ExhibitACompaniesSummarySection";
import { TemplateMappingPrefillEditDialog } from "./contractdata/TemplateMappingPrefillEditDialog";
import { DisclosureCalculationModal } from "./contractdata/DisclosureCalculationModal";
import { SpaCalculationModal } from "./contractdata/SpaCalculationModal";
import { persistCalculatedPurchasePercent } from "./contractdata/spaPrefillSync";
import {
    buildDisclosureCalculatorInputsFromSources,
    extractMonthlyRevenuesFromBankAnalyses,
} from "./contractdata/disclosureAprCalculator";
import { mapDisclosureMetricsToEditorFieldOverrides } from "./contractdata/disclosureEditorFields";
import { applyFunderDisclosureContactPrefill } from "./contractdata/funderDisclosureContact";
import { formatFunderNameWithDealIdPrefix } from "./contractdata/BALANCE_TRANSFER_SHEET_ADDENDUM";
import {
    applyDocumentTemplateMappingPrefillOverrides,
    buildExpandedDisclosurePrefillFieldsForMapping,
    DOCUMENT_SEND_HISTORY_KEY,
    DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY,
    DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY,
    hasAddendumPrefillFieldMap,
    mergeExpandedDisclosurePrefillIntoPayload,
    parseDocumentSendHistory,
    parseDocumentTemplateEnvelopeByMappingId,
    parseDocumentTemplatePrefillByMappingId,
    stripDocumentTemplateBlobFromPrefillOverrides,
    upsertDocumentSendHistory,
    usesCoordinateLayoutTemplate,
} from "./contractdata/documentTemplateMappingPrefill";
import {
    docuSignPrefillSyncToast,
    patchDocuSignPrefillFields,
} from "./contractdata/syncDocuSignPrefillFields";
import {
    DOCUSIGN_CRM_STATUS_POLL_MS,
    DOCUSIGN_STATUS_SYNC_MIN_INTERVAL_MS,
    DOCUSIGN_WEBHOOK_STALE_MS,
    isDocuSignPollingLimitError,
    markDocuSignEnvelopeTerminal,
    shouldFallbackPollDocuSign,
} from "./contractdata/docusignPolling";
import { useContractSigningStatusRealtime } from "@/hooks/useContractSigningStatusRealtime";
import {
    CONTRACT_ADDENDUM_DOCUMENT_OPTIONS,
    getPlatformSignerRoleRows,
    isPlatformLayoutKey,
    PLATFORM_LAYOUT_KEYS,
    PLATFORM_PRIMARY_SIGNER_ROLE,
    supplementalOptionLabel,
} from "./contractdata/platformDocumentConfig";
import {
    contractSendPackageFingerprint,
    canSendWithoutMainContract,
    resolveEffectiveSendPackage,
    validateContractSendPackage,
    type ContractSendPackageSelection,
} from "./contractdata/contractSendPackage";
import {
    buildContractSendTableRows,
    buildContractSendHistoryTermsSnapshot,
    canVoidContractSendTableRow,
    getContractSendTableRowStatusLabel,
    isContractSendTableRowFullySigned,
    pickPreservedDocuSignEnvelopeMetaFromPrefill,
    resolveContractSendRowFunderAuth,
    resolveTermsSnapshotFromContractPrefill,
    upsertContractSendHistoryTermsSnapshot,
    type ContractSendTableRow,
} from "./contractdata/contractSendHistory";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DEFAULT_DOCUSIGN_TEMPLATE_ID,
    DOCUSIGN_EMAIL_SUBJECT_MAX_LEN,
    buildContractEnvelopeDocumentName,
    buildContractEnvelopeEmailSubject,
    toEnvelopeSubjectUppercase,
} from "./contractdata/docusignTemplateConfig";
import { resolveBusinessNameFromPrefillFields } from "./contractdata/resolveBusinessNameFromPrefillFields";
import { resolveOfferAmountFromPrefillFields } from "./contractdata/resolveOfferAmountFromPrefillFields";
import {
    getTemplateRoleEmailFromRow,
    getTemplateRoleLabel,
    getTemplateRoleNameFromRow,
    buildBoldSignRolesFromTemplateRecipients,
    buildContractPartySignerRows,
    buildDocuSignRolesFromEditorRows,
    buildSignerEditorRows,
    contractSignerOverridesFingerprint,
    mergeContractPrefillWithSignerOverrides,
    mergeApplicationDataIntoSignerRoles,
    mergeLivePartiesIntoSavedSignerOverrides,
    parseBoldSignTemplateRolesFromRecipientsPayload,
    parseContractSignerOverridesFromPrefill,
    CONTRACT_SIGNER_OVERRIDES_KEY,
    validateDocuSignSignerRoles,
    type ContractSignerOverrideRow,
    type DocuSignTemplateRolePayload,
} from "./contractdata/templateRecipients";
import { resolveActiveOwnerCount, clearParty2PrefillFieldPayload, collapseDocuSignRolesToSignerSlots, applyPrimaryGuarantorNamesToPrefillFields, applySecondOwnerNameToPrefillFields, resolveOwnerRowFullName, resolveSecondOwnerSignerName } from "./contractdata/contractPartyCounts";
import { resolveOwnerRowsForContractPrefill, applicationWithClientOwners, syncContractSignerRowsToCrm } from "./contractdata/contractSignerOwnersSync";
import { useApplicationClientOwners } from "@/hooks/useApplicationClientOwners";
import {
    boldSignTemplateIsPreviewable,
    getAddendumDropdownRef,
    loadBoldSignTemplatePdfBlob,
} from "./contractdata/boldSignTemplateDocument";
import {
    resolvePackageAddendumDocumentRef,
} from "./contractdata/achFunderDocumentRef";
import { axiosDelete, axiosGet, axiosPost, axiosPut } from "@/redux/axios";
import { AddendumSendOrderBoard } from "./AddendumSendOrderBoard";
import LockedCcChips from "./LockedCcChips";

/** Fingerprint of saved prefill + live offer money — patch open DocuSign draft when either changes. */
function docuSignPrefillDraftFingerprint(input: {
    contractPrefillOverrides: Partial<BuildContractPrefillFieldsArgs> | null;
    documentTemplatePrefillByMappingId: Record<string, Record<string, string>>;
    offerDecisionMoneyKey?: string | null;
    clientIdentityKey?: string | null;
}): string {
    return JSON.stringify({
        o: input.contractPrefillOverrides ?? null,
        d: input.documentTemplatePrefillByMappingId ?? {},
        od: input.offerDecisionMoneyKey ?? "",
        ci: input.clientIdentityKey ?? "",
    });
}

function offerDecisionMoneyFingerprint(od: Record<string, unknown> | null | undefined): string {
    if (!od || typeof od !== "object") return "";
    return [
        od.offer,
        od.approvedAmount,
        od.rate,
        od.term,
        od.termLength,
        od.frequency,
        od.repayPerPeriod,
        od.paymentAmount,
        od.totalRemit,
        od.fees,
        od.numberOfPayments,
        od.paymentsTerms,
        od.monthlyPayment,
        od.ourRemit,
        od.refinanceAmount,
        od.commissionAmount,
        od.updatedAt,
    ]
        .map((v) => String(v ?? ""))
        .join("|");
}

const DOCUSIGN_SENDER_VIEW_RETRY_DELAYS_MS = {
    /** Reused envelope — sender view is usually ready immediately. */
    existing: [0, 800, 1600, 2600],
    /** New envelope — try immediately; short backoff only if the first view call fails. */
    justCreated: [0, 800, 1600, 2600],
} as const;

/**
 * Open DocuSign in a new tab. Do not pass `noopener` on open — it returns `null` even when
 * the tab opened, which wrongly triggered the pop-up-blocked fallback and a second button.
 */
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

function resolveDealStateFromApplication(applicationData: unknown): string {
    const ad = applicationData as Record<string, unknown> | null | undefined;
    if (!ad || typeof ad !== "object") return "";
    const bi0 = Array.isArray(ad.businessInfo)
        ? (ad.businessInfo[0] as Record<string, unknown>)
        : undefined;
    const client = ad.client as Record<string, unknown> | undefined;
    const biz = (client?.business ?? {}) as Record<string, unknown>;
    const addr = (biz.address ?? {}) as Record<string, unknown>;
    return pickUsStateForSelect(
        addr.state ?? client?.businessState ?? client?.state ?? bi0?.state,
    );
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

interface PDFViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called after contract / ACH DocuSign envelope metadata is saved on the contract row. */
    onContractDocumentsChanged?: () => void;
    fileUrl: string | null;
    fileName?: string;
    contractId?: number | null;
    applicationId?: string | null;
    layout?: "contract";
    /** Create DocuSign draft (prefill, do not email signers). */
    onPrepareDocuSignDraft?: (payload: {
        ccEmails: string[];
        addendumDocumentRef?: string | null;
        addendumBoldSignTemplateId?: string | null;
        /** Ordered addendum mapping instances; duplicate templates are allowed. */
        addendumDocuments?: Array<{ mappingId: string; documentRef: string }>;
        /** CRM BoldSignTemplate row id (state disclosure) merged after addendum. */
        disclosureDocumentRef?: string | null;
        /** "first" = before main contract; "last" = after contract and addenda. */
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
        /** Current Deal Review values — always applied on each Review & send open. */
        prefillFields?: Array<{ id: string; value: string }>;
        title?: string | null;
        documentName?: string | null;
        /** "Create in new envelope" — never reuse / update the linked envelope. */
        forceNewEnvelope?: boolean;
    }) => void | Promise<
        void | {
            envelopeId?: string;
            prefillTabsApplied?: number;
            prefillFieldCount?: number;
            sendUrl?: string | null;
        }
    >;
    prefillFieldsPreview?: Array<{ id: string; label?: string; value: string }>;
    // Backward compatibility while migrating existing callers.
    onSendToDocusign?: (ccEmails: string[]) => void;
    templateId?: string | null;
    initialRightPaneTab?: "template" | "prefilled";
}

type ContractDocumentTemplateMappingRow = {
    id: string;
    contractId: number;
    templateId: string;
    documentType: string;
    order: number;
    createdAt?: string;
    template?: {
        id: string;
        name?: string;
        type?: string;
        state?: string | null;
        templateId?: string;
        pdfUrl?: string;
        layoutKey?: string;
    } | null;
};

type InfoPanelId = "addendum" | "ach" | "epo" | "owner" | "guarantor";

function isDisclosureMappingRow(row: ContractDocumentTemplateMappingRow): boolean {
    return String(row.documentType || "").toLowerCase() === "disclosure";
}

function normalizeStateForTemplateLookup(state: string): string {
    return String(state ?? "").trim().toLowerCase();
}

function normalizeFrequencyForTemplateLookup(frequency: string): string {
    const f = String(frequency ?? "").trim().toLowerCase();
    if (f.startsWith("week")) return "weekly";
    if (f.startsWith("day")) return "daily";
    if (f.startsWith("month")) return "monthly";
    return f || "daily";
}

function formatDisclosureTemplateLabel(row: ContractDocumentTemplateMappingRow | null): string {
    if (!row) return "State disclosure";
    const name = String(row.template?.name ?? "").trim();
    if (name) {
        const noExt = name.replace(/\.pdf$/i, "");
        return noExt
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    }
    const state = String(row.template?.state ?? "").trim();
    if (state) {
        return state
            .split(/[\s_]+/)
            .filter(Boolean)
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(" ");
    }
    return "State disclosure";
}

function mappingTemplateRowId(
    row: Pick<ContractDocumentTemplateMappingRow, "template" | "templateId"> | null | undefined,
): string {
    return String(row?.template?.id ?? row?.templateId ?? "").trim();
}

function mappingMatchesTemplateRef(
    row: ContractDocumentTemplateMappingRow,
    templateRef: string,
): boolean {
    const ref = String(templateRef || "").trim();
    if (!ref) return false;
    const layoutKey = String(row.template?.layoutKey ?? "").trim();
    const templateId = String(row.template?.templateId ?? "").trim();
    const rowId = mappingTemplateRowId(row);
    return ref === layoutKey || ref === templateId || ref === rowId;
}

function disclosureMappingMatchesState(
    row: ContractDocumentTemplateMappingRow | null | undefined,
    state: string,
): boolean {
    if (!row) return false;
    const picked = normalizeStateForTemplateLookup(pickUsStateForSelect(state));
    if (!picked) return false;
    const templateState = normalizeStateForTemplateLookup(row.template?.state ?? "");
    return Boolean(templateState) && templateState === picked;
}

function templateLayoutKeyToken(template: {
    layoutKey?: string | null;
    templateId?: string | null;
} | null | undefined): string {
    return String(template?.layoutKey ?? template?.templateId ?? "")
        .trim()
        .toLowerCase();
}

/** True when template is an addendum (including ACH) for the contract addendum picker. */
function isContractAddendumTemplateRow(template: {
    type?: string | null;
    name?: string | null;
    title?: string | null;
    templateName?: string | null;
    layoutKey?: string | null;
    templateId?: string | null;
} | null | undefined): boolean {
    if (!template) return false;
    const key = templateLayoutKeyToken(template);
    const typeText = String(template.type || "").toLowerCase();
    const nameText = String(
        template.name || template.title || template.templateName || "",
    ).toLowerCase();
    // ACH may attach with the contract like other addenda (standalone ACH modal stays separate).
    if (
        key.includes("ach_authorization") ||
        typeText === "ach" ||
        typeText === "ach_authorization" ||
        (nameText.includes("ach") && nameText.includes("authorization"))
    ) {
        return true;
    }
    if (
        key === "flex_addendum" ||
        key === "pre_payment_addendum" ||
        key === "balance_transfer" ||
        key === "case_takeover_addendum" ||
        key === "case_takeover_balance_transfer" ||
        key.endsWith("_flex_addendum") ||
        key.endsWith("_pre_payment_addendum") ||
        key.endsWith("_case_takeover_addendum") ||
        key.endsWith("_case_takeover_balance_transfer") ||
        key.endsWith("_balance_transfer") ||
        key.includes("_addendum_") ||
        key.endsWith("_addendum")
    ) {
        return true;
    }
    return (
        typeText.includes("addendum") ||
        typeText === "flex_addendum" ||
        typeText === "pre_payment_addendum" ||
        typeText === "balance_transfer" ||
        typeText === "case_takeover_addendum" ||
        typeText === "case_takeover_balance_transfer" ||
        nameText.includes("addendum") ||
        nameText.includes("balance transfer") ||
        nameText.includes("case takeover")
    );
}

/**
 * Platform / Woodmere (`documentsSource: platform`) → non-`funder_` templates.
 * Own / shared → only `funder_{docsFunderId}_…` templates.
 */
function templateMatchesFunderDocuments(
    template: {
        layoutKey?: string | null;
        templateId?: string | null;
    } | null | undefined,
    docsLayoutFunderId: string | null,
): boolean {
    const key = templateLayoutKeyToken(template);
    if (docsLayoutFunderId) {
        const prefix = `funder_${String(docsLayoutFunderId).trim()}_`.toLowerCase();
        return key.startsWith(prefix);
    }
    return isPlatformScopedBoldSignTemplateRow({ layoutKey: key || null });
}

/** Whether an addendum dropdown ref is valid for the funder's current docs source scope. */
function isAddendumRefValidForDocsFunder(
    ref: string,
    docsLayoutFunderId: string | null,
    templates: Array<{
        layoutKey?: string | null;
        templateId?: string | null;
        type?: string | null;
        name?: string | null;
    }>,
): boolean {
    const trimmed = String(ref || "").trim();
    if (!trimmed) return false;
    const inDb = templates.some(
        (t) =>
            isContractAddendumTemplateRow(t) &&
            templateMatchesFunderDocuments(t, docsLayoutFunderId) &&
            getAddendumDropdownRef(t) === trimmed,
    );
    if (inDb) return true;
    // Platform defaults expose synthetic Flex / Pre-Payment / BT keys (not Case Takeover).
    if (!docsLayoutFunderId) {
        return CONTRACT_ADDENDUM_DOCUMENT_OPTIONS.some(
            (opt) =>
                opt.layoutKey !== PLATFORM_LAYOUT_KEYS.caseTakeoverAddendum &&
                opt.layoutKey === trimmed,
        );
    }
    return false;
}

function disclosureMappingMatchesFunderDocuments(
    row: ContractDocumentTemplateMappingRow | null | undefined,
    docsLayoutFunderId: string | null,
): boolean {
    if (!row) return false;
    return templateMatchesFunderDocuments(row.template, docsLayoutFunderId);
}

function pickDisclosureTemplateIdForFunder(
    rows: Array<{
        id?: string;
        pdfUrl?: string | null;
        layoutKey?: string | null;
        templateId?: string | null;
    }>,
    docsLayoutFunderId: string | null,
    state: string,
    frequency: string,
): string | null {
    const withPdf = rows.filter((row) => String(row?.pdfUrl ?? "").trim());
    if (!withPdf.length) return null;

    if (docsLayoutFunderId) {
        const prefix = `funder_${String(docsLayoutFunderId).trim()}_`.toLowerCase();
        const exactKey = funderDisclosureLayoutKeyForState(
            docsLayoutFunderId,
            state,
            frequency,
        ).toLowerCase();
        const scoped = withPdf.filter((row) => {
            const key = templateLayoutKeyToken(row);
            return key.startsWith(prefix) && key.includes("disclosure");
        });
        const exact = scoped.find(
            (row) => templateLayoutKeyToken(row) === exactKey,
        );
        const match = exact ?? scoped[0];
        return match?.id ? String(match.id) : null;
    }

    const platform = withPdf.find((row) =>
        isPlatformScopedBoldSignTemplateRow(row),
    );
    return platform?.id ? String(platform.id) : null;
}

function toUsDateDisplay(value: string): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) return raw;
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const yyyy = raw.slice(0, 4);
        const mm = raw.slice(5, 7);
        const dd = raw.slice(8, 10);
        return `${mm}/${dd}/${yyyy}`;
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
    }).format(d);
}

function toUsMoneyDisplay(value: string): string {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (raw.startsWith("$")) return raw;
    const n = Number(raw.replace(/[$,%\s,]/g, ""));
    if (!Number.isFinite(n)) return raw;
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

/** Server-side field encryption envelope (CRM stored sensitive bank fields). */
function isProbablyEncryptedStoredValue(raw: string): boolean {
    return raw.startsWith("enc:v1:") || raw.startsWith("enc:v2:");
}

/**
 * Deal Review / BoldSign preview should not leak ciphertext; show placeholders for ACH-style fields.
 * (Real decryption stays on the backend when needed.)
 */
function placeholderForEncryptedBankField(fieldKey: string, rawEncrypted: string): string | null {
    if (!isProbablyEncryptedStoredValue(rawEncrypted)) return null;
    const k = fieldKey.toLowerCase().replace(/\s+/g, "_");
    // Skip obvious non-numeric ACH labels (still encrypted in DB occasionally).
    if (/\b(holder|merchant|dba|signatory|name|ein|tax|business|authorization_application)\b/i.test(fieldKey)) {
        return null;
    }
    if (k.includes("routing")) return "1234567809";
    if (
        (k.includes("account") || k.includes("_acct") || k.includes("acct_")) &&
        (k.includes("bank") || k.includes("checking") || k.includes("deposit"))
    ) {
        return "1234567890";
    }
    // Plain ids like camelCase routingNumber / accountNumber on ACH rows (if surfaced as encrypted later).
    if (k === "routingnumber" || k.endsWith("_routingnumber") || k.endsWith("_routing_number")) return "1234567809";
    if (k === "accountnumber" || k.endsWith("_accountnumber") || k.endsWith("_account_number")) return "1234567890";

    return null;
}

function formatDisplayValueForUs(fieldKey: string, value: unknown): string {
    if (value === null || value === undefined) return "—";
    const s = String(value).trim();
    if (!s) return "—";

    const ph = placeholderForEncryptedBankField(fieldKey, s);
    if (ph !== null) return ph;
    const key = fieldKey.toLowerCase();

    if (key.includes("date")) {
        return toUsDateDisplay(s);
    }

    const moneyLike =
        key.includes("amount") ||
        key.includes("price") ||
        key.includes("fees") ||
        key.includes("remit") ||
        key.includes("commission") ||
        key.includes("offer") ||
        key.includes("payment") ||
        key.includes("netfund") ||
        key.includes("net_fund");
    const notMoneyLike = key.includes("percent") || key.includes("rate");
    if (moneyLike && !notMoneyLike) {
        return toUsMoneyDisplay(s);
    }

    return s;
}

function formatOfferDecisionCell(label: string, value: unknown): string {
    return formatDisplayValueForUs(label, value);
}

function formatContractSigningStatusLabel(raw: unknown): string {
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
    if (!k) return "Loading…";
    return k
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isContractStatusAtLeastSent(raw: unknown): boolean {
    const k = String(raw ?? "").trim().toUpperCase();
    return ["SENT", "VIEWED", "SIGNED", "COMPLETED", "DECLINED", "REVOKED", "EXPIRED"].includes(k);
}

function pickContractEnvelopeDocument(contract: Record<string, unknown> | null | undefined) {
    const app = contract && (contract as any).application;
    const doc = app && typeof app === "object" ? (app as any).document : null;
    if (doc && typeof doc === "object") return doc as Record<string, unknown>;
    return null;
}

const DOCUSIGN_DOC_DRAFT_STATUSES = new Set(["draft", "created"]);

const DOCUSIGN_DOC_SENT_STATUSES = new Set([
    "sent",
    "viewed",
    "signed",
    "completed",
    "delivered",
    "declined",
    "revoked",
    "expired",
]);

/**
 * True only when signers were emailed / contract left draft — not when a DocuSign draft exists.
 */
function isContractAlreadySent(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt: Date | null,
): boolean {
    if (sessionSentAt) return true;
    const doc = pickContractEnvelopeDocument(contract);
    if (doc?.sentAt) return true;
    if (doc?.envelopeId) {
        const docStatus = String(doc.status ?? "").trim().toLowerCase();
        if (DOCUSIGN_DOC_DRAFT_STATUSES.has(docStatus)) {
            /**
             * Document row can lag after send while Contract.status / send history already show Sent
             * (Contracts Generated table). Backend only bumps Contract.status for the primary envelope.
             */
            if (isContractStatusAtLeastSent(contract?.status)) return true;
            return false;
        }
        if (DOCUSIGN_DOC_SENT_STATUSES.has(docStatus)) return true;
        return false;
    }
    return isContractStatusAtLeastSent(contract?.status);
}

/** Cache bust suffix — only draft / sent / completed (ignore viewed, delivered, etc.). */
function getDocuSignPdfCacheSuffix(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt: Date | null,
): string {
    const doc = pickContractEnvelopeDocument(contract);
    const contractStatus = String(contract?.status ?? "").trim().toLowerCase();
    const docStatus = String(doc?.status ?? "").trim().toLowerCase();
    const completedAt = doc?.completedAt;
    if (contractStatus === "completed" || docStatus === "completed") {
        return completedAt ? `completed:${String(completedAt)}` : "completed";
    }
    if (sessionSentAt || isContractAlreadySent(contract, sessionSentAt)) {
        return "sent";
    }
    return "draft";
}

function isContractSigningFinished(
    contract: Record<string, unknown> | null | undefined,
): boolean {
    const status = String(contract?.status ?? "").trim().toUpperCase();
    if (
        status === "COMPLETED" ||
        status === "SIGNED" ||
        ["DECLINED", "REVOKED", "EXPIRED", "VOIDED"].includes(status)
    ) {
        return true;
    }
    const doc = pickContractEnvelopeDocument(contract);
    const docStatus = String(doc?.status ?? "").trim().toLowerCase();
    return (
        docStatus === "completed" ||
        docStatus === "signed" ||
        docStatus === "voided" ||
        docStatus === "revoked" ||
        docStatus === "declined" ||
        docStatus === "expired"
    );
}

function envelopeDocStatusIsTerminal(doc: Record<string, unknown> | null): boolean {
    const docStatus = String(doc?.status ?? "").trim().toLowerCase();
    return ["revoked", "voided", "declined", "expired", "completed", "signed"].includes(
        docStatus,
    );
}

/** Main contract envelope only — standalone ACH must not affect cancel / review actions. */
function getPrimaryContractEnvelopeView(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt: Date | null,
) {
    const doc = pickContractEnvelopeDocument(contract);
    const docStatus = String(doc?.status ?? "").trim().toLowerCase();
    const hasEnvelope = Boolean(String(doc?.envelopeId ?? "").trim());
    const isDraft =
        !hasEnvelope ||
        (DOCUSIGN_DOC_DRAFT_STATUSES.has(docStatus) && !doc?.sentAt);
    const isCompleted = docStatus === "completed";
    const isTerminal = envelopeDocStatusIsTerminal(doc);
    const isOutForSignature =
        hasEnvelope &&
        !isDraft &&
        !isCompleted &&
        !isTerminal &&
        (Boolean(doc?.sentAt) ||
            ["sent", "viewed", "delivered"].includes(docStatus));
    const sessionContractActive = Boolean(sessionSentAt) && isOutForSignature;
    return {
        doc,
        docStatus,
        isDraft,
        isCompleted,
        isOutForSignature: isOutForSignature || sessionContractActive,
    };
}

/** Open DocuSign for the main contract — draft, after void, resend after signed, or send-new while out for signature. */
function canReviewAndSendToDocuSign(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt: Date | null,
): boolean {
    if (canResendMainContract(contract, sessionSentAt)) return true;
    const { isDraft, isOutForSignature } = getPrimaryContractEnvelopeView(
        contract,
        sessionSentAt,
    );
    if (isOutForSignature) return false;
    if (isContractAlreadySent(contract, sessionSentAt)) return false;
    return isDraft || !pickContractEnvelopeDocument(contract)?.envelopeId;
}

/**
 * New envelope allowed after fully signed/voided, or while out for signature
/**
 * Start a fresh main-contract envelope: while the previous one is still out for signature
 * (without voiding it), or after it completed / was voided / declined / expired.
 */
function canSendNewMainContract(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt: Date | null,
): boolean {
    const view = getPrimaryContractEnvelopeView(contract, sessionSentAt);
    if (view.isOutForSignature) return true;
    return canResendMainContract(contract, sessionSentAt);
}

function canResendMainContract(
    contract: Record<string, unknown> | null | undefined,
    sessionSentAt: Date | null,
): boolean {
    const view = getPrimaryContractEnvelopeView(contract, sessionSentAt);
    const contractStatus = String(contract?.status ?? "").trim().toUpperCase();
    const docStatus = view.docStatus;

    if (view.isOutForSignature) return true;

    if (view.isCompleted || contractStatus === "COMPLETED") return true;
    if (docStatus === "signed") return true;

    if (["revoked", "voided", "declined", "expired"].includes(docStatus)) return true;
    if (["REVOKED", "DECLINED", "EXPIRED"].includes(contractStatus)) return true;

    return false;
}

function resolveLatestEnvelopeStatus(
    contract: Record<string, unknown> | null | undefined,
): string {
    const doc = pickContractEnvelopeDocument(contract);
    const docStatus = String(doc?.status ?? "").trim();
    if (docStatus && !DOCUSIGN_DOC_DRAFT_STATUSES.has(docStatus.toLowerCase())) {
        return docStatus;
    }
    return String(contract?.status ?? "").trim();
}

type PdfRightPaneTab = "template" | "docusign";
/**
 * Template roles often embed placeholder `defaultSignerEmail` in BoldSign that drifts from CRM.
 * For Client / Owner / Merchant slots, prefer resolved CRM email (`Contract.clientEmail`, then Client).
 * Guarantor slots keep the template default only (do not inject merchant email).
 */
function mergeBoldSignRoleSignerEmail(roleName: unknown, boldSignDefaultEmail: unknown, crmSignerEmail: string): string {
    const rl = String(roleName ?? "").toLowerCase();
    const bs = String(boldSignDefaultEmail ?? "").trim();
    const crm = String(crmSignerEmail ?? "").trim();
    if (rl.includes("guarantor")) return bs;
    return crm || bs;
}

/** Use saved signer override emails as-is; only merge CRM email when showing template defaults. */
function resolveSignerEmailForSummary(
    roleLabel: string,
    rowEmail: string,
    crmSignerEmail: string,
    useSavedSignerOverrides: boolean,
): string {
    const saved = String(rowEmail ?? "").trim();
    if (useSavedSignerOverrides && saved) return saved;
    return mergeBoldSignRoleSignerEmail(roleLabel, saved, crmSignerEmail);
}

/** Direct PDF renderer using react-pdf (template PDF and post-send downloads). */
function DirectPdfViewer({
    fileUrl,
    fileName = "document.pdf",
    errorMessage = "Could not render this PDF in the viewer.",
}: {
    fileUrl: string;
    fileName?: string;
    errorMessage?: string;
}) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const [numPages, setNumPages] = useState<number | null>(null);
    const [pageWidth, setPageWidth] = useState(640);
    const [resolvedFileUrl, setResolvedFileUrl] = useState<string | null>(null);
    const [resolveError, setResolveError] = useState<string | null>(null);
    const cloudinaryBlobUrlRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setResolvedFileUrl(null);
        setResolveError(null);
        void (async () => {
            try {
                const trimmed = String(fileUrl || "").trim();
                if (!trimmed || /^platform:/i.test(trimmed)) {
                    if (!cancelled) {
                        setResolveError("Could not load this PDF for preview.");
                    }
                    return;
                }
                const preview = await resolveDocumentPreview(trimmed, fileName, {
                    mimeTypeHint: "application/pdf",
                });
                if (cancelled) {
                    if (preview.revokeOnCleanup) URL.revokeObjectURL(preview.blobUrl);
                    return;
                }
                if (cloudinaryBlobUrlRef.current) {
                    URL.revokeObjectURL(cloudinaryBlobUrlRef.current);
                    cloudinaryBlobUrlRef.current = null;
                }
                if (preview.revokeOnCleanup) {
                    cloudinaryBlobUrlRef.current = preview.blobUrl;
                }
                setResolvedFileUrl(preview.blobUrl);
            } catch {
                if (!cancelled) {
                    setResolveError("Could not load this PDF for preview.");
                }
            }
        })();
        return () => {
            cancelled = true;
            if (cloudinaryBlobUrlRef.current) {
                URL.revokeObjectURL(cloudinaryBlobUrlRef.current);
                cloudinaryBlobUrlRef.current = null;
            }
        };
    }, [fileUrl, fileName]);

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
            {!resolvedFileUrl ? (
                <div className="flex min-h-[200px] items-center justify-center">
                    {resolveError ? (
                        <p className="px-4 text-center text-xs text-slate-500">{resolveError}</p>
                    ) : (
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-hidden />
                    )}
                </div>
            ) : (
            <Document
                file={resolvedFileUrl}
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
                            className={cn("shadow-md", "bg-white")}
                            renderTextLayer
                            renderAnnotationLayer
                        />
                    ))
                    : null}
            </Document>
            )}
        </div>
    );
}

async function parseApiErrorMessageFromAxios(error: unknown): Promise<string> {
    const e = error as {
        response?: { data?: unknown };
        message?: string;
    };
    const data = e?.response?.data;
    if (data instanceof Blob) {
        try {
            const text = await data.text();
            try {
                const j = JSON.parse(text) as { message?: string };
                return String(j?.message ?? text).trim() || "Request failed";
            } catch {
                return text.trim() || "Request failed";
            }
        } catch {
            return "Request failed";
        }
    }
    if (data && typeof data === "object" && "message" in data) {
        return String((data as { message?: string }).message ?? e?.message ?? "Request failed");
    }
    return String(e?.message ?? "Request failed");
}

const PDFViewerModal = ({
    isOpen,
    onClose,
    fileUrl,
    fileName = "Document",
    contractId = null,
    applicationId,
    layout = "contract",
    templateId = null,
    initialRightPaneTab = "template",
    onPrepareDocuSignDraft,
    prefillFieldsPreview = [],
    onSendToDocusign,
    onContractDocumentsChanged,
}: PDFViewerModalProps) => {
    const dispatch = useDispatch<AppDispatch>();
    const [effectiveTemplateId, setEffectiveTemplateId] = useState<string | null>(templateId ?? null);
    const [ccEmails, setCcEmails] = useState<string[]>([]);
    const [ccEmailDraft, setCcEmailDraft] = useState("");
    const [envelopeEmailSubject, setEnvelopeEmailSubject] = useState("");
    const envelopeEmailSubjectDirtyRef = useRef(false);
    const [isSending, setIsSending] = useState(false);
    const [isCancellingContract, setIsCancellingContract] = useState(false);
    /** Set when the browser blocks `window.open` after the draft URL is ready — user opens via button click. */
    const [docuSignOpenUrl, setDocuSignOpenUrl] = useState<string | null>(null);
    type ContractWizardStep = "documents" | "info" | "summary" | "sent";
    const [activeStep, setActiveStep] = useState<ContractWizardStep>("documents");
    const [sentAt, setSentAt] = useState<Date | null>(null);
    /** Sticky unlock for step 4 — survives modal close until void or contract change. */
    const [sentStepUnlocked, setSentStepUnlocked] = useState(false);
    /** Selected row in Sent step when multiple envelopes were sent. */
    const [selectedSentEnvelopeKey, setSelectedSentEnvelopeKey] = useState<string | null>(null);
    const [sentCcEmails, setSentCcEmails] = useState<string[]>([]);
    /** True only while user clicks Refresh on the Sent-step signing status card. */
    const [signingStatusRefreshing, setSigningStatusRefreshing] = useState(false);
    /** When the UI last loaded signing status from CRM (and optional DocuSign sync). */
    const [lastSigningStatusSyncAt, setLastSigningStatusSyncAt] = useState<Date | null>(null);
    /** After user explicitly opens Documents during this modal session, stop auto-switching Documents → Sent. */
    const didSuggestSentTabThisOpenRef = useRef(false);
    const awaitingDocuSignSendRef = useRef(false);
    const refreshContractSigningStateRef = useRef<
        (
            silent?: boolean,
            options?: { syncDocuSign?: boolean; forceDocuSignSync?: boolean },
        ) => Promise<void>
    >(() => Promise.resolve());
    const prevContractIdForSentRef = useRef<number | null | undefined>(undefined);
    const stepSequence: ContractWizardStep[] = ["documents", "info", "summary", "sent"];
    const activeStepIndex = stepSequence.indexOf(activeStep);
    const canGoPreviousStep = activeStepIndex > 0;
    const canGoNextStep = activeStep === "documents" || activeStep === "info";
    const goToPreviousStep = () => {
        if (!canGoPreviousStep) return;
        const prev = stepSequence[activeStepIndex - 1];
        if (prev === "documents") didSuggestSentTabThisOpenRef.current = true;
        setActiveStep(prev);
    };
    const goToNextStep = () => {
        if (!canGoNextStep) return;
        setActiveStep(stepSequence[activeStepIndex + 1]);
    };
    const [selectedState, setSelectedState] = useState<string>("");
    const [selectedFunder, setSelectedFunder] = useState<string>("");
    const [selectedFunderProfileId, setSelectedFunderProfileId] = useState<string>("");
    const contractStateForFunderSyncRef = useRef("");
    const contractPrefillLoadKeyRef = useRef("");
    const userSelectedFunderRef = useRef(false);
    const userSelectedStateRef = useRef(false);
    const {
        funders,
        funderSelectEntries,
        loading: fundersLoading,
        resolveLayoutKey,
        resolveLayoutKeyForProfile,
        previewNameFor,
        findFunder,
        findFunderById,
        resolveFunderOnStateChange,
    } = useFunderProfiles(selectedState);
    const fundersRef = useRef(funders);
    fundersRef.current = funders;
    const findFunderRef = useRef(findFunder);
    findFunderRef.current = findFunder;
    const findFunderByIdRef = useRef(findFunderById);
    findFunderByIdRef.current = findFunderById;
    const resolveLayoutKeyRef = useRef(resolveLayoutKey);
    resolveLayoutKeyRef.current = resolveLayoutKey;
    const resolveLayoutKeyForProfileRef = useRef(resolveLayoutKeyForProfile);
    resolveLayoutKeyForProfileRef.current = resolveLayoutKeyForProfile;
    const previewNameForRef = useRef(previewNameFor);
    previewNameForRef.current = previewNameFor;
    const selectedStateRef = useRef(selectedState);
    selectedStateRef.current = selectedState;
    const [activeContractTemplateName, setActiveContractTemplateName] = useState<string>("Contract.pdf");
    const [savingContractMeta, setSavingContractMeta] = useState(false);
    const [contractPrefillEditOpen, setContractPrefillEditOpen] = useState(false);
    const [prefilledBoldSignPdfUrl, setPrefilledBoldSignPdfUrl] = useState<string | null>(null);
    const [prefilledBoldSignPdfLoading, setPrefilledBoldSignPdfLoading] = useState(false);
    const [prefilledBoldSignPdfHint, setPrefilledBoldSignPdfHint] = useState<string | null>(null);
    const [downloadingFilledContract, setDownloadingFilledContract] = useState(false);
    /** DocuSign envelope from last send or loaded contract — used before DB row is visible. */
    const [sessionEnvelopeId, setSessionEnvelopeId] = useState<string | null>(null);
    /** When true, do not fall back to contract.application.document.envelopeId (stale after "Send new contract"). */
    const [skipContractEnvelopeFallback, setSkipContractEnvelopeFallback] = useState(false);
    const contractEnvelopeSeedAttemptedRef = useRef(false);
    /** Right pane: template PDF, DocuSign draft prefilled (summary), or DocuSign PDF after send. */
    const [pdfRightPaneTab, setPdfRightPaneTab] = useState<PdfRightPaneTab>("template");

    useEffect(() => {
        if (!isOpen) return;
        const initial =
            initialRightPaneTab === "prefilled" ? "docusign" : "template";
        setPdfRightPaneTab(initial);
    }, [isOpen, initialRightPaneTab]);

    /** Includes state-specific funders and any saved profile not in the active list. */
    const funderSelectOptions = useMemo(() => {
        const base = funderSelectEntries;
        const curId = String(selectedFunderProfileId || "").trim();
        if (curId && !base.some((x) => x.value === curId)) {
            const profile = findFunderById(curId);
            if (profile) {
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
    }, [funderSelectEntries, selectedFunderProfileId, findFunderById]);

    const selectedFunderRef = useRef("");
    selectedFunderRef.current = String(selectedFunder || "").trim();
    const selectedFunderProfileIdRef = useRef("");
    selectedFunderProfileIdRef.current = String(selectedFunderProfileId || "").trim();

    const [previewingMainContract, setPreviewingMainContract] = useState(false);

    const selectedFunderProfile = useMemo(
        () =>
            findFunderById(selectedFunderProfileId) ??
            findFunder(selectedFunder),
        [findFunderById, findFunder, selectedFunderProfileId, selectedFunder],
    );
    const selectedFunderDefaultCcEmail = useMemo(() => {
        return String(selectedFunderProfile?.defaultCcEmail ?? "").trim() || null;
    }, [selectedFunderProfile]);
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
    const selectedFunderDefaultCcRef = useRef<string | null>(null);
    selectedFunderDefaultCcRef.current = selectedFunderDefaultCcEmail;
    const contractCcMergeOptionsRef = useRef(contractCcMergeOptions);
    contractCcMergeOptionsRef.current = contractCcMergeOptions;
    /** Canonical contract id for this application (filled after lookup below). */
    const [resolvedContractId, setResolvedContractId] = useState<number | null>(null);
    /** Prefill overrides from `Contract.contractPrefillOverrides` (null = loaded, none stored). */
    const [contractPrefillFromDb, setContractPrefillFromDb] = useState<Partial<BuildContractPrefillFieldsArgs> | null>(
        null,
    );
    /** Resolved contract payload for prefill field derivation. */
    const [resolvedContract, setResolvedContract] = useState<Record<string, unknown> | null>(null);
    /** After the first contract meta fetch for this dialog open, prefer DB overrides over legacy application note. */
    const [contractPrefillLoaded, setContractPrefillLoaded] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setSessionEnvelopeId(null);
            setSkipContractEnvelopeFallback(false);
            contractEnvelopeSeedAttemptedRef.current = false;
            return;
        }
        // Seed once per dialog open — contract refreshes after send must not revert to a prior envelope.
        if (contractEnvelopeSeedAttemptedRef.current) return;
        const fromContract = String(
            (resolvedContract as { application?: { document?: { envelopeId?: string } } } | null)
                ?.application?.document?.envelopeId ?? "",
        ).trim();
        if (!fromContract) return;
        contractEnvelopeSeedAttemptedRef.current = true;
        setSessionEnvelopeId(fromContract);
    }, [isOpen, resolvedContract]);

    type RequiredDocumentKey =
        | "voidedCheck"
        | "driverLicense"
    // | "bankStatement"
    // | "utilityBill";
    const [documentUrls, setDocumentUrls] = useState<{
        voidedCheck?: string;
        driverLicense?: string;
        bankStatement?: string;
        utilityBill?: string;
    }>({});
    const [activePreview, setActivePreview] = useState<null | "voidedCheck" | "driverLicense" | "bankStatement" | "utilityBill">(null);
    const voidedCheckRef = useRef<HTMLInputElement>(null);
    const driverLicenseRef = useRef<HTMLInputElement>(null);
    // const bankStatementRef = useRef<HTMLInputElement>(null);
    // const utilityBillRef = useRef<HTMLInputElement>(null);
    const [documentUploadMessage, setDocumentUploadMessage] = useState("");
    /** Per-row upload progress (0–100) for auto-upload UX. Absent key means not uploading. */
    const [uploadProgressByKey, setUploadProgressByKey] = useState<
        Partial<Record<RequiredDocumentKey, number>>
    >({});
    /** Per-row pending file name shown while the upload is in flight. */
    const [pendingFileNameByKey, setPendingFileNameByKey] = useState<
        Partial<Record<RequiredDocumentKey, string>>
    >({});
    /** Currently dragged-over row, for drop-zone visual feedback. */
    const [dragOverDocKey, setDragOverDocKey] = useState<RequiredDocumentKey | null>(null);
    /** Claude KYC extraction awaiting user review before syncing to contract prefill. */
    const [pendingKycByDocKey, setPendingKycByDocKey] = useState<
        Partial<
            Record<
                RequiredDocumentKey,
                { extraction: KycExtractionResult; synced: boolean }
            >
        >
    >({});
    const [syncingKycKey, setSyncingKycKey] = useState<RequiredDocumentKey | null>(null);
    const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState<string | null>(null);
    const [updatingUploadedFileId, setUpdatingUploadedFileId] = useState<string | null>(null);
    const [deletingUploadedFileId, setDeletingUploadedFileId] = useState<string | null>(null);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [openDocumentActionMenuId, setOpenDocumentActionMenuId] = useState<string | null>(null);
    const [templateMappings, setTemplateMappings] = useState<ContractDocumentTemplateMappingRow[]>([]);

    const addendumTemplateMappings = useMemo(
        () =>
            templateMappings.filter((row) => {
                const t = String(row.documentType || "").toLowerCase();
                return t === "addendum";
            }),
        [templateMappings],
    );

    /** Highest-order linked addendum — kept for child components that still expect one row. */
    const linkedAddendumMapping = useMemo(() => {
        if (!addendumTemplateMappings.length) return null;
        return [...addendumTemplateMappings].sort(
            (a, b) => Number(b.order ?? 0) - Number(a.order ?? 0),
        )[0];
    }, [addendumTemplateMappings]);

    const disclosureTemplateMappings = useMemo(
        () => templateMappings.filter(isDisclosureMappingRow),
        [templateMappings],
    );

    const achTemplateMappings = useMemo(
        () =>
            templateMappings.filter((row) => {
                const t = String(row.documentType || "").toLowerCase();
                if (t === "ach") return true;
                const layout = String(row.template?.layoutKey ?? "").toLowerCase();
                return layout.includes("ach_authorization");
            }),
        [templateMappings],
    );

    /** State disclosure placed first in the contract package (before the main contract). */
    const linkedDisclosureMapping = useMemo(() => {
        if (!disclosureTemplateMappings.length) return null;
        return [...disclosureTemplateMappings].sort(
            (a, b) => Number(b.order ?? 0) - Number(a.order ?? 0),
        )[0];
    }, [disclosureTemplateMappings]);

    const linkedDisclosureMatchesSelectedState = useMemo(
        () => disclosureMappingMatchesState(linkedDisclosureMapping, selectedState),
        [linkedDisclosureMapping, selectedState],
    );

    /** `bs:<boldSignTemplateGuid>` auto-adds; `up:<uploadedFileId>` remains preview-only. */
    const [selectedAddendumOption, setSelectedAddendumOption] = useState<string>("");
    const [addingAddendum, setAddingAddendum] = useState(false);
    const [removingAddendumMappingIds, setRemovingAddendumMappingIds] = useState<Set<string>>(() => new Set());
    /** Main contract in envelope — default on; addendum/disclosure auto-merge when configured below. */
    const [includeMainContractInSend, setIncludeMainContractInSend] = useState(true);
    /** Linked state disclosure in envelope — always on when linked (remove via trash icon). */
    const [includeDisclosureInSend] = useState(true);
    /** Disclosure placement: first (disclosure → contract → addenda) or last (contract → addenda → disclosure). */
    const [disclosureFirstInSend, setDisclosureFirstInSend] = useState(true);

    const configuredAddendumLayoutKey = useMemo((): string | null => {
        const first = [...addendumTemplateMappings].sort(
            (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
        )[0];
        const fromMapping = String(
            first?.template?.layoutKey ??
                first?.template?.templateId ??
                first?.templateId ??
                "",
        ).trim();
        return fromMapping || null;
    }, [addendumTemplateMappings]);

    const configuredDisclosureRef = useMemo((): string | null => {
        if (!includeDisclosureInSend) return null;
        if (!linkedDisclosureMapping || !linkedDisclosureMatchesSelectedState) return null;
        const rowId = String(linkedDisclosureMapping?.template?.id ?? "").trim();
        return rowId || null;
    }, [includeDisclosureInSend, linkedDisclosureMapping, linkedDisclosureMatchesSelectedState]);

    const canSendWithoutContract = useMemo(
        () => canSendWithoutMainContract(configuredAddendumLayoutKey, configuredDisclosureRef),
        [configuredAddendumLayoutKey, configuredDisclosureRef],
    );

    useEffect(() => {
        if (!canSendWithoutContract) {
            setIncludeMainContractInSend(true);
        }
    }, [canSendWithoutContract]);

    const documentTemplateEnvelopeByMappingId = useMemo(
        () =>
            parseDocumentTemplateEnvelopeByMappingId(
                (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                    ?.contractPrefillOverrides,
            ),
        [resolvedContract],
    );
    const [documentTemplatePrefillByMappingId, setDocumentTemplatePrefillByMappingId] = useState<
        Record<string, Record<string, string>>
    >({});
    const [templateMappingPrefillEditRow, setTemplateMappingPrefillEditRow] =
        useState<ContractDocumentTemplateMappingRow | null>(null);
    const [loadingTemplateMappings, setLoadingTemplateMappings] = useState(false);
    const [reorderingAddendums, setReorderingAddendums] = useState(false);
    const [linkingDisclosureTemplate, setLinkingDisclosureTemplate] = useState(false);
    const [disclosureCalcModalOpen, setDisclosureCalcModalOpen] = useState(false);
    const [spaCalcModalOpen, setSpaCalcModalOpen] = useState(false);
    const [savingSpaCalculation, setSavingSpaCalculation] = useState(false);
    const [disclosureCalcBankAnalyses, setDisclosureCalcBankAnalyses] = useState<unknown>(null);
    const [loadingDisclosureCalcBankAnalysis, setLoadingDisclosureCalcBankAnalysis] =
        useState(false);
    const [savingDisclosureCalculation, setSavingDisclosureCalculation] = useState(false);
    const [previewingTemplateId, setPreviewingTemplateId] = useState<string | null>(null);
    const templatePreviewBlobUrlRef = useRef<string | null>(null);
    const mainContractPreviewRequestRef = useRef(0);
    const lastAutoPreviewKeyRef = useRef("");
    const uploadedPreviewUrlRef = useRef<string | null>(null);
    uploadedPreviewUrlRef.current = uploadedPreviewUrl;
    // const [selectedPayoffLetterFileId, setSelectedPayoffLetterFileId] = useState<string>("");
    const [activeInfoPanel, setActiveInfoPanel] = useState<InfoPanelId | null>(null);
    const [, setSelectedInfoPanels] = useState<InfoPanelId[]>([]);
    const [addendumEntries, setAddendumEntries] = useState([
        {
            id: "tmp-1",
            legalName: "",
            dba: "",
            typeOfEntity: "",
            ein: "",
            mailingAddress: "",
            addendumDated: "",
            principalOwner: "",
            principalBusiness: "",
            businessLocation: "",
            principalState: "",
            principalOwnerAmount1: "",
            principalOwnerAmount2: "",
            principalOwner1Name: "",
            principalOwner1Date: "",
            principalOwner2Name: "",
            principalOwner2Date: "",
        },
    ]);
    const [achEntries, setAchEntries] = useState([
        {
            id: "tmp-1",
            bankName: "",
            fullNameOnAccount: "",
            accountNumber: "",
            routingNumber: "",
            ach_authorization_bank_portal_website: "",
            ach_authorization_username: "",
            ach_authorization_password: "",
            ach_authorization_security_question1: "",
            ach_authorization_security_answer1: "",
            ach_authorization_security_question2: "",
            ach_authorization_security_answer2: "",
            ach_authorization_security_question3: "",
            ach_authorization_security_answer3: "",
            ach_authorization_other_infomation: "",
            ach_authorization_reference_name1: "",
            ach_authorization_reference_number_1: "",
            ach_authorization_reference_relationship1: "",
            ach_authorization_reference_name2: "",
            ach_authorization_reference_number2: "",
            ach_authorization_reference_relationship2: "",
            ach_authorization_reference_name3: "",
            ach_authorization_reference_number3: "",
            ach_authorization_reference_relationship3: "",
            dba: "",
            phone: "",
            address: "",
            city: "",
            state: "",
            zip: "",
            bankBranchCity: "",
            bankState: "",
            bankZip: "",
        },
    ]);
    const [epoEntries, setEpoEntries] = useState([
        { id: "tmp-1", legalName: "", receivedDate: "" },
    ]);
    const [ownerEntries, setOwnerEntries] = useState([
        {
            id: "tmp-1",
            ownerFirstName: "",
            ownerLastName: "",
            ownerEmail: "",
            ownerPhone: "",
            ownerAddress: "",
            state: "",
            city: "",
            zipCode: "",
            ownershipPercentage: "",
        },
    ]);
    const [guarantorEntries, setGuarantorEntries] = useState([
        {
            id: "tmp-1",
            guarantorFirstName: "",
            guarantorLastName: "",
            guarantorEmail: "",
            guarantorPhone: "",
            guarantorAddress: "",
            state: "",
            city: "",
            zipCode: "",
            ssnNumber: "",
            driverLicenseNumber: "",
            typeOfEntity: "",
        },
    ]);
    const [infoPanelMessage, setInfoPanelMessage] = useState("");
    const [showRecipientEditor, setShowRecipientEditor] = useState(false);
    const [viewRecordModal, setViewRecordModal] = useState<{
        section: "addendum" | "ach" | "epo" | "owner" | "guarantor";
        title: string;
        row: any;
    } | null>(null);
    const [editRecordModal, setEditRecordModal] = useState<{
        section: "addendum" | "ach" | "epo" | "owner" | "guarantor";
        title: string;
        row: any;
    } | null>(null);
    const [recipientEditorRows, setRecipientEditorRows] = useState<
        { id: string; role: string; name: string; email: string }[]
    >([{ id: "tmp-1", role: "", name: "", email: "" }]);
    /** Saved signer emails for this contract send only (never writes DocuSign template). */
    const [contractSignerOverrides, setContractSignerOverrides] = useState<
        ContractSignerOverrideRow[] | null
    >(null);
    const [savingContractRecipients, setSavingContractRecipients] = useState(false);
    const uploadedDocsState = useSelector(
        (state: RootState) => state.uploadedContractDocuments,
    );
    const applicationData = useSelector((state: RootState) => state.applicationDetail.data as any);
    const applicationDataRef = useRef(applicationData);
    applicationDataRef.current = applicationData;
    const { owners: fullClientOwners } = useApplicationClientOwners(applicationData?.client);
    /** Prefer full client `owners[]` (Overview source of truth) for Signer Details. */
    const applicationForSigners = useMemo(
        () => applicationWithClientOwners(applicationData, fullClientOwners),
        [applicationData, fullClientOwners],
    );

    const offerDecisionState = useSelector((state: RootState) => state.offerDecision);
    const offerDecisionData = offerDecisionState?.data ?? null;
    const offerDecisionLoading = Boolean(offerDecisionState?.loading);

    const contractDisclosureFrequency = useMemo(() => {
        const offer =
            offerDecisionData != null && typeof offerDecisionData === "object"
                ? (offerDecisionData as Record<string, unknown>)
                : null;
        const contractOffer =
            resolvedContract != null && typeof resolvedContract === "object"
                ? ((resolvedContract as Record<string, unknown>).offer as Record<string, unknown> | null)
                : null;
        const raw = String(
            offer?.frequency ?? contractOffer?.frequency ?? "",
        ).trim();
        return normalizeFrequencyForTemplateLookup(raw);
    }, [offerDecisionData, resolvedContract]);

    const disclosureCalculatorSeedInputs = useMemo(
        () =>
            buildDisclosureCalculatorInputsFromSources({
                state: selectedState,
                application: applicationData as Record<string, unknown> | null,
                contract: resolvedContract,
                offerDecision: (offerDecisionData as Record<string, unknown> | null) ?? null,
            }),
        [selectedState, applicationData, resolvedContract, offerDecisionData],
    );

    const disclosureCalcBankMonthlyRevenues = useMemo(
        () => extractMonthlyRevenuesFromBankAnalyses(disclosureCalcBankAnalyses),
        [disclosureCalcBankAnalyses],
    );

    const achListState = useSelector((state: RootState) => state.achList);
    const bankDetailsList = useSelector((state: RootState) => state.bankDetails.data);
    const epoListState = useSelector((state: RootState) => state.epoList);
    const addendumListState = useSelector((state: RootState) => state.addendumList);
    const ownerListState = useSelector((state: RootState) => state.contractOwnerList);
    const guarantorListState = useSelector((state: RootState) => state.contractGuarantorList);
    const boldSignTemplatesState = useSelector(
        (state: RootState) => state.boldSignTemplates,
    );
    const boldSignTemplates = Array.isArray(boldSignTemplatesState.data)
        ? boldSignTemplatesState.data
        : [];
    const boldSignState = useSelector((state: RootState) => state.boldSign);
    const { data: loginData } = useSelector((state: RootState) => state.login);
    const { data: documentRequests, loading: documentRequestsLoading } = useSelector(
        (state: RootState) => state.documentRequests,
    );
    const templateRecipients = boldSignState?.templateRecipients;

    /** Platform layout slots from code — never DocuSign Admin template recipients. */
    const platformSignerRoleRows = useMemo(
        () => getPlatformSignerRoleRows(Math.max(1, ownerEntries.length || 1)),
        [ownerEntries.length],
    );

    const templateRoleRowsForSigner = useMemo(
        () =>
            parseBoldSignTemplateRolesFromRecipientsPayload({
                roles: platformSignerRoleRows,
                source: "platform-layout",
            }),
        [platformSignerRoleRows],
    );

    /** Signing email for DocuSign (includes template default when CRM client email is blank). */
    const docuSignSignerEmail = useMemo(
        () =>
            resolveEffectiveDocuSignSignerEmail(
                applicationForSigners,
                resolvedContract,
                templateRoleRowsForSigner,
                ownerEntries
                    .map((o) => String((o as { ownerEmail?: string }).ownerEmail || "").trim())
                    .filter(Boolean),
            ),
        [
            applicationForSigners,
            resolvedContract,
            templateRoleRowsForSigner,
            ownerEntries,
        ],
    );

    /** CRM client / owner / guarantor rows mapped to numbered DocuSign signer roles. */
    const applicationSignerRowsForMerge = useMemo((): ContractSignerOverrideRow[] => {
        const liveOwners = resolveOwnerRowsForContractPrefill(
            applicationForSigners,
            Array.isArray(ownerListState.data)
                ? (ownerListState.data as Record<string, unknown>[])
                : null,
        );
        const ownersFromApp = liveOwners.map((row) => ({
            firstName: String(row.firstName || "").trim(),
            lastName: String(row.lastName || "").trim(),
            email: String(row.email || "").trim(),
        }));
        const owners =
            ownersFromApp.some((o) => o.firstName || o.lastName || o.email)
                ? ownersFromApp
                : ownerEntries.map((entry) => ({
                      firstName: String(entry.ownerFirstName || "").trim(),
                      lastName: String(entry.ownerLastName || "").trim(),
                      email: String(entry.ownerEmail || "").trim(),
                  }));
        return buildContractPartySignerRows({
            clientEmail: docuSignSignerEmail.email.trim(),
            clientName: getApplicationPrimaryRecipientName(applicationForSigners),
            owners,
            guarantors: guarantorEntries.map((entry) => ({
                firstName: String(entry.guarantorFirstName || "").trim(),
                lastName: String(entry.guarantorLastName || "").trim(),
                email: String(entry.guarantorEmail || "").trim(),
            })),
        });
    }, [
        applicationForSigners,
        docuSignSignerEmail.email,
        ownerEntries,
        guarantorEntries,
        ownerListState.data,
    ]);

    /** DocuSign/BoldSign template roles for Summary (top-level `roles`, not `raw.roles`). */
    const summaryTemplateRoles = useMemo(() => {
        if (contractSignerOverrides?.length) {
            const synced =
                mergeLivePartiesIntoSavedSignerOverrides(
                    contractSignerOverrides,
                    applicationSignerRowsForMerge,
                ) ?? contractSignerOverrides;
            return synced.map((r, idx) => ({
                roleName: r.role,
                signerEmail: r.email,
                signerName: r.name,
                roleIndex: idx + 1,
            }));
        }
        const parsed = platformSignerRoleRows.length
            ? platformSignerRoleRows
            : parseBoldSignTemplateRolesFromRecipientsPayload(templateRecipients);
        if (parsed.length > 0) {
            const merged = mergeApplicationDataIntoSignerRoles(
                buildBoldSignRolesFromTemplateRecipients(
                    parsed,
                    docuSignSignerEmail.email.trim(),
                    getApplicationPrimaryRecipientName(applicationForSigners),
                    { singleSignerOnly: false },
                ),
                applicationSignerRowsForMerge,
            );
            return merged.map((r) => ({
                roleName: r.signerRole,
                signerEmail: r.signerEmail,
                signerName: r.signerName,
                roleIndex: r.roleIndex,
            }));
        }
        if (applicationSignerRowsForMerge.length > 0) {
            return applicationSignerRowsForMerge.map((r, idx) => ({
                roleName: r.role,
                signerEmail: r.email,
                signerName: r.name,
                roleIndex: idx + 1,
            }));
        }
        const signerEmail = docuSignSignerEmail.email.trim();
        if (!signerEmail) return [];
        return [
            {
                roleName: PLATFORM_PRIMARY_SIGNER_ROLE,
                signerEmail: signerEmail,
                signerName: getApplicationPrimaryRecipientName(applicationForSigners),
                roleIndex: 1,
            },
        ];
    }, [
        contractSignerOverrides,
        templateRecipients,
        platformSignerRoleRows,
        docuSignSignerEmail.email,
        applicationForSigners,
        applicationSignerRowsForMerge,
    ]);

    const hasSavedSignerOverrides = Boolean(contractSignerOverrides?.length);
    const uploadedDocs = Array.isArray(uploadedDocsState.data)
        ? uploadedDocsState.data
        : [];
    const sourceApplicationPdf = useMemo(() => {
        const files = Array.isArray((applicationData as any)?.files)
            ? (applicationData as any).files
            : [];
        if (!files.length) return null;
        const preferred = files.find((f: any) => {
            const name = String(f?.originalName || f?.fileName || "").toLowerCase();
            const type = String(f?.mimeType || f?.documentType || f?.type || "").toLowerCase();
            return (
                (type.includes("pdf") || name.includes(".pdf")) &&
                (name.includes("application") || name.includes("business"))
            );
        });
        const fallbackPdf = files.find((f: any) => {
            const name = String(f?.originalName || f?.fileName || "").toLowerCase();
            const type = String(f?.mimeType || "").toLowerCase();
            return type.includes("pdf") || name.includes(".pdf");
        });
        const row = preferred || fallbackPdf;
        if (!row) return null;
        const url = String(row?.url || row?.fileUrl || row?.downloadUrl || "").trim();
        if (!url) return null;
        return {
            name: String(row?.originalName || row?.fileName || "Application PDF"),
            url,
        };
    }, [applicationData]);
    const normalizeDocumentTypeKey = (value: unknown): string =>
        String(value ?? "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    const documentTypeByKey: Record<RequiredDocumentKey, string> = {
        voidedCheck: "Voided Check",
        driverLicense: "Driver License",
        // bankStatement: "Bank Statement",
        // utilityBill: "Utility Bill",
    };
    const requiredDocumentRows: { key: RequiredDocumentKey; label: string; inputRef: React.RefObject<HTMLInputElement | null> }[] = [
        { key: "driverLicense", label: "Driver's License", inputRef: driverLicenseRef },
        { key: "voidedCheck", label: "Voided Check", inputRef: voidedCheckRef },
        // { key: "bankStatement", label: "Bank Statement", inputRef: bankStatementRef },
        // { key: "utilityBill", label: "Utility Bill", inputRef: utilityBillRef },
    ];
    const uploadedDocumentByTypeKey = useMemo(() => {
        const map = new Map<string, any>();
        for (const file of uploadedDocs) {
            const rawType =
                file?.documentType ||
                file?.type ||
                "";
            const key = normalizeDocumentTypeKey(rawType);
            if (key && !map.has(key)) map.set(key, file);
        }
        return map;
    }, [uploadedDocs]);
    const formatDropdownLabel = (raw: unknown): string => {
        const input = replaceLegacyBrandInDisplayName(String(raw ?? "").trim(), "");
        if (!input) return "";
        const noExt = input.replace(/\.pdf$/i, "");
        const normalized = noExt
            .replace(/[_-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!normalized) return "";
        return normalized
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(" ");
    };
    const addendumDocsLayoutFunderId = useMemo(
        () =>
            selectedFunderProfile
                ? resolveAddendumDocumentsLayoutFunderId(selectedFunderProfile)
                : null,
        [selectedFunderProfile],
    );
    const disclosureDocsLayoutFunderId = useMemo(
        () =>
            selectedFunderProfile
                ? resolveDisclosureDocumentsLayoutFunderId(selectedFunderProfile)
                : null,
        [selectedFunderProfile],
    );
    const docsLayoutFunderId = addendumDocsLayoutFunderId;
    const docsLayoutFunderIdRef = useRef<string | null>(null);
    docsLayoutFunderIdRef.current = docsLayoutFunderId;
    const disclosureDocsLayoutFunderIdRef = useRef<string | null>(null);
    disclosureDocsLayoutFunderIdRef.current = disclosureDocsLayoutFunderId;

    const addendumTemplateOptions = useMemo(() => {
        const fromDb = boldSignTemplates.filter((template: any) => {
            if (!isContractAddendumTemplateRow(template)) return false;
            return templateMatchesFunderDocuments(template, docsLayoutFunderId);
        });

        // Platform funders: expose code-backed addenda that already have platform PDFs.
        // Case Takeover is funder-upload only (Settings → Funder profile) — never synthetic.
        if (docsLayoutFunderId) return fromDb;

        const existingKeys = new Set(
            fromDb.map((t: any) => templateLayoutKeyToken(t)).filter(Boolean),
        );
        const platformSynthetic = CONTRACT_ADDENDUM_DOCUMENT_OPTIONS.filter(
            (opt) =>
                opt.layoutKey !== PLATFORM_LAYOUT_KEYS.caseTakeoverAddendum &&
                !existingKeys.has(opt.layoutKey),
        ).map((opt) => ({
            id: opt.layoutKey,
            layoutKey: opt.layoutKey,
            templateId: opt.layoutKey,
            name: opt.label,
            type: opt.layoutKey,
            pdfUrl: `platform://${opt.layoutKey}`,
        }));

        return [...fromDb, ...platformSynthetic];
    }, [boldSignTemplates, docsLayoutFunderId]);
    const addendumDocs = uploadedDocs.filter((file: any) => {
        const text = String(
            file?.documentType || file?.fileName || "",
        ).toLowerCase();
        return text.includes("addendum");
    });
    const payoffLetterDocs = uploadedDocs.filter((file: any) => {
        const text = String(
            file?.documentType || file?.fileName || "",
        ).toLowerCase();
        return text.includes("payoff");
    });

    const applicationIdForLookup = useMemo(() => {
        const d = applicationData as { _id?: string; id?: string } | undefined;
        const fromData = String(d?._id ?? d?.id ?? "").trim();
        if (fromData && isApplicationUuid(fromData)) return fromData;
        const fromProp = applicationId?.trim() || "";
        if (fromProp && isApplicationUuid(fromProp)) return fromProp;
        // Backend accepts numeric display applicationId as fallback.
        return fromData || fromProp || null;
    }, [applicationId, applicationData]);

    const applicationMongoId = useMemo(() => {
        const d = applicationData as { _id?: string; id?: string } | undefined;
        return String(d?._id ?? d?.id ?? "").trim() || null;
    }, [applicationData]);

    const numericApplicationId = useMemo(() => {
        const n = (applicationData as { applicationId?: number } | null)?.applicationId;
        return n != null ? String(n) : null;
    }, [applicationData]);

    const documentRequestLookupId = numericApplicationId || applicationIdForLookup;

    const requestDocsRoleKey = normalizeRoleKey(
        (loginData as { user?: { role?: string } } | null)?.user?.role ||
            (typeof window !== "undefined" ? localStorage.getItem("role") : "") ||
            "",
    );
    const showRequestDocuments =
        Boolean(onPrepareDocuSignDraft) &&
        (requestDocsRoleKey === "UNDERWRITER" ||
            requestDocsRoleKey === "FINAL_UNDERWRITER" ||
            requestDocsRoleKey === "SUPER_ADMIN" ||
            requestDocsRoleKey === "OPERATIONS");

    const pendingDocumentRequests = useMemo(
        () => (documentRequests || []).filter((doc) => doc.status === "Pending"),
        [documentRequests],
    );
    const completedDocumentRequests = useMemo(
        () => (documentRequests || []).filter((doc) => doc.status === "Complete"),
        [documentRequests],
    );

    useEffect(() => {
        if (!isOpen || !documentRequestLookupId) return;
        void dispatch(getDocumentRequestsByApplication(documentRequestLookupId));
    }, [isOpen, documentRequestLookupId, dispatch]);

    const contractPrefillRecords: ContractPrefillContractRecords = useMemo(() => {
        const firstRow = (data: unknown): Record<string, unknown> | null =>
            Array.isArray(data) && data.length ? (data[0] as Record<string, unknown>) : null;
        const rows = Array.isArray(bankDetailsList) ? bankDetailsList : [];
        const latestBank =
            rows.length > 0
                ? [...rows].sort((a, b) => {
                      const ta = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
                      const tb = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
                      return ta - tb;
                  })[0]
                : null;
        const contractRow = resolvedContract as Record<string, unknown> | null;
        const mergedContract =
            contractRow && typeof contractRow === "object"
                ? (() => {
                      const o = mergeContractPrefillOverrideLayers(
                          stripDocumentTemplateBlobFromPrefillOverrides(
                              normalizeContractPrefillOverrides(
                                  contractRow.contractPrefillOverrides,
                              ) ?? null,
                          ),
                          contractPrefillFromDb,
                      );
                      return Object.keys(o).length > 0 ? { ...contractRow, ...o } : contractRow;
                  })()
                : null;
        return {
            contract: mergedContract,
            ach: firstRow(achListState.data),
            bankDetail: latestBank
                ? {
                      bankName: latestBank.bankName,
                      accountNumber: latestBank.accountNumber,
                      routingNumber: latestBank.routingNumber,
                  }
                : null,
            addendum: firstRow(addendumListState.data),
            epo: firstRow(epoListState.data),
            owners: resolveOwnerRowsForContractPrefill(
                applicationForSigners,
                Array.isArray(ownerListState.data)
                    ? (ownerListState.data as Record<string, unknown>[])
                    : null,
            ),
            guarantors: Array.isArray(guarantorListState.data) ? guarantorListState.data : [],
        };
    }, [
        achListState.data,
        bankDetailsList,
        addendumListState.data,
        epoListState.data,
        ownerListState.data,
        guarantorListState.data,
        resolvedContract,
        contractPrefillFromDb,
        applicationForSigners,
    ]);

    const activeOwnerCountForPrefill = useMemo(
        () =>
            resolveActiveOwnerCount({
                owners: contractPrefillRecords.owners ?? null,
                signerRoles: contractSignerOverrides?.map((r) => ({
                    signerRole: r.role,
                    signerEmail: r.email,
                })),
            }),
        [contractPrefillRecords.owners, contractSignerOverrides],
    );

    const contractPrefillOverrides = useMemo(() => {
        const fromNote = parseNoteStructuredSection<Partial<BuildContractPrefillFieldsArgs>>(
            String((applicationData as { note?: string } | null | undefined)?.note || ""),
            CONTRACT_PREFILL_OVERRIDES_SECTION,
        );
        if (!contractPrefillLoaded) return fromNote ?? undefined;
        const merged = mergeContractPrefillOverrideLayers(
            fromNote,
            stripDocumentTemplateBlobFromPrefillOverrides(
                normalizeContractPrefillOverrides(
                    (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                        ?.contractPrefillOverrides,
                ) ?? null,
            ),
            contractPrefillFromDb,
        );
        return Object.keys(merged).length > 0 ? merged : undefined;
    }, [applicationData, contractPrefillFromDb, contractPrefillLoaded, resolvedContract]);

    const offerDecisionMoneyKey = useMemo(
        () =>
            offerDecisionMoneyFingerprint(
                (offerDecisionData as Record<string, unknown> | null) ?? null,
            ),
        [offerDecisionData],
    );

    const prefillDraftFingerprint = useMemo(
        () =>
            docuSignPrefillDraftFingerprint({
                contractPrefillOverrides: mergeContractPrefillOverrideLayers(
                    contractPrefillOverrides,
                    contractPrefillFromDb,
                ),
                documentTemplatePrefillByMappingId,
                offerDecisionMoneyKey,
                clientIdentityKey: clientIdentityPrefillFingerprint(applicationForSigners),
            }),
        [
            contractPrefillOverrides,
            contractPrefillFromDb,
            documentTemplatePrefillByMappingId,
            offerDecisionMoneyKey,
            applicationForSigners,
        ],
    );

    const canEditContractPrefill = useMemo(
        () => Boolean(applicationIdForLookup),
        [applicationIdForLookup],
    );

    /** Step 4 (Sent) only — no DocuSign PDF tab on Documents / Info / Summary. */
    const showDocuSignContractTab = useMemo(
        () =>
            activeStep === "sent" &&
            (sentStepUnlocked || isContractAlreadySent(resolvedContract, sentAt)),
        [activeStep, resolvedContract, sentAt, sentStepUnlocked],
    );

    const signingFinishedForPoll = useMemo(
        () => isContractSigningFinished(resolvedContract),
        [resolvedContract],
    );

    const canReviewAndSendDocuSign = useMemo(
        () => canReviewAndSendToDocuSign(resolvedContract, sentAt),
        [resolvedContract, sentAt],
    );

    const canResendContract = useMemo(
        () => canResendMainContract(resolvedContract, sentAt),
        [resolvedContract, sentAt],
    );

    const canSendNewContract = useMemo(
        () => canSendNewMainContract(resolvedContract, sentAt),
        [resolvedContract, sentAt],
    );

    const isContractOutForSignature = useMemo(() => {
        return getPrimaryContractEnvelopeView(resolvedContract, sentAt).isOutForSignature;
    }, [resolvedContract, sentAt]);

    const latestEnvelopeStatusLabel = useMemo(
        () => formatContractSigningStatusLabel(resolveLatestEnvelopeStatus(resolvedContract)),
        [resolvedContract],
    );

    const showResendContractOnSentStep = useMemo(
        () => activeStep === "sent" && canResendContract,
        [activeStep, canResendContract],
    );

    const docuSignPrimaryActionLabel = useMemo(() => {
        if (canSendNewContract || showResendContractOnSentStep) {
            return "Send new contract";
        }
        if (!includeMainContractInSend && canSendWithoutContract) {
            return "Review & send documents in DocuSign";
        }
        return "Review & send in DocuSign";
    }, [
        canSendNewContract,
        showResendContractOnSentStep,
        includeMainContractInSend,
        canSendWithoutContract,
    ]);

    /**
     * Full CRM → DocuSign prefill list (every field id). Must NOT run through
     * `prepareDealReviewPrefillDisplay` — that dedupes for UI and drops sibling data labels.
     */
    const dealPrefillFieldsForDocuSign = useMemo(() => {
        const effectiveOverrides = mergeContractPrefillOverrideLayers(
            contractPrefillOverrides,
            contractPrefillLoaded ? contractPrefillFromDb : null,
        );
        const offerDecision = (offerDecisionData as Record<string, unknown> | null) ?? null;
        // Prefer saved Verify Prefill money; only re-seed from Final Calc / OD when
        // the offer face amount changed (scrubbing) or user clicks Reload.
        const liveSyncedOverrides = applyLiveOfferSyncToPrefillPartial(
            stripStaleOfferOverridesFromPersisted(
                effectiveOverrides,
                offerDecision,
                applicationData,
                (resolvedContract as Record<string, unknown> | null) ?? null,
            ),
            applicationData,
            offerDecision,
            {
                contract: (resolvedContract as Record<string, unknown> | null) ?? null,
            },
        );
        const fromApp = buildContractPrefillFieldsFromApplication(applicationData, {
            agreementDate: formatDate(new Date()),
            contractRecords: contractPrefillRecords,
            overrides:
                Object.keys(liveSyncedOverrides).length > 0 ? liveSyncedOverrides : undefined,
            offerDecision,
        });
        const byId = new Map<string, ContractPrefillField>();
        const order: string[] = [];
        for (const f of fromApp) {
            byId.set(f.id, f);
            order.push(f.id);
        }
        const hasSavedOverrides = Object.keys(liveSyncedOverrides).length > 0;
        if (!hasSavedOverrides) {
            for (const p of prefillFieldsPreview) {
                const v = String(p.value || "").trim();
                if (!v) continue;
                if (!byId.has(p.id)) order.push(p.id);
                const existing = byId.get(p.id);
                byId.set(p.id, {
                    id: p.id,
                    label: p.label || existing?.label || p.id,
                    value: v,
                });
            }
        }
        const mergedList = order.map((id) => byId.get(id)!);
        // Overlay fee aliases from live-synced overrides only — never re-apply raw
        // saved fee that would undo Final Calc / OD after a completed resend.
        return overlaySavedAppendixFeeOnPrefillFields(mergedList, liveSyncedOverrides, {
            application: applicationData as Record<string, unknown> | undefined,
            contract: contractPrefillRecords.contract ?? null,
            offerDecision,
        });
    }, [
        applicationData,
        prefillFieldsPreview,
        contractPrefillRecords,
        contractPrefillOverrides,
        contractPrefillFromDb,
        contractPrefillLoaded,
        offerDecisionData,
        resolvedContract,
    ]);

    const envelopeFunderLabel = String(
        selectedFunder || selectedFunderProfile?.name || "",
    ).trim();
    const defaultEnvelopeEmailSubject = useMemo(() => {
        const businessName =
            resolveBusinessNameFromPrefillFields(dealPrefillFieldsForDocuSign) ||
            resolveContractBusinessLegalNameForPrefill(
                (resolvedContract ?? {}) as Record<string, unknown>,
                applicationData,
            ) ||
            "Business";
        const rawOfferAmount =
            resolveOfferAmountFromPrefillFields(dealPrefillFieldsForDocuSign) ??
            (offerDecisionData as { offer?: unknown } | null)?.offer ??
            (resolvedContract as { approvedAmount?: unknown; purchaseAmount?: unknown } | null)
                ?.approvedAmount ??
            (resolvedContract as { purchaseAmount?: unknown } | null)?.purchaseAmount ??
            null;
        const offerAmount =
            typeof rawOfferAmount === "number" || typeof rawOfferAmount === "string"
                ? rawOfferAmount
                : null;
        return toEnvelopeSubjectUppercase(
            buildContractEnvelopeEmailSubject(
            businessName,
            offerAmount,
            envelopeFunderLabel,
        ),
        );
    }, [
        dealPrefillFieldsForDocuSign,
        resolvedContract,
        applicationData,
        offerDecisionData,
        envelopeFunderLabel,
    ]);

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

    /** Deal Review UI only — shortened labels, one row per section+label. */
    const dealReviewFields = useMemo(
        () => prepareDealReviewPrefillDisplay(dealPrefillFieldsForDocuSign),
        [dealPrefillFieldsForDocuSign],
    );

    const offerDecisionSummaryRows = useMemo(() => {
        const od = offerDecisionData as Record<string, unknown> | null;
        if (!od) return [];
        const firstOf = (...keys: string[]): unknown => {
            for (const k of keys) {
                const v = od[k];
                if (v !== null && v !== undefined && String(v).trim() !== "") return v;
            }
            return null;
        };
        const row = (label: string, value: unknown) => ({
            label,
            value: formatOfferDecisionCell(label, value),
        });
        const feeDollars = resolveOfferDecisionFeesDisplayDollars(od, {
            applicationCommissionPercentage: (applicationData as { commissionPercentage?: unknown })
                ?.commissionPercentage,
        });
        return [
            row("Decision", od.decision),
            row("Position", od.position),
            row("Offer amount", firstOf("offer", "approvedAmount")),
            row("Factor rate", od.rate),
            row("Term", firstOf("term", "termLength")),
            row("Frequency", od.frequency),
            row("Repay per period", firstOf("repayPerPeriod", "paymentAmount")),
            row("Monthly payment", od.monthlyPayment),
            row("Fees", feeDollars > 0 ? feeDollars : od.fees),
            row("Our remit", od.ourRemit),
            row("Total remit", firstOf("repayPerPeriod", "paymentAmount", "daysWeeks")),
            row("Commission", od.commissionAmount),
            row("Number of payments", firstOf("numberOfPayments", "paymentsTerms")),
            row("Notes", od.notes),
            row("Decline reason", od.declineReason),
        ];
    }, [offerDecisionData, applicationData]);

    useEffect(() => {
        if (!isOpen || !applicationIdForLookup) return;
        void dispatch(getOfferDecisionByApplication(applicationIdForLookup));
        void dispatch(getTermsOffers({ application: applicationIdForLookup }));
    }, [isOpen, applicationIdForLookup, dispatch]);

    /** Re-fetch offer decision when saved elsewhere (e.g. scrubbing Offer Decision) while viewer is open. */
    useEffect(() => {
        if (!isOpen || !applicationIdForLookup) return;
        const onOfferDecisionUpdated = (event: Event) => {
            const detail = (event as CustomEvent<{ applicationId?: string }>).detail;
            if (
                !offerDecisionUpdateMatchesApplication(
                    detail?.applicationId,
                    applicationIdForLookup,
                )
            ) {
                return;
            }
            void dispatch(getOfferDecisionByApplication(applicationIdForLookup));
            void dispatch(getTermsOffers({ application: applicationIdForLookup }));
        };
        window.addEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
        return () => {
            window.removeEventListener(OFFER_DECISION_UPDATED_EVENT, onOfferDecisionUpdated);
        };
    }, [isOpen, applicationIdForLookup, dispatch]);

    /** Re-sync prefill + Signer Details when Overview saves owner/business identity. */
    useEffect(() => {
        if (!isOpen || !applicationIdForLookup) return;
        const onContractPrefillUpdated = (event: Event) => {
            const detail = (
                event as CustomEvent<{ applicationUuid?: string; contract?: unknown }>
            ).detail;
            if (
                !contractPrefillUpdateMatchesApplication(
                    detail?.applicationUuid,
                    applicationIdForLookup,
                )
            ) {
                return;
            }
            const contract =
                detail?.contract != null && typeof detail.contract === "object"
                    ? (detail.contract as Record<string, unknown>)
                    : null;
            if (!contract) return;
            const fullPrefill = contract.contractPrefillOverrides ?? null;
            const main = stripDocumentTemplateBlobFromPrefillOverrides(
                normalizeContractPrefillOverrides(fullPrefill),
            );
            setContractPrefillFromDb(main ?? null);
            setContractSignerOverrides(
                parseContractSignerOverridesFromPrefill(fullPrefill),
            );
            setResolvedContract((prev) =>
                prev
                    ? {
                          ...prev,
                          ...contract,
                          contractPrefillOverrides: fullPrefill,
                      }
                    : contract,
            );
            const contractId = Number(contract.id);
            if (Number.isFinite(contractId) && contractId > 0) {
                void dispatch(getAllContractOwners({ contractId }));
            }
            void dispatch(getApplicationById(applicationIdForLookup));
            void dispatch(getBankDetails({ application: applicationIdForLookup }));
        };
        window.addEventListener(CONTRACT_PREFILL_UPDATED_EVENT, onContractPrefillUpdated);
        return () => {
            window.removeEventListener(CONTRACT_PREFILL_UPDATED_EVENT, onContractPrefillUpdated);
        };
    }, [isOpen, applicationIdForLookup, dispatch]);

    /** Sent step: refresh from CRM (webhook). DocuSign API only if Connect looks stale. */
    useEffect(() => {
        if (!isOpen || activeStep !== "sent") return;
        void refreshContractSigningStateRef.current(true, {
            syncDocuSign: true,
            forceDocuSignSync: false,
        });
    }, [isOpen, activeStep]);

    useEffect(() => {
        if (!isOpen) {
            setResolvedContractId(null);
            setSelectedState("");
            setSelectedFunder("");
            setSelectedFunderProfileId("");
            userSelectedFunderRef.current = false;
            userSelectedStateRef.current = false;
            contractPrefillLoadKeyRef.current = "";
            setContractPrefillFromDb(null);
            setContractPrefillLoaded(false);
            setDocumentTemplatePrefillByMappingId({});
            setSelectedAddendumOption("");
            setSessionEnvelopeId(null);
            setSkipContractEnvelopeFallback(false);
            contractEnvelopeSeedAttemptedRef.current = false;
            setDocuSignOpenUrl(null);
            setContractSignerOverrides(null);
            setShowRecipientEditor(false);
            draftPreparedAddendumIdRef.current = undefined;
            draftPreparedCcRef.current = null;
            draftPreparedPrefillFingerprintRef.current = null;
            lastPrefillSyncFailureToastKeyRef.current = null;
            draftPreparedSignerRolesRef.current = null;
            crmPrefillFrozenForOpenDraftRef.current = false;
            prefilledPdfCachedForEnvelopeRef.current = null;
            prefilledBoldSignPdfUrlRef.current = null;
            lastAutoPreviewKeyRef.current = "";
            uploadedPreviewUrlRef.current = null;
            setUploadedPreviewUrl(null);
            setPreviewingMainContract(false);
            return;
        }
        const propId = Number(contractId);
        const appId = applicationIdForLookup;
        const loadKey = `${appId ?? ""}:${Number.isFinite(propId) ? propId : ""}`;
        const isNewContractLoad = contractPrefillLoadKeyRef.current !== loadKey;
        contractPrefillLoadKeyRef.current = loadKey;
        if (isNewContractLoad) {
            userSelectedFunderRef.current = false;
            userSelectedStateRef.current = false;
            setContractPrefillLoaded(false);
        }
        const applyContractMeta = (contract: unknown) => {
            const c = contract as { state?: unknown; funderName?: unknown; contractPrefillOverrides?: unknown } | null;
            setResolvedContract(c && typeof c === "object" ? (c as Record<string, unknown>) : null);
            let stateVal = pickUsStateForSelect(c?.state);
            if (!stateVal) {
                stateVal = resolveDealStateFromApplication(applicationDataRef.current);
            }
            setSelectedState(stateVal);
            if (!userSelectedFunderRef.current) {
                const rawFunder = String(c?.funderName ?? "").trim();
                if (rawFunder) {
                    const profile = findFunderProfile(fundersRef.current, rawFunder, stateVal);
                    const funderName =
                        pickFunderForSelect(
                            rawFunder,
                            funderNamesForContractState(fundersRef.current, stateVal),
                        ) || rawFunder;
                    const resolvedProfile =
                        profile ?? findFunderProfile(fundersRef.current, funderName, stateVal);
                    setSelectedFunderProfileId(resolvedProfile?.id ?? "");
                    setSelectedFunder(resolvedProfile?.name ?? funderName);
                }
            }
            setContractPrefillFromDb(
                stripDocumentTemplateBlobFromPrefillOverrides(
                    normalizeContractPrefillOverrides(c?.contractPrefillOverrides),
                ),
            );
            setDocumentTemplatePrefillByMappingId(parseDocumentTemplatePrefillByMappingId(c?.contractPrefillOverrides));
            setContractSignerOverrides(
                parseContractSignerOverridesFromPrefill(c?.contractPrefillOverrides),
            );
            setContractPrefillLoaded(true);
        };

        if (!appId) {
            setResolvedContractId(Number.isFinite(propId) ? propId : null);
            if (!Number.isFinite(propId)) {
                setResolvedContract(null);
                setSelectedState(resolveDealStateFromApplication(applicationDataRef.current));
                setSelectedFunder("");
                setSelectedFunderProfileId("");
                setDocumentTemplatePrefillByMappingId({});
                setContractPrefillLoaded(true);
                return;
            }
            let cancelledNoApp = false;
            void (async () => {
                try {
                    const res = await dispatch(getByIdContract(propId)).unwrap();
                    const contract = (res as any)?.data ?? res;
                    if (cancelledNoApp) return;
                    applyContractMeta(contract);
                } catch {
                    if (!cancelledNoApp) {
                        setResolvedContract(null);
                        setSelectedState(resolveDealStateFromApplication(applicationDataRef.current));
                        setSelectedFunder("");
                        setSelectedFunderProfileId("");
                        setContractPrefillFromDb(null);
                        setDocumentTemplatePrefillByMappingId({});
                        setContractPrefillLoaded(true);
                    }
                }
            })();
            return () => {
                cancelledNoApp = true;
            };
        }

        let cancelled = false;
        void (async () => {
            try {
                const res = await dispatch(getByApplicationIdContract(appId)).unwrap();
                const contract = (res as any)?.data ?? res;
                const id = Number((contract as any)?.id);
                if (cancelled) return;
                applyContractMeta(contract);
                if (Number.isFinite(id)) {
                    setResolvedContractId(id);
                } else if (Number.isFinite(propId)) {
                    setResolvedContractId(propId);
                } else {
                    setResolvedContractId(null);
                }
            } catch {
                if (!cancelled) {
                    setResolvedContractId(Number.isFinite(propId) ? propId : null);
                    if (Number.isFinite(propId)) {
                        try {
                            const res2 = await dispatch(getByIdContract(propId)).unwrap();
                            const contract2 = (res2 as any)?.data ?? res2;
                            if (!cancelled) applyContractMeta(contract2);
                        } catch {
                            if (!cancelled) {
                                setResolvedContract(null);
                                setSelectedState(resolveDealStateFromApplication(applicationDataRef.current));
                                setSelectedFunder("");
                                setSelectedFunderProfileId("");
                                setContractPrefillFromDb(null);
                                setDocumentTemplatePrefillByMappingId({});
                                setContractPrefillLoaded(true);
                            }
                        }
                    } else {
                        setResolvedContract(null);
                        setSelectedState(resolveDealStateFromApplication(applicationDataRef.current));
                        setSelectedFunder("");
                        setSelectedFunderProfileId("");
                        setContractPrefillFromDb(null);
                        setDocumentTemplatePrefillByMappingId({});
                        setContractPrefillLoaded(true);
                    }
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, contractId, applicationIdForLookup, dispatch]);

    const effectiveContractId = useMemo(() => {
        if (resolvedContractId != null && Number.isFinite(resolvedContractId)) {
            return resolvedContractId;
        }
        const n = Number(contractId);
        return Number.isFinite(n) ? n : null;
    }, [resolvedContractId, contractId]);

    const linkedEnvelopeId = useMemo(() => {
        const session = String(sessionEnvelopeId || "").trim();
        if (session) return session;
        if (skipContractEnvelopeFallback) return null;
        const fromContract = String(
            (resolvedContract as { application?: { document?: { envelopeId?: string } } } | null)
                ?.application?.document?.envelopeId ?? "",
        ).trim();
        return fromContract || null;
    }, [sessionEnvelopeId, resolvedContract, skipContractEnvelopeFallback]);

    const sentEnvelopeRows = useMemo(
        () => buildContractSendTableRows(resolvedContract),
        [resolvedContract],
    );

    const selectedSentRow = useMemo((): ContractSendTableRow | null => {
        if (!sentEnvelopeRows.length) return null;
        if (selectedSentEnvelopeKey) {
            const found = sentEnvelopeRows.find((row) => row.key === selectedSentEnvelopeKey);
            if (found) return found;
        }
        const sessionEnv = String(sessionEnvelopeId || "").trim();
        if (sessionEnv) {
            const bySession = sentEnvelopeRows.find((row) => row.envelopeId === sessionEnv);
            if (bySession) return bySession;
        }
        return sentEnvelopeRows.find((row) => row.isCurrent) ?? sentEnvelopeRows[0];
    }, [sentEnvelopeRows, selectedSentEnvelopeKey, sessionEnvelopeId]);

    const sentStepPreviewEnvelopeId = useMemo(() => {
        const fromRow = String(selectedSentRow?.envelopeId ?? "").trim();
        if (fromRow) return fromRow;
        return linkedEnvelopeId;
    }, [selectedSentRow, linkedEnvelopeId]);

    const canCancelSentContract = useMemo(
        () => canVoidContractSendTableRow(resolvedContract, selectedSentRow, sentAt),
        [resolvedContract, selectedSentRow, sentAt],
    );

    const canReviewAndSendCurrentPackage = useMemo(() => {
        if (!canSendWithoutContract || includeMainContractInSend) {
            return canReviewAndSendDocuSign;
        }
        return Boolean(onPrepareDocuSignDraft);
    }, [
        canSendWithoutContract,
        includeMainContractInSend,
        canReviewAndSendDocuSign,
        onPrepareDocuSignDraft,
    ]);

    /** Same visibility as the primary Create / Send button, only once an envelope exists. */
    const showCreateInNewEnvelopeButton = useMemo(() => {
        if (!onPrepareDocuSignDraft || !String(linkedEnvelopeId || "").trim()) return false;
        if ((canSendNewContract && activeStep === "sent") || showResendContractOnSentStep) {
            return true;
        }
        return activeStep !== "sent" && canReviewAndSendCurrentPackage;
    }, [
        onPrepareDocuSignDraft,
        linkedEnvelopeId,
        canSendNewContract,
        activeStep,
        showResendContractOnSentStep,
        canReviewAndSendCurrentPackage,
    ]);

    const docuSignPreviewEnvelopeId =
        activeStep === "sent" ? sentStepPreviewEnvelopeId : linkedEnvelopeId;

    const docuSignPdfCacheSuffix = useMemo(
        () => getDocuSignPdfCacheSuffix(resolvedContract, sentAt),
        [resolvedContract, sentAt],
    );

    const prefilledLoadGenRef = useRef(0);
    /** Owns spinner state; stale async work must not clear a newer load's loading flag. */
    const prefilledActiveLoadIdRef = useRef(0);
    const linkedEnvelopeIdRef = useRef<string | null>(null);
    const applicationIdForLookupRef = useRef<string | null>(null);
    const prefilledPdfCachedForEnvelopeRef = useRef<string | null>(null);
    const prefilledBoldSignPdfUrlRef = useRef<string | null>(null);
    /** After DocuSign 429 for an envelope, block auto PDF reloads for ~1 hour. */
    const rateLimitedEnvelopeUntilRef = useRef<Record<string, number>>({});
    const docuSignPdfCacheSuffixRef = useRef(docuSignPdfCacheSuffix);
    const draftPreparedAddendumIdRef = useRef<string | null | undefined>(undefined);
    const draftPreparedCcRef = useRef<string[] | null>(null);
    const draftPreparedPrefillFingerprintRef = useRef<string | null>(null);
    /**
     * After Review & open succeeds, freeze CRM → DocuSign tab patches so sender-view
     * edits are not overwritten before Send. Cleared when rebuilding a draft.
     */
    const crmPrefillFrozenForOpenDraftRef = useRef(false);
    /** Avoid repeating the same draft-sync failure toast for one fingerprint. */
    const lastPrefillSyncFailureToastKeyRef = useRef<string | null>(null);
    const draftPreparedSignerRolesRef = useRef<string | null>(null);
    const draftPreparedOwnerCountRef = useRef<number | null>(null);
    const draftPreparedPackageFingerprintRef = useRef<string | null>(null);
    const includeMainContractInSendRef = useRef(includeMainContractInSend);
    includeMainContractInSendRef.current = includeMainContractInSend;
    const includeDisclosureInSendRef = useRef(includeDisclosureInSend);
    includeDisclosureInSendRef.current = includeDisclosureInSend;

    const resolveSignerOverrideRowsForSend = useCallback((): ContractSignerOverrideRow[] => {
        if (showRecipientEditor) {
            const fromEditor = recipientEditorRows
                .filter((r) => String(r.role || "").trim())
                .map((r) => ({
                    role: r.role.trim(),
                    name: r.name.trim(),
                    email: r.email.trim(),
                }));
            if (fromEditor.length) return fromEditor;
        }
        if (contractSignerOverrides?.length) {
            return (
                mergeLivePartiesIntoSavedSignerOverrides(
                    contractSignerOverrides,
                    applicationSignerRowsForMerge,
                ) ?? contractSignerOverrides
            );
        }
        return buildBoldSignRolesFromTemplateRecipients(
            templateRoleRowsForSigner,
            String(docuSignSignerEmail.email || "").trim(),
            getApplicationPrimaryRecipientName(applicationData),
            { singleSignerOnly: false },
        ).map((r) => ({
            role: r.signerRole,
            name: r.signerName,
            email: r.signerEmail,
        }));
    }, [
        showRecipientEditor,
        recipientEditorRows,
        contractSignerOverrides,
        applicationSignerRowsForMerge,
        templateRoleRowsForSigner,
        docuSignSignerEmail.email,
        applicationData,
    ]);

    const signerRolesDraftFingerprint = useMemo(
        () => contractSignerOverridesFingerprint(resolveSignerOverrideRowsForSend()),
        [resolveSignerOverrideRowsForSend],
    );

    const invalidateDocuSignDraftSession = useCallback(() => {
        setSessionEnvelopeId(null);
        setSkipContractEnvelopeFallback(true);
        contractEnvelopeSeedAttemptedRef.current = true;
        draftPreparedAddendumIdRef.current = undefined;
        draftPreparedCcRef.current = null;
        draftPreparedPrefillFingerprintRef.current = null;
        lastPrefillSyncFailureToastKeyRef.current = null;
        draftPreparedSignerRolesRef.current = null;
        draftPreparedOwnerCountRef.current = null;
        draftPreparedPackageFingerprintRef.current = null;
        crmPrefillFrozenForOpenDraftRef.current = false;
    }, []);

    /** Saved signer overrides changed after a draft was prepared — force a new envelope on next send. */
    useEffect(() => {
        const prepared = draftPreparedSignerRolesRef.current;
        if (prepared == null || prepared === signerRolesDraftFingerprint) return;
        invalidateDocuSignDraftSession();
    }, [signerRolesDraftFingerprint, invalidateDocuSignDraftSession]);

    const sessionEnvelopeIdRef = useRef<string | null>(null);
    const effectiveContractIdRef = useRef<number | null>(null);
    const resolvedContractRef = useRef<Record<string, unknown> | null>(null);
    const selectedSentRowRef = useRef<ContractSendTableRow | null>(null);
    const ccEmailsRef = useRef<string[]>([]);
    const addendumTemplateMappingsRef = useRef<ContractDocumentTemplateMappingRow[]>([]);
    const linkedDisclosureMappingRef = useRef<ContractDocumentTemplateMappingRow | null>(null);
    const boldSignTemplatesRef = useRef(boldSignTemplates);
    const selectedFunderProfileRef = useRef(selectedFunderProfile);
    const disclosureAutoLinkKeyRef = useRef("");
    linkedEnvelopeIdRef.current = linkedEnvelopeId;
    applicationIdForLookupRef.current = applicationIdForLookup;
    effectiveContractIdRef.current = effectiveContractId;
    resolvedContractRef.current = resolvedContract;
    selectedSentRowRef.current = selectedSentRow;
    ccEmailsRef.current = ccEmails;
    sessionEnvelopeIdRef.current = sessionEnvelopeId;
    addendumTemplateMappingsRef.current = addendumTemplateMappings;
    linkedDisclosureMappingRef.current = linkedDisclosureMapping;
    boldSignTemplatesRef.current = boldSignTemplates;
    selectedFunderProfileRef.current = selectedFunderProfile;
    docuSignPdfCacheSuffixRef.current = docuSignPdfCacheSuffix;

    const buildDocuSignPdfCacheKey = (envelopeId: string) =>
        `${envelopeId}:${docuSignPdfCacheSuffixRef.current}`;

    const loadPrefilledPdfFromDocuSign = useCallback(
        async (
            overrideEnvelopeId?: string,
            options?: {
                generation?: number;
                manageLoading?: boolean;
                loadId?: number;
                /** Draft preview may need retries while DocuSign renders prefilled tab values. */
                maxAttempts?: number;
            },
        ) => {
        const gen = options?.generation ?? ++prefilledLoadGenRef.current;
        const manageLoading = options?.manageLoading !== false;
        const loadId =
            options?.loadId ??
            (manageLoading ? ++prefilledActiveLoadIdRef.current : prefilledActiveLoadIdRef.current);
        const envelopeId =
            String(overrideEnvelopeId || linkedEnvelopeIdRef.current || "").trim() || null;
        const appId = applicationIdForLookupRef.current;

        if (!envelopeId && !appId) {
            if (manageLoading && prefilledActiveLoadIdRef.current === loadId) {
                setPrefilledBoldSignPdfLoading(false);
            }
            setPrefilledBoldSignPdfHint(
                "No DocuSign envelope yet. Send the contract to DocuSign first.",
            );
            return;
        }

        if (manageLoading) {
            prefilledActiveLoadIdRef.current = loadId;
            setPrefilledBoldSignPdfLoading(true);
            setPrefilledBoldSignPdfHint(null);
        }

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                window.setTimeout(resolve, ms);
            });

        const isRateLimitError = (message: string) =>
            /hourly_envelope_polling_limit|burst_envelope_polling|hourly_apiinvocation|apiinvocation.?limit|api.?invocation.?limit|polling.?limit|rate.?limit|cooldown is active|too many requests|status code 429|\b429\b/i.test(
                message,
            );

        let lastError = "";

        const pdfCacheKey = envelopeId ? buildDocuSignPdfCacheKey(envelopeId) : null;

        if (
            pdfCacheKey &&
            prefilledPdfCachedForEnvelopeRef.current === pdfCacheKey &&
            prefilledBoldSignPdfUrlRef.current
        ) {
            if (manageLoading && prefilledActiveLoadIdRef.current === loadId) {
                setPrefilledBoldSignPdfLoading(false);
            }
            return;
        }

        if (
            envelopeId &&
            rateLimitedEnvelopeUntilRef.current[envelopeId] &&
            rateLimitedEnvelopeUntilRef.current[envelopeId]! > Date.now()
        ) {
            if (manageLoading && prefilledActiveLoadIdRef.current === loadId) {
                setPrefilledBoldSignPdfLoading(false);
            }
            setPrefilledBoldSignPdfHint(
                "DocuSign envelope polling limit exceeded (250 GET/hour). Wait before reloading this PDF — status still updates via webhook.",
            );
            return;
        }

        // Auto-loads must not multiply DocuSign GETs (per-envelope 250/hour poll budget).
        const maxAttempts = Math.min(options?.maxAttempts ?? 1, 2);

        try {
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                if (prefilledLoadGenRef.current !== gen) return;
                if (attempt > 0) await sleep(4000);
                if (prefilledLoadGenRef.current !== gen) return;

                try {
                    const urlPath = envelopeId
                        ? `/docusign/download/${encodeURIComponent(envelopeId)}`
                        : `/docusign/prefilled-pdf/application/${encodeURIComponent(appId!)}`;
                    const contractIdHint = effectiveContractIdRef.current;
                    const contractRecord = resolvedContractRef.current;
                    const sentRows = contractRecord
                        ? buildContractSendTableRows(contractRecord)
                        : [];
                    const matchingRow =
                        (envelopeId
                            ? sentRows.find(
                                  (row) =>
                                      String(row.envelopeId ?? "").trim() === envelopeId,
                              )
                            : null) ??
                        selectedSentRowRef.current;
                    const funderAuth =
                        envelopeId && contractRecord && matchingRow
                            ? resolveContractSendRowFunderAuth(contractRecord, matchingRow)
                            : {};
                    const res = await axiosGet(urlPath, {
                        responseType: "blob",
                        timeout: 120000,
                        ...(envelopeId
                            ? {
                                  params: {
                                      ...(appId ? { applicationId: String(appId) } : {}),
                                      ...(contractIdHint != null &&
                                      Number.isFinite(contractIdHint) &&
                                      contractIdHint > 0
                                          ? { contractId: contractIdHint }
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
                              }
                            : {}),
                    });
                    if (prefilledLoadGenRef.current !== gen) return;

                    const blob = res.data as Blob;
                    if (!blob?.size) {
                        lastError = "DocuSign returned an empty PDF.";
                        continue;
                    }

                    const url = URL.createObjectURL(blob);
                    prefilledBoldSignPdfUrlRef.current = url;
                    setPrefilledBoldSignPdfUrl((prev) => {
                        if (prev) URL.revokeObjectURL(prev);
                        return url;
                    });
                    setPrefilledBoldSignPdfHint(null);
                    if (pdfCacheKey) {
                        prefilledPdfCachedForEnvelopeRef.current = pdfCacheKey;
                    }
                    return;
                } catch (err: unknown) {
                    lastError = await parseApiErrorMessageFromAxios(err);
                    if (isRateLimitError(lastError)) {
                        if (envelopeId) {
                            rateLimitedEnvelopeUntilRef.current[envelopeId] =
                                Date.now() + 60 * 60_000;
                        }
                        break;
                    }
                }
            }

            if (prefilledLoadGenRef.current !== gen) return;
            prefilledBoldSignPdfUrlRef.current = null;
            setPrefilledBoldSignPdfUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
            setPrefilledBoldSignPdfHint(
                lastError ||
                    "Could not load prefilled PDF from DocuSign. Try again in a few seconds.",
            );
        } finally {
            if (manageLoading && prefilledActiveLoadIdRef.current === loadId) {
                setPrefilledBoldSignPdfLoading(false);
            }
        }
    },
    [],
    );

    const resolveAddendumDocumentsForDocuSignMerge = useCallback(() => {
        const funderProfile = selectedFunderProfileRef.current;
        const templates = Array.isArray(boldSignTemplatesRef.current)
            ? boldSignTemplatesRef.current
            : [];
        return [...addendumTemplateMappingsRef.current]
            .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
            .map((row) => {
                const documentRef = resolvePackageAddendumDocumentRef({
                    mappingDocumentType: row.documentType,
                    template: row.template ?? null,
                    funderProfile,
                    boldSignTemplates: templates,
                });
                return {
                    mappingId: String(row.id || "").trim(),
                    documentRef,
                };
            })
            .filter((item) => item.mappingId && item.documentRef);
    }, []);

    const resolveDisclosureTemplateRefForDocuSignMerge = useCallback((): string | null => {
        if (!includeDisclosureInSendRef.current) return null;
        const row = linkedDisclosureMappingRef.current;
        const rowId = String(row?.template?.id ?? "").trim();
        return rowId || null;
    }, []);

    const resolveAddendumLayoutKeyForDocuSignMerge = useCallback((): string | null => {
        const row = [...addendumTemplateMappingsRef.current].sort(
            (a, b) => Number(a.order ?? 0) - Number(b.order ?? 0),
        )[0];
        const fromMapping = String(
            row?.template?.layoutKey ?? row?.template?.templateId ?? row?.templateId ?? "",
        ).trim();
        if (!fromMapping) return null;
        if (isPlatformLayoutKey(fromMapping)) return fromMapping;
        if (fromMapping.startsWith("funder_")) return fromMapping;
        return fromMapping;
    }, []);

    const getEffectiveSendPackage = useCallback((): ContractSendPackageSelection => {
        return resolveEffectiveSendPackage({
            includeMainContractInSend: includeMainContractInSendRef.current,
            addendumLayoutKey: resolveAddendumLayoutKeyForDocuSignMerge(),
            disclosureRef: resolveDisclosureTemplateRefForDocuSignMerge(),
        });
    }, [resolveAddendumLayoutKeyForDocuSignMerge, resolveDisclosureTemplateRefForDocuSignMerge]);

    const sendPackageFingerprint = useMemo(
        () =>
            `${contractSendPackageFingerprint(getEffectiveSendPackage())}|disclosure:${
                disclosureFirstInSend ? "first" : "last"
            }`,
        [
            getEffectiveSendPackage,
            includeMainContractInSend,
            includeDisclosureInSend,
            disclosureFirstInSend,
            addendumTemplateMappings,
            linkedDisclosureMapping,
            linkedDisclosureMatchesSelectedState,
            canSendWithoutContract,
        ],
    );

    useEffect(() => {
        const prepared = draftPreparedPackageFingerprintRef.current;
        if (prepared == null || prepared === sendPackageFingerprint) return;
        invalidateDocuSignDraftSession();
    }, [sendPackageFingerprint, invalidateDocuSignDraftSession]);

    const primarySignerEmailRef = useRef("");
    primarySignerEmailRef.current = docuSignSignerEmail.email;

    const buildDocuSignRolesForSync = useCallback((): DocuSignTemplateRolePayload[] => {
        let roles: DocuSignTemplateRolePayload[];
        const rows = resolveSignerOverrideRowsForSend();
        if (rows.length) {
            roles = buildDocuSignRolesFromEditorRows(rows);
        } else {
            const signerEmail = String(primarySignerEmailRef.current || "").trim();
            const signerName = getApplicationPrimaryRecipientName(applicationForSigners);
            roles = mergeApplicationDataIntoSignerRoles(
                buildBoldSignRolesFromTemplateRecipients(
                    templateRoleRowsForSigner,
                    signerEmail,
                    signerName,
                    { singleSignerOnly: false },
                ),
                applicationSignerRowsForMerge.map((r) => ({
                    role: r.role,
                    name: r.name,
                    email: r.email,
                })),
            );
        }
        const ownerCount = resolveActiveOwnerCount({
            signerRoles: roles.map((r) => ({
                signerRole: r.signerRole,
                signerEmail: r.signerEmail,
            })),
        });
        return collapseDocuSignRolesToSignerSlots(roles, ownerCount);
    }, [
        resolveSignerOverrideRowsForSend,
        applicationForSigners,
        templateRoleRowsForSigner,
        applicationSignerRowsForMerge,
    ]);

    const docuSignSignerRolesForSend = useMemo(
        () => buildDocuSignRolesForSync(),
        [buildDocuSignRolesForSync],
    );

    const openSignerEditor = useCallback(() => {
        setRecipientEditorRows(
            buildSignerEditorRows({
                savedOverrides: contractSignerOverrides,
                templateRoles: templateRoleRowsForSigner,
                applicationSignerEmail: String(docuSignSignerEmail.email || "").trim(),
                applicationSignerName: getApplicationPrimaryRecipientName(applicationForSigners),
                partyRows: applicationSignerRowsForMerge,
            }),
        );
        setShowRecipientEditor(true);
    }, [
        applicationForSigners,
        applicationSignerRowsForMerge,
        contractSignerOverrides,
        docuSignSignerEmail.email,
        templateRoleRowsForSigner,
    ]);

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
            const signerEmail = String(primarySignerEmailRef.current || "").trim();
            const appId = applicationIdForLookupRef.current;
            const roles = rolesOverride ?? buildDocuSignRolesForSync();
            const funderName = String(selectedFunderRef.current || "").trim();
            const contractState = String(
                (resolvedContract as { state?: unknown } | null)?.state ?? "",
            ).trim();
            const contractIdNum = Number(resolvedContractId ?? contractId);
            try {
                const res = await axiosPost("/docusign/sender-view", {
                    envelopeId,
                    returnUrl,
                    ccEmails: mergeWithDefaultCcEmails(ccForSync, contractCcMergeOptions),
                    roles,
                    ...(appId ? { applicationId: appId } : {}),
                    ...(Number.isFinite(contractIdNum) && contractIdNum > 0
                        ? { contractId: contractIdNum }
                        : {}),
                    ...(funderName ? { funderName } : {}),
                    ...(contractState ? { contractState } : {}),
                    ...(signerEmail
                        ? {
                              signerEmail,
                              signerName: getApplicationPrimaryRecipientName(applicationData),
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
        [
            applicationData,
            buildDocuSignRolesForSync,
            contractCcMergeOptions,
            contractId,
            resolvedContract,
            resolvedContractId,
        ],
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

    /** Step 4: load DocuSign envelope PDF (sent → completed with signatures). */
    useEffect(() => {
        if (!isOpen || pdfRightPaneTab !== "docusign" || !showDocuSignContractTab) {
            prefilledLoadGenRef.current += 1;
            if (!isOpen) {
                prefilledBoldSignPdfUrlRef.current = null;
                setPrefilledBoldSignPdfUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                });
                setPrefilledBoldSignPdfHint(null);
                setPrefilledBoldSignPdfLoading(false);
                prefilledPdfCachedForEnvelopeRef.current = null;
            }
            return;
        }

        void loadPrefilledPdfFromDocuSign(docuSignPreviewEnvelopeId ?? undefined);
        return () => {
            prefilledLoadGenRef.current += 1;
        };
    }, [
        isOpen,
        pdfRightPaneTab,
        showDocuSignContractTab,
        docuSignPreviewEnvelopeId,
        docuSignPdfCacheSuffix,
        loadPrefilledPdfFromDocuSign,
    ]);

    useEffect(() => {
        if (!showDocuSignContractTab && pdfRightPaneTab === "docusign") {
            setPdfRightPaneTab("template");
        }
    }, [showDocuSignContractTab, pdfRightPaneTab]);

    useEffect(() => {
        if (activeStep === "sent" && showDocuSignContractTab && pdfRightPaneTab === "template") {
            setPdfRightPaneTab("docusign");
        }
    }, [activeStep, showDocuSignContractTab, pdfRightPaneTab]);

    const canDownloadFilledContract = showDocuSignContractTab;

    const downloadFilledContractPdf = useCallback(async () => {
        const envelopeId =
            String(docuSignPreviewEnvelopeId || linkedEnvelopeIdRef.current || linkedEnvelopeId || "")
                .trim() || null;
        const appId = applicationIdForLookupRef.current;

        if (!envelopeId && !appId) {
            toast.error("Send the contract to DocuSign first to download the filled PDF.");
            return;
        }

        setDownloadingFilledContract(true);
        try {
            const urlPath = envelopeId
                ? `/docusign/download/${encodeURIComponent(envelopeId)}`
                : `/docusign/prefilled-pdf/application/${encodeURIComponent(appId!)}`;
            const contractIdHint = effectiveContractIdRef.current;
            const contractRecord = resolvedContractRef.current;
            const sentRows = contractRecord
                ? buildContractSendTableRows(contractRecord)
                : [];
            const matchingRow =
                (envelopeId
                    ? sentRows.find(
                          (row) => String(row.envelopeId ?? "").trim() === envelopeId,
                      )
                    : null) ?? selectedSentRowRef.current;
            const funderAuth =
                envelopeId && contractRecord && matchingRow
                    ? resolveContractSendRowFunderAuth(contractRecord, matchingRow)
                    : {};
            const res = await axiosGet(urlPath, {
                responseType: "blob",
                timeout: 120000,
                ...(envelopeId
                    ? {
                          params: {
                              ...(appId ? { applicationId: String(appId) } : {}),
                              ...(contractIdHint != null &&
                              Number.isFinite(contractIdHint) &&
                              contractIdHint > 0
                                  ? { contractId: contractIdHint }
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
                      }
                    : {}),
            });
            const blob =
                res.data instanceof Blob
                    ? res.data
                    : new Blob([res.data], { type: "application/pdf" });
            if (!blob.size) {
                toast.error("DocuSign returned an empty PDF.");
                return;
            }
            const fileLabel = String(
                applicationIdForLookup || envelopeId || "contract",
            ).replace(/[^\w.-]+/g, "_");
            const objectUrl = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = objectUrl;
            anchor.download = `filled-contract-${fileLabel}.pdf`;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(objectUrl);
            toast.success("Filled contract download started.");
        } catch (err: unknown) {
            const msg = await parseApiErrorMessageFromAxios(err);
            toast.error(msg || "Could not download filled contract.");
        } finally {
            setDownloadingFilledContract(false);
        }
    }, [docuSignPreviewEnvelopeId, linkedEnvelopeId, applicationIdForLookup]);

    const persistContractStateAndFunder = useCallback(
        async (
            patch: { state?: string | null; funderName?: string | null },
            options?: { silent?: boolean },
        ) => {
            const cid = effectiveContractId;
            if (cid == null || !Number.isFinite(cid)) {
                if (!options?.silent) {
                    toast.error("Generate or open a contract before updating state and funder.");
                }
                return;
            }
            const data: UpdateContractData = {};
            const canonicalState =
                patch.state !== undefined
                    ? patch.state === "" || patch.state == null
                        ? null
                        : pickUsStateForSelect(String(patch.state).trim()) ||
                          String(patch.state).trim() ||
                          null
                    : undefined;
            if (canonicalState !== undefined) {
                data.state = canonicalState;
                if (canonicalState) {
                    Object.assign(
                        data,
                        contractPrefillToContractColumnUpdate({
                            /** Deal / business location state only — do not overwrite Owner 1 contact state. */
                            businessAddressState: canonicalState,
                            securityBusinessAddressState: canonicalState,
                        }),
                    );
                }
            }
            if (patch.funderName !== undefined) {
                data.funderName =
                    patch.funderName === "" || patch.funderName == null
                        ? null
                        : String(patch.funderName).trim();
            }
            if (Object.keys(data).length === 0) {
                if (!options?.silent) {
                    toast.info("Select a state or funder to save.");
                }
                return;
            }
            try {
                setSavingContractMeta(true);
                const res = await dispatch(
                    updateContract({
                        id: cid,
                        data,
                    }),
                ).unwrap();
                const updated =
                    (res as { data?: Record<string, unknown> } | null)?.data ??
                    (res as Record<string, unknown> | null);
                setResolvedContract((prev) => {
                    const base =
                        prev && typeof prev === "object"
                            ? prev
                            : updated && typeof updated === "object"
                              ? updated
                              : {};
                    return { ...base, ...data };
                });
                if (canonicalState) {
                    setContractPrefillFromDb((prev) => ({
                        ...(prev ?? {}),
                        businessAddressState: canonicalState,
                        securityBusinessAddressState: canonicalState,
                    }));
                    // Force a new DocuSign draft so envelope tabs pick up the state.
                    prefilledPdfCachedForEnvelopeRef.current = null;
                    prefilledBoldSignPdfUrlRef.current = null;
                    invalidateDocuSignDraftSession();
                    try {
                        await syncContractPrefillToSourceRecords({
                            dispatch,
                            applicationData: applicationDataRef.current,
                            applicationUuid:
                                resolveApplicationUuidForUpdate(applicationDataRef.current) ||
                                applicationIdForLookupRef.current ||
                                null,
                            prefill: { businessAddressState: canonicalState },
                        });
                    } catch (syncErr: unknown) {
                        const syncMsg =
                            typeof syncErr === "string"
                                ? syncErr
                                : String(
                                      (syncErr as { message?: string })?.message ||
                                          "Failed to sync application business state.",
                                  );
                        if (!options?.silent) {
                            toast.warning(syncMsg);
                        }
                    }
                }
                if (!options?.silent) {
                    toast.success(
                        canonicalState
                            ? "Contract and application state updated."
                            : "Contract updated.",
                    );
                }
            } catch (err: unknown) {
                const msg =
                    typeof err === "string"
                        ? err
                        : String(
                            (err as { message?: string })?.message ||
                            "Failed to update contract.",
                        );
                if (!options?.silent) {
                    toast.error(msg);
                }
            } finally {
                setSavingContractMeta(false);
            }
        },
        [
            effectiveContractId,
            dispatch,
            invalidateDocuSignDraftSession,
        ],
    );

    /** Flush user-selected funder to DB once a contract row exists. */
    useEffect(() => {
        if (!isOpen || effectiveContractId == null || !userSelectedFunderRef.current) return;
        const funder = String(selectedFunder || "").trim();
        if (!funder) return;
        const dbFunder = String(resolvedContract?.funderName ?? "").trim();
        if (funderNamesEquivalent(funder, dbFunder)) return;
        void persistContractStateAndFunder({ funderName: funder }, { silent: true });
    }, [
        isOpen,
        effectiveContractId,
        selectedFunder,
        resolvedContract?.funderName,
        persistContractStateAndFunder,
    ]);

    useEffect(() => {
        if (!isOpen || !contractPrefillLoaded || !selectedState.trim()) return;

        const prevState = contractStateForFunderSyncRef.current;
        contractStateForFunderSyncRef.current = selectedState;
        // Skip on initial hydration (empty → loaded state from contract).
        if (!prevState.trim()) return;
        if (prevState === selectedState) return;
        // State dropdown already applied Texas/Woodmere funder switch.
        if (userSelectedStateRef.current) return;
        if (userSelectedFunderRef.current) return;

        const switchedFunder = resolveFunderOnStateChange(
            selectedFunder,
            selectedState,
            prevState,
        );
        if (switchedFunder == null || switchedFunder === selectedFunder) return;

        const expectedProfile =
            funders.find(
                (f) =>
                    f.isActive !== false &&
                    (f.name === switchedFunder ||
                        funderNamesEquivalent(f.name, switchedFunder) ||
                        funderNamesEquivalent(f.displayName, switchedFunder)),
            ) ?? findFunderProfile(funders, switchedFunder, selectedState);
        setSelectedFunderProfileId(expectedProfile?.id ?? "");
        setSelectedFunder(expectedProfile?.name ?? switchedFunder);
        if (effectiveContractId != null) {
            void persistContractStateAndFunder(
                { funderName: switchedFunder },
                { silent: true },
            );
        }
    }, [
        isOpen,
        contractPrefillLoaded,
        selectedState,
        selectedFunder,
        resolveFunderOnStateChange,
        funders,
        effectiveContractId,
        persistContractStateAndFunder,
    ]);

    useEffect(() => {
        if (!disclosureCalcModalOpen || !applicationIdForLookup) return;
        let cancelled = false;
        const loadBankAnalysis = async () => {
            setLoadingDisclosureCalcBankAnalysis(true);
            try {
                const res = await axiosGet(
                    `/bank-analysis?${new URLSearchParams({
                        application: String(applicationIdForLookup),
                    }).toString()}`,
                );
                if (cancelled) return;
                const data = (res as { data?: { data?: unknown } })?.data?.data ?? res?.data;
                setDisclosureCalcBankAnalyses(data);
            } catch {
                if (!cancelled) setDisclosureCalcBankAnalyses(null);
            } finally {
                if (!cancelled) setLoadingDisclosureCalcBankAnalysis(false);
            }
        };
        void loadBankAnalysis();
        return () => {
            cancelled = true;
        };
    }, [disclosureCalcModalOpen, applicationIdForLookup]);

    useEffect(() => {
        if (!isOpen || !applicationData) return;
        const st = resolveDealStateFromApplication(applicationData);
        if (st) {
            setSelectedState((prev) => (prev.trim() ? prev : st));
        }
        const contractFunder = String(
            (resolvedContract as { funderName?: unknown } | null)?.funderName ?? "",
        ).trim();
        if (contractPrefillLoaded && contractFunder) return;
        const ad = applicationData as Record<string, unknown>;
        const bi0 = Array.isArray(ad.businessInfo)
            ? (ad.businessInfo[0] as Record<string, unknown>)
            : undefined;
        const fd = normalizeLegacyFunderName(bi0?.funderName ?? ad.funderName ?? "");
        if (fd && !selectedFunder.trim() && !selectedFunderProfileId.trim()) {
            const profile = findFunderProfile(funders, fd, st);
            if (profile) {
                setSelectedFunderProfileId(profile.id);
                setSelectedFunder(profile.name);
            } else {
                setSelectedFunder(
                    pickFunderForSelect(fd, funderNamesForContractState(funders, st)) || fd,
                );
            }
        }
    }, [
        isOpen,
        applicationData,
        funders,
        contractPrefillLoaded,
        resolvedContract,
        selectedFunder,
        selectedFunderProfileId,
    ]);

    /** Default to the first funder in the dropdown when none is saved on the contract. */
    useEffect(() => {
        if (!isOpen || !contractPrefillLoaded || fundersLoading) return;
        if (userSelectedFunderRef.current) return;
        if (!funderSelectEntries.length) return;

        const curId = String(selectedFunderProfileId || "").trim();
        const currentValid = funderSelectEntries.some((entry) => entry.value === curId);
        if (currentValid) return;

        const name = String(selectedFunder || "").trim().toLowerCase();
        const byName = name
            ? funderSelectEntries.find(
                  (entry) =>
                      entry.funderName.toLowerCase() === name ||
                      entry.label.toLowerCase() === name,
              )
            : undefined;
        if (byName) {
            setSelectedFunderProfileId(byName.value);
            setSelectedFunder(byName.funderName);
            return;
        }

        const first = funderSelectEntries[0];
        if (!first?.value) return;
        setSelectedFunderProfileId(first.value);
        setSelectedFunder(first.funderName);
    }, [
        isOpen,
        contractPrefillLoaded,
        fundersLoading,
        funderSelectEntries,
        selectedFunderProfileId,
        selectedFunder,
    ]);

    // Seed CC list when the dialog opens (user-added addresses; default CC is always merged at send)
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        setCcEmails(loadBoldSignCcEmailList(contractCcMergeOptions));
        setCcEmailDraft("");
    }, [isOpen, contractCcMergeOptions]);

    // Fetch tenant contract CC defaults (platform + funder-resolved) for this book.
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        let cancelled = false;
        const funderName = String(selectedFunder || selectedFunderProfile?.name || "").trim();
        const funderProfileId = String(
            persistedFunderProfileIdForApi(selectedFunderProfile) || selectedFunderProfileId || "",
        ).trim();
        const fetchKey = selectedCcFunderKey;
        const state = String(pickUsStateForSelect(selectedState) || selectedState || "").trim();
        const contractIdNum = Number(resolvedContractId ?? contractId);
        const contractIdParam =
            Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : null;

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
                // Fail open: leave default CC empty rather than blocking send.
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
        selectedState,
        resolvedContractId,
        contractId,
    ]);

    const addPdfCcFromDraft = () => {
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

    const voidLinkedContractEnvelope = async (envelopeId: string, reason: string) => {
        await dispatch(
            voidBoldSignDocument({
                documentId: envelopeId,
                reason,
                ...(applicationIdForLookup
                    ? { applicationId: String(applicationIdForLookup) }
                    : {}),
                ...(resolvedContractId != null ? { contractId: resolvedContractId } : {}),
                ...(resolvedContract && typeof resolvedContract === "object"
                    ? {
                          funderName: String(
                              (resolvedContract as { funderName?: unknown }).funderName ?? "",
                          ).trim(),
                          contractState: String(
                              (resolvedContract as { state?: unknown }).state ?? "",
                          ).trim(),
                      }
                    : {}),
            }),
        ).unwrap();
    };

    const handleCancelContract = async () => {
        const envelopeId = String(linkedEnvelopeIdRef.current || linkedEnvelopeId || "").trim();
        if (!envelopeId) {
            toast.error("No DocuSign envelope is linked to this contract.");
            return;
        }
        const confirmed = window.confirm(
            "Void this contract in DocuSign? Signers will no longer be able to sign. You can send a new contract afterward.",
        );
        if (!confirmed) return;

        setIsCancellingContract(true);
        try {
            await voidLinkedContractEnvelope(envelopeId, "Cancelled by user from CRM");
            invalidateDocuSignDraftSession();
            setDocuSignOpenUrl(null);
            setSentStepUnlocked(false);
            setSentAt(null);
            contractWasSentRef.current = false;
            awaitingDocuSignSendRef.current = false;
            pendingCcForSentRef.current = [];
            ccEmailDeliveredRef.current = false;
            invalidateDocuSignPdfCache();
            setPrefilledBoldSignPdfUrl(null);
            setPrefilledBoldSignPdfHint(null);
            await refreshContractSigningState(false, {
                syncDocuSign: false,
                forceDocuSignSync: false,
            });
            onContractDocumentsChanged?.();
            if (activeStepRef.current === "sent") {
                setActiveStep("summary");
            }
            toast.success(
                "Contract voided in DocuSign. Use Review & send when you are ready to send again.",
            );
        } catch (error) {
            console.error("Failed to cancel DocuSign contract:", error);
            const msg = await parseApiErrorMessageFromAxios(error);
            toast.error(msg || "Failed to void contract in DocuSign.");
        } finally {
            setIsCancellingContract(false);
        }
    };

    const handleSend = async (sendOptions?: { forceNewEnvelope?: boolean }) => {
        if (!fileUrl) return;
        const forceNewEnvelope = sendOptions?.forceNewEnvelope === true;
        const packageIncludesMainContract =
            !canSendWithoutContract || includeMainContractInSendRef.current;
        const outForSignatureBeforeSend = getPrimaryContractEnvelopeView(
            resolvedContract,
            sentAt,
        ).isOutForSignature;
        if (!canReviewAndSendCurrentPackage) {
            toast.info(
                packageIncludesMainContract
                    ? "This contract cannot be sent right now."
                    : "Cannot send this document package right now.",
            );
            return;
        }

        let docuSignTab: Window | null = null;
        try {
            setDocuSignOpenUrl(null);
            docuSignTab = window.open("about:blank", "_blank");
            if (docuSignTab) {
                try {
                    writeDocuSignLoadingTab(docuSignTab.document);
                } catch {
                    /* ignore */
                }
            }
            flushSync(() => setIsSending(true));

            const resendMainContractEnvelope =
                forceNewEnvelope ||
                (packageIncludesMainContract &&
                    (outForSignatureBeforeSend ||
                        canResendMainContract(resolvedContract, sentAt)));
            if (resendMainContractEnvelope) {
                // Always create a new DocuSign envelope — never reopen or patch the prior one.
                invalidateDocuSignDraftSession();
                setSessionEnvelopeId(null);
                linkedEnvelopeIdRef.current = null;
                awaitingDocuSignSendRef.current = false;
                pendingCcForSentRef.current = [];
                ccEmailDeliveredRef.current = false;
                invalidateDocuSignPdfCache();
                setPrefilledBoldSignPdfUrl(null);
                setPrefilledBoldSignPdfHint(null);
                if (outForSignatureBeforeSend) {
                    toast.info(
                        "Creating a new DocuSign draft. Previous envelope was not voided.",
                    );
                }
            }
            const draft = ccEmailDraft.trim();
            let userCc = [...ccEmails];
            if (draft && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft)) {
                const dup =
                    isReservedContractCcEmail(draft, contractCcMergeOptions) ||
                    userCc.some((e) => e.toLowerCase() === draft.toLowerCase());
                if (!dup) {
                    userCc = [...userCc, draft];
                }
            }
            userCc = [...new Set(userCc.map((e) => e.trim()).filter(Boolean))];
            const toSend = mergeWithDefaultCcEmails(userCc, contractCcMergeOptions);

            saveBoldSignCcEmailList(userCc, contractCcMergeOptions);
            setCcEmails(userCc);
            setCcEmailDraft("");

            if (onPrepareDocuSignDraft) {
                const signerRolesForSend = buildDocuSignRolesForSync();
                const signerValidation = validateDocuSignSignerRoles(signerRolesForSend);
                if (!signerValidation.valid) {
                    const msg =
                        signerValidation.message ||
                        "Add signer role names and emails in Contract Signers before sending to DocuSign.";
                    if (docuSignTab) {
                        try {
                            writeDocuSignErrorTab(docuSignTab.document, msg);
                        } catch {
                            /* ignore */
                        }
                    }
                    toast.error(msg);
                    return;
                }
                const packageSelection = getEffectiveSendPackage();
                const addendumLayoutKey = resolveAddendumLayoutKeyForDocuSignMerge();
                const disclosureRef = resolveDisclosureTemplateRefForDocuSignMerge();
                const packageValidationMsg = validateContractSendPackage(packageSelection, {
                    addendumLayoutKey,
                    disclosureRef,
                });
                if (packageValidationMsg) {
                    if (docuSignTab) {
                        try {
                            writeDocuSignErrorTab(docuSignTab.document, packageValidationMsg);
                        } catch {
                            /* ignore */
                        }
                    }
                    toast.error(packageValidationMsg);
                    return;
                }

                const addendumDocuments = packageSelection.includeAddendum
                    ? resolveAddendumDocumentsForDocuSignMerge()
                    : [];
                const addendumSelectionFingerprint = JSON.stringify(addendumDocuments);
                const sessionEnv = resendMainContractEnvelope
                    ? null
                    : String(sessionEnvelopeId || "").trim() || null;
                const signerFingerprintForSend = contractSignerOverridesFingerprint(
                    signerRolesForSend.map((r) => ({
                        role: r.signerRole,
                        name: r.signerName,
                        email: r.signerEmail,
                    })),
                );
                const currentOwnerCount = resolveActiveOwnerCount({
                    signerRoles: signerRolesForSend.map((r) => ({
                        signerRole: r.signerRole,
                        signerEmail: r.signerEmail,
                    })),
                });
                const isResendAfterSigned = resendMainContractEnvelope;

                let envelopeId: string | null = null;
                let preparedSenderUrl: string | null = null;

                /** Always rebuild the draft so Sender View reflects current CRM prefill/signers. */
                crmPrefillFrozenForOpenDraftRef.current = false;
                if (sessionEnv) {
                    invalidateDocuSignPdfCache();
                }
                if (isResendAfterSigned) {
                    toast.info("Creating a new DocuSign envelope to resend the contract.");
                }

                const prefillFieldsForDraft = buildDocuSignPrefillFieldsPayload().map((f) => ({
                    id: f.id,
                    value: f.value,
                }));
                const disclosureDocumentRef = packageSelection.includeDisclosure
                    ? resolveDisclosureTemplateRefForDocuSignMerge()
                    : null;
                const prepared = await onPrepareDocuSignDraft({
                    ccEmails: toSend,
                    addendumDocuments,
                    disclosureDocumentRef,
                    disclosurePosition: disclosureFirstInSend ? "first" : "last",
                    includeMainContract: packageSelection.includeMainContract,
                    sendPackage: packageSelection,
                    roles: signerRolesForSend,
                    funderName: selectedFunder.trim() || null,
                    funderProfileId:
                        persistedFunderProfileIdForApi(selectedFunderProfile) || null,
                    contractState: pickUsStateForSelect(selectedState) || null,
                    mainContractLayoutKey: resolveLayoutKey(
                        selectedFunder,
                        selectedFunderProfile?.id,
                    ),
                    prefillFields: prefillFieldsForDraft,
                    title: String(envelopeEmailSubject || "").trim() || defaultEnvelopeEmailSubject,
                    documentName: buildContractEnvelopeDocumentName(
                        String(envelopeEmailSubject || "").trim() || defaultEnvelopeEmailSubject,
                    ),
                    ...(forceNewEnvelope ? { forceNewEnvelope: true } : {}),
                });
                envelopeId =
                    String(
                        (prepared as { envelopeId?: string } | undefined)?.envelopeId ?? "",
                    ).trim() || null;
                preparedSenderUrl =
                    String(
                        (prepared as { sendUrl?: string | null } | undefined)?.sendUrl ?? "",
                    ).trim() || null;
                if (envelopeId) {
                    setSkipContractEnvelopeFallback(false);
                    setSessionEnvelopeId(envelopeId);
                    contractEnvelopeSeedAttemptedRef.current = true;
                    linkedEnvelopeIdRef.current = envelopeId;
                    draftPreparedAddendumIdRef.current = addendumSelectionFingerprint;
                    draftPreparedCcRef.current = [...toSend];
                    draftPreparedPrefillFingerprintRef.current = prefillDraftFingerprint;
                    draftPreparedSignerRolesRef.current = signerFingerprintForSend;
                    draftPreparedOwnerCountRef.current = currentOwnerCount;
                    draftPreparedPackageFingerprintRef.current = sendPackageFingerprint;
                    await persistContractEnvelopeHistory(envelopeId, "draft");
                }

                if (!envelopeId) {
                    const msg =
                        "Could not create the DocuSign draft. Check signers and template configuration.";
                    if (docuSignTab) {
                        try {
                            writeDocuSignErrorTab(docuSignTab.document, msg);
                        } catch {
                            /* ignore */
                        }
                    }
                    toast.error(msg);
                    return;
                }

                const senderViewResult = preparedSenderUrl
                    ? { url: preparedSenderUrl, error: null }
                    : await fetchDocuSignSenderViewUrlWithRetry(envelopeId, toSend, true);
                const senderUrl = senderViewResult.url;
                if (!senderUrl) {
                    const msg =
                        senderViewResult.error ||
                        "Draft envelope was created but DocuSign did not return a review URL yet. Wait a few seconds and click Review & send again.";
                    if (docuSignTab) {
                        try {
                            writeDocuSignErrorTab(docuSignTab.document, msg);
                        } catch {
                            /* ignore */
                        }
                    }
                    toast.error(msg, { autoClose: 12000 });
                    return;
                }

                pendingCcForSentRef.current = toSend;
                ccEmailDeliveredRef.current = false;

                const beginAwaitingDocuSignSend = () => {
                    // Freeze CRM→DocuSign patches; sender-view edits must reach the signer.
                    crmPrefillFrozenForOpenDraftRef.current = true;
                    awaitingDocuSignSendRef.current = true;
                    void refreshContractSigningStateRef.current(true, {
                        syncDocuSign: true,
                        forceDocuSignSync: true,
                    });
                };

                if (docuSignTab) {
                    try {
                        docuSignTab.location.href = senderUrl;
                        setDocuSignOpenUrl(null);
                        beginAwaitingDocuSignSend();
                        toast.success(
                            "DocuSign opened with the latest CRM values. Edit freely there — those edits go to the signer. CRM will not update this open draft; click Review & send again to rebuild from CRM.",
                            { autoClose: 14000 },
                        );
                        return;
                    } catch {
                        /* fall through to popup-blocked fallback */
                    }
                }

                const opened = tryOpenDocuSignSenderUrl(senderUrl);
                if (!opened) {
                    setDocuSignOpenUrl(senderUrl);
                    beginAwaitingDocuSignSend();
                    toast.info(
                        "Your browser blocked the DocuSign tab. Click Open DocuSign below (or allow pop-ups for this site).",
                        { autoClose: 12000 },
                    );
                    return;
                }

                setDocuSignOpenUrl(null);
                beginAwaitingDocuSignSend();
                toast.success(
                    "DocuSign opened with the latest CRM values. Edit freely there — those edits go to the signer. CRM will not update this open draft; click Review & send again to rebuild from CRM.",
                    { autoClose: 14000 },
                );
            } else if (onSendToDocusign) {
                await onSendToDocusign(toSend);
            } else {
                const msg = "DocuSign is not configured for this contract.";
                if (docuSignTab) {
                    try {
                        writeDocuSignErrorTab(docuSignTab.document, msg);
                    } catch {
                        /* ignore */
                    }
                }
                toast.error(msg);
            }
        } catch (error) {
            console.error("Failed to open DocuSign draft:", error);
            const msg =
                error instanceof Error && error.message
                    ? error.message
                    : "Failed to open DocuSign. Try again.";
            if (docuSignTab) {
                try {
                    writeDocuSignErrorTab(docuSignTab.document, msg);
                } catch {
                    /* ignore */
                }
            }
            toast.error(msg);
        } finally {
            setIsSending(false);
        }
    };

    const handleSendInNewEnvelope = () => {
        void handleSend({ forceNewEnvelope: true });
    };

    const applyKycExtractionToModalState = useCallback(
        (extraction: KycExtractionResult, options?: { announce?: boolean }) => {
            if (!extraction || extraction.error) {
                if (extraction?.error) {
                    toast.warn(`Document scan: ${extraction.error}`);
                }
                return;
            }

            setContractPrefillFromDb((prev) =>
                mergeKycExtractionIntoPrefill(prev, extraction),
            );

            if (extraction.mergedContractPrefillOverrides) {
                setResolvedContract((prev) =>
                    prev
                        ? {
                              ...prev,
                              contractPrefillOverrides: extraction.mergedContractPrefillOverrides,
                          }
                        : prev,
                );
            } else if (extraction.contractPrefill) {
                setResolvedContract((prev) => {
                    if (!prev) return prev;
                    const existing =
                        typeof prev.contractPrefillOverrides === "object" &&
                        prev.contractPrefillOverrides != null &&
                        !Array.isArray(prev.contractPrefillOverrides)
                            ? { ...(prev.contractPrefillOverrides as Record<string, unknown>) }
                            : {};
                    return {
                        ...prev,
                        contractPrefillOverrides: {
                            ...existing,
                            ...extraction.contractPrefill,
                        },
                    };
                });
            }

            if (extraction.panels?.owner) {
                setOwnerEntries((entries) =>
                    applyKycPanelsToOwnerEntries(entries, extraction.panels?.owner),
                );
            }
            if (extraction.panels?.guarantor) {
                setGuarantorEntries((entries) =>
                    applyKycPanelsToGuarantorEntries(entries, extraction.panels?.guarantor),
                );
            }
            if (extraction.panels?.ach) {
                setAchEntries((entries) =>
                    applyKycPanelsToAchEntries(entries, extraction.panels?.ach),
                );
            }

            invalidateDocuSignDraftSession();

            if (options?.announce === false) return;

            const label =
                extraction.documentType === "driverLicense"
                    ? "Driver's license"
                    : extraction.documentType === "voidedCheck"
                      ? "Voided check"
                      : "Document";
            toast.success(`${label} synced — contract prefill updated.`);
        },
        [invalidateDocuSignDraftSession],
    );

    const refreshContractAfterKycSync = useCallback(
        async (contractId: number, documentType: KycExtractionResult["documentType"]) => {
            const refreshTasks: Promise<unknown>[] = [];
            if (documentType === "voidedCheck") {
                refreshTasks.push(dispatch(getAllACH({ contractId })).unwrap());
            }
            if (documentType === "driverLicense") {
                refreshTasks.push(
                    dispatch(getAllContractOwners({ contractId })).unwrap(),
                    dispatch(getAllContractGuarantors({ contractId })).unwrap(),
                );
            }
            const refreshed = await dispatch(getByIdContract(contractId)).unwrap();
            await Promise.all(refreshTasks);
            const contractData = (refreshed as { data?: unknown })?.data ?? refreshed;
            if (contractData) {
                setResolvedContract(contractData as Record<string, unknown>);
                setContractPrefillFromDb(
                    stripDocumentTemplateBlobFromPrefillOverrides(
                        (contractData as { contractPrefillOverrides?: Record<string, unknown> | null })
                            .contractPrefillOverrides ?? null,
                    ) ?? null,
                );
            }
        },
        [dispatch],
    );

    const handleSyncKycExtraction = useCallback(
        async (key: RequiredDocumentKey) => {
            const pending = pendingKycByDocKey[key];
            if (!pending || pending.synced || effectiveContractId == null) return;

            const finalized = finalizeKycExtractionForSync(pending.extraction);
            if (!finalized.documentType || finalized.error) return;
            if (!kycExtractionHasReadableFields(finalized)) {
                toast.warn("No readable fields to sync. Edit the card or re-upload the document.");
                return;
            }

            setSyncingKycKey(key);
            try {
                const response = await dispatch(
                    syncKycPrefillToContract({
                        contractId: effectiveContractId,
                        extraction: {
                            documentType: finalized.documentType,
                            contractPrefill: finalized.contractPrefill,
                            panels: finalized.panels as Record<string, unknown>,
                            keyData: finalized.keyData,
                        },
                    }),
                ).unwrap();

                const syncPayload =
                    (response as { data?: KycExtractionResult & { mergedContractPrefillOverrides?: Record<string, unknown> } })
                        ?.data ?? response;
                const mergedExtraction: KycExtractionResult = {
                    ...finalized,
                    mergedContractPrefillOverrides:
                        (syncPayload as { mergedContractPrefillOverrides?: Record<string, unknown> })
                            .mergedContractPrefillOverrides,
                };

                applyKycExtractionToModalState(mergedExtraction);
                await refreshContractAfterKycSync(effectiveContractId, finalized.documentType);

                setPendingKycByDocKey((prev) => ({
                    ...prev,
                    [key]: { extraction: finalized, synced: true },
                }));
            } catch (error: unknown) {
                const msg =
                    error instanceof Error
                        ? error.message
                        : "Failed to sync extracted data to contract prefill.";
                toast.error(msg);
            } finally {
                setSyncingKycKey(null);
            }
        },
        [
            pendingKycByDocKey,
            effectiveContractId,
            dispatch,
            applyKycExtractionToModalState,
            refreshContractAfterKycSync,
        ],
    );

    /**
     * Auto-upload a single required document as soon as the user picks/drops it.
     * Mirrors Drive/Dropbox/DocuSign UX: selection triggers upload, progress
     * is shown inline, then the row flips to the uploaded preview/actions state.
     */
    const autoUploadDocumentFile = useCallback(
        async (key: RequiredDocumentKey, file: File) => {
            if (!file) return;

            if (effectiveContractId == null) {
                const msg = "Please select or generate a contract first.";
                setDocumentUploadMessage(msg);
                toast.error(msg);
                return;
            }

            const allowed = ["pdf", "jpg", "jpeg", "png"];
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            if (!allowed.includes(ext)) {
                const msg = "Unsupported file. Please upload a PDF, JPG, or PNG.";
                setDocumentUploadMessage(msg);
                toast.error(msg);
                return;
            }

            const previewUrl = URL.createObjectURL(file);
            setDocumentUrls((u) => {
                const prevUrl = u[key];
                if (typeof prevUrl === "string" && prevUrl.startsWith("blob:")) {
                    try {
                        URL.revokeObjectURL(prevUrl);
                    } catch {
                        /* ignore */
                    }
                }
                return { ...u, [key]: previewUrl };
            });
            setPendingFileNameByKey((prev) => ({ ...prev, [key]: file.name }));
            setUploadProgressByKey((prev) => ({ ...prev, [key]: 0 }));
            setDocumentUploadMessage("");

            try {
                const uploadResult = await dispatch(
                    uploadContractDocuments({
                        contractId: effectiveContractId,
                        filesByType: { [key]: file },
                        onUploadProgress: (event) => {
                            const total = Number(event?.total || 0);
                            const loaded = Number(event?.loaded || 0);
                            const pct = total > 0 ? Math.round((loaded / total) * 100) : 0;
                            // Cap at 99 until the server response lands so the bar
                            // visibly completes only on success.
                            setUploadProgressByKey((prev) => ({
                                ...prev,
                                [key]: Math.min(99, Math.max(prev[key] ?? 0, pct)),
                            }));
                        },
                    }),
                ).unwrap();

                const kycExtractions = parseKycExtractionsFromUploadResponse(uploadResult);
                const extractionForKey = kycExtractions.find(
                    (e) =>
                        e.documentType === key ||
                        (key === "voidedCheck" && e.documentType === "voidedCheck") ||
                        (key === "driverLicense" && e.documentType === "driverLicense"),
                );
                if (extractionForKey) {
                    setPendingKycByDocKey((prev) => ({
                        ...prev,
                        [key]: { extraction: { ...extractionForKey }, synced: false },
                    }));
                    if (extractionForKey.error) {
                        toast.warn(`Document scan: ${extractionForKey.error}`);
                    } else if (kycExtractionHasReadableFields(extractionForKey)) {
                        toast.info(
                            `${key === "driverLicense" ? "Driver's license" : "Voided check"} scanned — review extracted data and click Sync to prefill.`,
                        );
                    } else {
                        toast.warn(
                            `${key === "driverLicense" ? "Driver's license" : "Voided check"} uploaded, but no readable fields were found.`,
                        );
                    }
                }

                setUploadProgressByKey((prev) => ({ ...prev, [key]: 100 }));
                await dispatch(getUploadedContractDocuments(effectiveContractId));

                setDocumentUrls((u) => {
                    const next = { ...u };
                    const blobUrl = next[key];
                    if (typeof blobUrl === "string" && blobUrl.startsWith("blob:")) {
                        try {
                            URL.revokeObjectURL(blobUrl);
                        } catch {
                            /* ignore */
                        }
                    }
                    delete next[key];
                    return next;
                });
                setPendingFileNameByKey((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                setUploadProgressByKey((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                setDocumentUploadMessage("Document uploaded successfully.");
            } catch (error: any) {
                setUploadProgressByKey((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                setPendingFileNameByKey((prev) => {
                    const next = { ...prev };
                    delete next[key];
                    return next;
                });
                const msg = error?.message || "Failed to upload document.";
                setDocumentUploadMessage(msg);
                toast.error(msg);
            }
        },
        [dispatch, effectiveContractId],
    );

    const autoUploadRequestedDocument = useCallback(
        async (requestDocId: string, file: File) => {
            if (!file || !requestDocId) return;

            if (!applicationMongoId) {
                toast.error("Application ID not found. Cannot upload requested document.");
                return;
            }

            const allowed = ["pdf", "jpg", "jpeg", "png"];
            const ext = (file.name.split(".").pop() || "").toLowerCase();
            if (!allowed.includes(ext)) {
                toast.error("Unsupported file. Please upload a PDF, JPG, or PNG.");
                return;
            }

            const taggedFile = new File(
                [file],
                `${requestDocId}__${file.name}`,
                { type: file.type },
            );

            try {
                await dispatch(
                    uploadApplicationDocuments({
                        id: applicationMongoId,
                        files: [taggedFile],
                    }),
                ).unwrap();

                toast.success(`${getRequestedDocumentLabel({ name: requestDocId })} uploaded.`);

                if (documentRequestLookupId) {
                    await dispatch(getDocumentRequestsByApplication(documentRequestLookupId));
                }
            } catch (error: unknown) {
                const msg =
                    typeof error === "string"
                        ? error
                        : (error as { message?: string })?.message || "Failed to upload document.";
                toast.error(msg);
                throw error;
            }
        },
        [applicationMongoId, dispatch, documentRequestLookupId],
    );

    const handleRemoveDocumentRequest = useCallback(
        async (requestDocId: string) => {
            if (!documentRequestLookupId) {
                toast.error("Application ID not found");
                return;
            }

            try {
                await dispatch(
                    removeDocumentRequest({
                        applicationId: documentRequestLookupId,
                        documentId: requestDocId,
                    }),
                ).unwrap();
                toast.success(
                    `${getRequestedDocumentLabel({ name: requestDocId })} request removed.`,
                );
                await dispatch(getDocumentRequestsByApplication(documentRequestLookupId));
            } catch (error: unknown) {
                const msg =
                    typeof error === "string"
                        ? error
                        : (error as { message?: string })?.message ||
                          "Failed to remove document request.";
                toast.error(msg);
                throw error;
            }
        },
        [dispatch, documentRequestLookupId],
    );

    const applicationFilesForDocumentRequests = useMemo(
        () =>
            Array.isArray((applicationData as { files?: unknown[] } | null)?.files)
                ? ((applicationData as { files: unknown[] }).files as Array<{
                      originalName?: string | null;
                      fileName?: string | null;
                      url?: string | null;
                      fileUrl?: string | null;
                      downloadUrl?: string | null;
                  }>)
                : [],
        [applicationData],
    );

    const canViewRequestedDocument = useCallback(
        (requestDocId: string) =>
            Boolean(
                findApplicationFileForDocumentRequest(
                    requestDocId,
                    applicationFilesForDocumentRequests,
                )?.url,
            ),
        [applicationFilesForDocumentRequests],
    );

    const handleViewRequestedDocument = useCallback(
        (requestDocId: string) => {
            const match = findApplicationFileForDocumentRequest(
                requestDocId,
                applicationFilesForDocumentRequests,
            );
            if (!match?.url) {
                setDocumentUploadMessage("No preview URL found for this document.");
                toast.error("No preview URL found for this document.");
                return;
            }
            setActivePreview(null);
            setUploadedPreviewUrl(match.url);
            setPdfRightPaneTab("template");
        },
        [applicationFilesForDocumentRequests],
    );

    const handlePreviewUploadedDocument = async (fileId: string) => {
        if (effectiveContractId == null || !fileId) return;
        try {
            const response = await dispatch(
                getUploadedContractDocumentById({ contractId: effectiveContractId, fileId }),
            ).unwrap();
            const file = (response as any)?.data ?? response;
            const url = String(file?.fileUrl || file?.downloadUrl || "").trim();
            if (!url) {
                setDocumentUploadMessage("No preview URL found for this document.");
                return;
            }
            setActivePreview(null);
            setUploadedPreviewUrl(url);
        } catch (error: any) {
            setDocumentUploadMessage(
                error?.message || "Failed to load uploaded document preview.",
            );
        }
    };

    const handleEditUploadedDocument = (fileId: string) => {
        if (effectiveContractId == null || !fileId) return;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".pdf,.jpg,.jpeg,.png";
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement)?.files?.[0];
            if (!file) return;
            try {
                setUpdatingUploadedFileId(fileId);
                await dispatch(
                    updateUploadedContractDocument({
                        contractId: effectiveContractId,
                        fileId,
                        file,
                    }),
                ).unwrap();
                setDocumentUploadMessage("Uploaded document updated successfully.");
                dispatch(getUploadedContractDocuments(effectiveContractId));
            } catch (error: any) {
                setDocumentUploadMessage(
                    error?.message || "Failed to update uploaded document.",
                );
            } finally {
                setUpdatingUploadedFileId(null);
            }
        };
        input.click();
    };

    const handleDeleteUploadedDocument = async (fileId: string) => {
        if (effectiveContractId == null || !fileId) return;
        try {
            setDeletingUploadedFileId(fileId);
            await dispatch(
                deleteUploadedContractDocument({ contractId: effectiveContractId, fileId }),
            ).unwrap();
            if (uploadedPreviewUrl) {
                setUploadedPreviewUrl(null);
            }
            setDocumentUploadMessage("Uploaded document deleted successfully.");
            dispatch(getUploadedContractDocuments(effectiveContractId));
        } catch (error: any) {
            setDocumentUploadMessage(
                error?.message || "Failed to delete uploaded document.",
            );
        } finally {
            setDeletingUploadedFileId(null);
        }
    };

    const fetchTemplateMappings = useCallback(async () => {
        if (effectiveContractId == null) {
            setTemplateMappings([]);
            return;
        }
        try {
            setLoadingTemplateMappings(true);
            const res = await axiosGet(`/contract/${effectiveContractId}/document-template-mappings`);
            const rows = (res?.data?.data ?? []) as ContractDocumentTemplateMappingRow[];
            setTemplateMappings(Array.isArray(rows) ? rows : []);
        } catch (error: any) {
            setTemplateMappings([]);
            setDocumentUploadMessage(error?.message || "Failed to load template mappings.");
        } finally {
            setLoadingTemplateMappings(false);
        }
    }, [effectiveContractId]);

    /** Addendum send-order board — DocuSign merges addendums in ascending `order`. */
    const reorderAddendumTemplateMappings = useCallback(
        async (nextRows: ContractDocumentTemplateMappingRow[]) => {
            if (effectiveContractId == null || nextRows.length < 2) return;
            const mappingIds = nextRows.map((row) => String(row.id));
            // Same slot reuse as the API: the rows' own `order` values in the new sequence.
            const slots = nextRows
                .map((row) => Number(row.order ?? 0))
                .sort((a, b) => a - b);
            for (let i = 1; i < slots.length; i += 1) {
                if (slots[i] <= slots[i - 1]) slots[i] = slots[i - 1] + 1;
            }
            const nextOrderById = new Map(mappingIds.map((id, i) => [id, slots[i]]));
            setTemplateMappings((prev) =>
                prev.map((row) =>
                    nextOrderById.has(String(row.id))
                        ? { ...row, order: nextOrderById.get(String(row.id)) as number }
                        : row,
                ),
            );
            setReorderingAddendums(true);
            try {
                const res = await axiosPut(
                    `/contract/${effectiveContractId}/document-template-mappings-order`,
                    { documentType: "addendum", mappingIds },
                );
                const rows = (res?.data?.data ?? null) as ContractDocumentTemplateMappingRow[] | null;
                if (Array.isArray(rows)) setTemplateMappings(rows);
            } catch (error: any) {
                setDocumentUploadMessage(error?.message || "Failed to save addendum order.");
                await fetchTemplateMappings();
            } finally {
                setReorderingAddendums(false);
            }
        },
        [effectiveContractId, fetchTemplateMappings],
    );

    const reloadContractPrefillSnapshots = useCallback(async () => {
        const appId = applicationIdForLookup;
        if (!appId) return;
        try {
            const res = await dispatch(getByApplicationIdContract(appId)).unwrap();
            const contract = (res as { data?: unknown })?.data ?? res;
            const c = contract as { contractPrefillOverrides?: unknown } | null;
            setContractPrefillFromDb(
                stripDocumentTemplateBlobFromPrefillOverrides(
                    normalizeContractPrefillOverrides(c?.contractPrefillOverrides),
                ),
            );
            setDocumentTemplatePrefillByMappingId(parseDocumentTemplatePrefillByMappingId(c?.contractPrefillOverrides));
        } catch {
            /* ignore */
        }
    }, [applicationIdForLookup, dispatch]);

    const lastDocuSignSyncAtRef = useRef(0);
    /** Last time CRM contract status changed (webhook or CRM refetch) — drives stale DocuSign fallback. */
    const lastCrmStatusChangeAtRef = useRef(Date.now());
    const contractWasSentRef = useRef(false);
    const prevContractStatusRef = useRef("");
    const pendingCcForSentRef = useRef<string[]>([]);
    /** Set when sync-envelope-status reports CC PDF was emailed (avoids spam, allows retry until success). */
    const ccEmailDeliveredRef = useRef(false);
    const loadPrefilledPdfRef = useRef(loadPrefilledPdfFromDocuSign);
    loadPrefilledPdfRef.current = loadPrefilledPdfFromDocuSign;
    const setPdfRightPaneTabRef = useRef(setPdfRightPaneTab);
    setPdfRightPaneTabRef.current = setPdfRightPaneTab;
    const contractModalWasOpenRef = useRef(false);
    const activeStepRef = useRef(activeStep);
    activeStepRef.current = activeStep;
    const sentAtRef = useRef(sentAt);
    sentAtRef.current = sentAt;
    const sentStepUnlockedRef = useRef(sentStepUnlocked);
    sentStepUnlockedRef.current = sentStepUnlocked;

    const hydrateSentAtFromContract = useCallback(
        (contract: Record<string, unknown> | null | undefined) => {
            if (sentAtRef.current) return;
            const docSentAt = pickContractEnvelopeDocument(contract)?.sentAt;
            setSentAt(docSentAt ? new Date(String(docSentAt)) : new Date());
        },
        [],
    );

    /**
     * Refresh contract row from CRM (webhook primary). DocuSign API sync only when forced
     * (manual Refresh) or when Connect looks stale.
     */
    const refreshContractSigningState = useCallback(
        async (
            silent?: boolean,
            options?: { syncDocuSign?: boolean; forceDocuSignSync?: boolean },
        ) => {
            const appId = applicationIdForLookup;
            const propId = Number(contractId);
            if (!silent) setSigningStatusRefreshing(true);

            const fetchContractRow = async (): Promise<Record<string, unknown> | null> => {
                let contract: unknown;
                if (appId) {
                    const res = await dispatch(getByApplicationIdContract(appId)).unwrap();
                    contract = (res as { data?: unknown })?.data ?? res;
                } else if (Number.isFinite(propId)) {
                    const res = await dispatch(getByIdContract(propId)).unwrap();
                    contract = (res as { data?: unknown })?.data ?? res;
                } else {
                    return null;
                }
                const c =
                    contract && typeof contract === "object"
                        ? (contract as Record<string, unknown>)
                        : null;
                if (c) {
                    setResolvedContract(c);
                    const id = Number(c.id);
                    if (Number.isFinite(id)) setResolvedContractId(id);
                    const stateVal =
                        pickUsStateForSelect(c.state) ||
                        resolveDealStateFromApplication(applicationDataRef.current);
                    if (stateVal && !userSelectedStateRef.current) {
                        setSelectedState(stateVal);
                    }
                    const rawFunder = String(c.funderName ?? "").trim();
                    if (!userSelectedFunderRef.current && rawFunder) {
                        const profile = findFunderProfile(
                            fundersRef.current,
                            rawFunder,
                            stateVal,
                        );
                        const funderName =
                            pickFunderForSelect(
                                rawFunder,
                                funderNamesForContractState(fundersRef.current, stateVal),
                            ) || rawFunder;
                        const resolvedProfile =
                            profile ??
                            findFunderProfile(fundersRef.current, funderName, stateVal);
                        setSelectedFunderProfileId(resolvedProfile?.id ?? "");
                        setSelectedFunder(resolvedProfile?.name ?? funderName);
                    }
                    setContractPrefillFromDb(
                        stripDocumentTemplateBlobFromPrefillOverrides(
                            normalizeContractPrefillOverrides(c.contractPrefillOverrides) ??
                                null,
                        ) ?? null,
                    );
                    setDocumentTemplatePrefillByMappingId(
                        parseDocumentTemplatePrefillByMappingId(c.contractPrefillOverrides),
                    );
                }
                return c;
            };

            try {
                let c = await fetchContractRow();
                if (!c) return;

                const envelopeForSync =
                    linkedEnvelopeIdRef.current ||
                    String(
                        (c as { application?: { document?: { envelopeId?: string } } })
                            ?.application?.document?.envelopeId ?? "",
                    ).trim() ||
                    null;
                const alreadySent =
                    sentStepUnlockedRef.current ||
                    isContractAlreadySent(c, sentAtRef.current);
                const onSentStep = activeStepRef.current === "sent";
                const wantsSync = options?.syncDocuSign === true;
                const signingFinished = isContractSigningFinished(c);
                const webhookLooksStale = shouldFallbackPollDocuSign({
                    force: options?.forceDocuSignSync === true,
                    signingFinished,
                    lastCrmStatusAtMs: lastCrmStatusChangeAtRef.current,
                    staleMs: DOCUSIGN_WEBHOOK_STALE_MS,
                });
                const maySyncDocuSign =
                    wantsSync &&
                    webhookLooksStale &&
                    Boolean(envelopeForSync || appId) &&
                    !signingFinished &&
                    (options?.forceDocuSignSync === true ||
                        awaitingDocuSignSendRef.current ||
                        (alreadySent && onSentStep) ||
                        (!alreadySent && Boolean(envelopeForSync)));

                if (maySyncDocuSign) {
                    const now = Date.now();
                    if (
                        options?.forceDocuSignSync ||
                        now - lastDocuSignSyncAtRef.current >= DOCUSIGN_STATUS_SYNC_MIN_INTERVAL_MS
                    ) {
                        lastDocuSignSyncAtRef.current = now;
                        try {
                            const ccForSync = mergeWithDefaultCcEmails(
                                pendingCcForSentRef.current.length
                                    ? pendingCcForSentRef.current
                                    : ccEmailsRef.current,
                                contractCcMergeOptionsRef.current,
                            );
                            const syncRes = await axiosPost("/docusign/sync-envelope-status", {
                                ...(appId ? { applicationId: appId } : {}),
                                ...(envelopeForSync ? { envelopeId: envelopeForSync } : {}),
                                ccEmails: ccForSync,
                            });
                            const ccResult = (
                                syncRes as {
                                    data?: {
                                        ccPrefilledEmail?: {
                                            emailed?: string[];
                                            delivery?: string;
                                            skippedReason?: string;
                                        };
                                    };
                                }
                            )?.data?.ccPrefilledEmail;
                            if (ccResult?.emailed?.length) {
                                ccEmailDeliveredRef.current = true;
                                if (!silent) {
                                    toast.success(
                                        `CC copy emailed to: ${ccResult.emailed.join(", ")}`,
                                    );
                                }
                            } else if (
                                ccResult?.delivery === "docusign_carbon_copy" ||
                                ccResult?.skippedReason === "docusign_carbon_copy"
                            ) {
                                // CC is delivered by DocuSign carbon copy — no CRM/SendGrid mail.
                                ccEmailDeliveredRef.current = true;
                            }
                            c = (await fetchContractRow()) ?? c;
                            // Space fallback polls — don't call DocuSign every CRM tick once stale.
                            lastCrmStatusChangeAtRef.current = Date.now();
                        } catch (syncErr) {
                            lastCrmStatusChangeAtRef.current = Date.now();
                            if (!silent) {
                                console.warn("[DocuSign] sync-envelope-status failed:", syncErr);
                            }
                        }
                    }
                }

                const nowSent =
                    sentStepUnlockedRef.current ||
                    isContractAlreadySent(c, sentAtRef.current);
                const statusUpper = String(c.status ?? "").trim().toUpperCase();
                const prevStatus = prevContractStatusRef.current;

                if (nowSent) {
                    awaitingDocuSignSendRef.current = false;
                }

                if (statusUpper && statusUpper !== prevStatus) {
                    lastCrmStatusChangeAtRef.current = Date.now();
                }

                if (nowSent && !contractWasSentRef.current) {
                    contractWasSentRef.current = true;
                    setSentStepUnlocked(true);
                    setSentAt(new Date());
                    const cc = mergeWithDefaultCcEmails(
                        pendingCcForSentRef.current.length
                            ? pendingCcForSentRef.current
                            : ccEmailsRef.current,
                        contractCcMergeOptionsRef.current,
                    );
                    setSentCcEmails(cc);
                    if (activeStepRef.current !== "sent") {
                        setActiveStep("sent");
                        didSuggestSentTabThisOpenRef.current = true;
                    }
                    setPdfRightPaneTabRef.current("docusign");
                    prefilledPdfCachedForEnvelopeRef.current = null;
                    prefilledBoldSignPdfUrlRef.current = null;
                    void loadPrefilledPdfRef.current(undefined, { maxAttempts: 1 });
                    if (!silent) {
                        toast.success(
                            "Contract sent in DocuSign. Step 4 shows signing status and the envelope PDF.",
                        );
                    }
                    if (!ccEmailDeliveredRef.current && cc.length > 0) {
                        // One recovery sync after CRM sees sent — webhook primary for status.
                        void refreshContractSigningState(true, {
                            syncDocuSign: true,
                            forceDocuSignSync: true,
                        });
                    }
                }

                if (
                    statusUpper === "COMPLETED" &&
                    prevStatus !== "COMPLETED" &&
                    activeStepRef.current === "sent"
                ) {
                    prefilledPdfCachedForEnvelopeRef.current = null;
                    prefilledBoldSignPdfUrlRef.current = null;
                    void loadPrefilledPdfRef.current(undefined, { maxAttempts: 1 });
                    if (!silent) {
                        toast.success("Contract fully signed. PDF updated with signatures.");
                    }
                }

                prevContractStatusRef.current = statusUpper;
                setLastSigningStatusSyncAt(new Date());
            } catch {
                /* ignore */
            } finally {
                if (!silent) setSigningStatusRefreshing(false);
            }
        },
        [applicationIdForLookup, contractId, dispatch, funders],
    );
    refreshContractSigningStateRef.current = refreshContractSigningState;

    /** Reset sent-step session only when switching to a different contract row. */
    useEffect(() => {
        const nextId =
            contractId != null && Number.isFinite(Number(contractId))
                ? Number(contractId)
                : null;
        const prevId = prevContractIdForSentRef.current;
        prevContractIdForSentRef.current = nextId;
        if (prevId === undefined || prevId === nextId) return;
        awaitingDocuSignSendRef.current = false;
        setSentStepUnlocked(false);
        setSentAt(null);
        contractWasSentRef.current = false;
    }, [contractId]);

    /** Keep step 4 in sync when contract row refresh shows Sent (e.g. Contracts Generated table). */
    useEffect(() => {
        if (!isOpen) return;
        if (!isContractAlreadySent(resolvedContract, sentAtRef.current)) return;
        if (!sentStepUnlockedRef.current) {
            setSentStepUnlocked(true);
            hydrateSentAtFromContract(resolvedContract);
        }
        contractWasSentRef.current = true;
    }, [isOpen, resolvedContract, hydrateSentAtFromContract]);

    /** Once per modal open — CRM refresh only (webhook already wrote DB); DocuSign poll only if stale. */
    useEffect(() => {
        if (!isOpen) {
            contractModalWasOpenRef.current = false;
            awaitingDocuSignSendRef.current = false;
            prevContractStatusRef.current = "";
            pendingCcForSentRef.current = [];
            ccEmailDeliveredRef.current = false;
            if (!sentStepUnlockedRef.current) {
                contractWasSentRef.current = false;
                setSentAt(null);
            }
            return;
        }
        if (contractModalWasOpenRef.current) return;
        contractModalWasOpenRef.current = true;
        lastCrmStatusChangeAtRef.current = Date.now();
        const alreadySent =
            sentStepUnlockedRef.current ||
            isContractAlreadySent(resolvedContract, sentAtRef.current);
        if (alreadySent) {
            setSentStepUnlocked(true);
            hydrateSentAtFromContract(resolvedContract);
        }
        contractWasSentRef.current = alreadySent;
        prevContractStatusRef.current = String(resolvedContract?.status ?? "")
            .trim()
            .toUpperCase();
        void refreshContractSigningState(true, {
            syncDocuSign: true,
            forceDocuSignSync: false,
        });
    }, [isOpen, refreshContractSigningState, resolvedContract, hydrateSentAtFromContract]);

    const envelopeIdForSigningPoll = useMemo(
        () =>
            String(
                linkedEnvelopeId ||
                    sessionEnvelopeId ||
                    pickContractEnvelopeDocument(resolvedContract)?.envelopeId ||
                    "",
            ).trim(),
        [linkedEnvelopeId, sessionEnvelopeId, resolvedContract],
    );

    /**
     * Prefer DocuSign Connect + CRM refetch. Interval only refreshes CRM;
     * DocuSign API sync runs when Connect looks stale (3+ min without status change).
     */
    useEffect(() => {
        if (!isOpen || signingFinishedForPoll || !envelopeIdForSigningPoll) return;

        const pollId = window.setInterval(() => {
            const stale = shouldFallbackPollDocuSign({
                force: false,
                signingFinished: signingFinishedForPoll,
                lastCrmStatusAtMs: lastCrmStatusChangeAtRef.current,
                staleMs: DOCUSIGN_WEBHOOK_STALE_MS,
            });
            void refreshContractSigningState(true, {
                syncDocuSign: stale,
                forceDocuSignSync: false,
            });
        }, DOCUSIGN_CRM_STATUS_POLL_MS);
        return () => window.clearInterval(pollId);
    }, [
        isOpen,
        signingFinishedForPoll,
        envelopeIdForSigningPoll,
        refreshContractSigningState,
    ]);

    /** When user returns from DocuSign, refresh CRM immediately; DocuSign poll only if still in-flight. */
    useEffect(() => {
        if (!isOpen || !envelopeIdForSigningPoll) return;
        const onFocus = () => {
            if (signingFinishedForPoll) {
                void refreshContractSigningState(true, { syncDocuSign: false });
                return;
            }
            const stale = shouldFallbackPollDocuSign({
                force: false,
                signingFinished: signingFinishedForPoll,
                lastCrmStatusAtMs: lastCrmStatusChangeAtRef.current,
                staleMs: DOCUSIGN_WEBHOOK_STALE_MS,
            });
            void refreshContractSigningState(true, {
                syncDocuSign: stale || awaitingDocuSignSendRef.current,
                forceDocuSignSync: false,
            });
        };
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [isOpen, envelopeIdForSigningPoll, refreshContractSigningState, signingFinishedForPoll]);

    /** Instant UI when Connect webhook updates status (Socket.IO). Never re-poll DocuSign. */
    useContractSigningStatusRealtime(applicationIdForLookup, (payload) => {
        lastCrmStatusChangeAtRef.current = Date.now();
        const status = String(payload?.status ?? "").trim().toLowerCase();
        if (
            status === "signed" ||
            status === "completed" ||
            status === "voided" ||
            status === "revoked" ||
            status === "declined" ||
            status === "expired"
        ) {
            awaitingDocuSignSendRef.current = false;
            const eid = String(payload?.envelopeId ?? "").trim();
            if (eid) markDocuSignEnvelopeTerminal(eid);
        }
        void refreshContractSigningStateRef.current(true, { syncDocuSign: false });
    });

    const invalidateDocuSignPdfCache = useCallback(() => {
        prefilledPdfCachedForEnvelopeRef.current = null;
        prefilledBoldSignPdfUrlRef.current = null;
    }, []);

    const buildDocuSignPrefillFieldsPayload = useCallback((): ContractPrefillField[] => {
        /** Full field ids (not Deal Review display dedupe) so every DocuSign data label gets the updated value. */
        const base: ContractPrefillField[] = dealPrefillFieldsForDocuSign
            .map((f) => ({
                id: f.id,
                value: String(f.value ?? "").trim(),
                label: f.label,
            }))
            .filter((f) => f.id && f.value);

        const addendumRefs = resolveAddendumDocumentsForDocuSignMerge().map(
            (item) => item.documentRef,
        );
        const disclosureRef = resolveDisclosureTemplateRefForDocuSignMerge();
        const mergedLayoutKeys = addendumRefs.filter((ref) => isPlatformLayoutKey(ref));
        const mergedTemplateIds = [
            ...addendumRefs.filter((ref) => !isPlatformLayoutKey(ref)),
            ...(disclosureRef ? [disclosureRef] : []),
        ];

        const effectiveOverrides = mergeContractPrefillOverrideLayers(
            contractPrefillOverrides,
            contractPrefillLoaded ? contractPrefillFromDb : null,
        );
        // Same live-offer path as Edit dialogs — raw overrides keep stale addendum/disclosure money.
        const offerDecision =
            (offerDecisionData as Record<string, unknown> | null) ?? null;
        const strippedMain = stripStaleOfferOverridesFromPersisted(
            effectiveOverrides,
            offerDecision,
            applicationForSigners,
            (resolvedContract as Record<string, unknown> | null) ?? null,
        );
        const dealMoneyPartial = contractPrefillFieldsToPartial(dealPrefillFieldsForDocuSign);
        const dealMoneyOverlay: Partial<BuildContractPrefillFieldsArgs> = {};
        for (const key of LIVE_OFFER_MONEY_PREFILL_KEYS) {
            const v = dealMoneyPartial[key];
            if (v != null && String(v).trim()) {
                (dealMoneyOverlay as Record<string, unknown>)[key] = v;
            }
        }
        const mainPrefillForTemplates = applyLiveClientIdentitySyncToPrefillPartial(
            applyLiveOfferSyncToPrefillPartial(
                { ...strippedMain, ...dealMoneyOverlay },
                applicationForSigners,
                offerDecision,
                {
                    contract: (resolvedContract as Record<string, unknown> | null) ?? null,
                },
            ),
            applicationForSigners,
        );
        const contractPrefillOverridesRaw = {
            ...(resolvedContract != null &&
            typeof resolvedContract.contractPrefillOverrides === "object" &&
            resolvedContract.contractPrefillOverrides != null &&
            !Array.isArray(resolvedContract.contractPrefillOverrides)
                ? (resolvedContract.contractPrefillOverrides as Record<string, unknown>)
                : {}),
            ...mainPrefillForTemplates,
            [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: documentTemplatePrefillByMappingId,
        };

        let payload = applyDocumentTemplateMappingPrefillOverrides({
            prefillFieldsPayload: base,
            mergedTemplateIds,
            mergedLayoutKeys,
            templateMappingRows: templateMappings,
            contractPrefillOverridesRaw,
            contract: resolvedContract as Record<string, unknown> | null,
            application: applicationForSigners as unknown as Record<string, unknown> | null,
            offerDecision,
            agreementDate: formatDate(new Date()),
            mainPrefillOverrides: mainPrefillForTemplates,
            bankDetail: contractPrefillRecords.bankDetail ?? null,
        });

        const mappingId = linkedDisclosureMapping?.id;
        const savedOverrides =
            mappingId != null ? documentTemplatePrefillByMappingId[mappingId] ?? null : null;

        const disclosureFields = buildExpandedDisclosurePrefillFieldsForMapping({
            mappingRow: linkedDisclosureMapping,
            savedOverridesForMapping: savedOverrides,
            contract: resolvedContract as Record<string, unknown> | null,
            application: applicationForSigners as unknown as Record<string, unknown> | null,
            offerDecision,
            agreementDate: formatDate(new Date()),
            mainPrefillOverrides: mainPrefillForTemplates,
            bankDetail: contractPrefillRecords.bankDetail ?? null,
        });

        let mergedPayload = mergeExpandedDisclosurePrefillIntoPayload(payload, disclosureFields);

        // Same as ContractTab send: selected funder wins for addendum tabs (Flex / BT / Case Takeover).
        // Disclosure merge otherwise forces platform "Woodmere" onto shared `funder_name`.
        const funderPlainName =
            formatFunderSelectLabel(selectedFunderProfile ?? undefined) ||
            String(selectedFunder || "").trim();
        applyFunderDisclosureContactPrefill(mergedPayload, selectedFunderProfile, {
            funderDisplayName: funderPlainName,
        });
        const funderNameWithDealPrefix = formatFunderNameWithDealIdPrefix(
            selectedFunderProfile?.name ?? selectedFunder,
            selectedFunderProfile?.dealIdPrefix,
            selectedFunderProfile?.displayName,
        );
        if (funderNameWithDealPrefix) {
            const existing = mergedPayload.find((f) => f.id === "funder_name_with_deal_prefix");
            if (existing) {
                existing.value = funderNameWithDealPrefix;
            } else {
                mergedPayload.push({
                    id: "funder_name_with_deal_prefix",
                    label: "Funder name (Deal ID prefix)",
                    value: funderNameWithDealPrefix,
                });
            }
        }
        const addendumKey = addendumRefs
            .join(" ")
            .trim()
            .toLowerCase();
        if (funderPlainName && /case_takeover/i.test(addendumKey)) {
            const existingScoped = mergedPayload.find(
                (f) => f.id === "case_takeover_addendum_funder_name",
            );
            if (existingScoped) {
                existingScoped.value = funderPlainName;
            } else {
                mergedPayload.push({
                    id: "case_takeover_addendum_funder_name",
                    label: "Funder Name",
                    value: funderPlainName,
                });
            }
            const existingShared = mergedPayload.find((f) => f.id === "funder_name");
            if (existingShared) {
                existingShared.value = funderPlainName;
            } else {
                mergedPayload.push({
                    id: "funder_name",
                    label: "Funder name",
                    value: funderPlainName,
                });
            }
        }

        const firstOwner = contractPrefillRecords.owners?.[0] as
            | Record<string, unknown>
            | undefined;
        const secondOwner = contractPrefillRecords.owners?.[1] as
            | Record<string, unknown>
            | undefined;
        const primaryOwnerName =
            resolveOwnerRowFullName(firstOwner) ||
            String(
                dealPrefillFieldsForDocuSign.find((f) => f.id === "owner1_guarantor_name")
                    ?.value || "",
            ).trim();
        // Always restore person name onto client_name after disclosure merge —
        // disclosure merchant expansion must not leave business name on RPA page-2 tabs
        // (e.g. client_name__p2_p87), including single-owner deals.
        mergedPayload = applyPrimaryGuarantorNamesToPrefillFields(
            mergedPayload,
            primaryOwnerName,
            {
                primarySs: String(firstOwner?.ssnNumber ?? firstOwner?.ssn ?? "").trim(),
                primaryDriverLicense: String(
                    firstOwner?.driverLicenseNumber ?? firstOwner?.driverLicense ?? "",
                ).trim(),
            },
        );
        if (activeOwnerCountForPrefill >= 2) {
            const signerRoles = buildDocuSignRolesForSync();
            const secondOwnerName =
                resolveSecondOwnerSignerName(
                    signerRoles,
                    activeOwnerCountForPrefill,
                    contractPrefillRecords.owners ?? null,
                ) || resolveOwnerRowFullName(secondOwner);
            mergedPayload = applySecondOwnerNameToPrefillFields(mergedPayload, {
                ownerCount: activeOwnerCountForPrefill,
                secondOwnerName,
                secondOwnerSs: String(secondOwner?.ssnNumber ?? secondOwner?.ssn ?? "").trim(),
                secondOwnerDriverLicense: String(
                    secondOwner?.driverLicenseNumber ?? secondOwner?.driverLicense ?? "",
                ).trim(),
            });
        }

        return applyTexasContractUsdMoneyToPrefillFields(
            clearParty2PrefillFieldPayload(
                mergedPayload,
                activeOwnerCountForPrefill,
            ),
            {
                funderName:
                    String(selectedFunderProfile?.name ?? "").trim() ||
                    String(selectedFunder || "").trim() ||
                    formatFunderSelectLabel(selectedFunderProfile ?? undefined) ||
                    String((resolvedContract as { funderName?: unknown })?.funderName ?? "").trim(),
                state:
                    String(selectedState || "").trim() ||
                    String((resolvedContract as { state?: unknown })?.state ?? "").trim(),
                layoutKey: selectedFunderProfile
                    ? resolveLayoutKeyForProfile(selectedFunderProfile)
                    : "",
            },
        );
    }, [
        dealPrefillFieldsForDocuSign,
        activeOwnerCountForPrefill,
        resolveAddendumDocumentsForDocuSignMerge,
        resolveDisclosureTemplateRefForDocuSignMerge,
        contractPrefillOverrides,
        contractPrefillLoaded,
        contractPrefillFromDb,
        resolvedContract,
        documentTemplatePrefillByMappingId,
        templateMappings,
        applicationForSigners,
        contractPrefillRecords.bankDetail,
        contractPrefillRecords.owners,
        linkedDisclosureMapping,
        buildDocuSignRolesForSync,
        selectedFunder,
        selectedFunderProfile,
        selectedState,
        resolveLayoutKeyForProfile,
        offerDecisionData,
    ]);

    const syncPrefillToDraftEnvelope = useCallback(
        async (options?: { envelopeId?: string | null }) => {
            // Sender view is open — do not push CRM onto tabs (would wipe DocuSign edits).
            if (crmPrefillFrozenForOpenDraftRef.current) return;
            const envelopeId = String(
                options?.envelopeId ||
                    sessionEnvelopeIdRef.current ||
                    linkedEnvelopeIdRef.current ||
                    sessionEnvelopeId ||
                    linkedEnvelopeId ||
                    "",
            ).trim();
            if (!envelopeId) return;
            const fields = buildDocuSignPrefillFieldsPayload();
            if (!fields.length) return;
            try {
                const result = await patchDocuSignPrefillFields(envelopeId, fields);
                docuSignPrefillSyncToast(result, { hasDraftEnvelope: true });
                draftPreparedPrefillFingerprintRef.current = prefillDraftFingerprint;
                lastPrefillSyncFailureToastKeyRef.current = null;
                invalidateDocuSignPdfCache();
                void loadPrefilledPdfFromDocuSign(envelopeId, {
                    manageLoading: false,
                    maxAttempts: 1,
                });
            } catch (err) {
                console.warn("[DocuSign] prefill sync to draft envelope failed:", err);
                // Still mark this fingerprint handled so the auto-sync effect does not
                // re-fire (and toast) on every callback identity change.
                draftPreparedPrefillFingerprintRef.current = prefillDraftFingerprint;
                const toastKey = `${envelopeId}:${prefillDraftFingerprint}`;
                if (lastPrefillSyncFailureToastKeyRef.current !== toastKey) {
                    lastPrefillSyncFailureToastKeyRef.current = toastKey;
                    toast.warning(
                        "Prefill saved in CRM, but the DocuSign draft could not be updated. Use Review & send to refresh the draft.",
                    );
                }
            }
        },
        [
            sessionEnvelopeId,
            linkedEnvelopeId,
            buildDocuSignPrefillFieldsPayload,
            prefillDraftFingerprint,
            invalidateDocuSignPdfCache,
            loadPrefilledPdfFromDocuSign,
        ],
    );

    const syncPrefillToDraftEnvelopeRef = useRef(syncPrefillToDraftEnvelope);
    syncPrefillToDraftEnvelopeRef.current = syncPrefillToDraftEnvelope;

    /**
     * After Deal Review / Edit Prefill saves, React state is fresh here — but once
     * Review & open has frozen the draft for sender-view editing, do not patch tabs
     * (user must click Review & send again to rebuild from CRM).
     */
    useEffect(() => {
        if (crmPrefillFrozenForOpenDraftRef.current) return;
        const prepared = draftPreparedPrefillFingerprintRef.current;
        if (prepared == null || prepared === prefillDraftFingerprint) return;
        const eid = String(
            sessionEnvelopeIdRef.current || linkedEnvelopeIdRef.current || "",
        ).trim();
        if (!eid) {
            draftPreparedPrefillFingerprintRef.current = null;
            return;
        }
        // Claim before the async call so effect re-runs from unstable callback deps
        // cannot stack the same sync + toast while a request is in flight / failed.
        draftPreparedPrefillFingerprintRef.current = prefillDraftFingerprint;
        void syncPrefillToDraftEnvelopeRef.current({ envelopeId: eid });
    }, [prefillDraftFingerprint]);

    const applyDisclosureCalculation = useCallback(
        async (args: {
            inputs: import("./contractdata/disclosureAprCalculator").DisclosureCalculatorInputs;
            metrics: import("./contractdata/disclosureAprCalculator").DisclosureCalculatorResult;
        }) => {
            const mappingId = linkedDisclosureMapping?.id;
            const cid = effectiveContractId;
            if (!mappingId || cid == null || !Number.isFinite(cid)) {
                toast.error("Link a state disclosure before applying calculated values.");
                return;
            }

            const fieldOverrides = mapDisclosureMetricsToEditorFieldOverrides(args.metrics, {
                merchantName:
                    args.inputs.merchantName ||
                    resolveContractBusinessLegalNameForPrefill(
                        (resolvedContract ?? {}) as Record<string, unknown>,
                        applicationData,
                    ) ||
                    String(resolvedContract?.legalName ?? "").trim() ||
                    undefined,
                signatureDate: args.inputs.disbursementDate,
                state: args.inputs.state,
                inputs: args.inputs,
            });

            const priorBlob = { ...documentTemplatePrefillByMappingId };
            priorBlob[mappingId] = fieldOverrides;

            const existingOverrides =
                resolvedContract != null &&
                typeof resolvedContract.contractPrefillOverrides === "object" &&
                resolvedContract.contractPrefillOverrides != null &&
                !Array.isArray(resolvedContract.contractPrefillOverrides)
                    ? {
                          ...(resolvedContract.contractPrefillOverrides as Record<string, unknown>),
                      }
                    : {};

            const nextContractPrefillOverrides: Record<string, unknown> = {
                ...existingOverrides,
                [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: priorBlob,
                estimatedAnnualPercentageRate: String(args.metrics.estimatedAnnualPercentageRate),
            };

            setSavingDisclosureCalculation(true);
            try {
                const result = await dispatch(
                    updateContract({
                        id: cid,
                        data: { contractPrefillOverrides: nextContractPrefillOverrides },
                    }),
                ).unwrap();
                const payload = (result as { data?: unknown })?.data ?? result;
                const fullSaved =
                    (payload as { contractPrefillOverrides?: unknown } | null)
                        ?.contractPrefillOverrides ?? nextContractPrefillOverrides;
                setDocumentTemplatePrefillByMappingId(
                    parseDocumentTemplatePrefillByMappingId(fullSaved),
                );
                setResolvedContract((prev) =>
                    prev ? { ...prev, contractPrefillOverrides: fullSaved ?? null } : prev,
                );
                toast.success("Disclosure calculation applied.");
                setDisclosureCalcModalOpen(false);
            } catch (err: unknown) {
                const msg =
                    typeof err === "string"
                        ? err
                        : String(
                              (err as { message?: string })?.message ||
                                  "Failed to save disclosure calculation.",
                          );
                toast.error(msg);
            } finally {
                setSavingDisclosureCalculation(false);
            }
        },
        [
            linkedDisclosureMapping?.id,
            effectiveContractId,
            documentTemplatePrefillByMappingId,
            resolvedContract,
            applicationData,
            dispatch,
        ],
    );

    const applySpaCalculation = useCallback(
        async (spa: string) => {
            setSavingSpaCalculation(true);
            try {
                const result = await persistCalculatedPurchasePercent({
                    dispatch,
                    contractId: effectiveContractId,
                    spa,
                    persistedPrefillOverrides: contractPrefillLoaded ? contractPrefillFromDb : null,
                    additionalContractPrefillJson: {
                        [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]:
                            documentTemplatePrefillByMappingId,
                    },
                });
                if (!result.saved || !result.mainSaved) {
                    toast.warn(
                        "SPA calculated but could not save. Open a contract record and try again.",
                    );
                    return;
                }
                const main = result.mainSaved;
                setContractPrefillFromDb(main);
                setResolvedContract((prev) =>
                    prev
                        ? {
                              ...prev,
                              ...contractPrefillToContractColumnUpdate(main),
                              contractPrefillOverrides:
                                  result.fullSaved != null
                                      ? {
                                            ...(typeof prev.contractPrefillOverrides === "object" &&
                                            prev.contractPrefillOverrides != null &&
                                            !Array.isArray(prev.contractPrefillOverrides)
                                                ? (prev.contractPrefillOverrides as Record<
                                                      string,
                                                      unknown
                                                  >)
                                                : {}),
                                            ...result.fullSaved,
                                        }
                                      : prev.contractPrefillOverrides,
                          }
                        : prev,
                );
                toast.success(`Specified percentage calculated and saved: ${spa}%`);
                setSpaCalcModalOpen(false);
            } catch (err: unknown) {
                const msg =
                    typeof err === "string"
                        ? err
                        : String(
                              (err as { message?: string })?.message ||
                                  "Failed to save specified percentage.",
                          );
                toast.error(msg);
                throw err;
            } finally {
                setSavingSpaCalculation(false);
            }
        },
        [
            dispatch,
            effectiveContractId,
            contractPrefillLoaded,
            contractPrefillFromDb,
            documentTemplatePrefillByMappingId,
        ],
    );

    const forceReloadDocuSignPdfPreview = useCallback(() => {
        invalidateDocuSignPdfCache();
        if (pdfRightPaneTab !== "docusign") {
            return;
        }
        void loadPrefilledPdfFromDocuSign(undefined, { maxAttempts: 1 });
    }, [
        invalidateDocuSignPdfCache,
        pdfRightPaneTab,
        linkedEnvelopeId,
        sessionEnvelopeId,
        loadPrefilledPdfFromDocuSign,
    ]);

    useEffect(() => {
        if (!isOpen) {
            didSuggestSentTabThisOpenRef.current = false;
            return;
        }
        if (!sentStepUnlocked && !isContractAlreadySent(resolvedContract, sentAt)) return;
        if (didSuggestSentTabThisOpenRef.current) return;
        if (activeStep !== "documents") return;
        setActiveStep("sent");
        didSuggestSentTabThisOpenRef.current = true;
    }, [isOpen, activeStep, resolvedContract, sentAt, sentStepUnlocked]);

    /** Add one ordered addendum instance. Existing rows are intentionally preserved. */
    const addAddendumTemplateMapping = useCallback(
        async (templateRef: string) => {
            if (effectiveContractId == null) {
                toast.error("Create or open a contract before adding addendums.");
                return;
            }
            const ref = String(templateRef || "").trim();
            if (!ref || addingAddendum) return;
            setAddingAddendum(true);
            try {
                await axiosPost(`/contract/${effectiveContractId}/document-template-mappings`, {
                    documentType: "addendum",
                    templateRef: ref,
                });
                setSelectedAddendumOption("");
                invalidateDocuSignDraftSession();
                await fetchTemplateMappings();
                toast.success("Addendum added. Pick again to add another (same or different).");
            } catch (error: any) {
                const msg =
                    error?.response?.data?.message ||
                    error?.message ||
                    "Failed to add addendum template.";
                setDocumentUploadMessage(msg);
                toast.error(msg);
            } finally {
                setAddingAddendum(false);
            }
        },
        [
            effectiveContractId,
            fetchTemplateMappings,
            invalidateDocuSignDraftSession,
            addingAddendum,
        ],
    );

    const removeAddendumTemplateMapping = useCallback(
        async (mappingId: string) => {
            if (effectiveContractId == null || !mappingId) return;
            let alreadyRemoving = false;
            setRemovingAddendumMappingIds((prev) => {
                if (prev.has(mappingId)) {
                    alreadyRemoving = true;
                    return prev;
                }
                const next = new Set(prev);
                next.add(mappingId);
                return next;
            });
            if (alreadyRemoving) return;
            try {
                await axiosDelete(
                    `/contract/${effectiveContractId}/document-template-mappings/${mappingId}`,
                );

                const nextPrefillBlob = { ...documentTemplatePrefillByMappingId };
                const hadPrefill = Object.prototype.hasOwnProperty.call(
                    nextPrefillBlob,
                    mappingId,
                );
                if (hadPrefill) delete nextPrefillBlob[mappingId];

                const nextEnvelopeBlob = { ...documentTemplateEnvelopeByMappingId };
                const hadEnvelope = Object.prototype.hasOwnProperty.call(
                    nextEnvelopeBlob,
                    mappingId,
                );
                if (hadEnvelope) delete nextEnvelopeBlob[mappingId];

                if (hadPrefill || hadEnvelope) {
                    const existingOverrides =
                        resolvedContract != null &&
                        typeof resolvedContract.contractPrefillOverrides === "object" &&
                        resolvedContract.contractPrefillOverrides != null &&
                        !Array.isArray(resolvedContract.contractPrefillOverrides)
                            ? {
                                  ...(resolvedContract.contractPrefillOverrides as Record<
                                      string,
                                      unknown
                                  >),
                              }
                            : {};
                    const contractPrefillOverrides: Record<string, unknown> = {
                        ...existingOverrides,
                        [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: nextPrefillBlob,
                        [DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY]: nextEnvelopeBlob,
                    };
                    await dispatch(
                        updateContract({
                            id: effectiveContractId,
                            data: { contractPrefillOverrides },
                        }),
                    ).unwrap();
                    setDocumentTemplatePrefillByMappingId(nextPrefillBlob);
                    setResolvedContract((prev) =>
                        prev ? { ...prev, contractPrefillOverrides } : prev,
                    );
                }

                invalidateDocuSignDraftSession();
                await fetchTemplateMappings();
            } catch (error: any) {
                const msg =
                    error?.response?.data?.message ||
                    error?.message ||
                    "Failed to remove addendum template.";
                setDocumentUploadMessage(msg);
                toast.error(msg);
            } finally {
                setRemovingAddendumMappingIds((prev) => {
                    if (!prev.has(mappingId)) return prev;
                    const next = new Set(prev);
                    next.delete(mappingId);
                    return next;
                });
            }
        },
        [
            effectiveContractId,
            fetchTemplateMappings,
            documentTemplatePrefillByMappingId,
            documentTemplateEnvelopeByMappingId,
            resolvedContract,
            dispatch,
            invalidateDocuSignDraftSession,
        ],
    );

    /** Funder switch: drop added addendums whose template belongs to another funder. */
    const pruneAddendumMappingsForDocsFunder = useCallback(
        async (docsFunderId: string | null) => {
            for (const row of [...addendumTemplateMappingsRef.current]) {
                const ref = getAddendumDropdownRef(row?.template);
                if (!ref) continue;
                if (!isAddendumRefValidForDocsFunder(ref, docsFunderId, boldSignTemplates)) {
                    await removeAddendumTemplateMapping(String(row.id || ""));
                }
            }
        },
        [boldSignTemplates, removeAddendumTemplateMapping],
    );

    const lookupDisclosureTemplateRef = useCallback(
        async (
            state: string,
            frequency: string,
            docsFunderId?: string | null,
        ): Promise<string | null> => {
            const params = new URLSearchParams({
                type: "disclosure",
                state: normalizeStateForTemplateLookup(state),
                frequency: normalizeFrequencyForTemplateLookup(frequency),
            });
            const res = await axiosGet(`/contract/templates?${params.toString()}`);
            const rows = (res?.data?.data ?? []) as Array<{
                id?: string;
                pdfUrl?: string | null;
                layoutKey?: string | null;
                templateId?: string | null;
            }>;
            const layoutFunderId =
                docsFunderId !== undefined
                    ? docsFunderId
                    : disclosureDocsLayoutFunderIdRef.current;
            return pickDisclosureTemplateIdForFunder(
                Array.isArray(rows) ? rows : [],
                layoutFunderId,
                state,
                frequency,
            );
        },
        [],
    );

    /** One state disclosure per send — replace any existing disclosure mapping. */
    const setDisclosureTemplateMapping = useCallback(
        async (templateRef: string | null) => {
            if (effectiveContractId == null) return;
            const ref = String(templateRef || "").trim();
            try {
                const res = await axiosGet(
                    `/contract/${effectiveContractId}/document-template-mappings`,
                );
                const rows = (res?.data?.data ?? []) as ContractDocumentTemplateMappingRow[];
                const disclosureRows = rows.filter(isDisclosureMappingRow);
                if (!ref) {
                    if (disclosureRows.length === 0) return;
                } else if (
                    disclosureRows.length === 1 &&
                    mappingMatchesTemplateRef(disclosureRows[0], ref)
                ) {
                    return;
                }
                await Promise.all(
                    disclosureRows.map((row) =>
                        axiosDelete(
                            `/contract/${effectiveContractId}/document-template-mappings/${row.id}`,
                        ),
                    ),
                );
                if (ref) {
                    await axiosPost(`/contract/${effectiveContractId}/document-template-mappings`, {
                        documentType: "disclosure",
                        templateRef: ref,
                    });
                }
                await fetchTemplateMappings();
            } catch (error: any) {
                setDocumentUploadMessage(
                    error?.message || "Failed to update state disclosure template.",
                );
            }
        },
        [effectiveContractId, fetchTemplateMappings],
    );

    const syncDisclosureTemplateForState = useCallback(
        async (
            state: string,
            options?: { silent?: boolean; docsLayoutFunderId?: string | null },
        ) => {
            const picked = pickUsStateForSelect(state);
            if (!picked) {
                if (linkedDisclosureMappingRef.current) {
                    await setDisclosureTemplateMapping(null);
                }
                return;
            }
            if (effectiveContractId == null) return;
            const layoutFunderId =
                options?.docsLayoutFunderId !== undefined
                    ? options.docsLayoutFunderId
                    : disclosureDocsLayoutFunderIdRef.current;
            try {
                setLinkingDisclosureTemplate(true);
                const templateRef = await lookupDisclosureTemplateRef(
                    picked,
                    contractDisclosureFrequency,
                    layoutFunderId,
                );
                const current = linkedDisclosureMappingRef.current;
                const currentTemplateId = current ? mappingTemplateRowId(current) : "";
                if (!templateRef && !current) return;
                if (
                    templateRef &&
                    currentTemplateId === templateRef &&
                    disclosureMappingMatchesFunderDocuments(current, layoutFunderId)
                ) {
                    return;
                }
                if (!templateRef) {
                    await setDisclosureTemplateMapping(null);
                    if (!options?.silent) {
                        toast.info(`No disclosure PDF configured for ${picked}.`);
                    }
                    return;
                }
                await setDisclosureTemplateMapping(templateRef);
            } catch (error: any) {
                setDocumentUploadMessage(
                    error?.message || "Failed to link state disclosure template.",
                );
            } finally {
                setLinkingDisclosureTemplate(false);
            }
        },
        [
            contractDisclosureFrequency,
            effectiveContractId,
            lookupDisclosureTemplateRef,
            setDisclosureTemplateMapping,
        ],
    );

    /** Link disclosure once when reopening a contract that already has a saved state. */
    useEffect(() => {
        if (!isOpen) {
            disclosureAutoLinkKeyRef.current = "";
            return;
        }
        if (effectiveContractId == null || loadingTemplateMappings) return;
        const picked = pickUsStateForSelect(selectedState);
        if (!picked) return;
        const docsKey = disclosureDocsLayoutFunderId ?? "platform";
        if (
            linkedDisclosureMapping &&
            disclosureMappingMatchesState(linkedDisclosureMapping, picked) &&
            disclosureMappingMatchesFunderDocuments(
                linkedDisclosureMapping,
                disclosureDocsLayoutFunderId,
            )
        ) {
            return;
        }
        const key = `${effectiveContractId}:${picked}:${contractDisclosureFrequency}:${docsKey}`;
        if (disclosureAutoLinkKeyRef.current === key) return;
        disclosureAutoLinkKeyRef.current = key;
        void syncDisclosureTemplateForState(picked, {
            silent: true,
            docsLayoutFunderId: disclosureDocsLayoutFunderId,
        });
    }, [
        isOpen,
        effectiveContractId,
        loadingTemplateMappings,
        selectedState,
        contractDisclosureFrequency,
        disclosureDocsLayoutFunderId,
        linkedDisclosureMapping,
        syncDisclosureTemplateForState,
    ]);

    const persistContractEnvelopeHistory = useCallback(
        async (envelopeId: string, status = "draft") => {
            const cid = effectiveContractId;
            if (cid == null || !Number.isFinite(Number(cid))) return;
            const rawOverrides =
                normalizeContractPrefillOverrides(
                    (resolvedContract as { contractPrefillOverrides?: unknown } | null)
                        ?.contractPrefillOverrides,
                ) ?? {};
            const main = stripDocumentTemplateBlobFromPrefillOverrides(
                rawOverrides,
            ) as Record<string, unknown>;
            const signerRows =
                contractSignerOverrides?.length
                    ? contractSignerOverrides
                    : parseContractSignerOverridesFromPrefill(rawOverrides);
            const sendHistory = upsertDocumentSendHistory(parseDocumentSendHistory(rawOverrides), {
                envelopeId,
                documentKind: "contract",
                label: "Contract",
                status,
                updatedAt: new Date().toISOString(),
                termsSnapshot:
                    resolveTermsSnapshotFromContractPrefill(rawOverrides, envelopeId) ??
                    buildContractSendHistoryTermsSnapshot(
                        resolvedContract as Record<string, unknown> | null,
                    ),
            });
            const termsSnapshot =
                sendHistory.find((h) => h.envelopeId === envelopeId)?.termsSnapshot ??
                buildContractSendHistoryTermsSnapshot(
                    resolvedContract as Record<string, unknown> | null,
                );
            const statusNorm = String(status || "draft").trim().toLowerCase();
            // Refresh draft snap as the deal changes before send; never overwrite a sent snap here.
            const forceSnap = statusNorm === "draft" || statusNorm === "created";
            const withHistorySnap = upsertContractSendHistoryTermsSnapshot(
                {
                    ...pickPreservedDocuSignEnvelopeMetaFromPrefill(rawOverrides),
                    ...main,
                    ...(signerRows?.length
                        ? { [CONTRACT_SIGNER_OVERRIDES_KEY]: signerRows }
                        : {}),
                    [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: documentTemplatePrefillByMappingId,
                    [DOCUMENT_TEMPLATE_ENVELOPE_BY_MAPPING_ID_KEY]: documentTemplateEnvelopeByMappingId,
                    [DOCUMENT_SEND_HISTORY_KEY]: sendHistory,
                },
                {
                    envelopeId,
                    status,
                    termsSnapshot,
                    forceTermsSnapshot: forceSnap,
                },
            );
            const contractPrefillOverrides = withHistorySnap;
            await dispatch(
                updateContract({
                    id: Number(cid),
                    data: { contractPrefillOverrides },
                }),
            ).unwrap();
            setContractPrefillFromDb(
                stripDocumentTemplateBlobFromPrefillOverrides(
                    normalizeContractPrefillOverrides(contractPrefillOverrides) ?? null,
                ),
            );
            setResolvedContract((prev) =>
                prev && typeof prev === "object"
                    ? { ...prev, contractPrefillOverrides }
                    : prev,
            );
            onContractDocumentsChanged?.();
        },
        [
            effectiveContractId,
            resolvedContract,
            contractSignerOverrides,
            documentTemplatePrefillByMappingId,
            documentTemplateEnvelopeByMappingId,
            dispatch,
            onContractDocumentsChanged,
        ],
    );

    const loadMainContractTemplatePreview = useCallback(
        async (options?: {
            silent?: boolean;
            force?: boolean;
            funderProfileId?: string;
            funderName?: string;
        }) => {
            const profileId = String(
                options?.funderProfileId ?? selectedFunderProfileIdRef.current ?? "",
            ).trim();
            const profile =
                findFunderProfileById(fundersRef.current, profileId) ??
                (String(options?.funderName ?? selectedFunderRef.current ?? "").trim()
                    ? findFunderRef.current(options?.funderName ?? selectedFunderRef.current)
                    : undefined);
            const funderName = String(
                profile?.name ?? options?.funderName ?? selectedFunderRef.current ?? "",
            ).trim();
            if (!funderName) return;

            const state = pickUsStateForSelect(selectedStateRef.current) || undefined;
            const previewKey = `${profileId || funderName}:${state ?? ""}`;
            if (
                !options?.force &&
                lastAutoPreviewKeyRef.current === previewKey &&
                uploadedPreviewUrlRef.current
            ) {
                return;
            }

            const layoutKey = profile
                ? resolveLayoutKeyForProfileRef.current(profile)
                : resolveLayoutKeyRef.current(funderName, profileId);
            const requestId = ++mainContractPreviewRequestRef.current;
            setPreviewingMainContract(true);
            try {
                const preview = await fetchMainContractTemplatePreview({
                    layoutKey,
                    funderName,
                    funderProfileId: persistedFunderProfileIdForApi(profile),
                    state,
                    previewName: previewNameForRef.current(funderName, profileId),
                    fallbackUrl: fileUrl,
                    fallbackName: fileName,
                    findFunder: findFunderRef.current,
                    findFunderById: findFunderByIdRef.current,
                });
                if (requestId !== mainContractPreviewRequestRef.current) return;
                if (!preview?.url) {
                    setUploadedPreviewUrl(null);
                    uploadedPreviewUrlRef.current = null;
                    lastAutoPreviewKeyRef.current = "";
                    setDocumentUploadMessage(
                        funderName
                            ? `No contract PDF configured for ${funderName}.`
                            : "Select a funder to preview the contract template.",
                    );
                    return;
                }
                if (templatePreviewBlobUrlRef.current) {
                    URL.revokeObjectURL(templatePreviewBlobUrlRef.current);
                }
                if (preview.url.startsWith("blob:")) {
                    templatePreviewBlobUrlRef.current = preview.url;
                } else {
                    templatePreviewBlobUrlRef.current = null;
                }
                lastAutoPreviewKeyRef.current = previewKey;
                setActivePreview(null);
                setUploadedPreviewUrl(preview.url);
                uploadedPreviewUrlRef.current = preview.url;
                setPdfRightPaneTab("template");
                setActiveContractTemplateName(preview.name || "Contract.pdf");
                setDocumentUploadMessage(
                    `Showing contract: ${formatDropdownLabel(preview.name)}`,
                );
                if (!options?.silent) {
                    toast.success(`Previewing ${formatDropdownLabel(preview.name)}`);
                }
            } catch (error: unknown) {
                if (requestId !== mainContractPreviewRequestRef.current) return;
                const err = error as {
                    response?: { data?: { message?: string } };
                    message?: string;
                };
                setDocumentUploadMessage(
                    err?.response?.data?.message ||
                        err?.message ||
                        "Failed to load contract template PDF.",
                );
            } finally {
                if (requestId === mainContractPreviewRequestRef.current) {
                    setPreviewingMainContract(false);
                }
            }
        },
        [fileUrl, fileName],
    );

    const handlePreviewMainContractTemplate = useCallback(() => {
        void loadMainContractTemplatePreview({ force: true });
    }, [loadMainContractTemplatePreview]);

    const scheduleMainContractTemplatePreview = useCallback(
        (funderProfileIdOverride?: string) => {
            const profileId = String(
                funderProfileIdOverride ?? selectedFunderProfileIdRef.current ?? "",
            ).trim();
            if (!profileId && !selectedFunderRef.current.trim()) return;
            lastAutoPreviewKeyRef.current = "";
            uploadedPreviewUrlRef.current = null;
            setUploadedPreviewUrl(null);
            void loadMainContractTemplatePreview({
                silent: true,
                force: true,
                funderProfileId: profileId || undefined,
                funderName: selectedFunderRef.current,
            });
        },
        [loadMainContractTemplatePreview],
    );

    useEffect(() => {
        if (!isOpen || (!selectedFunderProfileId.trim() && !selectedFunder.trim())) return;
        if (activeStep !== "info" && activeStep !== "summary" && activeStep !== "documents") {
            return;
        }
        void loadMainContractTemplatePreview({ silent: true });
    }, [
        isOpen,
        activeStep,
        selectedFunder,
        selectedFunderProfileId,
        selectedState,
        funders,
        loadMainContractTemplatePreview,
    ]);

    const handlePreviewBoldSignTemplate = useCallback(
        async (row: ContractDocumentTemplateMappingRow) => {
            if (!boldSignTemplateIsPreviewable(row?.template)) {
                setDocumentUploadMessage(
                    "This template has no PDF URL or DocuSign template id.",
                );
                return;
            }
            const mappingRef = getAddendumDropdownRef(row?.template);
            try {
                setPreviewingTemplateId(String(row.id));
                const blob = await loadBoldSignTemplatePdfBlob({
                    template: row?.template,
                    axiosGet,
                    funderName: selectedFunderRef.current || null,
                    funderProfileId: selectedFunderProfileIdRef.current || null,
                    state: pickUsStateForSelect(selectedStateRef.current) || null,
                });
                if (templatePreviewBlobUrlRef.current) {
                    URL.revokeObjectURL(templatePreviewBlobUrlRef.current);
                }
                const url = URL.createObjectURL(blob);
                templatePreviewBlobUrlRef.current = url;
                setActivePreview(null);
                setUploadedPreviewUrl(url);
                setDocumentUploadMessage(
                    `Showing template: ${formatDropdownLabel(
                        row?.template?.name ||
                            (mappingRef && isPlatformLayoutKey(mappingRef)
                                ? supplementalOptionLabel(mappingRef)
                                : null) ||
                            formatDisclosureTemplateLabel(row) ||
                            row?.templateId ||
                            "Template",
                    )}`,
                );
            } catch (error: any) {
                const apiMsg =
                    error?.response?.data?.message ||
                    error?.message ||
                    "Failed to load template PDF.";
                setDocumentUploadMessage(apiMsg);
                toast.error(apiMsg);
            } finally {
                setPreviewingTemplateId(null);
            }
        },
        [],
    );

    useEffect(() => {
        return () => {
            if (templatePreviewBlobUrlRef.current) {
                URL.revokeObjectURL(templatePreviewBlobUrlRef.current);
                templatePreviewBlobUrlRef.current = null;
            }
        };
    }, []);

    const mainPrefillOverridesForTemplateDialog = useMemo(() => {
        if (!contractPrefillFromDb) return null;
        const o = { ...contractPrefillFromDb } as Record<string, unknown>;
        delete o[DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY];
        return stripStaleOfferOverridesFromPersisted(
            o as Partial<BuildContractPrefillFieldsArgs>,
            (offerDecisionData as Record<string, unknown> | null) ?? null,
            applicationData,
            resolvedContract,
        );
    }, [contractPrefillFromDb, offerDecisionData, applicationData, resolvedContract]);

    const prevActiveStepRef = useRef<ContractWizardStep>(activeStep);
    // Reset document-tab preview when leaving Documents (keep funder contract PDF on info/summary).
    useEffect(() => {
        const prev = prevActiveStepRef.current;
        prevActiveStepRef.current = activeStep;
        if (prev === "documents" && activeStep !== "documents") {
            setActivePreview(null);
            setUploadedPreviewUrl(null);
            uploadedPreviewUrlRef.current = null;
            lastAutoPreviewKeyRef.current = "";
            if (
                (activeStep === "info" || activeStep === "summary") &&
                selectedFunderRef.current.trim()
            ) {
                void loadMainContractTemplatePreview({ silent: true, force: true });
            }
        }
    }, [activeStep, loadMainContractTemplatePreview]);

    useEffect(() => {
        if (!isOpen || effectiveContractId == null) return;
        dispatch(getUploadedContractDocuments(effectiveContractId));
    }, [effectiveContractId, dispatch, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        void fetchTemplateMappings();
    }, [isOpen, fetchTemplateMappings]);

    useEffect(() => {
        if (!isOpen) return;
        dispatch(getBoldSignTemplates({}));
    }, [dispatch, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        void (async () => {
            const latest = await fetchLatestContractTemplate();
            if (cancelled || !latest) return;
            setActiveContractTemplateName(latest.originalName);
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    // Keep effectiveTemplateId in sync with prop, then VITE_DOCUSIGN_TEMPLATE_ID, then CRM template list
    useEffect(() => {
        const fromProp = String(templateId ?? "").trim();
        if (fromProp) {
            setEffectiveTemplateId(fromProp);
            return;
        }
        if (DEFAULT_DOCUSIGN_TEMPLATE_ID) {
            setEffectiveTemplateId(DEFAULT_DOCUSIGN_TEMPLATE_ID);
            return;
        }
        setEffectiveTemplateId(null);
    }, [templateId]);

    useEffect(() => {
        if (!isOpen || !selectedFunder.trim() || String(templateId ?? "").trim()) return;
        let cancelled = false;
        void (async () => {
            const tid = await fetchDocuSignTemplateIdForFunder(selectedFunder);
            if (cancelled || !tid) return;
            setEffectiveTemplateId(tid);
        })();
        return () => {
            cancelled = true;
        };
    }, [isOpen, selectedFunder, templateId]);

    useEffect(() => {
        if (effectiveTemplateId) return;
        if (!Array.isArray(boldSignTemplates) || boldSignTemplates.length === 0) return;
        const first = boldSignTemplates[0];
        const tid = String(first?.templateId || first?.id || "").trim();
        if (tid) setEffectiveTemplateId(tid);
    }, [effectiveTemplateId, boldSignTemplates]);

    useEffect(() => {
        if (!isOpen || !applicationIdForLookup) return;
        dispatch(getBankDetails({ application: applicationIdForLookup }));
    }, [isOpen, applicationIdForLookup, dispatch]);

    // Pre-fetch related records by contractId for Info/Summary panels
    useEffect(() => {
        if (!isOpen || (activeStep !== "info" && activeStep !== "summary") || effectiveContractId == null) return;
        const id = effectiveContractId;
        dispatch(getAllAddendum({ contractId: id }));
        dispatch(getAllACH({ contractId: id }));
        dispatch(getAllEPO({ contractId: id }));
        dispatch(getAllContractOwners({ contractId: id }));
        dispatch(getAllContractGuarantors({ contractId: id }));
    }, [isOpen, activeStep, effectiveContractId, dispatch]);

    useEffect(() => {
        if (!activeInfoPanel || effectiveContractId == null) return;
        const id = effectiveContractId;
        if (activeInfoPanel === "addendum") {
            dispatch(getAllAddendum({ contractId: id }));
        } else if (activeInfoPanel === "ach") {
            dispatch(getAllACH({ contractId: id }));
        } else if (activeInfoPanel === "epo") {
            dispatch(getAllEPO({ contractId: id }));
        } else if (activeInfoPanel === "owner") {
            dispatch(getAllContractOwners({ contractId: id }));
        } else if (activeInfoPanel === "guarantor") {
            dispatch(getAllContractGuarantors({ contractId: id }));
        }
    }, [activeInfoPanel, effectiveContractId, dispatch]);

    // Keep editor collapsed by default on Info step.
    // It opens only when user explicitly chooses "Open Editor" from a record's Edit action.
    useEffect(() => {
        if (!activeInfoPanel) return;
        setSelectedInfoPanels((prev) =>
            prev.includes(activeInfoPanel) ? prev : [...prev, activeInfoPanel]
        );
    }, [activeInfoPanel]);

    useEffect(() => {
        if (activeInfoPanel !== "addendum") return;
        const rows = Array.isArray(addendumListState.data) ? addendumListState.data : [];
        if (!rows.length) return;
        const flattened = rows.flatMap((item: any, idx: number) => {
            const baseId = String(item?.id ?? idx + 1);
            const slots = [1, 2, 3].map((slot) => {
                const legalName = String(item?.[`legalName${slot}`] || "");
                const dba = String(item?.[`dba${slot}`] || "");
                const typeOfEntity = String(item?.[`typeOfEntity${slot}`] || "");
                const ein = String(item?.[`ein${slot}`] || "");
                const mailingAddress = String(item?.[`mailingAddress${slot}`] || "");
                const hasData = [legalName, dba, typeOfEntity, ein, mailingAddress]
                    .some((v) => v.trim() !== "");
                if (!hasData) return null;
                return {
                    id: slot === 1 ? baseId : `${baseId}-${slot}`,
                    legalName,
                    dba,
                    typeOfEntity,
                    ein,
                    mailingAddress,
                    addendumDated: slot === 1 ? String(item?.addendumDated || "") : "",
                    principalOwner: slot === 1 ? String(item?.principalOwner || "") : "",
                    principalBusiness: slot === 1 ? String(item?.principalBusiness || "") : "",
                    businessLocation: slot === 1 ? String(item?.businessLocation || "") : "",
                    principalState: slot === 1 ? String(item?.principalState || "") : "",
                    principalOwnerAmount1: slot === 1 ? String(item?.principalOwnerAmount1 || "") : "",
                    principalOwnerAmount2: slot === 1 ? String(item?.principalOwnerAmount2 || "") : "",
                    principalOwner1Name: slot === 1 ? String(item?.principalOwner1Name || "") : "",
                    principalOwner1Date: slot === 1 ? String(item?.principalOwner1Date || "") : "",
                    principalOwner2Name: slot === 1 ? String(item?.principalOwner2Name || "") : "",
                    principalOwner2Date: slot === 1 ? String(item?.principalOwner2Date || "") : "",
                };
            }).filter(Boolean) as Array<{
                id: string;
                legalName: string;
                dba: string;
                typeOfEntity: string;
                ein: string;
                mailingAddress: string;
                addendumDated: string;
                principalOwner: string;
                principalBusiness: string;
                businessLocation: string;
                principalState: string;
                principalOwnerAmount1: string;
                principalOwnerAmount2: string;
                principalOwner1Name: string;
                principalOwner1Date: string;
                principalOwner2Name: string;
                principalOwner2Date: string;
            }>;
            return slots;
        });
        if (flattened.length) {
            setAddendumEntries(flattened);
        }
    }, [activeInfoPanel, addendumListState.data]);

    useEffect(() => {
        if (activeInfoPanel !== "ach") return;
        const rows = Array.isArray(achListState.data) ? achListState.data : [];
        if (!rows.length) return;
        setAchEntries(
            rows.map((item: any, idx: number) => ({
                id: String(item?.id ?? idx + 1),
                bankName: String(item?.bankName || ""),
                fullNameOnAccount: String(item?.accountHolderName || ""),
                accountNumber: String(item?.accountNumber || ""),
                routingNumber: String(item?.routingNumber || ""),
                ach_authorization_bank_portal_website: String(item?.ach_authorization_bank_portal_website || ""),
                ach_authorization_username: String(item?.ach_authorization_username || ""),
                ach_authorization_password: String(item?.ach_authorization_password || ""),
                ach_authorization_security_question1: String(item?.ach_authorization_security_question1 || ""),
                ach_authorization_security_answer1: String(item?.ach_authorization_security_answer1 || ""),
                ach_authorization_security_question2: String(item?.ach_authorization_security_question2 || ""),
                ach_authorization_security_answer2: String(item?.ach_authorization_security_answer2 || ""),
                ach_authorization_security_question3: String(item?.ach_authorization_security_question3 || ""),
                ach_authorization_security_answer3: String(item?.ach_authorization_security_answer3 || ""),
                ach_authorization_other_infomation: String(item?.ach_authorization_other_infomation || ""),
                ach_authorization_reference_name1: String(item?.ach_authorization_reference_name1 || ""),
                ach_authorization_reference_number_1: String(item?.ach_authorization_reference_number_1 || ""),
                ach_authorization_reference_relationship1: String(item?.ach_authorization_reference_relationship1 || ""),
                ach_authorization_reference_name2: String(item?.ach_authorization_reference_name2 || ""),
                ach_authorization_reference_number2: String(item?.ach_authorization_reference_number2 || ""),
                ach_authorization_reference_relationship2: String(item?.ach_authorization_reference_relationship2 || ""),
                ach_authorization_reference_name3: String(item?.ach_authorization_reference_name3 || ""),
                ach_authorization_reference_number3: String(item?.ach_authorization_reference_number3 || ""),
                ach_authorization_reference_relationship3: String(item?.ach_authorization_reference_relationship3 || ""),
                dba: String(item?.dba || ""),
                phone: String(item?.phone || ""),
                address: String(item?.address || ""),
                city: String(item?.city || ""),
                state: String(item?.state || ""),
                zip: String(item?.zip || ""),
                bankBranchCity: String(item?.bankBranchCity || ""),
                bankState: String(item?.bankState || ""),
                bankZip: String(item?.bankZip || ""),
            })),
        );
    }, [activeInfoPanel, achListState.data]);

    useEffect(() => {
        if (activeInfoPanel !== "epo") return;
        const rows = Array.isArray(epoListState.data) ? epoListState.data : [];
        if (!rows.length) return;
        const flattened = rows.flatMap((item: any, idx: number) => {
            const baseId = String(item?.id ?? idx + 1);
            const slots = [1, 2, 3].map((slot) => {
                const legalName = String(
                    item?.[`amountReceived${slot}`] ||
                    (slot === 1 ? item?.legalName : "") ||
                    "",
                );
                const receivedDate = String(item?.[`receivedDate${slot}`] || "");
                const hasData = legalName.trim() !== "" || receivedDate.trim() !== "";
                if (!hasData) return null;
                return {
                    id: slot === 1 ? baseId : `${baseId}-${slot}`,
                    legalName,
                    receivedDate,
                };
            }).filter(Boolean) as Array<{ id: string; legalName: string; receivedDate: string }>;
            return slots;
        });
        if (flattened.length) {
            setEpoEntries(flattened);
        }
    }, [activeInfoPanel, epoListState.data]);

    useEffect(() => {
        if (activeInfoPanel !== "owner") return;
        const contractRows = Array.isArray(ownerListState.data) ? ownerListState.data : [];
        const liveRows = resolveOwnerRowsForContractPrefill(
            applicationForSigners,
            contractRows as Record<string, unknown>[],
        );
        if (!liveRows.length && !contractRows.length) return;
        const source = liveRows.length ? liveRows : (contractRows as Record<string, unknown>[]);
        setOwnerEntries(
            source.map((item: Record<string, unknown>, idx: number) => ({
                id: String(item?.id ?? idx + 1),
                ownerFirstName: String(item?.firstName || item?.ownerFirstName || "").trim(),
                ownerLastName: String(item?.lastName || item?.ownerLastName || "").trim(),
                ownerEmail: String(item?.email || item?.ownerEmail || ""),
                ownerPhone: String(item?.phone || ""),
                ownerAddress: String(item?.address || item?.address1 || ""),
                state: String(item?.state || ""),
                city: String(item?.city || ""),
                zipCode: String(item?.zip || item?.zipCode || ""),
                ownershipPercentage: String(item?.ownershipPercentage ?? ""),
            })),
        );
    }, [activeInfoPanel, ownerListState.data, applicationForSigners]);

    useEffect(() => {
        if (activeInfoPanel !== "guarantor") return;
        const rows = Array.isArray(guarantorListState.data)
            ? guarantorListState.data
            : [];
        if (!rows.length) return;
        setGuarantorEntries(
            rows.map((item: any, idx: number) => ({
                id: String(item?.id ?? idx + 1),
                guarantorFirstName: String(item?.firstName || "").trim(),
                guarantorLastName: String(item?.lastName || "").trim(),
                guarantorEmail: String(item?.email || ""),
                guarantorPhone: String(item?.phone || ""),
                guarantorAddress: String(item?.address || ""),
                state: String(item?.state || ""),
                city: String(item?.city || ""),
                zipCode: String(item?.zip || ""),
                ssnNumber: String(item?.ssn || ""),
                driverLicenseNumber: String(item?.driverLicense || ""),
                typeOfEntity: String(item?.entityType || ""),
            })),
        );
    }, [activeInfoPanel, guarantorListState.data]);

    const createTempId = () =>
        `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const isPersistedRow = (id: string) => Number.isFinite(Number(id));

    const resetPanelEntries = (
        panel: "addendum" | "ach" | "epo" | "owner" | "guarantor",
    ) => {
        if (panel === "addendum") {
            setAddendumEntries([{
                id: "tmp-1",
                legalName: "",
                dba: "",
                typeOfEntity: "",
                ein: "",
                mailingAddress: "",
                addendumDated: "",
                principalOwner: "",
                principalBusiness: "",
                businessLocation: "",
                principalState: "",
                principalOwnerAmount1: "",
                principalOwnerAmount2: "",
                principalOwner1Name: "",
                principalOwner1Date: "",
                principalOwner2Name: "",
                principalOwner2Date: "",
            }]);
            return;
        }
        if (panel === "ach") {
            setAchEntries([{
                id: "tmp-1",
                bankName: "",
                fullNameOnAccount: "",
                accountNumber: "",
                routingNumber: "",
                ach_authorization_bank_portal_website: "",
                ach_authorization_username: "",
                ach_authorization_password: "",
                ach_authorization_security_question1: "",
                ach_authorization_security_answer1: "",
                ach_authorization_security_question2: "",
                ach_authorization_security_answer2: "",
                ach_authorization_security_question3: "",
                ach_authorization_security_answer3: "",
                ach_authorization_other_infomation: "",
                ach_authorization_reference_name1: "",
                ach_authorization_reference_number_1: "",
                ach_authorization_reference_relationship1: "",
                ach_authorization_reference_name2: "",
                ach_authorization_reference_number2: "",
                ach_authorization_reference_relationship2: "",
                ach_authorization_reference_name3: "",
                ach_authorization_reference_number3: "",
                ach_authorization_reference_relationship3: "",
                dba: "",
                phone: "",
                address: "",
                city: "",
                state: "",
                zip: "",
                bankBranchCity: "",
                bankState: "",
                bankZip: "",
            }]);
            return;
        }
        if (panel === "epo") {
            setEpoEntries([{ id: "tmp-1", legalName: "", receivedDate: "" }]);
            return;
        }
        if (panel === "owner") {
            setOwnerEntries([{
                id: "tmp-1",
                ownerFirstName: "",
                ownerLastName: "",
                ownerEmail: "",
                ownerPhone: "",
                ownerAddress: "",
                state: "",
                city: "",
                zipCode: "",
                ownershipPercentage: "",
            }]);
            return;
        }
        setGuarantorEntries([{
            id: "tmp-1",
            guarantorFirstName: "",
            guarantorLastName: "",
            guarantorEmail: "",
            guarantorPhone: "",
            guarantorAddress: "",
            state: "",
            city: "",
            zipCode: "",
            ssnNumber: "",
            driverLicenseNumber: "",
            typeOfEntity: "",
        }]);
    };

    // const removeInfoEntry = async (
    //     panel: "addendum" | "ach" | "epo" | "owner" | "guarantor",
    //     id: string,
    // ) => {
    //     try {
    //         if (panel === "addendum") {
    //             if (addendumEntries.length <= 1) return;
    //             if (isPersistedRow(id)) {
    //                 await dispatch(deleteAddendum(Number(id))).unwrap();
    //                 if (effectiveContractId != null) {
    //                     await dispatch(getAllAddendum({ contractId: effectiveContractId })).unwrap();
    //                 }
    //             }
    //             setAddendumEntries((prev) => prev.filter((x) => x.id !== id));
    //             return;
    //         }
    //         if (panel === "ach") {
    //             if (achEntries.length <= 1) return;
    //             if (isPersistedRow(id)) {
    //                 await dispatch(deleteACH(Number(id))).unwrap();
    //                 if (effectiveContractId != null) {
    //                     await dispatch(getAllACH({ contractId: effectiveContractId })).unwrap();
    //                 }
    //             }
    //             setAchEntries((prev) => prev.filter((x) => x.id !== id));
    //             return;
    //         }
    //         if (panel === "epo") {
    //             if (epoEntries.length <= 1) return;
    //             if (isPersistedRow(id)) {
    //                 await dispatch(deleteEPO(Number(id))).unwrap();
    //                 if (effectiveContractId != null) {
    //                     await dispatch(getAllEPO({ contractId: effectiveContractId })).unwrap();
    //                 }
    //             }
    //             setEpoEntries((prev) => prev.filter((x) => x.id !== id));
    //             return;
    //         }
    //         if (panel === "owner") {
    //             if (ownerEntries.length <= 1) return;
    //             if (isPersistedRow(id)) {
    //                 await dispatch(deleteContractOwner(Number(id))).unwrap();
    //                 if (effectiveContractId != null) {
    //                     await dispatch(getAllContractOwners({ contractId: effectiveContractId })).unwrap();
    //                 }
    //             }
    //             setOwnerEntries((prev) => prev.filter((x) => x.id !== id));
    //             return;
    //         }
    //         if (guarantorEntries.length <= 1) return;
    //         if (isPersistedRow(id)) {
    //             await dispatch(deleteContractGuarantor(Number(id))).unwrap();
    //             if (effectiveContractId != null) {
    //                 await dispatch(getAllContractGuarantors({ contractId: effectiveContractId })).unwrap();
    //             }
    //         }
    //         setGuarantorEntries((prev) => prev.filter((x) => x.id !== id));
    //     } catch {
    //         setInfoPanelMessage("Failed to delete row. Please try again.");
    //     }
    // };

    const openEditorForFetchedRecord = (
        panel: "addendum" | "ach" | "epo" | "owner" | "guarantor",
        row: any,
    ) => {
        setActiveStep("info");
        setActiveInfoPanel(panel);
        if (panel === "addendum") {
            setAddendumEntries([{
                id: String(row?.id ?? "tmp-1"),
                legalName: String(row?.legalName1 || ""),
                dba: String(row?.dba1 || ""),
                typeOfEntity: String(row?.typeOfEntity1 || ""),
                ein: String(row?.ein1 || ""),
                mailingAddress: String(row?.mailingAddress1 || ""),
                addendumDated: String(row?.addendumDated || ""),
                principalOwner: String(row?.principalOwner || ""),
                principalBusiness: String(row?.principalBusiness || ""),
                businessLocation: String(row?.businessLocation || ""),
                principalState: String(row?.principalState || ""),
                principalOwnerAmount1: String(row?.principalOwnerAmount1 || ""),
                principalOwnerAmount2: String(row?.principalOwnerAmount2 || ""),
                principalOwner1Name: String(row?.principalOwner1Name || ""),
                principalOwner1Date: String(row?.principalOwner1Date || ""),
                principalOwner2Name: String(row?.principalOwner2Name || ""),
                principalOwner2Date: String(row?.principalOwner2Date || ""),
            }]);
            return;
        }
        if (panel === "ach") {
            setAchEntries([{
                id: String(row?.id ?? "tmp-1"),
                bankName: String(row?.bankName || ""),
                fullNameOnAccount: String(row?.accountHolderName || ""),
                accountNumber: String(row?.accountNumber || ""),
                routingNumber: String(row?.routingNumber || ""),
                ach_authorization_bank_portal_website: String(row?.ach_authorization_bank_portal_website || ""),
                ach_authorization_username: String(row?.ach_authorization_username || ""),
                ach_authorization_password: String(row?.ach_authorization_password || ""),
                ach_authorization_security_question1: String(row?.ach_authorization_security_question1 || ""),
                ach_authorization_security_answer1: String(row?.ach_authorization_security_answer1 || ""),
                ach_authorization_security_question2: String(row?.ach_authorization_security_question2 || ""),
                ach_authorization_security_answer2: String(row?.ach_authorization_security_answer2 || ""),
                ach_authorization_security_question3: String(row?.ach_authorization_security_question3 || ""),
                ach_authorization_security_answer3: String(row?.ach_authorization_security_answer3 || ""),
                ach_authorization_other_infomation: String(row?.ach_authorization_other_infomation || ""),
                ach_authorization_reference_name1: String(row?.ach_authorization_reference_name1 || ""),
                ach_authorization_reference_number_1: String(row?.ach_authorization_reference_number_1 || ""),
                ach_authorization_reference_relationship1: String(row?.ach_authorization_reference_relationship1 || ""),
                ach_authorization_reference_name2: String(row?.ach_authorization_reference_name2 || ""),
                ach_authorization_reference_number2: String(row?.ach_authorization_reference_number2 || ""),
                ach_authorization_reference_relationship2: String(row?.ach_authorization_reference_relationship2 || ""),
                ach_authorization_reference_name3: String(row?.ach_authorization_reference_name3 || ""),
                ach_authorization_reference_number3: String(row?.ach_authorization_reference_number3 || ""),
                ach_authorization_reference_relationship3: String(row?.ach_authorization_reference_relationship3 || ""),
                dba: String(row?.dba || ""),
                phone: String(row?.phone || ""),
                address: String(row?.address || ""),
                city: String(row?.city || ""),
                state: String(row?.state || ""),
                zip: String(row?.zip || ""),
                bankBranchCity: String(row?.bankBranchCity || ""),
                bankState: String(row?.bankState || ""),
                bankZip: String(row?.bankZip || ""),
            }]);
            return;
        }
        if (panel === "epo") {
            setEpoEntries([{
                id: String(row?.id ?? "tmp-1"),
                legalName: String(row?.amountReceived1 || row?.legalName || ""),
                receivedDate: String(row?.receivedDate1 || ""),
            }]);
            return;
        }
        if (panel === "owner") {
            setOwnerEntries([{
                id: String(row?.id ?? "tmp-1"),
                ownerFirstName: String(row?.firstName || ""),
                ownerLastName: String(row?.lastName || ""),
                ownerEmail: String(row?.email || ""),
                ownerPhone: String(row?.phone || ""),
                ownerAddress: String(row?.address || ""),
                state: String(row?.state || ""),
                city: String(row?.city || ""),
                zipCode: String(row?.zip || ""),
                ownershipPercentage: String(row?.ownershipPercentage ?? ""),
            }]);
            return;
        }
        setGuarantorEntries([{
            id: String(row?.id ?? "tmp-1"),
            guarantorFirstName: String(row?.firstName || ""),
            guarantorLastName: String(row?.lastName || ""),
            guarantorEmail: String(row?.email || ""),
            guarantorPhone: String(row?.phone || ""),
            guarantorAddress: String(row?.address || ""),
            state: String(row?.state || ""),
            city: String(row?.city || ""),
            zipCode: String(row?.zip || ""),
            ssnNumber: String(row?.ssn || ""),
            driverLicenseNumber: String(row?.driverLicense || ""),
            typeOfEntity: String(row?.entityType || ""),
        }]);
    };

    // const deleteFetchedRecord = async (
    //     panel: "addendum" | "ach" | "epo" | "owner" | "guarantor",
    //     row: any,
    // ) => {
    //     const id = Number(row?.id);
    //     if (!Number.isFinite(id)) {
    //         toast.error("Cannot delete this record: invalid id.");
    //         return;
    //     }
    //     try {
    //         if (panel === "addendum") {
    //             await dispatch(deleteAddendum(id)).unwrap();
    //             if (effectiveContractId != null) await dispatch(getAllAddendum({ contractId: effectiveContractId })).unwrap();
    //         } else if (panel === "ach") {
    //             await dispatch(deleteACH(id)).unwrap();
    //             if (effectiveContractId != null) await dispatch(getAllACH({ contractId: effectiveContractId })).unwrap();
    //         } else if (panel === "epo") {
    //             await dispatch(deleteEPO(id)).unwrap();
    //             if (effectiveContractId != null) await dispatch(getAllEPO({ contractId: effectiveContractId })).unwrap();
    //         } else if (panel === "owner") {
    //             await dispatch(deleteContractOwner(id)).unwrap();
    //             if (effectiveContractId != null) await dispatch(getAllContractOwners({ contractId: effectiveContractId })).unwrap();
    //         } else {
    //             await dispatch(deleteContractGuarantor(id)).unwrap();
    //             if (effectiveContractId != null) await dispatch(getAllContractGuarantors({ contractId: effectiveContractId })).unwrap();
    //         }
    //         toast.success("Record deleted successfully.");
    //     } catch (error: any) {
    //         toast.error(error?.message || "Failed to delete record.");
    //     }
    // };

    const handleSaveCurrentPanel = async () => {
        if (!activeInfoPanel) return;
        try {
            if (activeInfoPanel === "owner") {
                const cid = effectiveContractId;
                if (cid == null || !Number.isFinite(cid)) {
                    setInfoPanelMessage("A valid contract is required to save owners.");
                    return;
                }
                for (const entry of ownerEntries) {
                    const firstName = String(entry.ownerFirstName || "").trim();
                    const lastName = String(entry.ownerLastName || "").trim();
                    const isBlank = !firstName && !lastName;
                    if (isBlank && !isPersistedRow(entry.id)) {
                        continue;
                    }
                    if (!firstName || !lastName) {
                        setInfoPanelMessage(
                            "Each owner needs first name and last name (both required).",
                        );
                        return;
                    }
                    const data = {
                        contractId: cid,
                        firstName,
                        lastName,
                        email: entry.ownerEmail || undefined,
                        phone: entry.ownerPhone || undefined,
                        address: entry.ownerAddress || undefined,
                        state: entry.state || undefined,
                        city: entry.city || undefined,
                        zip: entry.zipCode || undefined,
                        ownershipPercentage:
                            entry.ownershipPercentage !== ""
                                ? Number(entry.ownershipPercentage)
                                : undefined,
                    };
                    const numericId = Number(entry.id);
                    if (isPersistedRow(entry.id)) {
                        await dispatch(updateContractOwner({ id: numericId, data })).unwrap();
                    } else {
                        await dispatch(createContractOwner(data as any)).unwrap();
                    }
                }
                await dispatch(getAllContractOwners({ contractId: cid })).unwrap();
                setInfoPanelMessage("Owner details saved.");
                resetPanelEntries("owner");
                return;
            }

            if (activeInfoPanel === "guarantor") {
                const gid = effectiveContractId;
                if (gid == null || !Number.isFinite(gid)) {
                    setInfoPanelMessage("A valid contract is required to save guarantors.");
                    return;
                }
                for (const entry of guarantorEntries) {
                    const firstName = String(entry.guarantorFirstName || "").trim();
                    const lastName = String(entry.guarantorLastName || "").trim();
                    const isBlank = !firstName && !lastName;
                    if (isBlank && !isPersistedRow(entry.id)) {
                        continue;
                    }
                    if (!firstName || !lastName) {
                        setInfoPanelMessage(
                            "Each guarantor needs first name and last name (both required).",
                        );
                        return;
                    }
                    const data = {
                        contractId: gid,
                        firstName,
                        lastName,
                        email: entry.guarantorEmail || undefined,
                        phone: entry.guarantorPhone || undefined,
                        address: entry.guarantorAddress || undefined,
                        state: entry.state || undefined,
                        city: entry.city || undefined,
                        zip: entry.zipCode || undefined,
                        ssn: entry.ssnNumber || undefined,
                        driverLicense: entry.driverLicenseNumber || undefined,
                        entityType: entry.typeOfEntity || undefined,
                    };
                    const numericId = Number(entry.id);
                    if (isPersistedRow(entry.id)) {
                        await dispatch(updateContractGuarantor({ id: numericId, data })).unwrap();
                    } else {
                        await dispatch(createContractGuarantor(data as any)).unwrap();
                    }
                }
                await dispatch(getAllContractGuarantors({ contractId: gid })).unwrap();
                setInfoPanelMessage("Guarantor details saved.");
                resetPanelEntries("guarantor");
                return;
            }

            // For ACH/EPO/Addendum, prefer application context
            const clientId: string | undefined =
                applicationData?.clientId ??
                applicationData?.client?._id ??
                applicationData?.client?.id ??
                applicationId ??
                undefined;
            const rawBusinessInfoId =
                applicationData?.businessInfo?.[0]?.id ??
                applicationData?.businessInfo?.[0]?._id ??
                applicationData?.businessInfo?.id ??
                applicationData?.businessInfo?._id ??
                applicationData?.businessInfoId ??
                applicationData?.client?.businessInfoId ??
                applicationData?.client?.businessInfo?.[0]?.id ??
                applicationData?.client?.businessInfo?.[0]?._id ??
                applicationData?.client?.businessInfo?.id ??
                applicationData?.client?.businessInfo?._id;
            const parsedBusinessInfoId = Number(rawBusinessInfoId);
            const businessInfoId: number | undefined =
                Number.isFinite(parsedBusinessInfoId) &&
                    Number.isInteger(parsedBusinessInfoId) &&
                    parsedBusinessInfoId > 0
                    ? parsedBusinessInfoId
                    : undefined;

            if (!clientId) {
                setInfoPanelMessage("clientId is required.");
                return;
            }

            if (activeInfoPanel === "ach") {
                if (effectiveContractId == null) {
                    setInfoPanelMessage("A valid contract is required to save ACH details.");
                    return;
                }
                for (const entry of achEntries) {
                    const data = {
                        clientId: String(clientId),
                        ...(businessInfoId !== undefined ? { businessInfoId } : {}),
                        contractId: effectiveContractId ?? undefined,
                        bankName: entry.bankName || undefined,
                        accountHolderName: entry.fullNameOnAccount || undefined,
                        accountNumber: entry.accountNumber || undefined,
                        routingNumber: entry.routingNumber || undefined,
                        ach_authorization_bank_portal_website:
                            entry.ach_authorization_bank_portal_website || undefined,
                        ach_authorization_username:
                            entry.ach_authorization_username || undefined,
                        ach_authorization_password:
                            entry.ach_authorization_password || undefined,
                        ach_authorization_security_question1:
                            entry.ach_authorization_security_question1 || undefined,
                        ach_authorization_security_answer1:
                            entry.ach_authorization_security_answer1 || undefined,
                        ach_authorization_security_question2:
                            entry.ach_authorization_security_question2 || undefined,
                        ach_authorization_security_answer2:
                            entry.ach_authorization_security_answer2 || undefined,
                        ach_authorization_security_question3:
                            entry.ach_authorization_security_question3 || undefined,
                        ach_authorization_security_answer3:
                            entry.ach_authorization_security_answer3 || undefined,
                        ach_authorization_other_infomation:
                            entry.ach_authorization_other_infomation || undefined,
                        ach_authorization_reference_name1:
                            entry.ach_authorization_reference_name1 || undefined,
                        ach_authorization_reference_number_1:
                            entry.ach_authorization_reference_number_1 || undefined,
                        ach_authorization_reference_relationship1:
                            entry.ach_authorization_reference_relationship1 || undefined,
                        ach_authorization_reference_name2:
                            entry.ach_authorization_reference_name2 || undefined,
                        ach_authorization_reference_number2:
                            entry.ach_authorization_reference_number2 || undefined,
                        ach_authorization_reference_relationship2:
                            entry.ach_authorization_reference_relationship2 || undefined,
                        ach_authorization_reference_name3:
                            entry.ach_authorization_reference_name3 || undefined,
                        ach_authorization_reference_number3:
                            entry.ach_authorization_reference_number3 || undefined,
                        ach_authorization_reference_relationship3:
                            entry.ach_authorization_reference_relationship3 || undefined,
                        dba: entry.dba || undefined,
                        phone: entry.phone || undefined,
                        address: entry.address || undefined,
                        city: entry.city || undefined,
                        state: entry.state || undefined,
                        zip: entry.zip || undefined,
                        bankBranchCity: entry.bankBranchCity || undefined,
                        bankState: entry.bankState || undefined,
                        bankZip: entry.bankZip || undefined,
                    };
                    const numericId = Number(entry.id);
                    if (isPersistedRow(entry.id)) {
                        await dispatch(updateACH({ id: numericId, data })).unwrap();
                    } else {
                        await dispatch(createACH(data as any)).unwrap();
                    }
                }
                await dispatch(getAllACH({ contractId: effectiveContractId })).unwrap();
                setInfoPanelMessage("ACH details saved.");
                resetPanelEntries("ach");
                return;
            }

            if (activeInfoPanel === "epo") {
                if (effectiveContractId == null) {
                    setInfoPanelMessage("A valid contract is required to save EPO details.");
                    return;
                }
                for (const entry of epoEntries) {
                    const data = {
                        clientId: String(clientId),
                        ...(businessInfoId !== undefined ? { businessInfoId } : {}),
                        contractId: effectiveContractId ?? undefined,
                        amountReceived1: entry.legalName || undefined, // stored in 'legalName' field locally
                        receivedDate1: entry.receivedDate || undefined,
                    };
                    const numericId = Number(entry.id);
                    if (isPersistedRow(entry.id)) {
                        await dispatch(updateEPO({ id: numericId, data })).unwrap();
                    } else {
                        await dispatch(createEPO(data as any)).unwrap();
                    }
                }
                await dispatch(getAllEPO({ contractId: effectiveContractId })).unwrap();
                setInfoPanelMessage("EPO details saved.");
                resetPanelEntries("epo");
                return;
            }

            if (activeInfoPanel === "addendum") {
                if (effectiveContractId == null) {
                    setInfoPanelMessage("A valid contract is required to save addendum details.");
                    return;
                }
                for (const entry of addendumEntries) {
                    const data = {
                        clientId: String(clientId),
                        ...(businessInfoId !== undefined ? { businessInfoId } : {}),
                        contractId: effectiveContractId ?? undefined,
                        legalName1: entry.legalName || undefined,
                        dba1: entry.dba || undefined,
                        typeOfEntity1: entry.typeOfEntity || undefined,
                        ein1: entry.ein || undefined,
                        mailingAddress1: entry.mailingAddress || undefined,
                        addendumDated: entry.addendumDated || undefined,
                        principalOwner: entry.principalOwner || undefined,
                        principalBusiness: entry.principalBusiness || undefined,
                        businessLocation: entry.businessLocation || undefined,
                        principalState: entry.principalState || undefined,
                        principalOwnerAmount1: entry.principalOwnerAmount1 || undefined,
                        principalOwnerAmount2: entry.principalOwnerAmount2 || undefined,
                        principalOwner1Name: entry.principalOwner1Name || undefined,
                        principalOwner1Date: entry.principalOwner1Date || undefined,
                        principalOwner2Name: entry.principalOwner2Name || undefined,
                        principalOwner2Date: entry.principalOwner2Date || undefined,
                    };
                    const numericId = Number(entry.id);
                    if (isPersistedRow(entry.id)) {
                        await dispatch(updateAddendum({ id: numericId, data })).unwrap();
                    } else {
                        await dispatch(createAddendum(data as any)).unwrap();
                    }
                }
                await dispatch(getAllAddendum({ contractId: effectiveContractId })).unwrap();
                setInfoPanelMessage("Addendum details saved.");
                resetPanelEntries("addendum");
                return;
            }
        } catch (error) {
            setInfoPanelMessage("Failed to save details. Please try again.");
        }
    };

    const resetActivePanel = () => {
        if (activeInfoPanel === "addendum") {
            setAddendumEntries([{
                id: "tmp-1",
                legalName: "",
                dba: "",
                typeOfEntity: "",
                ein: "",
                mailingAddress: "",
                addendumDated: "",
                principalOwner: "",
                principalBusiness: "",
                businessLocation: "",
                principalState: "",
                principalOwnerAmount1: "",
                principalOwnerAmount2: "",
                principalOwner1Name: "",
                principalOwner1Date: "",
                principalOwner2Name: "",
                principalOwner2Date: "",
            }]);
        } else if (activeInfoPanel === "ach") {
            setAchEntries([{
                id: "tmp-1",
                bankName: "",
                fullNameOnAccount: "",
                accountNumber: "",
                routingNumber: "",
                ach_authorization_bank_portal_website: "",
                ach_authorization_username: "",
                ach_authorization_password: "",
                ach_authorization_security_question1: "",
                ach_authorization_security_answer1: "",
                ach_authorization_security_question2: "",
                ach_authorization_security_answer2: "",
                ach_authorization_security_question3: "",
                ach_authorization_security_answer3: "",
                ach_authorization_other_infomation: "",
                ach_authorization_reference_name1: "",
                ach_authorization_reference_number_1: "",
                ach_authorization_reference_relationship1: "",
                ach_authorization_reference_name2: "",
                ach_authorization_reference_number2: "",
                ach_authorization_reference_relationship2: "",
                ach_authorization_reference_name3: "",
                ach_authorization_reference_number3: "",
                ach_authorization_reference_relationship3: "",
                dba: "",
                phone: "",
                address: "",
                city: "",
                state: "",
                zip: "",
                bankBranchCity: "",
                bankState: "",
                bankZip: "",
            }]);
        } else if (activeInfoPanel === "epo") {
            setEpoEntries([{ id: "tmp-1", legalName: "", receivedDate: "" }]);
        } else if (activeInfoPanel === "owner") {
            setOwnerEntries([{
                id: "tmp-1",
                ownerFirstName: "",
                ownerLastName: "",
                ownerEmail: "",
                ownerPhone: "",
                ownerAddress: "",
                state: "",
                city: "",
                zipCode: "",
                ownershipPercentage: "",
            }]);
        } else if (activeInfoPanel === "guarantor") {
            setGuarantorEntries([{
                id: "tmp-1",
                guarantorFirstName: "",
                guarantorLastName: "",
                guarantorEmail: "",
                guarantorPhone: "",
                guarantorAddress: "",
                state: "",
                city: "",
                zipCode: "",
                ssnNumber: "",
                driverLicenseNumber: "",
                typeOfEntity: "",
            }]);
        }
        setInfoPanelMessage("");
    };

    const saveActivePanel = () => {
        void handleSaveCurrentPanel();
    };

    if (!isOpen) return null;

    const currentPreviewUrl =
        (activeStep === "documents" || activeStep === "info" || activeStep === "summary") &&
        uploadedPreviewUrl
            ? uploadedPreviewUrl
            : activeStep === "documents" && activePreview && documentUrls[activePreview]
                ? documentUrls[activePreview]
                : "";

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="flex h-[min(94vh,calc(100dvh-1.5rem))] max-h-[min(94vh,calc(100dvh-1.5rem))] min-h-0 w-[1400px] max-w-[95vw] flex-col gap-0 overflow-hidden bg-white p-0 dark:bg-slate-900 dark:text-slate-100">

                    {/* 1. Header with Stepper & Title */}
                    <div className="flex shrink-0 flex-col border-b bg-white px-6 py-3 dark:border-slate-700 dark:bg-slate-900">
                        <div className="mb-4">
                            <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                Create Contract — {fileName || "Double A Landscaping & Supply"}
                            </DialogTitle>
                        </div>

                        {/* Stepper: documents → info (both highlighted on info) → all three on summary */}
                        <div className="flex flex-wrap items-center gap-6 sm:gap-8 text-xs font-medium text-slate-500">
                            {(() => {
                                const onDocuments = activeStep === "documents";
                                const onInfo = activeStep === "info";
                                const onSummary = activeStep === "summary";
                                const onSent = activeStep === "sent";
                                const docGreenActive = onInfo || onSummary || onSent;
                                const infoGreenActive = onInfo || onSummary || onSent;
                                const summaryGreenActive = onSummary || onSent;
                                const sentGreenActive = onSent;
                                const canOpenSentStep =
                                    sentEnvelopeRows.length > 0 ||
                                    sentStepUnlocked ||
                                    isContractAlreadySent(resolvedContract, sentAt);

                                const circleDone = "w-5 h-5 shrink-0 rounded-full border-2 border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)] flex items-center justify-center text-[10px]";
                                const circleCurrent = "w-5 h-5 shrink-0 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-semibold";
                                const circlePending = "w-5 h-5 shrink-0 rounded-full border border-slate-300 text-slate-500 flex items-center justify-center text-[10px]";

                                return (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                didSuggestSentTabThisOpenRef.current = true;
                                                setActiveStep("documents");
                                            }}
                                            className={`flex cursor-pointer items-center gap-2 transition-colors ${docGreenActive
                                                ? "text-[var(--brand)] font-semibold"
                                                : onDocuments
                                                    ? "text-blue-600 font-semibold"
                                                    : "text-slate-500"
                                                }`}
                                        >
                                            <span
                                                className={
                                                    docGreenActive
                                                        ? circleDone
                                                        : onDocuments
                                                            ? circleCurrent
                                                            : circlePending
                                                }
                                            >
                                                {docGreenActive ? "✓" : "1"}
                                            </span>
                                            Documents
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setActiveStep("info")}
                                            className={`flex cursor-pointer items-center gap-2 transition-colors ${infoGreenActive ? "text-[var(--brand)] font-semibold" : "text-slate-500"
                                                }`}
                                        >
                                            <span className={infoGreenActive ? circleDone : circlePending}>
                                                {infoGreenActive ? "✓" : "2"}
                                            </span>
                                            Info Required
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setActiveStep("summary")}
                                            className={`flex cursor-pointer items-center gap-2 transition-colors ${summaryGreenActive ? "text-[var(--brand)] font-semibold" : "text-slate-500"
                                                }`}
                                        >
                                            <span className={summaryGreenActive ? circleDone : circlePending}>
                                                {summaryGreenActive ? "✓" : "3"}
                                            </span>
                                            Summary
                                        </button>

                                        <button
                                            type="button"
                                            disabled={!canOpenSentStep}
                                            onClick={() => {
                                                if (canOpenSentStep) setActiveStep("sent");
                                            }}
                                            className={`flex cursor-pointer items-center  gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${sentGreenActive ? "text-[var(--brand)] font-semibold" : "text-slate-500"
                                                }`}
                                        >
                                            <span className={sentGreenActive ? circleDone : circlePending}>
                                                {sentGreenActive ? "✓" : "4"}
                                            </span>
                                            Sent
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* 2. Split Main Body — flex-1 consumes all space between header and footer (gap-0 on dialog) */}
                    <div className="flex min-h-0 flex-1 flex-row overflow-hidden">

                        {/* Left Column: Form Controls + floating step nav */}
                        <div className="relative flex min-h-0 w-[45%] min-w-0 flex-col overflow-hidden border-r bg-white dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">

                                {/* Dynamic Section Heading */}
                                <section>
                                    {activeStep === "info" ? (
                                        <div className="mb-1 flex items-start gap-3 rounded-xl border border-[var(--brand)]/20 bg-gradient-to-r from-[var(--brand)]/8 via-white to-slate-50/90 px-4 py-3 shadow-sm dark:border-[var(--brand)]/25 dark:from-[var(--brand)]/15 dark:via-slate-900 dark:to-slate-900">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[image:var(--brand-gradient)] text-white shadow-md shadow-[var(--brand)]/25">
                                                <ScrollText className="h-5 w-5" aria-hidden />
                                            </div>
                                            <div className="min-w-0 pt-0.5">
                                                <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                                    Info Required
                                                </h2>
                                                <p className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-400">
                                                    Link DocuSign templates, set contract state and funder, then capture
                                                    addendum and ACH details for sending.
                                                </p>
                                            </div>
                                        </div>
                                    ) : activeStep === "sent" ? (
                                        <div className="mb-1 flex items-start gap-3 rounded-xl border border-[var(--brand)]/20 bg-gradient-to-r from-[var(--brand)]/8 via-white to-slate-50/90 px-4 py-3 shadow-sm dark:border-[var(--brand)]/25 dark:from-[var(--brand)]/15 dark:via-slate-900 dark:to-slate-900">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[image:var(--brand-gradient)] text-white shadow-md shadow-[var(--brand)]/25">
                                                <BadgeCheck className="h-5 w-5" aria-hidden />
                                            </div>
                                            <div className="min-w-0 pt-0.5">
                                                <h2 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                                    Contract Sent
                                                </h2>
                                                <p className="mt-0.5 text-xs leading-snug text-slate-600 dark:text-slate-400">
                                                    The envelope has been handed off for signature. Review the send summary below.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-200">
                                            {activeStep === "documents" ? "Documents" : "Summary"}
                                        </label>
                                    )}
                                </section>

                                {activeStep === "documents" && (
                                    <section className="space-y-3 border rounded-lg p-4 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                Upload Documents
                                            </h3>
                                            <div className="flex flex-wrap items-center justify-end gap-2">
                                                {showRequestDocuments ? (
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setIsRequestModalOpen(true)}
                                                        className="h-8 border-[#CA8A03] px-3 text-xs font-medium text-[#CA8A03] hover:bg-[#CA8A03]/10"
                                                    >
                                                        <Send className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                                        Request documents
                                                    </Button>
                                                ) : null}
                                                <p className="text-[11px] text-slate-500">
                                                    Drag &amp; drop or click — uploads start automatically.
                                                </p>
                                            </div>
                                        </div>

                                        {documentRequestsLoading ? (
                                            <p className="text-[11px] text-slate-500">Loading document requests…</p>
                                        ) : null}

                                        {showRequestDocuments &&
                                        !documentRequestsLoading &&
                                        (pendingDocumentRequests.length > 0 ||
                                            completedDocumentRequests.length > 0) ? (
                                            <RequestedDocumentUploadRows
                                                embedded
                                                pending={pendingDocumentRequests}
                                                completed={completedDocumentRequests}
                                                onUpload={autoUploadRequestedDocument}
                                                onView={handleViewRequestedDocument}
                                                canView={canViewRequestedDocument}
                                                onRemove={handleRemoveDocumentRequest}
                                            />
                                        ) : null}

                                        <div className="space-y-2">
                                            {requiredDocumentRows.map(({ key, label, inputRef }) => {
                                                const uploadedFile = uploadedDocumentByTypeKey.get(
                                                    normalizeDocumentTypeKey(documentTypeByKey[key]),
                                                );
                                                const isUploaded = Boolean(uploadedFile);
                                                const progress = uploadProgressByKey[key];
                                                const isUploading = typeof progress === "number";
                                                const isDragOver = dragOverDocKey === key;
                                                const pendingName = pendingFileNameByKey[key];
                                                const disabled = effectiveContractId == null;

                                                const onPickFiles = (files: FileList | null) => {
                                                    const file = files?.[0];
                                                    if (!file) return;
                                                    void autoUploadDocumentFile(key, file);
                                                };

                                                return (
                                                    <div
                                                        key={key}
                                                        role={!isUploaded && !isUploading ? "button" : undefined}
                                                        tabIndex={!isUploaded && !isUploading && !disabled ? 0 : -1}
                                                        aria-label={!isUploaded && !isUploading ? `Upload ${label}` : undefined}
                                                        onClick={() => {
                                                            if (isUploaded || isUploading || disabled) return;
                                                            inputRef.current?.click();
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (isUploaded || isUploading || disabled) return;
                                                            if (e.key === "Enter" || e.key === " ") {
                                                                e.preventDefault();
                                                                inputRef.current?.click();
                                                            }
                                                        }}
                                                        onDragOver={(e) => {
                                                            if (isUploaded || isUploading || disabled) return;
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            if (dragOverDocKey !== key) setDragOverDocKey(key);
                                                        }}
                                                        onDragEnter={(e) => {
                                                            if (isUploaded || isUploading || disabled) return;
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setDragOverDocKey(key);
                                                        }}
                                                        onDragLeave={(e) => {
                                                            if (isUploaded || isUploading || disabled) return;
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setDragOverDocKey((prev) => (prev === key ? null : prev));
                                                        }}
                                                        onDrop={(e) => {
                                                            if (isUploaded || isUploading || disabled) return;
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setDragOverDocKey(null);
                                                            onPickFiles(e.dataTransfer?.files ?? null);
                                                        }}
                                                        className={cn(
                                                            "relative flex items-center justify-between rounded-2xl border px-3 py-2.5 transition-colors",
                                                            isUploaded
                                                                ? "border-emerald-200 bg-emerald-50"
                                                                : isUploading
                                                                    ? "border-blue-200 bg-blue-50"
                                                                    : isDragOver
                                                                        ? "border-blue-400 bg-blue-50 ring-2 ring-blue-200"
                                                                        : "border-amber-200 bg-amber-50",
                                                            !isUploaded && !isUploading && !disabled && "cursor-pointer hover:bg-amber-100/70",
                                                            disabled && !isUploaded && "opacity-60",
                                                        )}
                                                    >
                                                        <div className="flex min-w-0 items-center gap-2">
                                                            {!isUploaded && (
                                                                <span
                                                                    className={cn(
                                                                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                                                                        isUploading
                                                                            ? "bg-blue-100 text-blue-700"
                                                                            : "bg-amber-100 text-amber-700",
                                                                    )}
                                                                >
                                                                    {isUploading ? (
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    ) : (
                                                                        <UploadCloud className="h-3.5 w-3.5" />
                                                                    )}
                                                                </span>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-slate-800">{label}</p>
                                                                {isUploaded ? (
                                                                    <p className="truncate text-[11px] text-slate-500">
                                                                        {String(uploadedFile?.fileName || "Uploaded")}
                                                                    </p>
                                                                ) : isUploading ? (
                                                                    <p className="truncate text-[11px] text-slate-600">
                                                                        {pendingName || "Uploading..."}
                                                                    </p>
                                                                ) : (
                                                                    <p className="truncate text-[11px] text-slate-500">
                                                                        {disabled
                                                                            ? "Generate or select a contract first."
                                                                            : isDragOver
                                                                                ? "Drop file to upload"
                                                                                : "Drop file or click to upload (PDF, JPG, PNG)"}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            {!isUploaded && !isUploading && (
                                                                <Input
                                                                    ref={inputRef}
                                                                    type="file"
                                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    onChange={(e) => {
                                                                        onPickFiles(e.target.files);
                                                                        if (e.target) e.target.value = "";
                                                                    }}
                                                                    className="hidden"
                                                                    disabled={disabled}
                                                                />
                                                            )}
                                                            {isUploading ? (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                                                    {`${progress ?? 0}%`}
                                                                </span>
                                                            ) : (
                                                                <span
                                                                    className={cn(
                                                                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                                                                        isUploaded
                                                                            ? "bg-emerald-100 text-emerald-700"
                                                                            : "bg-amber-100 text-amber-700",
                                                                    )}
                                                                >
                                                                    {isUploaded ? (
                                                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                                                    ) : (
                                                                        <AlertCircle className="h-3.5 w-3.5" />
                                                                    )}
                                                                    {isUploaded ? "Uploaded" : "Missing"}
                                                                </span>
                                                            )}
                                                            {isUploaded && (
                                                                <>
                                                                    <Button
                                                                        type="button"
                                                                        variant="ghost"
                                                                        size="icon"
                                                                        className="h-7 w-7 text-slate-600 hover:bg-slate-200/70 cursor-pointer"
                                                                        aria-label="Document actions"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const fileId = String(uploadedFile?.id || "");
                                                                            setOpenDocumentActionMenuId((prev) => (prev === fileId ? null : fileId));
                                                                        }}
                                                                    >
                                                                        <MoreVertical className="h-4 w-4" />
                                                                    </Button>
                                                                    {openDocumentActionMenuId === String(uploadedFile?.id || "") && (
                                                                        <div className="absolute right-2 top-10 z-[10000] w-32 overflow-hidden rounded-md border border-slate-200 bg-white shadow-lg">
                                                                            <button
                                                                                type="button"
                                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setOpenDocumentActionMenuId(null);
                                                                                    void handlePreviewUploadedDocument(String(uploadedFile?.id || ""));
                                                                                }}
                                                                            >
                                                                                <Eye className="h-3.5 w-3.5" />
                                                                                View
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                disabled={updatingUploadedFileId === String(uploadedFile?.id || "")}
                                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setOpenDocumentActionMenuId(null);
                                                                                    handleEditUploadedDocument(String(uploadedFile?.id || ""));
                                                                                }}
                                                                            >
                                                                                <Pencil className="h-3.5 w-3.5" />
                                                                                Edit
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                disabled={deletingUploadedFileId === String(uploadedFile?.id || "")}
                                                                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setOpenDocumentActionMenuId(null);
                                                                                    void handleDeleteUploadedDocument(String(uploadedFile?.id || ""));
                                                                                }}
                                                                            >
                                                                                <Trash2 className="h-3.5 w-3.5" />
                                                                                Delete
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                        {isUploading && (
                                                            <div className="pointer-events-none absolute inset-x-3 bottom-1 h-1 overflow-hidden rounded-full bg-blue-100">
                                                                <div
                                                                    className="h-full rounded-full bg-blue-500 transition-[width] duration-200 ease-out"
                                                                    style={{ width: `${progress ?? 0}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {(Object.keys(pendingKycByDocKey) as RequiredDocumentKey[]).map(
                                            (docKey) => {
                                                const pending = pendingKycByDocKey[docKey];
                                                if (!pending) return null;
                                                return (
                                                    <KycExtractionReviewCard
                                                        key={`kyc-review-${docKey}`}
                                                        documentKey={docKey}
                                                        extraction={pending.extraction}
                                                        synced={pending.synced}
                                                        syncing={syncingKycKey === docKey}
                                                        onChange={(next) =>
                                                            setPendingKycByDocKey((prev) => ({
                                                                ...prev,
                                                                [docKey]: {
                                                                    ...prev[docKey]!,
                                                                    extraction: next,
                                                                    synced: false,
                                                                },
                                                            }))
                                                        }
                                                        onSync={() => void handleSyncKycExtraction(docKey)}
                                                        onDismiss={
                                                            pending.synced
                                                                ? () =>
                                                                      setPendingKycByDocKey((prev) => {
                                                                          const next = { ...prev };
                                                                          delete next[docKey];
                                                                          return next;
                                                                      })
                                                                : undefined
                                                        }
                                                    />
                                                );
                                            },
                                        )}

                                        {documentUploadMessage && (
                                            <p className="pt-1 text-xs text-slate-600">{documentUploadMessage}</p>
                                        )}
                                        <div className="rounded-lg border border-slate-200 bg-white p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 ">
                                                    Source Application PDF
                                                </p>
                                            </div>
                                            <div className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2.5 py-2">
                                                <div className="min-w-0 pr-2">
                                                    <p className="truncate text-xs font-medium text-slate-800">
                                                        Application PDF
                                                    </p>
                                                    <p className="truncate text-[11px] text-slate-500">
                                                        {sourceApplicationPdf?.name || "Not found"}
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-7 w-7 cursor-pointer"
                                                    title="View source application PDF"
                                                    disabled={!sourceApplicationPdf?.url}
                                                    onClick={() => {
                                                        if (!sourceApplicationPdf?.url) {
                                                            setDocumentUploadMessage("Application PDF is not available.");
                                                            return;
                                                        }
                                                        setUploadedPreviewUrl(sourceApplicationPdf.url);
                                                        setActivePreview(null);
                                                    }}
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </section>
                                )}

                                {activeStep === "info" && (
                                    <section className="space-y-5">
                                        {/* Section header */}
                                        {/* <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                                            <div className="flex items-start gap-3">
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
                                                    <Info className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                                        Contract Information
                                                    </h3>
                                                    <p className="text-xs text-slate-500">
                                                        Review fetched records and fill required details for the contract.
                                                    </p>
                                                </div>
                                            </div>
                                        </div> */}

                                        {/* Stat cards */}
                                        {/* <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                                            {([
                                                { key: "addendum", label: "Addendum", state: addendumListState, accent: "from-indigo-50 to-indigo-100/40 text-indigo-600 ring-indigo-100" },
                                                { key: "ach", label: "ACH", state: achListState, accent: "from-emerald-50 to-emerald-100/40 text-emerald-600 ring-emerald-100" },
                                                { key: "epo", label: "EPO", state: epoListState, accent: "from-amber-50 to-amber-100/40 text-amber-600 ring-amber-100" },
                                                { key: "owner", label: "Owner", state: ownerListState, accent: "from-sky-50 to-sky-100/40 text-sky-600 ring-sky-100" },
                                                { key: "guarantor", label: "Guarantor", state: guarantorListState, accent: "from-rose-50 to-rose-100/40 text-rose-600 ring-rose-100" },
                                            ] as const).map((stat) => {
                                                const count = Array.isArray(stat.state.data) ? stat.state.data.length : 0;
                                                return (
                                                    <div
                                                        key={stat.key}
                                                        className={cn(
                                                            "relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br p-3 shadow-sm transition-all hover:shadow",
                                                            stat.accent,
                                                        )}
                                                    >
                                                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-600">
                                                            {stat.label}
                                                        </p>
                                                        <p className="mt-1 text-2xl font-bold leading-none text-slate-800">
                                                            {count}
                                                        </p>
                                                        <p className="mt-1 text-[10px] text-slate-500">
                                                            {count === 1 ? "record" : "records"}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div> */}

                                        {canSendWithoutContract ? (
                                            <div className="rounded-xl border border-[var(--brand)]/20 bg-gradient-to-br from-[var(--brand)]/5 to-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900 dark:ring-slate-700/80">
                                                <div className="mb-3 flex items-start gap-2.5">
                                                    <div
                                                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                                        aria-hidden
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                            Send options
                                                        </h4>
                                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                            {includeMainContractInSend
                                                                ? disclosureFirstInSend
                                                                    ? "Main contract is included. Envelope order: state disclosure → contract → addenda."
                                                                    : "Main contract is included. Envelope order: contract → addenda → state disclosure."
                                                                : "Sending configured addendum and/or state disclosure only (no main contract)."}
                                                        </p>
                                                    </div>
                                                </div>
                                                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-950">
                                                    <Checkbox
                                                        checked={includeMainContractInSend}
                                                        onCheckedChange={(checked: boolean | "indeterminate") =>
                                                            setIncludeMainContractInSend(checked === true)
                                                        }
                                                        className="mt-0.5"
                                                    />
                                                    <span className="min-w-0">
                                                        <span className="block text-xs font-medium text-slate-800 dark:text-slate-100">
                                                            Include main contract agreement
                                                        </span>
                                                        <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                                                            Uncheck only if you need to send addendum and/or disclosure without the contract.
                                                        </span>
                                                    </span>
                                                </label>
                                            </div>
                                        ) : null}

                                        {/* Addendum template picker */}
                                        <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                            <div className="mb-3 flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-start gap-2.5">
                                                    <div
                                                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                                        aria-hidden
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <label className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                            Addendum Templates
                                                        </label>
                                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                            Select a DocuSign template to add it automatically — same template can be added multiple times.
                                                        </p>
                                                    </div>
                                                </div>
                                                {addingAddendum ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--brand)]">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                        Adding…
                                                    </span>
                                                ) : addendumTemplateMappings.length > 0 ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800/50">
                                                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                                                        {addendumTemplateMappings.length} selected
                                                    </span>
                                                ) : null}
                                            </div>
                                            <select
                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100"
                                                value={selectedAddendumOption}
                                                disabled={addingAddendum}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    setUploadedPreviewUrl(null);
                                                    setSelectedAddendumOption(value);
                                                    if (value.startsWith("bs:")) {
                                                        void addAddendumTemplateMapping(
                                                            value.slice(3).trim(),
                                                        );
                                                    }
                                                }}
                                            >
                                                <option value="">Choose an addendum template…</option>
                                                {addendumTemplateOptions.length > 0
                                                    ? addendumTemplateOptions.map((t: any) => {
                                                        const tid = getAddendumDropdownRef(t);
                                                        if (!tid || !boldSignTemplateIsPreviewable(t)) {
                                                            return null;
                                                        }
                                                        return (
                                                            <option
                                                                key={`bs-${tid}`}
                                                                value={`bs:${tid}`}
                                                            >
                                                                {formatDropdownLabel(
                                                                    t?.name ||
                                                                    t?.templateName ||
                                                                    t?.title ||
                                                                    "Addendum",
                                                                ) || "Addendum"}
                                                            </option>
                                                        );
                                                    })
                                                    : null}
                                                {addendumDocs.length > 0 ? (
                                                    <optgroup label="Uploaded PDFs (preview only — not merged in DocuSign)">
                                                        {addendumDocs.map((file: any) => (
                                                            <option
                                                                key={`up-${String(file?.id || "")}`}
                                                                value={`up:${String(file?.id || "")}`}
                                                            >
                                                                {formatDropdownLabel(
                                                                    file?.fileName ||
                                                                    file?.documentType ||
                                                                    "Uploaded addendum",
                                                                ) || "Uploaded Addendum"}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                ) : null}
                                            </select>
                                            {selectedAddendumOption.startsWith("up:") ? (
                                                <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                                                    Uploaded PDFs are for preview only and are not merged into DocuSign. Choose a DocuSign template to add it.
                                                </p>
                                            ) : null}
                                        </div>
                                        <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                            <div className="mb-3 flex items-start gap-2.5">
                                                <div
                                                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                                    aria-hidden
                                                >
                                                    <Landmark className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                        Contract Meta
                                                    </h4>
                                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                        Used for CRM reporting and contract metadata. Template:{" "}
                                                        <span className="font-medium text-slate-700 dark:text-slate-300">
                                                            {activeContractTemplateName}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                                <div className="space-y-1.5">
                                                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="pdf-viewer-contract-state-info">
                                                        <MapPin className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
                                                        Select State
                                                    </label>
                                                    <SearchableStateSelect
                                                        id="pdf-viewer-contract-state-info"
                                                        value={selectedState}
                                                        disabled={savingContractMeta}
                                                        onValueChange={(v: string) => {
                                                            userSelectedStateRef.current = true;
                                                            const previousState = selectedState;
                                                            setSelectedState(v);
                                                            contractStateForFunderSyncRef.current = v;
                                                            const picked = pickUsStateForSelect(v) || v;
                                                            const activeFunders = funders.filter(
                                                                (f) => f.isActive !== false,
                                                            );
                                                            let nextFunder = selectedFunder;
                                                            let nextFunderProfileId = selectedFunderProfileId;

                                                            if (
                                                                isTexasContractState(picked) &&
                                                                !isTexasContractState(previousState)
                                                            ) {
                                                                // Non-Texas → Texas: always Texas funder
                                                                const tfg =
                                                                    activeFunders.find((f) =>
                                                                        isTexasFundingGroupFunderProfile(f),
                                                                    ) ??
                                                                    activeFunders.find(
                                                                        (f) =>
                                                                            String(
                                                                                f.mainContractLayoutKey ||
                                                                                    "",
                                                                            ).trim() ===
                                                                            "texas_funding_group_contract",
                                                                    );
                                                                if (tfg) {
                                                                    nextFunder = tfg.name;
                                                                    nextFunderProfileId = tfg.id;
                                                                }
                                                            } else if (
                                                                isTexasContractState(previousState) &&
                                                                !isTexasContractState(picked)
                                                            ) {
                                                                // Texas → non-Texas: always Woodmere
                                                                const woodmere = activeFunders.find((f) =>
                                                                    isWoodmereFunderProfile(f),
                                                                );
                                                                if (woodmere) {
                                                                    nextFunder = woodmere.name;
                                                                    nextFunderProfileId = woodmere.id;
                                                                }
                                                            } else {
                                                                // Same Texas-ness: keep funder unless unavailable
                                                                const currentFunder =
                                                                    findFunderById(selectedFunderProfileId) ??
                                                                    findFunder(selectedFunder);
                                                                if (
                                                                    (selectedFunderProfileId || selectedFunder) &&
                                                                    currentFunder &&
                                                                    picked &&
                                                                    !funderAvailableForContractState(
                                                                        currentFunder,
                                                                        picked,
                                                                    )
                                                                ) {
                                                                    nextFunder = "";
                                                                    nextFunderProfileId = "";
                                                                }
                                                            }

                                                            if (
                                                                nextFunder !== selectedFunder ||
                                                                nextFunderProfileId !== selectedFunderProfileId
                                                            ) {
                                                                selectedFunderProfileIdRef.current =
                                                                    nextFunderProfileId;
                                                                selectedFunderRef.current = nextFunder;
                                                                setSelectedFunderProfileId(nextFunderProfileId);
                                                                setSelectedFunder(nextFunder);
                                                                setTenantCcDefaultsFunderKey("");
                                                            }
                                                            const nextDocsLayoutFunderId = (() => {
                                                                const profile =
                                                                    (nextFunderProfileId
                                                                        ? findFunderById(nextFunderProfileId)
                                                                        : null) ??
                                                                    (nextFunder
                                                                        ? findFunder(nextFunder)
                                                                        : null);
                                                                return profile
                                                                    ? resolveAddendumDocumentsLayoutFunderId(profile)
                                                                    : null;
                                                            })();
                                                            const nextDisclosureDocsLayoutFunderId = (() => {
                                                                const profile =
                                                                    (nextFunderProfileId
                                                                        ? findFunderById(nextFunderProfileId)
                                                                        : null) ??
                                                                    (nextFunder
                                                                        ? findFunder(nextFunder)
                                                                        : null);
                                                                return profile
                                                                    ? resolveDisclosureDocumentsLayoutFunderId(profile)
                                                                    : null;
                                                            })();
                                                            docsLayoutFunderIdRef.current =
                                                                nextDocsLayoutFunderId;
                                                            disclosureDocsLayoutFunderIdRef.current =
                                                                nextDisclosureDocsLayoutFunderId;
                                                            if (
                                                                nextFunder !== selectedFunder ||
                                                                nextFunderProfileId !== selectedFunderProfileId
                                                            ) {
                                                                const opt = String(
                                                                    selectedAddendumOption || "",
                                                                ).trim();
                                                                if (opt.startsWith("bs:")) {
                                                                    const ref = opt.slice(3).trim();
                                                                    const stillValid =
                                                                        isAddendumRefValidForDocsFunder(
                                                                            ref,
                                                                            nextDocsLayoutFunderId,
                                                                            boldSignTemplates,
                                                                        );
                                                                    if (!stillValid) {
                                                                        setSelectedAddendumOption("");
                                                                    }
                                                                }
                                                                void pruneAddendumMappingsForDocsFunder(
                                                                    nextDocsLayoutFunderId,
                                                                );
                                                            }
                                                            if (
                                                                effectiveContractId != null &&
                                                                picked
                                                            ) {
                                                                disclosureAutoLinkKeyRef.current = `${effectiveContractId}:${picked}:${contractDisclosureFrequency}:${nextDisclosureDocsLayoutFunderId ?? "platform"}`;
                                                            } else {
                                                                disclosureAutoLinkKeyRef.current = "";
                                                            }
                                                            if (effectiveContractId != null) {
                                                                void persistContractStateAndFunder({
                                                                    state: v,
                                                                    ...(nextFunder !== selectedFunder
                                                                        ? { funderName: nextFunder }
                                                                        : {}),
                                                                });
                                                            }
                                                            if (effectiveContractId != null) {
                                                                void syncDisclosureTemplateForState(v, {
                                                                    docsLayoutFunderId:
                                                                        nextDisclosureDocsLayoutFunderId,
                                                                });
                                                            }
                                                        }}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300" htmlFor="pdf-viewer-contract-funder-info">
                                                        <Building2 className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
                                                        Select Funder
                                                    </label>
                                                    <div className="flex items-start gap-2">
                                                        <Select
                                                            value={selectedFunderProfileId || undefined}
                                                            disabled={savingContractMeta}
                                                            onValueChange={(profileId: string) => {
                                                                userSelectedFunderRef.current = true;
                                                                const profile = findFunderById(profileId);
                                                                const funderName = profile?.name ?? "";
                                                                selectedFunderProfileIdRef.current = profileId;
                                                                selectedFunderRef.current = funderName;
                                                                setSelectedFunderProfileId(profileId);
                                                                setSelectedFunder(funderName);
                                                                setTenantCcDefaultsFunderKey("");
                                                                const nextCcOptions = buildContractCcMergeOptions({
                                                                    selectedFunderDefaultCcEmail:
                                                                        String(profile?.defaultCcEmail ?? "").trim() ||
                                                                        null,
                                                                    selectedFunderKey: contractCcFunderKey(
                                                                        profileId,
                                                                        funderName,
                                                                    ),
                                                                    apiDefaults: null,
                                                                    apiFunderKey: "",
                                                                    funderDefaultCcValues: funders.map(
                                                                        (f) => f.defaultCcEmail,
                                                                    ),
                                                                });
                                                                const nextCc = loadBoldSignCcEmailList(nextCcOptions);
                                                                setCcEmails(nextCc);
                                                                saveBoldSignCcEmailList(nextCc, nextCcOptions);
                                                                setCcEmailDraft("");
                                                                scheduleMainContractTemplatePreview(profileId);
                                                                const nextDocsLayoutFunderId = profile
                                                                    ? resolveAddendumDocumentsLayoutFunderId(profile)
                                                                    : null;
                                                                const nextDisclosureDocsLayoutFunderId = profile
                                                                    ? resolveDisclosureDocumentsLayoutFunderId(profile)
                                                                    : null;
                                                                docsLayoutFunderIdRef.current =
                                                                    nextDocsLayoutFunderId;
                                                                disclosureDocsLayoutFunderIdRef.current =
                                                                    nextDisclosureDocsLayoutFunderId;
                                                                const picked =
                                                                    pickUsStateForSelect(selectedState);
                                                                if (
                                                                    effectiveContractId != null &&
                                                                    picked
                                                                ) {
                                                                    disclosureAutoLinkKeyRef.current = `${effectiveContractId}:${picked}:${contractDisclosureFrequency}:${nextDisclosureDocsLayoutFunderId ?? "platform"}`;
                                                                    void syncDisclosureTemplateForState(
                                                                        picked,
                                                                        {
                                                                            docsLayoutFunderId:
                                                                                nextDisclosureDocsLayoutFunderId,
                                                                        },
                                                                    );
                                                                }
                                                                const opt = String(
                                                                    selectedAddendumOption || "",
                                                                ).trim();
                                                                if (opt.startsWith("bs:")) {
                                                                    const ref = opt.slice(3).trim();
                                                                    const stillValid =
                                                                        isAddendumRefValidForDocsFunder(
                                                                            ref,
                                                                            nextDocsLayoutFunderId,
                                                                            boldSignTemplates,
                                                                        );
                                                                    if (!stillValid) {
                                                                        setSelectedAddendumOption("");
                                                                    }
                                                                }
                                                                void pruneAddendumMappingsForDocsFunder(
                                                                    nextDocsLayoutFunderId,
                                                                );
                                                                if (effectiveContractId != null) {
                                                                    void persistContractStateAndFunder({
                                                                        funderName,
                                                                    });
                                                                }
                                                            }}
                                                        >
                                                            <SelectTrigger
                                                                id="pdf-viewer-contract-funder-info"
                                                                className="h-10 min-w-0 flex-1 rounded-md border border-[var(--brand)]/20 bg-background px-3 py-2 text-sm shadow-sm focus:ring-[var(--brand)]/25 disabled:opacity-60 dark:border-slate-600"
                                                            >
                                                                <SelectValue placeholder="Select funder" />
                                                            </SelectTrigger>
                                                            <SelectContent position="popper" className="z-[10100] max-h-72">
                                                                {funderSelectOptions.map((f) => (
                                                                    <SelectItem key={f.value} value={f.value}>
                                                                        {f.label}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                        <Button
                                                            type="button"
                                                            size="icon"
                                                            variant="outline"
                                                            className="h-10 w-10 shrink-0 border-[var(--brand)]/20"
                                                            title="View contract template"
                                                            aria-label="View contract template"
                                                            disabled={!selectedFunder || previewingMainContract}
                                                            onClick={() => void handlePreviewMainContractTemplate()}
                                                        >
                                                            {previewingMainContract ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                                            ) : (
                                                                <Eye className="h-4 w-4" aria-hidden />
                                                            )}
                                                        </Button>
                                                    </div>
                                                    {selectedFunder ? (
                                                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                                            Template:{" "}
                                                            {previewNameFor(
                                                                selectedFunder,
                                                                selectedFunderProfileId,
                                                            )}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                            <div className="mb-3 flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-start gap-2.5">
                                                    <div
                                                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                                        aria-hidden
                                                    >
                                                        <ScrollText className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                            State disclosure
                                                        </h4>
                                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                            {disclosureFirstInSend
                                                                ? "Linked from the selected state and placed first in the envelope, before the contract and addenda."
                                                                : "Linked from the selected state and placed last in the envelope, after the contract and addenda."}
                                                        </p>
                                                    </div>
                                                </div>
                                                {linkingDisclosureTemplate ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--brand)]">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                        Loading
                                                    </span>
                                                ) : linkedDisclosureMapping &&
                                                  linkedDisclosureMatchesSelectedState ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-800 ring-1 ring-emerald-200/80 dark:bg-emerald-900/40 dark:text-emerald-200 dark:ring-emerald-800/50">
                                                        <CheckCircle2 className="h-3 w-3" aria-hidden />
                                                        Linked
                                                    </span>
                                                ) : null}
                                            </div>

                                            <div className="space-y-2">
                                                {linkingDisclosureTemplate ? (
                                                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--brand)]/25 bg-slate-50/80 py-6 text-center dark:border-slate-600 dark:bg-slate-800/30">
                                                        <Loader2
                                                            className="h-8 w-8 animate-spin text-[var(--brand)]"
                                                            aria-hidden
                                                        />
                                                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                                            {selectedState
                                                                ? `Loading disclosure for ${selectedState}…`
                                                                : "Loading disclosure…"}
                                                        </p>
                                                    </div>
                                                ) : linkedDisclosureMapping &&
                                                  linkedDisclosureMatchesSelectedState ? (
                                                    <>
                                                        <div
                                                            key={linkedDisclosureMapping.id}
                                                            className="flex items-center justify-between gap-2 rounded-lg border border-teal-200/90 bg-gradient-to-r from-teal-50/80 to-white px-2.5 py-2.5 shadow-sm transition-colors dark:border-slate-600 dark:from-teal-950/25 dark:to-slate-900/80"
                                                        >
                                                            <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-2">
                                                                <div
                                                                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-sm"
                                                                    aria-hidden
                                                                >
                                                                    <ScrollText className="h-4 w-4" />
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                                        <span className="inline-flex rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                                                                            Disclosure
                                                                        </span>
                                                                    </div>
                                                                    <p className="mt-1 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                                                                        {formatDropdownLabel(
                                                                            formatDisclosureTemplateLabel(
                                                                                linkedDisclosureMapping,
                                                                            ),
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex shrink-0 items-center gap-0.5">
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 cursor-pointer text-slate-600 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                                                                    title="View disclosure PDF"
                                                                    disabled={
                                                                        previewingTemplateId ===
                                                                        String(linkedDisclosureMapping.id)
                                                                    }
                                                                    onClick={() =>
                                                                        void handlePreviewBoldSignTemplate(
                                                                            linkedDisclosureMapping,
                                                                        )
                                                                    }
                                                                >
                                                                    {previewingTemplateId ===
                                                                    String(linkedDisclosureMapping.id) ? (
                                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    ) : (
                                                                        <Eye className="h-3.5 w-3.5" />
                                                                    )}
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    size="icon"
                                                                    variant="ghost"
                                                                    className="h-8 w-8 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                                                    title="Remove disclosure"
                                                                    onClick={() =>
                                                                        void setDisclosureTemplateMapping(null)
                                                                    }
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-950">
                                                            <Checkbox
                                                                checked={disclosureFirstInSend}
                                                                onCheckedChange={(checked: boolean | "indeterminate") =>
                                                                    setDisclosureFirstInSend(checked === true)
                                                                }
                                                                className="mt-0.5"
                                                            />
                                                            <span className="min-w-0">
                                                                <span className="block text-xs font-medium text-slate-800 dark:text-slate-100">
                                                                    Place state disclosure first
                                                                </span>
                                                                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                                                                    {disclosureFirstInSend
                                                                        ? "Opens first in DocuSign: disclosure → contract → addenda."
                                                                        : "Placed last in DocuSign: contract → addenda → disclosure."}
                                                                </span>
                                                            </span>
                                                        </label>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            className="h-9 w-full border-[var(--brand)]/30 text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                                            onClick={() => setDisclosureCalcModalOpen(true)}
                                                        >
                                                            <Calculator className="mr-2 h-4 w-4" />
                                                            Calculate disclosure
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 py-6 text-center dark:border-slate-600 dark:bg-slate-800/30">
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
                                                            <ScrollText className="h-5 w-5" aria-hidden />
                                                        </div>
                                                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                                            {selectedState
                                                                ? `No disclosure linked for ${selectedState}.`
                                                                : "Select a state to link a disclosure."}
                                                        </p>
                                                        <p className="max-w-[260px] text-[10px] text-slate-500">
                                                            Upload the state PDF to Cloudinary and add a
                                                            BoldSignTemplate row with type disclosure.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                            <div className="mb-3 flex items-start justify-between gap-2">
                                                <div className="flex min-w-0 items-start gap-2.5">
                                                    <div
                                                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                                        aria-hidden
                                                    >
                                                        <Layers className="h-4 w-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                            Addendum
                                                        </h4>
                                                        <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                            DocuSign addendum templates merged when you send the contract.
                                                        </p>
                                                    </div>
                                                </div>
                                                {loadingTemplateMappings ? (
                                                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--brand)]">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                                        Loading
                                                    </span>
                                                ) : null}
                                            </div>

                                            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                <FileSignature className="h-3 w-3 text-[var(--brand)]" aria-hidden />
                                                DocuSign templates
                                            </p>
                                            <div className="space-y-2">
                                                {addendumTemplateMappings.length > 0 ? (
                                                    <AddendumSendOrderBoard
                                                        items={[...addendumTemplateMappings]
                                                        .sort(
                                                            (a, b) =>
                                                                Number(a.order ?? 0) -
                                                                Number(b.order ?? 0),
                                                        )}
                                                        disabled={loadingTemplateMappings || reorderingAddendums}
                                                        onReorder={(next) => void reorderAddendumTemplateMappings(next)}
                                                        renderItem={(row, index) => (
                                                            <div
                                                                key={row.id}
                                                                className="flex items-center justify-between gap-2 rounded-lg border border-indigo-200/90 bg-gradient-to-r from-indigo-50/80 to-white px-2.5 py-2.5 shadow-sm transition-colors dark:border-slate-600 dark:from-indigo-950/25 dark:to-slate-900/80"
                                                            >
                                                                <div className="flex min-w-0 flex-1 items-center gap-2.5 pr-2">
                                                                    <div
                                                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm"
                                                                        aria-hidden
                                                                    >
                                                                        <FileText className="h-4 w-4" />
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <div className="flex flex-wrap items-center gap-1.5">
                                                                            <span className="inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200">
                                                                                Addendum
                                                                            </span>
                                                                        </div>
                                                                        <p className="mt-1 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                                                                            {index + 1}.{" "}
                                                                            {formatDropdownLabel(
                                                                                row.template?.name ||
                                                                                    row.template?.templateId ||
                                                                                    row.templateId ||
                                                                                    "Template",
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex shrink-0 items-center gap-0.5">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 cursor-pointer text-slate-600 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                                                                        title="View template PDF"
                                                                        disabled={
                                                                            previewingTemplateId ===
                                                                            String(row.id)
                                                                        }
                                                                        onClick={() =>
                                                                            void handlePreviewBoldSignTemplate(
                                                                                row,
                                                                            )
                                                                        }
                                                                    >
                                                                        {previewingTemplateId ===
                                                                        String(row.id) ? (
                                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                        ) : (
                                                                            <Eye className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </Button>
                                                                    {hasAddendumPrefillFieldMap(
                                                                        row.template?.templateId ??
                                                                            row.templateId,
                                                                        row.template?.name ?? null,
                                                                        row.template?.layoutKey ?? null,
                                                                    ) ||
                                                                    usesCoordinateLayoutTemplate(row) ? (
                                                                        <Button
                                                                            type="button"
                                                                            size="icon"
                                                                            variant="ghost"
                                                                            className="h-8 w-8 cursor-pointer text-slate-600 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40"
                                                                            title={
                                                                                usesCoordinateLayoutTemplate(
                                                                                    row,
                                                                                )
                                                                                    ? "Edit ACH prefill"
                                                                                    : "Edit addendum prefill"
                                                                            }
                                                                            onClick={() =>
                                                                                setTemplateMappingPrefillEditRow(
                                                                                    row,
                                                                                )
                                                                            }
                                                                        >
                                                                            <Pencil className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    ) : null}
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-8 w-8 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                                                        title="Remove addendum"
                                                                        disabled={removingAddendumMappingIds.has(
                                                                            String(row.id),
                                                                        )}
                                                                        onClick={() =>
                                                                            void removeAddendumTemplateMapping(
                                                                                row.id,
                                                                            )
                                                                        }
                                                                    >
                                                                        {removingAddendumMappingIds.has(
                                                                            String(row.id),
                                                                        ) ? (
                                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                        ) : (
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 py-6 text-center dark:border-slate-600 dark:bg-slate-800/30">
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
                                                            <Layers className="h-5 w-5" aria-hidden />
                                                        </div>
                                                        <p className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                                                            No addendum template linked yet.
                                                        </p>
                                                        <p className="max-w-[240px] text-[10px] text-slate-500">
                                                            Pick an addendum template above to merge with the contract.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {addendumDocs.length > 0 || payoffLetterDocs.length > 0 ? (
                                                <>
                                                    <p className="mb-2 mt-5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        <FileText className="h-3 w-3 text-amber-600 dark:text-amber-400" aria-hidden />
                                                        Uploaded PDFs
                                                    </p>
                                                    <div className="space-y-2">
                                                        {addendumDocs.map((file: any) => (
                                                            <div
                                                                key={`add-pdf-${String(file?.id || "")}`}
                                                                className="flex items-center justify-between rounded-lg border border-amber-200/80 bg-gradient-to-r from-amber-50/60 to-white px-2.5 py-2 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-slate-900/80"
                                                            >
                                                                <div className="min-w-0 pr-2">
                                                                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                                                                        Uploaded addendum
                                                                    </p>
                                                                    <p className="truncate text-[11px] text-slate-500">
                                                                        {formatDropdownLabel(
                                                                            file?.fileName || file?.documentType || "PDF",
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div className="flex shrink-0 items-center gap-0.5">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 cursor-pointer text-slate-600 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                                                                        title="View PDF"
                                                                        onClick={() =>
                                                                            void handlePreviewUploadedDocument(String(file?.id || ""))
                                                                        }
                                                                    >
                                                                        <Eye className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 cursor-pointer text-slate-600 hover:bg-amber-50 hover:text-amber-800 dark:hover:bg-amber-950/40"
                                                                        title="Replace file"
                                                                        onClick={() => handleEditUploadedDocument(String(file?.id || ""))}
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                                                        title="Delete file"
                                                                        onClick={() =>
                                                                            void handleDeleteUploadedDocument(String(file?.id || ""))
                                                                        }
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                        {payoffLetterDocs.map((file: any) => (
                                                            <div
                                                                key={`payoff-pdf-${String(file?.id || "")}`}
                                                                className="flex items-center justify-between rounded-lg border border-sky-200/80 bg-gradient-to-r from-sky-50/60 to-white px-2.5 py-2 dark:border-sky-900/40 dark:from-sky-950/20 dark:to-slate-900/80"
                                                            >
                                                                <div className="min-w-0 pr-2">
                                                                    <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                                                                        Payoff letter (uploaded)
                                                                    </p>
                                                                    <p className="truncate text-[11px] text-slate-500">
                                                                        {formatDropdownLabel(
                                                                            file?.fileName || file?.documentType || "PDF",
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <div className="flex shrink-0 items-center gap-0.5">
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 cursor-pointer text-slate-600 hover:bg-[var(--brand)]/10 hover:text-[var(--brand)]"
                                                                        title="View PDF"
                                                                        onClick={() =>
                                                                            void handlePreviewUploadedDocument(String(file?.id || ""))
                                                                        }
                                                                    >
                                                                        <Eye className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 cursor-pointer text-slate-600 hover:bg-sky-50 hover:text-sky-800 dark:hover:bg-sky-950/40"
                                                                        title="Replace file"
                                                                        onClick={() => handleEditUploadedDocument(String(file?.id || ""))}
                                                                    >
                                                                        <Pencil className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                    <Button
                                                                        type="button"
                                                                        size="icon"
                                                                        variant="ghost"
                                                                        className="h-7 w-7 cursor-pointer text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40"
                                                                        title="Delete file"
                                                                        onClick={() =>
                                                                            void handleDeleteUploadedDocument(String(file?.id || ""))
                                                                        }
                                                                    >
                                                                        <Trash2 className="h-3.5 w-3.5" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : null}
                                        </div>

                                        {/* <div className="rounded-xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm ring-1 ring-slate-200/80 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700/80">
                                            <div className="mb-3 flex items-start gap-2.5">
                                                <div
                                                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/12 text-[var(--brand)]"
                                                    aria-hidden
                                                >
                                                    <ClipboardList className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                                        Add / Edit Information
                                                    </p>
                                                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                        Open a section to capture details saved on the contract.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                                {([
                                                    { id: "addendum", label: "Addendum", Icon: FileText },
                                                    { id: "ach", label: "ACH", Icon: Wallet },
                                                    { id: "epo", label: "EPOs", Icon: BadgeCheck },
                                                    { id: "guarantor", label: "Guarantor", Icon: Shield },
                                                ] as const).map((tab) => {
                                                    const TabIcon = tab.Icon;
                                                    const isSelected = selectedInfoPanels.includes(tab.id);
                                                    const isActive = activeInfoPanel === tab.id;
                                                    return (
                                                        <label
                                                            key={tab.id}
                                                            className={cn(
                                                                "group flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition-all",
                                                                isActive
                                                                    ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)] shadow-sm ring-1 ring-[var(--brand)]/30"
                                                                    : isSelected
                                                                        ? "border-[var(--brand)]/40 bg-[var(--brand)]/5 text-slate-800 dark:text-slate-200"
                                                                        : "border-slate-200 bg-white text-slate-600 hover:border-[var(--brand)]/35 hover:bg-[var(--brand)]/5 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-300",
                                                            )}
                                                        >
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={(checked: boolean | "indeterminate") => {
                                                                    if (checked) {
                                                                        setSelectedInfoPanels((prev) =>
                                                                            prev.includes(tab.id) ? prev : [...prev, tab.id],
                                                                        );
                                                                        setActiveInfoPanel(tab.id);
                                                                        setInfoPanelMessage("");
                                                                    } else {
                                                                        setSelectedInfoPanels((prev) => {
                                                                            const next = prev.filter((id) => id !== tab.id);
                                                                            if (activeInfoPanel === tab.id) setActiveInfoPanel(null);
                                                                            setInfoPanelMessage("");
                                                                            return next;
                                                                        });
                                                                    }
                                                                }}
                                                                className="border-[var(--brand)]/60 data-[state=checked]:bg-[image:var(--brand-gradient)] data-[state=checked]:border-[var(--brand)]"
                                                            />
                                                            <TabIcon
                                                                className={cn(
                                                                    "h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100",
                                                                    isActive && "opacity-100",
                                                                )}
                                                                aria-hidden
                                                            />
                                                            <span className="truncate">{tab.label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div> */}


                                        {activeInfoPanel && (
                                            <div className="overflow-hidden rounded-xl border border-[var(--brand)]/20 bg-white shadow-sm animate-in fade-in slide-in-from-top-1 duration-200 dark:border-slate-700 dark:bg-slate-900">
                                                <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[var(--brand)]/5 to-transparent px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand)]/10 text-[var(--brand)]">
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </span>
                                                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--brand)]">
                                                            {activeInfoPanel} Details
                                                        </p>
                                                    </div>

                                                    {(activeInfoPanel === "addendum" || activeInfoPanel === "ach" || activeInfoPanel === "epo" || activeInfoPanel === "owner" || activeInfoPanel === "guarantor") && (
                                                        <div className="flex items-center gap-2">
                                                            <Button
                                                                type="button"
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 gap-1 text-[10px] text-[var(--brand)] hover:text-[var(--brand)]/90 hover:bg-[var(--brand)]/10 cursor-pointer"
                                                                onClick={() => {
                                                                    if (activeInfoPanel === "addendum") {
                                                                        setAddendumEntries((prev) => [...prev, {
                                                                            id: createTempId(),
                                                                            legalName: "",
                                                                            dba: "",
                                                                            typeOfEntity: "",
                                                                            ein: "",
                                                                            mailingAddress: "",
                                                                            addendumDated: "",
                                                                            principalOwner: "",
                                                                            principalBusiness: "",
                                                                            businessLocation: "",
                                                                            principalState: "",
                                                                            principalOwnerAmount1: "",
                                                                            principalOwnerAmount2: "",
                                                                            principalOwner1Name: "",
                                                                            principalOwner1Date: "",
                                                                            principalOwner2Name: "",
                                                                            principalOwner2Date: "",
                                                                        }]);
                                                                    } else if (activeInfoPanel === "ach") {
                                                                        setAchEntries((prev) => [...prev, {
                                                                            id: createTempId(),
                                                                            bankName: "",
                                                                            fullNameOnAccount: "",
                                                                            accountNumber: "",
                                                                            routingNumber: "",
                                                                            ach_authorization_bank_portal_website: "",
                                                                            ach_authorization_username: "",
                                                                            ach_authorization_password: "",
                                                                            ach_authorization_security_question1: "",
                                                                            ach_authorization_security_answer1: "",
                                                                            ach_authorization_security_question2: "",
                                                                            ach_authorization_security_answer2: "",
                                                                            ach_authorization_security_question3: "",
                                                                            ach_authorization_security_answer3: "",
                                                                            ach_authorization_other_infomation: "",
                                                                            ach_authorization_reference_name1: "",
                                                                            ach_authorization_reference_number_1: "",
                                                                            ach_authorization_reference_relationship1: "",
                                                                            ach_authorization_reference_name2: "",
                                                                            ach_authorization_reference_number2: "",
                                                                            ach_authorization_reference_relationship2: "",
                                                                            ach_authorization_reference_name3: "",
                                                                            ach_authorization_reference_number3: "",
                                                                            ach_authorization_reference_relationship3: "",
                                                                            dba: "",
                                                                            phone: "",
                                                                            address: "",
                                                                            city: "",
                                                                            state: "",
                                                                            zip: "",
                                                                            bankBranchCity: "",
                                                                            bankState: "",
                                                                            bankZip: "",
                                                                        }]);
                                                                    } else if (activeInfoPanel === "epo") {
                                                                        setEpoEntries((prev) => [...prev, { id: createTempId(), legalName: "", receivedDate: "" }]);
                                                                    } else if (activeInfoPanel === "owner") {
                                                                        setOwnerEntries((prev) =>
                                                                            prev.length >= 2
                                                                                ? prev
                                                                                : [...prev, { id: createTempId(), ownerFirstName: "", ownerLastName: "", ownerEmail: "", ownerPhone: "", ownerAddress: "", state: "", city: "", zipCode: "", ownershipPercentage: "" }],
                                                                        );
                                                                    } else {
                                                                        setGuarantorEntries((prev) =>
                                                                            prev.length >= 2
                                                                                ? prev
                                                                                : [...prev, { id: createTempId(), guarantorFirstName: "", guarantorLastName: "", guarantorEmail: "", guarantorPhone: "", guarantorAddress: "", state: "", city: "", zipCode: "", ssnNumber: "", driverLicenseNumber: "", typeOfEntity: "" }],
                                                                        );
                                                                    }
                                                                }}
                                                                disabled={
                                                                    (activeInfoPanel === "owner" && ownerEntries.length >= 2) ||
                                                                    (activeInfoPanel === "guarantor" && guarantorEntries.length >= 2)
                                                                }
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                                Add Entry
                                                            </Button>

                                                        </div>
                                                    )}
                                                </div>

                                                {/* <div className="space-y-4 p-4">
                                               
                                                    {activeInfoPanel === "addendum" && addendumEntries.map((entry, idx) => (
                                                        <div key={entry.id} className="group relative space-y-4 rounded-lg border border-slate-200 bg-slate-50/30 p-4 transition-colors hover:border-slate-300">
                                                            <div className="flex items-center justify-between">
                                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                                                                    Entry #{idx + 1}
                                                                </span>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-red-500 hover:bg-red-50 cursor-pointer"
                                                                    onClick={() => void removeInfoEntry("addendum", entry.id)}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Business Identity</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <Input className="bg-white" placeholder="Legal Name" value={entry.legalName} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, legalName: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="DBA" value={entry.dba} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, dba: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Type of Entity" value={entry.typeOfEntity} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, typeOfEntity: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="EIN" value={entry.ein} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ein: e.target.value } : x)))} />
                                                                    <Input className="bg-white sm:col-span-2" placeholder="Mailing Address" value={entry.mailingAddress} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, mailingAddress: e.target.value } : x)))} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Addendum Details</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <Input className="bg-white" placeholder="Addendum Dated" value={entry.addendumDated} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, addendumDated: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Principal Owner" value={entry.principalOwner} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwner: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Principal Business" value={entry.principalBusiness} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalBusiness: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Business Location" value={entry.businessLocation} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, businessLocation: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Principal State" value={entry.principalState} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalState: e.target.value } : x)))} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Owner Amounts</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <UsCurrencyInput className="bg-white" placeholder="Offer amount" value={entry.principalOwnerAmount1} onChange={(next) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwnerAmount1: next } : x)))} />
                                                                    <UsCurrencyInput className="bg-white" placeholder="Payback amount" value={entry.principalOwnerAmount2} onChange={(next) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwnerAmount2: next } : x)))} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Owner Signatures</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <Input className="bg-white" placeholder="Owner 1 Name" value={entry.principalOwner1Name} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwner1Name: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Owner 1 Date" value={entry.principalOwner1Date} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwner1Date: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Owner 2 Name" value={entry.principalOwner2Name} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwner2Name: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Owner 2 Date" value={entry.principalOwner2Date} onChange={(e) => setAddendumEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, principalOwner2Date: e.target.value } : x)))} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}

                                               
                                                    {activeInfoPanel === "ach" && achEntries.map((entry, idx) => (
                                                        <div key={entry.id} className="group relative space-y-4 rounded-lg border border-slate-200 bg-slate-50/30 p-4 transition-colors hover:border-slate-300">
                                                            <div className="flex items-center justify-between">
                                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                                                                    Entry #{idx + 1}
                                                                </span>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-red-500 hover:bg-red-50 cursor-pointer"
                                                                    onClick={() => void removeInfoEntry("ach", entry.id)}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bank Account</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <Input className="bg-white" placeholder="Bank Name" value={entry.bankName} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, bankName: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Full Name on Account" value={entry.fullNameOnAccount} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, fullNameOnAccount: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Account #" value={entry.accountNumber} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, accountNumber: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Routing #" value={entry.routingNumber} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, routingNumber: e.target.value } : x)))} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bank Portal Authorization</p>
                                                                <Input className="bg-white" placeholder="Bank Portal Website" value={entry.ach_authorization_bank_portal_website} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_bank_portal_website: e.target.value } : x)))} />
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <Input className="bg-white" placeholder="Username" value={entry.ach_authorization_username} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_username: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Password" value={entry.ach_authorization_password} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_password: e.target.value } : x)))} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Security Questions</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                    <Input className="bg-white" placeholder="Question 1" value={entry.ach_authorization_security_question1} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_security_question1: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Answer 1" value={entry.ach_authorization_security_answer1} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_security_answer1: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Question 2" value={entry.ach_authorization_security_question2} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_security_question2: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Answer 2" value={entry.ach_authorization_security_answer2} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_security_answer2: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Question 3" value={entry.ach_authorization_security_question3} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_security_question3: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Answer 3" value={entry.ach_authorization_security_answer3} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_security_answer3: e.target.value } : x)))} />
                                                                </div>
                                                                <Input className="bg-white" placeholder="Other Information" value={entry.ach_authorization_other_infomation} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_other_infomation: e.target.value } : x)))} />
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">References</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                                    <Input className="bg-white" placeholder="Reference 1 Name" value={entry.ach_authorization_reference_name1} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_name1: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 1 Number" value={entry.ach_authorization_reference_number_1} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_number_1: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 1 Relationship" value={entry.ach_authorization_reference_relationship1} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_relationship1: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 2 Name" value={entry.ach_authorization_reference_name2} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_name2: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 2 Number" value={entry.ach_authorization_reference_number2} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_number2: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 2 Relationship" value={entry.ach_authorization_reference_relationship2} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_relationship2: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 3 Name" value={entry.ach_authorization_reference_name3} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_name3: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 3 Number" value={entry.ach_authorization_reference_number3} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_number3: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Reference 3 Relationship" value={entry.ach_authorization_reference_relationship3} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ach_authorization_reference_relationship3: e.target.value } : x)))} />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-3">
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Account Holder Address</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                                    <Input className="bg-white" placeholder="DBA" value={entry.dba} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, dba: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Phone" value={entry.phone} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, phone: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Address" value={entry.address} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, address: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="City" value={entry.city} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, city: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="State" value={entry.state} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, state: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Zip" value={entry.zip} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, zip: e.target.value } : x)))} />
                                                                </div>
                                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Bank Branch</p>
                                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                                    <Input className="bg-white" placeholder="Branch City" value={entry.bankBranchCity} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, bankBranchCity: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Bank State" value={entry.bankState} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, bankState: e.target.value } : x)))} />
                                                                    <Input className="bg-white" placeholder="Bank Zip" value={entry.bankZip} onChange={(e) => setAchEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, bankZip: e.target.value } : x)))} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {activeInfoPanel === "epo" && epoEntries.map((entry, idx) => (
                                                        <div key={entry.id} className="group relative space-y-3 rounded-lg border border-slate-200 bg-slate-50/30 p-4 transition-colors hover:border-slate-300">
                                                            <div className="flex items-center justify-between">
                                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                                                                    Entry #{idx + 1}
                                                                </span>
                                                                <Button
                                                                    type="button"
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-red-500 hover:bg-red-50 cursor-pointer"
                                                                    onClick={() => void removeInfoEntry("epo", entry.id)}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                <Input className="bg-white" placeholder="Legal Name" value={entry.legalName} onChange={(e) => setEpoEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, legalName: e.target.value } : x)))} />
                                                                <Input className="bg-white" type="date" value={entry.receivedDate} onChange={(e) => setEpoEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, receivedDate: e.target.value } : x)))} />
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {activeInfoPanel === "owner" && ownerEntries.map((entry, idx) => (
                                                        <div key={entry.id} className="group relative space-y-3 rounded-lg border border-slate-200 bg-slate-50/30 p-4">
                                                            <div className="flex items-center justify-between">
                                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                                                                    <User className="h-3 w-3" />
                                                                    Owner #{idx + 1}
                                                                </span>
                                                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 cursor-pointer" onClick={() => void removeInfoEntry("owner", entry.id)}>
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                <Input className="bg-white" placeholder="First name" value={entry.ownerFirstName} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ownerFirstName: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Last name" value={entry.ownerLastName} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ownerLastName: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Email" value={entry.ownerEmail} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ownerEmail: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Phone" value={entry.ownerPhone} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ownerPhone: e.target.value } : x)))} />
                                                                <Input className="bg-white sm:col-span-2" placeholder="Address" value={entry.ownerAddress} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ownerAddress: e.target.value } : x)))} />
                                                                <select value={entry.state} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, state: e.target.value } : x)))} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                                                                    <option value="">Select state</option>
                                                                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                                </select>
                                                                <Input className="bg-white" placeholder={entry.state ? "City" : "Select state first"} disabled={!entry.state} value={entry.city} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, city: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Zip Code" value={entry.zipCode} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, zipCode: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Ownership %" value={entry.ownershipPercentage} onChange={(e) => setOwnerEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ownershipPercentage: e.target.value } : x)))} />
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {activeInfoPanel === "guarantor" && guarantorEntries.map((entry, idx) => (
                                                        <div key={entry.id} className="group relative space-y-3 rounded-lg border border-slate-200 bg-slate-50/30 p-4">
                                                            <div className="flex items-center justify-between">
                                                                <span className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                                                                    <User className="h-3 w-3" />
                                                                    Guarantor #{idx + 1}
                                                                </span>
                                                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:bg-red-50 cursor-pointer" onClick={() => void removeInfoEntry("guarantor", entry.id)}>
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                                <Input className="bg-white" placeholder="First name" value={entry.guarantorFirstName} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, guarantorFirstName: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Last name" value={entry.guarantorLastName} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, guarantorLastName: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Email" value={entry.guarantorEmail} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, guarantorEmail: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Phone" value={entry.guarantorPhone} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, guarantorPhone: e.target.value } : x)))} />
                                                                <Input className="bg-white sm:col-span-2" placeholder="Address" value={entry.guarantorAddress} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, guarantorAddress: e.target.value } : x)))} />
                                                                <select value={entry.state} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, state: e.target.value } : x)))} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm">
                                                                    <option value="">Select state</option>
                                                                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                                                </select>
                                                                <Input className="bg-white" placeholder={entry.state ? "City" : "Select state first"} disabled={!entry.state} value={entry.city} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, city: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Zip Code" value={entry.zipCode} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, zipCode: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="SSN Number" value={entry.ssnNumber} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, ssnNumber: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Driver License Number" value={entry.driverLicenseNumber} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, driverLicenseNumber: e.target.value } : x)))} />
                                                                <Input className="bg-white" placeholder="Type of Entity" value={entry.typeOfEntity} onChange={(e) => setGuarantorEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, typeOfEntity: e.target.value } : x)))} />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div> */}


                                                <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                                                    {infoPanelMessage && (
                                                        <p className="mr-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--brand)]">
                                                            <Info className="h-3 w-3" />
                                                            {infoPanelMessage}
                                                        </p>
                                                    )}
                                                    <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-500 cursor-pointer" onClick={resetActivePanel}>
                                                        Cancel
                                                    </Button>
                                                    <Button type="button" className="h-8 cursor-pointer bg-[image:var(--brand-gradient)] px-6 text-xs text-white hover:opacity-90" onClick={saveActivePanel}>
                                                        Save Details
                                                    </Button>
                                                </div>

                                            </div>
                                        )}
                                        {/* <div className="space-y-3">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                    <Layers className="h-3.5 w-3.5" aria-hidden />
                                                </div>
                                                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                                                    Saved Records
                                                </h4>
                                                <span className="h-px flex-1 bg-gradient-to-r from-[var(--brand)]/25 to-slate-200 dark:to-slate-700" />
                                            </div>

                                        
                                            {([
                                                { key: "addendum", title: "Addendum", state: addendumListState, dot: "bg-indigo-500" },
                                                { key: "ach", title: "ACH Details", state: achListState, dot: "bg-emerald-500" },
                                                { key: "epo", title: "EPO Records", state: epoListState, dot: "bg-amber-500" },
                                                { key: "owner", title: "Owners", state: ownerListState, dot: "bg-sky-500" },
                                                { key: "guarantor", title: "Guarantors", state: guarantorListState, dot: "bg-rose-500" },
                                            ] as const).map((section) => {
                                                const count = Array.isArray(section.state.data) ? section.state.data.length : 0;
                                                return (
                                                    <div key={section.title} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                                                
                                                        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-transparent px-4 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <span className={cn("h-2 w-2 rounded-full", section.dot)} />
                                                                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                                                                    {section.title}
                                                                </h3>
                                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                                                    {count}
                                                                </span>
                                                            </div>
                                                        </div>

                                                      
                                                        <div className="divide-y divide-slate-100">
                                                            {Array.isArray(section.state.data) && section.state.data.length > 0 ? (
                                                                section.state.data.map((row: any, idx: number) => {
                                                                    const initial = (() => {
                                                                        if (section.key === "addendum") return (row.legalName1 || row.dba1 || "?").charAt(0);
                                                                        if (section.key === "ach") return (row.bankName || row.accountHolderName || "?").charAt(0);
                                                                        if (section.key === "epo") return (row.legalName || "E").charAt(0);
                                                                        return (row.firstName || row.lastName || "?").charAt(0);
                                                                    })().toUpperCase();
                                                                    return (
                                                                        <div key={idx} className="group flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50/70">
                                                                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                                                                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-semibold text-white", section.dot)}>
                                                                                    {initial || "?"}
                                                                                </div>
                                                                                <div className="min-w-0 flex-1">
                                                                                    <p className="truncate text-sm font-semibold text-slate-800">
                                                                                        {section.key === "addendum" && (row.legalName1 || row.dba1)}
                                                                                        {section.key === "ach" && (row.bankName || row.accountHolderName)}
                                                                                        {section.key === "epo" && (row.legalName || `Amount: ${row.amountReceived1}`)}
                                                                                        {(section.key === "owner" || section.key === "guarantor") &&
                                                                                            `${row.firstName || ""} ${row.lastName || ""}`.trim()}
                                                                                        {!row && "—"}
                                                                                    </p>
                                                                                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                                                                                        {section.key === "addendum" && (
                                                                                            <>
                                                                                                <span className="truncate">EIN: {row.ein1 || "—"}</span>
                                                                                                <span className="text-slate-300">•</span>
                                                                                                <span className="truncate">{row.typeOfEntity1 || "—"}</span>
                                                                                            </>
                                                                                        )}
                                                                                        {section.key === "ach" && (
                                                                                            <>
                                                                                                <span>Type: {row.accountType || "—"}</span>
                                                                                                <span className="text-slate-300">•</span>
                                                                                                <span>****{row.accountNumber?.slice(-4)}</span>
                                                                                            </>
                                                                                        )}
                                                                                        {section.key === "epo" && (
                                                                                            <span>Date: {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}</span>
                                                                                        )}
                                                                                        {(section.key === "owner" || section.key === "guarantor") && (
                                                                                            <>
                                                                                                <span>{row.ownershipPercentage || "0"}%</span>
                                                                                                <span className="text-slate-300">•</span>
                                                                                                <span className="truncate">{row.email || "No Email"}</span>
                                                                                            </>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>

                                                                            <div className="flex items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
                                                                                <Button
                                                                                    type="button"
                                                                                    size="icon"
                                                                                    variant="ghost"
                                                                                    title="View"
                                                                                    className="h-8 w-8 text-slate-600 hover:bg-slate-100"
                                                                                    onClick={() =>
                                                                                        setViewRecordModal({
                                                                                            section: section.key as "addendum" | "ach" | "epo" | "owner" | "guarantor",
                                                                                            title: section.title,
                                                                                            row,
                                                                                        })
                                                                                    }
                                                                                >
                                                                                    <Eye className="h-4 w-4" />
                                                                                </Button>
                                                                                <Button
                                                                                    type="button"
                                                                                    size="icon"
                                                                                    variant="ghost"
                                                                                    title="Edit"
                                                                                    className="h-8 w-8 text-slate-600 hover:bg-slate-100"
                                                                                    onClick={() =>
                                                                                        setEditRecordModal({
                                                                                            section: section.key as "addendum" | "ach" | "epo" | "owner" | "guarantor",
                                                                                            title: section.title,
                                                                                            row,
                                                                                        })
                                                                                    }
                                                                                >
                                                                                    <Pencil className="h-4 w-4" />
                                                                                </Button>
                                                                                <Button
                                                                                    type="button"
                                                                                    size="icon"
                                                                                    variant="ghost"
                                                                                    title="Delete"
                                                                                    className="h-8 w-8 text-red-500 hover:bg-red-50 hover:text-red-600"
                                                                                    onClick={() =>
                                                                                        void deleteFetchedRecord(
                                                                                            section.key as "addendum" | "ach" | "epo" | "owner" | "guarantor",
                                                                                            row,
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    <Trash2 className="h-4 w-4" />
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <div className="flex flex-col items-center justify-center gap-1 px-4 py-6 text-center">
                                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                                                        <Info className="h-4 w-4" />
                                                                    </div>
                                                                    <p className="text-[11px] text-slate-400">No records available</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div> */}
                                    </section>
                                )}
                                <Dialog
                                    open={!!viewRecordModal}
                                    onOpenChange={(open: boolean) => {
                                        if (!open) setViewRecordModal(null);
                                    }}
                                >
                                    <DialogContent className="sm:max-w-xl dark:bg-slate-900 dark:text-slate-100">
                                        <DialogTitle>
                                            View {viewRecordModal?.title || "Record"}
                                        </DialogTitle>
                                        <div className="max-h-[60vh] overflow-auto rounded border bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                                            {viewRecordModal ? (
                                                <div className="space-y-2 text-sm">
                                                    {Object.entries(viewRecordModal.row || {}).map(([k, v]) => (
                                                        <div key={k} className="grid grid-cols-[180px_1fr] gap-2">
                                                            <span className="font-medium text-slate-600">{k}</span>
                                                            <span className="break-all text-slate-800">
                                                                {v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    </DialogContent>
                                </Dialog>

                                <Dialog
                                    open={!!editRecordModal}
                                    onOpenChange={(open: boolean) => {
                                        if (!open) setEditRecordModal(null);
                                    }}
                                >
                                    <DialogContent className="sm:max-w-md dark:bg-slate-900 dark:text-slate-100">
                                        <DialogTitle>
                                            Edit {editRecordModal?.title || "Record"}
                                        </DialogTitle>
                                        <p className="text-sm text-slate-600">
                                            This will open the Info Required editor with this record prefilled.
                                        </p>
                                        <div className="flex justify-end gap-2 pt-2">
                                            <Button
                                                variant="ghost"
                                                onClick={() => setEditRecordModal(null)}
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={() => {
                                                    if (!editRecordModal) return;
                                                    openEditorForFetchedRecord(
                                                        editRecordModal.section,
                                                        editRecordModal.row,
                                                    );
                                                    setEditRecordModal(null);
                                                }}
                                            >
                                                Open Editor
                                            </Button>
                                        </div>
                                    </DialogContent>
                                </Dialog>

                                {/* Recipients Section - Only in Summary */}
                                {activeStep === "summary" && (
                                    <section className="space-y-4">
                                        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Contract Recipients</h3>

                                        <div className="space-y-4">
                                            {/* Section Header */}
                                            <div className="flex items-center justify-between px-1">
                                                <h3 className="text-sm font-bold text-slate-800 tracking-tight">Contract Signers</h3>
                                                <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                    {summaryTemplateRoles.length} Total Recipients
                                                </span>
                                            </div>

                                            <div className="grid gap-3">
                                                {summaryTemplateRoles.map((r, index) => {
                                                    const roleRow = r as Record<string, unknown>;
                                                    const roleLabel =
                                                        String(roleRow.roleName || "").trim() ||
                                                        getTemplateRoleLabel(roleRow) ||
                                                        `Role-${index + 1}`;
                                                    const signer = {
                                                        role: roleLabel,
                                                        name:
                                                            String(roleRow.signerName || "").trim() ||
                                                            getTemplateRoleNameFromRow(roleRow),
                                                        email:
                                                            String(roleRow.signerEmail || "").trim() ||
                                                            resolveSignerEmailForSummary(
                                                                roleLabel,
                                                                getTemplateRoleEmailFromRow(roleRow),
                                                                docuSignSignerEmail.email,
                                                                hasSavedSignerOverrides,
                                                            ),
                                                    };
                                                    const isOwner = signer.role.toLowerCase().includes("owner");
                                                    const isGuarantor = signer.role.toLowerCase().includes("guarantor");

                                                    return (
                                                        <div
                                                            key={`${signer.role}-${index}`}
                                                            className={`group relative flex items-center gap-4 rounded-xl border p-3 transition-all hover:shadow-sm cursor-pointer ${isOwner ? "border-[var(--brand)]/10 bg-[var(--brand)]/10/30" :
                                                                isGuarantor ? "border-[var(--brand)]/10 bg-[var(--brand)]/10/30" :
                                                                    "border-[var(--brand)]/10 bg-[var(--brand)]/10/30"
                                                                }`}
                                                        >
                                                            {/* Role Icon/Avatar */}
                                                            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border shadow-sm ${isOwner ? "bg-white text-blue-600 border-blue-200" :
                                                                isGuarantor ? "bg-white text-purple-600 border-purple-200" :
                                                                    "bg-white text-emerald-600 border-emerald-200"
                                                                }`}>
                                                                <User className="h-5 w-5" />
                                                            </div>

                                                            {/* Signer Details */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                                                        {signer.role}
                                                                    </p>
                                                                    {/* Counter for multiple owners/guarantors */}
                                                                    <span className="text-[10px] text-slate-400">#{index + 1}</span>
                                                                </div>

                                                                <div className="mt-0.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                                                                    <span className="text-sm font-semibold text-slate-900 truncate">
                                                                        {signer.name || "Awaiting Name..."}
                                                                    </span>
                                                                    <span className="hidden sm:block text-slate-300">•</span>
                                                                    <span className="text-xs text-slate-600 truncate break-all">
                                                                        {signer.email || "No email provided"}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Status Indicator */}
                                                            {/* <div className="flex flex-col items-end gap-1">
                                                                {!signer.email || !signer.name ? (
                                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-100/50 px-2 py-0.5 rounded-md">
                                                                        <AlertCircle className="h-3 w-3" /> Incomplete
                                                                    </span>
                                                                ) : (
                                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100/50 px-2 py-0.5 rounded-md">
                                                                        <CheckCircle2 className="h-3 w-3" /> Ready
                                                                    </span>
                                                                )}
                                                            </div> */}

                                                            {/* Quick Action (Edit recipient email) */}
                                                            <div className="ml-auto shrink-0">
                                                                <button
                                                                    type="button"
                                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/5 hover:text-[var(--brand)]"
                                                                    title="Edit recipient email"
                                                                    aria-label={`Edit recipient email for ${signer.role}`}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        openSignerEditor();
                                                                    }}
                                                                >
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* How many signers are allowed per role (informational) */}
                                            {/* <div
                                                className="rounded-lg border border-blue-100 bg-blue-50/90 p-3"
                                                role="note"
                                            >
                                                <div className="flex gap-2.5">
                                                    <Info
                                                        className="h-4 w-4 shrink-0 text-blue-600 mt-0.5"
                                                        aria-hidden
                                                    />
                                                    <div className="min-w-0 space-y-1.5 text-[11px] leading-snug text-slate-700">
                                                        <p className="font-semibold text-slate-800">
                                                            How many signers can you have?
                                                        </p>
                                                        <ul className="space-y-1 pl-0 list-none">
                                                            <li className="flex gap-2">
                                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                                                                <span>
                                                                    <span className="font-medium text-slate-800">Owner</span>
                                                                    {" — "}
                                                                    this workflow allows{" "}
                                                                    <strong>1 or 2</strong> owner signers (add a second owner
                                                                    in <span className="font-medium">Info Required → Owner</span>{" "}
                                                                    when needed).
                                                                </span>
                                                            </li>
                                                            <li className="flex gap-2">
                                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-purple-500" />
                                                                <span>
                                                                    <span className="font-medium text-slate-800">Guarantor</span>
                                                                    {" — "}
                                                                    you may have{" "}
                                                                    <strong>1 or 2</strong> guarantor signers (same place:{" "}
                                                                    <span className="font-medium">Info Required → Guarantor</span>
                                                                    ).
                                                                </span>
                                                            </li>
                                                            <li className="flex gap-2">
                                                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                                                <span>
                                                                    <span className="font-medium text-slate-800">Client</span>
                                                                    {" — "}
                                                                    there should be <strong>exactly one</strong> client / merchant
                                                                    signer on the contract.
                                                                </span>
                                                            </li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </div> */}
                                            <div className="flex items-center justify-end gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    className="h-8 text-xs cursor-pointer border-[var(--brand)]/30 text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                                    onClick={() => {
                                                        if (showRecipientEditor) {
                                                            setShowRecipientEditor(false);
                                                            return;
                                                        }
                                                        openSignerEditor();
                                                    }}
                                                >
                                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                                    {showRecipientEditor ? "Cancel" : "Manage Signers"}
                                                </Button>
                                            </div>

                                            {/* ── Recipient Editor Panel ────────────────────────── */}
                                            {showRecipientEditor && (
                                                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 shadow-sm">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                                                                Edit signers for this contract
                                                            </h4>
                                                            <p className="mt-1 text-[11px] leading-snug text-slate-500">
                                                                Add every owner or guarantor who must sign. The first slot uses
                                                                your template role (e.g. Client); additional signers default to
                                                                Signer. Saved signers are
                                                                sent to DocuSign when you Review &amp; send.
                                                            </p>
                                                        </div>
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-7 text-xs text-blue-600 gap-1"
                                                            disabled={recipientEditorRows.length >= 2}
                                                            onClick={() =>
                                                                setRecipientEditorRows((prev) => {
                                                                    if (prev.length >= 2) return prev;
                                                                    return [
                                                                        ...prev,
                                                                        {
                                                                            id: String(Date.now()),
                                                                            role: "Owner 2",
                                                                            name: "",
                                                                            email: "",
                                                                        },
                                                                    ];
                                                                })
                                                            }
                                                        >
                                                            <Plus className="h-3.5 w-3.5" /> Add Recipient
                                                        </Button>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {recipientEditorRows.map((entry, idx) => (
                                                            <div
                                                                key={entry.id}
                                                                className="flex items-start gap-2"
                                                            >
                                                                <span className="mt-2.5 text-[10px] font-bold text-slate-400 w-5 shrink-0 text-center">
                                                                    {idx + 1}
                                                                </span>
                                                                <div className="grid grid-cols-3 gap-2 flex-1">
                                                                    <Input
                                                                        placeholder="Role (e.g. Owner)"
                                                                        className="h-9 text-xs"
                                                                        value={entry.role}
                                                                        onChange={(e) =>
                                                                            setRecipientEditorRows((prev) =>
                                                                                prev.map((x) =>
                                                                                    x.id === entry.id
                                                                                        ? { ...x, role: e.target.value }
                                                                                        : x,
                                                                                ),
                                                                            )
                                                                        }
                                                                    />
                                                                    <Input
                                                                        placeholder="Signer Name"
                                                                        className="h-9 text-xs"
                                                                        value={entry.name}
                                                                        onChange={(e) =>
                                                                            setRecipientEditorRows((prev) =>
                                                                                prev.map((x) =>
                                                                                    x.id === entry.id
                                                                                        ? { ...x, name: e.target.value }
                                                                                        : x,
                                                                                ),
                                                                            )
                                                                        }
                                                                    />
                                                                    <Input
                                                                        placeholder="Signer Email"
                                                                        className="h-9 text-xs"
                                                                        value={entry.email}
                                                                        onChange={(e) =>
                                                                            setRecipientEditorRows((prev) =>
                                                                                prev.map((x) =>
                                                                                    x.id === entry.id
                                                                                        ? { ...x, email: e.target.value }
                                                                                        : x,
                                                                                ),
                                                                            )
                                                                        }
                                                                    />
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className="mt-2 text-slate-400 hover:text-red-500 transition-colors"
                                                                    disabled={recipientEditorRows.length <= 1}
                                                                    onClick={() =>
                                                                        setRecipientEditorRows((prev) =>
                                                                            prev.filter((x) => x.id !== entry.id),
                                                                        )
                                                                    }
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    {/* Save / Cancel footer */}
                                                    <div className="flex items-center justify-end gap-2 pt-3 border-t">
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 text-xs text-slate-500"
                                                            onClick={() => setShowRecipientEditor(false)}
                                                        >
                                                            Cancel
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            className="h-8 text-xs bg-[#3B8BD1] hover:bg-[#2d6fad] text-white px-6"
                                                            disabled={
                                                                savingContractRecipients ||
                                                                recipientEditorRows.every((r) => !r.role.trim())
                                                            }
                                                            onClick={async () => {
                                                                const rows = recipientEditorRows
                                                                    .filter((r) => r.role.trim())
                                                                    .map((r) => ({
                                                                        role: r.role.trim(),
                                                                        name: r.name.trim(),
                                                                        email: r.email.trim(),
                                                                    }));
                                                                const roles =
                                                                    buildDocuSignRolesFromEditorRows(rows);
                                                                if (!roles.length) {
                                                                    toast.error(
                                                                        "Enter a role name and email for at least one signer.",
                                                                    );
                                                                    return;
                                                                }
                                                                const missingEmail = rows.some(
                                                                    (r) => r.role && !r.email,
                                                                );
                                                                if (missingEmail) {
                                                                    toast.error(
                                                                        "Every signer role needs an email address.",
                                                                    );
                                                                    return;
                                                                }
                                                                setSavingContractRecipients(true);
                                                                try {
                                                                    const hadDraft = Boolean(
                                                                        String(
                                                                            sessionEnvelopeIdRef.current ||
                                                                                "",
                                                                        ).trim(),
                                                                    );
                                                                    setContractSignerOverrides(rows);
                                                                    /** Layout envelopes cannot add a 2nd signer slot via sync — always rebuild draft. */
                                                                    invalidateDocuSignDraftSession();
                                                                    const cid = effectiveContractId;
                                                                    if (cid != null) {
                                                                        const prefillBase =
                                                                        stripDocumentTemplateBlobFromPrefillOverrides(
                                                                            normalizeContractPrefillOverrides(
                                                                                contractPrefillFromDb ??
                                                                                    (resolvedContract as {
                                                                                        contractPrefillOverrides?: unknown;
                                                                                    } | null)
                                                                                        ?.contractPrefillOverrides,
                                                                            ) ?? null,
                                                                        ) ??
                                                                        contractPrefillFromDb ??
                                                                        (resolvedContract as {
                                                                            contractPrefillOverrides?: unknown;
                                                                        } | null)?.contractPrefillOverrides;
                                                                        const contractPrefillOverrides =
                                                                            mergeContractPrefillWithSignerOverrides(
                                                                                prefillBase,
                                                                                rows,
                                                                            );
                                                                        const primary = rows[0];
                                                                        const columnSync: UpdateContractData = {
                                                                            contractPrefillOverrides,
                                                                        };
                                                                        if (primary?.email) {
                                                                            columnSync.clientEmail = primary.email;
                                                                        }
                                                                        if (primary?.name) {
                                                                            columnSync.clientName = primary.name;
                                                                        }
                                                                        const updated = await dispatch(
                                                                            updateContract({
                                                                                id: cid,
                                                                                data: columnSync,
                                                                            }),
                                                                        ).unwrap();
                                                                        const payload =
                                                                            (updated as { data?: unknown })?.data ??
                                                                            updated;
                                                                        setResolvedContract((prev) =>
                                                                            prev && typeof prev === "object"
                                                                                ? {
                                                                                      ...prev,
                                                                                      ...(payload as Record<
                                                                                          string,
                                                                                          unknown
                                                                                      >),
                                                                                      contractPrefillOverrides,
                                                                                  }
                                                                                : (payload as Record<string, unknown>),
                                                                        );
                                                                        setContractPrefillFromDb(
                                                                            stripDocumentTemplateBlobFromPrefillOverrides(
                                                                                normalizeContractPrefillOverrides(
                                                                                    contractPrefillOverrides,
                                                                                ) ?? null,
                                                                            ),
                                                                        );
                                                                        const ownerCountSaved =
                                                                            resolveActiveOwnerCount({
                                                                                signerRoles:
                                                                                    buildDocuSignRolesFromEditorRows(
                                                                                        rows,
                                                                                    ),
                                                                            });
                                                                        const ownersRes =
                                                                            await dispatch(
                                                                                getAllContractOwners({
                                                                                    contractId: cid,
                                                                                }),
                                                                            ).unwrap();
                                                                        const dbOwners =
                                                                            Array.isArray(
                                                                                (
                                                                                    ownersRes as {
                                                                                        data?: unknown;
                                                                                    }
                                                                                )?.data,
                                                                            )
                                                                                ? ((
                                                                                      ownersRes as {
                                                                                          data: unknown[];
                                                                                      }
                                                                                  )
                                                                                      .data as Record<
                                                                                      string,
                                                                                      unknown
                                                                                  >[])
                                                                                : [];
                                                                        /** Signer 1 → Client Owner 1, Signer 2 → Client Owner 2. */
                                                                        await syncContractSignerRowsToCrm({
                                                                            dispatch,
                                                                            contractId: cid,
                                                                            applicationData:
                                                                                applicationDataRef.current,
                                                                            signerRows: rows.slice(
                                                                                0,
                                                                                Math.min(
                                                                                    2,
                                                                                    Math.max(
                                                                                        1,
                                                                                        ownerCountSaved,
                                                                                    ),
                                                                                ),
                                                                            ),
                                                                            existingContractOwners: dbOwners,
                                                                        });
                                                                    }
                                                                    toast.success(
                                                                        hadDraft
                                                                            ? "Signers saved. Click Review & send again to open DocuSign with the updated signers."
                                                                            : cid != null
                                                                              ? "Signers saved. They will be used when you Review & send."
                                                                              : "Signers updated for this session. They will be used when you Review & send.",
                                                                    );
                                                                    setShowRecipientEditor(false);
                                                                } catch (err: unknown) {
                                                                    const msg =
                                                                        await parseApiErrorMessageFromAxios(
                                                                            err,
                                                                        );
                                                                    toast.error(msg);
                                                                } finally {
                                                                    setSavingContractRecipients(false);
                                                                }
                                                            }}
                                                        >
                                                            {savingContractRecipients
                                                                ? "Saving..."
                                                                : "Save signers"}
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* <Button variant="ghost" size="sm" className="text-blue-600 text-xs">+ Add Secondary Signer (R3)</Button> */}

                                    </section>
                                )}

                                {activeStep === "summary" && (
                                    <div className="min-w-0 space-y-1 border-t border-slate-100 pt-4 dark:border-slate-700">
                                        <label
                                            htmlFor="pdf-viewer-docusign-subject-name"
                                            className="text-[11px] font-semibold text-[var(--brand)] dark:text-[var(--brand-accent)]"
                                        >
                                            Subject name
                                        </label>
                                        <Input
                                            id="pdf-viewer-docusign-subject-name"
                                            value={envelopeEmailSubject}
                                            maxLength={DOCUSIGN_EMAIL_SUBJECT_MAX_LEN}
                                            disabled={isSending || isCancellingContract}
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
                                )}

                                {/* Exhibit A companies + Deal Review — Summary */}
                                {activeStep === "summary" && (
                                    <section className="mt-4 space-y-4 border-t pt-4">
                                        <div className="border p-4 rounded-lg">
                                            <ExhibitACompaniesSummarySection
                                                contractId={effectiveContractId}
                                                applicationUuid={applicationIdForLookup}
                                                canEdit={canEditContractPrefill}
                                                prefillOverridesReady={contractPrefillLoaded}
                                                persistedPrefillOverrides={
                                                    contractPrefillLoaded ? contractPrefillFromDb : undefined
                                                }
                                                documentTemplatePrefillByMappingId={
                                                    documentTemplatePrefillByMappingId
                                                }
                                                onPersistedPrefillChange={(next) => {
                                                    setContractPrefillFromDb(next ?? null);
                                                }}
                                                onPersistedPrefillFullChange={(full) => {
                                                    setDocumentTemplatePrefillByMappingId(
                                                        parseDocumentTemplatePrefillByMappingId(full),
                                                    );
                                                    setResolvedContract((prev) =>
                                                        prev
                                                            ? { ...prev, contractPrefillOverrides: full ?? null }
                                                            : prev,
                                                    );
                                                }}
                                                onDraftInvalidate={invalidateDocuSignDraftSession}
                                            />
                                        </div>

                                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                                    Deal Review
                                                </h3>
                                                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                                                    CRM values for your DocuSign field labels. Review here, then use
                                                    Review & send in DocuSign — signing is completed in DocuSign only.
                                                </p>
                                            </div>
                                            {canEditContractPrefill ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 shrink-0 gap-1.5 border-[var(--brand)]/30 text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                                        onClick={() => setSpaCalcModalOpen(true)}
                                                    >
                                                        <Calculator className="h-3.5 w-3.5" aria-hidden />
                                                        Calculate SPA
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 shrink-0"
                                                        onClick={() => setContractPrefillEditOpen(true)}
                                                    >
                                                        Edit prefill fields
                                                    </Button>
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="space-y-4 border p-4 rounded-lg">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-blue-600 font-bold text-[11px] uppercase">Contract Details</span>
                                                {/* <span className="text-[11px] text-slate-400">Auto-filled from contract</span> */}
                                            </div>
                                            {(() => {
                                                const effectiveFields = dealReviewFields;
                                                if (!effectiveFields.length) {
                                                    return (
                                                        <p className="text-xs text-slate-500 dark:text-slate-400 italic py-2">
                                                            No contract details to show. Ensure this application has a linked
                                                            client (business name, address, EIN, etc.) or pass prefill fields from
                                                            the contract flow.
                                                        </p>
                                                    );
                                                }
                                                const grouped: Record<string, typeof effectiveFields> = {};
                                                for (const f of effectiveFields) {
                                                    const cat = categorizeDealReviewPrefillFieldId(f.id);
                                                    if (!grouped[cat]) grouped[cat] = [];
                                                    grouped[cat].push(f);
                                                }
                                                const order = [
                                                    "General",
                                                    "Parties",
                                                    "Business Address",
                                                    "Contract Address",
                                                    "Deal Terms",
                                                    "ACH",
                                                    "Authorization",
                                                    "Addendum",
                                                    "EPOs",
                                                    "Security",
                                                    "Guarantor",
                                                    "Guaranty",
                                                    "Appendix",
                                                    "Other",
                                                ];
                                                const renderFieldRow = (field: (typeof effectiveFields)[number]) => (
                                                    <Fragment key={field.id}>
                                                        <div className="text-slate-500 dark:text-slate-400">
                                                            {field.label}
                                                        </div>
                                                        <div className="font-medium break-all text-slate-900 dark:text-slate-100">
                                                            {formatDisplayValueForUs(
                                                                field.id || field.label || "",
                                                                field.value,
                                                            )}
                                                        </div>
                                                    </Fragment>
                                                );
                                                const renderCategoryBlock = (cat: string, fields: typeof effectiveFields) => {
                                                    const subGrouped: Record<string, typeof effectiveFields> = {
                                                        "": [],
                                                    };
                                                    for (const f of fields) {
                                                        const sub =
                                                            dealReviewPrefillSubsection(f.id, cat) ?? "";
                                                        if (!subGrouped[sub]) subGrouped[sub] = [];
                                                        subGrouped[sub].push(f);
                                                    }
                                                    const subOrder = [
                                                        "",
                                                        "Principal",
                                                        "Entity slots",
                                                        "Account holder",
                                                        "Bank",
                                                        "Consent",
                                                        "References",
                                                        "Online banking",
                                                        "Address",
                                                        "Contact",
                                                        "Client",
                                                        "Owner 1",
                                                        "Owner 2",
                                                        "Exhibit A companies",
                                                        "General",
                                                    ];
                                                    return (
                                                        <div key={cat}>
                                                            <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase mb-2">
                                                                {cat}
                                                            </div>
                                                            {subOrder
                                                                .filter((sub) => subGrouped[sub]?.length)
                                                                .map((sub) => (
                                                                    <div
                                                                        key={`${cat}-${sub || "main"}`}
                                                                        className={
                                                                            sub
                                                                                ? "mt-5 pt-3 border-t border-slate-200/90 dark:border-slate-600 mb-2"
                                                                                : "mb-2"
                                                                        }
                                                                    >
                                                                        {sub ? (
                                                                            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                                                                                {sub}
                                                                            </div>
                                                                        ) : null}
                                                                        <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                                                                            {subGrouped[sub].map((field) =>
                                                                                renderFieldRow(field),
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                    );
                                                };
                                                return order
                                                    .filter((k) => grouped[k]?.length)
                                                    .map((cat) => renderCategoryBlock(cat, grouped[cat]!));
                                            })()}
                                        </div>

                                        <div className="mt-4 space-y-3 border p-4 rounded-lg">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="text-blue-600 font-bold text-[11px] uppercase">
                                                    Offer decision
                                                </span>
                                                {offerDecisionLoading ? (
                                                    <span className="text-[11px] text-slate-400">Loading…</span>
                                                ) : null}
                                            </div>
                                            {!applicationIdForLookup ? (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 italic py-1">
                                                    Open this viewer from an application with an application ID to load offer
                                                    decision.
                                                </p>
                                            ) : offerDecisionLoading && !offerDecisionData ? (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 italic py-1">
                                                    Loading offer decision…
                                                </p>
                                            ) : !offerDecisionData ? (
                                                <p className="text-xs text-slate-500 dark:text-slate-400 italic py-1">
                                                    No offer decision found for this application.
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-2 gap-y-3 text-sm">
                                                    {offerDecisionSummaryRows.map((field) => (
                                                        <Fragment key={field.label}>
                                                            <div className="text-slate-500 dark:text-slate-400">
                                                                {field.label}
                                                            </div>
                                                            <div className="font-medium break-all text-slate-900 dark:text-slate-100">
                                                                {field.value}
                                                            </div>
                                                        </Fragment>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                )}

                                {activeStep === "sent" && (
                                    <section className="space-y-4">
                                        {sentEnvelopeRows.length > 0 ? (
                                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                                <label
                                                    htmlFor="sent-envelope-select"
                                                    className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                                >
                                                    Sent document
                                                </label>
                                                <Select
                                                    value={selectedSentRow?.key ?? ""}
                                                    onValueChange={(value: string) => {
                                                        setSelectedSentEnvelopeKey(value);
                                                        const row = sentEnvelopeRows.find(
                                                            (item) => item.key === value,
                                                        );
                                                        if (row?.envelopeId) {
                                                            invalidateDocuSignPdfCache();
                                                            setPdfRightPaneTab("docusign");
                                                            void loadPrefilledPdfFromDocuSign(
                                                                row.envelopeId,
                                                                { maxAttempts: 1 },
                                                            );
                                                        }
                                                    }}
                                                >
                                                    <SelectTrigger
                                                        id="sent-envelope-select"
                                                        className="h-10 w-full bg-white dark:bg-slate-900"
                                                    >
                                                        <SelectValue placeholder="Select a sent document" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {sentEnvelopeRows.map((row) => (
                                                            <SelectItem key={row.key} value={row.key}>
                                                                {row.label} —{" "}
                                                                {getContractSendTableRowStatusLabel(row)}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        ) : null}

                                        <div className="overflow-hidden rounded-2xl border border-[var(--brand)]/20 bg-white shadow-sm dark:border-[var(--brand)]/25 dark:bg-slate-950">
                                            <div className="bg-[image:var(--brand-gradient)] px-5 py-5 text-white">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                                                        <CheckCircle2 className="h-7 w-7" aria-hidden />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
                                                            Sent successfully
                                                        </p>
                                                        <h3 className="mt-1 text-lg font-semibold tracking-tight">
                                                            {selectedSentRow &&
                                                            isContractSendTableRowFullySigned(selectedSentRow)
                                                                ? `${selectedSentRow.label} fully signed`
                                                                : `${selectedSentRow?.label ?? "Document"} is on its way for signature`}
                                                        </h3>
                                                        <p className="mt-1 text-sm leading-relaxed text-white/85">
                                                            {selectedSentRow &&
                                                            isContractSendTableRowFullySigned(selectedSentRow)
                                                                ? "All signers completed. The PDF on the right includes signatures."
                                                                : canResendContract && isContractOutForSignature
                                                                  ? "Signers have an open envelope. You can void it, or send a new contract without voiding the previous one."
                                                                  : canResendContract
                                                                    ? "All signers completed. Use Send new contract below to start a new envelope, or view the signed PDF on the right."
                                                                    : "The DocuSign envelope was sent. Status and contract details refresh automatically."}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid gap-3 p-4 sm:grid-cols-2">
                                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        <FileSignature className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
                                                        Document
                                                    </div>
                                                    <p className="break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {fileName || "Contract PDF"}
                                                    </p>
                                                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                                        Status: {latestEnvelopeStatusLabel}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        <Clock className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden />
                                                        Sent time
                                                    </div>
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {(() => {
                                                            if (sentAt) return sentAt.toLocaleString();
                                                            const doc = pickContractEnvelopeDocument(resolvedContract);
                                                            const docSentAt = doc?.sentAt as string | undefined;
                                                            if (docSentAt) return formatDateTimeUS(String(docSentAt), "—");
                                                            const docUpdatedAt = doc?.updatedAt as string | undefined;
                                                            if (docUpdatedAt) return formatDateTimeUS(String(docUpdatedAt), "—");
                                                            if (resolvedContract?.updatedAt) {
                                                                return formatDateTimeUS(String(resolvedContract.updatedAt), "—");
                                                            }
                                                            return "—";
                                                        })()}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        Envelope ID
                                                    </div>
                                                    <p className="break-all text-xs font-medium text-slate-900 dark:text-slate-100">
                                                        {String(
                                                            selectedSentRow?.envelopeId ??
                                                                pickContractEnvelopeDocument(resolvedContract)
                                                                    ?.envelopeId ??
                                                                linkedEnvelopeId ??
                                                                sessionEnvelopeId ??
                                                                "—",
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                                        Funder / State
                                                    </div>
                                                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {[
                                                            resolvedContract?.funderName,
                                                            selectedFunder,
                                                        ]
                                                            .map((v) => String(v ?? "").trim())
                                                            .find(Boolean) || "—"}
                                                        {" · "}
                                                        {[
                                                            resolvedContract?.state,
                                                            selectedState,
                                                        ]
                                                            .map((v) => String(v ?? "").trim())
                                                            .find(Boolean) || "—"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="rounded-2xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                                                        <Mail className="h-4 w-4" aria-hidden />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                            Notification Summary
                                                        </h3>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                            Copies included with this send.
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                    {sentCcEmails.length} CC
                                                </span>
                                            </div>

                                            {sentCcEmails.length ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {sentCcEmails.map((email) => (
                                                        <span
                                                            key={email}
                                                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--brand)]/20 bg-[var(--brand)]/8 px-2.5 py-1 text-xs font-medium text-[var(--brand)]"
                                                        >
                                                            <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                                            <span className="truncate">{email}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
                                                    No CC recipients were added for this send.
                                                </p>
                                            )}
                                        </div>

                                        <div className="rounded-2xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                                <div className="flex items-start gap-2">
                                                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)]/10 text-[var(--brand)]">
                                                        <Info className="h-4 w-4" aria-hidden />
                                                    </div>
                                                    <div>
                                                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                            Contract signing status
                                                        </h3>
                                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                                            CRM status is updated when DocuSign webhooks are received (viewed, signed,
                                                            completed, etc.).
                                                        </p>
                                                    </div>
                                                </div>

                                            </div>
                                            {(() => {
                                                const status = String(
                                                    resolveLatestEnvelopeStatus(resolvedContract) || "",
                                                )
                                                    .trim()
                                                    .toUpperCase();
                                                const chain = [
                                                    { key: "SENT", label: "Sent", hint: "Envelope sent" },
                                                    { key: "VIEWED", label: "Viewed", hint: "Signer opened" },
                                                    { key: "SIGNED", label: "Signed", hint: "Signature captured" },
                                                    { key: "COMPLETED", label: "Completed", hint: "All done" },
                                                ];
                                                const rank: Record<string, number> = {
                                                    DRAFT: -1,
                                                    SENT: 0,
                                                    VIEWED: 1,
                                                    SIGNED: 2,
                                                    COMPLETED: 3,
                                                };
                                                const terminalStatuses = ["DECLINED", "REVOKED", "EXPIRED"];
                                                const isTerminal = terminalStatuses.includes(status);
                                                const activeIndex = isTerminal ? -1 : rank[status] ?? -1;

                                                return (
                                                    <div className="space-y-3">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="inline-flex items-center rounded-full bg-[var(--brand)]/12 px-3 py-1 text-xs font-semibold text-[var(--brand)]">
                                                                {latestEnvelopeStatusLabel}
                                                            </span>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900/60">
                                                            <div className="flex items-start">
                                                                {chain.map((step, index) => {
                                                                    const isDone = activeIndex >= index;
                                                                    const isCurrent = activeIndex === index;
                                                                    return (
                                                                        <Fragment key={step.key}>
                                                                            <div className="flex min-w-[70px] flex-1 flex-col items-center text-center">
                                                                                <div
                                                                                    className={cn(
                                                                                        "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                                                                                        isDone
                                                                                            ? "border-[var(--brand)] bg-[image:var(--brand-gradient)] text-white shadow-sm shadow-[var(--brand)]/25"
                                                                                            : "border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-950",
                                                                                    )}
                                                                                >
                                                                                    {isDone ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : index + 1}
                                                                                </div>
                                                                                <div className="mt-1.5 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                                                                                    {step.label}
                                                                                </div>
                                                                                <div
                                                                                    className={cn(
                                                                                        "mt-0.5 text-[10px] leading-snug",
                                                                                        isCurrent ? "text-[var(--brand)]" : "text-slate-400",
                                                                                    )}
                                                                                >
                                                                                    {step.hint}
                                                                                </div>
                                                                            </div>
                                                                            {index < chain.length - 1 ? (
                                                                                <div
                                                                                    className={cn(
                                                                                        "mt-4 h-0.5 w-8 shrink-0 rounded-full",
                                                                                        activeIndex > index ? "bg-[image:var(--brand-gradient)]" : "bg-slate-200 dark:bg-slate-700",
                                                                                    )}
                                                                                />
                                                                            ) : null}
                                                                        </Fragment>
                                                                    );
                                                                })}
                                                            </div>
                                                            {isTerminal ? (
                                                                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                                                                    Signing flow ended with status: {formatContractSigningStatusLabel(status)}.
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                                                <button
                                                    type="button"
                                                    aria-label={signingStatusRefreshing ? "Refreshing status" : "Refresh status"}
                                                    title={signingStatusRefreshing ? "Refreshing…" : "Refresh status"}
                                                    disabled={
                                                        signingStatusRefreshing ||
                                                        (!applicationIdForLookup && !Number.isFinite(Number(contractId)))
                                                    }
                                                    onClick={() => {
                                                        void (async () => {
                                                            await refreshContractSigningState(false, {
                                                                syncDocuSign: true,
                                                                forceDocuSignSync: true,
                                                            });
                                                            forceReloadDocuSignPdfPreview();
                                                        })();
                                                    }}
                                                    className="inline-flex cursor-pointer h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--brand)] transition-colors hover:bg-[var(--brand)]/10 disabled:cursor-not-allowed disabled:opacity-60"
                                                >
                                                    <RefreshCw
                                                        className={cn(
                                                            "h-3.5 w-3.5",
                                                            signingStatusRefreshing && "animate-spin",
                                                        )}
                                                        aria-hidden
                                                    />
                                                </button>
                                                <span>
                                                    Last checked:{" "}
                                                    <span className="font-medium text-slate-700 dark:text-slate-300">
                                                        {lastSigningStatusSyncAt
                                                            ? formatDateTimeUS(
                                                                  lastSigningStatusSyncAt.toISOString(),
                                                                  "Not yet",
                                                              )
                                                            : "Not yet"}
                                                    </span>
                                                    {resolvedContract?.updatedAt != null &&
                                                    String(resolvedContract.updatedAt).trim() !== "" ? (
                                                        <>
                                                            {" "}
                                                            · CRM record updated{" "}
                                                            {formatDateTimeUS(
                                                                String(resolvedContract.updatedAt),
                                                                "",
                                                            )}
                                                        </>
                                                    ) : null}
                                                </span>
                                            </p>
                                        </div>

                                        <div className="rounded-2xl border border-[var(--brand)]/15 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-950">
                                            <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                Latest contract details
                                            </h3>
                                            {dealReviewFields.length > 0 ? (
                                                <div className="mb-4 grid max-h-64 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto text-sm">
                                                    {dealReviewFields.map((field) => (
                                                        <Fragment key={field.id}>
                                                            <div className="text-slate-500 dark:text-slate-400">
                                                                {field.label}
                                                            </div>
                                                            <div className="font-medium break-all text-slate-900 dark:text-slate-100">
                                                                {formatDisplayValueForUs(
                                                                    field.id || field.label || "",
                                                                    field.value,
                                                                )}
                                                            </div>
                                                        </Fragment>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                                                    No prefill details loaded yet. Click refresh on signing status
                                                    above.
                                                </p>
                                            )}
                                            {offerDecisionSummaryRows.length > 0 ? (
                                                <>
                                                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--brand)]">
                                                        Offer decision
                                                    </h4>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                                        {offerDecisionSummaryRows.map((field) => (
                                                            <Fragment key={field.label}>
                                                                <div className="text-slate-500 dark:text-slate-400">
                                                                    {field.label}
                                                                </div>
                                                                <div className="font-medium break-all text-slate-900 dark:text-slate-100">
                                                                    {field.value}
                                                                </div>
                                                            </Fragment>
                                                        ))}
                                                    </div>
                                                </>
                                            ) : null}
                                        </div>

                                    </section>
                                )}
                                <div
                                    className="mt-2 flex items-center"
                                    role="toolbar"
                                    aria-label="Contract wizard steps"
                                >
                                    {canGoPreviousStep && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="mr-auto h-9 rounded-sm border-slate-300 px-4 text-sm dark:border-slate-600"
                                            onClick={goToPreviousStep}
                                        >
                                            Previous
                                        </Button>
                                    )}
                                    {canGoNextStep && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            className="ml-auto h-9 rounded-sm bg-[image:var(--brand-gradient)] px-4 text-sm text-white hover:opacity-90"
                                            onClick={goToNextStep}
                                        >
                                            Next
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right column: full-height PDF viewer; switch template vs BoldSign prefilled */}
                        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col gap-2 bg-slate-700 p-3">
                            <div className="flex shrink-0 items-center gap-2">
                            <div
                                className="flex min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-800/80 p-0.5"
                                role="tablist"
                                aria-label="PDF preview source"
                            >
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={pdfRightPaneTab === "template"}
                                    className={`flex-1 rounded-md px-3 py-1.5 text-center text-[11px] font-semibold transition-colors ${pdfRightPaneTab === "template"
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-300 hover:text-white"
                                        }`}
                                    onClick={() => setPdfRightPaneTab("template")}
                                >
                                    Contract template
                                </button>
                                {showDocuSignContractTab ? (
                                    <button
                                        type="button"
                                        role="tab"
                                        aria-selected={pdfRightPaneTab === "docusign"}
                                        className={`flex-1 rounded-md px-3 py-1.5 text-center text-[11px] font-semibold transition-colors ${pdfRightPaneTab === "docusign"
                                            ? "bg-white text-slate-900 shadow-sm"
                                            : "text-slate-300 hover:text-white"
                                            }`}
                                        onClick={() => setPdfRightPaneTab("docusign")}
                                    >
                                        {String(resolvedContract?.status ?? "").toUpperCase() ===
                                        "COMPLETED"
                                            ? "Signed contract"
                                            : "DocuSign envelope"}
                                    </button>
                                ) : null}
                            </div>
                            {canDownloadFilledContract ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 border-slate-500 bg-slate-800/90 text-[11px] text-white hover:bg-slate-700 hover:text-white"
                                    disabled={downloadingFilledContract}
                                    onClick={() => void downloadFilledContractPdf()}
                                >
                                    {downloadingFilledContract ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    ) : (
                                        <Download className="h-3.5 w-3.5" aria-hidden />
                                    )}
                                </Button>
                            ) : null}
                            </div>
                            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded bg-white shadow-2xl">
                                {pdfRightPaneTab === "template" ? (
                                    currentPreviewUrl ? (
                                    <DirectPdfViewer
                                        key={`${selectedFunderProfileId || selectedFunder}:${currentPreviewUrl}`}
                                        fileUrl={currentPreviewUrl}
                                        errorMessage="Could not render this PDF. Please check that the PDF URL is reachable and allows browser access."
                                    />
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white px-4 text-center text-xs text-slate-500">
                                            {previewingMainContract ? (
                                                <>
                                                    <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" aria-hidden />
                                                    <span>Loading funder contract template…</span>
                                                </>
                                            ) : (
                                                <span>
                                                    {documentUploadMessage ||
                                                        (selectedFunder
                                                            ? `No contract PDF configured for ${selectedFunder}.`
                                                            : "Select a funder to preview the contract template.")}
                                                </span>
                                            )}
                                        </div>
                                    )
                                ) : prefilledBoldSignPdfLoading ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white px-4 text-center text-xs text-slate-500">
                                        <Loader2 className="h-6 w-6 animate-spin text-[var(--brand)]" aria-hidden />
                                        <span>Loading contract from DocuSign…</span>
                                    </div>
                                ) : prefilledBoldSignPdfUrl ? (
                                    <DirectPdfViewer fileUrl={prefilledBoldSignPdfUrl} />
                                ) : (
                                    <div className="absolute inset-0 flex min-h-[200px] items-center justify-center bg-white px-4 text-center text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                                        {prefilledBoldSignPdfHint
                                            ? prefilledBoldSignPdfHint
                                            : "DocuSign PDF appears on step 4 (Sent) after the contract envelope is sent."}
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>

                    {/* 3. Global Footer — CC + send (shrink-0 + compact so PDF pane keeps maximum height) */}
                    <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--brand)]/10 bg-gradient-to-r from-slate-50/90 via-white to-[var(--brand)]/5 px-6 py-3 dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-[var(--brand)]/10 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
                        <div className="min-w-0 flex-1 space-y-2">
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-semibold text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                        DocuSign signers ({docuSignSignerRolesForSend.length}):
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-7 border-[var(--brand)]/30 px-2 text-[10px] text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                        disabled={canCancelSentContract || isCancellingContract}
                                        onClick={() => {
                                            setActiveStep("summary");
                                            openSignerEditor();
                                        }}
                                    >
                                        <Plus className="mr-1 h-3 w-3" />
                                        Manage Signers
                                    </Button>
                                </div>
                                {docuSignSignerRolesForSend.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {docuSignSignerRolesForSend.map((signer, idx) => (
                                            <span
                                                key={`${signer.signerRole}-${idx}`}
                                                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-slate-800 shadow-sm dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-slate-100"
                                                title={signer.signerEmail || "Missing email"}
                                            >
                                                <User className="h-3 w-3 shrink-0 text-emerald-700 opacity-80" aria-hidden />
                                                <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                                                    {signer.signerRole}
                                                </span>
                                                <span className="text-slate-500">•</span>
                                                <span className="max-w-[180px] truncate">
                                                    {signer.signerEmail || "No email"}
                                                </span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                                        No signers configured — add owners in Info Required, then use Manage
                                        Signers on the Summary step. CC list below is copy-only, not a signer.
                                    </p>
                                )}
                            </div>
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--brand)] dark:text-[var(--brand-accent)]">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand)]/12">
                                        <Mail className="h-3.5 w-3.5" aria-hidden />
                                    </span>
                                    CC (copy by email on send — not a signer)
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                <LockedCcChips />
                                {contractDefaultCcEmails.map((email) => (
                                    <span
                                        key={email}
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
                                            {contractDefaultCcUsesFunderOverride ? "Funder" : "Default"}
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
                                        <button
                                            type="button"
                                            className="shrink-0 rounded p-0.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
                                            aria-label={`Remove ${email}`}
                                            disabled={canCancelSentContract || isCancellingContract}
                                            onClick={() => {
                                                const next = ccEmails.filter((e) => e !== email);
                                                setCcEmails(next);
                                                saveBoldSignCcEmailList(next, contractCcMergeOptions);
                                            }}
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Input
                                    id="pdf-viewer-docusign-cc-draft"
                                    type="email"
                                    autoComplete="email"
                                    placeholder="name@company.com"
                                    value={ccEmailDraft}
                                    onChange={(e) => setCcEmailDraft(e.target.value)}
                                    className="h-9 max-w-xs bg-white dark:bg-slate-950"
                                    disabled={canCancelSentContract || isCancellingContract}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addPdfCcFromDraft();
                                        }
                                    }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 border-[var(--brand)]/30 text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                    disabled={canCancelSentContract || isCancellingContract}
                                    onClick={addPdfCcFromDraft}
                                >
                                    Add CC
                                </Button>
                            </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2 border-t border-slate-100 pt-2 dark:border-slate-700 lg:border-t-0 lg:pt-0">
                            {docuSignOpenUrl && activeStep !== "sent" ? (
                                <p className="max-w-md text-right text-xs text-amber-800 dark:text-amber-200">
                                    Pop-up blocked. Click Open DocuSign to continue in a new tab.
                                </p>
                            ) : null}
                            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
                            <Button variant="ghost" className="h-9 shrink-0" onClick={onClose}>
                                Close
                            </Button>
                            {canCancelSentContract ? (
                                <Button
                                    type="button"
                                    variant="default"
                                    className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                    onClick={() => void handleCancelContract()}
                                    disabled={isCancellingContract || isSending}
                                >
                                    {isCancellingContract ? "Voiding contract…" : "Void Contract"}
                                </Button>
                            ) : null}
                            {(canSendNewContract && activeStep === "sent") || showResendContractOnSentStep ? (
                                <Button
                                    type="button"
                                    variant="default"
                                    className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                    onClick={() => void handleSend()}
                                    disabled={isSending || isCancellingContract}
                                >
                                    {isSending ? "Preparing DocuSign…" : docuSignPrimaryActionLabel}
                                </Button>
                            ) : activeStep === "sent" && !canCancelSentContract ? (
                                    <Button
                                        type="button"
                                        variant="default"
                                        className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                        onClick={onClose}
                                        disabled={isCancellingContract}
                                    >
                                        Done
                                    </Button>
                            ) : activeStep === "sent" && canCancelSentContract ? null : canReviewAndSendCurrentPackage && docuSignOpenUrl ? (
                                <Button
                                    type="button"
                                    variant="default"
                                    className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                    onClick={() => {
                                        const url = docuSignOpenUrl;
                                        if (!url) return;
                                        if (tryOpenDocuSignSenderUrl(url)) {
                                            setDocuSignOpenUrl(null);
                                            toast.success(
                                                "DocuSign opened in a new tab. Click Send there when you are ready.",
                                                { autoClose: 10000 },
                                            );
                                        } else {
                                            void navigator.clipboard.writeText(url);
                                            toast.error(
                                                "Still blocked. Allow pop-ups or paste the copied link into your browser.",
                                                { autoClose: 12000 },
                                            );
                                        }
                                    }}
                                    disabled={isCancellingContract}
                                >
                                    Open DocuSign
                                </Button>
                            ) : canReviewAndSendCurrentPackage ? (
                                <Button
                                    type="button"
                                    variant="default"
                                    className={DOCUSIGN_PRIMARY_BTN_CLASS}
                                    onClick={() => void handleSend()}
                                    disabled={isSending || isCancellingContract}
                                >
                                    {isSending ? "Preparing DocuSign…" : docuSignPrimaryActionLabel}
                                </Button>
                            ) : null}
                            {showCreateInNewEnvelopeButton ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 shrink-0 border-[var(--brand)]/30 text-[var(--brand)] hover:bg-[var(--brand)]/10"
                                    onClick={handleSendInNewEnvelope}
                                    disabled={isSending || isCancellingContract}
                                >
                                    Create in new envelope
                                </Button>
                            ) : null}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
            <ContractPrefillEditForm
                open={contractPrefillEditOpen}
                onOpenChange={setContractPrefillEditOpen}
                applicationData={applicationData}
                contractId={effectiveContractId}
                applicationUuid={applicationIdForLookup}
                prefillOverridesReady={contractPrefillLoaded}
                persistedPrefillOverrides={contractPrefillLoaded ? contractPrefillFromDb : undefined}
                onPersistedPrefillChange={(next) => {
                    const main = next ?? null;
                    setContractPrefillFromDb(main);
                    setResolvedContract((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  ...(main ? contractPrefillToContractColumnUpdate(main) : {}),
                                  contractPrefillOverrides:
                                      main != null
                                          ? {
                                                ...(typeof prev.contractPrefillOverrides ===
                                                    "object" &&
                                                prev.contractPrefillOverrides != null &&
                                                !Array.isArray(prev.contractPrefillOverrides)
                                                    ? (prev.contractPrefillOverrides as Record<
                                                          string,
                                                          unknown
                                                      >)
                                                    : {}),
                                                ...main,
                                            }
                                          : prev.contractPrefillOverrides,
                              }
                            : prev,
                    );
                }}
                onPersistedPrefillFullChange={(main, mappingMap) => {
                    setDocumentTemplatePrefillByMappingId(mappingMap);
                    setContractPrefillFromDb(main ?? null);
                    const fullOverrides =
                        main != null || Object.keys(mappingMap).length > 0
                            ? {
                                  ...(main ?? {}),
                                  ...(Object.keys(mappingMap).length > 0
                                      ? {
                                            [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]:
                                                mappingMap,
                                        }
                                      : {}),
                              }
                            : null;
                    setResolvedContract((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  ...(main ? contractPrefillToContractColumnUpdate(main) : {}),
                                  contractPrefillOverrides: fullOverrides ?? prev.contractPrefillOverrides,
                              }
                            : prev,
                    );
                }}
                onAfterPrefillSaved={() => {
                    if (crmPrefillFrozenForOpenDraftRef.current) {
                        toast.info(
                            "CRM prefill saved. The open DocuSign draft will not be overwritten — click Review & send again to open a new draft with these values.",
                            { autoClose: 10000 },
                        );
                        return;
                    }
                    void syncPrefillToDraftEnvelopeRef.current();
                }}
                contractRecords={contractPrefillRecords}
                resolvedContract={resolvedContract}
                linkedAddendumMapping={linkedAddendumMapping}
                linkedAddendumMappings={addendumTemplateMappings}
                linkedDisclosureMapping={linkedDisclosureMapping}
                contractDisclosureState={selectedState}
                contractDisclosureFrequency={contractDisclosureFrequency}
                agreementDatePlaceholder={formatDate(new Date())}
                offerDecision={(offerDecisionData as Record<string, unknown> | null) ?? null}
                readOnly={!canEditContractPrefill}
                additionalContractPrefillJson={{
                    [DOCUMENT_TEMPLATE_PREFILL_BY_MAPPING_ID_KEY]: documentTemplatePrefillByMappingId,
                }}
                liveContractSignerOverrides={contractSignerOverrides}
            />
            <TemplateMappingPrefillEditDialog
                open={templateMappingPrefillEditRow != null}
                onOpenChange={(nextOpen) => {
                    if (!nextOpen) setTemplateMappingPrefillEditRow(null);
                }}
                row={templateMappingPrefillEditRow}
                contractId={effectiveContractId}
                applicationUuid={applicationIdForLookup}
                applicationData={applicationData}
                resolvedContract={resolvedContract}
                contractRecords={contractPrefillRecords}
                agreementDate={formatDate(new Date())}
                documentTemplatePrefillByMappingId={documentTemplatePrefillByMappingId}
                mainPrefillOverrides={mainPrefillOverridesForTemplateDialog}
                offerDecision={(offerDecisionData as Record<string, unknown> | null) ?? null}
                allowAchAliasFallback={achTemplateMappings.length <= 1}
                onSaved={() => {
                    void fetchTemplateMappings();
                    void reloadContractPrefillSnapshots();
                }}
            />
            {showRequestDocuments ? (
                <RequestMissingDocumentsModal
                    open={isRequestModalOpen}
                    onOpenChange={setIsRequestModalOpen}
                    variant="request"
                    onSuccess={() => {
                        if (documentRequestLookupId) {
                            void dispatch(
                                getDocumentRequestsByApplication(documentRequestLookupId),
                            );
                        }
                    }}
                />
            ) : null}
            <DisclosureCalculationModal
                open={disclosureCalcModalOpen}
                onOpenChange={(nextOpen) => {
                    setDisclosureCalcModalOpen(nextOpen);
                    if (!nextOpen) setDisclosureCalcBankAnalyses(null);
                }}
                seedInputs={disclosureCalculatorSeedInputs}
                bankMonthlyRevenues={disclosureCalcBankMonthlyRevenues}
                loadingBankAnalysis={loadingDisclosureCalcBankAnalysis}
                disclosureLabel={
                    linkedDisclosureMapping
                        ? formatDropdownLabel(
                              formatDisclosureTemplateLabel(linkedDisclosureMapping),
                          )
                        : undefined
                }
                saving={savingDisclosureCalculation}
                onApply={applyDisclosureCalculation}
            />
            <SpaCalculationModal
                open={spaCalcModalOpen}
                onOpenChange={setSpaCalcModalOpen}
                applicationUuid={applicationIdForLookup}
                offerDecision={(offerDecisionData as Record<string, unknown> | null) ?? null}
                saving={savingSpaCalculation}
                onApply={applySpaCalculation}
            />
        </>
    );
};

export default PDFViewerModal;
