/**
 * Stamp a funder's logo onto a PDF page (top branding for Case Takeover addendum).
 * Coordinates use DocuSign / pdf-lib top-left origin for y input; converted to pdf-lib bottom-left.
 */

export type FunderLogoStampBox = {
  pageNumber?: string | number;
  x: string | number;
  y: string | number;
  width: string | number;
  height: string | number;
};

function num(value: string | number | undefined, fallback = 0): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

/** Force a PNG delivery for Cloudinary assets (SVG/WebP → PNG). */
export function toCloudinaryPngUrl(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/res\.cloudinary\.com\//i.test(trimmed)) return trimmed;
  if (/\/image\/upload\/[^/]*f_png/i.test(trimmed)) return trimmed;
  return trimmed.replace(/\/image\/upload\//i, '/image/upload/f_png/');
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  const trimmed = String(url || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;
  try {
    const res = await fetch(trimmed);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function sniffImageKind(bytes: Uint8Array): 'png' | 'jpg' | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpg';
  }
  return null;
}

async function loadStampableLogoBytes(
  logoUrl: string,
): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' } | null> {
  const candidates = [toCloudinaryPngUrl(logoUrl), logoUrl].filter(
    (u, i, arr) => u && arr.indexOf(u) === i,
  );
  for (const candidate of candidates) {
    const bytes = await fetchImageBytes(candidate);
    if (!bytes?.length) continue;
    const kind = sniffImageKind(bytes);
    if (kind) return { bytes, kind };
  }
  return null;
}

/**
 * Returns a new PDF base64 with the logo drawn into the branding box.
 * On any failure, returns the original documentBase64 unchanged.
 */
export async function stampFunderLogoOnPdfBase64(
  documentBase64: string,
  logoUrl: string | null | undefined,
  box: FunderLogoStampBox | null | undefined,
): Promise<string> {
  const base = String(documentBase64 || '').trim();
  const url = String(logoUrl || '').trim();
  if (!base || !url || !box) return base;

  const loaded = await loadStampableLogoBytes(url);
  if (!loaded) {
    console.warn(
      '[stamp-funder-logo] Could not load a PNG/JPG logo (SVG/WebP need Cloudinary f_png). Skipping stamp.',
      url.slice(0, 120),
    );
    return base;
  }

  try {
    const { PDFDocument } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(Buffer.from(base, 'base64'));
    const pageIndex = Math.max(0, parseInt(String(box.pageNumber || '1'), 10) - 1);
    const page = pdfDoc.getPages()[pageIndex];
    if (!page) return base;

    const image =
      loaded.kind === 'png'
        ? await pdfDoc.embedPng(loaded.bytes)
        : await pdfDoc.embedJpg(loaded.bytes);
    const boxW = Math.max(1, num(box.width, 178));
    const boxH = Math.max(1, num(box.height, 100));
    const boxX = num(box.x, 217);
    const yTop = num(box.y, 8);
    const { height: pageHeight } = page.getSize();

    const imgW = image.width || 1;
    const imgH = image.height || 1;
    const scale = Math.min(boxW / imgW, boxH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    const drawX = boxX + (boxW - drawW) / 2;
    const drawY = pageHeight - yTop - boxH + (boxH - drawH) / 2;

    page.drawImage(image, {
      x: drawX,
      y: Math.max(0, drawY),
      width: drawW,
      height: drawH,
    });

    return Buffer.from(
      await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false }),
    ).toString('base64');
  } catch (err) {
    console.warn(
      '[stamp-funder-logo] Failed to stamp logo:',
      err instanceof Error ? err.message : err,
    );
    return base;
  }
}

export type FunderNameStampBox = {
  pageNumber?: string | number;
  x: string | number;
  y: string | number;
  width?: string | number;
  height?: string | number;
  fontSize?: string | number;
};

/**
 * Cover baked-in funder names (e.g. Alliance / Woodmere) and draw the selected
 * funder name into each box. Coordinates use DocuSign top-left y.
 */
export async function stampFunderNameOnPdfBase64(
  documentBase64: string,
  funderName: string | null | undefined,
  boxes: FunderNameStampBox[] | null | undefined,
): Promise<string> {
  const base = String(documentBase64 || '').trim();
  const name = String(funderName || '').trim();
  if (!base || !name || !boxes?.length) return base;

  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
    const pdfDoc = await PDFDocument.load(Buffer.from(base, 'base64'));
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    for (const box of boxes) {
      const pageIndex = Math.max(0, parseInt(String(box.pageNumber || '1'), 10) - 1);
      const page = pages[pageIndex];
      if (!page) continue;

      const boxW = Math.max(20, num(box.width, 147));
      const boxH = Math.max(12, num(box.height, 16));
      const boxX = num(box.x, 0);
      const yTop = num(box.y, 0);
      const { height: pageHeight } = page.getSize();
      const drawY = pageHeight - yTop - boxH;

      // Erase any prior printed funder name in this slot.
      page.drawRectangle({
        x: boxX - 1,
        y: Math.max(0, drawY - 1),
        width: boxW + 2,
        height: boxH + 2,
        color: rgb(1, 1, 1),
        borderWidth: 0,
      });

      const explicitSize = num(box.fontSize, 0);
      let fontSize =
        explicitSize > 0 ? explicitSize : Math.min(11, Math.max(8, Math.round(boxH * 0.7)));
      let textWidth = font.widthOfTextAtSize(name, fontSize);
      while (textWidth > boxW && fontSize > 7) {
        fontSize -= 0.5;
        textWidth = font.widthOfTextAtSize(name, fontSize);
      }

      page.drawText(name, {
        x: boxX,
        y: Math.max(2, drawY + Math.max(1, (boxH - fontSize) / 2)),
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
        maxWidth: boxW,
      });
    }

    return Buffer.from(
      await pdfDoc.save({ useObjectStreams: false, updateFieldAppearances: false }),
    ).toString('base64');
  } catch (err) {
    console.warn(
      '[stamp-funder-logo] Failed to stamp funder name:',
      err instanceof Error ? err.message : err,
    );
    return base;
  }
}
