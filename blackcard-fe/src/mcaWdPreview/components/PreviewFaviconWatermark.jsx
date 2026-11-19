import { useEffect, useState } from "react";

/**
 * Background watermark sourced from the project's actual app/favicon.ico
 * (served at /favicon.ico). Not the Fusiontecz wordmark used in PreviewBrandLogo.
 *
 * Layered above table/row backgrounds (z-index: 5) so it stays visible across
 * tables, with fade baked into the PNG so on-screen preview and PDF stay faint.
 * Copied HTML uses the production HTTPS PNG as a single background on the
 * outer wrap table (not a flow <img>, not a data: URI). Ordinary wrapper and
 * data-cell fills in the clone are made transparent so that watermark can
 * show through. Preview UI and PDF capture are unchanged.
 */
export const FAVICON_WATERMARK_SRC = "/favicon.png";
/** Production HTTPS PNG — Gmail `background` attribute fallback (never localhost). */
export const FAVICON_EMAIL_WATERMARK_URL =
  "https://www.mca-calculator.fusiontecz.com/assets/favicon-watermark-v2.png";
export const FAVICON_WATERMARK_SIZE = 538;
export const FAVICON_WATERMARK_HEIGHT = 528;
export const FAVICON_WATERMARK_OPACITY = 0.07;
export const FAVICON_WATERMARK_Z_INDEX = 5;

const MARGIN_LEFT = -Math.round(FAVICON_WATERMARK_SIZE / 2);
const MARGIN_TOP = -Math.round(FAVICON_WATERMARK_HEIGHT / 2);

export const WATERMARK_WRAP_STYLE = [
  "position:absolute",
  "left:0",
  "top:0",
  "right:0",
  "bottom:0",
  "width:100%",
  "height:100%",
  "margin:0",
  "padding:0",
  "overflow:hidden",
  "pointer-events:none",
  `z-index:${FAVICON_WATERMARK_Z_INDEX}`,
].join(";");

export const WATERMARK_IMG_STYLE = [
  "position:absolute",
  "left:50%",
  "top:50%",
  `width:${FAVICON_WATERMARK_SIZE}px`,
  `height:${FAVICON_WATERMARK_HEIGHT}px`,
  "max-width:none",
  "max-height:none",
  `margin:${MARGIN_TOP}px 0 0 ${MARGIN_LEFT}px`,
  "padding:0",
  "border:0",
  "outline:none",
  "display:block",
  "pointer-events:none",
].join(";");

let cachedWatermarkDataUrl = null;
let watermarkResolvePromise = null;

/**
 * Rasterize favicon.ico at watermark size with fade baked into the PNG
 * so Copy (email) still looks faded after CSS opacity is stripped.
 */
export async function resolveFaviconWatermarkDataUrl() {
  if (cachedWatermarkDataUrl) return cachedWatermarkDataUrl;
  if (typeof window === "undefined") return FAVICON_WATERMARK_SRC;

  if (!watermarkResolvePromise) {
    watermarkResolvePromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const srcW = img.naturalWidth || 228;
          const srcH = img.naturalHeight || 224;
          const width = FAVICON_WATERMARK_SIZE;
          const height = Math.round((srcH * width) / srcW);
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.globalAlpha = FAVICON_WATERMARK_OPACITY;
          ctx.drawImage(img, 0, 0, width, height);
          cachedWatermarkDataUrl = canvas.toDataURL("image/png");
          resolve(cachedWatermarkDataUrl);
        } catch (e) {
          console.warn("[PreviewFaviconWatermark] Failed to rasterize favicon:", e);
          resolve(FAVICON_WATERMARK_SRC);
        }
      };
      img.onerror = () => resolve(FAVICON_WATERMARK_SRC);
      img.src = FAVICON_WATERMARK_SRC;
    });
  }

  return watermarkResolvePromise;
}

if (typeof window !== "undefined") {
  resolveFaviconWatermarkDataUrl();
}

export function isFaviconWatermarkNode(node) {
  return Boolean(
    node?.closest?.("[data-preview-favicon-watermark='true']") ||
      node?.getAttribute?.("data-preview-favicon-watermark") === "true"
  );
}

/**
 * Gmail strips position:absolute (and then overflow:hidden clips the overlay).
 * Remove the on-screen overlay from the clone; email uses a table/td background.
 */
export function removeFaviconWatermarkFromClone(clone) {
  clone
    ?.querySelectorAll?.("[data-preview-favicon-watermark='true']")
    .forEach((el) => el.remove());
}

export function removePreviewBrandLogoFromClone(clone) {
  clone
    ?.querySelectorAll?.("[data-preview-brand-logo='true']")
    .forEach((el) => el.remove());
}

const ORDINARY_SURFACE_HEX = new Set([
  "fff",
  "ffffff",
  "f8fafc",
  "f9fafb",
  "f1f5f9",
  "f3f4f6",
  "f4f4f5",
  "fafafa",
  "f5f5f5",
  "f5f7fb",
  "e2e8f0",
  "eef2f6",
  "e5e7eb",
]);

const ORDINARY_SURFACE_CLASS_RE =
  /bg-\[#(?:f5f7fb|ffffff|f8fafc|f3f4f6|f9fafb|f1f5f9)\]|\bbg-white\b|\bbg-slate-50\b|\bbg-gray-50\b|\bbg-white\/\d+\b/i;

function parseCssColorChannels(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!v || v === "transparent" || v === "none") return null;
  if (v === "white") return [255, 255, 255];
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (!hex) return null;
  let h = hex[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  h = h.slice(0, 6);
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function extractBackgroundColorToken(raw) {
  const v = String(raw || "").trim();
  if (!v) return "";
  if (/var\(\s*--[^)]+\)/i.test(v)) {
    return v.match(/var\(\s*--[^)]+\)/i)?.[0] || v;
  }
  return (
    v.match(/rgba?\([^)]+\)/i)?.[0] ||
    v.match(/#(?:[0-9a-f]{3,8})\b/i)?.[0] ||
    v.split(/\s+/)[0]
  );
}

function readBackgroundColorCandidate(style) {
  const bgColorMatch = String(style || "").match(/background-color\s*:\s*([^;]+)/i);
  if (bgColorMatch?.[1]) return bgColorMatch[1].trim();
  const bgMatch = String(style || "").match(
    /(?:^|;)\s*background(?!-[a-z])\s*:\s*([^;]+)/i
  );
  return bgMatch?.[1] ? bgMatch[1].trim() : "";
}

