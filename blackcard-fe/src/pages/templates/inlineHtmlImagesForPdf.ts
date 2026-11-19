/**
 * Puppeteer cannot load Vite-relative logo/watermark URLs (`/assets/black_logo-….svg`).
 * Those work in the in-app preview (same origin) but show as a broken image in the PDF.
 * Convert `<img src>` to data URIs (rasterizing SVG to PNG) before sending HTML to the renderer.
 */

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image"));
    reader.readAsDataURL(blob);
  });
}

function looksLikeSvg(src: string, blob: Blob): boolean {
  const type = (blob.type || "").toLowerCase();
  if (type.includes("svg")) return true;
  return /\.svg(\?|#|$)/i.test(src);
}

async function rasterizeSvgDataUrl(dataUrl: string): Promise<string> {
  const image = new Image();
  image.decoding = "async";
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("SVG decode failed"));
  });
  image.src = dataUrl;
  await loaded;
  const width = image.naturalWidth || 570;
  const height = image.naturalHeight || 536;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0);
  return canvas.toDataURL("image/png");
}

async function srcToDataUrl(src: string): Promise<string | null> {
  const absolute = new URL(src, window.location.origin).href;
  const response = await fetch(absolute, { mode: "cors" });
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.size) return null;
  let dataUrl = await blobToDataUrl(blob);
  if (looksLikeSvg(src, blob)) {
    dataUrl = await rasterizeSvgDataUrl(dataUrl);
  }
  return dataUrl || null;
}

/** Rewrite letter HTML `<img>` tags so the PDF renderer does not need network access. */
export async function inlineHtmlImagesForPdf(html: string): Promise<string> {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") {
    return html;
  }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img[src]"));
  await Promise.all(
    images.map(async (img) => {
      const src = img.getAttribute("src")?.trim();
      if (!src || src.startsWith("data:")) return;
      try {
        const dataUrl = await srcToDataUrl(src);
        if (dataUrl) img.setAttribute("src", dataUrl);
      } catch {
        // Leave the original src; Puppeteer can still fetch absolute https images.
      }
    }),
  );
  const serialized = doc.documentElement?.outerHTML;
  if (!serialized) return html;
  return `<!DOCTYPE html>${serialized}`;
}
