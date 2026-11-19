import { formatCityStateZip } from "./payoffWireInstructionsShared";
import {
  DEFAULT_PAYOFF_NOTE,
  DEFAULT_PAYOFF_SALUTATION,
  PAY_OFF_LETTER_SIGNATURE_TITLE,
  PAY_OFF_LETTER_VARIABLES,
} from "./PayOffLetter";
import { formatLetterDealId, type TemplateValues, type TemplateVariable } from "./types";
import { escapeHtml } from "./applicationApprovalEmailShared";
import { APP_COMPANY_LEGAL_NAME } from "@/constants/appBranding";
import {
  DEFAULT_LETTER_EMAIL_BRANDING,
  type LetterEmailBranding,
} from "./letterEmailBranding";
import {
  letterDetailsTable,
  letterParagraph,
  letterStrong,
  letterWireInformation,
  renderLetterDocument,
  todayLongDate,
} from "./letterLayout";

/** Bank address shown under the wire bank name. */
const WIRE_BANK_ADDRESS = "2929 E. Commercial Blvd., Ft. Lauderdale, FL, 33308";

const v = PAY_OFF_LETTER_VARIABLES.reduce<
  Record<string, (typeof PAY_OFF_LETTER_VARIABLES)[number]>
>((acc, variable) => {
  acc[variable.key] = variable;
  return acc;
}, {});

/**
 * Email-specific picker: returns the supplied value, or `"NA"` when the
 * merge field is blank. We intentionally do NOT fall back to the variable's
 * `placeholder` here so the outgoing email never contains dummy preview text.
 */
function pickOrNA(values: TemplateValues, variable: TemplateVariable): string {
  const raw = values[variable.key];
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "NA";
}

function omitNa(raw: string): string {
  const t = raw.trim();
  if (!t || t.toUpperCase() === "NA") return "";
  return t;
}

function trimmed(values: TemplateValues, key: string): string {
  const raw = values[key];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Gmail/PDF-safe HTML for the Payoff letter (shared letterhead layout, funder
 * branding). Blank merge fields surface "NA"; a blank letter date falls back to today.
 */
export function renderPayOffLetterEmailHtml(
  values: TemplateValues,
  branding: LetterEmailBranding = DEFAULT_LETTER_EMAIL_BRANDING,
): string {
  const letterDate = escapeHtml(trimmed(values, "letter_date") || todayLongDate());
  const salutation = escapeHtml(
    (trimmed(values, "recipient_salutation") || DEFAULT_PAYOFF_SALUTATION).replace(/,\s*$/, ""),
  );
  const accountName = escapeHtml(pickOrNA(values, v.account_name));
  const dealId = escapeHtml(formatLetterDealId(pickOrNA(values, v.deal_id)));
  const payoffAmount = escapeHtml(pickOrNA(values, v.payoff_amount));
  const goodThroughDate = escapeHtml(pickOrNA(values, v.good_through_date));
  const lenderNameRaw =
    typeof values.lender_name === "string" ? values.lender_name.trim() : "";
  const lenderName = escapeHtml(lenderNameRaw || APP_COMPANY_LEGAL_NAME);
  const paymentCompany = escapeHtml(pickOrNA(values, v.payment_company_name));
  const paymentAddress1 = escapeHtml(pickOrNA(values, v.payment_address_line1));
  const paymentAddress2 = escapeHtml(
    omitNa(
      typeof values.payment_address_line2 === "string"
        ? values.payment_address_line2
        : "",
    ),
  );
  const paymentRoutingNumber = escapeHtml(
    pickOrNA(values, v.payment_routing_number),
  );
  const paymentAccountNumber = escapeHtml(
    pickOrNA(values, v.payment_account_number),
  );
  const senderName = escapeHtml(trimmed(values, "sender_name"));
  const signatureTitle = escapeHtml(PAY_OFF_LETTER_SIGNATURE_TITLE);
  const noteText = escapeHtml(trimmed(values, "note") || DEFAULT_PAYOFF_NOTE);

  const bodyRows = [
    letterParagraph(`${salutation},`, 14),
    letterParagraph(
      `This letter provides the payoff information for ${letterStrong(accountName)}. The payoff amount and wire instructions below are valid through ${letterStrong(goodThroughDate)}. Payments received after this date may require an updated payoff.`,
      20,
    ),
    letterDetailsTable([
      { label: "Deal ID", value: dealId },
      { label: "Merchant Name", value: accountName },
      { label: "Payoff Amount", value: payoffAmount },
      { label: "Valid Through", value: goodThroughDate },
      { label: "Note", value: noteText, subtle: true },
    ]),
    letterParagraph(
      "Please wire the payoff amount to the account below. To avoid additional interest charges, make sure payment is received by the valid-through date.",
      20,
    ),
    letterWireInformation({
      bank: paymentCompany,
      bankAddress: WIRE_BANK_ADDRESS,
      routing: paymentRoutingNumber,
      beneficiary: lenderName,
      beneficiaryAddress: [paymentAddress1, formatCityStateZip(paymentAddress2)]
        .filter(Boolean)
        .join(", "),
      account: paymentAccountNumber,
    }),
  ].join("");

  return renderLetterDocument({
    branding,
    documentTitle: "Payoff Letter",
    heading: "PAYOFF LETTER",
    letterDate,
    bodyRows,
    signerLine: senderName || signatureTitle,
    signatureTitle,
  });
}
