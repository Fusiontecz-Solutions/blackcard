/**
 * The branded letter catalog shared by the Letters tab and the Templates tab.
 *
 * Payoff, zero-balance and wire letters are rendered from the frontend HTML
 * templates rather than from a stored body, so both tabs must agree on which
 * entries exist and which stored rows they supersede. Keeping that list here
 * stops the Templates tab from listing a stale database row that Letters would
 * never send.
 */
import {
  PAY_OFF_LETTER_VARIABLES,
} from "@/pages/templates/PayOffLetter";
import {
  ZERO_BALANCE_LETTER_VARIABLES,
} from "@/pages/templates/ZeroBalanceLetter";
import { PAYOFF_WIRE_INSTRUCTIONS_VARIABLES } from "@/pages/templates/payoffWireInstructionsShared";
import type { TemplateItem } from "./paymentTemplateApi";

export function isZeroBalanceLetterName(templateName: string): boolean {
  const n = templateName.trim().toLowerCase();
  return (
    n === "zero balance letter" ||
    n.includes("zero balance") ||
    n.includes("zbl") ||
    n.includes("zero-balance")
  );
}

export function isPayoffWireLetterName(templateName: string): boolean {
  const n = templateName.trim().toLowerCase();
  if (isZeroBalanceLetterName(n)) return false;
  return n.includes("wire");
}

export function isPayoffLetterName(templateName: string): boolean {
  const n = templateName.trim().toLowerCase();
  if (isZeroBalanceLetterName(n) || isPayoffWireLetterName(n)) return false;
  return n.includes("payoff") || n.includes("pay off");
}

export function isPayoffOrZeroBalanceLetter(templateName: string): boolean {
  return (
    isZeroBalanceLetterName(templateName) ||
    isPayoffLetterName(templateName) ||
    isPayoffWireLetterName(templateName)
  );
}

/** Stable catalog entries for the branded email HTML letters (preview + send). */
export const BRANDED_PAYOFF_LETTER_TEMPLATE: TemplateItem = {
  id: "branded:pay-off-letter",
  name: "Payoff Letter",
  category: "letter",
  variables: PAY_OFF_LETTER_VARIABLES.map((v) => v.key),
  body: "",
  status: "active",
};

export const BRANDED_ZERO_BALANCE_LETTER_TEMPLATE: TemplateItem = {
  id: "branded:zero-balance-letter",
  name: "Zero Balance Letter",
  category: "letter",
  variables: ZERO_BALANCE_LETTER_VARIABLES.map((v) => v.key),
  body: "",
  status: "active",
};

export const BRANDED_PAYOFF_WIRE_TEMPLATE: TemplateItem = {
  id: "branded:payoff-wire-instructions",
  name: "Payoff Wire Instructions",
  category: "letter",
  variables: PAYOFF_WIRE_INSTRUCTIONS_VARIABLES.map((v) => v.key),
  body: "",
  status: "active",
};

export const BRANDED_LETTER_TEMPLATES: TemplateItem[] = [
  BRANDED_PAYOFF_LETTER_TEMPLATE,
  BRANDED_ZERO_BALANCE_LETTER_TEMPLATE,
  BRANDED_PAYOFF_WIRE_TEMPLATE,
];

/** True for the code-rendered entries, which have no editable stored body. */
export function isBrandedLetterTemplateId(id: string): boolean {
  return id.startsWith("branded:");
}

/**
 * Replace legacy DB payoff / zero-balance rows with the branded HTML catalog
 * so Letters always shows and sends the new email layouts.
 */
export function withBrandedLetterTemplates(
  apiTemplates: TemplateItem[],
): TemplateItem[] {
  const withoutLegacyBranded = apiTemplates.filter(
    (t) => !(t.category === "letter" && isPayoffOrZeroBalanceLetter(t.name)),
  );
  return [...withoutLegacyBranded, ...BRANDED_LETTER_TEMPLATES];
}
