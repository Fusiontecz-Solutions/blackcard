import { cn } from "@/lib/utils";

const ROWS: string[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

type PhoneDialPadProps = {
  onDigit: (digit: string) => void;
  disabled?: boolean;
  className?: string;
};

const keyBase =
  "group relative flex h-14 w-full items-center justify-center rounded-2xl text-xl font-semibold tabular-nums tracking-tight " +
  "border border-border/50 bg-gradient-to-b from-background to-muted/40 text-foreground shadow-sm " +
  "transition-all duration-200 ease-out " +
  "hover:border-[var(--brand)]/35 hover:from-muted/50 hover:to-muted/30 hover:shadow-[0_0_24px_-8px_rgba(39,109,156,0.45)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 " +
  "dark:border-white/[0.08] dark:from-white/[0.07] dark:to-white/[0.02] dark:text-white/95 " +
  "dark:hover:border-[var(--brand)]/40 dark:hover:from-white/[0.1] dark:hover:to-white/[0.04] dark:hover:shadow-[0_0_28px_-6px_rgba(39,109,156,0.55)] " +
  "dark:focus-visible:ring-offset-0 sm:h-[3.25rem] sm:text-2xl";

export function PhoneDialPad({ onDigit, disabled, className }: PhoneDialPadProps) {
  return (
    <div className={cn("grid w-full max-w-[280px] gap-2.5 sm:max-w-[300px]", className)}>
      {ROWS.map((row, ri) => (
        <div key={ri} className="grid grid-cols-3 gap-2.5">
          {row.map((d) => (
            <button
              key={d}
              type="button"
              disabled={disabled}
              className={keyBase}
              aria-label={d === "*" ? "Star" : d === "#" ? "Pound" : `Digit ${d}`}
              onClick={() => onDigit(d)}
            >
              <span className="relative z-10">{d}</span>
              <span
                className="pointer-events-none absolute inset-px rounded-[0.9rem] bg-gradient-to-b from-white/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:from-white/12"
                aria-hidden
              />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
