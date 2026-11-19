import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ContractSpaActionCardProps = {
    currentSpa?: string | null;
    onCalculate: () => void;
    className?: string;
    compact?: boolean;
};

/** Prominent entry point for SPA (Specified Percentage) calculator in contract flow. */
export function ContractSpaActionCard({
    currentSpa,
    onCalculate,
    className,
    compact = false,
}: ContractSpaActionCardProps) {
    const spaDisplay = String(currentSpa ?? "").trim();

    return (
        <div
            className={cn(
                "rounded-xl border border-[var(--brand)]/25 bg-gradient-to-br from-[var(--brand)]/8 via-white to-slate-50/90 p-4 shadow-sm dark:border-[var(--brand)]/30 dark:from-[var(--brand)]/12 dark:via-slate-900 dark:to-slate-900",
                className,
            )}
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                        <Calculator
                            className="h-4 w-4 shrink-0 text-[var(--brand)] dark:text-[var(--brand-accent)]"
                            aria-hidden
                        />
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            Specified Percentage (SPA)
                        </h3>
                    </div>
                    {!compact ? (
                        <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-400">
                            SPA = (total monthly payments ÷ average credits of last 3 months) ×
                            100. Uses scrubbing positions and bank analysis credits.
                        </p>
                    ) : null}
                    {spaDisplay ? (
                        <p className="text-xs font-medium text-[var(--brand)] dark:text-[var(--brand-accent)]">
                            Current value: {spaDisplay}%
                        </p>
                    ) : (
                        <p className="text-xs italic text-slate-500 dark:text-slate-400">
                            Not calculated yet
                        </p>
                    )}
                </div>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-9 shrink-0 gap-1.5 border-[var(--brand)]/35 text-[var(--brand)] hover:bg-[var(--brand)]/10 dark:text-[var(--brand-accent)]"
                    onClick={onCalculate}
                >
                    <Calculator className="h-3.5 w-3.5" aria-hidden />
                    Calculate SPA
                </Button>
            </div>
        </div>
    );
}
