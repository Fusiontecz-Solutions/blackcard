import { useEffect, useRef, useState } from "react";

/** A4 at 96 dpi — the size the letter PDFs are rendered at. */
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;

type LetterA4PreviewProps = {
  html: string;
  title?: string;
};

/**
 * Letter preview shown as one A4 sheet, scaled down to fit the available width,
 * so the whole page is visible without any scrollbars (inner or outer).
 */
export function LetterA4Preview({ html, title = "Letter preview" }: LetterA4PreviewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = () => setScale(Math.min(1, wrap.clientWidth / A4_WIDTH_PX));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div ref={wrapRef} className="w-full">
      <div
        style={{
          width: A4_WIDTH_PX * scale,
          height: A4_HEIGHT_PX * scale,
          margin: "0 auto",
          overflow: "hidden",
          background: "#ffffff",
          boxShadow: "0 1px 4px rgba(15, 23, 42, 0.15)",
        }}
      >
        <iframe
          ref={frameRef}
          title={title}
          sandbox="allow-same-origin"
          scrolling="no"
          style={{
            width: A4_WIDTH_PX,
            height: A4_HEIGHT_PX,
            border: 0,
            background: "#ffffff",
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        />
      </div>
    </div>
  );
}

export default LetterA4Preview;
