import { mapTenantApplication, normalizeStage } from './reportSyncService';
import { presetRange, resolveFilters } from './reportFilters';
import { computeNextRun } from './reportScheduleService';

describe('normalizeStage', () => {
  it('maps tenant queue / state / status into pipeline stages', () => {
    expect(normalizeStage('Scrubbing')).toBe('Scrubbing');
    expect(normalizeStage('Underwriter')).toBe('Underwriter');
    expect(normalizeStage('Final Approval')).toBe('Final');
    expect(normalizeStage('Contracts Out')).toBe('Contracts_Out');
    expect(normalizeStage('Contract Pending')).toBe('Contract_Pending');
    expect(normalizeStage('Contracted', 'SIGNED_CONTRACTS')).toBe('Signed_Contracts');
    expect(normalizeStage('Approved', 'FUNDING_CALL')).toBe('Funding_Call');
    expect(normalizeStage('Approved', 'DISBURSMENT')).toBe('Disbursement');
    expect(normalizeStage('Approved', 'FUNDED', 'Funded')).toBe('Funded');
    expect(normalizeStage('Declined')).toBe('Declined');
    expect(normalizeStage('Underwriter', null, 'Rejected')).toBe('Declined');
    expect(normalizeStage('On Hold')).toBe('On_Hold');
    expect(normalizeStage('Waiting for Documents')).toBe('Waiting_For_Documents');
    expect(normalizeStage('New')).toBe('New');
    expect(normalizeStage(undefined)).toBe('New');
    expect(normalizeStage('Anything', null, null, '2026-01-01')).toBe('Deleted');
  });
});

describe('mapTenantApplication', () => {
  it('extracts people, amounts and dates from a typical tenant row', () => {
    const m = mapTenantApplication({
      _id: 'app-1',
      applicationId: 1234,
      dealId: 'KK-1234',
      type: 'Renewal',
      client: { business: { name: 'Blue Ridge Auto' } },
      referringAgent: { _id: 'a1', firstName: 'Maria', lastName: 'Lopez' },
      iso: { _id: 'i1', name: 'Capital Bridge' },
      approvedByUnderwriter: { id: 'u1', firstName: 'Sam', lastName: 'Okafor' },
      loanAmount: '75,000',
      termsOffers: [{ approvedAmount: 60000, commissionAmount: 3000, paybackAmount: 78000 }],
      status: 'Funded',
      currentQueue: 'Funded',
      createdAt: '2026-08-01T10:00:00Z',
      approvedAt: '2026-08-05T10:00:00Z',
      collectionSumOfRepaid: 20000,
      collectionBalanceDue: 58000,
    });
    expect(m).not.toBeNull();
    expect(m!.applicationUuid).toBe('app-1');
    const d = m!.data;
    expect(d.applicationNumericId).toBe('1234');
    expect(d.merchantName).toBe('Blue Ridge Auto');
    expect(d.agentId).toBe('a1');
    expect(d.agentName).toBe('Maria Lopez');
    expect(d.isoName).toBe('Capital Bridge');
    expect(d.underwriterName).toBe('Sam Okafor');
    expect(d.requestedAmount).toBe(75000);
    expect(d.approvedAmount).toBe(60000);
    expect(d.fundedAmount).toBe(60000);
    expect(d.commissionAmount).toBe(3000);
    expect(d.paybackAmount).toBe(78000);
    expect(d.stage).toBe('Funded');
    expect(d.dealType).toBe('Renewal');
    expect((d.createdAtTenant as Date).toISOString()).toBe('2026-08-01T10:00:00.000Z');
  });

  it('returns null without an id and tolerates sparse rows', () => {
    expect(mapTenantApplication({})).toBeNull();
    const m = mapTenantApplication({ id: 'x', currentQueue: 'Scrubbing' });
    expect(m!.data.stage).toBe('Scrubbing');
    expect(m!.data.approvedAmount).toBeNull();
    expect(m!.data.merchantName).toBeNull();
  });
});

describe('report filters', () => {
  const now = new Date('2026-09-03T15:00:00Z');
  it('resolves presets relative to now', () => {
    expect(presetRange('today', now)!.from.toISOString()).toBe('2026-09-03T00:00:00.000Z');
    expect(presetRange('last7', now)!.from.toISOString()).toBe('2026-08-28T00:00:00.000Z');
    expect(presetRange('thisMonth', now)!.from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(presetRange('lastMonth', now)!.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(presetRange('lastMonth', now)!.to.toISOString()).toBe('2026-08-31T23:59:59.999Z');
    expect(presetRange('thisQuarter', now)!.from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(presetRange('ytd', now)!.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(presetRange('nope', now)).toBeNull();
  });
  it('falls back to last30 and parses book lists', () => {
    const f = resolveFilters({ _asOf: now.toISOString(), bookIds: 'a, b,all' });
    expect(f.from.toISOString()).toBe('2026-08-05T00:00:00.000Z');
    expect(f.bookIds).toEqual(['a', 'b']);
    const c = resolveFilters({ from: '2026-01-10', to: '2026-01-20', bookId: 'z', stage: 'all' });
    expect(c.from.toISOString()).toBe('2026-01-10T00:00:00.000Z');
    expect(c.to.toISOString()).toBe('2026-01-20T23:59:59.999Z');
    expect(c.bookIds).toEqual(['z']);
    expect(c.stage).toBeUndefined();
  });
});

describe('computeNextRun', () => {
  const base = { hourLocal: 7, minuteLocal: 0, dayOfWeek: null, dayOfMonth: null, timezone: 'UTC' };
  it('schedules the next occurrence after the reference time', () => {
    const after = new Date('2026-09-03T10:00:00Z'); // Thursday
    expect(computeNextRun({ ...base, frequency: 'daily' }, after).toISOString()).toBe('2026-09-04T07:00:00.000Z');
    expect(computeNextRun({ ...base, frequency: 'weekdays' }, new Date('2026-09-04T10:00:00Z')).toISOString()).toBe('2026-09-07T07:00:00.000Z');
    expect(computeNextRun({ ...base, frequency: 'weekly', dayOfWeek: 1 }, after).toISOString()).toBe('2026-09-07T07:00:00.000Z');
    expect(computeNextRun({ ...base, frequency: 'monthly', dayOfMonth: 1 }, after).toISOString()).toBe('2026-10-01T07:00:00.000Z');
  });
  it('respects the timezone', () => {
    const after = new Date('2026-09-03T10:00:00Z');
    // 07:00 New York (EDT, UTC-4) = 11:00Z the same day.
    expect(computeNextRun({ ...base, frequency: 'daily', timezone: 'America/New_York' }, after).toISOString()).toBe('2026-09-03T11:00:00.000Z');
  });
});
