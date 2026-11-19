import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatAccent = 'default' | 'emerald' | 'sky' | 'amber' | 'red' | 'violet';

interface SyndicatorAdminStatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Full value shown on hover (e.g. exact currency behind a compact figure). */
  title?: string;
  /** Optional small sub-line under the value. */
  hint?: string;
  accent?: StatAccent;
  /** Optional classes applied to the card root — e.g. a gradient tone background. */
  toneClassName?: string;
}

const ACCENT_CHIP: Record<StatAccent, string> = {
  default: 'bg-muted text-muted-foreground',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  sky: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  amber: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  red: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300',
  violet: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
};

export default function SyndicatorAdminStatCard({
  label,
  value,
  icon: Icon,
  title,
  hint,
  accent = 'default',
  toneClassName,
}: SyndicatorAdminStatCardProps) {
  return (
    <Card className={cn('gap-0 py-0 shadow-sm transition-shadow hover:shadow-md', toneClassName)}>
      <CardContent className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
            {label}
          </p>
          <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', ACCENT_CHIP[accent])}>
            <Icon className="size-4" aria-hidden />
          </span>
        </div>
        <p
          className="text-2xl font-bold tabular-nums leading-none text-foreground"
          title={title ?? value}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground leading-tight">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
