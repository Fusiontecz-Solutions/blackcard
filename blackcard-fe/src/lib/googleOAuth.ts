/**
 * Google OAuth is completed on the API (`GET /google/connect` → Google → API callback).
 * The API must finish with `res.redirect(<this URL>)` so the browser returns to the SPA.
 *
 * We use a static file under `public/` so a 302 to `/google-oauth-return.html` works even
 * when the API does not serve the React app.
 *
 * Backend (Nest/Express): read `returnUrl` or `redirect` from the initial connect query,
 * store it (session or OAuth `state`), then after tokens are saved:
 *   res.redirect(storedReturnUrl);
 */
export function getAppPublicOrigin(): string {
  const fromEnv = (
    import.meta.env.VITE_PUBLIC_APP_URL as string | undefined
  )?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

/** Where the API should redirect after a successful Google connection. */
export function getGoogleOAuthReturnPageUrl(): string {
  const origin = getAppPublicOrigin();
  if (!origin) return "";
  return `${origin}/google-oauth-return.html`;
}

/**
 * Full href to start Google connect. Sends several query keys so different backends can pick one up.
 */
export function buildGoogleOAuthConnectUrl(apiBaseRaw: string): string {
  const apiBase = apiBaseRaw.replace(/\/$/, "");
  const returnPage = getGoogleOAuthReturnPageUrl();
  if (!returnPage) {
    return `${apiBase}/google/connect`;
  }
  const params = new URLSearchParams();
  params.set("returnUrl", returnPage);
  params.set("redirect", returnPage);
  params.set("callbackUrl", returnPage);
  return `${apiBase}/google/connect?${params.toString()}`;
}
