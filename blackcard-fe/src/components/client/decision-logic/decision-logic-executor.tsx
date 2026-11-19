"use client";

import { toast } from "react-toastify";
import { useNavigate } from "react-router";
import {
  createElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateDecisionLogicReportUntilComplete } from "@/redux/actions/decision-logic-actions";
import { clearCachedDecisionLogicRequestCode } from "@/lib/decisionLogicSession";

const WIDGET_SCRIPT_SRC =
  "https://assets.decisionlogic.com/cdn/widgetui/widgetUI.js";

function resolveWidgetMode(): "LIVE" | "TEST" {
  const raw = String(
    import.meta.env.VITE_DECISION_LOGIC_WIDGET_MODE ?? "TEST",
  )
    .trim()
    .toUpperCase();
  return raw === "LIVE" ? "LIVE" : "TEST";
}

function resolveWidgetGuids(): { siteUserGuid: string; profileGuid: string } {
  return {
    siteUserGuid: String(
      import.meta.env.VITE_DECISION_LOGIC_SITE_USER_GUID ?? "",
    ).trim(),
    profileGuid: String(
      import.meta.env.VITE_DECISION_LOGIC_PROFILE_GUID ?? "",
    ).trim(),
  };
}

function findWidgetScriptEl(): HTMLScriptElement | undefined {
  const list = document.getElementsByTagName("script");
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.src && s.src.includes("widgetUI.js")) return s;
  }
  return undefined;
}

function isWidgetCompletionSignal(detail: unknown): boolean {
  if (detail == null || detail === "") return false;

  if (typeof detail === "string") {
    const status = detail.trim().toLowerCase();
    if (!status) return false;
    if (
      status.includes("not completed") ||
      status.includes("not started") ||
      status.includes("in progress")
    ) {
      return false;
    }
    return (
      status.includes("completed") ||
      status.includes("complete") ||
      status.includes("success") ||
      status.includes("shared") ||
      status.includes("authorized") ||
      status.includes("connected") ||
      status.includes("verified")
    );
  }

  if (typeof detail !== "object" || Array.isArray(detail)) {
    return false;
  }

  const row = detail as Record<string, unknown>;
  if (row.isCompleted === true) return true;

  const status = String(
    row.statusText ?? row.status ?? row.eventType ?? row.type ?? "",
  )
    .trim()
    .toLowerCase();
  if (!status) return false;
  if (
    status.includes("not completed") ||
    status.includes("not started") ||
    status.includes("in progress")
  ) {
    return false;
  }
  return (
    status.includes("completed") ||
    status.includes("complete") ||
    status.includes("success") ||
    status.includes("shared") ||
    status.includes("authorized") ||
    status.includes("connected") ||
    status.includes("verified")
  );
}

/** Wait for quiet period after the widget signals completion before fetching report. */
const WIDGET_COMPLETION_DEBOUNCE_MS = 1500;
/** After returning from bank OAuth the widget may reset before firing completion. */
const BANK_RETURN_DEBOUNCE_MS = 3000;

