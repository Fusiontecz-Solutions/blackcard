"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import DecisionLogicExecutor from "@/components/client/decision-logic/decision-logic-executor";
import {
  generateDecisionLogicRequestCode,
  verifyDecisionLogicToken,
} from "@/redux/actions/decision-logic-actions";
import {
  readCachedDecisionLogicRequestCode,
  writeCachedDecisionLogicRequestCode,
} from "@/lib/decisionLogicSession";

type BootstrapState = {
  loading: boolean;
  error: string;
  businessOwnerId: number;
  bankAccountId: number;
  requestCode: string;
};

export default function DecisionLogicPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => String(searchParams.get("token") ?? "").trim(), [searchParams]);
  const [state, setState] = useState<BootstrapState>({
    loading: true,
    error: "",
    businessOwnerId: 0,
    bankAccountId: 0,
    requestCode: "",
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!token) {
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Missing Decision Logic token in the link.",
          }));
        }
        return;
      }

      if (!cancelled) {
        setState((prev) => ({ ...prev, loading: true, error: "" }));
      }

      const verified = await verifyDecisionLogicToken(token);
      if (cancelled) return;
      if ((verified as { error?: string })?.error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: String((verified as { error?: string }).error || "Token verification failed."),
        }));
        return;
      }

      const data = (verified as { data?: { businessOwnerId?: number; bankAccountId?: number } })?.data;
      const businessOwnerId = Number(data?.businessOwnerId ?? 0);
      const bankAccountId = Number(data?.bankAccountId ?? 0);
      if (!Number.isFinite(businessOwnerId) || !Number.isFinite(bankAccountId) || businessOwnerId <= 0 || bankAccountId <= 0) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Token payload is invalid. Please request a new Decision Logic link.",
        }));
        return;
      }

      const cachedRequestCode = readCachedDecisionLogicRequestCode(token);
      if (cachedRequestCode) {
        setState({
          loading: false,
          error: "",
          businessOwnerId,
          bankAccountId,
          requestCode: cachedRequestCode,
        });
        return;
      }

      const requestCodeRes = await generateDecisionLogicRequestCode(
        businessOwnerId,
        bankAccountId,
      );
      if (cancelled) return;
      if ((requestCodeRes as { error?: string })?.error) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: String((requestCodeRes as { error?: string }).error || "Failed to generate request code."),
        }));
        return;
      }

      const requestCode = String((requestCodeRes as { requestCode?: string })?.requestCode ?? "").trim();
      if (!requestCode) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: "Request code was not returned by the server.",
        }));
        return;
      }

      writeCachedDecisionLogicRequestCode(token, requestCode);

      setState({
        loading: false,
        error: "",
        businessOwnerId,
        bankAccountId,
        requestCode,
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-sm text-slate-600">
        Preparing Decision Logic verification...
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-red-200 bg-red-50 p-4">
          <h1 className="text-base font-semibold text-red-700">Unable to open Decision Logic</h1>
          <p className="mt-2 text-sm text-red-700">{state.error}</p>
        </div>
      </div>
    );
  }

  return (
    <DecisionLogicExecutor
      requestCode={state.requestCode}
      businessOwnerId={state.businessOwnerId}
      bankAccountId={state.bankAccountId}
      invitationToken={token}
    />
  );
}
