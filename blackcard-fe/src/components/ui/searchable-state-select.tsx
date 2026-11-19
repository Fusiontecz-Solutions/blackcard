import { useMemo, useState } from "react";
import { US_STATES } from "@/constants/usStates";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type SearchableStateSelectProps = {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
    triggerClassName?: string;
    contentClassName?: string;
};

export function pickUsStateForSelect(value: unknown): string {
    const v = String(value ?? "").trim();
    if (!v) return "";
    const exact = US_STATES.find((s) => s === v);
    if (exact) return exact;
    return US_STATES.find((s) => s.toLowerCase() === v.toLowerCase()) ?? "";
}

export function SearchableStateSelect({
    id,
    value,
    onValueChange,
    disabled = false,
    placeholder = "Select state",
    triggerClassName,
    contentClassName,
}: SearchableStateSelectProps) {
    const [query, setQuery] = useState("");
    const normalizedValue = pickUsStateForSelect(value);

    const filteredStates = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return US_STATES;
        return US_STATES.filter((s) => s.toLowerCase().includes(q));
    }, [query]);

    return (
        <Select
            value={normalizedValue || undefined}
            disabled={disabled}
            onValueChange={(v: string) => {
                onValueChange(v);
                setQuery("");
            }}
        >
            <SelectTrigger
                id={id}
                className={cn(
                    "h-10 w-full rounded-md border border-[var(--brand)]/20 bg-background px-3 py-2 text-sm shadow-sm focus:ring-[var(--brand)]/25 disabled:opacity-60 dark:border-slate-600",
                    triggerClassName,
                )}
            >
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent position="popper" className={cn("z-[10100] max-h-72", contentClassName)}>
                <div className="sticky top-0 z-10 border-b bg-popover p-2">
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search states…"
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.stopPropagation()}
                    />
                </div>
                {filteredStates.length > 0 ? (
                    filteredStates.map((state) => (
                        <SelectItem key={state} value={state}>
                            {state}
                        </SelectItem>
                    ))
                ) : (
                    <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                        No states match your search.
                    </div>
                )}
            </SelectContent>
        </Select>
    );
}
