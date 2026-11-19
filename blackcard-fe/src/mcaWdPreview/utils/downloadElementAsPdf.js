"use client";

import html2canvas from "html2canvas";
import { toCanvas } from "html-to-image";
import jsPDF from "jspdf";
import { buildPreparedCaptureRoot, waitForLayout } from "./preparePreviewForCapture";

const MAX_CANVAS_DIMENSION = 14000;
const A4_HEIGHT_OVER_WIDTH = 297 / 210;
/** Keeps a card clear of the page edge once it has been pushed to a new page. */
const PAGE_BREAK_EDGE_PADDING_PX = 12;

/**
 * Rasterized PDFs are one tall image sliced at fixed page heights, so CSS
 * page-break rules do nothing. Callers that opt in mark elements with
 * `data-pdf-avoid-break`; anything that would straddle a page boundary and
 * could fit on the next one gets pushed down. Rects are read fresh each pass
 * because pushing one element shifts everything after it.
 */
function applyPdfPageBreakAvoidance(root, captureWidth) {
  const nodes = root?.querySelectorAll?.("[data-pdf-avoid-break]");
  if (!nodes?.length) return;

  const pageHeightPx = captureWidth * A4_HEIGHT_OVER_WIDTH;
  if (!Number.isFinite(pageHeightPx) || pageHeightPx <= 0) return;

  // The capture clone has every computed height inlined as `!important`, so
  // each ancestor would keep its pre-push height and clip whatever these
  // margins move down. Release the chain first so containers grow instead.
  const releaseHeight = (el) => {
    el.style.setProperty("height", "auto", "important");
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("max-height", "none", "important");
  };
  releaseHeight(root);
  for (const node of nodes) {
    let ancestor = node.parentElement;
    while (ancestor && ancestor !== root) {
      releaseHeight(ancestor);
      ancestor = ancestor.parentElement;
    }
  }

  for (const node of nodes) {
    const rootTop = root.getBoundingClientRect().top;
    const rect = node.getBoundingClientRect();
    const top = rect.top - rootTop;
    const height = rect.height;
    if (height <= 0 || height >= pageHeightPx - PAGE_BREAK_EDGE_PADDING_PX) continue;

    const pageEnd = (Math.floor(top / pageHeightPx) + 1) * pageHeightPx;
    if (top + height + PAGE_BREAK_EDGE_PADDING_PX <= pageEnd) continue;

    const push = pageEnd - top;
    if (push <= 0) continue;
    const currentMargin = parseFloat(window.getComputedStyle(node).marginTop) || 0;
    node.style.setProperty("margin-top", `${currentMargin + push}px`, "important");
  }
}

function scaleCanvasIfNeeded(canvas) {
  const maxDim = Math.max(canvas.width, canvas.height);
  if (maxDim <= MAX_CANVAS_DIMENSION) return canvas;

  const scale = MAX_CANVAS_DIMENSION / maxDim;
  const scaled = document.createElement("canvas");
  scaled.width = Math.floor(canvas.width * scale);
  scaled.height = Math.floor(canvas.height * scale);
  const ctx = scaled.getContext("2d");
  ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
  return scaled;
}

/** MCA-identical PDF build, without favicon watermark stamping. */
function buildPdfFromCanvas(canvas) {
  let imgData;
  try {
    imgData = canvas.toDataURL("image/jpeg", 0.92);
  } catch {
    imgData = canvas.toDataURL("image/png");
  }

  const pdf = new jsPDF("p", "mm", "a4");
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pdf.internal.pageSize.getWidth();
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  const format = imgData.startsWith("data:image/png") ? "PNG" : "JPEG";

  pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight, undefined, "FAST");
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, format, 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
  }

  return pdf;
}

function canvasToPdf(canvas, fileName) {
  buildPdfFromCanvas(canvas).save(fileName);
}

async function rasterizeCaptureRoot(root, captureWidth) {
  const captureHeight = Math.max(
    root.scrollHeight || 0,
    root.offsetHeight || 0,
    Math.ceil(root.getBoundingClientRect?.().height || 0),
    1
  );

  // Same as MCA-tool: prefer html-to-image (font/layout fidelity), fall back to html2canvas.
  const htmlToImageCapture = () =>
    toCanvas(root, {
      pixelRatio: 1.5,
      backgroundColor: "#ffffff",
      cacheBust: true,
      skipFonts: true,
      width: captureWidth,
      height: captureHeight,
      canvasWidth: captureWidth,
      canvasHeight: captureHeight,
    });

  const html2canvasCapture = (scale) =>
    html2canvas(root, {
      scale,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      width: captureWidth,
      height: captureHeight,
      windowWidth: captureWidth,
      windowHeight: captureHeight,
      onclone: (doc) => {
        doc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => node.remove());
      },
    });

  try {
    return await htmlToImageCapture();
  } catch (htmlToImageErr) {
    console.warn("[PDF] html-to-image failed, trying html2canvas:", htmlToImageErr);
    try {
      return await html2canvasCapture(1.5);
    } catch {
      return html2canvasCapture(1);
    }
  }
}

/**
 * MCA-tool PDF pipeline (prepared DOM capture + html-to-image), without watermark.
 */
export async function downloadElementAsPdf(element, fileName = "preview.pdf", options = {}) {
  if (!element || typeof window === "undefined") return;

  const { avoidPageBreaks = true } = options;
  const { root, captureWidth, cleanup } = await buildPreparedCaptureRoot(element);

  try {
    root
      .querySelectorAll("[data-preview-favicon-watermark='true']")
      .forEach((el) => el.remove());

    await waitForLayout();
    if (avoidPageBreaks) {
      applyPdfPageBreakAvoidance(root, captureWidth);
      await waitForLayout();
    }
    let canvas = await rasterizeCaptureRoot(root, captureWidth);
    canvas = scaleCanvasIfNeeded(canvas);
    canvasToPdf(canvas, fileName);
  } catch (err) {
    console.error("[PDF] download failed:", err);
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Same rendering pipeline as downloadElementAsPdf, but returns a blob URL.
 */
export async function elementToPdfBlobUrl(element, options = {}) {
  if (!element || typeof window === "undefined") return null;

  const { avoidPageBreaks = true } = options;
  const { root, captureWidth, cleanup } = await buildPreparedCaptureRoot(element);

  try {
    root
      .querySelectorAll("[data-preview-favicon-watermark='true']")
      .forEach((el) => el.remove());

    await waitForLayout();
    if (avoidPageBreaks) {
      applyPdfPageBreakAvoidance(root, captureWidth);
      await waitForLayout();
    }
    let canvas = await rasterizeCaptureRoot(root, captureWidth);
    canvas = scaleCanvasIfNeeded(canvas);
    const pdf = buildPdfFromCanvas(canvas);
    return URL.createObjectURL(pdf.output("blob"));
  } catch (err) {
    console.error("[PDF] preview render failed:", err);
    throw err;
  } finally {
    cleanup();
  }
}
