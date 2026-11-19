import { Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  APPLICATIONS_STATUS_FILTER_OPTIONS,
  applicationsPipelineFilterLabel,
} from "@/lib/applicationsPipelineFilter";
import { cn } from "@/lib/utils";

type ApplicationStatusFilterDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function ApplicationStatusFilterDropdown({
  value,
  onChange,
  className,
  disabled,
}: ApplicationStatusFilterDropdownProps) {
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
            {applicationsPipelineFilterLabel(value)}
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="z-50 max-h-[min(24rem,70vh)] overflow-y-auto">
        <DropdownMenuItem onClick={() => onChange("all")}>All</DropdownMenuItem>
        {APPLICATIONS_STATUS_FILTER_OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.filterValue}
            onClick={() => onChange(opt.filterValue)}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
