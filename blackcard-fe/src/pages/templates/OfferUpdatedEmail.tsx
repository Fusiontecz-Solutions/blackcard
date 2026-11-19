import type { TemplateVariable } from "./types";
import { APPLICATION_APPROVAL_EMAIL_VARIABLES } from "./ApplicationApprovalEmail";
import { createHtmlTemplatePreview } from "./HtmlTemplatePreview";
import { renderOfferUpdatedEmailHtml } from "./offerUpdatedEmailHtml";

/** Same merge fields as the approval email — resend uses the updated-offer copy. */
export const OFFER_UPDATED_EMAIL_VARIABLES: TemplateVariable[] =
  APPLICATION_APPROVAL_EMAIL_VARIABLES.map((variable) =>
    variable.key === "calculate_approval_url"
      ? {
          ...variable,
          label: "ISO approval portal URL",
        }
      : variable,
  );

const OfferUpdatedEmail = createHtmlTemplatePreview(
  renderOfferUpdatedEmailHtml,
  "Offer updated email preview",
);

export default OfferUpdatedEmail;
