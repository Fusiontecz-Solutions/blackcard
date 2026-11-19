import { useEffect, useState } from "react";

/**
 * Complete Fusiontecz wordmark (icon + "fusiontecz" + tagline).
 * Intrinsic size: 162 × 40 — do not substitute icon-only assets
 * (e.g. /assets/fusiontecz.svg) or square-cropped containers.
 */
export const FUSIONTECZ_LOGO_SRC = "/assets/logo.svg";

export const FUSIONTECZ_LOGO_DISPLAY_WIDTH = 162;
export const FUSIONTECZ_LOGO_DISPLAY_HEIGHT = 40;

let cachedLogoDataUrl = null;
let logoResolvePromise = null;

/**
 * Resolve an email/PDF-safe PNG data URL from logo.svg
 * (extracts the embedded full-logo PNG; falls back to canvas rasterization).
 */
export async function resolveFusionteczLogoDataUrl() {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  if (typeof window === "undefined") return FUSIONTECZ_LOGO_SRC;

  if (!logoResolvePromise) {
    logoResolvePromise = (async () => {
      try {
        const res = await fetch(FUSIONTECZ_LOGO_SRC);
        const text = await res.text();
        const match =
          text.match(/xlink:href="(data:image\/png;base64,[^"]+)"/i) ||
          text.match(/href="(data:image\/png;base64,[^"]+)"/i);
        if (match?.[1]) {
          cachedLogoDataUrl = match[1];
          return cachedLogoDataUrl;
        }
      } catch (e) {
        console.warn("[PreviewBrandLogo] Failed to extract embedded PNG:", e);
      }

      try {
        cachedLogoDataUrl = await new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement("canvas");
              // Prefer intrinsic SVG size so we never rasterize as a square crop.
              canvas.width =
                img.naturalWidth || FUSIONTECZ_LOGO_DISPLAY_WIDTH;
              canvas.height =
                img.naturalHeight || FUSIONTECZ_LOGO_DISPLAY_HEIGHT;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              resolve(canvas.toDataURL("image/png"));
            } catch (err) {
              reject(err);
            }
          };
          img.onerror = reject;
          img.src = FUSIONTECZ_LOGO_SRC;
        });
        return cachedLogoDataUrl;
      } catch (e) {
        console.warn("[PreviewBrandLogo] Failed to rasterize logo:", e);
        return FUSIONTECZ_LOGO_SRC;
      }
    })();
  }

  return logoResolvePromise;
}

// Warm the PNG cache on the client so Copy/PDF are email-safe quickly.
if (typeof window !== "undefined") {
  resolveFusionteczLogoDataUrl();
}

/**
 * Fusiontecz logo for bank-analysis preview documents.
 * Renders inside the preview content so Copy / PDF capture include it.
 */
export default function PreviewBrandLogo({ className = "" }) {
  const [src, setSrc] = useState(FUSIONTECZ_LOGO_SRC);

  useEffect(() => {
    let cancelled = false;
    resolveFusionteczLogoDataUrl().then((url) => {
      if (!cancelled && url) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={className}
      data-preview-brand-logo="true"
      style={{
        textAlign: "left",
        margin: "0 0 24px 0",
        padding: 0,
        width: `${FUSIONTECZ_LOGO_DISPLAY_WIDTH}px`,
        maxWidth: `${FUSIONTECZ_LOGO_DISPLAY_WIDTH}px`,
        height: `${FUSIONTECZ_LOGO_DISPLAY_HEIGHT}px`,
        overflow: "visible",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Fusiontecz"
        width={FUSIONTECZ_LOGO_DISPLAY_WIDTH}
        height={FUSIONTECZ_LOGO_DISPLAY_HEIGHT}
        style={{
          width: `${FUSIONTECZ_LOGO_DISPLAY_WIDTH}px`,
          height: `${FUSIONTECZ_LOGO_DISPLAY_HEIGHT}px`,
          maxWidth: `${FUSIONTECZ_LOGO_DISPLAY_WIDTH}px`,
          maxHeight: `${FUSIONTECZ_LOGO_DISPLAY_HEIGHT}px`,
          display: "block",
          objectFit: "contain",
          objectPosition: "left center",
          border: 0,
          outline: "none",
        }}
      />
    </div>
  );
}