export default function DecisionLogicExecutor({
  requestCode,
  businessOwnerId,
  bankAccountId,
  invitationToken,
}: {
  requestCode: string;
  businessOwnerId: number;
  bankAccountId: number;
  invitationToken?: string;
}) {
  const navigate = useNavigate();
  const widgetMode = resolveWidgetMode();
  const widgetGuids = resolveWidgetGuids();

  const [widgetLoaded, setWidgetLoaded] = useState(false);
  const [widgetLoadError, setWidgetLoadError] = useState("");
  const [isSavingReport, setIsSavingReport] = useState(false);
  const [awaitingBankReturn, setAwaitingBankReturn] = useState(false);
  const reportSubmittedRef = useRef(false);
  const reportDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasHiddenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let timeoutId = 0;

    const clearTimer = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      timeoutId = 0;
    };

    const markReady = () => {
      if (settled || cancelled) return;
      settled = true;
      clearTimer();
      setWidgetLoaded(true);
      setWidgetLoadError("");
    };

    const markError = (msg: string) => {
      if (settled || cancelled) return;
      settled = true;
      clearTimer();
      setWidgetLoadError(msg);
    };

    if (
      typeof customElements !== "undefined" &&
      customElements.get("widget-ui")
    ) {
      markReady();
      return () => {
        cancelled = true;
        clearTimer();
      };
    }

    const existing = findWidgetScriptEl();
    if (existing?.dataset.dlWidgetReady === "1") {
      markReady();
      return () => {
        cancelled = true;
        clearTimer();
      };
    }

    const onScriptLoad = (el: HTMLScriptElement) => {
      el.dataset.dlWidgetReady = "1";
      markReady();
    };

    if (existing) {
      existing.addEventListener("load", () => onScriptLoad(existing), {
        once: true,
      });
      existing.addEventListener(
        "error",
        () => markError("Unable to load Decision Logic widget script."),
        { once: true },
      );
      window.setTimeout(() => {
        if (
          !cancelled &&
          !settled &&
          typeof customElements !== "undefined" &&
          customElements.get("widget-ui")
        ) {
          onScriptLoad(existing);
        }
      }, 0);
    } else {
      const script = document.createElement("script");
      script.src = WIDGET_SCRIPT_SRC;
      script.async = true;
      script.onload = () => onScriptLoad(script);
      script.onerror = () =>
        markError("Unable to load Decision Logic widget script.");
      document.body.appendChild(script);
    }

    queueMicrotask(() => {
      if (
        !cancelled &&
        !settled &&
        typeof customElements !== "undefined" &&
        customElements.get("widget-ui")
      ) {
        const el = findWidgetScriptEl();
        if (el) el.dataset.dlWidgetReady = "1";
        markReady();
      }
    });

    timeoutId = window.setTimeout(() => {
      if (!cancelled && !settled) {
        markError("Decision Logic widget took too long to load.");
      }
    }, 20000);

    return () => {
      cancelled = true;
      clearTimer();
    };
  }, []);

  const flushSaveReport = useCallback(async () => {
    if (reportSubmittedRef.current) {
      return;
    }
    reportSubmittedRef.current = true;
    setIsSavingReport(true);

    try {
      const finalCode = requestCode.trim();
      if (!finalCode) {
        throw new Error("Decision Logic did not return a request code.");
      }

      const response = await generateDecisionLogicReportUntilComplete(
        finalCode,
        businessOwnerId,
        bankAccountId,
      );
      if (response && typeof response === "object" && "error" in response) {
        const errMsg = (response as { error?: string }).error;
        if (errMsg) throw new Error(errMsg);
      }

      toast.success(
        (response as { message?: string })?.message ||
          "Bank verification completed. Full report saved.",
      );
      if (invitationToken) {
        clearCachedDecisionLogicRequestCode(invitationToken);
      }
      navigate(
        `/decision-logic/success?businessOwnerId=${encodeURIComponent(
          String(businessOwnerId),
        )}`,
      );
    } catch (error) {
      reportSubmittedRef.current = false;
      if (error instanceof Error) toast.error(error.message);
      else {
        toast.error(
          "An unknown error occurred while generating the report.",
        );
      }
    } finally {
      setIsSavingReport(false);
      setAwaitingBankReturn(false);
    }
  }, [bankAccountId, businessOwnerId, invitationToken, navigate, requestCode]);

  const scheduleReportFetch = useCallback(
    (delayMs = WIDGET_COMPLETION_DEBOUNCE_MS) => {
      if (reportSubmittedRef.current) {
        return;
      }
      if (reportDebounceRef.current) {
        window.clearTimeout(reportDebounceRef.current);
      }
      reportDebounceRef.current = window.setTimeout(() => {
        reportDebounceRef.current = null;
        void flushSaveReport();
      }, delayMs);
    },
    [flushSaveReport],
  );

  const scheduleSaveReportFromWidgetCompletion = useCallback(
    (detail: unknown) => {
      if (!isWidgetCompletionSignal(detail)) {
        return;
      }
      if (reportSubmittedRef.current) {
        return;
      }
      scheduleReportFetch(WIDGET_COMPLETION_DEBOUNCE_MS);
    },
    [scheduleReportFetch],
  );

  const handleWidgetEventDetail = useCallback(
    (detail: unknown) => {
      if (reportSubmittedRef.current) {
        return;
      }
      if (isWidgetCompletionSignal(detail)) {
        scheduleSaveReportFromWidgetCompletion(detail);
        return;
      }
      if (detail != null && detail !== "") {
        scheduleReportFetch(BANK_RETURN_DEBOUNCE_MS);
      }
    },
    [scheduleReportFetch, scheduleSaveReportFromWidgetCompletion],
  );

  useEffect(() => {
    if (!widgetLoaded) return;
    const host = document.getElementById("widget3");
    if (!host) return;

    const onGetEventCapture = (e: Event) => {
      if (!(e instanceof CustomEvent)) {
        return;
      }
      const path =
        typeof e.composedPath === "function" ? e.composedPath() : [];
      const fromWidget =
        path.includes(host) ||
        path.some(
          (node) =>
            node instanceof HTMLElement &&
            (node.tagName?.toLowerCase() === "widget-ui" ||
              node.id === "widget3"),
        );
      if (!fromWidget) {
        return;
      }
      handleWidgetEventDetail(e.detail);
    };

    const onHostGetEvent = (e: Event) => {
      if (!(e instanceof CustomEvent)) {
        return;
      }
      handleWidgetEventDetail(e.detail);
    };

    document.addEventListener("getEvent", onGetEventCapture, true);
    host.addEventListener("getEvent", onHostGetEvent);

    return () => {
      document.removeEventListener("getEvent", onGetEventCapture, true);
      host.removeEventListener("getEvent", onHostGetEvent);
      if (reportDebounceRef.current) {
        window.clearTimeout(reportDebounceRef.current);
        reportDebounceRef.current = null;
      }
    };
  }, [widgetLoaded, handleWidgetEventDetail]);

  useEffect(() => {
    if (!widgetLoaded) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        wasHiddenRef.current = true;
        return;
      }
      if (
        document.visibilityState === "visible" &&
        wasHiddenRef.current &&
        !reportSubmittedRef.current
      ) {
        setAwaitingBankReturn(true);
        scheduleReportFetch(BANK_RETURN_DEBOUNCE_MS);
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || reportSubmittedRef.current) return;
      setAwaitingBankReturn(true);
      scheduleReportFetch(BANK_RETURN_DEBOUNCE_MS);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [widgetLoaded, scheduleReportFetch]);

  useLayoutEffect(() => {
    if (!widgetLoaded) return;
    let cancelled = false;
    let ro: ResizeObserver | undefined;

    const applySizes = () => {
      if (cancelled) return;
      const shell = document.getElementById("widgetHeight");
      const host = document.getElementById("widget3");
      if (!shell || !host) return;

      const shellH = Math.max(320, Math.floor(shell.getBoundingClientRect().height));
      host.style.display = "block";
      host.style.width = "100%";
      host.style.maxWidth = "100%";
      host.style.boxSizing = "border-box";
      host.style.minHeight = `${shellH}px`;

      const root = host.shadowRoot;
      if (!root) return;
      const iframe = root.querySelector("iframe");
      if (iframe instanceof HTMLIFrameElement) {
        iframe.style.width = "100%";
        iframe.style.maxWidth = "100%";
        iframe.style.minHeight = `${shellH}px`;
        iframe.style.height = "auto";
        iframe.style.border = "0";
        iframe.style.display = "block";
      }
    };

    applySizes();
    const t1 = window.setTimeout(applySizes, 120);
    const t2 = window.setTimeout(applySizes, 500);
    const shell = document.getElementById("widgetHeight");
    if (shell && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => applySizes());
      ro.observe(shell);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
    };
  }, [widgetLoaded]);

  const widgetProps: Record<string, string> = {
    id: "widget3",
    request_code: requestCode,
    widget_mode: widgetMode,
  };
  if (widgetGuids.siteUserGuid) {
    widgetProps.site_user_guid = widgetGuids.siteUserGuid;
  }
  if (widgetGuids.profileGuid) {
    widgetProps.profile_guid = widgetGuids.profileGuid;
  }

  const showEnvHint =
    !widgetGuids.siteUserGuid || !widgetGuids.profileGuid;

  return (
    <div className="dl-widget-page flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-slate-100 antialiased">
      <header className="shrink-0 bg-[image:var(--brand-gradient)] shadow-[0_1px_0_rgba(0,0,0,0.08)]">
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white ring-1 ring-white/25">
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="font-roboto text-lg font-semibold tracking-tight text-white sm:text-xl">
                Bank verification
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/90">
                Securely connect your financial institution using DecisionLogic. Complete every
                step in the workspace below — your session is encrypted in transit.
              </p>
            </div>
          </div>
          <span className="inline-flex w-fit shrink-0 self-start rounded-md bg-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white ring-1 ring-white/25 sm:self-center">
            {widgetMode === "LIVE" ? "Live" : "Test"} environment
          </span>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5 md:px-8 md:py-6">
          <div className="widget_section flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_12px_40px_-12px_rgba(15,23,42,0.12)]">
            {(widgetLoadError || showEnvHint || isSavingReport || awaitingBankReturn) && (
              <div className="shrink-0 space-y-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
                {isSavingReport ? (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    <p>
                      Bank login complete. Fetching your full Decision Logic report — this can take up to a minute.
                    </p>
                  </div>
                ) : awaitingBankReturn ? (
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    <p>
                      Welcome back. We are checking whether your bank data was shared successfully.
                    </p>
                  </div>
                ) : null}
                {widgetLoadError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                    <p className="font-medium">Widget could not load</p>
                    <p className="mt-1">{widgetLoadError}</p>
                    <p className="mt-2 text-xs text-red-700/90">
                      Request code: {requestCode ? `${requestCode.slice(0, 8)}…` : "—"} · Mode:{" "}
                      {widgetMode}
                    </p>
                  </div>
                ) : null}
                {showEnvHint ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-950">
                    Set <code className="rounded bg-amber-100/80 px-1 font-mono text-[0.7rem]">VITE_DECISION_LOGIC_SITE_USER_GUID</code>{" "}
                    and{" "}
                    <code className="rounded bg-amber-100/80 px-1 font-mono text-[0.7rem]">VITE_DECISION_LOGIC_PROFILE_GUID</code> in
                    the frontend <code className="font-mono text-[0.7rem]">.env</code> (same as{" "}
                    <code className="font-mono text-[0.7rem]">SITE_USER_GUID</code> /{" "}
                    <code className="font-mono text-[0.7rem]">PROFILE_GUID</code> on the API).
                  </div>
                ) : null}
              </div>
            )}

            <div
              id="widgetHeight"
              className="dl-widget-host widget_section flex min-h-0 flex-1 flex-col"
            >
              {widgetLoaded ? (
                createElement("widget-ui", widgetProps)
              ) : (
                <div className="flex min-h-[50dvh] flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
                  <Loader2
                    className="h-10 w-10 animate-spin text-[var(--brand)]"
                    aria-hidden
                  />
                  <div>
                    <p className="font-roboto text-base font-medium text-slate-800">
                      Loading secure widget
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      This may take a few seconds. Do not close this window.
                    </p>
                  </div>
                </div>
              )}
            </div>
            {widgetLoaded && !widgetLoadError ? (
              <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-600">
                    After you finish bank login in the widget above, your full report will be saved automatically.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSavingReport}
                    onClick={() => void flushSaveReport()}
                  >
                    {isSavingReport ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                        Saving report…
                      </>
                    ) : (
                      "I've finished connecting my bank"
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
