/** Human-facing deal identifier for syndicator UIs: prefer CRM `dealId`, else numeric `applicationId`. */
export function syndicatorDealIdDisplay(
  dealId: string | null | undefined,
  applicationId: number | null | undefined,
): string {
  if (dealId != null) {
    const s = String(dealId).trim();
    if (s !== '') return s;
  }
  if (applicationId != null && Number.isFinite(applicationId)) return String(applicationId);
  return '—';
}
