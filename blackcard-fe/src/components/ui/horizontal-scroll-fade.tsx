import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface HorizontalScrollFadeProps {
  children: ReactNode;
  className?: string;
  /** Re-run scroll-into-view when this value changes (e.g. active tab id). */
  scrollKey?: string;
}

/**
 * Horizontal strip with hidden scrollbar and optional arrow controls.
 * Avoids the native browser scrollbar while still allowing overflow navigation.
 */
export function HorizontalScrollFade({
  children,
  className,
  scrollKey,
}: HorizontalScrollFadeProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const hasOverflow = scrollWidth > clientWidth + 2;
    setOverflows(hasOverflow);
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    for (const child of el.children) {
      ro.observe(child);
    }

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, children]);

  useEffect(() => {
    if (!scrollKey) return;
    const el = scrollRef.current;
    if (!el) return;

    const active =
      el.querySelector('[data-state="active"]') ??
      el.querySelector('[aria-current="step"]');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [scrollKey]);

  const scrollBy = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * Math.max(180, el.clientWidth * 0.55),
      behavior: "smooth",
    });
  };

  const arrowBtnClass =
    "flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-30 dark:border-slate-600 dark:bg-slate-900";

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {overflows ? (
        <button
          type="button"
          className={arrowBtnClass}
          onClick={() => scrollBy(-1)}
          disabled={!canScrollLeft}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      <div
        ref={scrollRef}
        className="scrollbar-hide min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:h-0"
      >
        {children}
      </div>

      {overflows ? (
        <button
          type="button"
          className={arrowBtnClass}
          onClick={() => scrollBy(1)}
          disabled={!canScrollRight}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
