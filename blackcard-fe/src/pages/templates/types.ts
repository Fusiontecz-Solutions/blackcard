import type { ComponentType } from "react";

export type TemplateCategory = "contract" | "email" | "letter";

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  contract: "Contract",
  email: "Email",
  letter: "Letter",
};

/**
 * One merge field exposed by a template.
 * `key` is the snake_case identifier the renderer uses to pull a value out
 * of the `TemplateValues` record passed to the template component.
 */
export type TemplateVariable = {
  key: string;
  label: string;
  /** Optional placeholder used when the merge field is empty. */
  placeholder?: string;
  /** Optional default value used in the live preview / autofill. */
  defaultValue?: string;
};

/** Runtime merge-field values keyed by `TemplateVariable.key`. */
export type TemplateValues = Record<string, string>;

/** Props every template component receives. */
export type TemplateComponentProps = {
  values: TemplateValues;
};

export type TemplateDefinition = {
  /** Stable id used by Letters / Templates UI. */
  id: string;
  name: string;
  category: TemplateCategory;
  /** Optional short description shown in the Templates list. */
  description?: string;
  variables: TemplateVariable[];
  /** React component that renders the template using `values`. */
  Component?: ComponentType<TemplateComponentProps>;
  /**
   * Optional renderer returning the exact HTML string delivered to the
   * recipient (e.g. the outbound email markup). Preferred for previews so the
   * playground shows the real, email-client-safe output.
   */
  renderHtml?: (values: TemplateValues) => string;
};

/**
 * Helper used inside template components to fall back to the variable's
 * placeholder / label when no merge value has been supplied. Keeps the
 * preview readable instead of showing blank rows.
 */
export function pick(
  values: TemplateValues,
  variable: TemplateVariable,
): string {
  const raw = values[variable.key];
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  if (variable.placeholder) return variable.placeholder;
  return variable.label;
}

/** Funder deal-id prefix used on letters (matches Send Letters APPLICATION ID, e.g. BCF391). */
export const DEFAULT_LETTER_DEAL_ID_PREFIX = "BCF";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Letter Deal IDs use the funder application prefix (`BCF391`), never `App-` / `APP-`.
 * Bare numbers and leftover `APP-391` values are rewritten. Already-prefixed
 * codes (`BCF391`, `BCF-391`) are normalized to `{PREFIX}{digits}`.
 */
export function formatLetterDealId(
  raw: string,
  prefix: string | null | undefined = DEFAULT_LETTER_DEAL_ID_PREFIX,
): string {
  const t = String(raw ?? "").trim();
  if (!t) return t;
  const upper = t.toUpperCase();
  if (upper === "NA" || upper === "N/A") return t;

  const normalizedPrefix = (
    String(prefix ?? "").trim() || DEFAULT_LETTER_DEAL_ID_PREFIX
  ).replace(/-+$/, "");
  const prefixRe = new RegExp(`^${escapeRegExp(normalizedPrefix)}-?`, "i");

  let core = t.replace(/^#/, "");
  core = core.replace(/^APP-/i, "");
  core = core.replace(prefixRe, "");
  core = core.replace(/^-+/, "").trim();

  if (/^\d+$/.test(core)) return `${normalizedPrefix}${core}`;
  return t;
}

/** Display id for letters: imported `dealId` (BCF391) or prefixed `applicationId`. */
export function letterApplicationIdFromApp(
  app:
    | { dealId?: string | null; applicationId?: number | string | null }
    | null
    | undefined,
  prefix: string | null | undefined = DEFAULT_LETTER_DEAL_ID_PREFIX,
): string {
  const fromDealId = String(app?.dealId ?? "").trim();
  if (fromDealId) return formatLetterDealId(fromDealId, prefix);
  if (app?.applicationId != null && String(app.applicationId).trim() !== "") {
    return formatLetterDealId(String(app.applicationId), prefix);
  }
  return "";
}
