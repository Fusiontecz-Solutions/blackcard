import { axiosGet } from "@/redux/axios";
import type { UnderwriterPipelineCounts } from "@/constants/underwriterPipeline";

let invalidateUnderwriterPipelineCountsFn: (() => void) | null = null;

export function registerUnderwriterPipelineCountsInvalidator(
  fn: (() => void) | null,
): void {
  invalidateUnderwriterPipelineCountsFn = fn;
}

export function invalidateUnderwriterPipelineCounts(): void {
  invalidateUnderwriterPipelineCountsFn?.();
}

export async function fetchUnderwriterPipelineCounts(): Promise<UnderwriterPipelineCounts | null> {
  try {
    const res = await axiosGet("/applications/underwriter-pipeline-counts");
    const payload = res.data as { data?: UnderwriterPipelineCounts };
    return payload?.data ?? null;
  } catch {
    return null;
  }
}
