/**
 * Sync DocuSign envelope status when the user returns to the CRM tab after opening sender view.
 * Not interval polling — runs once per focus/visibility return until `shouldStop` is true.
 */
export function watchDocuSignSenderReturn(options: {
    onReturn: () => void | Promise<void>;
    shouldStop?: () => boolean;
    /** Stop listening after this duration (default 4 hours). */
    timeoutMs?: number;
}): () => void {
    let active = true;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
        active = false;
        if (debounceTimer) clearTimeout(debounceTimer);
        window.removeEventListener("focus", maybeSync);
        document.removeEventListener("visibilitychange", maybeSync);
        clearTimeout(timeoutId);
    };

    const maybeSync = () => {
        if (!active || document.hidden) return;
        if (options.shouldStop?.()) {
            cleanup();
            return;
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (!active || document.hidden) return;
            if (options.shouldStop?.()) {
                cleanup();
                return;
            }
            void options.onReturn();
        }, 350);
    };

    window.addEventListener("focus", maybeSync);
    document.addEventListener("visibilitychange", maybeSync);
    const timeoutId = setTimeout(cleanup, options.timeoutMs ?? 4 * 60 * 60 * 1000);

    return cleanup;
}
