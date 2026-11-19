import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDispatch } from 'react-redux';
import { ChevronDown, Loader2, Tag } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AppDispatch } from '@/redux/store';
import { updateApplication } from '@/redux/actions/applicationActions';
import {
  PAYMENT_CATEGORY_GROUPS,
  resolvePaymentCategoryOption,
} from './paymentDealTags';
import { clearPortfolioSessionCache } from './dealsPortfolio/portfolioApi';

type DealTagSelectProps = {
  applicationId: string | null | undefined;
  value: string | null | undefined;
  onChanged?: (next: string | null) => void;
  className?: string;
  /** Compact trigger for table cells. */
  size?: 'sm' | 'md';
};

export function DealTagSelect({
  applicationId,
  value,
  onChanged,
  className,
  size = 'md',
}: DealTagSelectProps) {
  const dispatch = useDispatch<AppDispatch>();
  const queryClient = useQueryClient();
  const [optimistic, setOptimistic] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOptimistic(undefined);
  }, [value, applicationId]);

  const currentValue = optimistic !== undefined ? optimistic : (value ?? null);
  const currentOption = resolvePaymentCategoryOption(currentValue);
  const CurrentIcon = currentOption?.icon ?? Tag;
  const disabled = !applicationId || saving;

  const save = async (nextCategory: string | null) => {
    if (!applicationId) return;
    const previous = currentValue;
    setOptimistic(nextCategory);
    setSaving(true);
    try {
      await dispatch(
        updateApplication({
          id: applicationId,
          data: { category: nextCategory },
        }),
      ).unwrap();
      await queryClient.invalidateQueries({ queryKey: ['portfolio'] });
      clearPortfolioSessionCache();
      onChanged?.(nextCategory);
      toast.success(nextCategory ? `Tagged as "${nextCategory}"` : 'Tag cleared');
    } catch (error: unknown) {
      setOptimistic(previous);
      const message =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: unknown }).message ?? '')
          : '';
      toast.error(message.trim() || 'Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-between gap-1.5 rounded-md border border-border bg-background text-left text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60',
            size === 'md' ? 'h-9 min-w-[10.5rem] max-w-[16rem] px-3' : 'h-8 min-w-[10rem] max-w-[14rem] px-2',
            className,
          )}
          title={currentOption?.label ?? 'Tag this deal'}
          aria-label="Tag this deal"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : (
              <CurrentIcon
                className={cn('h-3.5 w-3.5 shrink-0', currentOption?.iconClassName ?? 'text-muted-foreground')}
                aria-hidden
              />
            )}
            <span className="min-w-0 truncate">
              {currentOption?.label ?? (currentValue ? currentValue : (
                <span className="text-muted-foreground">Tag deal</span>
              ))}
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[16rem] p-1">
        {currentValue ? (
          <DropdownMenuItem
            className="cursor-pointer text-xs text-muted-foreground"
            onClick={() => {
              void save(null);
            }}
          >
            — Clear tag
          </DropdownMenuItem>
        ) : null}
        {PAYMENT_CATEGORY_GROUPS.map((group, index) => (
          <div key={group.label}>
            {index > 0 || currentValue ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </DropdownMenuLabel>
            {group.options.map((option) => {
              const Icon = option.icon;
              const isSelected =
                (currentValue ?? '').trim().toLowerCase() === option.value.toLowerCase();
              return (
                <DropdownMenuItem
                  key={`deal-tag-${option.value}`}
                  className={cn('cursor-pointer text-xs', isSelected && 'bg-muted font-semibold')}
                  onClick={() => {
                    void save(option.value);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', option.iconClassName)} aria-hidden />
                    <span>{option.label}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DealTagPill({ value }: { value: string | null | undefined }) {
  if (!value?.trim()) return null;
  const option = resolvePaymentCategoryOption(value);
  const Icon = option?.icon ?? Tag;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        option?.pillClassName ?? 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className={cn('size-3', option?.iconClassName ?? 'text-muted-foreground')} aria-hidden />
      {option?.label ?? value}
    </span>
  );
}