function isOrdinaryCoveringBackground(value) {
  const v = String(value || "").trim().toLowerCase();
  if (/var\(\s*--ledgerx-content-bg/i.test(v)) return true;
  const channels = parseCssColorChannels(v);
  if (!channels) return false;
  const [r, g, b] = channels;
  const hex = [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
  if (ORDINARY_SURFACE_HEX.has(hex)) return true;
  if (r >= 242 && g >= 242 && b >= 242) return true;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (Math.min(r, g, b) >= 220 && spread <= 18) return true;
  return false;
}

/**
 * Replace only the fill. Append background-color last so it wins over a
 * computed `background` shorthand. Never strip url() or other longhands.
 */
function setOrdinaryBackgroundTransparent(style) {
  let next = String(style || "");
  if (!/url\(/i.test(next)) {
    next = next.replace(
      /(?:^|;)\s*background(?!-[a-z])\s*:[^;]+/gi,
      " background: transparent"
    );
  }
  if (/background-color\s*:/i.test(next)) {
    next = next.replace(
      /background-color\s*:[^;]+/gi,
      "background-color: transparent"
    );
  }
  next = next.replace(/background-color\s*:\s*transparent;?/gi, "").trim();
  next = next.replace(/background\s*:\s*transparent;?/gi, "").trim();
  if (next && !next.endsWith(";")) next += ";";
  next += " background: transparent; background-color: transparent;";
  return next.trim();
}

function hasOrdinarySurfaceClass(el) {
  return ORDINARY_SURFACE_CLASS_RE.test(String(el?.className || ""));
}

function isColumnHeaderCell(el) {
  return el.tagName === "TH" || Boolean(el.closest?.("thead"));
}

function isChartWrapperNode(el) {
  return Boolean(
    el?.classList?.contains("chart-capture-area") ||
      el?.classList?.contains("chart-cell")
  );
}

/**
 * Copy/Gmail only: make ordinary wrapper/table fills transparent so the outer
 * watermark shows through. Does not touch Preview DOM, th/thead, or intentional
 * header/highlight/chart-bar colors. Chart-card whites are included (they are
 * opaque layers, not data styling).
 */
export function revealWatermarkThroughOrdinaryCells(root) {
  if (!root?.querySelectorAll) return;

  const nodes = new Set([
    root,
    ...root.querySelectorAll("table, tbody, tr, td, div, section"),
  ]);

  nodes.forEach((el) => {
    if (el.nodeType !== 1) return;
    if (isColumnHeaderCell(el)) return;
    const style = el.getAttribute("style") || "";
    if (/url\(/i.test(style)) return;

    const forceWrapper =
      el === root || isChartWrapperNode(el) || hasOrdinarySurfaceClass(el);
    const raw = readBackgroundColorCandidate(style);
    if (/url\(/i.test(raw)) return;
    const candidate = extractBackgroundColorToken(raw);
    const styleIsOrdinary = Boolean(raw) && isOrdinaryCoveringBackground(candidate);
    if (!forceWrapper && !styleIsOrdinary) return;

    el.setAttribute("style", setOrdinaryBackgroundTransparent(style));
  });
}

const TABLE_BORDER_TAGS = new Set(["TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH"]);
const BORDER_SIDES = ["top", "right", "bottom", "left"];

function isZeroBorderShorthand(value) {
  const v = String(value || "").trim().toLowerCase();
  return !v || v === "none" || v === "0px none rgb(0, 0, 0)" || /^0px\s+none\b/.test(v);
}

function appendStyleDeclarations(el, extra) {
  if (!el || !extra) return;
  let style = el.getAttribute("style") || "";
  if (style && !style.trim().endsWith(";")) style += ";";
  el.setAttribute("style", `${style} ${extra}`.trim());
}

/**
 * Copy resolved border styles from the live Preview node onto the clone node.
 * Appends at the end of `style` so they win over leftover var() / conflicts.
 * Does not change width, padding, radius values, or backgrounds.
 */
function inlineComputedBorders(liveEl, cloneEl) {
  if (!liveEl || !cloneEl || typeof window === "undefined") return;
  const cs = window.getComputedStyle(liveEl);
  let extra = "";

  for (const side of BORDER_SIDES) {
    const width = cs.getPropertyValue(`border-${side}-width`);
    const style = cs.getPropertyValue(`border-${side}-style`);
    const color = cs.getPropertyValue(`border-${side}-color`);
    const w = parseFloat(width);
    if (!Number.isFinite(w) || w <= 0) continue;
    if (!style || style === "none") continue;
    extra += `border-${side}-width:${width};`;
    extra += `border-${side}-style:${style};`;
    extra += `border-${side}-color:${color};`;
    extra += `border-${side}:${width} ${style} ${color};`;
  }

  const shorthand = cs.getPropertyValue("border");
  if (shorthand && !isZeroBorderShorthand(shorthand)) {
    extra += `border:${shorthand};`;
  }

  if (cloneEl.tagName === "TABLE") {
    const collapse = cs.getPropertyValue("border-collapse");
    if (collapse) extra += `border-collapse:${collapse};`;
    const spacing = cs.getPropertyValue("border-spacing");
    if (spacing) extra += `border-spacing:${spacing};`;
  }

  if (cloneEl.tagName === "DIV") {
    const radius = cs.getPropertyValue("border-radius");
    if (radius && radius !== "0px") extra += `border-radius:${radius};`;
    const overflow = cs.getPropertyValue("overflow");
    if (overflow && overflow !== "visible") extra += `overflow:${overflow};`;
  }

  appendStyleDeclarations(cloneEl, extra);
}

function stampMatchingBorderTree(liveEl, cloneEl) {
  if (!liveEl || !cloneEl) return;
  if (liveEl.nodeType !== 1 || cloneEl.nodeType !== 1) return;
  if (liveEl.tagName !== cloneEl.tagName) return;
  if (isFaviconWatermarkNode(liveEl) || isFaviconWatermarkNode(cloneEl)) return;

  if (TABLE_BORDER_TAGS.has(liveEl.tagName)) {
    inlineComputedBorders(liveEl, cloneEl);
  }

  const liveKids = Array.from(liveEl.children);
  const cloneKids = Array.from(cloneEl.children);
  let j = 0;
  for (let i = 0; i < liveKids.length; i++) {
    while (j < cloneKids.length && cloneKids[j].tagName !== liveKids[i].tagName) j += 1;
    if (j >= cloneKids.length) break;
    stampMatchingBorderTree(liveKids[i], cloneKids[j]);
    j += 1;
  }
}

function closestPreviewCard(el) {
  return el?.closest?.(
    "div.rounded-xl, div.rounded-t-xl, div[class*='rounded-xl'], div[class*='rounded-t-xl']"
  );
}

/**
 * Copy/Gmail only: restore the live Preview's computed borders onto the clone.
 * Does not change watermark, transparency, or table geometry.
 */
export function preserveCopiedPreviewBorders(originalRoot, cloneRoot) {
  if (!originalRoot || !cloneRoot || typeof window === "undefined") return;

  const origTables = Array.from(originalRoot.querySelectorAll("table"));
  const cloneTables = Array.from(cloneRoot.querySelectorAll("table")).filter(
    (table) => !table.closest(".chart-capture-area")
  );
  const tableCount = Math.min(origTables.length, cloneTables.length);
  for (let i = 0; i < tableCount; i++) {
    stampMatchingBorderTree(origTables[i], cloneTables[i]);
    const origCard = closestPreviewCard(origTables[i]);
    const cloneCard = closestPreviewCard(cloneTables[i]);
    if (origCard && cloneCard) inlineComputedBorders(origCard, cloneCard);
  }
}

function collectPreviewSectionCards(root) {
  if (!root?.querySelectorAll) return [];
  return Array.from(root.querySelectorAll("div")).filter((div) => {
    if (div.closest?.(".chart-capture-area")) return false;
    if (div.getAttribute("data-additional-info-preview") === "true") return true;
    const cls = String(div.className || "");
    return (
      /(^|\s)rounded-xl(\s|$)/.test(cls) ||
      /(^|\s)rounded-t-xl(\s|$)/.test(cls)
    );
  });
}

function previewSectionLabel(card) {
  const header = Array.from(card?.children || []).find(
    (el) => el.tagName === "DIV" && !el.querySelector(":scope > table")
  );
  const text = String(header?.textContent || card?.textContent || "")
    .replace(/\s+/g, " ")
    .trim();
  if (/^offer\b/i.test(text)) return "Offer";
  if (/^leverage\b/i.test(text)) return "Leverage";
  if (/^bank analysis\b/i.test(text)) return "Bank Analysis";
  if (/^bank total\b/i.test(text)) return "Bank Total";
  if (/^positions\b/i.test(text)) return "Positions";
  if (/^additional info\b/i.test(text)) return "Additional Info";
  if (/^notes\b/i.test(text)) return "Notes";
  return text.slice(0, 32) || "Section";
}

function cardHeaderEl(card) {
  return Array.from(card?.children || []).find(
    (el) => el.tagName === "DIV" && !el.querySelector(":scope > table")
  );
}

function roundRect(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return null;
  const r = el.getBoundingClientRect();
  return {
    width: Math.round(r.width),
    left: Math.round(r.left),
    right: Math.round(r.right),
  };
}

/** Apply this element's LIVE rendered width only — never a global 100%. */
function applyLiveRenderedWidth(liveEl, cloneEl) {
  if (!liveEl || !cloneEl || typeof window === "undefined") return;
  const rect = roundRect(liveEl);
  if (!rect || rect.width <= 0) return;
  const cs = window.getComputedStyle(liveEl);
  let extra = `width:${rect.width}px;`;
  const boxSizing = cs.getPropertyValue("box-sizing");
  if (boxSizing) extra += `box-sizing:${boxSizing};`;
  appendStyleDeclarations(cloneEl, extra);
}

/**
 * Copy/Gmail only: preserve each section's LIVE rendered width independently.
 * Does not force width:100% on every card/table (that shrinks Offer/Leverage).
 */
export function preserveCopiedPreviewCardGeometry(originalRoot, cloneRoot) {
  if (!originalRoot || !cloneRoot || typeof window === "undefined") return;

  const origCards = collectPreviewSectionCards(originalRoot);
  const cloneCards = collectPreviewSectionCards(cloneRoot);
  const count = Math.min(origCards.length, cloneCards.length);

  for (let i = 0; i < count; i++) {
    const origCard = origCards[i];
    const cloneCard = cloneCards[i];
    const origHeader = cardHeaderEl(origCard);
    const cloneHeader = cardHeaderEl(cloneCard);
    const origTable = origCard.querySelector("table");
    const cloneTable = cloneCard.querySelector("table");
    const origWrap =
      origTable?.parentElement?.tagName === "DIV" && origTable.parentElement !== origCard
        ? origTable.parentElement
        : null;
    const cloneWrap =
      cloneTable?.parentElement?.tagName === "DIV" && cloneTable.parentElement !== cloneCard
        ? cloneTable.parentElement
        : null;

    console.debug("[Copy geometry]", previewSectionLabel(origCard), {
      liveCard: roundRect(origCard),
      liveHeader: roundRect(origHeader),
      liveTable: roundRect(origTable),
      clonedCard: roundRect(cloneCard),
      clonedHeader: roundRect(cloneHeader),
      clonedTable: roundRect(cloneTable),
    });

    applyLiveRenderedWidth(origCard, cloneCard);
    if (origHeader && cloneHeader) applyLiveRenderedWidth(origHeader, cloneHeader);
    if (origWrap && cloneWrap) applyLiveRenderedWidth(origWrap, cloneWrap);
    if (origTable && cloneTable) {
      applyLiveRenderedWidth(origTable, cloneTable);
      const tableWidth = roundRect(origTable)?.width;
      if (tableWidth > 0) cloneTable.setAttribute("width", String(tableWidth));
    }
  }
}

function addCopyClass(el, className) {
  if (!el || el.nodeType !== 1 || !className) return;
  const prev = String(el.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean);
  if (prev.includes(className)) return;
  prev.push(className);
  el.setAttribute("class", prev.join(" "));
}

function rowCellCount(row) {
  if (!row) return 0;
  return Array.from(row.children).filter((c) => c.tagName === "TH" || c.tagName === "TD").length;
}

function firstRowCellCount(table) {
  const rows = table?.querySelectorAll?.("tr") || [];
  let max = 0;
  rows.forEach((row) => {
    const n = rowCellCount(row);
    if (n > max) max = n;
  });
  return max;
}

function firstRowHeaderText(table) {
  const thRow =
    table?.querySelector?.("thead tr") ||
    Array.from(table?.querySelectorAll?.("tr") || []).find((row) =>
      row.querySelector("th")
    ) ||
    table?.querySelector?.("tr");
  if (!thRow) return "";
  return Array.from(thRow.querySelectorAll("th, td"))
    .map((cell) => String(cell.textContent || "").replace(/\s+/g, " ").trim())
    .join(" | ");
}

function collectCopySectionCards(root) {
  if (!root?.querySelectorAll) return [];
  return Array.from(root.querySelectorAll("div")).filter((div) => {
    if (div.closest?.(".chart-capture-area")) return false;
    if (div.getAttribute("data-additional-info-preview") === "true") return true;
    const cls = String(div.className || "");
    return (
      /(^|\s)rounded-xl(\s|$)/.test(cls) ||
      /(^|\s)rounded-t-xl(\s|$)/.test(cls) ||
      /(^|\s)rounded-lg(\s|$)/.test(cls)
    );
  });
}

function isFluidSectionLabel(label) {
  return /^(Offer|Leverage|Monthly Trend|Credits Trend|Notes|Additional Info|Active Positions)\b/i.test(
    String(label || "")
  );
}

/** 6-col Preview Leverage table (Financial Analysis / Danny / Wd-AR). Not Notes email Leverage. */
function isNormalLeverageTable(table) {
  const text = String(table?.textContent || "");
  if (!/Our Levg\s*\/\s*Repay/i.test(text)) return false;
  if (/Bank Net Credit/i.test(text)) return false;
  return true;
}

function isWideFinancialTable(table, label) {
  const name = String(label || "");
  if (/^Bank Analysis\b/i.test(name) || /^Bank Total\b/i.test(name)) return true;
  if (/^Positions$/i.test(name)) return true;
  if (isFluidSectionLabel(name)) return false;
  const headers = firstRowHeaderText(table);
  if (/Net Credit/i.test(headers) && /Funding Amt|Total Credit/i.test(headers)) return true;
  if (/Amount Funded/i.test(headers) && /Date of Last Payment|Est\.?\s*MCA/i.test(headers)) return true;
  if (/\bBank\s+\d/i.test(headers) && /Total/i.test(headers) && firstRowCellCount(table) >= 5) return true;
  return firstRowCellCount(table) >= 8;
}

function parseDeclaredPx(style, prop) {
  const match = String(style || "").match(
    new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([\\d.]+)px`, "i")
  );
  if (!match) return NaN;
  const n = parseFloat(match[1]);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Live Preview content width for the Gmail desktop lock.
 * Visible geometry only — never window.innerWidth, never scrollWidth
 * (overflowing tables must not widen the whole report).
 */
export function measurePreviewDesktopWidthPx(el) {
  if (!el || typeof window === "undefined") return 1000;
  const cs = window.getComputedStyle(el);
  const parsedMin = parseFloat(cs.minWidth || "");
  const parsedWidth = parseFloat(cs.width || "");
  const rectW =
    typeof el.getBoundingClientRect === "function"
      ? el.getBoundingClientRect().width
      : NaN;
  const candidates = [parsedMin, parsedWidth, rectW].filter(
    (v) => Number.isFinite(v) && v > 0
  );
  return candidates.length ? Math.round(Math.max(...candidates)) : 1000;
}

/**
 * Preview min-width (e.g. Tailwind min-w-[1000px]) for the desktop media query.
 * Viewports below this keep the existing mobile/fluid Gmail layout.
 */
export function measurePreviewDesktopMinWidthPx(el) {
  if (!el || typeof window === "undefined") return 1000;
  const parsedMin = parseFloat(window.getComputedStyle(el).minWidth || "");
  return Number.isFinite(parsedMin) && parsedMin > 0 ? Math.round(parsedMin) : 1000;
}

function readCopiedPixelWidth(el) {
  if (!el || el.nodeType !== 1) return NaN;
  const style = el.getAttribute("style") || "";
  const w = parseDeclaredPx(style, "width");
  const minW = parseDeclaredPx(style, "min-width");
  let attrW = NaN;
  if (el.tagName === "TABLE" || el.tagName === "TD" || el.tagName === "IMG") {
    const raw = String(el.getAttribute("width") || "").trim();
    if (raw && !raw.includes("%")) attrW = parseFloat(raw);
  }
  const px = [w, minW, attrW].find((n) => Number.isFinite(n) && n > 0);
  return Number.isFinite(px) ? Math.round(px) : NaN;
}

function isGmailCopyRootOrInner(el) {
  if (!el || el.nodeType !== 1) return false;
  const copy = el.getAttribute("data-gmail-copy");
  if (copy === "root" || copy === "inner") return true;
  const cls = String(el.getAttribute("class") || "");
  return (
    /(^|\s)gmail-copy-root(\s|$)/.test(cls) ||
    /(^|\s)gmail-copy-inner(\s|$)/.test(cls) ||
    /(^|\s)gmail-copy-root-cell(\s|$)/.test(cls)
  );
}

/** Remember Preview px geometry before mobile inline widths overwrite it. */
function stampDesktopWidthClass(el) {
  if (!el || el.nodeType !== 1) return;
  if (isGmailCopyRootOrInner(el)) return;
  if (el.getAttribute("data-gmail-dw")) return;
  const px = readCopiedPixelWidth(el);
  if (!Number.isFinite(px) || px <= 0) return;
  el.setAttribute("data-gmail-dw", String(px));
  addCopyClass(el, `gmail-dw-${px}`);
}

function collectDesktopWidthPxValues(root) {
  const widths = new Set();
  if (!root?.querySelectorAll) return [];
  root.querySelectorAll("[data-gmail-dw]").forEach((el) => {
    if (isGmailCopyRootOrInner(el)) return;
    const n = parseInt(el.getAttribute?.("data-gmail-dw") || "", 10);
    if (Number.isFinite(n) && n > 0) widths.add(n);
  });
  return [...widths].sort((a, b) => a - b);
}

function stripInlineProps(style, props) {
  let next = String(style || "");
  for (const prop of props) {
    next = next.replace(new RegExp(`(?:^|;)\\s*${prop}\\s*:[^;]*`, "gi"), "");
  }
  return next.replace(/;{2,}/g, ";").replace(/^\s*;\s*|\s*;\s*$/g, "").trim();
}

const GMAIL_TEXT_GEOM_STRIP = [
  "height",
  "max-height",
  "min-height",
  "line-height",
  "overflow",
  "overflow-x",
  "overflow-y",
];

/**
 * Gmail iOS often ignores <style> + @media (webview can be ~980px, so
 * max-width:600px never matches) and keeps Preview inline pixel line-heights.
 * Bake text geometry into inline !important so the clipboard HTML itself is
 * safe. Wide-table data cells keep nowrap for horizontal scroll.
 */
function applyGmailCopyTextGeometry(root) {
  if (!root?.querySelectorAll) return;

  const setStyle = (el, baseStyle, extra) => {
    const prefix = baseStyle ? `${baseStyle}; ` : "";
    el.setAttribute("style", `${prefix}${extra}`);
  };

  root.querySelectorAll("td, th").forEach((cell) => {
    const isTh = cell.tagName === "TH";
    const inWide = Boolean(cell.closest?.(".gmail-mobile-table"));
    const strip = [
      ...GMAIL_TEXT_GEOM_STRIP,
      "word-break",
      "overflow-wrap",
      "word-wrap",
      ...(isTh || !inWide ? ["white-space"] : []),
    ];
    const extras = [
      "height:auto !important",
      "max-height:none !important",
      "min-height:0 !important",
      "line-height:1.35 !important",
      "overflow:visible !important",
      "vertical-align:middle !important",
      "-webkit-text-size-adjust:100%",
      "text-size-adjust:100%",
    ];
    if (isTh) {
      // Gmail iOS treats break-word as break-all (one character per line).
      // Wrap at word boundaries only; column min-width handles long headers.
      extras.push(
        "white-space:normal !important",
        "word-break:normal !important",
        "overflow-wrap:normal !important"
      );
    } else if (inWide) {
      extras.push(
        "white-space:nowrap !important",
        "word-break:normal !important",
        "overflow-wrap:normal !important"
      );
    } else {
      extras.push(
        "white-space:normal !important",
        "word-break:normal !important",
        "overflow-wrap:normal !important"
      );
    }
    setStyle(cell, stripInlineProps(cell.getAttribute("style") || "", strip), extras.join("; ") + ";");

    cell.querySelectorAll("*").forEach((inner) => {
      if (inner.nodeType !== 1) return;
      const tag = inner.tagName;
      if (
        tag === "IMG" ||
        tag === "SVG" ||
        tag === "TABLE" ||
        tag === "THEAD" ||
        tag === "TBODY" ||
        tag === "TFOOT" ||
        tag === "TD" ||
        tag === "TH" ||
        tag === "TR" ||
        tag === "COL" ||
        tag === "COLGROUP" ||
        tag === "CAPTION"
      ) {
        return;
      }
      setStyle(
        inner,
        stripInlineProps(inner.getAttribute("style") || "", GMAIL_TEXT_GEOM_STRIP),
        "height:auto !important; max-height:none !important; line-height:1.35 !important; overflow:visible !important;"
      );
    });
  });

  root.querySelectorAll("tr").forEach((row) => {
    setStyle(
      row,
      stripInlineProps(row.getAttribute("style") || "", ["height", "max-height", "min-height", "line-height"]),
      "height:auto !important; line-height:1.35 !important;"
    );
  });

  root.querySelectorAll(
    ".gmail-copy-section, .gmail-copy-section-header, .gmail-copy-meta, [data-gmail-copy='meta']"
  ).forEach((el) => {
    let style = stripInlineProps(el.getAttribute("style") || "", GMAIL_TEXT_GEOM_STRIP);
    style = style
      .replace(/(?:^|;)\s*display\s*:\s*inline-flex[^;]*/gi, "")
      .replace(/(?:^|;)\s*display\s*:\s*flex[^;]*/gi, "");
    setStyle(
      el,
      style,
      "display:block !important; height:auto !important; max-height:none !important; overflow:visible !important; line-height:1.35 !important; white-space:normal !important;"
    );
  });

  root.querySelectorAll(".gmail-copy-meta *, .gmail-copy-section-header *").forEach((el) => {
    if (el.nodeType !== 1) return;
    const tag = el.tagName;
    if (
      tag === "TABLE" ||
      tag === "THEAD" ||
      tag === "TBODY" ||
      tag === "TFOOT" ||
      tag === "TD" ||
      tag === "TH" ||
      tag === "TR" ||
      tag === "COL" ||
      tag === "COLGROUP" ||
      tag === "CAPTION" ||
      tag === "IMG"
    ) {
      return;
    }
    if (el.querySelector?.("table")) return;
    let style = String(el.getAttribute("style") || "")
      .replace(/(?:^|;)\s*display\s*:\s*inline-flex[^;]*/gi, "")
      .replace(/(?:^|;)\s*display\s*:\s*flex[^;]*/gi, "");
    style = stripInlineProps(style, GMAIL_TEXT_GEOM_STRIP);
    const display =
      tag === "SPAN" || tag === "DIV" ? "display:inline-block !important; " : "";
    setStyle(
      el,
      style,
      `${display}height:auto !important; line-height:1.35 !important; overflow:visible !important; white-space:normal !important; vertical-align:middle !important;`
    );
  });
}

function stripCopiedSizeDeclarations(style) {
  return stripInlineProps(style, ["min-width", "max-width", "width", "box-sizing"]);
}

function setCopiedBoxSize(el, { width, maxWidth, minWidth }) {
  if (!el || el.nodeType !== 1) return;
  stampDesktopWidthClass(el);
  let style = stripCopiedSizeDeclarations(el.getAttribute("style") || "");
  if (style && !style.endsWith(";")) style += ";";
  const extra = [
    width != null ? `width:${width}` : null,
    maxWidth != null ? `max-width:${maxWidth}` : null,
    minWidth != null ? `min-width:${minWidth}` : null,
    "box-sizing:border-box",
  ]
    .filter(Boolean)
    .join(";");
  el.setAttribute("style", `${style} ${extra};`.trim());
}

function hasLargeCopiedConstraint(el) {
  if (!el || el.nodeType !== 1) return false;
  const style = el.getAttribute("style") || "";
  const w = parseDeclaredPx(style, "width");
  const minW = parseDeclaredPx(style, "min-width");
  const maxW = parseDeclaredPx(style, "max-width");
  let attrW = NaN;
  if (el.tagName === "TABLE" || el.tagName === "TD" || el.tagName === "IMG") {
    attrW = parseFloat(el.getAttribute("width") || "");
  }
  return [w, minW, maxW, attrW].some((n) => Number.isFinite(n) && n > 500);
}

function isInsideWideTableContent(el) {
  const scroll = el.closest?.(".gmail-mobile-table");
  if (!scroll) return false;
  return el !== scroll;
}

function headerColumnMinWidthPx(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return 88;
  const words = raw.split(" ").filter(Boolean);
  const longest = words.reduce((max, word) => Math.max(max, word.length), 0);
  const byLongestWord = longest * 8 + 24;
  const byThreeLines = Math.ceil(raw.length / 3) * 8 + 24;
  return Math.max(88, Math.min(Math.max(byLongestWord, byThreeLines), 200));
}

function measureHeaderColumnMinWidths(table) {
  const headerRow =
    table?.querySelector?.("thead tr") ||
    Array.from(table?.querySelectorAll?.("tr") || []).find((row) => row.querySelector("th")) ||
    table?.querySelector?.("tr");
  if (!headerRow) return [];
  return Array.from(headerRow.children)
    .filter((cell) => cell.tagName === "TH" || cell.tagName === "TD")
    .map((cell) => headerColumnMinWidthPx(cell.textContent));
}

function applyHeaderColumnMinWidths(table, mins) {
  if (!table || !mins.length) return;
  table.querySelectorAll("tr").forEach((row) => {
    const cells = Array.from(row.children).filter(
      (cell) => cell.tagName === "TH" || cell.tagName === "TD"
    );
    let col = 0;
    cells.forEach((cell) => {
      const span = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
      let minPx = 0;
      for (let i = 0; i < span && col + i < mins.length; i++) minPx += mins[col + i];
      col += span;
      if (minPx <= 0) return;
      let style = stripInlineProps(cell.getAttribute("style") || "", ["min-width"]);
      if (style && !style.endsWith(";")) style += ";";
      cell.setAttribute("style", `${style} min-width:${minPx}px !important;`.trim());
      if (span === 1) cell.setAttribute("width", String(minPx));
    });
  });
}

function lockWideTableReadableWidth(table) {
  if (isNormalLeverageTable(table)) return;
  const style = table.getAttribute("style") || "";
  const widthPx = parseDeclaredPx(style, "width");
  const attrW = parseFloat(table.getAttribute("width") || "");
  const cols = firstRowCellCount(table) || 8;
  const colMins = measureHeaderColumnMinWidths(table);
  const headerSum = colMins.reduce((sum, n) => sum + n, 0);
  const floor = Math.max(720, cols * 96, headerSum);
  const minPx = Math.round(
    Math.max(
      (Number.isFinite(widthPx) && widthPx > 400 ? widthPx : 0),
      (Number.isFinite(attrW) && attrW > 400 ? attrW : 0),
      floor
    )
  );
  let next = stripCopiedSizeDeclarations(style);
  if (next && !next.endsWith(";")) next += ";";
  table.setAttribute(
    "style",
    `${next} width:${minPx}px;min-width:${minPx}px;max-width:none;table-layout:auto;box-sizing:border-box;`.trim()
  );
  table.setAttribute("width", String(minPx));
  applyHeaderColumnMinWidths(table, colMins);
}

function stretchNormalLeverageToFullWidth(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("table").forEach((table) => {
    if (!isNormalLeverageTable(table)) return;
    const tableClass = String(table.getAttribute("class") || "")
      .split(/\s+/)
      .filter((cls) => cls && !/^gmail-dw-\d+$/.test(cls))
      .join(" ");
    if (tableClass) table.setAttribute("class", tableClass);
    else table.removeAttribute("class");
    table.removeAttribute("data-gmail-dw");
    let style = stripCopiedSizeDeclarations(table.getAttribute("style") || "");
    style = stripInlineProps(style, ["table-layout", "display"]);
    if (style && !style.endsWith(";")) style += ";";
    // table-layout:auto (not fixed): Gmail collapses colspan rows 2+ when layout is
    // fixed + width:100% + min-height:0. Auto keeps full width and all Preview rows.
    table.setAttribute(
      "style",
      `${style} display:table !important;width:100%;max-width:100%;min-width:0;table-layout:auto;border-collapse:collapse;box-sizing:border-box;`.trim()
    );
    table.setAttribute("width", "100%");

    const tbody = table.querySelector("tbody");
    if (tbody) {
      let tbodyStyle = stripInlineProps(tbody.getAttribute("style") || "", [
        "display",
        "height",
        "max-height",
        "min-height",
      ]);
      if (tbodyStyle && !tbodyStyle.endsWith(";")) tbodyStyle += ";";
      tbody.setAttribute(
        "style",
        `${tbodyStyle} display:table-row-group !important;height:auto !important;`.trim()
      );
    }
    table.querySelectorAll("tr").forEach((row) => {
      let rowStyle = stripInlineProps(row.getAttribute("style") || "", [
        "display",
        "height",
        "max-height",
        "min-height",
      ]);
      if (rowStyle && !rowStyle.endsWith(";")) rowStyle += ";";
      row.setAttribute(
        "style",
        `${rowStyle} display:table-row !important;height:auto !important;line-height:1.35 !important;`.trim()
      );
    });
    table.querySelectorAll("td, th").forEach((cell) => {
      let cellStyle = stripInlineProps(cell.getAttribute("style") || "", [
        "display",
        "height",
        "max-height",
        "min-height",
      ]);
      if (cellStyle && !cellStyle.endsWith(";")) cellStyle += ";";
      cell.setAttribute(
        "style",
        `${cellStyle} display:table-cell !important;height:auto !important;overflow:visible !important;vertical-align:middle !important;line-height:1.35 !important;`.trim()
      );
    });

    const wrap = table.parentElement;
    if (wrap && wrap.tagName === "DIV" && wrap !== root && !wrap.classList?.contains("gmail-copy-section")) {
      const wrapClass = String(wrap.getAttribute("class") || "")
        .split(/\s+/)
        .filter((cls) => cls && !/^gmail-dw-\d+$/.test(cls) && cls !== "gmail-mobile-table")
        .join(" ");
      if (wrapClass) wrap.setAttribute("class", wrapClass);
      else wrap.removeAttribute("class");
      wrap.removeAttribute("data-gmail-dw");
      if (wrap.getAttribute("data-gmail-copy") === "table-scroll") {
        wrap.removeAttribute("data-gmail-copy");
      }
      let wrapStyle = stripCopiedSizeDeclarations(wrap.getAttribute("style") || "");
      wrapStyle = stripInlineProps(wrapStyle, ["overflow", "overflow-x", "overflow-y", "max-height", "height"]);
      if (wrapStyle && !wrapStyle.endsWith(";")) wrapStyle += ";";
      wrap.setAttribute(
        "style",
        `${wrapStyle} width:100%;max-width:100%;min-width:0;display:block;overflow:visible;height:auto;box-sizing:border-box;`.trim()
      );
    }

    console.info("[gmail-copy] Leverage full-width (rows preserved)", {
      rows: table.querySelectorAll("tr").length,
      cells: table.querySelectorAll("td, th").length,
      preview: String(table.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
    });
  });
}

function applyReadableHeaderColumnWidths(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll("table").forEach((table) => {
    if (isChartLayoutTable(table)) return;
    if (isSideBySideStackTable(table)) return;
    if (isNormalLeverageTable(table)) return;
    if (table.classList?.contains("gmail-copy-root")) return;
    const mins = measureHeaderColumnMinWidths(table);
    if (mins.length < 3) return;
    const sum = mins.reduce((total, n) => total + n, 0);
    applyHeaderColumnMinWidths(table, mins);
    if (sum >= 480 && !table.closest(".gmail-mobile-table")) {
      wrapTableForMobileScroll(table);
    }
    if (table.closest(".gmail-mobile-table")) {
      lockWideTableReadableWidth(table);
    }
  });
}

const WIDE_TABLE_SCROLL_STYLE =
  "width:100%;max-width:100%;min-width:0;overflow-x:auto;-webkit-overflow-scrolling:touch;display:block;box-sizing:border-box;";

function applyWideTableScrollWrapStyles(wrap) {
  if (!wrap) return;
  stampDesktopWidthClass(wrap);
  let style = stripCopiedSizeDeclarations(wrap.getAttribute("style") || "");
  if (style && !style.endsWith(";")) style += ";";
  wrap.setAttribute("style", `${style} ${WIDE_TABLE_SCROLL_STYLE}`.trim());
}

function wrapTableForMobileScroll(table) {
  if (isNormalLeverageTable(table)) return;
  const parent = table.parentElement;
  if (!parent) return;
  if (parent.classList?.contains("gmail-mobile-table")) {
    parent.setAttribute("data-gmail-copy", "table-scroll");
    applyWideTableScrollWrapStyles(parent);
    return;
  }
  const siblingEls = Array.from(parent.children).filter((c) => c.nodeType === 1);
  const parentIsSimpleWrap =
    parent.tagName === "DIV" &&
    siblingEls.length === 1 &&
    siblingEls[0] === table;
  if (parentIsSimpleWrap) {
    addCopyClass(parent, "gmail-mobile-table");
    parent.setAttribute("data-gmail-copy", "table-scroll");
    applyWideTableScrollWrapStyles(parent);
    return;
  }
  const wrap = document.createElement("div");
  wrap.setAttribute("class", "gmail-mobile-table");
  wrap.setAttribute("data-gmail-copy", "table-scroll");
  wrap.setAttribute("style", WIDE_TABLE_SCROLL_STYLE);
  parent.insertBefore(wrap, table);
  wrap.appendChild(table);
}

function isChartLayoutTable(table) {
  return (
    table.getAttribute("role") === "presentation" ||
    Boolean(table.closest?.(".chart-capture-area"))
  );
}

function isSideBySideStackTable(table) {
  const text = String(table.textContent || "");
  if (!/Leverage/i.test(text) || !/Bank Net Credit/i.test(text)) return false;
  const row = table.querySelector("tr");
  const tds = row ? Array.from(row.children).filter((c) => c.tagName === "TD") : [];
  return tds.length >= 2;
}

/**
 * Copy/Gmail only: make the cloned document structurally fluid for mobile.
 * Desktop Preview geometry is stamped onto data-gmail-dw / .gmail-dw-* before
 * inline widths are set to 100%, then restored by a media query at the
 * Preview min-width breakpoint. Root/inner are not stamped (they use W).
 * Wide financial tables keep their readable pixel min-width inside a scroll wrap.
 */
function applyGmailMobileResponsiveLayer(root, desktopMaxPx) {
  if (!root?.querySelectorAll) return;
  const desktopMax = Number(desktopMaxPx) > 0 ? Number(desktopMaxPx) : 1000;

  addCopyClass(root, "gmail-copy-inner");
  addCopyClass(root, "gmail-copy-responsive");
  root.setAttribute("data-gmail-copy", "inner");
  setCopiedBoxSize(root, {
    width: "100%",
    maxWidth: `${desktopMax}px`,
    minWidth: "0",
  });

  const meta = Array.from(root.children).find((el) =>
    /Client Name/i.test(String(el.textContent || ""))
  );
  if (meta) {
    addCopyClass(meta, "gmail-copy-meta");
    meta.setAttribute("data-gmail-copy", "meta");
  }

  root.querySelectorAll(".chart-capture-area").forEach((el) => {
    addCopyClass(el, "gmail-copy-chart");
    el.setAttribute("data-gmail-copy", "chart");
  });
  root.querySelectorAll("img[alt='Total Net Credit Trend']").forEach((img) => {
    addCopyClass(img, "gmail-copy-chart");
  });

  collectCopySectionCards(root).forEach((card) => {
    const label = previewSectionLabel(card);
    addCopyClass(card, "gmail-copy-section");
    const header = cardHeaderEl(card);
    if (header) addCopyClass(header, "gmail-copy-section-header");

    if (/^Notes$/i.test(label)) {
      addCopyClass(card, "gmail-copy-notes");
      addCopyClass(card, "gmail-copy-fluid");
      card.setAttribute("data-gmail-copy", "notes");
      return;
    }

    const table = card.querySelector("table");
    if (!table || isChartLayoutTable(table)) {
      addCopyClass(card, "gmail-copy-fluid");
      return;
    }

    if (isWideFinancialTable(table, label)) {
      addCopyClass(card, "gmail-copy-wide");
      card.setAttribute("data-gmail-copy", "wide");
      wrapTableForMobileScroll(table);
      lockWideTableReadableWidth(table);
      return;
    }

    addCopyClass(card, "gmail-copy-fluid");
  });

  root.querySelectorAll("table").forEach((table) => {
    if (isChartLayoutTable(table)) return;
    if (table.closest(".gmail-mobile-table")) return;
    if (isSideBySideStackTable(table)) {
      addCopyClass(table, "gmail-copy-stack");
      table.setAttribute("data-gmail-copy", "stack");
      const layoutRow = table.querySelector("tr");
      Array.from(layoutRow?.children || [])
        .filter((cell) => cell.tagName === "TD")
        .forEach((cell) => {
          addCopyClass(cell, "gmail-copy-stack-cell");
          cell.setAttribute("data-gmail-copy", "stack-cell");
        });
      return;
    }
    const card = table.closest(".gmail-copy-section");
    const label = card ? previewSectionLabel(card) : "";
    if (isWideFinancialTable(table, label)) {
      wrapTableForMobileScroll(table);
      lockWideTableReadableWidth(table);
    }
  });

  const nodes = [root, ...root.querySelectorAll("*")];
  nodes.forEach((el) => {
    if (el.nodeType !== 1) return;
    if (isInsideWideTableContent(el)) return;
    if (
      el.tagName === "TD" ||
      el.tagName === "TH" ||
      el.tagName === "TR" ||
      el.tagName === "COL" ||
      el.tagName === "COLGROUP"
    ) {
      return;
    }
    if (!hasLargeCopiedConstraint(el) && el !== root) return;
    if (el.classList?.contains("gmail-mobile-table")) {
      applyWideTableScrollWrapStyles(el);
      return;
    }
    if (el.classList?.contains("gmail-copy-chart") || el.getAttribute("data-gmail-copy") === "chart") {
      setCopiedBoxSize(el, { width: "100%", maxWidth: "100%", minWidth: "0" });
      appendStyleDeclarations(el, "height:auto;");
      if (el.tagName === "IMG") {
        appendStyleDeclarations(el, "border:0;");
        el.setAttribute("width", "100%");
      }
      return;
    }
    const maxWidth = el === root ? `${desktopMax}px` : "100%";
    setCopiedBoxSize(el, { width: "100%", maxWidth, minWidth: "0" });
    if (el.tagName === "TABLE") el.setAttribute("width", "100%");
    if (el.tagName === "IMG") {
      appendStyleDeclarations(el, "height:auto;");
      el.setAttribute("width", "100%");
    }
  });

  root.querySelectorAll(".gmail-mobile-table").forEach((wrap) => {
    applyWideTableScrollWrapStyles(wrap);
    const table = wrap.querySelector("table");
    if (table) lockWideTableReadableWidth(table);
  });

  root.querySelectorAll("[data-chart-kind='bar'], .chart-capture-area, .chart-cell").forEach((el) => {
    setCopiedBoxSize(el, { width: "100%", maxWidth: "100%", minWidth: "0" });
    appendStyleDeclarations(el, "height:auto;");
  });

  root.querySelectorAll("img.gmail-copy-chart, .gmail-copy-chart img, img[alt='Total Net Credit Trend']").forEach((img) => {
    stampDesktopWidthClass(img);
    let style = stripCopiedSizeDeclarations(img.getAttribute("style") || "");
    if (style && !style.endsWith(";")) style += ";";
    img.setAttribute(
      "style",
      `${style} width:100%;max-width:100%;height:auto;border:0;display:block;`.trim()
    );
    img.setAttribute("width", "100%");
  });

  applyGmailCopyTextGeometry(root);
  applyReadableHeaderColumnWidths(root);
  stretchNormalLeverageToFullWidth(root);
}

/**
 * Mobile polish stays in max-width: 600px (unchanged).
 * Desktop restore uses the Preview min-width as the breakpoint (typically 1000px),
 * not 601px, so a ~700px compose pane keeps the fluid/mobile layout.
 * Root/inner lock to W comes AFTER .gmail-dw-* so cards cannot override the report width.
 * Inline width:100% remains the default so clients that strip <style> stay fluid.
 */
function gmailCopyResponsiveStyleBlock(desktopMaxPx, desktopWidths, desktopMinWidthPx) {
  const width = Number(desktopMaxPx) > 0 ? Math.round(Number(desktopMaxPx)) : 1000;
  const breakpoint =
    Number(desktopMinWidthPx) > 0 ? Math.round(Number(desktopMinWidthPx)) : 1000;
  const uniqueWidths = (Array.isArray(desktopWidths) ? desktopWidths : [])
    .map((n) => Math.round(Number(n)))
    .filter((n, i, arr) => Number.isFinite(n) && n > 0 && arr.indexOf(n) === i);
  const desktopWidthRules = uniqueWidths
    .map(
      (px) => `
  .gmail-dw-${px}:not(.gmail-copy-root):not(.gmail-copy-inner):not(.gmail-copy-root-cell),
  [data-gmail-dw="${px}"]:not(.gmail-copy-root):not(.gmail-copy-inner):not(.gmail-copy-root-cell):not([data-gmail-copy="root"]):not([data-gmail-copy="inner"]) {
    width: ${px}px !important;
    min-width: ${px}px !important;
    max-width: ${px}px !important;
    box-sizing: border-box !important;
  }`
    )
    .join("");

  return `<style type="text/css">
@media only screen and (max-width: 600px) {
  .gmail-copy-root,
  .gmail-copy-inner,
  [data-gmail-copy="root"],
  [data-gmail-copy="inner"] {
    -webkit-text-size-adjust: 100% !important;
    text-size-adjust: 100% !important;
  }
  .gmail-copy-root td,
  .gmail-copy-root th,
  .gmail-copy-inner td,
  .gmail-copy-inner th,
  [data-gmail-copy="root"] td,
  [data-gmail-copy="root"] th,
  [data-gmail-copy="inner"] td,
  [data-gmail-copy="inner"] th,
  table td,
  table th {
    height: auto !important;
    max-height: none !important;
    min-height: 0 !important;
    line-height: 1.35 !important;
    overflow: visible !important;
    vertical-align: middle !important;
    padding-top: 8px !important;
    padding-bottom: 8px !important;
    -webkit-text-size-adjust: 100% !important;
    text-size-adjust: 100% !important;
  }
  .gmail-copy-root th,
  .gmail-copy-inner th,
  [data-gmail-copy="root"] th,
  [data-gmail-copy="inner"] th,
  .gmail-mobile-table th,
  [data-gmail-copy="table-scroll"] th {
    white-space: normal !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
  }
  .gmail-mobile-table td,
  [data-gmail-copy="table-scroll"] td {
    white-space: nowrap !important;
    word-break: normal !important;
    overflow-wrap: normal !important;
  }
  .gmail-copy-section,
  .gmail-copy-section-header,
  .gmail-copy-meta {
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    line-height: 1.35 !important;
    white-space: normal !important;
  }
  .gmail-copy-section-header span,
  .gmail-copy-meta span,
  .gmail-copy-meta div {
    height: auto !important;
    line-height: 1.35 !important;
    white-space: normal !important;
    overflow: visible !important;
  }
  .gmail-copy-stack,
  [data-gmail-copy="stack"] {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .gmail-copy-stack-cell,
  [data-gmail-copy="stack-cell"] {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
}
@media only screen and (min-width: ${breakpoint}px) {
  ${desktopWidthRules}
  .gmail-copy-root,
  .gmail-copy-root-cell,
  .gmail-copy-inner,
  [data-gmail-copy="root"],
  [data-gmail-copy="inner"] {
    width: ${width}px !important;
    min-width: ${width}px !important;
    max-width: ${width}px !important;
    box-sizing: border-box !important;
  }
  img.gmail-copy-chart,
  .gmail-copy-chart img,
  img[alt='Total Net Credit Trend'] {
    height: auto !important;
    border: 0 !important;
    display: block !important;
  }
}
</style>`;
}

/**
 * Wrap copied preview HTML so the watermark is a container background.
 * Returns a complete <table> fragment (never an orphaned <td>/<tr>).
 * Email uses the production HTTPS PNG only — no data: URIs in clipboard HTML.
 *
 * Default inline layout is the current mobile-fluid Gmail copy.
 * @media (min-width: Preview min-width) restores live Preview geometry for desktop.
 */
export function wrapCopiedPreviewHtml(html, desktopWidthPx, desktopMinWidthPx) {
  let inner = String(html || "").trim();
  const width = Number(desktopWidthPx) > 0 ? Math.round(Number(desktopWidthPx)) : 1000;
  const breakpoint =
    Number(desktopMinWidthPx) > 0 ? Math.round(Number(desktopMinWidthPx)) : 1000;
  let desktopWidths = [];

  // Final Gmail-only pass against the serialized clone (not live Preview DOM).
  if (typeof document !== "undefined" && inner) {
    const holder = document.createElement("div");
    holder.innerHTML = inner;
    if (holder.firstElementChild) {
      applyGmailMobileResponsiveLayer(holder.firstElementChild, width);
      desktopWidths = collectDesktopWidthPxValues(holder.firstElementChild);
    }
    inner = holder.innerHTML;
  }

  // Solid white background — no watermark on copied HTML.
  return (
    `<table class="gmail-copy-root" data-gmail-copy="root" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:${width}px;min-width:0;margin:0;font-family:Calibri, system-ui, -apple-system, sans-serif;font-size:14px;color:#334155;background:#ffffff;background-color:#ffffff;">` +
    `<tbody>` +
    `<tr>` +
    `<td class="gmail-copy-root-cell" style="padding:0;width:100%;max-width:${width}px;min-width:0;background-color:#ffffff;">` +
    gmailCopyResponsiveStyleBlock(width, desktopWidths, breakpoint) +
    inner +
    `</td>` +
    `</tr>` +
    `</tbody>` +
    `</table>`
  );
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function copyHtmlViaExecCommand(html, plain) {
  let copied = false;
  const onCopy = (event) => {
    event.preventDefault();
    event.clipboardData.setData("text/html", html);
    event.clipboardData.setData("text/plain", plain);
    copied = true;
  };

  document.addEventListener("copy", onCopy, true);
  const holder = document.createElement("span");
  holder.setAttribute("aria-hidden", "true");
  holder.textContent = "\u00a0";
  holder.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
  document.body.appendChild(holder);

  const selection = document.getSelection();
  const previousRanges = [];
  if (selection) {
    for (let i = 0; i < selection.rangeCount; i++) {
      previousRanges.push(selection.getRangeAt(i));
    }
    selection.removeAllRanges();
    const range = document.createRange();
    range.selectNodeContents(holder);
    selection.addRange(range);
  }

  try {
    document.execCommand("copy");
  } finally {
    if (selection) {
      selection.removeAllRanges();
      previousRanges.forEach((range) => selection.addRange(range));
    }
    holder.remove();
    document.removeEventListener("copy", onCopy, true);
  }

  return copied;
}

function toClipboardHtmlDocument(fragment) {
  const body = String(fragment || "").trim();
  const headStyles = (body.match(/<style[\s\S]*?<\/style>/gi) || []).join("");
  return `<html><head>${headStyles}</head><body><!--StartFragment-->${body}<!--EndFragment--></body></html>`;
}

/** Write preview HTML as text/html (with readable text/plain fallback). */
export async function copyPreviewHtmlToClipboard(html) {
  const fragment = String(html || "").trim();
  const htmlString = toClipboardHtmlDocument(fragment);
  const plain = htmlToPlainText(fragment);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const htmlBlob = new Blob([htmlString], { type: "text/html" });
    const plainBlob = new Blob([plain], { type: "text/plain" });
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": plainBlob,
        }),
      ]);
      return true;
    } catch {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": Promise.resolve(htmlBlob),
            "text/plain": Promise.resolve(plainBlob),
          }),
        ]);
        return true;
      } catch {
        // Fall through to execCommand with explicit MIME types.
      }
    }
  }

  return copyHtmlViaExecCommand(htmlString, plain);
}

/**
 * Large, faint favicon.ico centered over the preview document.
 * Out of normal flow — does not affect layout.
 */
export default function PreviewFaviconWatermark() {
  const [src, setSrc] = useState(cachedWatermarkDataUrl || "");

  useEffect(() => {
    let cancelled = false;
    resolveFaviconWatermarkDataUrl().then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!src) return null;

  return (
    <div
      data-preview-favicon-watermark="true"
      aria-hidden="true"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        margin: 0,
        padding: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: FAVICON_WATERMARK_Z_INDEX,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        width={FAVICON_WATERMARK_SIZE}
        height={FAVICON_WATERMARK_HEIGHT}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: `${FAVICON_WATERMARK_SIZE}px`,
          height: `${FAVICON_WATERMARK_HEIGHT}px`,
          maxWidth: "none",
          maxHeight: "none",
          margin: `${MARGIN_TOP}px 0 0 ${MARGIN_LEFT}px`,
          padding: 0,
          border: 0,
          outline: "none",
          display: "block",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
