"use client";

import { useId, useMemo, useState, type CSSProperties, type FocusEvent } from "react";
import { X } from "lucide-react";
import { cn, formatNumberUS, parseNumberUS } from "@/lib/utils";

function sanitizeDecimal(str: string): string {
  if (str == null) return "";
  let s = String(str).replace(/[^0-9.-]/g, "");
  const parts = s.split(".");
  if (parts.length > 2) s = parts[0] + "." + parts.slice(1).join("");
  if (s.indexOf("-", 1) !== -1) s = s.replace(/-/g, "");
  return s;
}

function seedTags(val: string | null | undefined): number[] {
  if (val == null || String(val).trim() === "") return [];
  const n = parseNumberUS(val);
  if (Number.isNaN(n)) return [];
  return [n];
}

function sumNums(list: number[]): number {
  return list.reduce((a, n) => a + (Number(n) || 0), 0);
}

export type TaggedCurrencyCellProps = {
  /** Stored field value (manual/total as CRM stores it). */
  value: string;
  onCommit: (nextFormatted: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Match sibling inputs (e.g. Positions light-blue border). */
  style?: CSSProperties;
  /** Gray pills: position funding amounts for this bank+month (Funding Amt only). */
  allocationAmounts?: number[];
  /**
   * If true, stored `value` is MANUAL only (CRM loanTransfer).
   * Display total = value + sum(allocations); onCommit writes blue/manual sum only.
   */
  valueIsManualOnly?: boolean;
  /**
   * When true the gray allocation pills can be edited and removed like typed
   * ones. Doing so absorbs the allocations into this cell's manual value, so
   * the underlying Positions rows are never touched.
   */
  allocationsEditable?: boolean;
  /** Optional click when allocation gray pills / area should open breakdown. */
  onOpenBreakdown?: () => void;
  /** Fires when the cell expands (focus). */
  onExpand?: () => void;
};

/**
 * MCA-style multi-value currency cell: blue pills for typed amounts,
 * optional gray allocation pills, collapsed total, Enter/blur commit as US-formatted sum.
 */
export default function TaggedCurrencyCell({
  value,
  onCommit,
  disabled = false,
  placeholder = "",
  className,
  style,
  allocationAmounts,
  valueIsManualOnly = false,
  allocationsEditable = false,
  onOpenBreakdown,
  onExpand,
}: TaggedCurrencyCellProps) {
  const tagCellUid = useId();
  const [expanded, setExpanded] = useState(false);
  const [tags, setTags] = useState<number[]>(() => seedTags(value));
  const [input, setInput] = useState("");

  const allocList = useMemo(() => {
    if (!allocationAmounts?.length) return [] as number[];
    return allocationAmounts.filter((n) => Number.isFinite(n) && n !== 0);
  }, [allocationAmounts]);

  const allocSum = useMemo(() => sumNums(allocList), [allocList]);

  const collapsedDisplay = useMemo(() => {
    const manual = parseNumberUS(value);
    const manualOk = !Number.isNaN(manual) && String(value ?? "").trim() !== "";
    if (valueIsManualOnly) {
      const base = manualOk ? manual : 0;
      const total = base + allocSum;
      if (total <= 0 && !manualOk && allocSum <= 0) return "";
      if (total === 0 && !manualOk) return "";
      return formatNumberUS(total);
    }
    if (!manualOk) return "";
    return formatNumberUS(value);
  }, [value, valueIsManualOnly, allocSum]);

  const commitMerged = (nextTags: number[], pendingInputRaw: string) => {
    const merged = [...nextTags];
    const pend = parseNumberUS(pendingInputRaw);
    if (!Number.isNaN(pend) && String(pendingInputRaw ?? "").trim() !== "") {
      merged.push(pend);
    }
    const sum = sumNums(merged);
    onCommit(merged.length ? formatNumberUS(sum) : emptyValue);
    setTags(merged);
    setInput("");
  };

  const addPendingTagOnly = () => {
    const num = parseNumberUS(input);
    if (Number.isNaN(num)) return false;
    commitMerged([...tags, num], "");
    return true;
  };

  const removeTag = (idx: number) => {
    const next = tags.filter((_, i) => i !== idx);
    const sum = sumNums(next);
    onCommit(next.length ? formatNumberUS(sum) : emptyValue);
    setTags(next);
    setInput("");
  };

  /**
   * Absorb the position allocations into this cell's own tags. Allocations are
   * a view of Positions, so they cannot be changed in place; materializing them
   * turns the row into a manual Funding Amt holding the same total, which the
   * user can then edit freely. Allocations sort first, matching the pill order.
   */
  const materializeAllocations = () => [...allocList, ...tags];

  /**
   * What an emptied cell stores. Where allocations are editable a blank would
   * fall back to the Positions allocation, bringing back the very amounts the
   * user just removed, so an explicit 0 is stored instead.
   */
  const emptyValue = allocationsEditable ? "0" : "";

  const commitList = (next: number[], pendingInput = "") => {
    onCommit(next.length ? formatNumberUS(sumNums(next)) : emptyValue);
    setTags(next);
    setInput(pendingInput);
  };

  const startEditAllocation = (idx: number) => {
    const merged = materializeAllocations();
    const picked = merged[idx];
    if (picked == null) return;
    commitList(merged.filter((_, i) => i !== idx), String(picked));
  };

  const removeAllocation = (idx: number) => {
    const merged = materializeAllocations();
    commitList(merged.filter((_, i) => i !== idx));
  };

  const startEditTag = (idx: number) => {
    const picked = tags[idx];
    if (picked == null) return;
    const next = tags.filter((_, i) => i !== idx);
    const sum = sumNums(next);
    onCommit(next.length ? formatNumberUS(sum) : emptyValue);
    setTags(next);
    setInput(String(picked));
  };

  if (disabled) {
    const inner = collapsedDisplay;
    return (
      <div
        className={cn(
          "flex h-9 min-w-0 items-center rounded-md border border-slate-300 bg-slate-100 shadow-sm dark:border-slate-600 dark:bg-slate-800/70",
          className,
        )}
        style={style}
      >
        <span className="shrink-0 pl-2 text-xs text-slate-400">$</span>
        <span className="shrink-0 py-1.5 pl-1 pr-2 text-xs text-slate-400">
          {inner}
        </span>
      </div>
    );
  }

  const openExpanded = () => {
    onExpand?.();
    setTags(seedTags(value));
    setInput("");
    setExpanded(true);
  };

  const handleInputBlur = (e: FocusEvent<HTMLInputElement>) => {
    const rel = e.relatedTarget as HTMLElement | null;
    if (rel?.dataset?.tagCellId === tagCellUid) {
      return;
    }
    commitMerged(tags, input);
    setExpanded(false);
  };

  return (
    <div
      className={cn(
        "flex min-h-9 min-w-0 items-center rounded-md border border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-900",
        className,
      )}
      style={style}
    >
      <span className="shrink-0 pl-2 text-xs font-medium text-slate-400 dark:text-slate-500">$</span>
      {!expanded ? (
        <input
          readOnly
          type="text"
          value={collapsedDisplay}
          placeholder={placeholder}
          onFocus={openExpanded}
          className="min-w-0 flex-1 border-0 bg-transparent py-1.5 pl-1 pr-2 text-left text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
        />
      ) : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 px-2 py-0.5">
          {allocList.map((amt, idx) =>
            allocationsEditable ? (
              <span
                key={`alloc-${idx}`}
                className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                title="From Positions (Amount Funded) - editing keeps this bank row only, the position is not changed"
              >
                <button
                  type="button"
                  data-tag-cell-id={tagCellUid}
                  className="hover:underline"
                  onClick={() => startEditAllocation(idx)}
                >
                  {formatNumberUS(amt)}
                </button>
                <button
                  type="button"
                  data-tag-cell-id={tagCellUid}
                  className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
                  aria-label="Remove"
                  onClick={() => removeAllocation(idx)}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ) : (
              <span
                key={`alloc-${idx}`}
                role={onOpenBreakdown ? "button" : undefined}
                tabIndex={onOpenBreakdown ? 0 : undefined}
                onClick={() => onOpenBreakdown?.()}
                onKeyDown={(e) => {
                  if (!onOpenBreakdown) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenBreakdown();
                  }
                }}
                className={cn(
                  "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300",
                  onOpenBreakdown && "cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700",
                )}
                title="From Positions (Amount Funded)"
              >
                {formatNumberUS(amt)}
              </span>
            ),
          )}
          {tags.map((tagValue, tagIndex) => (
            <span
              key={`tag-${tagIndex}`}
              className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
            >
              <button
                type="button"
                data-tag-cell-id={tagCellUid}
                className="hover:underline"
                onClick={() => startEditTag(tagIndex)}
              >
                {formatNumberUS(tagValue)}
              </button>
              <button
                type="button"
                data-tag-cell-id={tagCellUid}
                className="text-sky-700 hover:text-sky-900 dark:text-sky-300 dark:hover:text-sky-100"
                aria-label="Remove"
                onClick={() => removeTag(tagIndex)}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={input}
            placeholder={placeholder}
            onChange={(e) => setInput(sanitizeDecimal(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                addPendingTagOnly();
                return;
              }
              if (
                e.key === "Backspace" &&
                !e.ctrlKey &&
                !e.altKey &&
                !e.metaKey &&
                sanitizeDecimal(input) === "" &&
                tags.length > 0
              ) {
                e.preventDefault();
                removeTag(tags.length - 1);
              }
            }}
            onBlur={handleInputBlur}
            className="min-w-[72px] flex-1 border-0 bg-transparent py-0.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      )}
    </div>
  );
}
