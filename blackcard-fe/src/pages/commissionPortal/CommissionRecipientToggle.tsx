import { cn } from '@/lib/utils';
import type { CommissionRecipientType } from './commissionRecipientShared';

type CommissionRecipientToggleProps = {
    value: CommissionRecipientType;
    onChange: (value: CommissionRecipientType) => void;
    className?: string;
};

export function CommissionRecipientToggle({
    value,
    onChange,
    className,
}: CommissionRecipientToggleProps) {
    return (
        <div
            className={cn(
                'inline-flex rounded-lg border border-input bg-muted/40 p-0.5',
                className,
            )}
            role="group"
            aria-label="Commission recipient"
        >
            {(
                [
                    { key: 'iso' as const, label: 'ISO' },
                    { key: 'underwriter' as const, label: 'Underwriter' },
                ] as const
            ).map(({ key, label }) => (
                <button
                    key={key}
                    type="button"
                    aria-pressed={value === key}
                    onClick={() => onChange(key)}
                    className={cn(
                        'rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                        value === key
                            ? 'bg-[image:var(--brand-gradient)] text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}
