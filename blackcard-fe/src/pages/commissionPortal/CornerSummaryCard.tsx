import { cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type CornerSummaryCardProps = {
    isDark: boolean
    title: string
    icon: ReactNode
    /** Icon size in px, controlled by caller. */
    iconSize?: number
    /** When true, count/suffix/amount show pulse placeholders (no text). */
    isLoading?: boolean
    /** Large number, top-left (e.g. deal count). */
    countValue: string
    /** Optional line under the count (e.g. “deals”, “paid deals”). */
    countSuffix?: string
    /** Small caption, bottom-left. */
    footLeft?: string
    /** Optional secondary line under `footLeft` (e.g. month-over-month change). */
    footNote?: string
    /** Optional class for the foot note (e.g. trend color). */
    footNoteClassName?: string
    /** Tiny label above the amount, bottom-right. */
    amountLabel?: string
    /** Main monetary (or summary) value, bottom-right. */
    amountValue: string
    /** Bumps every text row up one step. Opt-in so shared callers keep the compact default. */
    textScale?: 'default' | 'lg'
    /** Optional background/border tint for the whole card (overrides the default surface). */
    toneClassName?: string
}

/** Compact KPI tile: title + icon, count, footer with caption and amount on separate rows. */
export function CornerSummaryCard({
    isDark,
    title,
    icon,
    iconSize = 20,
    isLoading = false,
    countValue,
    countSuffix,
    footLeft,
    footNote,
    footNoteClassName,
    amountLabel,
    amountValue,
    textScale = 'default',
    toneClassName,
}: CornerSummaryCardProps) {
    const lg = textScale === 'lg'
    const titleCls = lg ? 'text-[10px]' : 'text-[11px]'
    const countCls = lg ? 'text-xl md:text-[1.5rem]' : 'text-xl md:text-2xl'
    const suffixCls = lg ? 'text-[10px]' : 'text-[11px]'
    const footLeftCls = lg ? 'text-[10px]' : 'text-[11px]'
    const footNoteCls = lg ? 'text-[10px]' : 'text-[10px]'
    const amountLabelCls = lg ? 'text-[9px]' : 'text-[9px]'
    const amountCls = lg ? 'text-sm md:text-base' : 'text-base md:text-lg'
    const renderedIcon = isValidElement(icon)
        ? cloneElement(icon as ReactElement<{ size?: number; style?: CSSProperties }>, {
              size: iconSize,
              style: {
                  ...(icon.props as { style?: CSSProperties }).style,
                  width: iconSize,
                  height: iconSize,
              },
          })
        : icon

    return (
        <div
            className={cn(
                'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border px-3 pb-2 shadow-lg',
                isDark ? 'border-[#324154] bg-[#13161D]' : 'border-[#E2ECF4] bg-white',
                toneClassName,
            )}
        >
            <div className="shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <span className={`min-w-0 truncate ${titleCls} font-semibold uppercase text-muted-foreground`}>
                        {title}
                    </span>
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full p-1">
                        {renderedIcon}
                    </span>
                </div>
                <div className="mt-1.5 text-left">
                    {isLoading ? (
                        <span
                            className="inline-block h-8 w-12 rounded-md bg-muted/70 animate-pulse md:h-9 md:w-14"
                            aria-hidden
                        />
                    ) : (
                        <p className={`${countCls} font-bold tabular-nums leading-none text-foreground`}>
                            {countValue}
                        </p>
                    )}
                    {!isLoading && countSuffix ? (
                        <p className={`mt-0.5 ${suffixCls} font-medium leading-tight text-muted-foreground`}>
                            {countSuffix}
                        </p>
                    ) : null}
                </div>
            </div>

            <div className="min-h-0 flex-1" aria-hidden />

            <div
                className={`shrink-0 border-t pt-2 ${
                    isDark ? 'border-white/10' : 'border-border/60'
                }`}
            >
                {(footLeft || footNote) && (
                    <div className="min-w-0 w-full">
                        {footLeft ? (
                            <p className={`${footLeftCls} font-medium leading-snug text-muted-foreground`}>
                                {footLeft}
                            </p>
                        ) : null}
                        {footNote ? (
                            <p
                                className={`mt-0.5 ${footNoteCls} leading-snug ${
                                    footNoteClassName ??
                                    (isDark ? 'text-muted-foreground' : 'text-muted-foreground')
                                }`}
                            >
                                {footNote}
                            </p>
                        ) : null}
                    </div>
                )}
                <div
                    className={`w-full shrink-0 text-right ${
                        footLeft || footNote ? 'mt-1' : ''
                    }`}
                >
                    {amountLabel ? (
                        <p className={`mb-0.5 ${amountLabelCls} font-semibold uppercase tracking-wider text-muted-foreground`}>
                            {amountLabel}
                        </p>
                    ) : null}
                    {isLoading ? (
                        <span
                            className="ml-auto inline-block h-6 w-14 rounded-md bg-muted/70 animate-pulse md:h-7 md:w-16"
                            aria-hidden
                        />
                    ) : (
                        <p className={`${amountCls} font-bold tabular-nums leading-tight text-foreground whitespace-nowrap`}>
                            {amountValue}
                        </p>
                    )}
                </div>
            </div>
        </div>
    )
}
