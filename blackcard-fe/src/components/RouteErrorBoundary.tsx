import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router";
import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary. React Router renders this (via `errorElement`)
 * whenever a route throws during render/commit instead of showing its raw
 * default developer screen. It gives users a recoverable path (reload / go back)
 * for transient DOM crashes such as the "Failed to execute 'removeChild'" error
 * that can come from browser auto-translation or third-party widgets.
 */
export default function RouteErrorBoundary() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = "Something went wrong";
  let detail = "An unexpected error occurred while rendering this page.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    detail = typeof error.data === "string" ? error.data : detail;
  } else if (error instanceof Error) {
    detail = error.message || detail;
  }

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="max-w-md space-y-2">
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        <p className="break-words text-sm text-muted-foreground">{detail}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    </div>
  );
}
