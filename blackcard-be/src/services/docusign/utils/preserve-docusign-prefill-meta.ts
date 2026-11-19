/**
 * Keys that store DocuSign envelope lifecycle / history on Contract.contractPrefillOverrides.
 * FE prefill saves must not wipe these when they rebuild the JSON blob.
 */
export const DOCUSIGN_ENVELOPE_PREFILL_META_KEYS = [
  'contractSendHistory',
  'mainContractSendPackage',
  'achAuthorizationDocuSign',
  'achSendHistory',
  'standalonePackageDocuSign',
  'standalonePackageSendHistory',
  'documentSendHistory',
  'documentTemplateEnvelopeByMappingId',
  'documentTemplatePrefillByMappingId',
  'lastAchSentFunder',
  'contractSignerOverrides',
  'docusignEnvelopeResends',
] as const;

function asPrefillObject(value: unknown): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function pickPreservedDocuSignMeta(
  existing: Record<string, unknown>,
): Record<string, unknown> {
  const preserved: Record<string, unknown> = {};
  for (const key of DOCUSIGN_ENVELOPE_PREFILL_META_KEYS) {
    if (existing[key] !== undefined) {
      preserved[key] = existing[key];
    }
  }
  return preserved;
}

/**
 * Merge incoming prefill overrides onto existing, keeping DocuSign history/capsule
 * keys from existing when the incoming payload omits them.
 *
 * When incoming is null (clear overrides), form field overrides are cleared but
 * DocuSign envelope metadata is retained so sent docs do not disappear from CRM.
 */
export function mergePreservingDocuSignEnvelopeMeta(
  existing: unknown,
  incoming: unknown,
): Record<string, unknown> | null {
  const prev = asPrefillObject(existing);

  if (incoming == null) {
    if (!prev) return null;
    const preserved = pickPreservedDocuSignMeta(prev);
    return Object.keys(preserved).length > 0 ? preserved : null;
  }

  if (typeof incoming !== 'object' || Array.isArray(incoming)) {
    return null;
  }

  const next = { ...(incoming as Record<string, unknown>) };
  if (!prev) return next;

  for (const key of DOCUSIGN_ENVELOPE_PREFILL_META_KEYS) {
    if (next[key] === undefined && prev[key] !== undefined) {
      next[key] = prev[key];
    }
  }
  return next;
}
