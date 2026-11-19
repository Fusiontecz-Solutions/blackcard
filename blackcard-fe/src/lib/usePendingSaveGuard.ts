import { useEffect, useRef } from "react";

/**
 * Keeps debounced autosaves from being lost.
 *
 * Scrubbing tables save on a short timer after the last keystroke. Leaving the
 * tab, switching deals or closing the browser inside that window used to clear
 * the timer, so the last edits never reached the server and other viewers
 * (Super Admin, underwriters) saw nothing. This hook:
 *  - runs `flush` when the component unmounts with a save still pending, and
 *  - flushes and shows the browser's "leave site?" prompt on tab close / reload
 *    while a save is pending or in flight.
 */
export function usePendingSaveGuard(isPending: () => boolean, flush: () => void): void {
  const isPendingRef = useRef(isPending);
  isPendingRef.current = isPending;
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isPendingRef.current()) return;
      try {
        flushRef.current();
      } catch {
        /* best effort */
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (isPendingRef.current()) {
        try {
          flushRef.current();
        } catch {
          /* best effort */
        }
      }
    };
  }, []);
}
