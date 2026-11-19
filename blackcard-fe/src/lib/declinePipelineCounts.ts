import { axiosGet } from "@/redux/axios";

export type DeclinePipelineCounts = {
  declined: number;
  declineRequest: number;
  declinedByScrubber: number;
  declinedByUnderwriter: number;
  declinedByAdmin: number;
};

let invalidateDeclinePipelineCountsFn: (() => void) | null = null;

export function registerDeclinePipelineCountsInvalidator(
  fn: (() => void) | null,
): void {
  invalidateDeclinePipelineCountsFn = fn;
}

export function invalidateDeclinePipelineCounts(): void {
  invalidateDeclinePipelineCountsFn?.();
}

export async function fetchDeclinePipelineCounts(): Promise<DeclinePipelineCounts | null> {
  try {
    const res = await axiosGet("/applications/decline-pipeline-counts");
    const payload = res.data as { data?: Partial<DeclinePipelineCounts> };
    const data = payload?.data;
    if (!data) return null;
    return {
      declined: Number(data.declined ?? 0),
      declineRequest: Number(data.declineRequest ?? 0),
      declinedByScrubber: Number(data.declinedByScrubber ?? 0),
      declinedByUnderwriter: Number(data.declinedByUnderwriter ?? 0),
      declinedByAdmin: Number(data.declinedByAdmin ?? 0),
    };
  } catch {
    return null;
  }
}

export function resolveDeclinePipelineChildCount(
  operationsStatus: string | undefined,
  underwriterPipeline: string | undefined,
  counts: DeclinePipelineCounts | null,
): number | null {
  if (!counts) return null;
  const ops = String(operationsStatus ?? "").trim();
  const pipeline = String(underwriterPipeline ?? "").trim().toLowerCase();
  if (ops === "Decline_Request" || pipeline === "decline-request") {
    return counts.declineRequest;
  }
  if (ops === "Declined_By_Scrubber" || pipeline === "declined-by-scrubber") {
    return counts.declinedByScrubber;
  }
  if (ops === "Declined_By_Underwriter" || pipeline === "declined-by-uw") {
    return counts.declinedByUnderwriter;
  }
  if (
    ops === "Declined_By_Admin" ||
    pipeline === "declined-by-admin"
  ) {
    return counts.declinedByAdmin;
  }
  if (ops === "Declined" || pipeline === "declined") {
    return counts.declined;
  }
  return null;
}
