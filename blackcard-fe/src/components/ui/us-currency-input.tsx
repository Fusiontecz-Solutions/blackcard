import { forwardRef, type ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { cn, formatNumberUSForInput } from "@/lib/utils";

export type UsCurrencyInputProps = Omit<
  ComponentProps<typeof Input>,
  "onChange" | "value" | "type"
> & {
  value: string;
  onChange: (next: string) => void;
};

/** Normalize a stored amount for display in `UsCurrencyInput` (no leading `$`). */
export function toUsCurrencyInputValue(value: unknown): string {
  return formatNumberUSForInput(String(value ?? "").replace(/^\$\s*/, ""));
}

/**
 * Detect dollar amount fields in edit dialogs by id / label.
 * Excludes percents, counts, calendar days, payee names, and identity numbers.
 */
export function isUsCurrencyEditField(id: string, label?: string): boolean {
  const labelNorm = String(label ?? "").trim().toLowerCase();
  const hay = `${id} ${label ?? ""}`
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    /percent|percentage|\bapr\b|_apr_|zip|phone|routing|account_number|tax_id|\bein\b|ssn|date|count|frequency|\bterm\b|factor_rate|buy_rate|number_of_transaction|no\._of_transaction|installment_?day|previous_financing|directly_to/.test(
      hay,
    )
  ) {
    return false;
  }
  // ACH Rate / amount is a dollar fee, not a factor rate.
  if (
    labelNorm === "rate" ||
    labelNorm.startsWith("rate /") ||
    labelNorm.startsWith("rate / amount")
  ) {
    return true;
  }
  return /amount|fee|price|payback|purchase|remittance|funded|financing|payment|cost|charge|disburs|receivable|recipient_funds|net_to_merchant|funding_provided|remaining_rtr|rtr_balance|_rtr_|transaction_fee/.test(
    hay,
  );
}

/** US-formatted currency field: `$` prefix, comma thousands, optional decimals while typing. */
export const UsCurrencyInput = forwardRef<HTMLInputElement, UsCurrencyInputProps>(
  function UsCurrencyInput(
    { value, onChange, className, placeholder = "e.g. 250,000.00", ...rest },
    ref,
  ) {
    return (
      <div className="relative min-w-0">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
          aria-hidden
        >
          $
        </span>
        <Input
          {...rest}
          ref={ref}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={toUsCurrencyInputValue(value)}
          onChange={(e) => onChange(formatNumberUSForInput(e.target.value))}
          placeholder={placeholder}
          className={cn("pl-7", className)}
        />
      </div>
    );
  },
);
