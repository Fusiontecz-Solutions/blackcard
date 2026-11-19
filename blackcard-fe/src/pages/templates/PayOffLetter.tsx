import { formatCityStateZip } from "./payoffWireInstructionsShared";
import type { TemplateComponentProps, TemplateVariable } from "./types";
import { pick } from "./types";
import { APP_COMPANY_LEGAL_NAME } from "@/constants/appBranding";

/** Default payoff info-table note; users can edit it in Data Personalization. */
export const DEFAULT_PAYOFF_NOTE =
  "Payoff amount is valid through the above date";

/** Default payoff letter greeting; users can edit it in Data Personalization. */
export const DEFAULT_PAYOFF_SALUTATION = "To Whom It May Concern";

/** Merge fields surfaced by this template (preserves UI order). */
export const PAY_OFF_LETTER_VARIABLES: TemplateVariable[] = [
  { key: "deal_id", label: "Deal ID", placeholder: "BCF12345" },
  {
    key: "letter_date",
    label: "Letter Date",
    placeholder: "May 20, 2024",
    defaultValue: "May 20, 2024",
  },
  {
    key: "recipient_salutation",
    label: "Recipient",
    placeholder: DEFAULT_PAYOFF_SALUTATION,
    defaultValue: DEFAULT_PAYOFF_SALUTATION,
  },
  {
    key: "account_name",
    label: "Merchant Name",
    placeholder: "Acme LLC",
    defaultValue: "Acme LLC",
  },
  {
    key: "payoff_amount",
    label: "Amount",
    placeholder: "$5,678.90",
    defaultValue: "$5,678.90",
  },
  {
    key: "note",
    label: "Note",
    placeholder: DEFAULT_PAYOFF_NOTE,
    defaultValue: DEFAULT_PAYOFF_NOTE,
  },
  {
    key: "good_through_date",
    label: "Valid Till",
    placeholder: "May 27, 2024",
    defaultValue: "May 27, 2024",
  },
  {
    key: "lender_name",
    label: "Lender Name",
    placeholder: APP_COMPANY_LEGAL_NAME,
    defaultValue: APP_COMPANY_LEGAL_NAME,
  },
  {
    key: "payment_company_name",
    label: "Bank Name",
    placeholder: "Optimum Bank",
    defaultValue: "Optimum Bank",
  },
  {
    key: "payment_address_line1",
    label: "Payment Address Line 1",
    placeholder: "Street address",
  },
  {
    key: "payment_address_line2",
    label: "Payment Address Line 2",
    placeholder: "City ST ZIP",
  },
  {
    key: "payment_routing_number",
    label: "Routing Number",
    placeholder: "Routing number",
  },
  {
    key: "payment_account_number",
    label: "Payment Account Number",
    placeholder: "Account number",
  },
  {
    key: "sender_name",
    label: "Sender Name",
    placeholder: "Admin Team",
    defaultValue: "Admin Team",
  },
];

/** Fixed line under the sender name in payoff letter preview + email (not a merge field). */
export const PAY_OFF_LETTER_SIGNATURE_TITLE = "Account Specialist";

const v = PAY_OFF_LETTER_VARIABLES.reduce<Record<string, TemplateVariable>>(
  (acc, variable) => {
    acc[variable.key] = variable;
    return acc;
  },
  {},
);

