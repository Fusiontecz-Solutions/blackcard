/** Session flag: user has completed a mic permission flow this browser tab. */
export const VOICE_MIC_WARMED_SESSION_KEY = "fusiontecz_voice_mic_warmed_v1";

export function markMicrophoneWarmedThisSession(): void {
  try {
    sessionStorage.setItem(VOICE_MIC_WARMED_SESSION_KEY, "1");
  } catch {
    /* private mode / blocked */
  }
}

export function isMicrophoneWarmedThisSession(): boolean {
  try {
    return sessionStorage.getItem(VOICE_MIC_WARMED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearVoiceMicSessionFlags(): void {
  try {
    sessionStorage.removeItem(VOICE_MIC_WARMED_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Stop preview tracks and optionally mark session warmed (after successful platform login).
 */
export async function stopMicWarmTracks(
  micPromise: Promise<MediaStream> | null,
  opts: { markSessionWarmed: boolean },
): Promise<void> {
  if (!micPromise) return;
  try {
    const stream = await micPromise;
    stream.getTracks().forEach((t) => t.stop());
    if (opts.markSessionWarmed) {
      markMicrophoneWarmedThisSession();
    }
  } catch {
    /* denied, no device, or aborted */
  }
}
