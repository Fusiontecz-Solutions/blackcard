import { LetterA4Preview } from "@/pages/templates/LetterA4Preview";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { useSelector } from "react-redux";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";

import { APP_COMPANY_LEGAL_NAME } from "@/constants/appBranding";
import type { AppDispatch, RootState } from "@/redux/store";
import type { Application } from "@/types/applicationTypes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { savePaymentMailLogEntry } from "./paymentMailLogStorage";
import {
  getPaymentTemplates,
  readPaymentTemplatesCache,
  type TemplateItem as ApiTemplateItem,
} from "./paymentTemplateApi";
import {
  downloadPaymentLetterPdf,
  sendPaymentMail,
} from "@/redux/actions/paymentMailActions";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import { getTermsOffers } from "@/redux/actions/termsOfferActions";
import { resolveOfferDecisionFundedAmount } from "@/lib/offerDecisionFees";
import { cn, formatCurrency } from "@/lib/utils";
import {
  DEFAULT_PAYOFF_NOTE,
  DEFAULT_PAYOFF_SALUTATION,
  PAY_OFF_LETTER_VARIABLES,
} from "@/pages/templates/PayOffLetter";
import {
  ZERO_BALANCE_LETTER_VARIABLES,
} from "@/pages/templates/ZeroBalanceLetter";
import { PAYOFF_WIRE_INSTRUCTIONS_VARIABLES } from "@/pages/templates/payoffWireInstructionsShared";
import { renderPayOffLetterEmailHtml } from "@/pages/templates/payOffLetterEmailHtml";
import { renderZeroBalanceLetterEmailHtml } from "@/pages/templates/zeroBalanceLetterEmailHtml";
import { renderPayoffWireInstructionsHtml } from "@/pages/templates/payoffWireInstructionsEmailHtml";
import { resolveLetterEmailBrandingByFunderId } from "@/pages/templates/letterEmailBranding";
import {
  formatLetterDealId,
  letterApplicationIdFromApp,
} from "@/pages/templates/types";
import { inlineHtmlImagesForPdf } from "@/pages/templates/inlineHtmlImagesForPdf";
import { useFunderProfiles, findFunderProfileById } from "@/hooks/useFunderProfiles";
import type { FunderProfile } from "@/types/integrationSettingsTypes";
import { Download, FileText, Loader2, Mail, RotateCcw, Send } from "lucide-react";
import type { TermsOffer } from "@/types/termsOfferTypes";
import {
  isPayoffLetterName,
  isPayoffOrZeroBalanceLetter,
  isPayoffWireLetterName,
  isZeroBalanceLetterName,
  withBrandedLetterTemplates,
} from "./brandedLetterTemplates";

type ApplicationFundingExtras = Application & {
  termsOffers?: Array<{ approvedAmount?: unknown }>;
  OfferDecision?: Record<string, unknown>;
};

type LetterFundingSources = {
  offerDecision?: Record<string, unknown> | null;
  termsOffers?: TermsOffer[];
};

