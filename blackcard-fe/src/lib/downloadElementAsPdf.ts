import html2canvas from "html2canvas";
import jsPDF from "jspdf";

const MAX_CANVAS_DIMENSION = 12000;

function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function scaleCanvasIfNeeded(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const maxDim = Math.max(canvas.width, canvas.height);
  if (maxDim <= MAX_CANVAS_DIMENSION) return canvas;
  const scale = MAX_CANVAS_DIMENSION / maxDim;
  const scaled = document.createElement("canvas");
  scaled.width = Math.max(1, Math.floor(canvas.width * scale));
  scaled.height = Math.max(1, Math.floor(canvas.height * scale));
  const ctx = scaled.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

async function captureChartPng(container: HTMLElement): Promise<string | null> {
  const liveNode = container.querySelector(
    "[data-chart-kind='bar']",
  ) as HTMLElement | null;
  if (!liveNode) return null;
  const rect = liveNode.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  try {
    const canvas = await html2canvas(liveNode, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      foreignObjectRendering: false,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function replaceChartWithPng(root: HTMLElement, pngDataUrl: string | null) {
  if (!pngDataUrl) return;
  root.querySelectorAll("[data-chart-kind='bar']").forEach((node) => {
    const img = document.createElement("img");
    img.src = pngDataUrl;
    img.alt = "Credits Trend";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.display = "block";
    img.style.maxWidth = "100%";
    node.replaceWith(img);
  });
}

/**
 * Clone preview into an off-screen host so html2canvas is not affected by
 * Dialog transforms / overflow clipping.
 */
async function buildOffscreenCaptureRoot(element: HTMLElement): Promise<{
  host: HTMLDivElement;
  root: HTMLElement;
  cleanup: () => void;
}> {
  const chartPng = await captureChartPng(element);
  const clone = element.cloneNode(true) as HTMLElement;

  // Inline resolved colors/borders for PDF while trees still match, then swap chart.
  applyComputedStylesForCapture(element, clone);
  replaceChartWithPng(clone, chartPng);

  // Force opaque white background and safe box model for capture.
  clone.style.background = "#ffffff";
  clone.style.backgroundColor = "#ffffff";
  clone.style.color = "#0f172a";
  clone.style.width = `${Math.max(element.scrollWidth, element.offsetWidth, 900)}px`;
  clone.style.maxWidth = "none";
  clone.style.minWidth = "900px";
  clone.style.boxSizing = "border-box";
  clone.style.transform = "none";
  clone.style.position = "static";
  clone.style.overflow = "visible";

  const host = document.createElement("div");
  host.setAttribute("data-pdf-capture-host", "true");
  host.style.cssText = [
    "position:fixed",
    "left:0",
    "top:0",
    "width:auto",
    "height:auto",
    "opacity:1",
    "pointer-events:none",
    "z-index:-1",
    "background:#ffffff",
    "overflow:visible",
  ].join(";");
  host.appendChild(clone);
  document.body.appendChild(host);

  await waitForPaint();

  return {
    host,
    root: clone,
    cleanup: () => {
      try {
        host.remove();
      } catch {
        /* ignore */
      }
    },
  };
}

function sanitizeCloneForHtml2Canvas(doc: Document) {
  // Drop stylesheets that may include oklch()/lab() Tailwind v4 colors —
  // html2canvas cannot parse those and throws.
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => node.remove());
  doc.querySelectorAll("style").forEach((node) => {
    const text = node.textContent || "";
    if (
      text.includes("oklch(") ||
      text.includes("oklab(") ||
      text.includes("color-mix(")
    ) {
      node.remove();
    }
  });

  // Neutralize unsupported color functions left on inline styles.
  doc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const style = el.getAttribute("style");
    if (!style) return;
    if (
      /oklch\(|oklab\(|lab\(|lch\(|color-mix\(/i.test(style)
    ) {
      el.setAttribute(
        "style",
        style
          .replace(
            /(color|background|background-color|border-color)\s*:\s*[^;]*(oklch|oklab|lab|lch|color-mix)[^;]*;?/gi,
            "",
          )
          .concat(" color:#0f172a; background-color:transparent;"),
      );
    }
  });
}

async function rasterizeElement(root: HTMLElement): Promise<HTMLCanvasElement> {
  const captureWidth = Math.max(
    root.scrollWidth || 0,
    root.offsetWidth || 0,
    Math.ceil(root.getBoundingClientRect().width || 0),
    800,
  );
  const captureHeight = Math.max(
    root.scrollHeight || 0,
    root.offsetHeight || 0,
    Math.ceil(root.getBoundingClientRect().height || 0),
    1,
  );

  const common = {
    useCORS: true,
    allowTaint: true as const,
    backgroundColor: "#ffffff",
    logging: false,
    scrollX: 0,
    scrollY: 0,
    width: captureWidth,
    height: captureHeight,
    windowWidth: captureWidth,
    windowHeight: captureHeight,
    foreignObjectRendering: false,
    imageTimeout: 15000,
    onclone: (doc: Document) => {
      sanitizeCloneForHtml2Canvas(doc);
    },
  };

  try {
    return await html2canvas(root, { ...common, scale: 1.25 });
  } catch (err) {
    console.warn("[PDF] html2canvas scale 1.25 failed, retrying at 1:", err);
    return await html2canvas(root, { ...common, scale: 1 });
  }
}

function canvasToPdf(canvas: HTMLCanvasElement, fileName: string) {
  let imgData: string;
  let format: "JPEG" | "PNG";
  try {
    imgData = canvas.toDataURL("image/jpeg", 0.92);
    format = "JPEG";
  } catch {
    imgData = canvas.toDataURL("image/png");
    format = "PNG";
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 0.5) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  const safeName = fileName.toLowerCase().endsWith(".pdf")
    ? fileName
    : `${fileName}.pdf`;
  pdf.save(safeName);
}

/**
 * Rasterize a DOM element to a multi-page A4 PDF and trigger download.
 * Clones off-screen to avoid Dialog transform / Tailwind oklch capture failures.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  fileName: string,
): Promise<void> {
  if (!element || typeof window === "undefined") {
    throw new Error("PDF capture element is missing");
  }

  const { root, cleanup } = await buildOffscreenCaptureRoot(element);
  try {
    let canvas = await rasterizeElement(root);
    canvas = scaleCanvasIfNeeded(canvas);
    if (!canvas.width || !canvas.height) {
      throw new Error("PDF capture produced an empty canvas");
    }
    canvasToPdf(canvas, fileName);
  } finally {
    cleanup();
  }
}

const CAPTURE_STYLE_PROPS = [
  "color",
  "background-color",
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
  "border-style",
  "border-collapse",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-bottom",
  "vertical-align",
  "background",
  "white-space",
] as const;

function applyComputedStylesForCapture(original: Node, cloned: Node) {
  if (
    original.nodeType !== Node.ELEMENT_NODE ||
    cloned.nodeType !== Node.ELEMENT_NODE
  ) {
    return;
  }
  const oEl = original as HTMLElement;
  const cEl = cloned as HTMLElement;
  const computed = window.getComputedStyle(oEl);
  let style = cEl.getAttribute("style") || "";
  for (const prop of CAPTURE_STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (
      value &&
      value !== "none" &&
      value !== "normal" &&
      value !== "0px none rgb(0, 0, 0)" &&
      !/oklch|oklab|lab\(|lch\(|color-mix/i.test(value)
    ) {
      style += `${prop}: ${value}; `;
    }
  }
  if (style) cEl.setAttribute("style", style);

  const oChildren = original.childNodes;
  const cChildren = cloned.childNodes;
  for (let i = 0; i < oChildren.length; i++) {
    if (
      oChildren[i].nodeType === Node.ELEMENT_NODE &&
      cChildren[i]?.nodeType === Node.ELEMENT_NODE
    ) {
      applyComputedStylesForCapture(oChildren[i], cChildren[i]);
    }
  }
}

const STYLE_PROPS = [
  "color",
  "background-color",
  "font-size",
  "font-weight",
  "font-family",
  "text-align",
  "line-height",
  "vertical-align",
  "white-space",
  "background",
] as const;

function applyComputedStyles(original: Node, cloned: Node) {
  if (
    original.nodeType !== Node.ELEMENT_NODE ||
    cloned.nodeType !== Node.ELEMENT_NODE
  ) {
    return;
  }
  const oEl = original as HTMLElement;
  const cEl = cloned as HTMLElement;
  // Skip structural cards — we rebuild those for email.
  if (
    oEl.hasAttribute("data-preview-card") ||
    oEl.hasAttribute("data-preview-card-header")
  ) {
    const oChildren = original.childNodes;
    const cChildren = cloned.childNodes;
    for (let i = 0; i < oChildren.length; i++) {
      if (
        oChildren[i].nodeType === Node.ELEMENT_NODE &&
        cChildren[i]?.nodeType === Node.ELEMENT_NODE
      ) {
        applyComputedStyles(oChildren[i], cChildren[i]);
      }
    }
    return;
  }

  const computed = window.getComputedStyle(oEl);
  let style = cEl.getAttribute("style") || "";
  for (const prop of STYLE_PROPS) {
    const value = computed.getPropertyValue(prop);
    if (
      value &&
      value !== "none" &&
      value !== "normal" &&
      value !== "0px none rgb(0, 0, 0)" &&
      !/oklch|oklab|lab\(|lch\(|color-mix/i.test(value)
    ) {
      style += `${prop}: ${value}; `;
    }
  }
  if (style) cEl.setAttribute("style", style);

  const oChildren = original.childNodes;
  const cChildren = cloned.childNodes;
  for (let i = 0; i < oChildren.length; i++) {
    if (
      oChildren[i].nodeType === Node.ELEMENT_NODE &&
      cChildren[i]?.nodeType === Node.ELEMENT_NODE
    ) {
      applyComputedStyles(oChildren[i], cChildren[i]);
    }
  }
}

function stripBadWidthStyles(style: string): string {
  return style
    .replace(/\b(min-width|max-width|width)\s*:\s*[^;]+;?/gi, "")
    .replace(/\b(display)\s*:\s*flex;?/gi, "")
    .replace(/\b(overflow|overflow-x|overflow-y)\s*:\s*[^;]+;?/gi, "")
    .replace(/\b(transform|box-shadow|filter|backdrop-filter)\s*:\s*[^;]+;?/gi, "")
    .replace(/var\([^)]+\)/gi, "#e2e8f0");
}

function forceEmailSafeTable(table: HTMLTableElement) {
  table.setAttribute("border", "0");
  table.setAttribute("cellpadding", "0");
  table.setAttribute("cellspacing", "0");
  table.setAttribute("width", "100%");
  table.style.cssText = [
    "border-collapse:collapse",
    "border-spacing:0",
    "width:100%",
    "max-width:100%",
    "table-layout:fixed",
    "mso-table-lspace:0pt",
    "mso-table-rspace:0pt",
  ].join(";");

  table.querySelectorAll("td, th").forEach((cell) => {
    const el = cell as HTMLElement;
    const colorMatch = (el.getAttribute("style") || "").match(
      /(?:^|;)\s*color\s*:\s*([^;]+)/i,
    );
    const bgMatch = (el.getAttribute("style") || "").match(
      /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i,
    );
    const fwMatch = (el.getAttribute("style") || "").match(
      /(?:^|;)\s*font-weight\s*:\s*([^;]+)/i,
    );
    const fsMatch = (el.getAttribute("style") || "").match(
      /(?:^|;)\s*font-size\s*:\s*([^;]+)/i,
    );
    const align =
      el.style.textAlign ||
      el.getAttribute("align") ||
      (el.tagName === "TH" ? "left" : "left");

    const parts = [
      "border:1px solid #94a3b8",
      "padding:6px 8px",
      "vertical-align:middle",
      `text-align:${align}`,
      "word-wrap:break-word",
      "overflow-wrap:break-word",
    ];
    if (colorMatch) parts.push(`color:${colorMatch[1].trim()}`);
    if (bgMatch) parts.push(`background-color:${bgMatch[1].trim()}`);
    if (fwMatch) parts.push(`font-weight:${fwMatch[1].trim()}`);
    if (fsMatch) parts.push(`font-size:${fsMatch[1].trim()}`);
    el.setAttribute("style", parts.join(";"));
  });
}

/**
 * Convert header-div + table cards into a single outer table so Gmail/Outlook
 * keep header width equal to body width (fixes overflowing lines on paste).
 */
function normalizePreviewCardsForEmail(root: HTMLElement) {
  // Top header: Client/Date + compact Approved/Declined badge (MCA WD style).
  // Email clients ignore flex, so rebuild as a 2-column table.
  root.querySelectorAll<HTMLElement>("[data-preview-top-header='true']").forEach((header) => {
    const meta = header.querySelector<HTMLElement>("[data-preview-top-meta='true']");
    const badge = header.querySelector<HTMLElement>("[data-preview-status-badge='true']");

    const table = document.createElement("table");
    table.setAttribute("border", "0");
    table.setAttribute("cellpadding", "0");
    table.setAttribute("cellspacing", "0");
    table.setAttribute("width", "100%");
    table.style.cssText =
      "border-collapse:collapse;width:100%;max-width:100%;margin:0 0 12px 0;";

    const tr = document.createElement("tr");

    const left = document.createElement("td");
    left.setAttribute("valign", "middle");
    left.style.cssText =
      "padding:0;border:0;text-align:left;vertical-align:middle;font-size:15px;font-weight:600;color:#0f172a;";
    left.innerHTML = meta?.innerHTML || header.innerHTML;

    // Flatten nested flex markup inside meta for email readability
    left.querySelectorAll("div").forEach((d) => {
      const el = d as HTMLElement;
      el.style.cssText =
        "display:inline-block;margin-right:24px;font-size:15px;font-weight:600;vertical-align:middle;";
    });
    left.querySelectorAll("span").forEach((s) => {
      const el = s as HTMLElement;
      const text = (el.textContent || "").trim().toUpperCase();
      if (text === "CLIENT NAME:" || text === "DATE:") {
        el.style.cssText =
          "color:#64748b;font-size:13px;font-weight:600;text-transform:uppercase;margin-right:4px;";
      } else {
        el.style.cssText = "color:#0f172a;font-size:15px;font-weight:600;";
      }
    });

    tr.appendChild(left);

    if (badge) {
      const right = document.createElement("td");
      right.setAttribute("valign", "middle");
      right.setAttribute("align", "right");
      right.style.cssText =
        "padding:0;border:0;text-align:right;vertical-align:middle;width:1%;white-space:nowrap;";

      const pill = document.createElement("span");
      const isDeclined = /declined/i.test(badge.textContent || "");
      pill.textContent = (badge.textContent || "").trim() || (isDeclined ? "Declined" : "Approved");
      // Exact MCA WD badge look: compact pill, not full-width bar
      pill.style.cssText = [
        "display:inline-block",
        "padding:4px 28px",
        "font-size:14px",
        "font-weight:700",
        "color:#ffffff",
        `background-color:${isDeclined ? "#ef4444" : "#10b981"}`,
        "white-space:nowrap",
        "line-height:1.4",
        "mso-line-height-rule:exactly",
      ].join(";");

      right.appendChild(pill);
      tr.appendChild(right);
    }

    table.appendChild(tr);
    header.replaceWith(table);
  });

  root.querySelectorAll<HTMLElement>("[data-preview-card]").forEach((card) => {
    const header = card.querySelector<HTMLElement>(
      "[data-preview-card-header='true']",
    );
    const innerTable = card.querySelector("table");
    if (!header) return;

    const kind = card.getAttribute("data-preview-card") || "";
    const headerBg =
      kind === "offer"
        ? "#559955"
        : "#aed6ef";
    const headerColor = kind === "offer" ? "#ffffff" : "#334155";

    const wrapper = document.createElement("table");
    wrapper.setAttribute("border", "0");
    wrapper.setAttribute("cellpadding", "0");
    wrapper.setAttribute("cellspacing", "0");
    wrapper.setAttribute("width", "100%");
    wrapper.setAttribute("data-email-card", kind);
    wrapper.style.cssText =
      "border-collapse:collapse;border:1px solid #94a3b8;width:100%;max-width:100%;margin:0 0 16px 0;table-layout:fixed;";

    const headerRow = document.createElement("tr");
    const headerCell = document.createElement("td");
    headerCell.setAttribute("width", "100%");
    headerCell.style.cssText = [
      `background-color:${headerBg}`,
      `color:${headerColor}`,
      "font-weight:700",
      "font-size:14px",
      "text-transform:uppercase",
      "letter-spacing:0.04em",
      "padding:10px 12px",
      "border:0",
    ].join(";");
    headerCell.innerHTML = header.innerHTML;
    headerRow.appendChild(headerCell);
    wrapper.appendChild(headerRow);

    const bodyRow = document.createElement("tr");
    const bodyCell = document.createElement("td");
    bodyCell.setAttribute("width", "100%");
    bodyCell.style.cssText =
      "padding:0;border:0;background-color:#ffffff;vertical-align:top;";

    if (innerTable) {
      const tableClone = innerTable.cloneNode(true) as HTMLTableElement;
      forceEmailSafeTable(tableClone);
      bodyCell.appendChild(tableClone);
    } else {
      const fallback = document.createElement("div");
      fallback.style.cssText = "padding:12px;color:#64748b;font-size:13px;";
      fallback.textContent = card.innerText.replace(header.innerText, "").trim() || "-";
      bodyCell.appendChild(fallback);
    }

    bodyRow.appendChild(bodyCell);
    wrapper.appendChild(bodyRow);
    card.replaceWith(wrapper);
  });

  // Any remaining content tables (skip email chrome tables)
  root.querySelectorAll("table").forEach((tbl) => {
    const el = tbl as HTMLElement;
    if (el.hasAttribute("data-email-card")) return;
    if (el.querySelector("[data-preview-status-badge], span")) {
      // top header table already email-safe
      const firstText = (el.textContent || "").trim();
      if (/Client Name|Approved|Declined/i.test(firstText) && !el.querySelector("th")) {
        return;
      }
    }
    // Only force borders on real data tables
    if (el.querySelector("th") || el.querySelectorAll("td").length > 4) {
      forceEmailSafeTable(el as HTMLTableElement);
    }
  });

  // Strip leftover wrappers — never force 100% width onto status badges
  root.querySelectorAll("div").forEach((div) => {
    const el = div as HTMLElement;
    if (el.getAttribute("data-preview-status-badge") === "true") {
      el.style.cssText = [
        "display:inline-block",
        "padding:4px 28px",
        "font-size:14px",
        "font-weight:700",
        "color:#ffffff",
        "background-color:#10b981",
        "white-space:nowrap",
        "width:auto",
        "max-width:none",
      ].join(";");
      return;
    }
    const style = el.getAttribute("style") || "";
    el.setAttribute(
      "style",
      stripBadWidthStyles(style) + ";display:block;width:100%;max-width:100%;",
    );
  });

  root.querySelectorAll("img").forEach((img) => {
    const el = img as HTMLImageElement;
    el.style.cssText =
      "display:block;width:100%;max-width:100%;height:auto;border:0;outline:none;";
    el.setAttribute("width", "100%");
  });
}

function wrapCopiedHtml(inner: string): string {
  return `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;width:100%;max-width:1000px;font-family:Calibri,Arial,sans-serif;color:#0f172a;background:#ffffff;"><tr><td style="padding:8px;background:#ffffff;">${inner}</td></tr></table>`;
}

/**
 * Copy preview HTML for email paste.
 * Rebuilds Offer/Leverage/Bank/Positions as nested tables so headers don't
 * overflow past table borders in Gmail/Outlook.
 */
export async function copyElementHtmlToClipboard(
  element: HTMLElement,
): Promise<boolean> {
  const chartPng = await captureChartPng(element);
  const clone = element.cloneNode(true) as HTMLElement;

  // Light color inlining only (no widths) while trees match.
  applyComputedStyles(element, clone);
  replaceChartWithPng(clone, chartPng);
  normalizePreviewCardsForEmail(clone);

  clone.style.cssText =
    "display:block;width:100%;max-width:1000px;background:#ffffff;color:#0f172a;font-family:Calibri,Arial,sans-serif;";

  const html = wrapCopiedHtml(clone.innerHTML);
  const text = clone.innerText || clone.textContent || "";

  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      const item = new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([text], { type: "text/plain" }),
      });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const listener = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/html", html);
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
    };
    document.addEventListener("copy", listener);
    const ok = document.execCommand("copy");
    document.removeEventListener("copy", listener);
    if (ok) return true;
  } catch {
    // fall through
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
