import type { Prisma } from '@prisma/client';
import {
  normalizeStoredWorkflowQueue,
  normalizeStoredWorkflowState,
} from '../workflowQueueStorage';

/**
 * Scalars on `Application` that belong in `application.create` data but may be missing from
 * an outdated `@prisma/client` until `npx prisma generate` is run.
 */
type ApplicationCreateScalarExtensions = {
  commissionPercentage?: number;
  commissionAmount?: number | null;
  dealDisplayName?: string | null;
  dealId?: string | null;
  organization?: string | null;
  isDuplicate?: boolean;
};

type ApplicationUncheckedCreateBase = Omit<
  Prisma.ApplicationUncheckedCreateInput,
  keyof ApplicationCreateScalarExtensions
>;

/**
 * Application.create `data` for unchecked (FK id) style creates.
 *
 * Uses `Omit` + extension so `commissionPercentage` is a known key even when the generated
 * `ApplicationUncheckedCreateInput` lags behind `schema.prisma`.
 */
export type ApplicationUncheckedCreateData = ApplicationUncheckedCreateBase &
  ApplicationCreateScalarExtensions;

export function applicationCreateUncheckedData(
  data: ApplicationUncheckedCreateData,
): Prisma.ApplicationUncheckedCreateInput {
  const normalized = { ...data };
  if (normalized.currentQueue != null) {
    normalized.currentQueue =
      normalizeStoredWorkflowQueue(normalized.currentQueue) ?? normalized.currentQueue;
  }
  if (normalized.currentState != null) {
    normalized.currentState =
      normalizeStoredWorkflowState(normalized.currentState, normalized.currentQueue) ??
      normalized.currentState;
  }
  return normalized as Prisma.ApplicationUncheckedCreateInput;
}
