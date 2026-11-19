import type { TemplateVariable } from "./types";
import { APP_COMPANY_LEGAL_NAME } from "@/constants/appBranding";
import { DEFAULT_PAYOFF_NOTE } from "./PayOffLetter";

/**
 * Merge fields for the Payoff Wire Instructions letter. The Letters page uses
 * the same Recipient / Lender / Bank personalization keys as the Payoff letter;
 * leftover wire tokens (`merchant_legal_name`, `routing_number`, …) are filled
 * by aliasing those keys.
 *
 * Kept in its own module so `payoffWireInstructionsEmailHtml.ts` and the preview
 * component can both read it without an import cycle.
 */
export const PAYOFF_WIRE_INSTRUCTIONS_VARIABLES: TemplateVariable[] = [
  { key: "deal_id", label: "Deal ID", placeholder: "BCF12345" },
  { key: "letter_date", label: "Letter Date", placeholder: "05/20/2024" },
  {
    key: "account_name",
    label: "Merchant Name",
    placeholder: "Acme LLC",
  },
  { key: "payoff_amount", label: "Amount", placeholder: "$5,678.90" },
  {
    key: "note",
    label: "Note",
    placeholder: DEFAULT_PAYOFF_NOTE,
    defaultValue: DEFAULT_PAYOFF_NOTE,
  },
  {
    key: "good_through_date",
    label: "Valid Till",
    placeholder: "05/27/2024",
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
    label: "Account Number",
    placeholder: "Account number",
  },
  {
    key: "sender_name",
    label: "Sender Name",
    placeholder: "Admin Team",
    defaultValue: "Admin Team",
  },
];

/** "Richmond VA 23294" / "Richmond, VA 23294" -> "Richmond, VA, 23294" (wire table address). */
export function formatCityStateZip(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/,?\s+([A-Za-z]{2}),?\s+(\d{5}(?:-\d{4})?)$/, ", $1, $2");
}
