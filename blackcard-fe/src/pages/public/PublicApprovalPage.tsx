import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useDispatch } from "react-redux";
import { axiosGet, axiosPost } from "@/redux/axios";
import type { TermsOffer } from "@/types/termsOfferTypes";
import PublicApprovalCalculator from "@/components/application/PublicApprovalCalculator";
import CommentSection from "@/components/application/CommentSection";
import { getApplicationById } from "@/redux/actions/applicationActions";
import type { AppDispatch } from "@/redux/store";
import { formatDateTimeUS } from "@/lib/utils";
import { useTheme } from "@/context/ThemeContext";
import { resolveAppLogoSrc } from "@/constants/appLogo";

type PublicApprovalResponse = {
  success: boolean;
  data?: {
    application: any;
    termsOffers: TermsOffer[];
    offerDecision?: Record<string, unknown> | null;
    expiresAt: string | Date | null;
  };
  code?: string;
  message?: string;
};

const PublicApprovalPage = () => {
  const { token } = useParams<{ token: string }>();
  // This page is publicly accessible, so we intentionally keep users here.
  // (Redirecting to a protected route would show sidebar/tabs and/or require login.)

  const dispatch = useDispatch<AppDispatch>();
  const { resolvedTheme } = useTheme();
  const brandLogo = (
    <img
      src={resolveAppLogoSrc(resolvedTheme === "dark")}
      alt="Company logo"
      className="mx-auto h-28 w-auto max-w-full object-contain sm:h-32 md:h-40"
    />
  );

  const [loading, setLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | Date | null>(null);
  const [application, setApplication] = useState<any>(null);
  const [termsOffers, setTermsOffers] = useState<TermsOffer[] | null>(null);
  const [offerDecision, setOfferDecision] = useState<Record<string, unknown> | null>(null);
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
        const [res, sessionRes] = await Promise.all([
          axiosGet(`/public/application/${token}`),
          axiosPost(`/public/application/${token}/approval-session`, {}),
        ]);

        const body = res.data as PublicApprovalResponse;

        if (!isMounted) return;

        if (!body?.success || !body?.data) {
          setErrorCode(body?.code || "INVALID_TOKEN");
          setLoading(false);
          return;
        }

        setApplication(body.data.application);
        setTermsOffers(body.data.termsOffers || []);
        setOfferDecision(body.data.offerDecision ?? null);
        setExpiresAt(body.data.expiresAt);

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

        const appIdForRedux = sessionBody.applicationId ?? body.data.application?.id ?? body.data.application?._id;
        if (appIdForRedux) {
          // Kick off the required application fetch in the background.
          // UI can render immediately; upload/comment components will update when redux fills in.
          dispatch(getApplicationById(appIdForRedux)).unwrap().catch(() => {});
        }

        if (!isMounted) return;
        setSessionError(null);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        const status = err?.response?.status;
        if (status === 410) {
          setErrorCode("TOKEN_EXPIRED");
          setExpiresAt(err?.response?.data?.expiresAt ?? null);
        }
        else setErrorCode("TOKEN_INVALID");

        setSessionError(err?.message || null);
        setLoading(false);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="mb-2 text-center">{brandLogo}</div>
          <div className="text-sm text-[#687182]">Loading approval…</div>
        </div>
      </div>
    );
  }

  if (errorCode) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-screen-2xl mx-auto">
          
          <div className="mb-2 text-center">{brandLogo}</div>

          <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-4 text-sm text-[#687182]">
            <div className="font-semibold text-[var(--brand)]">
              {errorCode === "TOKEN_EXPIRED" ? "Link expired" : "Link not available"}
            </div>
            {errorCode === "TOKEN_EXPIRED" && expiresAt ? (
              <div className="mt-1">This link expired on {formatDateTimeUS(expiresAt)}</div>
            ) : (
              <div className="mt-1">Please ask the sender for a new link.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="min-h-screen bg-background p-4 md:p-6">
        <div className="max-w-screen-2xl mx-auto">
          <div className="mb-2 text-center">{brandLogo}</div>
          <div className="mt-4 rounded-md border border-[#E5E7EB] bg-white p-4 text-sm text-[#687182]">
            <div className="font-semibold text-[var(--brand)]">Session error</div>
            <div className="mt-1">{sessionError}</div>
          </div>
        </div>
      </div>
    );
  }

  if (application && termsOffers) {
    return (
      <PublicApprovalCalculator
        applicationData={application}
        termsOffers={termsOffers}
        offerDecision={offerDecision}
        commentsSlot={
          <CommentSection
            styles="flex-row"
            applicationId={application?.id ?? application?._id}
            publicMode
          />
        }
      />
    );
  }

  return (
    <div className="min-h-screen bg-background px-3 py-3 md:px-5 md:py-4">
      <div className="mx-auto w-full max-w-screen-2xl rounded-lg bg-background">
        <div className="mb-1 text-center md:mb-4">{brandLogo}</div>
        <div className="text-sm text-[#687182]">No approval data available.</div>
      </div>
    </div>
  );
};

export default PublicApprovalPage;

