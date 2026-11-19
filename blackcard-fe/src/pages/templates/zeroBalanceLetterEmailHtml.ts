import {
  ZERO_BALANCE_LETTER_SIGNATURE_TITLE,
  ZERO_BALANCE_LETTER_VARIABLES,
} from "./ZeroBalanceLetter";
import { formatLetterDealId, type TemplateValues, type TemplateVariable } from "./types";
import { escapeHtml } from "./applicationApprovalEmailShared";
import {
  DEFAULT_LETTER_EMAIL_BRANDING,
  type LetterEmailBranding,
} from "./letterEmailBranding";
import {
  letterCompanyLegalName,
  letterCompanyShortName,
  letterDetailsTable,
  letterParagraph,
  letterStrong,
  renderLetterDocument,
  todayLongDate,
} from "./letterLayout";

const v = ZERO_BALANCE_LETTER_VARIABLES.reduce<
  Record<string, (typeof ZERO_BALANCE_LETTER_VARIABLES)[number]>
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

/**
 * Like {@link pickOrNA} but returns an empty string for blank merge fields.
 * Used for optional salutation so we can omit the row entirely instead of
 * printing "NA" in the outgoing letter.
 */
function pickOrBlank(
  values: TemplateValues,
  variable: TemplateVariable,
): string {
  const raw = values[variable.key];
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return "";
}

/**
 * Gmail/PDF-safe HTML for the Zero Balance letter (shared letterhead layout,
 * funder branding). Blank merge fields surface "NA"; a blank letter date falls
 * back to today. The balance is always the fixed text $0.00.
 * No payment address / routing / account block.
 */
export function renderZeroBalanceLetterEmailHtml(
  values: TemplateValues,
  branding: LetterEmailBranding = DEFAULT_LETTER_EMAIL_BRANDING,
): string {
  const letterDate = escapeHtml(pickOrBlank(values, v.letter_date) || todayLongDate());
  const accountName = escapeHtml(pickOrNA(values, v.account_name));
  const dealId = escapeHtml(formatLetterDealId(pickOrNA(values, v.deal_id)));
  const salutationName = escapeHtml(pickOrBlank(values, v.salutation_name));
  const dateOfFunding = escapeHtml(pickOrNA(values, v.date_of_funding));
  const accountStatus = escapeHtml(pickOrNA(values, v.account_status));
  const senderName = escapeHtml(
    String(values.sender_name || "").trim() || "Admin Team",
  );
  const signatureTitle = escapeHtml(ZERO_BALANCE_LETTER_SIGNATURE_TITLE);
  const legalName = escapeHtml(letterCompanyLegalName(branding));
  const shortNameRaw = letterCompanyShortName(branding);
  const shortName = escapeHtml(shortNameRaw);
  const nameIntro =
    shortNameRaw !== letterCompanyLegalName(branding)
      ? `${legalName} (&ldquo;${shortName}&rdquo;)`
      : legalName;

  const bodyRows = [
    salutationName ? letterParagraph(`Dear ${salutationName},`, 14) : "",
    letterParagraph(
      `This letter confirms that ${letterStrong(accountName)} has a balance of ${letterStrong("$0.00 (zero dollars)")} with ${nameIntro}.`,
      14,
    ),
    letterParagraph(
      `As this balance has been satisfied in full, and pursuant to our agreement, ${shortName} agrees to release the UCC filing and to reduce the current debt owed to ${shortName} to $0.00 (zero dollars).`,
      20,
    ),
    letterDetailsTable([
      { label: "Deal ID", value: dealId },
      { label: "Merchant Name", value: accountName },
      { label: "Date of Funding", value: dateOfFunding },
      { label: "Status", value: accountStatus },
    ]),
    letterParagraph(
      "If you have any questions or need any further assistance, please feel free to contact us.",
      32,
    ),
  ].join("");

  return renderLetterDocument({
    branding,
    documentTitle: "Zero Balance Letter",
    heading: "ZERO BALANCE LETTER",
    letterDate,
    bodyRows,
    signerLine: senderName,
    signatureTitle,
  });
}
