import { Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  APPLICATION_TYPE_FILTER_OPTIONS,
  applicationTypeFilterLabel,
} from "@/lib/applicationsListParams";
import { cn } from "@/lib/utils";

type ApplicationTypeFilterDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function ApplicationTypeFilterDropdown({
  value,
  onChange,
  className,
  disabled,
}: ApplicationTypeFilterDropdownProps) {
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
          <span className="max-w-[9rem] truncate sm:max-w-none">
            {applicationTypeFilterLabel(value)}
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-50">
        <DropdownMenuItem onClick={() => onChange("all")}>All types</DropdownMenuItem>
        {APPLICATION_TYPE_FILTER_OPTIONS.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
