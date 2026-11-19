import { useCallback, useState } from "react";
import { parseMonthLabelToYYYYMM } from "../utils/calculateMonthlyNetCredit";

/*
 * Click-to-sort for preview table columns (Bank Analysis Month / Net Credit,
 * Positions Month). Each click cycles: default order → ascending → descending
 * → default order. "Default" is whatever order the preview already renders, so
 * unsorting returns the table exactly as it was.
 *
 * The rendered order is what Copy puts on the clipboard: the copy pipeline
 * clones the live DOM, so the pasted email follows the chosen sort. The arrow
 * glyph carries data-preview-sort-indicator and is stripped from the copy and
 * the PDF — an email cannot sort, so the arrow would only be noise there.
 */

const NEXT_DIR = { none: "asc", asc: "desc", desc: "none" };

/** Per-modal sort state: { [tableId]: { column, dir } }. */
export function usePreviewTableSort() {
  const [sorts, setSorts] = useState({});

  const toggleSort = useCallback((tableId, column) => {
    setSorts((prev) => {
      const current = prev[tableId];
      const dir = current?.column === column ? NEXT_DIR[current.dir] || "asc" : "asc";
      return { ...prev, [tableId]: { column, dir } };
    });
  }, []);

  const getSort = useCallback(
    (tableId) => {
      const s = sorts[tableId];
      return s && s.dir !== "none" ? s : null;
    },
    [sorts]
  );

  return { getSort, toggleSort };
}

/** Month label ("September 2026", "October MTD") → sortable number; NaN when unparseable. */
export function monthLabelSortValue(label) {
  const yyyyMm = parseMonthLabelToYYYYMM(String(label ?? "").trim());
  if (!yyyyMm) return NaN;
  const [y, m] = yyyyMm.split("-").map(Number);
  return y * 12 + (m - 1);
}

/** Date value → sortable number; NaN when missing or invalid. */
export function dateSortValue(value) {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? NaN : t;
}

/**
 * Return `items` reordered by `sort` ({ dir }) using `valueOf(item)`.
 * No sort → the array unchanged. Stable; items without a value stay last.
 */
export function applyPreviewSort(items, sort, valueOf) {
  if (!sort || !Array.isArray(items)) return items;
  const sign = sort.dir === "desc" ? -1 : 1;
  return items
    .map((item, index) => ({ item, index, value: valueOf(item) }))
    .sort((a, b) => {
      const aMissing = a.value == null || Number.isNaN(a.value);
      const bMissing = b.value == null || Number.isNaN(b.value);
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (!aMissing && a.value !== b.value) return (a.value - b.value) * sign;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

/** Props that make a <th> a sort toggle. Spread onto the header cell, and add
    the `cursor-pointer select-none` classes to it. */
export function sortableThProps(tableId, column, toggleSort) {
  return {
    onClick: () => toggleSort(tableId, column),
    title: "Click to sort",
    "data-preview-sortable": "true",
  };
}

/** Arrow after a sortable header label: ↕ unsorted, ↑ ascending, ↓ descending. */
export function SortIndicator({ sort, column }) {
  const dir = sort?.column === column ? sort.dir : null;
  const glyph = dir === "asc" ? "↑" : dir === "desc" ? "↓" : "↕";
  return (
    <span
      data-preview-sort-indicator="true"
      aria-hidden="true"
      style={{ marginLeft: 4, opacity: dir ? 1 : 0.45, fontWeight: 700 }}
    >
      {glyph}
    </span>
  );
}

/** Remove sort arrows from a cloned preview (clipboard / PDF). */
export function stripSortIndicators(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("[data-preview-sort-indicator]").forEach((el) => el.remove());
  root.querySelectorAll("[data-preview-sortable]").forEach((el) => {
    el.removeAttribute("title");
    el.removeAttribute("data-preview-sortable");
  });
}
