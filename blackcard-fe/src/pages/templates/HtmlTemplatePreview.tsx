import type { ComponentType } from "react";
import type { TemplateComponentProps, TemplateValues } from "./types";

/**
 * Wraps an HTML-string renderer in a React component so it can be used as a
 * `TemplateDefinition.Component`. The rendered email markup is shown inside an
 * isolated `<iframe>` so its global styles never leak into the host app.
 */
export function createHtmlTemplatePreview(
  renderHtml: (values: TemplateValues) => string,
  title: string,
): ComponentType<TemplateComponentProps> {
  function HtmlTemplatePreview({ values }: TemplateComponentProps) {
    return (
      <iframe
        title={title}
        srcDoc={renderHtml(values)}
        style={{
          width: "100%",
          minHeight: "100%",
          border: "none",
          background: "#ffffff",
        }}
      />
    );
  }

  HtmlTemplatePreview.displayName = `HtmlTemplatePreview(${title})`;
  return HtmlTemplatePreview;
}
