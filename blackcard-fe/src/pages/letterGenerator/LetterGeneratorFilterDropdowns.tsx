import type { ReactNode } from "react";
import { Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  LETTER_FUNDER_FILTER_OPTIONS,
  LETTER_KIND_FILTER_OPTIONS,
  LETTER_SEND_STATUS_FILTER_OPTIONS,
  letterFunderFilterLabel,
  letterKindFilterLabel,
  letterSendStatusFilterLabel,
  type LetterFunderFilterValue,
  type LetterKindFilterValue,
  type LetterSendStatusFilterValue,
} from "@/pages/letterGenerator/letterSendStatus";

type FilterDropdownShellProps = {
  label: string;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
};

function FilterDropdownShell({
  label,
  className,
  disabled,
  children,
}: FilterDropdownShellProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-10 gap-2 text-muted-foreground bg-card shrink-0",
            className,
          )}
        >
          <Filter className="size-4" aria-hidden />
          <span className="max-w-[9rem] truncate sm:max-w-none">{label}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-50">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type LetterSendStatusFilterDropdownProps = {
  value: LetterSendStatusFilterValue;
  onChange: (value: LetterSendStatusFilterValue) => void;
  className?: string;
  disabled?: boolean;
};

export function LetterSendStatusFilterDropdown({
  value,
  onChange,
  className,
  disabled,
}: LetterSendStatusFilterDropdownProps) {
  return (
    <FilterDropdownShell
      label={letterSendStatusFilterLabel(value)}
      className={className}
      disabled={disabled}
    >
      <DropdownMenuItem onClick={() => onChange("all")}>
        All send statuses
      </DropdownMenuItem>
      {LETTER_SEND_STATUS_FILTER_OPTIONS.map((opt) => (
        <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
          {opt.label}
        </DropdownMenuItem>
      ))}
    </FilterDropdownShell>
  );
}

type LetterKindFilterDropdownProps = {
  value: LetterKindFilterValue;
  onChange: (value: LetterKindFilterValue) => void;
  className?: string;
  disabled?: boolean;
};

export function LetterKindFilterDropdown({
  value,
  onChange,
  className,
  disabled,
}: LetterKindFilterDropdownProps) {
  return (
    <FilterDropdownShell
      label={letterKindFilterLabel(value)}
      className={className}
      disabled={disabled}
    >
      <DropdownMenuItem onClick={() => onChange("all")}>
        Select
      </DropdownMenuItem>
      {LETTER_KIND_FILTER_OPTIONS.map((opt) => (
        <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
          {opt.label}
        </DropdownMenuItem>
      ))}
    </FilterDropdownShell>
  );
}

type LetterFunderFilterDropdownProps = {
  value: LetterFunderFilterValue;
  onChange: (value: LetterFunderFilterValue) => void;
  className?: string;
  disabled?: boolean;
};

export function LetterFunderFilterDropdown({
  value,
  onChange,
  className,
  disabled,
}: LetterFunderFilterDropdownProps) {
  return (
    <FilterDropdownShell
      label={letterFunderFilterLabel(value)}
      className={className}
      disabled={disabled}
    >
      <DropdownMenuItem onClick={() => onChange("all")}>
        All funders
      </DropdownMenuItem>
      {LETTER_FUNDER_FILTER_OPTIONS.map((opt) => (
        <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
          {opt.label}
        </DropdownMenuItem>
      ))}
    </FilterDropdownShell>
  );
}
