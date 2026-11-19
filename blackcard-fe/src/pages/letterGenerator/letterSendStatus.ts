import type { PaymentMailLogEntry, PaymentMailLogStatus } from "@/pages/payment/paymentMailLogStorage";

export function resolveLetterSendStatus(
  row: PaymentMailLogEntry,
): PaymentMailLogStatus {
  const delivery = row.delivery;
  if (delivery) {
    if (delivery.clickedAt) return "clicked";
    if (delivery.openedAt || (delivery.openCount ?? 0) > 0) return "opened";
    if (delivery.deliveredAt) return "delivered";
    if (delivery.sentAt) return "sent";
    const deliveryStatus = delivery.status?.trim().toLowerCase();
    if (
      deliveryStatus &&
      [
        "queued",
        "sent",
        "failed",
        "delivered",
        "opened",
        "clicked",
        "deferred",
        "bounced",
        "dropped",
        "spam",
        "unsubscribed",
      ].includes(deliveryStatus)
    ) {
      return deliveryStatus as PaymentMailLogStatus;
    }
  }
  return row.status;
}

export function letterSendStatusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "sent":
    case "processed":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "delivered":
      return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "opened":
    case "open":
      return "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "clicked":
    case "click":
      return "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300";
    case "failed":
    case "bounced":
    case "bounce":
    case "dropped":
      return "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300";
    case "spam":
      return "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300";
    case "deferred":
    case "queued":
      return "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300";
    default:
      return "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300";
  }
}

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  processed: "Sent",
  delivered: "Delivered",
  opened: "Opened",
  open: "Opened",
  clicked: "Clicked",
  click: "Clicked",
  deferred: "Deferred",
  queued: "Queued",
  failed: "Failed",
  bounced: "Bounced",
  bounce: "Bounced",
  dropped: "Dropped",
  spam: "Spam",
  unsubscribed: "Unsubscribed",
};

export function letterSendStatusLabel(status: string): string {
  return STATUS_LABELS[status.toLowerCase()] ?? status;
}

export function formatLetterSendWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Letter generator list filters (client-side, based on latest mail log). */
export type LetterSendStatusFilterValue = "all" | "sent" | "delivered" | "opened";
export type LetterKindFilterValue = "all" | "payoff" | "zbl";
export type LetterFunderFilterValue = "all" | "primary" | "other";

export const LETTER_SEND_STATUS_FILTER_OPTIONS: {
  value: LetterSendStatusFilterValue;
  label: string;
}[] = [
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "opened", label: "Open" },
];

export const LETTER_KIND_FILTER_OPTIONS: {
  value: LetterKindFilterValue;
  label: string;
}[] = [
  { value: "payoff", label: "Payoff letter" },
  { value: "zbl", label: "Zero balance Letter" },
];

export const LETTER_FUNDER_FILTER_OPTIONS: {
  value: LetterFunderFilterValue;
  label: string;
}[] = [
  { value: "primary", label: "Primary" },
  { value: "other", label: "Other" },
];

export function letterSendStatusFilterLabel(
  value: LetterSendStatusFilterValue,
): string {
  if (value === "all") return "Send status";
  return (
    LETTER_SEND_STATUS_FILTER_OPTIONS.find((o) => o.value === value)?.label ??
    "Send status"
  );
}

export function letterKindFilterLabel(value: LetterKindFilterValue): string {
  if (value === "all") return "Select";
  return (
    LETTER_KIND_FILTER_OPTIONS.find((o) => o.value === value)?.label ??
    "Select"
  );
}

export function letterFunderFilterLabel(value: LetterFunderFilterValue): string {
  if (value === "all") return "Funder";
  return (
    LETTER_FUNDER_FILTER_OPTIONS.find((o) => o.value === value)?.label ??
    "Funder"
  );
}

export function classifyLetterKind(
  templateName: string,
): "payoff" | "zbl" | "other" {
  const name = templateName.trim().toLowerCase();
  if (name.includes("zero balance") || name.includes("zbl")) return "zbl";
  if (name.includes("payoff") || name.includes("pay off")) return "payoff";
  return "other";
}

export function classifyLetterFunder(
  templateName: string,
): "primary" | "other" {
  const name = templateName.trim().toLowerCase();
  if (name.includes("alliance") || name.includes("other")) return "other";
  return "primary";
}

/** Normalize resolved delivery status into the three letter-generator filter buckets. */
export function matchLetterSendStatusFilter(
  status: string,
  filter: LetterSendStatusFilterValue,
): boolean {
  if (filter === "all") return true;
  const normalized = status.trim().toLowerCase();
  if (filter === "sent") {
    return normalized === "sent" || normalized === "processed";
  }
  if (filter === "delivered") {
    return normalized === "delivered";
  }
  if (filter === "opened") {
    return (
      normalized === "opened" ||
      normalized === "open" ||
      normalized === "clicked" ||
      normalized === "click"
    );
  }
  return false;
}
