import {
  pick,
  formatLetterDealId,
  type TemplateComponentProps,
  type TemplateVariable,
} from "./types";

/**
 * Zero-balance confirmation letter merge fields. The sent email HTML is rendered
 * by `zeroBalanceLetterEmailHtml.ts`. Keep this list in sync with fields the
 * letter HTML actually renders. Bank / payment-address fields are intentionally
 * omitted — ZBL personalization is Recipient only.
 */
export const ZERO_BALANCE_LETTER_VARIABLES: TemplateVariable[] = [
  { key: "deal_id", label: "Deal ID", placeholder: "BCF12345" },
  {
    key: "letter_date",
    label: "Letter Date",
    placeholder: "05/20/2024",
    defaultValue: "05/20/2024",
  },
  {
    key: "account_name",
    label: "Merchant Name",
    placeholder: "Acme LLC",
    defaultValue: "Acme LLC",
  },
  {
    key: "salutation_name",
    label: "Salutation Name",
    placeholder: "John Doe",
    defaultValue: "John Doe",
  },
  {
    key: "date_of_funding",
    label: "Date of Funding",
    placeholder: "05/20/2024",
    defaultValue: "05/20/2024",
  },
  {
    key: "account_status",
    label: "Status",
    placeholder: "Zero Balance",
    defaultValue: "Zero Balance",
  },
  {
    key: "sender_name",
    label: "Sender Name",
    placeholder: "Admin Team",
    defaultValue: "Admin Team",
  },
];

/** Fixed line under the sender name in zero balance letter preview + email. */
export const ZERO_BALANCE_LETTER_SIGNATURE_TITLE = "Account Specialist";

const v = ZERO_BALANCE_LETTER_VARIABLES.reduce<
  Record<string, TemplateVariable>
>((acc, variable) => {
  acc[variable.key] = variable;
  return acc;
}, {});

export default function ZeroBalanceLetter({ values }: TemplateComponentProps) {
  const letterDate = pick(values, v.letter_date);
  const accountName = pick(values, v.account_name);
  const dealId = formatLetterDealId(pick(values, v.deal_id));
  const salutationName = pick(values, v.salutation_name);
  const dateOfFunding = pick(values, v.date_of_funding);
  const accountStatus = pick(values, v.account_status);
  const senderName = pick(values, v.sender_name);

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{
        borderCollapse: "collapse",
        width: "100%",
        maxWidth: 640,
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: 14,
        lineHeight: 1.55,
        color: "#2d3748",
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: "0 0 20px" }}>
            <p style={{ margin: "0 0 16px", color: "#718096" }}>{letterDate}</p>
            <p style={{ margin: "0 0 16px", fontWeight: "bold", color: "#132238" }}>
              Re: {accountName}
            </p>
            <p style={{ margin: "0 0 20px", fontWeight: "bold", color: "#132238" }}>
              Subject : Zero Balance Letter
            </p>
            <p style={{ margin: "0 0 16px" }}>Dear {salutationName},</p>
            <p style={{ margin: "0 0 24px", color: "#4a5568", textAlign: "justify" }}>
              This letter is to confirm that your account with us has a zero balance
              as of the date below. At this time, there is no amount due on your
              account.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Deal ID:</strong> {dealId}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Merchant Name:</strong> {accountName}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Date of Funding:</strong> {dateOfFunding}
            </p>
            <p style={{ margin: "0 0 24px" }}>
              <strong>Status:</strong> {accountStatus}
            </p>
            <p style={{ margin: "0 0 4px" }}>Sincerely,</p>
            <p style={{ margin: "0 0 4px", fontStyle: "italic" }}>{senderName}</p>
            <p style={{ margin: 0, color: "#718096" }}>
              {ZERO_BALANCE_LETTER_SIGNATURE_TITLE}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
