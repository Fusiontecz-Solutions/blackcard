export type CommissionRecipientType = 'iso' | 'underwriter';

export function getUnderwriterIdFromApplication(app: unknown): string | null {
    const r = app as Record<string, unknown>;
    const assigned = r?.assignedUnderwriter as Record<string, unknown> | undefined;
    const approved = r?.approvedByUnderwriter as Record<string, unknown> | undefined;
    const claimed = r?.claimedByUnderwriter as Record<string, unknown> | undefined;
    const raw =
        r?.assignedUnderwriterId ??
        assigned?.id ??
        assigned?._id ??
        r?.approvedByUnderwriterId ??
        approved?.id ??
        approved?._id ??
        r?.claimedByUnderwriterId ??
        claimed?.id ??
        claimed?._id;
    if (raw == null || String(raw).trim() === '') return null;
    return String(raw).trim();
}

export function getUnderwriterNameFromApplication(app: unknown): string {
    const r = app as Record<string, unknown>;
    const pickName = (u: Record<string, unknown> | undefined) => {
        if (!u) return '';
        const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
        return full || String(u.email ?? '').trim();
    };
    const assigned = r?.assignedUnderwriter as Record<string, unknown> | undefined;
    const approved = r?.approvedByUnderwriter as Record<string, unknown> | undefined;
    const claimed = r?.claimedByUnderwriter as Record<string, unknown> | undefined;
    return (
        pickName(assigned) ||
        pickName(approved) ||
        pickName(claimed) ||
        '—'
    );
}

export function getStoredCommissionPctForRecipient(
    app: unknown,
    recipient: CommissionRecipientType,
): number | null {
    const r = app as Record<string, unknown>;
    if (recipient === 'underwriter') {
        const raw = r?.underwriterCommissionPercentage;
        if (raw == null || raw === '') return null;
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]+/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    const brokerRaw = r?.brokerCommissionPercentage;
    if (brokerRaw != null && brokerRaw !== '') {
        const n =
            typeof brokerRaw === 'number'
                ? brokerRaw
                : Number(String(brokerRaw).replace(/[^0-9.-]+/g, ''));
        if (Number.isFinite(n)) return n;
    }
    const legacyRaw = r?.commissionPercentage;
    if (legacyRaw == null || legacyRaw === '') return null;
    const n =
        typeof legacyRaw === 'number'
            ? legacyRaw
            : Number(String(legacyRaw).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(n) ? n : null;
}

export function getStoredCommissionAmountForRecipient(
    app: unknown,
    recipient: CommissionRecipientType,
): number | null {
    const r = app as Record<string, unknown>;
    if (recipient === 'underwriter') {
        const raw = r?.underwriterCommissionAmount;
        if (raw == null || raw === '') return null;
        const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]+/g, ''));
        return Number.isFinite(n) ? n : null;
    }
    const brokerRaw = r?.brokerCommissionAmount;
    if (brokerRaw != null && brokerRaw !== '') {
        const n =
            typeof brokerRaw === 'number'
                ? brokerRaw
                : Number(String(brokerRaw).replace(/[^0-9.-]+/g, ''));
        if (Number.isFinite(n)) return n;
    }
    const legacyRaw = r?.commissionAmount;
    if (legacyRaw == null || legacyRaw === '') return null;
    const n =
        typeof legacyRaw === 'number'
            ? legacyRaw
            : Number(String(legacyRaw).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(n) ? n : null;
}

export function commissionPctPayloadField(
    recipient: CommissionRecipientType,
): 'brokerCommissionPercentage' | 'underwriterCommissionPercentage' {
    return recipient === 'underwriter'
        ? 'underwriterCommissionPercentage'
        : 'brokerCommissionPercentage';
}
