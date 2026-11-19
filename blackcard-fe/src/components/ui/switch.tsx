import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
}

/** Accessible toggle switch (button with role="switch"); no extra dependency. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, disabled, className, size = 'md', ...rest },
  ref,
) {
  const dims = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'size-4' : 'size-5';
  const shift = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onCheckedChange?.(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'bg-emerald-500' : 'bg-muted-foreground/30',
        dims,
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block rounded-full bg-white shadow ring-0 transition-transform',
          knob,
          checked ? shift : 'translate-x-0',
        )}
      />
    </button>
  );
});

export default Switch;
