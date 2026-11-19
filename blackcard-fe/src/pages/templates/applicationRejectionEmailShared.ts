export const APPLICATION_REJECTION_EMAIL_SUBJECT = "Application Rejected";

/** Decline email subject — includes business name when available. */
export function buildApplicationRejectionEmailSubject(
  businessName?: string | null,
): string {
  const business = String(businessName || "").trim();
  return business
    ? `${APPLICATION_REJECTION_EMAIL_SUBJECT} — ${business}`
    : APPLICATION_REJECTION_EMAIL_SUBJECT;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ApplicationRejectionEmailFields = {
  clientName: string;
  primaryReason: string;
  otherReasons: string;
};

/** Delimiter for encoding multiple decline reasons in template values. */
export const DECLINE_REASONS_DELIMITER = "|||";

/** Split selected decline reasons for the rejection email template. */
export function formatDeclineReasonsForEmail(reasons: string[]): {
  primaryReason: string;
  otherReasons: string;
  combinedReason: string;
  declineReasons: string;
} {
  const trimmed = reasons.map((r) => String(r).trim()).filter(Boolean);
  const primaryReason = trimmed[0] || "";
  const otherReasons = trimmed.slice(1).join(", ");
  const combinedReason = trimmed.join(", ");
  const declineReasons = trimmed.join(DECLINE_REASONS_DELIMITER);
  return { primaryReason, otherReasons, combinedReason, declineReasons };
}

export function resolveApplicationRejectionEmailFields(
  values: Record<string, string | undefined>,
): ApplicationRejectionEmailFields {
  const clientName =
    String(values.client_name || "").trim() || "Valued Partner";
  const encoded = String(values.decline_reasons || "").trim();
  const fromEncoded = encoded
    ? encoded
        .split(DECLINE_REASONS_DELIMITER)
        .map((reason) => reason.trim())
        .filter(Boolean)
    : [];
  const primaryReason =
    fromEncoded[0] ||
    String(values.primary_reason || "").trim() ||
    "Does not meet underwriting criteria";
  const otherReasons =
    fromEncoded.slice(1).join(", ") ||
    String(values.other_reasons || "").trim();

  return {
    clientName,
    primaryReason,
    otherReasons,
  };
}
