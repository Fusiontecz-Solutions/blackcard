"use client";

import { toPng } from "html-to-image";
import {
  applyCopiedChartTableLayout,
  replaceCopiedChartWrappers,
} from "../components/BankMonthlyBarAndPositionsPie";

const CHART_CAPTURE_PIXEL_RATIO = 2;

const STYLE_PROPS = [
  "color",
  "background-color",
  // Section bands (.mca-merged-card) are gradients, not background colours.
  "background-image",
  "text-transform",
  "font-size",
  "font-weight",
  "font-family",
  "text-align",
  "line-height",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-color",
  "border-width",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "display",
  "flex",
  "flex-direction",
  "flex-wrap",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "align-items",
  "align-self",
  "justify-content",
  "gap",
  "vertical-align",
  "border-collapse",
  "border-spacing",
  "fill",
  "position",
  "top",
  "left",
  "right",
  "bottom",
  "z-index",
  "isolation",
  "pointer-events",
  "float",
  "clear",
  "overflow",
  "white-space",
  "word-break",
  "border-radius",
  "table-layout",
];

const UNSUPPORTED_IN_STYLE = /var\(|color-mix\(|oklch\(|oklab\(|lab\(|lch\(/i;

function isUnsupportedCssValue(value) {
  return !value || UNSUPPORTED_IN_STYLE.test(value);
}

export function isElementVisible(el) {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
  const cs = window.getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function roundDisplayedSize(el) {
  const rect = el.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  };
}

function restoreSvgSizeAttrs(svg, backup) {
  if (backup.width == null) svg.removeAttribute("width");
  else svg.setAttribute("width", backup.width);
  if (backup.height == null) svg.removeAttribute("height");
  else svg.setAttribute("height", backup.height);
  svg.style.width = backup.styleWidth;
  svg.style.height = backup.styleHeight;
}

function stampExplicitSvgPixelSize(svg) {
  const size = roundDisplayedSize(svg);
  const backup = {
    width: svg.getAttribute("width"),
    height: svg.getAttribute("height"),
    styleWidth: svg.style.width,
    styleHeight: svg.style.height,
  };
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", String(size.width));
  svg.setAttribute("height", String(size.height));
  svg.style.width = `${size.width}px`;
  svg.style.height = `${size.height}px`;
  if (!svg.getAttribute("viewBox")) {
    svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
  }
  return backup;
}

function rasterizeSvgFallback(svg, displayW, displayH) {
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(displayW));
  clone.setAttribute("height", String(displayH));
  clone.style.width = `${displayW}px`;
  clone.style.height = `${displayH}px`;
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${displayW} ${displayH}`);
  }

  let markup = new XMLSerializer().serializeToString(clone);
  if (!markup.includes("xmlns")) {
    markup = markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(displayW * CHART_CAPTURE_PIXEL_RATIO));
  canvas.height = Math.max(1, Math.round(displayH * CHART_CAPTURE_PIXEL_RATIO));
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL("image/png");
      URL.revokeObjectURL(url);
      resolve(png);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function rasterizeLiveChartNode(liveNode) {
  const { width, height } = roundDisplayedSize(liveNode);
  const svgs = [...liveNode.querySelectorAll("svg")];
  const backups = svgs.map((svg) => stampExplicitSvgPixelSize(svg));

  try {
    let png = null;
    try {
      png = await toPng(liveNode, {
        pixelRatio: CHART_CAPTURE_PIXEL_RATIO,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width,
        height,
        canvasWidth: width * CHART_CAPTURE_PIXEL_RATIO,
        canvasHeight: height * CHART_CAPTURE_PIXEL_RATIO,
        style: {
          width: `${width}px`,
          height: `${height}px`,
          transform: "none",
        },
      });
    } catch {
      png = null;
    }

    if (!png) {
      const svg = liveNode.querySelector("svg");
      if (svg) png = await rasterizeSvgFallback(svg, width, height);
    }

    if (!png) return null;
    return { png, width, height };
  } finally {
    svgs.forEach((svg, i) => restoreSvgSizeAttrs(svg, backups[i]));
  }
}

function collectLiveChartCaptureTargets(container) {
  const bars = [...container.querySelectorAll("[data-chart-kind='bar']")].filter(isElementVisible);
  if (bars.length > 0) return bars.map((el) => ({ el, kind: "bar" }));
  return [...container.querySelectorAll(".recharts-wrapper")]
    .filter(isElementVisible)
    .map((el) => ({ el, kind: "bar" }));
}

export async function captureChartsAsImages(container) {
  if (!container || typeof window === "undefined") return [];
  const targets = collectLiveChartCaptureTargets(container);
  const area = container.querySelector(".chart-capture-area");
  const rowSize = area && isElementVisible(area) ? roundDisplayedSize(area) : null;
  const captured = [];

  for (const { el, kind } of targets) {
    const liveRect = roundDisplayedSize(el);
    const card = el.closest(".chart-cell");
    const cardRect = card && isElementVisible(card) ? roundDisplayedSize(card) : liveRect;
    const result = await rasterizeLiveChartNode(el);
    if (typeof console !== "undefined") {
      console.info("[copy-charts] capture", {
        kind,
        liveWidth: liveRect.width,
        liveHeight: liveRect.height,
        cardWidth: cardRect.width,
        cardHeight: cardRect.height,
        pngBytes: result?.png?.length || 0,
        capturedWidth: result?.width,
        capturedHeight: result?.height,
      });
    }
    if (!result?.png) continue;
    captured.push({
      png: result.png,
      width: result.width,
      height: result.height,
      kind,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      rowWidth: rowSize?.width || 0,
    });
  }

  return captured;
}

function replaceChartsInClone(_original, clone, chartImages) {
  replaceCopiedChartWrappers(clone, chartImages);
}

export function applyChartTableLayout(root, chartImages) {
  applyCopiedChartTableLayout(root, chartImages);
  const chartCaptureArea = root.querySelector(".chart-capture-area");
  if (!chartCaptureArea) return;
  const current = chartCaptureArea.getAttribute("style") || "";
  chartCaptureArea.setAttribute(
    "style",
    `${current} display:block !important;width:100% !important;margin:16px 0 !important;clear:both !important;`
  );
}

function isChartCaptureSubtree(el) {
  return Boolean(
    el?.classList?.contains?.("chart-capture-area") ||
      el?.closest?.(".chart-capture-area") ||
      el?.hasAttribute?.("data-copy-chart-h") ||
      el?.hasAttribute?.("data-copy-chart-w")
  );
}

function readPositiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Credits Trend copy HTML uses width="100%"; parseInt of that is 100px. Use captured px. */
function resolvePdfChartImageSize(img) {
  const widthAttr = img.getAttribute("width");
  const widthIsPercent = String(widthAttr || "").includes("%");
  const fromAttrW = widthIsPercent ? 0 : readPositiveInt(widthAttr);
  const fromAttrH = readPositiveInt(img.getAttribute("height"));
  const fromGmail = readPositiveInt(img.getAttribute("data-gmail-dw"));
  const host = img.closest("[data-copy-chart-w], [data-copy-chart-h]");
  const fromHostW = readPositiveInt(host?.getAttribute("data-copy-chart-w"));
  const fromHostH = readPositiveInt(host?.getAttribute("data-copy-chart-h"));
  return {
    w: fromGmail || fromHostW || fromAttrW,
    h: fromHostH || fromAttrH,
  };
}

function lockPdfChartImages(root) {
  if (!root?.querySelectorAll) return;
  root.querySelectorAll(".chart-capture-area img").forEach((img) => {
    const { w, h } = resolvePdfChartImageSize(img);
    if (!w || !h) return;
    img.setAttribute("width", String(w));
    img.setAttribute("height", String(h));
    img.setAttribute(
      "style",
      `display:block !important;width:${w}px !important;height:${h}px !important;max-width:${w}px !important;max-height:${h}px !important;border:0 !important;outline:none !important;`
    );
  });
  root.querySelectorAll("[data-copy-chart-h]").forEach((node) => {
    const h = parseInt(node.getAttribute("data-copy-chart-h"), 10);
    if (!Number.isFinite(h) || h <= 0) return;
    const current = node.getAttribute("style") || "";
    node.setAttribute(
      "style",
      `${current};display:block !important;width:100% !important;max-width:100% !important;height:${h}px !important;overflow:visible !important;`
    );
  });
}

function logPdfChartState(root, chartImages, stage) {
  if (typeof console === "undefined") return;
  const barCap = (chartImages || []).find((img) => img.kind === "bar") || (chartImages || [])[0];
  const barImg = root?.querySelector?.("[data-chart-kind='bar'] img, img[alt='Total Net Credit Trend']");
  console.info("[PDF charts]", stage, {
    "bar live rect": barCap ? `${barCap.width} ${barCap.height}` : "missing",
    "bar capture": barCap ? `${barCap.width} ${barCap.height}` : "missing",
    "bar image": barImg
      ? `${barImg.getAttribute("width")} ${barImg.getAttribute("height")} display=${barImg.style.display} src=${barImg.getAttribute("src")?.slice(0, 22)}`
      : "missing",
  });
}

function inlineAllComputedStyles(original, cloned) {
  if (original.nodeType !== Node.ELEMENT_NODE || cloned.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  if (isChartCaptureSubtree(original) || isChartCaptureSubtree(cloned)) {
    return;
  }

  if (
    original.getAttribute?.("data-preview-favicon-watermark") === "true" ||
    cloned.getAttribute?.("data-preview-favicon-watermark") === "true" ||
    original.closest?.("[data-preview-favicon-watermark='true']") ||
    cloned.closest?.("[data-preview-favicon-watermark='true']")
  ) {
    return;
  }

  const computed = window.getComputedStyle(original);

  if (computed.display === "none" || computed.visibility === "hidden") {
    cloned.setAttribute("style", "display:none !important;visibility:hidden !important;");
  } else {
    let style = "";
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop);
      // Always keep font-weight (even "normal"/400) so PDF doesn't inherit wrong boldness.
      if (prop === "font-weight") {
        style += `${prop}:${value && value !== "none" ? value : "400"} !important;`;
        continue;
      }
      if (prop === "font-family") {
        style += "font-family:Calibri, system-ui, -apple-system, sans-serif !important;";
        continue;
      }
      // Never bake scroll containers into PDF — html-to-image/html2canvas paint OS scrollbars.
      if (prop === "overflow") {
        const ov = String(value || "").toLowerCase();
        if (ov.includes("auto") || ov.includes("scroll") || ov.includes("overlay")) {
          style += "overflow:visible !important;";
        } else if (value && value !== "none" && value !== "normal") {
          style += `${prop}:${value} !important;`;
        }
        continue;
      }
      if (!value || value === "none" || value === "normal") continue;
      if (value === "0px none rgb(0, 0, 0)") continue;
      if (isUnsupportedCssValue(value)) continue;
      style += `${prop}:${value} !important;`;
    }
    // Ensure offer-table cell borders survive CRM border resets in PDF capture.
    if (original.closest?.("[data-mca-offer-table]") && original.tagName === "TD") {
      style += "border:1px solid #94a3b8 !important;";
    }
    if (original.getAttribute?.("data-mca-offer-table") != null) {
      style += "border:1px solid rgb(100, 100, 100) !important;border-top:none !important;border-collapse:collapse !important;";
    }
    if (style) {
      cloned.setAttribute("style", style);
    }
  }

  cloned.removeAttribute("class");

  const oChildren = original.childNodes;
  const cChildren = cloned.childNodes;
  for (let i = 0; i < oChildren.length; i++) {
    if (oChildren[i].nodeType === Node.ELEMENT_NODE && cChildren[i]?.nodeType === Node.ELEMENT_NODE) {
      inlineAllComputedStyles(oChildren[i], cChildren[i]);
    }
  }
}

function stripCssVariables(root) {
  root.querySelectorAll("[style]").forEach((el) => {
    const style = el.getAttribute("style");
    if (style && style.includes("var(")) {
      el.setAttribute("style", style.replace(/var\(--[^)]+\)/g, "#e2e8f0"));
    }
  });
}

function cleanupCaptureStyles(element) {
  if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
  if (isChartCaptureSubtree(element) && element.classList?.contains("chart-capture-area")) {
    return;
  }
  if (element.closest?.(".chart-capture-area")) return;

  const style = element.getAttribute("style");
  if (style) {
    let cleaned = style
      .replace(/backdrop-filter[^;]*;?/gi, "")
      .replace(/filter[^;]*blur[^;]*;?/gi, "")
      .replace(/box-shadow[^;]*;?/gi, "")
      .replace(/text-shadow[^;]*;?/gi, "")
      // Only the transform property itself, not text-transform.
      .replace(/(^|[;\s])transform\s*:[^;]*;?/gi, "$1")
      .replace(/transition[^;]*;?/gi, "");

    const bgColorMatch = style.match(/background-color\s*:\s*([^;!]+)/i);
    if (bgColorMatch && !/background-color\s*:/i.test(cleaned)) {
      cleaned += ` background-color:${bgColorMatch[1].trim()} !important;`;
    }
    element.setAttribute("style", cleaned);
  }

  for (const child of element.children) {
    cleanupCaptureStyles(child);
  }
}

export function fixEmailTopLayout(root) {
  const emailTopLayout = root.querySelector("[data-email-top-layout='true']");
  if (!emailTopLayout?.firstElementChild) return;

  const topRow = emailTopLayout.firstElementChild;
  topRow.setAttribute("style", `${topRow.getAttribute("style") || ""} display:block !important;`.trim());
  Array.from(topRow.children).forEach((child, idx) => {
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    let s = child.getAttribute("style") || "";
    if (!/display\s*:/i.test(s)) s += " display:block !important;";
    if (idx > 0 && !/margin-top\s*:/i.test(s)) s += " margin-top:16px !important;";
    child.setAttribute("style", s.trim());
  });
}

function appendImportantStyle(el, extra) {
  if (!el || !extra) return;
  let style = el.getAttribute("style") || "";
  if (style && !style.trim().endsWith(";")) style += ";";
  el.setAttribute("style", `${style} ${extra}`.trim());
}

function isPdfHeaderRow(el) {
  if (!el || el.nodeType !== 1) return false;
  const t = String(el.textContent || "");
  return t.includes("Client Name:") && t.includes("Date:");
}

function preparePdfHeaderSpacing(root) {
  const header = Array.from(root.children).find(isPdfHeaderRow);
  if (!header) return;

  // Use height:auto + margin-bottom so inlined height cannot clip Date onto Offer.
  appendImportantStyle(
    header,
    "height:auto !important;min-height:32px !important;margin-bottom:24px !important;overflow:visible !important;flex-wrap:nowrap !important;align-items:center !important;"
  );

  Array.from(header.querySelectorAll("div")).forEach((div) => {
    if (isPdfHeaderRow(div) && String(div.textContent || "").length < 400) {
      appendImportantStyle(div, "flex-wrap:nowrap !important;overflow:visible !important;height:auto !important;");
    }
  });

  let next = header.nextElementSibling;
  while (next) {
    const text = String(next.textContent || "");
    if (/\bOffer\b|\bLeverage\b/.test(text)) {
      const style = next.getAttribute("style") || "";
      const mt = /margin-top\s*:\s*([0-9.]+)px/i.exec(style);
      const mtPx = mt ? parseFloat(mt[1]) : 0;
      if (!(mtPx >= 16)) {
        appendImportantStyle(next, "margin-top:16px !important;");
      }
      break;
    }
    next = next.nextElementSibling;
  }
}

function gluePdfMonetaryText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!node.nodeValue || !node.nodeValue.includes("$")) return;
    node.nodeValue = node.nodeValue.replace(/\$\s+(?=[\d,])/g, "$\u00a0");
  });
}

function gluePdfPercentText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (!node.nodeValue || !node.nodeValue.includes("%")) return;
    // Keep "18.95 %" / "18.95%" as one unbreakable token in PDF rasterization.
    node.nodeValue = node.nodeValue
      .replace(/(\d)\s+%/g, "$1\u00a0%")
      .replace(/(\d)%/g, "$1\u00a0%");
  });
}

function findPdfLeverageMetricBodies(root) {
  const bodies = [];
  const seen = new Set();
  root.querySelectorAll("span, div").forEach((el) => {
    if (el.children.length > 0) return;
    if (String(el.textContent || "").trim() !== "Our Hold") return;
    const row = el.parentElement;
    const body = row?.parentElement;
    if (!body || seen.has(body)) return;
    const rows = Array.from(body.children).filter((c) => c.nodeType === 1);
    if (rows.length < 3) return;
    const joined = rows.map((r) => String(r.textContent || "").replace(/\s+/g, " ").trim()).join(" | ");
    if (!joined.includes("Our Hold") || !joined.includes("Total Hold")) return;
    seen.add(body);
    bodies.push(body);
  });
  return bodies;
}

function readInlineStyleProp(el, prop, fallback) {
  const style = el?.getAttribute?.("style") || "";
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, "i");
  const m = re.exec(style);
  return m ? m[1].trim() : fallback;
}

/**
 * PDF capture only: the live Leverage card uses flex rows with flex-grow,
 * which stretches against Bank Net Credit and makes html-to-image/html2canvas
 * drop borders and wrap "Our Hold" / "18.95 %". Rebuild as a compact table.
 */
function hardenPdfLeverageMetricLists(root) {
  const doc = root.ownerDocument || document;
  const bodies = findPdfLeverageMetricBodies(root);

  bodies.forEach((body) => {
    const rows = Array.from(body.children).filter((c) => c.nodeType === 1);
    const table = doc.createElement("table");
    table.setAttribute(
      "style",
      [
        "width:100% !important",
        "border-collapse:collapse !important",
        "border-spacing:0 !important",
        "table-layout:fixed !important",
        "background-color:#ffffff !important",
        "height:auto !important",
        "min-height:0 !important",
      ].join(";")
    );

    const tbody = doc.createElement("tbody");
    rows.forEach((row, index) => {
      const cells = Array.from(row.children).filter((c) => c.nodeType === 1);
      const labelEl = cells[0];
      const valueEl = cells[cells.length - 1];
      const labelText = String(labelEl?.textContent || "").replace(/\s+/g, " ").trim();
      let valueText = String(valueEl?.textContent || "").replace(/\s+/g, " ").trim();
      valueText = valueText
        .replace(/(\d)\s+%/g, "$1\u00a0%")
        .replace(/(\d)%/g, "$1\u00a0%")
        .replace(/\$\s+(?=[\d,])/g, "$\u00a0");

      const labelColor = readInlineStyleProp(labelEl, "color", "#143c2e");
      const valueColor = readInlineStyleProp(valueEl, "color", "#1e293b");
      const valueWeight = readInlineStyleProp(valueEl, "font-weight", "700");

      const tr = doc.createElement("tr");
      const borderBottom =
        index < rows.length - 1 ? "border-bottom:1px solid #cbd5e1 !important;" : "border-bottom:none !important;";

      const tdLabel = doc.createElement("td");
      tdLabel.textContent = labelText;
      tdLabel.setAttribute(
        "style",
        [
          "padding:10px 12px !important",
          "line-height:18px !important",
          "vertical-align:middle !important",
          "font-size:14px !important",
          "font-weight:500 !important",
          `color:${labelColor} !important`,
          "white-space:nowrap !important",
          "word-break:keep-all !important",
          "overflow:visible !important",
          "width:58% !important",
          borderBottom,
          "background-color:#ffffff !important",
        ].join(";")
      );

      const tdValue = doc.createElement("td");
      tdValue.textContent = valueText;
      tdValue.setAttribute(
        "style",
        [
          "padding:10px 12px !important",
          "line-height:18px !important",
          "vertical-align:middle !important",
          "font-size:14px !important",
          `font-weight:${valueWeight} !important`,
          `color:${valueColor} !important`,
          "text-align:right !important",
          "white-space:nowrap !important",
          "word-break:keep-all !important",
          "overflow:visible !important",
          "width:42% !important",
          borderBottom,
          "background-color:#ffffff !important",
        ].join(";")
      );

      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);

    // Keep rows compact in a top-aligned table, but stretch the card shell
    // so Leverage matches Bank Net Credit height (empty space below content).
    const bodyWrap = doc.createElement("div");
    bodyWrap.setAttribute(
      "style",
      [
        "flex:1 1 auto !important",
        "display:flex !important",
        "flex-direction:column !important",
        "justify-content:flex-start !important",
        "align-items:stretch !important",
        "min-height:0 !important",
        "height:auto !important",
        "background-color:#ffffff !important",
      ].join(";")
    );
    bodyWrap.appendChild(table);

    const card = body.parentElement;
    if (card) {
      appendImportantStyle(
        card,
        [
          "display:flex !important",
          "flex-direction:column !important",
          "height:100% !important",
          "min-height:100% !important",
          "align-self:stretch !important",
          "flex:1 1 auto !important",
          "overflow:hidden !important",
        ].join(";")
      );
      const cardParent = card.parentElement;
      if (cardParent) {
        appendImportantStyle(
          cardParent,
          "display:flex !important;align-items:stretch !important;align-self:stretch !important;height:auto !important;min-height:100% !important;"
        );
      }
      const stretchParent = cardParent?.parentElement;
      if (stretchParent) {
        appendImportantStyle(
          stretchParent,
          "display:flex !important;align-items:stretch !important;height:auto !important;"
        );
      }
    }

    body.replaceWith(bodyWrap);
  });
}

function preventPdfMoneyWrap(root) {
  gluePdfMonetaryText(root);
  gluePdfPercentText(root);

  root.querySelectorAll("td, span").forEach((el) => {
    const text = String(el.textContent || "").trim();
    if (text !== "Est Daily Repay") return;
    const row = el.closest("tr") || el.parentElement;
    if (!row) return;
    Array.from(row.querySelectorAll("td, span")).forEach((cell) => {
      appendImportantStyle(cell, "white-space:nowrap !important;word-break:keep-all !important;overflow:visible !important;");
    });
  });

  root.querySelectorAll("td, span").forEach((el) => {
    const text = String(el.textContent || "").trim();
    if (!/^\$[\u00a0\s]?[\d,]+\.?\d*$/.test(text) && !/^[\d,]+\.?\d*[\u00a0\s]?%$/.test(text)) {
      return;
    }
    appendImportantStyle(el, "white-space:nowrap !important;word-break:keep-all !important;overflow:visible !important;");
    if (el.tagName === "SPAN") {
      appendImportantStyle(el, "display:inline-block !important;");
    }
  });
}

/** After layout in the capture iframe: force Leverage card height = Bank Net Credit card height. */
export function equalizePdfLeverageBankCardHeights(root) {
  if (!root || typeof window === "undefined") return;

  const isHeaderLike = (el, label) => {
    const t = String(el?.textContent || "").replace(/\s+/g, " ").trim();
    return t === label || t.toUpperCase() === label.toUpperCase();
  };

  const headers = Array.from(root.querySelectorAll("div, td, th, span")).filter(
    (el) => isHeaderLike(el, "Bank Net Credit") || isHeaderLike(el, "Leverage")
  );

  let bankCard = null;
  let leverageCard = null;

  headers.forEach((header) => {
    const label = String(header.textContent || "").replace(/\s+/g, " ").trim().toUpperCase();
    // Prefer the card shell: header's parent that also contains table/body content.
    let card = header.parentElement;
    if (!card) return;
    // Climb one level if header is nested in a styled header bar.
    if (card.parentElement && card.parentElement.children.length >= 2) {
      const parentText = String(card.parentElement.textContent || "");
      if (
        (label === "BANK NET CREDIT" && parentText.includes("AVERAGE")) ||
        (label === "LEVERAGE" && (parentText.includes("Our Hold") || parentText.includes("Total Hold")))
      ) {
        card = card.parentElement;
      }
    }
    if (label === "BANK NET CREDIT") bankCard = card;
    if (label === "LEVERAGE" && (card.textContent || "").includes("Our Hold")) {
      leverageCard = card;
    }
  });

  if (!bankCard || !leverageCard || bankCard === leverageCard) return;

  const bankHeight = Math.ceil(bankCard.getBoundingClientRect().height);
  if (!bankHeight || bankHeight < 40) return;

  appendImportantStyle(
    leverageCard,
    `height:${bankHeight}px !important;min-height:${bankHeight}px !important;max-height:${bankHeight}px !important;box-sizing:border-box !important;`
  );
}

function stripCaptureClipping(el) {
  if (!el) return;
  appendImportantStyle(
    el,
    [
      "max-height:none !important",
      "height:auto !important",
      "min-height:0 !important",
      "overflow:visible !important",
      "overflow-x:visible !important",
      "overflow-y:visible !important",
      "flex-shrink:0 !important",
    ].join(";")
  );
}

function findBankNetCreditScrollContainers(root) {
  const containers = new Set();
  if (!root?.querySelectorAll) return containers;

  root.querySelectorAll("[data-preview-expand-on-capture='true']").forEach((el) => {
    containers.add(el);
  });

  root.querySelectorAll("div").forEach((el) => {
    const label = String(el.textContent || "").replace(/\s+/g, " ").trim();
    if (label !== "Bank Net Credit") return;
    const card = el.parentElement;
    const table = card?.querySelector?.("table");
    const scroll = table?.parentElement;
    if (scroll) containers.add(scroll);
  });

  return containers;
}

/**
 * PDF clone only, after the clone is in the capture iframe.
 * Browser preview keeps compact scrolling; capture must use the table's
 * full content height (scrollHeight) so no Net Credit rows are clipped.
 */
function expandBankNetCreditForPdfCapture(root) {
  if (!root) return;

  const containers = findBankNetCreditScrollContainers(root);
  containers.forEach((container) => {
    const table = container.querySelector("table");
    if (!table) return;

    table.querySelectorAll("thead, tfoot, th, td").forEach((section) => {
      appendImportantStyle(
        section,
        "position:static !important;top:auto !important;bottom:auto !important;"
      );
    });

    stripCaptureClipping(container);
    appendImportantStyle(table, "height:auto !important;max-height:none !important;overflow:visible !important;");

    const contentHeight = Math.max(
      table.scrollHeight || 0,
      table.offsetHeight || 0,
      container.scrollHeight || 0
    );
    if (contentHeight > 0) {
      appendImportantStyle(
        container,
        [
          `height:${contentHeight}px !important`,
          `min-height:${contentHeight}px !important`,
          "max-height:none !important",
          "overflow:visible !important",
          "overflow-x:visible !important",
          "overflow-y:visible !important",
        ].join(";")
      );
    }

    let node = container.parentElement;
    while (node && node !== root) {
      stripCaptureClipping(node);
      node = node.parentElement;
    }
  });

  stripCaptureClipping(root);
}

/** PDF clone only. Do not call from Gmail Copy. */
export function preparePdfCaptureLayout(root) {
  if (!root) return;
  preparePdfHeaderSpacing(root);
  hardenPdfLeverageMetricLists(root);
  preventPdfMoneyWrap(root);
  stripPdfScrollbars(root);
  normalizeOfferTablePdfFonts(root);
}

/**
 * overflow-x-auto wrappers (Offer / Bank / Positions) get scrollbars painted into the PDF.
 * Expand them fully for capture.
 */
function stripPdfScrollbars(root) {
  if (!root?.querySelectorAll) return;

  stripCaptureClipping(root);

  root.querySelectorAll("*").forEach((el) => {
    const style = el.getAttribute("style") || "";
    const overflowMatch = /overflow(?:-x|-y)?\s*:\s*([^;!]+)/gi;
    let hasScroll = /overflow(?:-x|-y)?\s*:\s*(auto|scroll|overlay)/i.test(style);
    if (!hasScroll) {
      // Also catch elements whose only hint is a constrained scroll wrapper around a table.
      const tag = el.tagName;
      if (tag === "DIV" && el.querySelector(":scope > table") && /max-height\s*:\s*\d/i.test(style)) {
        hasScroll = true;
      }
    }
    if (!hasScroll) return;

    stripCaptureClipping(el);
    appendImportantStyle(
      el,
      "width:100% !important;max-width:none !important;min-width:0 !important;"
    );
  });

  const offerTable = root.querySelector("[data-mca-offer-table]");
  if (offerTable) {
    let node = offerTable.parentElement;
    while (node && node !== root) {
      stripCaptureClipping(node);
      appendImportantStyle(
        node,
        "width:100% !important;max-width:none !important;height:auto !important;"
      );
      node = node.parentElement;
    }
    appendImportantStyle(
      offerTable,
      "width:100% !important;min-width:0 !important;max-width:none !important;table-layout:fixed !important;overflow:visible !important;"
    );
  }
}

/**
 * Force MCA Offer typography into the PDF clone (CRM computed styles often shrink/thin text).
 * Labels = 14px/500, values = 17px/700 (table base size).
 */
function normalizeOfferTablePdfFonts(root) {
  const table = root?.querySelector?.("[data-mca-offer-table]");
  if (!table) return;

  appendImportantStyle(
    table,
    "font-family:Calibri, system-ui, -apple-system, sans-serif !important;font-size:17px !important;color:#1e293b !important;"
  );

  table.querySelectorAll("td").forEach((td, idx) => {
    const col = idx % 4;
    const isLabel = col === 0 || col === 2;
    const text = String(td.textContent || "").trim();
    const isFeesValue =
      !isLabel && /%\s*$/.test(text) && String(td.previousElementSibling?.textContent || "").includes("Fees");

    if (isLabel) {
      appendImportantStyle(
        td,
        "font-family:Calibri, system-ui, -apple-system, sans-serif !important;font-size:14px !important;font-weight:500 !important;color:#1e293b !important;"
      );
    } else {
      appendImportantStyle(
        td,
        `font-family:Calibri, system-ui, -apple-system, sans-serif !important;font-size:${isFeesValue ? "14px" : "17px"} !important;font-weight:700 !important;`
      );
    }

    td.querySelectorAll("*").forEach((child) => {
      appendImportantStyle(
        child,
        "font-family:Calibri, system-ui, -apple-system, sans-serif !important;"
      );
      if (isLabel) {
        appendImportantStyle(child, "font-size:14px !important;font-weight:500 !important;");
      } else {
        appendImportantStyle(
          child,
          `font-size:${isFeesValue ? "14px" : "17px"} !important;font-weight:700 !important;`
        );
      }
    });
  });
}

export async function convertImagesToBase64(element) {
  if (!element) return;
  const images = element.querySelectorAll("img");

  for (const img of images) {
    const src = img.getAttribute("src");
    if (!src || src.startsWith("data:")) continue;

    try {
      let dataUrl;
      let resolvedSrc = src;

      if (src.startsWith("/") || (!src.startsWith("http") && !src.startsWith("blob:"))) {
        resolvedSrc = src.startsWith("/")
          ? `${window.location.origin}${src}`
          : `${window.location.origin}/${src}`;
      }

      if (src.startsWith("blob:")) {
        const response = await fetch(src);
        const blob = await response.blob();
        dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        dataUrl = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("Image load timeout")), 8000);
          const imgEl = new Image();
          imgEl.crossOrigin = "anonymous";

          imgEl.onload = () => {
            clearTimeout(timeout);
            try {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d");
              canvas.width = imgEl.width;
              canvas.height = imgEl.height;
              ctx.drawImage(imgEl, 0, 0);
              resolve(canvas.toDataURL("image/png"));
            } catch (e) {
              reject(e);
            }
          };

          imgEl.onerror = () => {
            clearTimeout(timeout);
            fetch(resolvedSrc, { mode: "cors", credentials: "include" })
              .then((response) => {
                if (!response.ok) throw new Error("Fetch failed");
                return response.blob();
              })
              .then(
                (blob) =>
                  new Promise((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result);
                    reader.onerror = rej;
                    reader.readAsDataURL(blob);
                  })
              )
              .then(resolve)
              .catch(() => resolve(null));
          };

          imgEl.src = resolvedSrc;
        });
      }

      if (dataUrl) {
        img.setAttribute("src", dataUrl);
      } else {
        img.remove();
      }
    } catch {
      img.remove();
    }
  }
}

export function waitForLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

/**
 * Build an isolated capture tree (iframe, inlined styles, no app stylesheets).
 */
export async function buildPreparedCaptureRoot(element) {
  if (!element || typeof window === "undefined") {
    throw new Error("No element to capture");
  }

  const chartImages = await captureChartsAsImages(element);
  const clone = element.cloneNode(true);

  replaceChartsInClone(element, clone, chartImages);
  logPdfChartState(clone, chartImages, "after replace");
  await convertImagesToBase64(clone);
  inlineAllComputedStyles(element, clone);
  stripCssVariables(clone);
  cleanupCaptureStyles(clone);
  fixEmailTopLayout(clone);
  preparePdfCaptureLayout(clone);
  if (chartImages.length >= 1) {
    applyChartTableLayout(clone, chartImages);
  }
  lockPdfChartImages(clone);
  logPdfChartState(clone, chartImages, "after pdf lock");

  const captureWidth = Math.max(element.scrollWidth || 0, element.offsetWidth || 0, 1000);
  clone.style.setProperty("min-width", `${captureWidth}px`, "important");
  clone.style.setProperty("width", `${captureWidth}px`, "important");
  clone.style.setProperty("background", "#ffffff", "important");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("data-pdf-capture-iframe", "true");
  iframe.setAttribute("title", "PDF capture");
  iframe.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "border:0",
    "opacity:0",
    "pointer-events:none",
    "z-index:2147483646",
    `width:${captureWidth}px`,
  ].join(";");

  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    throw new Error("Could not access capture iframe");
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body {
      font-family: Calibri, system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: #334155;
      width: ${captureWidth}px;
    }
    * {
      scrollbar-width: none !important;
    }
    *::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }
    table { border-collapse: collapse; }
    [data-mca-offer-table] {
      font-size: 17px !important;
      font-family: Calibri, system-ui, -apple-system, sans-serif !important;
    }
    [data-mca-offer-scroll],
    [data-mca-offer-table],
    [data-mca-offer-table] * {
      overflow: visible !important;
      max-height: none !important;
    }
    img { max-width: 100%; display: block; }
    .chart-capture-area img {
      max-width: none !important;
      max-height: none !important;
    }
    [data-preview-favicon-watermark="true"] {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      right: 0 !important;
      bottom: 0 !important;
      width: 100% !important;
      height: 100% !important;
      z-index: 5 !important;
      pointer-events: none !important;
      overflow: hidden !important;
      max-width: none !important;
      max-height: none !important;
    }
    [data-preview-favicon-watermark="true"] img {
      max-width: none !important;
      max-height: none !important;
    }
  </style>
</head>
<body></body>
</html>`);
  doc.close();
  doc.body.appendChild(clone);

  await waitForLayout();
  equalizePdfLeverageBankCardHeights(clone);
  await waitForLayout();
  // Expand Net Credit after leverage equalization so leverage stays compact
  // while the table grows to its full content height for capture.
  expandBankNetCreditForPdfCapture(clone);
  await waitForLayout();
  expandBankNetCreditForPdfCapture(clone);
  await waitForLayout();

  const expandedHeight = Math.max(clone.scrollHeight || 0, clone.offsetHeight || 0, 1);
  iframe.style.height = `${expandedHeight}px`;
  iframe.style.minHeight = `${expandedHeight}px`;
  doc.documentElement.style.height = "auto";
  doc.body.style.height = "auto";
  doc.body.style.overflow = "visible";

  await waitForLayout();

  return {
    root: clone,
    iframe,
    captureWidth,
    cleanup: () => {
      iframe.remove();
    },
  };
}
