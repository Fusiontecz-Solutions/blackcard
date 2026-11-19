import type { Column } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

type DataTableSortHeaderProps<TData> = {
  column: Column<TData, unknown>;
  label: string;
  className?: string;
};

export default function DataTableSortHeader<TData>({
  column,
  label,
  className,
}: DataTableSortHeaderProps<TData>) {
  if (!column.getCanSort()) {
    return (
      <span className={className ?? "font-medium text-foreground uppercase tracking-wide"}>
        {label}
      </span>
    );
  }

  const sorted = column.getIsSorted();
  const Icon =
    sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;

  return (
    <button
      type="button"
      className="inline-flex h-auto w-full cursor-pointer items-center justify-start gap-1 border-0 bg-transparent p-0 text-left font-medium text-foreground hover:bg-transparent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      onClick={() => column.toggleSorting(sorted === "asc")}
      aria-label={`Sort by ${label}`}
    >
      <span className="uppercase tracking-wide">{label}</span>
      <Icon className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
    </button>
  );
}
