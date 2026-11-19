const DOCUSIGN_LOADING_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Opening DocuSign</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      font-family: system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    .card { text-align: center; max-width: 22rem; padding: 2rem 1.5rem; }
    .spinner {
      width: 3rem; height: 3rem; margin: 0 auto 1.25rem;
      border: 3px solid #A962CD33; border-top-color: #A962CD;
      border-radius: 50%; animation: spin 0.85s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.125rem; font-weight: 600; margin: 0 0 0.5rem; }
    p { margin: 0; font-size: 0.875rem; line-height: 1.5; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" aria-hidden="true"></div>
    <h1>Opening DocuSign</h1>
    <p>Preparing your form for review. This tab will load DocuSign in a moment.</p>
  </div>
</body>
</html>`;

export const DOCUSIGN_SENDER_VIEW_RETRY_DELAYS_MS = {
    existing: [0, 800, 1600, 2600],
    justCreated: [0, 800, 1600, 2600],
} as const;

export function openDocuSignLoadingTab(): Window | null {
    if (typeof window === "undefined") return null;
    const tab = window.open("about:blank", "_blank");
    if (!tab) return null;
    try {
        tab.opener = null;
    } catch {
        /* ignore */
    }
    try {
        tab.document.open();
        tab.document.write(DOCUSIGN_LOADING_PAGE_HTML);
        tab.document.close();
    } catch {
        try {
            tab.location.href = `data:text/html;charset=utf-8,${encodeURIComponent(DOCUSIGN_LOADING_PAGE_HTML)}`;
        } catch {
            /* ignore */
        }
    }
    return tab;
}

function escapeHtmlForDocuSignTab(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function showDocuSignTabMessage(tab: Window | null, title: string, message: string): void {
    if (!tab || tab.closed) return;
    const safeTitle = escapeHtmlForDocuSignTab(title);
    const safeMessage = escapeHtmlForDocuSignTab(message);
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${safeTitle}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;padding:1.5rem;}
  .card{max-width:24rem;text-align:center;}
  h1{font-size:1.125rem;margin:0 0 .75rem;}
  p{margin:0;font-size:.875rem;line-height:1.5;color:#475569;}
</style></head><body><div class="card"><h1>${safeTitle}</h1><p>${safeMessage}</p></div></body></html>`;
    try {
        tab.location.href = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    } catch {
        try {
            tab.close();
        } catch {
            /* ignore */
        }
    }
}

export function navigateDocuSignTab(tab: Window | null, senderUrl: string): boolean {
    if (tab && !tab.closed) {
        try {
            tab.location.href = senderUrl;
            return true;
        } catch {
            /* fall through */
        }
    }
    const opened = window.open(senderUrl, "_blank");
    if (!opened) return false;
    try {
        opened.opener = null;
    } catch {
        /* ignore */
    }
    return true;
}
