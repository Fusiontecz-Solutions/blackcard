import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type LetterHtmlPreviewFrameProps = {
  html: string;
  className?: string;
  title?: string;
};

/**
 * In-place iframe preview — updates via `document.write` instead of changing
 * `srcDoc` so React does not reload the frame on every parent re-render.
 */
export function LetterHtmlPreviewFrame({
  html,
  className,
  title = "Letter preview",
}: LetterHtmlPreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastWrittenRef = useRef("");

  useEffect(() => {
    if (!html || html === lastWrittenRef.current) return;

    const frame = iframeRef.current;
    if (!frame) return;

    const doc = frame.contentDocument ?? frame.contentWindow?.document;
    if (!doc) return;

    lastWrittenRef.current = html;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className={cn("w-full border-0 bg-white", className)}
      sandbox="allow-same-origin"
    />
  );
}
