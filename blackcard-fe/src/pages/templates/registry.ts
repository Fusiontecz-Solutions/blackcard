import ApplicationApprovalEmail, {
  APPLICATION_APPROVAL_EMAIL_VARIABLES,
} from "./ApplicationApprovalEmail";
import { renderApplicationApprovalEmailHtml } from "./applicationApprovalEmailHtml";
import ApplicationApprovedEmail, {
  APPLICATION_APPROVED_EMAIL_VARIABLES,
} from "./ApplicationApprovedEmail";
import { renderApplicationApprovedEmailHtml } from "./applicationApprovedEmailHtml";
import ApplicationRejectionEmail, {
  APPLICATION_REJECTION_EMAIL_VARIABLES,
} from "./ApplicationRejectionEmail";
import { renderApplicationRejectionEmailHtml } from "./applicationRejectionEmailHtml";
import DocumentRequestEmail, {
  DOCUMENT_REQUEST_EMAIL_VARIABLES,
} from "./DocumentRequestEmail";
import { renderDocumentRequestEmailHtml } from "./documentRequestEmailHtml";
import OfferUpdatedEmail, {
  OFFER_UPDATED_EMAIL_VARIABLES,
} from "./OfferUpdatedEmail";
import { renderOfferUpdatedEmailHtml } from "./offerUpdatedEmailHtml";
import PayOffLetter, {
  PAY_OFF_LETTER_VARIABLES,
} from "./PayOffLetter";
import { renderPayOffLetterEmailHtml } from "./payOffLetterEmailHtml";
import PayoffWireInstructions from "./PayoffWireInstructions";
import { PAYOFF_WIRE_INSTRUCTIONS_VARIABLES } from "./payoffWireInstructionsShared";
import { renderPayoffWireInstructionsHtml } from "./payoffWireInstructionsEmailHtml";
import ZeroBalanceLetter, {
  ZERO_BALANCE_LETTER_VARIABLES,
} from "./ZeroBalanceLetter";
import { renderZeroBalanceLetterEmailHtml } from "./zeroBalanceLetterEmailHtml";
import type { TemplateDefinition } from "./types";

/**
 * Central registry of every template in this folder. Add new templates here
 * so they automatically show up in the Template Playground (`/template/playground`).
 */
export const TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    id: "application-rejection-email",
    name: "Application Rejection Email",
    category: "email",
    description:
      "Email sent to a client / ISO when an application is rejected during underwriting.",
    variables: APPLICATION_REJECTION_EMAIL_VARIABLES,
    Component: ApplicationRejectionEmail,
    renderHtml: renderApplicationRejectionEmailHtml,
  },
  {
    id: "document-request-email",
    name: "Document Request Email",
    category: "email",
    description:
      "Email sent to an ISO / client requesting documents be uploaded via the public portal.",
    variables: DOCUMENT_REQUEST_EMAIL_VARIABLES,
    Component: DocumentRequestEmail,
    renderHtml: renderDocumentRequestEmailHtml,
  },
  {
    id: "application-approval-email",
    name: "Application Approval Email",
    category: "email",
    description:
      "Email sent to an ISO / client when an application is approved, with a link to calculate approvals.",
    variables: APPLICATION_APPROVAL_EMAIL_VARIABLES,
    Component: ApplicationApprovalEmail,
    renderHtml: renderApplicationApprovalEmailHtml,
  },
  {
    id: "application-approved-email",
    name: "Application Approved Email",
    category: "email",
    description:
      "Email sent when an application is approved, with full offer terms inline (no portal link).",
    variables: APPLICATION_APPROVED_EMAIL_VARIABLES,
    Component: ApplicationApprovedEmail,
    renderHtml: renderApplicationApprovedEmailHtml,
  },
  {
    id: "offer-updated-email",
    name: "Offer Updated Email",
    category: "email",
    description:
      "Email sent to an ISO / client when approved offer values are updated, with a link to review the new offer.",
    variables: OFFER_UPDATED_EMAIL_VARIABLES,
    Component: OfferUpdatedEmail,
    renderHtml: renderOfferUpdatedEmailHtml,
  },
  {
    id: "pay-off-letter",
    name: "Pay Off Letter",
    category: "letter",
    description:
      "Payoff letter with wire instructions — branded email layout used for outbound sends.",
    variables: PAY_OFF_LETTER_VARIABLES,
    Component: PayOffLetter,
    renderHtml: renderPayOffLetterEmailHtml,
  },
  {
    id: "payoff-wire-instructions",
    name: "Payoff Wire Instructions",
    category: "letter",
    description:
      "Wire destination sheet for a merchant payoff — same personalization as the Payoff letter.",
    variables: PAYOFF_WIRE_INSTRUCTIONS_VARIABLES,
    Component: PayoffWireInstructions,
    renderHtml: renderPayoffWireInstructionsHtml,
  },
  {
    id: "zero-balance-letter",
    name: "Zero Balance Letter",
    category: "letter",
    description:
      "Zero balance confirmation letter — branded email layout used for outbound sends.",
    variables: ZERO_BALANCE_LETTER_VARIABLES,
    Component: ZeroBalanceLetter,
    renderHtml: renderZeroBalanceLetterEmailHtml,
  },
];
