import { Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type ClaimUserFilterOption = { id: string; name: string };

type ApplicationClaimUserFilterDropdownProps = {
  allLabel: string;
  value: string;
  options: ClaimUserFilterOption[];
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function ApplicationClaimUserFilterDropdown({
  allLabel,
  value,
  options,
  onChange,
  className,
  disabled,
}: ApplicationClaimUserFilterDropdownProps) {
  const selectedLabel =
    value === "all"
      ? allLabel
      : options.find((opt) => opt.id === value)?.name ?? allLabel;

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
          <span className="max-w-[8rem] truncate sm:max-w-[10rem]">
            {selectedLabel}
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-50 max-h-72 overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange("all")}>{allLabel}</DropdownMenuItem>
        {options.map((opt) => (
          <DropdownMenuItem key={opt.id} onClick={() => onChange(opt.id)}>
            {opt.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
