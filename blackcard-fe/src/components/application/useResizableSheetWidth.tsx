import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const DEFAULT_WIDTH_VW = 50;
const MIN_WIDTH_VW = 40;
const MAX_WIDTH_VW = 95;
const KEY_STEP_VW = 5;

const clamp = (vw: number) => Math.min(MAX_WIDTH_VW, Math.max(MIN_WIDTH_VW, vw));

function readStoredWidth(storageKey: string): number {
    try {
        const n = Number(window.localStorage.getItem(storageKey));
        return Number.isFinite(n) && n > 0 ? clamp(n) : DEFAULT_WIDTH_VW;
    } catch {
        return DEFAULT_WIDTH_VW;
    }
}

function storeWidth(storageKey: string, vw: number) {
    try {
        window.localStorage.setItem(storageKey, String(Math.round(vw)));
    } catch {
        /* private mode / blocked storage: width just isn't remembered */
    }
}

/**
 * Right-side sheet the user can widen by dragging its left edge (desktop only;
 * phones stay full width). Width is in vw, kept between 40 and 95, remembered
 * per browser; double-click the handle to reset.
 *
 * Put `style` on the SheetContent, use `widthClass` in place of a fixed
 * `sm:w-[…] sm:max-w-[…]`, and render `handle` as its first child.
 */
export function useResizableSheetWidth(storageKey: string): {
    style: CSSProperties;
    widthClass: string;
    isDragging: boolean;
    handle: ReactNode;
} {
    const [widthVw, setWidthVw] = useState(() => readStoredWidth(storageKey));
    const [isDragging, setIsDragging] = useState(false);
    const widthRef = useRef(widthVw);
    widthRef.current = widthVw;

    useEffect(() => {
        if (!isDragging) return;
        const onMove = (e: PointerEvent) => {
            setWidthVw(clamp(((window.innerWidth - e.clientX) / window.innerWidth) * 100));
        };
        const onUp = () => {
            setIsDragging(false);
            storeWidth(storageKey, widthRef.current);
        };
        const previousSelect = document.body.style.userSelect;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        return () => {
            document.body.style.userSelect = previousSelect;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
        };
    }, [isDragging, storageKey]);

    const setAndStore = useCallback(
        (vw: number) => {
            const next = clamp(vw);
            setWidthVw(next);
            storeWidth(storageKey, next);
        },
        [storageKey],
    );

    const handle = (
        <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panel"
            aria-valuenow={Math.round(widthVw)}
            aria-valuemin={MIN_WIDTH_VW}
            aria-valuemax={MAX_WIDTH_VW}
            tabIndex={0}
            title="Drag to resize · double-click to reset"
            onPointerDown={(e) => {
                e.preventDefault();
                setIsDragging(true);
            }}
            onDoubleClick={() => setAndStore(DEFAULT_WIDTH_VW)}
            onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    setAndStore(widthRef.current + KEY_STEP_VW);
                } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    setAndStore(widthRef.current - KEY_STEP_VW);
                }
            }}
            className={`absolute inset-y-0 left-0 z-20 hidden w-2 -translate-x-1/2 cursor-col-resize touch-none outline-none transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 sm:block ${
                isDragging ? "bg-primary/40" : ""
            }`}
        />
    );

    return {
        style: { "--sheet-width": `${widthVw}vw` } as CSSProperties,
        widthClass: "sm:w-[var(--sheet-width)] sm:max-w-[var(--sheet-width)]",
        isDragging,
        handle,
    };
}
