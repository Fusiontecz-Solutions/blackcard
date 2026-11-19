/** Normalized deal key for comparisons (e.g. "BA2898"). */
export function normalizeDealIdToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Deal codes embedded in upload notes / descriptions, e.g. [UPLOAD_UNMAPPED_IDENTIFIER:BA1020] */
export function extractDealTokensFromText(text: unknown): string[] {
  const s = String(text ?? "");
  const out: string[] = [];
  const reUnmapped = /\[UPLOAD_UNMAPPED_IDENTIFIER:\s*([A-Z0-9]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = reUnmapped.exec(s)) !== null) {
    const t = normalizeDealIdToken(m[1]);
    if (t) out.push(t);
  }
  const mDeal = s.match(/\[DEAL_ID:\s*([^\]]+)\]/i);
  if (mDeal?.[1]) {
    const t = normalizeDealIdToken(mDeal[1]);
    if (t) out.push(t);
  }
  return out;
}

export function collectDealTokensFromCollectionPaymentRow(row: Record<string, unknown>): string[] {
  const tokens = new Set<string>();
  for (const f of [row.dealId, row.dealID, row.deal_id, row.DealID, row.DealId]) {
    const t = normalizeDealIdToken(f);
    if (t) tokens.add(t);
  }
  const application = row.application;
  if (application && typeof application === "object") {
    const t = normalizeDealIdToken((application as Record<string, unknown>).dealId);
    if (t) tokens.add(t);
  }
  for (const text of [row.notes, row.note, row.description]) {
    for (const t of extractDealTokensFromText(text)) tokens.add(t);
  }
  return [...tokens];
}

/**
 * When `Application.dealId` is set, exclude collection rows that identify a different deal.
 * Rows with no deal hints remain included (legacy rows for this application).
 * Mirrors backend `paymentBelongsToApplicationDeal` (see `collectionPaymentFinancials.ts`).
 */
export function paymentBelongsToApplicationDeal(
  row: { dealId?: string | null; notes?: string | null },
  applicationDealId: string | null | undefined,
): boolean {
  const appTok = normalizeDealIdToken(applicationDealId);
  if (!appTok) return true;
  const rowToks = collectDealTokensFromCollectionPaymentRow(row as Record<string, unknown>);
  if (rowToks.length === 0) return true;
  return rowToks.some((t) => t === appTok);
}

export function filterCollectionPaymentsForApplicationDeal<
  T extends { dealId?: string | null; notes?: string | null },
>(payments: T[], applicationDealId: string | null | undefined): T[] {
  return payments.filter((p) => paymentBelongsToApplicationDeal(p, applicationDealId));
}
