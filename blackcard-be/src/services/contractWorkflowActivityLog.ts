import type { Request } from 'express';
import {
  createApplicationActivityLog,
  type ApplicationActivityActionType,
} from './applicationActivityLogService';
import { buildActorPrefix } from './applicationSubActivityLog';
import type { AuthenticatedUser } from './applicationService';

export const CONTRACT_WORKFLOW_CATEGORY = 'CONTRACT';

export type ContractWorkflowStep =
  | 'REINITIATION_REQUIRED'
  | 'REINITIATED'
  | 'RECORD_CREATED'
  | 'RECORD_REGENERATED'
  | 'DRAFT_ENVELOPE_CREATED'
  | 'ENVELOPE_SENT';

const STEP_ACTION_TYPE: Record<ContractWorkflowStep, ApplicationActivityActionType> = {
  REINITIATION_REQUIRED: 'CONTRACT_REINITIATION_REQUIRED',
  REINITIATED: 'CONTRACT_REINITIATED',
  RECORD_CREATED: 'CONTRACT_GENERATED',
  RECORD_REGENERATED: 'CONTRACT_GENERATED',
  DRAFT_ENVELOPE_CREATED: 'CONTRACT_DRAFT_CREATED',
  ENVELOPE_SENT: 'CONTRACT_ENVELOPE_SENT',
};

export type ContractWorkflowLogContext = {
  user?: AuthenticatedUser | null;
  req?: Request | null;
  actorName?: string;
  source?: string;
};

function formatUsd(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(n);
}

function defaultDescription(
  step: ContractWorkflowStep,
  actorPrefix: string,
  metadata: Record<string, unknown>,
): string {
  switch (step) {
    case 'REINITIATION_REQUIRED':
      return 'Offer terms changed after a contract existed — contract regeneration is required before sending.';
    case 'REINITIATED': {
      const envelope = String(metadata.priorEnvelopeId ?? '').trim();
      const archiveStatus = String(metadata.archivedEnvelopeStatus ?? '').trim();
      const envelopeNote = envelope
        ? ` Prior envelope ${envelope}${archiveStatus ? ` (${archiveStatus})` : ''} archived.`
        : ' Prior contract reset to draft.';
      return `${actorPrefix} reinitiated the contract.${envelopeNote}`.trim();
    }
    case 'RECORD_CREATED': {
      const approved = formatUsd(metadata.approvedAmount);
      const total = formatUsd(metadata.totalAmount);
      const amountNote =
        approved || total
          ? ` (${[approved ? `approved ${approved}` : null, total ? `total ${total}` : null]
              .filter(Boolean)
              .join(', ')})`
          : '';
      return `${actorPrefix} generated the contract record${amountNote}.`.trim();
    }
    case 'RECORD_REGENERATED': {
      const approved = formatUsd(metadata.approvedAmount);
      const total = formatUsd(metadata.totalAmount);
      const amountNote =
        approved || total
          ? ` (${[approved ? `approved ${approved}` : null, total ? `total ${total}` : null]
              .filter(Boolean)
              .join(', ')})`
          : '';
      return `${actorPrefix} regenerated the contract record${amountNote}.`.trim();
    }
    case 'DRAFT_ENVELOPE_CREATED': {
      const envelopeId = String(metadata.envelopeId ?? '').trim();
      const signers = String(metadata.signers ?? '').trim();
      const parts = [
        `${actorPrefix} created a DocuSign draft envelope for contract review`,
        envelopeId ? `envelope ${envelopeId}` : null,
        signers ? `signer(s): ${signers}` : null,
      ].filter(Boolean);
      return `${parts[0]}${envelopeId ? ` (${envelopeId})` : ''}${signers ? `. Signer(s): ${signers}` : ''}.`;
    }
    case 'ENVELOPE_SENT': {
      const envelopeId = String(metadata.envelopeId ?? '').trim();
      const signers = String(metadata.signers ?? '').trim();
      return `${actorPrefix} sent the contract for signature via DocuSign${
        envelopeId ? ` (envelope ${envelopeId})` : ''
      }${signers ? ` to ${signers}` : ''}.`.trim();
    }
    default:
      return `${actorPrefix} updated contract workflow.`.trim();
  }
}

export async function recordContractWorkflowActivityLog(
  applicationId: string,
  step: ContractWorkflowStep,
  context: ContractWorkflowLogContext,
  details: {
    description?: string;
    previousStatus?: string | null;
    currentStatus?: string | null;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const appId = String(applicationId || '').trim();
  if (!appId) return;

  const actorPrefix = buildActorPrefix(context.user ?? null, context.actorName ?? '');
  const metadata = {
    category: CONTRACT_WORKFLOW_CATEGORY,
    contractWorkflowStep: step,
    source: context.source ?? null,
    ...(details.metadata ?? {}),
  };

  try {
    await createApplicationActivityLog({
      applicationId: appId,
      user: context.user ?? null,
      req: context.req ?? null,
      actionType: STEP_ACTION_TYPE[step],
      actionDescription:
        details.description?.trim() ||
        defaultDescription(step, actorPrefix, metadata),
      previousStatus: details.previousStatus ?? null,
      currentStatus: details.currentStatus ?? null,
      metadata,
    });
  } catch (err) {
    console.error('[contractWorkflowActivityLog] failed:', { applicationId: appId, step, err });
  }
}
