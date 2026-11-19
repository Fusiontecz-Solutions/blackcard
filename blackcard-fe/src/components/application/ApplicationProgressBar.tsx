import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import type { ApplicationProgressStageKey } from "@/lib/applicationProgress";
import {
  APPLICATION_PROGRESS_STAGES,
  resolveApplicationProgress,
} from "@/lib/applicationProgress";
import { HorizontalScrollFade } from "@/components/ui/horizontal-scroll-fade";

interface ApplicationProgressBarProps {
  application:
    | {
        currentQueue?: string | null;
        queue?: string | null;
        currentState?: string | null;
        state?: string | null;
        statsCurrentState?: string | null;
        status?: string | null;
        underwriterAction?: string | null;
        finalApprovalSource?: string | null;
      }
    | null
    | undefined;
  className?: string;
}

const TWO_LINE_STAGE_KEYS = new Set<ApplicationProgressStageKey>([
  "FINAL_APPROVAL",
  "CONTRACT_GENERATED",
  "CONTRACT_SIGNED",
  "FINAL_AND_FUNDING",
]);

/** Compact labels so all steps fit without crushing layout. Full text stays in `title`. */
const COMPACT_STAGE_LABELS: Partial<Record<ApplicationProgressStageKey, string>> = {
  UNDERWRITER: "Underwriter",
  DISBURSEMENT: "Disbursement",
};

function splitStageLabel(key: ApplicationProgressStageKey, label: string) {
  if (key === "FINAL_APPROVAL") {
    return { primary: "Final", secondary: "Approval" };
  }
  if (key === "CONTRACT_GENERATED") {
    return { primary: "Contract", secondary: "Generated" };
  }
  if (key === "CONTRACT_SIGNED") {
    return { primary: "Contract", secondary: "Signed" };
  }
  if (key === "FINAL_AND_FUNDING") {
    return { primary: "Final &", secondary: "Funding" };
  }
  return { primary: COMPACT_STAGE_LABELS[key] ?? label, secondary: null };
}

