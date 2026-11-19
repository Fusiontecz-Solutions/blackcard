import type { Application } from "@/types/applicationTypes";

/** Fallback when route has no id — same as deal pipeline dev default. */
export const DEFAULT_APPLICATION_UUID =
  "cfa6df58-c313-4e98-a679-ce098025c3b4";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isApplicationUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export type PaymentDealRouteRef =
  | { kind: "uuid"; value: string }
  | { kind: "numericApplicationId"; value: string }
  | { kind: "dealId"; value: string }
  | { kind: "empty" };

/** Decode `/payments/:paymentDealId` — Prisma UUID, numeric applicationId, or dealId string. */
export function parsePaymentDealRouteParam(
  paymentDealId: string | undefined,
): PaymentDealRouteRef {
  const raw = paymentDealId?.trim();
  if (!raw) return { kind: "empty" };
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const value = decoded.trim();
  if (!value) return { kind: "empty" };
  if (isApplicationUuid(value)) return { kind: "uuid", value };
  if (/^\d+$/.test(value)) return { kind: "numericApplicationId", value };
  return { kind: "dealId", value };
}

/** @deprecated Use `parsePaymentDealRouteParam` — only returns UUID when the route is a UUID. */
export function resolvePaymentDealApplicationId(
  paymentDealId: string | undefined,
): string {
  const ref = parsePaymentDealRouteParam(paymentDealId);
  if (ref.kind === "uuid") return ref.value;
  if (ref.kind === "empty") return DEFAULT_APPLICATION_UUID;
  return "";
}

export function applicationPrimaryKey(
  app: Application | null | undefined,
): string | null {
  if (!app) return null;
  const a = app as Application & { id?: string };
  const v = a.id ?? a._id;
  if (v == null || String(v).length === 0) return null;
  return String(v);
}

/** Prisma `Application.id` (UUID) — excludes numeric display ids mistakenly stored on `id`. */
export function resolvePrismaApplicationUuid(
  app:
    | {
        id?: unknown;
        _id?: unknown;
      }
    | null
    | undefined,
): string {
  const raw = app?.id ?? app?._id;
  const s = raw != null ? String(raw).trim() : "";
  return isApplicationUuid(s) ? s : "";
}

/** CRM display `applicationId` (e.g. 245) when `id` is not a UUID. */
export function resolveNumericApplicationId(
  app:
    | {
        id?: unknown;
        _id?: unknown;
        applicationId?: unknown;
      }
    | null
    | undefined,
): string {
  const display = app?.applicationId;
  if (display != null && String(display).trim() !== "") {
    return String(display).trim();
  }
  const raw = app?.id ?? app?._id;
  const s = raw != null ? String(raw).trim() : "";
  return /^\d+$/.test(s) ? s : "";
}

export function resolveApplicationDealId(
  app:
    | {
        dealId?: unknown;
        dealID?: unknown;
        deal_id?: unknown;
      }
    | null
    | undefined,
): string {
  const raw =
    app?.dealId ?? (app as { dealID?: unknown })?.dealID ?? app?.deal_id;
  return raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
}

/** Query args for GET /collection-payments — UUID and/or dealId only (never numeric as UUID). */
export function buildCollectionPaymentsQuery(params: {
  prismaApplicationUuid: string;
  numericApplicationId: string;
  dealId: string;
}): { applicationId: string; dealId?: string } {
  const prismaId = params.prismaApplicationUuid.trim();
  const dealId = params.dealId.trim();
  const numericId = params.numericApplicationId.trim();
  if (prismaId) {
    return { applicationId: prismaId, dealId: dealId || undefined };
  }
  if (dealId) {
    return { applicationId: "", dealId };
  }
  if (numericId) {
    return { applicationId: numericId, dealId: undefined };
  }
  return { applicationId: "", dealId: undefined };
}

export function collectionPaymentsCacheKey(params: {
  prismaApplicationUuid: string;
  numericApplicationId: string;
  dealId: string;
}): string {
  return (
    params.dealId.trim() ||
    params.prismaApplicationUuid.trim() ||
    params.numericApplicationId.trim()
  );
}

/** True when loaded application detail matches the payment route segment. */
export function applicationMatchesPaymentRoute(
  app: Application | null | undefined,
  routeRef: PaymentDealRouteRef,
): boolean {
  if (!app || routeRef.kind === "empty") return false;
  if (routeRef.kind === "uuid") {
    return resolvePrismaApplicationUuid(app) === routeRef.value;
  }
  if (routeRef.kind === "numericApplicationId") {
    return resolveNumericApplicationId(app) === routeRef.value;
  }
  const deal = resolveApplicationDealId(app).toLowerCase();
  return deal.length > 0 && deal === routeRef.value.toLowerCase();
}
