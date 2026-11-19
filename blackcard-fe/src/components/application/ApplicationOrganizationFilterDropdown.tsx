import { Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  APPLICATION_ORGANIZATION_FILTER_OPTIONS,
  applicationOrganizationFilterLabel,
} from "@/lib/applicationsListParams";
import { cn } from "@/lib/utils";

type ApplicationOrganizationFilterDropdownProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
};

export function ApplicationOrganizationFilterDropdown({
  value,
  onChange,
  className,
  disabled,
}: ApplicationOrganizationFilterDropdownProps) {
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
            {applicationOrganizationFilterLabel(value)}
          </span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange("all")}>
          All organizations
        </DropdownMenuItem>
        {APPLICATION_ORGANIZATION_FILTER_OPTIONS.map((opt) => (
          <DropdownMenuItem key={opt.value} onClick={() => onChange(opt.value)}>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