export default function PayOffLetter({ values }: TemplateComponentProps) {
  const letterDate = pick(values, v.letter_date);
  const accountName = pick(values, v.account_name);
  const payoffAmount = pick(values, v.payoff_amount);
  const goodThroughDate = pick(values, v.good_through_date);
  const lenderName =
    typeof values.lender_name === "string" && values.lender_name.trim()
      ? values.lender_name.trim()
      : APP_COMPANY_LEGAL_NAME;
  const paymentCompany = pick(values, v.payment_company_name);
  const paymentAddress1 = pick(values, v.payment_address_line1);
  const paymentAddress2Raw =
    typeof values.payment_address_line2 === "string"
      ? values.payment_address_line2.trim()
      : "";
  const paymentAddress2 =
    paymentAddress2Raw && paymentAddress2Raw.toUpperCase() !== "NA"
      ? paymentAddress2Raw
      : "";
  const paymentRoutingNumber = pick(values, v.payment_routing_number);
  const paymentAccountNumber = pick(values, v.payment_account_number);
  const senderName = pick(values, v.sender_name);

  return (
    <table
      role="presentation"
      cellPadding={0}
      cellSpacing={0}
      style={{
        borderCollapse: "collapse",
        width: "100%",
        fontFamily: "Arial, Helvetica, sans-serif",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: "0 0 20px" }}>
            <h1
              style={{
                margin: "0 0 30px",
                textAlign: "center",
                fontFamily: "Georgia, 'Times New Roman', Times, serif",
                fontSize: 32,
                fontWeight: "bold",
                color: "#002147",
                textTransform: "uppercase",
              }}
            >
              Payoff Letter
            </h1>
            <p style={{ margin: "0 0 16px", color: "#6b7280" }}>{letterDate}</p>
            <p style={{ margin: "0 0 20px", fontWeight: "bold", color: "#1f2937" }}>
              Re: {accountName}
            </p>
            <p style={{ margin: "0 0 24px" }}>
              We are pleased to provide the payoff information for your account.
              Please use the details below to remit the payoff amount. Payments
              received after the good through date may require a new payoff.
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Account Name:</strong> {accountName}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Payoff Amount:</strong> {payoffAmount}
            </p>
            <p style={{ margin: "0 0 8px" }}>
              <strong>Good Through Date:</strong> {goodThroughDate}
            </p>
            <p style={{ margin: "0 0 24px" }}>
              Please remit the payoff amount to the address below. Ensure payments
              are received by the good through date to avoid additional interest
              charges.
            </p>
            {/* Wire Information: same table as the payoff email. */}
            <div style={{ fontFamily: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif", display: "flex", alignItems: "center", gap: 12, margin: "0 0 10px" }}>
              <span style={{ fontSize: "11pt", fontWeight: 700, letterSpacing: 2, color: "#1f5f99", whiteSpace: "nowrap" }}>
                WIRE INFORMATION
              </span>
              <span style={{ flex: 1, borderBottom: "1px solid #e5e9ef" }} />
            </div>
            <table
              role="presentation"
              cellPadding={0}
              cellSpacing={0}
              style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e5e9ef", margin: "0 0 24px", fontSize: "11pt", fontFamily: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif" }}
            >
              <tbody>
                {[
                  { label: "Bank", value: paymentCompany, sub: "2929 E. Commercial Blvd., Ft. Lauderdale, FL, 33308", numLabel: "Routing", num: paymentRoutingNumber },
                  { label: "Beneficiary", value: lenderName, sub: [paymentAddress1, formatCityStateZip(paymentAddress2)].filter(Boolean).join(", "), numLabel: "Account", num: paymentAccountNumber },
                ].map((row) => (
                  <tr key={row.label}>
                    <td style={{ width: "18%", padding: "12px 14px", fontWeight: 700, color: "#52637a", background: "#f6f8fa", verticalAlign: "top", borderBottom: "1px solid #e5e9ef" }}>{row.label}</td>
                    <td style={{ width: "34%", padding: "12px 14px", color: "#09090b", verticalAlign: "top", borderBottom: "1px solid #e5e9ef" }}>
                      {row.value}
                      <span style={{ display: "block", paddingTop: 3, fontSize: "11pt", color: "#71717a" }}>{row.sub}</span>
                    </td>
                    <td style={{ width: "16%", padding: "12px 14px", fontWeight: 700, color: "#52637a", background: "#f6f8fa", verticalAlign: "top", borderBottom: "1px solid #e5e9ef" }}>{row.numLabel}</td>
                    <td style={{ padding: "12px 14px", color: "#09090b", verticalAlign: "top", borderBottom: "1px solid #e5e9ef" }}>{row.num}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: "0 0 20px", fontSize: 14, color: "#718096", fontStyle: "italic" }}>
              Sincerely,
            </p>
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: "Georgia, 'Times New Roman', Times, serif",
                fontSize: 24,
                fontStyle: "italic",
                fontWeight: "normal",
                color: "#002147",
              }}
            >
              {senderName}
            </p>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
              {PAY_OFF_LETTER_SIGNATURE_TITLE}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
