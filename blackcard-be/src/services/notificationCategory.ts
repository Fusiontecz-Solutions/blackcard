/**
 * Notification taxonomy helpers (MCA CRM).
 *
 * `category` is the system-assigned MCA stage a notification belongs to. It is
 * derived from the notification `type` (and refined by the related application's
 * queue where useful) so the UI can group/filter notifications by deal stage.
 *
 * This is the single source of truth on the backend: it is used both when
 * creating notifications (to store `category`) and at read time as a fallback
 * for legacy rows whose stored category is still the default.
 *
 * UI surfaces a leading "All" filter (no category constraint) ahead of these.
 */

export const NOTIFICATION_CATEGORIES = [
    'approvals',
    'contracts',
    'funding',
    'collections',
    'others',
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

const TYPE_TO_CATEGORY: Record<string, NotificationCategory> = {
    // Approvals — the application / underwriting / stip pipeline up to a decision.
    application_update: 'approvals',
    application_approved: 'approvals',
    application_rejected: 'approvals',
    application_created: 'approvals',
    new_application: 'approvals',
    document_request: 'approvals',
    document_received: 'approvals',
    attachment: 'approvals',
    // Contracts — generation + e-signature.
    contract: 'contracts',
    contract_signing: 'contracts',
    contract_signing_status: 'contracts',
    // Collections — merchant repayments / ACH / bank movements.
    ach_authorization: 'collections',
    balance_transfer: 'collections',
    payment: 'collections',
    collection: 'collections',
    // Others — ISO commissions, syndication, compliance, misc.
    commission_request: 'others',
    commission_request_update: 'others',
    commission_request_delete: 'others',
    syndication: 'others',
    syndicator: 'others',
    compliance: 'others',
};

/** Map a notification `type` (and optional related application) to an MCA category. */
export function deriveCategory(
    type: string | null | undefined,
    application?: { currentQueue?: string | null; currentState?: string | null } | null,
): NotificationCategory {
    const t = String(type ?? '').trim().toLowerCase();
    let category: NotificationCategory | undefined = TYPE_TO_CATEGORY[t];

    // Heuristic fallbacks for free-form types not in the table.
    if (!category) {
        if (t.includes('contract')) category = 'contracts';
        else if (t.includes('fund') || t.includes('disburs')) category = 'funding';
        else if (
            t.includes('payment') ||
            t.includes('ach') ||
            t.includes('collection') ||
            t.includes('repayment')
        )
            category = 'collections';
        else if (
            t.includes('application') ||
            t.includes('underwrit') ||
            t.includes('approv') ||
            t.includes('document') ||
            t.includes('stip') ||
            t.includes('doc')
        )
            category = 'approvals';
        else category = 'others';
    }

    // Refine application-linked notifications by the deal's current queue.
    const queue = String(application?.currentQueue ?? '').trim().toLowerCase();
    if (queue) {
        if (queue.includes('fund') || queue.includes('disburs')) {
            // Funding Call / Funded / Disbursement → funding stage takes precedence.
            if (category === 'approvals' || category === 'others') category = 'funding';
        } else if (queue.includes('contract')) {
            if (category === 'approvals') category = 'contracts';
        }
    }

    return category;
}

/**
 * Best-effort deep link the panel's "Open" action navigates to. Prefers the
 * numeric business application id (what the FE routes on); falls back to the uuid.
 */
export function deriveActionUrl(args: {
    category?: NotificationCategory;
    type?: string | null;
    applicationNumber?: number | string | null;
    applicationUuid?: string | null;
}): string | null {
    const id = args.applicationNumber ?? args.applicationUuid;
    if (!id) return null;
    const base = `/application-details/${id}`;
    const t = String(args.type ?? '').toLowerCase();
    // Stip/document notifications deep-link straight to the documents tab.
    if (t.includes('document')) return `${base}/documents`;
    return base;
}

/** Stored triage defaults for notification creates (spread into Prisma `data`). */
export function notificationTriageDefaults(
    type: string,
    application?: { currentQueue?: string | null; currentState?: string | null } | null,
): Record<string, string> {
    return {
        category: deriveCategory(type, application),
        bucket: 'inbox',
        importance: 'normal',
    };
}