/** Ordered unique placeholder keys from template body (without `{{` `}}`). */
function placeholderKeysFromBody(body: string): string[] {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const k = m[1].trim();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

function normalizeMergeKey(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const m = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(t);
  return (m ? m[1] : t.replace(/^\{\{|\}\}$/g, "")).trim();
}

/** Prefer branded HTML variable lists for payoff / zero-balance / wire letters. */
function templateMergeKeys(template: ApiTemplateItem): string[] {
  if (isZeroBalanceLetterName(template.name)) {
    return ZERO_BALANCE_LETTER_VARIABLES.map((v) => v.key);
  }
  if (isPayoffWireLetterName(template.name)) {
    return PAYOFF_WIRE_INSTRUCTIONS_VARIABLES.map((v) => v.key);
  }
  if (isPayoffLetterName(template.name)) {
    return PAY_OFF_LETTER_VARIABLES.map((v) => v.key);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const k = normalizeMergeKey(raw);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (const k of placeholderKeysFromBody(template.body)) push(k);
  for (const k of template.variables ?? []) push(String(k ?? ""));
  return out;
}

/** Trimmed string for merge fields (values may be non-strings at runtime). */
function mergeFieldStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return String(v).trim();
}

/** UI label for a merge token key (snake_case → Title Case). */
function mergeFieldLabel(key: string): string {
  return key
    .split(/_+/)
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

/** Prefer branded template variable labels when present (e.g. Valid Till). */
function templateFieldLabel(template: ApiTemplateItem | null, key: string): string {
  if (template && isZeroBalanceLetterName(template.name)) {
    const fromVars = ZERO_BALANCE_LETTER_VARIABLES.find((v) => v.key === key)?.label;
    if (fromVars) return fromVars;
  }
  if (template && isPayoffWireLetterName(template.name)) {
    const fromVars = PAYOFF_WIRE_INSTRUCTIONS_VARIABLES.find((v) => v.key === key)?.label;
    if (fromVars) return fromVars;
  }
  if (template && isPayoffLetterName(template.name)) {
    const fromVars = PAY_OFF_LETTER_VARIABLES.find((v) => v.key === key)?.label;
    if (fromVars) return fromVars;
  }
  return mergeFieldLabel(key);
}

function escapeHtmlForMerge(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when the template uses HTML (e.g. table layout for email). */
function templateBodyIsHtml(body: string): boolean {
  return /<\/?(?:table|html|div|p|pre|br|span|strong|ul|ol|li)\b/i.test(body);
}

function mergeTemplate(
  body: string,
  values: Record<string, unknown>,
  escapeValueHtml: boolean,
  mergeKeys: string[] = []
) {
  const tokenRegex = /\{\{\s*([^}]+?)\s*\}\}/g;
  if (tokenRegex.test(body)) {
    return body.replace(tokenRegex, (_, rawKey: string) => {
      const key = rawKey.trim();
      const s = mergeFieldStr(values[key]);
      if (s === "") {
        const label = mergeFieldLabel(key);
        return escapeValueHtml ? escapeHtmlForMerge(label) : label;
      }
      return escapeValueHtml ? escapeHtmlForMerge(s) : s;
    });
  }

  // Fallback for plain-text templates that use human words but have variables list.
  let out = body;
  for (const key of mergeKeys) {
    const value = mergeFieldStr(values[key]);
    if (!value) continue;
    const keyPattern = new RegExp(`\\b${escapeRegex(key)}\\b`, "gi");
    out = out.replace(keyPattern, value);

    const label = mergeFieldLabel(key);
    if (label) {
      const labelPattern = new RegExp(`\\b${escapeRegex(label)}\\b`, "gi");
      out = out.replace(labelPattern, value);
    }
  }
  return out;
}

function decodeDealLabel(raw: string | undefined) {
  if (!raw?.trim()) return "N/A";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function formatUsShortDate(iso?: string | null): string {
  if (!iso?.trim()) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

type LetterPersonalizationKind = "zbl" | "payoff" | "other";

function letterPersonalizationKind(
  template: ApiTemplateItem | null | undefined
): LetterPersonalizationKind {
  if (!template) return "other";
  const name = template.name.trim().toLowerCase();
  const id = template.id.trim().toLowerCase();
  if (
    name.includes("zero balance") ||
    name.includes("zbl") ||
    id.includes("zero-balance")
  ) {
    return "zbl";
  }
  if (
    name.includes("payoff") ||
    name.includes("pay off") ||
    name.includes("wire") ||
    id.includes("payoff") ||
    id.includes("wire")
  ) {
    return "payoff";
  }
  return "other";
}

type PersonalizationBox = {
  key: string;
  label: string;
  placeholder?: string;
  input?: "text" | "textarea";
  /** Combined lender street + city/state stored in payment_address_line1/2. */
  composite?: "lender_address";
};

const LENDER_ADDRESS_BOX: PersonalizationBox = {
  key: "payment_address",
  label: "Address",
  placeholder: "Street, City ST ZIP",
  input: "textarea",
  composite: "lender_address",
};

const PAYOFF_BANK_NAME_DEFAULT = "Optimum Bank";
const PAYOFF_LENDER_NAME_DEFAULT = APP_COMPANY_LEGAL_NAME;
const DEFAULT_SENDER_NAME = "Admin Team";

function personalizationLayout(
  kind: LetterPersonalizationKind
): {
  recipient: PersonalizationBox[];
  lender: PersonalizationBox[];
  bankDetails: PersonalizationBox[];
} | null {
  // Template variables alone do not drive the form — this layout is the
  // source of truth for which merge fields appear in Data Personalization.
  if (kind === "zbl") {
    return {
      recipient: [
        { key: "deal_id", label: "Deal ID", placeholder: "BCF12345" },
        {
          key: "account_name",
          label: "Merchant Name",
          placeholder: "Acme LLC",
        },
        {
          key: "salutation_name",
          label: "Salutation Name",
          placeholder: "John Doe",
        },
        {
          key: "date_of_funding",
          label: "Date of Funding",
          placeholder: "05/20/2024",
        },
        {
          key: "account_status",
          label: "Status",
          placeholder: "Zero Balance",
        },
      ],
      lender: [],
      bankDetails: [],
    };
  }
  if (kind === "payoff") {
    return {
      recipient: [
        { key: "deal_id", label: "Deal ID", placeholder: "BCF12345" },
        {
          key: "letter_date",
          label: "Letter Date",
          placeholder: "May 20, 2024",
        },
        {
          key: "recipient_salutation",
          label: "Recipient",
          placeholder: DEFAULT_PAYOFF_SALUTATION,
        },
        {
          key: "account_name",
          label: "Merchant Name",
          placeholder: "Acme LLC",
        },
        { key: "payoff_amount", label: "Amount", placeholder: "$5,678.90" },
        {
          key: "good_through_date",
          label: "Valid Till",
          placeholder: "May 27, 2024",
        },
        {
          key: "note",
          label: "Note",
          placeholder: DEFAULT_PAYOFF_NOTE,
          input: "textarea",
        },
      ],
      lender: [
        {
          key: "lender_name",
          label: "Lender Name",
          placeholder: PAYOFF_LENDER_NAME_DEFAULT,
        },
        {
          key: "payment_company_name",
          label: "Bank Name",
          placeholder: PAYOFF_BANK_NAME_DEFAULT,
        },
        LENDER_ADDRESS_BOX,
      ],
      bankDetails: [
        {
          key: "payment_routing_number",
          label: "Routing Number",
          placeholder: "Routing number",
        },
        {
          key: "payment_account_number",
          label: "Account Number",
          placeholder: "Account number",
        },
      ],
    };
  }
  return null;
}

function personalizationMergeKeys(kind: LetterPersonalizationKind): string[] {
  const layout = personalizationLayout(kind);
  if (!layout) return [];
  const keys: string[] = [];
  for (const box of [
    ...layout.recipient,
    ...layout.lender,
    ...layout.bankDetails,
  ]) {
    if (box.composite === "lender_address") {
      keys.push(
        "payment_address",
        "payment_address_line1",
        "payment_address_line2",
      );
      continue;
    }
    keys.push(box.key);
  }
  return keys;
}

function formatLenderAddress(values: Record<string, string>): string {
  const stored = (values.payment_address ?? "").trim();
  if (stored && stored.toUpperCase() !== "NA") return values.payment_address ?? "";
  const line1 = (values.payment_address_line1 ?? "").trim();
  const line2Raw = (values.payment_address_line2 ?? "").trim();
  const line2 = !line2Raw || line2Raw.toUpperCase() === "NA" ? "" : line2Raw;
  return line2 ? `${line1}, ${line2}` : line1;
}

function parseLenderAddress(raw: string): {
  payment_address: string;
  payment_address_line1: string;
  payment_address_line2: string;
} {
  const normalized = raw.replace(/\r\n/g, "\n");
  const breakAt = (() => {
    const nl = normalized.indexOf("\n");
    if (nl >= 0) return nl;
    const comma = normalized.indexOf(",");
    return comma >= 0 ? comma : -1;
  })();
  if (breakAt < 0) {
    return {
      payment_address: raw,
      payment_address_line1: normalized.trim(),
      payment_address_line2: "",
    };
  }
  const line1 = normalized.slice(0, breakAt).replace(/\n/g, " ").trim();
  const line2 = normalized
    .slice(breakAt + 1)
    .replace(/\n/g, " ")
    .replace(/^[\s,]+/, "")
    .trim();
  return {
    payment_address: raw,
    payment_address_line1: line1,
    payment_address_line2: line2,
  };
}

function PersonalizationFieldGrid({
  boxes,
  fieldValues,
  onChange,
}: {
  boxes: PersonalizationBox[];
  fieldValues: Record<string, string>;
  onChange: (patch: Record<string, string>) => void;
}) {
  const inputClass =
    "h-9 border-border bg-background text-sm dark:border-white/10 dark:bg-white/[0.04]";
  const textareaClass =
    "min-h-[72px] resize-y border-border bg-background text-sm dark:border-white/10 dark:bg-white/[0.04]";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {boxes.map((box) => {
        const isAddress = box.composite === "lender_address";
        const value = isAddress
          ? formatLenderAddress(fieldValues)
          : fieldValues[box.key] || "";
        const useTextarea = box.input === "textarea";
        return (
          <div
            key={box.key}
            className={cn("space-y-1.5", isAddress && "sm:col-span-2")}
          >
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {box.label}
            </Label>
            {useTextarea ? (
              <Textarea
                value={value}
                placeholder={box.placeholder}
                onChange={(e) => {
                  if (isAddress) {
                    onChange(parseLenderAddress(e.target.value));
                  } else {
                    onChange({ [box.key]: e.target.value });
                  }
                }}
                className={textareaClass}
              />
            ) : (
              <Input
                value={value}
                placeholder={box.placeholder}
                onChange={(e) => {
                  if (isAddress) {
                    onChange(parseLenderAddress(e.target.value));
                  } else {
                    onChange({ [box.key]: e.target.value });
                  }
                }}
                className={inputClass}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function isShortPlatformLenderName(value: string): boolean {
  const n = value.trim().toLowerCase();
  return n === "g6 advance" || n === "black card" || n === "blackcard";
}

function isOldBeneficiaryCompanyName(value: string): boolean {
  const n = value.trim().toLowerCase();
  return (
    n === APP_COMPANY_LEGAL_NAME.trim().toLowerCase() ||
    n === "black card llc" ||
    n === "g6 advance llc"
  );
}

function buildFieldValuesForTemplate(
  template: ApiTemplateItem,
  defaults: Record<string, string>
): Record<string, string> {
  const kind = letterPersonalizationKind(template);
  const keys = new Set([
    ...templateMergeKeys(template),
    ...personalizationMergeKeys(kind),
  ]);
  const next: Record<string, string> = {};
  for (const k of keys) {
    next[k] = defaults[k] ?? "";
  }
  if (!mergeFieldStr(next.sender_name)) {
    next.sender_name = DEFAULT_SENDER_NAME;
  }
  if (kind === "zbl") {
    if (!mergeFieldStr(next.account_status)) {
      next.account_status = "Zero Balance";
    }
  }
  if (kind === "payoff") {
    if (!mergeFieldStr(next.note)) {
      next.note = DEFAULT_PAYOFF_NOTE;
    }
    if (
      !mergeFieldStr(next.lender_name) ||
      isShortPlatformLenderName(next.lender_name)
    ) {
      const fromDefaults = mergeFieldStr(defaults.lender_name);
      next.lender_name =
        fromDefaults && !isShortPlatformLenderName(fromDefaults)
          ? fromDefaults
          : PAYOFF_LENDER_NAME_DEFAULT;
    }
    const company = mergeFieldStr(next.payment_company_name);
    if (!company || isOldBeneficiaryCompanyName(company)) {
      next.payment_company_name =
        mergeFieldStr(defaults.payment_company_name) || PAYOFF_BANK_NAME_DEFAULT;
    }
    next.merchant_legal_name =
      mergeFieldStr(next.merchant_legal_name) || mergeFieldStr(next.account_name);
    next.beneficiary_name =
      mergeFieldStr(next.beneficiary_name) || mergeFieldStr(next.lender_name);
    next.payment_bank_name =
      mergeFieldStr(next.payment_bank_name) ||
      mergeFieldStr(next.payment_company_name);
    next.bank_name =
      mergeFieldStr(next.bank_name) || mergeFieldStr(next.payment_company_name);
    next.routing_number =
      mergeFieldStr(next.routing_number) ||
      mergeFieldStr(next.payment_routing_number);
    next.wire_account_number =
      mergeFieldStr(next.wire_account_number) ||
      mergeFieldStr(next.payment_account_number);
  }
  if (!mergeFieldStr(next.payment_address)) {
    next.payment_address = formatLenderAddress(next);
  }
  if (
    mergeFieldStr(next.payment_address) &&
    !mergeFieldStr(next.payment_address_line2)
  ) {
    const parsed = parseLenderAddress(next.payment_address);
    next.payment_address_line1 = parsed.payment_address_line1;
    next.payment_address_line2 = parsed.payment_address_line2;
  }
  return next;
}

function letterTypeLabelForSubject(templateName: string): string {
  if (isZeroBalanceLetterName(templateName)) {
    return "Zero Balance Letter";
  }
  if (isPayoffWireLetterName(templateName)) {
    return "Payoff Wire Instructions";
  }
  if (isPayoffLetterName(templateName)) {
    return "Pay off Letter";
  }
  return templateName;
}

function letterFundedAmountForSubject(values: Record<string, string>): string {
  return (
    values.original_funded?.trim() ||
    values.advance_amount?.trim() ||
    values.offer_amount?.trim() ||
    ""
  );
}

function offerDecisionBelongsToApplication(
  offerDecision: Record<string, unknown> | null | undefined,
  applicationUuid: string
): boolean {
  if (!offerDecision || !applicationUuid) return false;
  const appRef = offerDecision.application ?? offerDecision.applicationId;
  return String(appRef) === applicationUuid;
}

function termsOfferBelongsToApplication(
  termsOffer: TermsOffer,
  applicationUuid: string
): boolean {
  if (!applicationUuid) return false;
  const app = termsOffer.application;
  if (typeof app === "string") return app === applicationUuid;
  if (app && typeof app === "object") {
    const id = (app as { _id?: string; id?: string })._id ?? (app as { id?: string }).id;
    return id != null && String(id) === applicationUuid;
  }
  return true;
}

function resolveFundedAmountFromOfferDecision(
  offerDecision: Record<string, unknown> | null | undefined
): number | null {
  if (!offerDecision || typeof offerDecision !== "object") return null;
  if (String(offerDecision.decision ?? "").toLowerCase() === "declined") {
    return null;
  }
  return resolveOfferDecisionFundedAmount(offerDecision);
}

/** Payoff / zero-balance letters: `Client Name: Letter Type - Funded Amount`. */
function buildLetterPdfFilename(
  templateName: string,
  dealLabel: string,
  subject: string
): string {
  const base =
    subject.trim() ||
    `${templateName.trim() || "letter"}-${dealLabel.trim() || "deal"}`;
  const sanitized = base
    .replace(/[^\w\s.-]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
  return sanitized || "letter";
}

async function parseLetterPdfErrorMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") {
    return "Could not generate the letter PDF.";
  }
  const axiosError = error as {
    response?: { data?: Blob };
    message?: string;
  };
  const data = axiosError.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message?.trim()) return parsed.message.trim();
    } catch {
      // Response was not JSON.
    }
  }
  if (axiosError.message?.trim()) return axiosError.message.trim();
  return "Could not generate the letter PDF.";
}

function buildLetterEmailSubject(
  templateName: string,
  values: Record<string, string>
): string {
  const clientName =
    values.account_name?.trim() ||
    values.business_name?.trim() ||
    values.client_name?.trim() ||
    values.merchant_name?.trim() ||
    "Client";
  const letterType = letterTypeLabelForSubject(templateName);
  const fundedAmount = letterFundedAmountForSubject(values);
  return fundedAmount
    ? `${clientName}: ${letterType} - ${fundedAmount}`
    : `${clientName}: ${letterType}`;
}

function resolveFundedAmount(
  application: Application | null | undefined,
  funding: LetterFundingSources = {}
): number {
  const direct = Number(application?.loanAmount);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const ext = application as ApplicationFundingExtras | null | undefined;
  const fetchedTermsAmt = Number(funding.termsOffers?.[0]?.approvedAmount);
  const embeddedTermsAmt = Number(ext?.termsOffers?.[0]?.approvedAmount);
  const termsAmt = Number.isFinite(fetchedTermsAmt) && fetchedTermsAmt > 0
    ? fetchedTermsAmt
    : embeddedTermsAmt;
  if (Number.isFinite(termsAmt) && termsAmt > 0) return termsAmt;

  const fromFetchedOffer = resolveFundedAmountFromOfferDecision(
    funding.offerDecision
  );
  if (fromFetchedOffer != null && fromFetchedOffer > 0) return fromFetchedOffer;

  const fromEmbeddedOffer = resolveFundedAmountFromOfferDecision(
    ext?.OfferDecision
  );
  if (fromEmbeddedOffer != null && fromEmbeddedOffer > 0) return fromEmbeddedOffer;

  return 0;
}

/** Lender / bank-name fallbacks. Address, routing, and account come from the funder profile. */
const DEFAULT_PAYOFF_WIRE_DETAILS = {
  lender_name: APP_COMPANY_LEGAL_NAME,
  bank_name: PAYOFF_BANK_NAME_DEFAULT,
} as const;

type PayoffWireDetails = {
  lender_name: string;
  payment_company_name: string;
  payment_address_line1: string;
  payment_address_line2: string;
  payment_routing_number: string;
  payment_account_number: string;
  bank_name: string;
  bank_address_line1: string;
  bank_city_state_zip: string;
  routing_number: string;
  account_number: string;
  beneficiary_name: string;
};

function resolvePayoffWireDetails(
  funder?: Pick<
    FunderProfile,
    | "letterWireBankName"
    | "letterWireAddressLine1"
    | "letterWireCityStateZip"
    | "letterWireRoutingNumber"
    | "letterWireAccountNumber"
  > | null,
): PayoffWireDetails {
  const bankName =
    String(funder?.letterWireBankName ?? "").trim() ||
    DEFAULT_PAYOFF_WIRE_DETAILS.bank_name;
  const address1 = String(funder?.letterWireAddressLine1 ?? "").trim();
  const cityStateZip = String(funder?.letterWireCityStateZip ?? "").trim();
  const routing = String(funder?.letterWireRoutingNumber ?? "").trim();
  const account = String(funder?.letterWireAccountNumber ?? "").trim();

  return {
    lender_name: DEFAULT_PAYOFF_WIRE_DETAILS.lender_name,
    beneficiary_name: DEFAULT_PAYOFF_WIRE_DETAILS.lender_name,
    bank_name: bankName,
    bank_address_line1: address1,
    bank_city_state_zip: cityStateZip,
    routing_number: routing,
    account_number: account,
    payment_company_name: bankName,
    payment_address_line1: address1,
    payment_address_line2: cityStateZip,
    payment_routing_number: routing,
    payment_account_number: account,
  };
}

function buildDefaultValues(
  application: Application | null | undefined,
  dealLabel: string,
  funding: LetterFundingSources = {},
  funder?: Pick<
    FunderProfile,
    | "dealIdPrefix"
    | "contactEmail"
    | "addressLine1"
    | "addressCity"
    | "addressState"
    | "addressZip"
    | "letterWireBankName"
    | "letterWireAddressLine1"
    | "letterWireCityStateZip"
    | "letterWireRoutingNumber"
    | "letterWireAccountNumber"
  > | null,
  lenderName = "",
  logoSrc = "",
): Record<string, string> {
  const client = application?.client;
  const owner = typeof client === "object" ? client?.owner : undefined;
  const business = typeof client === "object" ? client?.business : undefined;
  const merchantName = [owner?.firstName, owner?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const email = owner?.email ?? business?.email ?? "";
  const loan = resolveFundedAmount(application, funding);
  const totalRepay = Math.round(loan * 1.42);
  const paid = Math.round(loan * 0.071);
  const balanceDue = Number(application?.collectionBalanceDue);
  const payoff =
    Number.isFinite(balanceDue) && balanceDue >= 0
      ? balanceDue
      : Math.max(0, totalRepay - paid);
  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const d = new Date();
  const letterDate = `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  const goodThrough = new Date(d);
  goodThrough.setDate(goodThrough.getDate() + 7);
  const goodThroughDate = goodThrough.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const agreementDate =
    formatUsShortDate(application?.createdAt) || letterDate;
  const legalEntityName = (business?.name ?? merchantName).trim();
  const accountName = legalEntityName || merchantName;
  const wire = resolvePayoffWireDetails(funder);

  return {
    merchant_name: merchantName,
    business_name: business?.name ?? "",
    agent_name: application?.salesRepresentative ?? "",
    advance_amount: loan ? formatCurrency(loan) : "",
    offer_amount: loan ? formatCurrency(loan) : "",
    factor_rate: "1.42",
    payback_amount: totalRepay ? formatCurrency(totalRepay) : "",
    daily_payment: totalRepay ? formatCurrency(Math.round(totalRepay / 120)) : "",
    term_months: "",
    owner_ssn_last4: "",
    deal_id: formatLetterDealId(
      application?.dealId?.trim() || dealLabel,
      funder?.dealIdPrefix,
    ),
    as_of_date: today,
    original_funded: loan ? formatCurrency(loan) : "",
    total_repayment: totalRepay ? formatCurrency(totalRepay) : "",
    total_paid: paid ? formatCurrency(paid) : "",
    payoff_balance: payoff ? formatCurrency(payoff) : "",
    funded_date: today,
    missed_date: today,
    remaining_balance: payoff ? formatCurrency(payoff) : "",
    payoff_amount: payoff ? formatCurrency(payoff) : "",
    payoff_date: today,
    default_date: today,
    outstanding_balance: payoff ? formatCurrency(payoff) : "",
    __recipient_email: email,
    customer_id: dealLabel,
    ...wire,
    client_name: merchantName,
    letter_date: today,
    merchant_legal_name: legalEntityName,
    agreement_date: agreementDate,
    zero_balance_statement: "$0.00 (zero dollars)",
    // Branded payoff / zero-balance / wire email HTML merge fields
    account_name: accountName,
    salutation_name: merchantName || accountName,
    date_of_funding:
      formatUsShortDate(application?.approvedAt) || agreementDate,
    good_through_date: goodThroughDate,
    sender_name: DEFAULT_SENDER_NAME,
    account_status: "Zero Balance",
    note: DEFAULT_PAYOFF_NOTE,
    recipient_salutation: DEFAULT_PAYOFF_SALUTATION,
    lender_name: (() => {
      const fromBranding = lenderName.trim();
      if (fromBranding && !isShortPlatformLenderName(fromBranding)) {
        return fromBranding;
      }
      return wire.lender_name || PAYOFF_LENDER_NAME_DEFAULT;
    })(),
    brand_logo_url: logoSrc,
    beneficiary_address_line1: String(funder?.addressLine1 ?? "").trim(),
    beneficiary_city_state_zip: [
      [String(funder?.addressCity ?? "").trim(), String(funder?.addressState ?? "").trim()]
        .filter(Boolean)
        .join(", "),
      String(funder?.addressZip ?? "").trim(),
    ]
      .filter(Boolean)
      .join(" "),
    contact_email: String(funder?.contactEmail ?? "").trim(),
    payment_address: formatLenderAddress({
      payment_address_line1: wire.payment_address_line1,
      payment_address_line2: wire.payment_address_line2,
    }),
  };
}

function resolveApplicationContractState(
  application: Application | null | undefined,
): string {
  const client = application?.client;
  if (typeof client !== "object" || !client) return "";
  const businessState = client.business?.address?.state;
  if (typeof businessState === "string" && businessState.trim()) {
    return businessState.trim();
  }
  const ownerState = client.owner?.address?.state;
  if (typeof ownerState === "string" && ownerState.trim()) {
    return ownerState.trim();
  }
  return "";
}

export default function Letters() {
  const dispatch = useDispatch<AppDispatch>();
  const { paymentDealId, letterGeneratorDealId } = useParams<{
    paymentDealId?: string;
    letterGeneratorDealId?: string;
  }>();
  const routeSegment = paymentDealId ?? letterGeneratorDealId;
  const routeDealLabel = useMemo(
    () => decodeDealLabel(routeSegment),
    [routeSegment]
  );
  const application = useSelector(
    (s: RootState) => s.applicationDetail.data
  ) as Application | null | undefined;
  const offerDecisionRaw = useSelector(
    (s: RootState) => s.offerDecision.data
  ) as Record<string, unknown> | null | undefined;
  const termsOffersRaw = useSelector(
    (s: RootState) => s.termsOffers.data
  ) as TermsOffer[];
  const applicationUuid = application?._id ?? "";

  const contractState = useMemo(
    () => resolveApplicationContractState(application),
    [application],
  );

  const {
    funders,
    funderSelectEntries,
    loading: fundersLoading,
    resolveDefaultFunder,
  } = useFunderProfiles(contractState || null);

  const fundingSources = useMemo((): LetterFundingSources => {
    const offerDecision = offerDecisionBelongsToApplication(
      offerDecisionRaw,
      applicationUuid
    )
      ? offerDecisionRaw
      : null;
    const termsOffers = termsOffersRaw.filter((row) =>
      termsOfferBelongsToApplication(row, applicationUuid)
    );
    return { offerDecision, termsOffers };
  }, [offerDecisionRaw, termsOffersRaw, applicationUuid]);

  useEffect(() => {
    if (!applicationUuid) return;
    void dispatch(getOfferDecisionByApplication(applicationUuid));
    void dispatch(getTermsOffers({ application: applicationUuid, limit: 5 }));
  }, [dispatch, applicationUuid]);

  const dealLabel = useMemo(() => {
    const fromApp = letterApplicationIdFromApp(application);
    if (fromApp) return fromApp;
    return formatLetterDealId(routeDealLabel);
  }, [application, routeDealLabel]);

  const [templates, setTemplates] = useState<ApiTemplateItem[]>(
    () => readPaymentTemplatesCache() ?? []
  );

  useEffect(() => {
    let mounted = true;
    const loadTemplates = async () => {
      try {
        const apiTemplates = await getPaymentTemplates(undefined, {
          force: true,
        });
        if (!mounted) return;
        setTemplates(apiTemplates);
      } catch {
        // Keep session cache if the request fails
      }
    };
    void loadTemplates();
    return () => {
      mounted = false;
    };
  }, []);

  const templateSource = useMemo(
    () => withBrandedLetterTemplates(templates),
    [templates]
  );

  const [templateId, setTemplateId] = useState<string>("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [recipientEmail, setRecipientEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [funderProfileId, setFunderProfileId] = useState("");

  const letterEmailBranding = useMemo(
    () => resolveLetterEmailBrandingByFunderId(funders, funderProfileId),
    [funders, funderProfileId],
  );

  const defaults = useMemo(
    () =>
      buildDefaultValues(
        application,
        dealLabel,
        fundingSources,
        findFunderProfileById(funders, funderProfileId),
        letterEmailBranding.companyName,
        letterEmailBranding.logoSrc,
      ),
    [
      application,
      dealLabel,
      fundingSources,
      funders,
      funderProfileId,
      letterEmailBranding.companyName,
      letterEmailBranding.logoSrc,
    ],
  );

  useEffect(() => {
    if (!funderSelectEntries.length) return;
    const currentIsValid = funderSelectEntries.some(
      (entry) => entry.value === funderProfileId,
    );
    if (funderProfileId && currentIsValid) return;

    const defaultFunderName = resolveDefaultFunder();
    const match = funderSelectEntries.find(
      (entry) => entry.funderName === defaultFunderName,
    );
    if (match?.value) {
      setFunderProfileId(match.value);
      return;
    }
    if (funderSelectEntries[0]?.value) {
      setFunderProfileId(funderSelectEntries[0].value);
    }
  }, [funderProfileId, funderSelectEntries, resolveDefaultFunder]);

  const selectedTemplate = useMemo(
    () => templateSource.find((t) => t.id === templateId) ?? null,
    [templateSource, templateId]
  );

  useEffect(() => {
    setRecipientEmail(defaults.__recipient_email ?? "");
  }, [defaults.__recipient_email]);

  useEffect(() => {
    const nextId =
      templateSource.find((t) => t.id === templateId)?.id ??
      templateSource[0]?.id ??
      "";
    if (nextId !== templateId) setTemplateId(nextId);
  }, [templateSource, templateId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setFieldValues({});
      setSubject("");
      return;
    }
    const next = buildFieldValuesForTemplate(selectedTemplate, defaults);
    setFieldValues(next);
    if (selectedTemplate.category === "email") {
      setSubject(`${selectedTemplate.name} - ${defaults.business_name || dealLabel}`);
    } else if (selectedTemplate.category === "letter") {
      setSubject(
        isPayoffOrZeroBalanceLetter(selectedTemplate.name)
          ? buildLetterEmailSubject(selectedTemplate.name, { ...defaults, ...next })
          : `RE: ${selectedTemplate.name} - Deal ID: ${dealLabel}`
      );
    } else {
      setSubject(`${selectedTemplate.name} - ${dealLabel}`);
    }
  }, [selectedTemplate, defaults, dealLabel]);

  const placeholderKeys = useMemo(
    () =>
      selectedTemplate
        ? templateMergeKeys(selectedTemplate)
        : [],
    [selectedTemplate]
  );

  const groupedPersonalization = useMemo(
    () => personalizationLayout(letterPersonalizationKind(selectedTemplate)),
    [selectedTemplate]
  );

  const updatePersonalizationFields = (patch: Record<string, string>) => {
    setFieldValues((prev) => ({ ...prev, ...patch }));
  };

  const mergedBody = useMemo(() => {
    if (!selectedTemplate) return "";
    if (isZeroBalanceLetterName(selectedTemplate.name)) {
      return renderZeroBalanceLetterEmailHtml(fieldValues, letterEmailBranding);
    }
    if (isPayoffWireLetterName(selectedTemplate.name)) {
      return renderPayoffWireInstructionsHtml(fieldValues, letterEmailBranding);
    }
    if (isPayoffLetterName(selectedTemplate.name)) {
      return renderPayOffLetterEmailHtml(fieldValues, letterEmailBranding);
    }
    const escapeVals = templateBodyIsHtml(selectedTemplate.body);
    return mergeTemplate(
      selectedTemplate.body,
      fieldValues,
      escapeVals,
      placeholderKeys
    );
  }, [selectedTemplate, fieldValues, placeholderKeys, letterEmailBranding]);

  const previewIsHtml = Boolean(
    selectedTemplate &&
      (isPayoffOrZeroBalanceLetter(selectedTemplate.name) ||
        templateBodyIsHtml(selectedTemplate.body))
  );

  const previewHtml = useDebouncedValue(mergedBody, 300);

  /** Full email documents render in an isolated iframe so the app's global uppercase CSS does not leak in. */
  const previewUsesFullDocument =
    previewIsHtml && /<html[\s>]|<!doctype html/i.test(mergedBody);

  const autofillFromDefaults = () => {
    if (!selectedTemplate) return;
    const next = buildFieldValuesForTemplate(selectedTemplate, defaults);
    setFieldValues(next);
    setRecipientEmail(defaults.__recipient_email ?? "");
  };

  const clearAllInputs = () => {
    setFieldValues((prev) => {
      const next: Record<string, string> = {};
      for (const key of Object.keys(prev)) next[key] = "";
      return next;
    });
    setRecipientEmail("");
    setSubject("");
  };

  const downloadLetterPdf = async () => {
    if (!selectedTemplate) {
      toast.error("Choose a template first.");
      return;
    }
    if (!mergedBody.trim()) {
      toast.error("Nothing to download yet.");
      return;
    }

    setIsDownloadingPdf(true);
    try {
      const rawBody = previewIsHtml
        ? mergedBody
        : `<pre style="white-space:pre-wrap;font-family:Georgia,serif;font-size:13px;line-height:1.75">${escapeHtmlForMerge(mergedBody)}</pre>`;
      const bodyForPdf = previewIsHtml
        ? await inlineHtmlImagesForPdf(rawBody)
        : rawBody;
      const filenameBase = buildLetterPdfFilename(
        selectedTemplate.name,
        dealLabel,
        subject
      );
      const blob = await downloadPaymentLetterPdf({
        body: bodyForPdf,
        filename: filenameBase,
      });

      if (blob.type.includes("json")) {
        const text = await blob.text();
        const parsed = JSON.parse(text) as { message?: string };
        throw new Error(parsed.message || "Failed to generate letter PDF");
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${filenameBase}.pdf`;
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("PDF downloaded.");
    } catch (error: unknown) {
      const message = await parseLetterPdfErrorMessage(error);
      toast.error(message);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const sendLetter = async () => {
    if (!selectedTemplate) {
      toast.error("Choose a template first.");
      return;
    }
    const kind = letterPersonalizationKind(selectedTemplate);
    const requiredKeys = groupedPersonalization
      ? personalizationMergeKeys(kind).filter(
          (k) => k !== "payment_address" && k !== "payment_address_line2",
        )
      : placeholderKeys;
    const unresolved = requiredKeys.filter(
      (k) => !mergeFieldStr(fieldValues[k])
    );
    if (unresolved.length) {
      toast.error(
        `Fill all fields: ${unresolved.map((k) => templateFieldLabel(selectedTemplate, k)).join(", ")}`
      );
      return;
    }
    if (!recipientEmail.trim()) {
      toast.error("Add the merchant email address.");
      return;
    }
    if (
      (selectedTemplate.category === "email" ||
        selectedTemplate.category === "letter") &&
      !subject.trim()
    ) {
      toast.error("Add a subject line.");
      return;
    }

    setIsSending(true);
    try {
      const recipient = recipientEmail.trim();
      const resolvedSubject =
        subject.trim() ||
        (selectedTemplate.category === "letter" &&
        isPayoffOrZeroBalanceLetter(selectedTemplate.name)
          ? buildLetterEmailSubject(selectedTemplate.name, {
              ...defaults,
              ...fieldValues,
            })
          : `${selectedTemplate.name} - Deal #${dealLabel}`);

      const sendResult = await dispatch(
        sendPaymentMail({
          to: recipient,
          subject: resolvedSubject,
          body: mergedBody,
          applicationId: application?._id ?? null,
          dealKey: dealLabel,
          templateName: selectedTemplate.name,
          category: selectedTemplate.category,
        })
      ).unwrap();

      toast.success(
        `Email sent to ${recipient} (${selectedTemplate.name})`
      );

      const paymentMailLog = sendResult?.data?.paymentMailLog;
      if (paymentMailLog) {
        savePaymentMailLogEntry(paymentMailLog);
      }
    } catch (error: any) {
      const message =
        typeof error === "string"
          ? error
          : error?.message || "Failed to send email";
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] p-3">
      <div className="mb-5 rounded-xl border border-border/70 bg-card/95 px-5 py-4 dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          {/* <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--brand)]/20 bg-[var(--brand)]/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
            <Mail className="size-3.5" />
            Correspondence
          </div> */}
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Merchant Communications
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and send letters or emails for deal
            <span className="ml-1 font-semibold text-foreground">#{dealLabel}</span>
            . Outbound email is sent from the Black Card company mailbox (not your connected Gmail account).
          </p>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(680px,55%)]">
        <div className="min-w-0">
          <Card className="overflow-hidden border-border/70 bg-card shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
            <CardHeader className="border-b border-border/60 bg-muted/30 py-4 dark:border-white/10 dark:bg-white/[0.03]">
              <CardTitle className="text-md flex items-center gap-2 font-medium text-foreground">
                <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--brand)]/12">
                  <FileText className="size-4 text-[var(--brand)]" />
                </span>
                Template Configuration
              </CardTitle>
            </CardHeader>

            <CardContent className="space-y-7 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Funder</Label>
                  <Select
                    value={funderProfileId}
                    onValueChange={setFunderProfileId}
                    disabled={fundersLoading || !funderSelectEntries.length}
                  >
                    <SelectTrigger className="w-full border-border bg-background dark:border-white/10 dark:bg-white/[0.04]">
                      <SelectValue
                        placeholder={
                          fundersLoading ? "Loading funders..." : "Select funder..."
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {funderSelectEntries.map((entry) => (
                        <SelectItem key={entry.value} value={entry.value}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Template</Label>
                  <Select
                    value={templateId}
                    onValueChange={setTemplateId}
                    disabled={!templateSource.length}
                  >
                    <SelectTrigger className="w-full border-border bg-background dark:border-white/10 dark:bg-white/[0.04]">
                      <SelectValue placeholder="Select template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templateSource.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Mail className="size-4" /> Delivery Details
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-sm text-foreground/90">Merchant Email</Label>
                    <Input
                      placeholder="email@example.com"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="border-border bg-background dark:border-white/10 dark:bg-white/[0.04]"
                    />
                  </div>
                  {(selectedTemplate?.category === "email" || selectedTemplate?.category === "letter") && (
                    <div className="space-y-2">
                      <Label className="text-sm text-foreground/90">Subject Line</Label>
                      <Input
                        placeholder="Enter subject..."
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="border-border bg-background dark:border-white/10 dark:bg-white/[0.04]"
                      />
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {selectedTemplate &&
                (groupedPersonalization || placeholderKeys.length > 0) && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-foreground">
                      Data Personalization
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {groupedPersonalization
                        ? `${groupedPersonalization.recipient.length + groupedPersonalization.lender.length + groupedPersonalization.bankDetails.length} fields`
                        : `${placeholderKeys.length} fields`}
                    </div>
                  </div>
                  {groupedPersonalization ? (
                    <div className="space-y-5 rounded-lg border border-border/60 bg-muted/20 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                      <div className="space-y-3">
                        <div className="border-b border-border/60 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
                          Recipient
                        </div>
                        <PersonalizationFieldGrid
                          boxes={groupedPersonalization.recipient}
                          fieldValues={fieldValues}
                          onChange={updatePersonalizationFields}
                        />
                      </div>
                      {groupedPersonalization.lender.length > 0 ? (
                      <div className="space-y-3">
                            <div className="border-b border-border/60 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
                              Lender
                            </div>
                            <PersonalizationFieldGrid
                              boxes={groupedPersonalization.lender}
                              fieldValues={fieldValues}
                              onChange={updatePersonalizationFields}
                            />
                            {groupedPersonalization.bankDetails.length > 0 ? (
                              <>
                                <div className="pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                  Bank details
                                </div>
                                <PersonalizationFieldGrid
                                  boxes={groupedPersonalization.bankDetails}
                                  fieldValues={fieldValues}
                                  onChange={updatePersonalizationFields}
                                />
                              </>
                            ) : null}
                      </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-muted/20 p-4 dark:border-white/10 dark:bg-white/[0.02] sm:grid-cols-2">
                      {placeholderKeys.map((key) => (
                        <div key={key} className="space-y-1.5">
                          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {templateFieldLabel(selectedTemplate, key)}
                          </Label>
                          <Input
                            value={fieldValues[key] || ""}
                            onChange={(e) => setFieldValues((p) => ({ ...p, [key]: e.target.value }))}
                            className="h-9 border-border bg-background text-sm dark:border-white/10 dark:bg-white/[0.04]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex flex-wrap justify-end gap-2 border-t border-border/60 bg-muted/25 px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <Button
                type="button"
                variant="outline"
                onClick={autofillFromDefaults}
                disabled={!selectedTemplate}
                className="cursor-pointer border-border dark:border-white/10"
              >
                <RotateCcw className="mr-2 size-4" />
                Autofill Defaults
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={clearAllInputs}
                disabled={!selectedTemplate}
                className="cursor-pointer border-border dark:border-white/10"
              >
                Clear
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="min-w-0 w-full lg:sticky lg:top-6 lg:self-start">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/95 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <span className="hidden h-8 w-1 rounded-full bg-[image:var(--brand-gradient)] sm:block" aria-hidden />
                <Mail className="size-5" />
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Live Preview
                </h3>
              </div>
              {isSending && (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-medium text-[var(--brand)] animate-pulse">
                  Processing...
                </span>
              )}
            </div>

              <CardContent className="flex-1 overflow-hidden p-0">
                {selectedTemplate ? (
                  <div className="m-4 min-h-[460px] rounded-xl border border-border/70 bg-card p-6 text-foreground dark:border-white/10 dark:bg-white/[0.03] sm:m-5 sm:p-3">
                    <div className="mb-5 flex items-start justify-between gap-4 rounded-lg border border-border/60 bg-muted/25 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="text-[13px] text-muted-foreground">
                          Template:{" "}
                          <span className="font-medium text-foreground">
                            {selectedTemplate.name}
                          </span>
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          Type:{" "}
                          <span className="font-medium capitalize text-foreground">
                            {selectedTemplate.category}
                          </span>
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          To:{" "}
                          <span className="break-all font-medium text-foreground">
                            {recipientEmail || "(Empty)"}
                          </span>
                        </p>
                        <p className="text-[13px] text-muted-foreground">
                          Subject:{" "}
                          <span className="break-words font-medium text-foreground">
                            {subject || "(No Subject)"}
                          </span>
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 cursor-pointer border-border dark:border-white/10"
                        disabled={!mergedBody.trim() || isDownloadingPdf || isSending}
                        onClick={() => void downloadLetterPdf()}
                      >
                        {isDownloadingPdf ? (
                          <>
                            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                            Preparing…
                          </>
                        ) : (
                          <>
                            <Download className="mr-2 size-4" aria-hidden />
                            Download PDF
                          </>
                        )}
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "crm-keep-case",
                        "rounded-md border border-slate-200 bg-white",
                        previewUsesFullDocument
                          ? "overflow-hidden"
                          : "max-h-[min(54vh,480px)] overflow-y-auto p-3 pr-1 text-[13px] text-slate-900",
                        !previewUsesFullDocument &&
                          previewIsHtml &&
                          "font-sans leading-normal [&_table]:w-full [&_td]:align-top",
                        !previewUsesFullDocument &&
                          !previewIsHtml &&
                          "whitespace-pre-wrap font-serif leading-7"
                      )}
                    >
                      {previewUsesFullDocument ? (
                        <LetterA4Preview html={previewHtml} />
                      ) : previewIsHtml ? (
                        <div
                          className="email-html-preview"
                          dangerouslySetInnerHTML={{ __html: mergedBody }}
                        />
                      ) : (
                        mergedBody
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[420px] flex-col items-center justify-center space-y-3 p-12 text-center">
                    <div className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-muted/30 dark:border-white/10 dark:bg-white/[0.03]">
                      <FileText className="size-7 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Select a template to preview and send
                    </p>
                  </div>
                )}
              </CardContent>

              <CardFooter className="border-t border-border/60 bg-muted/25 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:p-5">
                <Button
                  onClick={() => void sendLetter()}
                  disabled={!selectedTemplate || isSending}
                  className="w-full bg-[image:var(--brand-gradient)] py-5 text-base font-semibold text-white cursor-pointer hover:opacity-90"
                >
                  {isSending ? (
                    "Sending..."
                  ) : (
                    <>
                      <Send className="mr-2 size-4" />
                      Send Communication
                    </>
                  )}
                </Button>
              </CardFooter>
         
          </div>
        </div>
      </div>
    </div>
  );
}
