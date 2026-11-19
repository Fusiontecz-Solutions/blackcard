import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useDispatch, useSelector } from "react-redux";
import { axiosGet, axiosPost } from "@/redux/axios";
import CommentSection from "@/components/application/CommentSection";
import ApplicationBasicDetails from "@/components/application/ApplicationBasicDetails";
import { getApplicationById } from "@/redux/actions/applicationActions";
import type { AppDispatch, RootState } from "@/redux/store";
import { routeParamMatchesApplication } from "@/lib/applicationRouteMatch";
import { formatDate, formatDateTimeUS } from "@/lib/utils";

type PortalApplication = {
  id: string;
  applicationId?: number;
  currentQueue?: string | null;
  currentState?: string | null;
  type?: string | null;
  loanAmount?: number | null;
  updatedAt?: string;
  createdAt?: string;
  client?: {
    businessName?: string | null;
    ownerFirstName?: string | null;
    ownerLastName?: string | null;
  } | null;
};

type PortalStatusResponse = {
  success: boolean;
  data?: {
    application: PortalApplication;
    expiresAt: string | Date | null;
  };
  code?: string;
  message?: string;
};

function formatLabel(raw: string | null | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  return String(raw)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PublicApplicationStatusPage = () => {
  const { token } = useParams<{ token: string }>();
  const dispatch = useDispatch<AppDispatch>();

  const {
    loading: detailLoading,
    data: applicationData,
    error: applicationDetailError,
  } = useSelector((state: RootState) => state.applicationDetail);

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | Date | null>(null);
  const [application, setApplication] = useState<PortalApplication | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (!token) {
        if (isMounted) {
          setLoading(false);
          setErrorCode("TOKEN_MISSING");
        }
        return;
      }

      try {
        const res = await axiosGet(`/public/application/${token}/portal-status`);
        const body = res.data as PortalStatusResponse;

        if (!isMounted) return;

        if (!body?.success || !body?.data?.application) {
          setErrorCode(body?.code === "TOKEN_EXPIRED" ? "TOKEN_EXPIRED" : "INVALID_TOKEN");
          if (body?.code === "TOKEN_EXPIRED" && body.data && "expiresAt" in body) {
            setExpiresAt((body as { data?: { expiresAt?: string | null } }).data?.expiresAt ?? null);
          }
          setLoading(false);
          return;
        }

        setApplication(body.data.application);
        setExpiresAt(body.data.expiresAt ?? null);

        try {
          const sessionRes = await axiosPost(`/public/application/${token}/approval-session`, {});

          const sessionBody = sessionRes.data as {
            success: boolean;
            token?: string;
            user?: any;
            applicationId?: string;
            message?: string;
          };

          if (!sessionBody?.success || !sessionBody?.token || !sessionBody?.user) {
            throw new Error(sessionBody?.message || "Failed to create public session");
          }

          localStorage.setItem("token", sessionBody.token);
          localStorage.setItem("role", sessionBody.user.role);
          localStorage.setItem("user", JSON.stringify(sessionBody.user));

          const appIdForRedux =
            sessionBody.applicationId ?? body.data.application?.id;
          if (appIdForRedux) {
            void dispatch(getApplicationById(appIdForRedux)).unwrap().catch(() => {});
          }

          if (!isMounted) return;
          setSessionError(null);
          setLoading(false);
        } catch (sessErr: unknown) {
          if (!isMounted) return;
          const msg =
            sessErr && typeof sessErr === "object" && "message" in sessErr
              ? String((sessErr as { message?: string }).message)
              : "Could not start a secure session";
          setSessionError(msg);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const status =
          err && typeof err === "object" && "response" in err
            ? (err as { response?: { status?: number } }).response?.status
            : undefined;
        if (status === 410) {
          setErrorCode("TOKEN_EXPIRED");
          const exp =
            err && typeof err === "object" && "response" in err
              ? (err as { response?: { data?: { expiresAt?: string } } }).response?.data?.expiresAt
              : undefined;
          setExpiresAt(exp ?? null);
        } else if (status === 404) {
          setErrorCode("INVALID_TOKEN");
        } else {
          setErrorCode("INVALID_TOKEN");
        }
        setLoading(false);
      }
    };

    void run();
    return () => {
      isMounted = false;
    };
  }, [token, dispatch]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="text-sm text-[#687182]">Loading…</div>
        </div>
      </div>
    );
  }

  if (errorCode) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mt-6 rounded-md border border-[#E5E7EB] bg-white p-4 text-sm text-[#687182]">
            <div className="font-semibold text-[var(--brand)]">
              {errorCode === "TOKEN_EXPIRED" ? "Link expired" : "Link not available"}
            </div>
            {errorCode === "TOKEN_EXPIRED" && expiresAt ? (
              <div className="mt-1">This link expired on {formatDateTimeUS(expiresAt)}</div>
            ) : (
              <div className="mt-1">Please ask your representative for a new secure link.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (sessionError && !application) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="mt-6 rounded-md border border-[#E5E7EB] bg-white p-4 text-sm text-[#687182]">
            <div className="font-semibold text-[var(--brand)]">Session error</div>
            <div className="mt-1">{sessionError}</div>
          </div>
        </div>
      </div>
    );
  }

  const app = application;
  const canUseInteractivePortal = !sessionError && Boolean(app);

  const detailReady =
    Boolean(app) &&
    canUseInteractivePortal &&
    Boolean(applicationData) &&
    routeParamMatchesApplication(app!.id, applicationData);

  const detailFailed =
    Boolean(app) &&
    canUseInteractivePortal &&
    !detailLoading &&
    !detailReady &&
    (Boolean(applicationDetailError) || !applicationData);

  const businessName = app?.client?.businessName?.trim() || "—";
  const ownerName = [app?.client?.ownerFirstName, app?.client?.ownerLastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto max-w-7xl">
        {expiresAt ? (
          <p className="mb-4 text-right text-xs text-[#9CA3AF]">
            Secure link expires {formatDate(expiresAt)}.
          </p>
        ) : null}

        {sessionError && app ? (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="font-semibold">Limited view</div>
            <p className="mt-1 text-amber-900/90">
              Full profile and comments need a short setup on our side. If this persists, contact your
              representative. ({sessionError})
            </p>
          </div>
        ) : null}

        {canUseInteractivePortal && app ? (
          <>
            {detailFailed ? (
              <div className="rounded-lg border border-destructive/30 bg-white p-6 text-sm text-destructive">
                {applicationDetailError || "Could not load application details."} Try refreshing the page.
              </div>
            ) : !detailReady ? (
              <div className="rounded-lg border border-[#E5E7EB] bg-white p-10 text-center text-sm text-[#687182]">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--brand)] border-t-transparent align-[-0.125em]" />
                <span className="ml-2">Loading application details…</span>
              </div>
            ) : (
              <>
                <ApplicationBasicDetails applicationId={app.id} />
                <div className="mt-6">
                  <CommentSection applicationId={app.id} publicMode styles="flex-row" />
                </div>
              </>
            )}
          </>
        ) : null}

        {app && sessionError ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-[#374151]">Summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <dt className="font-medium text-[var(--brand)]">Reference</dt>
                  <dd className="text-[#4B5563]">
                    {app.applicationId != null ? `#${app.applicationId}` : app.id.slice(0, 8) + "…"}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <dt className="font-medium text-[var(--brand)]">Business</dt>
                  <dd className="text-[#4B5563]">{businessName}</dd>
                </div>
                {ownerName ? (
                  <div className="grid grid-cols-2 gap-2">
                    <dt className="font-medium text-[var(--brand)]">Owner</dt>
                    <dd className="text-[#4B5563]">{ownerName}</dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <dt className="font-medium text-[var(--brand)]">Stage</dt>
                  <dd className="text-[#4B5563]">{formatLabel(app.currentQueue)}</dd>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <dt className="font-medium text-[var(--brand)]">Status</dt>
                  <dd className="text-[#4B5563]">{formatLabel(app.currentState)}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default PublicApplicationStatusPage;
