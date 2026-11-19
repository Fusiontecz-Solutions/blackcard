import type { TemplateCategory } from "./paymentTemplateApi";
import { axiosGet, axiosPost } from "@/redux/axios";

const STORAGE_KEY = "inhouse-payment-mail-logs-v1";

export type PaymentMailLogStatus =
  | "queued"
  | "sent"
  | "failed"
  | "delivered"
  | "opened"
  | "clicked"
  | "deferred"
  | "bounced"
  | "dropped"
  | "spam"
  | "unsubscribed";

export type PaymentMailLogEntry = {
  id: string;
  at: string;
  dealKey: string;
  applicationId: string | null;
  templateName: string;
  category: TemplateCategory;
  recipient: string;
  subject: string;
  body?: string;
  status: PaymentMailLogStatus;
  attachments?: string[];
  delivery?: {
    status?: string;
    sentAt?: string;
    deliveredAt?: string;
    openedAt?: string;
    clickedAt?: string;
    bouncedAt?: string;
    openCount?: number;
    clickCount?: number;
    bounceReason?: string;
    lastEvent?: string;
    lastEventAt?: string;
    lastClickedUrl?: string;
  };
};

function safeParse(raw: string | null): PaymentMailLogEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (row): row is PaymentMailLogEntry =>
        row &&
        typeof row === "object" &&
        typeof (row as PaymentMailLogEntry).id === "string" &&
        typeof (row as PaymentMailLogEntry).at === "string"
    );
  } catch {
    return [];
  }
}

export function normalizePaymentMailLogRow(row: unknown): PaymentMailLogEntry | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  const at = typeof o.at === "string" ? o.at : null;
  const dealKey = typeof o.dealKey === "string" ? o.dealKey : "";
  const templateName = typeof o.templateName === "string" ? o.templateName : "";
  const category = o.category as TemplateCategory;
  const recipient = typeof o.recipient === "string" ? o.recipient : "";
  const subject = typeof o.subject === "string" ? o.subject : "";
  const body = typeof o.body === "string" ? o.body : undefined;
  const status = o.status as PaymentMailLogStatus;
  const applicationId =
    typeof o.applicationId === "string" ? o.applicationId : null;
  const attachments = Array.isArray(o.attachments)
    ? o.attachments.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  const delivery =
    o.delivery && typeof o.delivery === "object"
      ? (o.delivery as PaymentMailLogEntry["delivery"])
      : undefined;
  if (!id || !at) return null;
  if (!["contract", "email", "letter"].includes(String(category))) return null;
  if (
    ![
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
    ].includes(String(status))
  ) {
    return null;
  }
  return {
    id,
    at,
    dealKey,
    applicationId,
    templateName,
    category,
    recipient,
    subject,
    body,
    status,
    attachments,
    delivery,
  };
}

export function mergePaymentMailLogs(entries: PaymentMailLogEntry[]): void {
  const prev = safeParse(localStorage.getItem(STORAGE_KEY));
  const merged = new Map(prev.map((row) => [row.id, row]));
  for (const row of entries) merged.set(row.id, row);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(
      [...merged.values()].sort(
        (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
      )
    )
  );
}

export function getPaymentMailLogs(): PaymentMailLogEntry[] {
  return safeParse(localStorage.getItem(STORAGE_KEY)).sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
  );
}

export async function fetchPaymentMailLogsForApplication(
  applicationId: string
): Promise<PaymentMailLogEntry[]> {
  const response = await axiosGet(
    `/applications/${applicationId}/payment-mail-logs`
  );
  const payload = response?.data?.data ?? response?.data ?? [];
  if (!Array.isArray(payload)) return [];
  return payload
    .map((row) => normalizePaymentMailLogRow(row))
    .filter((e): e is PaymentMailLogEntry => e != null)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function savePaymentMailLogEntry(entry: PaymentMailLogEntry): void {
  const prev = safeParse(localStorage.getItem(STORAGE_KEY));
  const withoutDup = prev.filter((row) => row.id !== entry.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...withoutDup]));
  window.dispatchEvent(new Event("payment-mail-log-updated"));
}

export async function appendPaymentMailLog(
  partial: Omit<PaymentMailLogEntry, "id" | "at">,
  opts?: { persistApplicationId?: string | null }
): Promise<PaymentMailLogEntry> {
  let entry: PaymentMailLogEntry = {
    ...partial,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    at: new Date().toISOString(),
  };

  const appId = opts?.persistApplicationId?.trim();
  if (appId) {
    try {
      const response = await axiosPost(
        `/applications/${appId}/payment-mail-logs`,
        {
          dealKey: partial.dealKey,
          templateName: partial.templateName,
          category: partial.category,
          recipient: partial.recipient,
          subject: partial.subject,
          body: partial.body,
          status: partial.status,
        }
      );
      const normalized = normalizePaymentMailLogRow(response?.data?.data);
      if (normalized) entry = normalized;
    } catch {
      /* keep local-only entry */
    }
  }

  const prev = safeParse(localStorage.getItem(STORAGE_KEY));
  localStorage.setItem(STORAGE_KEY, JSON.stringify([entry, ...prev]));
  window.dispatchEvent(new Event("payment-mail-log-updated"));
  return entry;
}