const ApplicationProgressBar = ({
  application,
  className,
}: ApplicationProgressBarProps) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const progress = useMemo(
    () => resolveApplicationProgress(application),
    [application],
  );

  const stages = APPLICATION_PROGRESS_STAGES;
  const lastIndex = stages.length - 1;
  const {
    currentIndex,
    isNegative,
    negativeLabel,
    currentStageLabel,
    percentComplete,
    holdLabel,
  } = progress;

  const fillPct = lastIndex > 0 ? (currentIndex / lastIndex) * 100 : 0;

  const accent = isDark ? "#4ADE80" : "#16A34A";
  const accentDark = isDark ? "#22C55E" : "#15803D";
  const accentSoft = isDark ? "rgba(74,222,128,0.20)" : "rgba(22,163,74,0.12)";
  const trackColor = isDark ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.30)";
  const negativeColor = isDark ? "#F87171" : "#DC2626";
  const holdColor = isDark ? "#FBBF24" : "#B45309";
  const holdSoft = isDark ? "rgba(251,191,36,0.18)" : "rgba(245,158,11,0.14)";

  return (
    <div
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-xl border bg-card px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-5 sm:py-5",
        isDark ? "border-slate-700/70" : "border-slate-200",
        className,
      )}
      role="group"
      aria-label="Submission progress"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="shrink-0 text-sm font-semibold uppercase tracking-wide text-muted-foreground sm:text-base">
          Application Progress
        </h3>
        <span
          className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold sm:self-auto sm:px-4 sm:py-1.5 sm:text-sm"
          style={{
            color: isNegative ? negativeColor : holdLabel ? holdColor : accentDark,
            backgroundColor: isNegative
              ? isDark
                ? "rgba(248,113,113,0.15)"
                : "rgba(220,38,38,0.10)"
              : holdLabel
                ? holdSoft
                : accentSoft,
          }}
        >
          {isNegative ? <X className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
          <span className="truncate">
            {isNegative
              ? negativeLabel
              : holdLabel
                ? `Current: ${currentStageLabel} · ${holdLabel}`
                : `Current: ${currentStageLabel} · ${percentComplete}%`}
          </span>
        </span>
      </div>

      <HorizontalScrollFade scrollKey={String(currentIndex)}>
        <div className="relative min-w-[47rem] px-1 pb-1">
          <div
            className="absolute left-1 right-1 top-[15px] h-[3px] rounded-full"
            style={{ backgroundColor: trackColor }}
            aria-hidden
          />
          <div
            className="absolute left-1 top-[15px] h-[3px] rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `calc(${fillPct}% - 0.5rem)`,
              maxWidth: "calc(100% - 0.5rem)",
              background: isNegative
                ? negativeColor
                : `linear-gradient(90deg, ${accent} 0%, ${accentDark} 100%)`,
            }}
            aria-hidden
          />

          <ol className="relative flex items-start justify-between gap-1">
            {stages.map((stage, index) => {
              const isCompleted = !isNegative && index < currentIndex;
              const isActive = index === currentIndex;
              const isFunded = isActive && index === lastIndex && !isNegative;
              const useTwoLines = TWO_LINE_STAGE_KEYS.has(stage.key);
              const labels = splitStageLabel(stage.key, stage.label);

              const circleStyle: React.CSSProperties = (() => {
                if (isNegative && isActive) {
                  return {
                    backgroundColor: negativeColor,
                    borderColor: negativeColor,
                    color: "#ffffff",
                  };
                }
                if (isCompleted || isFunded) {
                  return {
                    backgroundColor: accentDark,
                    borderColor: accentDark,
                    color: "#ffffff",
                  };
                }
                if (isActive) {
                  return {
                    backgroundColor: isDark ? "#0F172A" : "#ffffff",
                    borderColor: holdLabel ? holdColor : accentDark,
                    color: holdLabel ? holdColor : accentDark,
                  };
                }
                return {
                  backgroundColor: isDark ? "#1E293B" : "#ffffff",
                  borderColor: trackColor,
                  color: isDark ? "#94A3B8" : "#94A3B8",
                };
              })();

              return (
                <li
                  key={stage.key}
                  className="flex w-[4.75rem] shrink-0 flex-col items-center text-center sm:w-[5.25rem]"
                  aria-current={isActive ? "step" : undefined}
                  title={stage.label}
                >
                  <span
                    className={cn(
                      "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors sm:h-9 sm:w-9 sm:text-sm",
                      isActive && !isNegative && "ring-4",
                    )}
                    style={{
                      ...circleStyle,
                      ...(isActive && !isNegative
                        ? ({ "--tw-ring-color": accentSoft } as React.CSSProperties)
                        : {}),
                    }}
                  >
                    {isCompleted || isFunded ? (
                      <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                    ) : isNegative && isActive ? (
                      <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                    ) : (
                      index + 1
                    )}
                  </span>

                  {useTwoLines ? (
                    <>
                      <span
                        className={cn(
                          "mt-1.5 w-full px-0.5 text-[10px] font-medium leading-tight sm:mt-2 sm:text-xs",
                          isActive ? "font-semibold" : "text-muted-foreground",
                        )}
                        style={
                          isActive
                            ? { color: isNegative ? negativeColor : holdLabel ? holdColor : accentDark }
                            : undefined
                        }
                      >
                        {labels.primary}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 w-full px-0.5 text-[10px] font-semibold leading-tight sm:text-xs",
                          isActive ? "" : "text-muted-foreground",
                        )}
                        style={
                          isActive
                            ? { color: isNegative ? negativeColor : holdLabel ? holdColor : accentDark }
                            : undefined
                        }
                      >
                        {labels.secondary}
                      </span>
                    </>
                  ) : (
                    <span
                      className={cn(
                        "mt-1.5 w-full px-0.5 text-[10px] font-medium leading-tight sm:mt-2 sm:text-xs",
                        isActive ? "font-semibold" : "text-muted-foreground",
                      )}
                      style={
                        isActive
                          ? { color: isNegative ? negativeColor : holdLabel ? holdColor : accentDark }
                          : undefined
                      }
                    >
                      {labels.primary}
                    </span>
                  )}
                  {isActive && holdLabel ? (
                    <span
                      className="mt-1 w-full max-w-full whitespace-normal break-words rounded-md px-1 py-0.5 text-center text-[9px] font-semibold uppercase leading-tight sm:text-[10px]"
                      style={{ color: holdColor, backgroundColor: holdSoft }}
                    >
                      {holdLabel}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </HorizontalScrollFade>
    </div>
  );
};

export default ApplicationProgressBar;
