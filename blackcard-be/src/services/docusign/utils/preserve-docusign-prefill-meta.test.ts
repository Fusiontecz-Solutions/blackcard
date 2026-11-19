import {
  mergePreservingDocuSignEnvelopeMeta,
} from './preserve-docusign-prefill-meta';

describe('mergePreservingDocuSignEnvelopeMeta', () => {
  const existing = {
    businessName: 'Old Co',
    achAuthorizationDocuSign: {
      envelopeId: 'env-ach-1',
      status: 'SENT',
      sentAt: '2026-08-01T00:00:00.000Z',
    },
    achSendHistory: [{ envelopeId: 'env-ach-0', status: 'VOIDED', archivedAt: '2026-07-01T00:00:00.000Z' }],
    contractSendHistory: [{ envelopeId: 'env-main-0', status: 'completed', archivedAt: '2026-07-01T00:00:00.000Z' }],
    standalonePackageDocuSign: {
      envelopeId: 'env-pkg-1',
      status: 'SENT',
    },
  };

  it('preserves DocuSign capsules when a prefill save omits them', () => {
    const merged = mergePreservingDocuSignEnvelopeMeta(existing, {
      businessName: 'New Co',
      netToMerchant: '10000',
    });

    expect(merged).toEqual({
      businessName: 'New Co',
      netToMerchant: '10000',
      achAuthorizationDocuSign: existing.achAuthorizationDocuSign,
      achSendHistory: existing.achSendHistory,
      contractSendHistory: existing.contractSendHistory,
      standalonePackageDocuSign: existing.standalonePackageDocuSign,
    });
  });

  it('lets an explicit incoming DocuSign key win', () => {
    const merged = mergePreservingDocuSignEnvelopeMeta(existing, {
      achAuthorizationDocuSign: {
        envelopeId: 'env-ach-2',
        status: 'VIEWED',
      },
    });

    expect(merged?.achAuthorizationDocuSign).toEqual({
      envelopeId: 'env-ach-2',
      status: 'VIEWED',
    });
    expect(merged?.achSendHistory).toEqual(existing.achSendHistory);
  });

  it('keeps DocuSign meta when clearing form overrides to null', () => {
    const merged = mergePreservingDocuSignEnvelopeMeta(existing, null);

    expect(merged).toEqual({
      achAuthorizationDocuSign: existing.achAuthorizationDocuSign,
      achSendHistory: existing.achSendHistory,
      contractSendHistory: existing.contractSendHistory,
      standalonePackageDocuSign: existing.standalonePackageDocuSign,
    });
    expect(merged).not.toHaveProperty('businessName');
  });
});
