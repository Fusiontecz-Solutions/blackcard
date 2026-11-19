import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { Loader2, MessageSquare, Phone } from "lucide-react";

import type { RootState } from "@/redux/store";
import { AvochatoCallSurface } from "@/components/voice/AvochatoCallSurface";
import {
  PaymentDealSmsWorkspace,
  type DealSmsContact,
} from "@/components/payment/PaymentDealSmsWorkspace";
import { normalizeE164 } from "@/voice/useAvochatoVoice";
import { formatUSPhoneNumber } from "@/utils/formatPhoneNumber";

type CommMode = "sms" | "calling";

function pickDefaultPhones(app: unknown): {
  ownerMobile: string;
  businessNumber: string;
  preferred: string;
} {
  const row = app as {
    client?: {
      owner?: { mobileNumber?: string };
      business?: { number?: string };
    };
  } | null;
  const ownerMobile = String(row?.client?.owner?.mobileNumber ?? "").trim();
  const businessNumber = String(row?.client?.business?.number ?? "").trim();
  const preferred = ownerMobile || businessNumber;
  return { ownerMobile, businessNumber, preferred };
}

function displayPhone(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return "";
  const e164 = normalizeE164(trimmed);
  if (e164) return e164;
  const formatted = formatUSPhoneNumber(trimmed);
  return formatted || trimmed;
}

export default function PaymentCommunicationTab() {
  const { loading, data: applicationData, error } = useSelector(
    (state: RootState) => state.applicationDetail,
  );

  const [mode, setMode] = useState<CommMode>("sms");

  const { ownerMobile, businessNumber, preferred } = useMemo(
    () => pickDefaultPhones(applicationData),
    [applicationData],
  );

  const matchPhones = useMemo(() => {
    const list: string[] = [];
    for (const raw of [ownerMobile, businessNumber]) {
      const n = normalizeE164(raw) || String(raw).trim();
      if (n) list.push(n);
    }
    return list;
  }, [ownerMobile, businessNumber]);

  const businessName = useMemo(() => {
    const app = applicationData as { client?: { business?: { name?: string } } } | null;
    return String(app?.client?.business?.name ?? "").trim();
  }, [applicationData]);

  const ownerLabel = useMemo(() => {
    const app = applicationData as {
      client?: { owner?: { firstName?: string; lastName?: string } };
    } | null;
    const o = app?.client?.owner;
    const name = `${o?.firstName ?? ""} ${o?.lastName ?? ""}`.trim();
    return name || "Owner";
  }, [applicationData]);

  const dealContacts = useMemo((): DealSmsContact[] => {
    const list: DealSmsContact[] = [];
    if (ownerMobile) {
      list.push({
        id: "owner",
        name: ownerLabel,
        phone: displayPhone(ownerMobile),
        subtitle: "On file · owner",
      });
    }
    if (businessNumber) {
      const name = businessName ? `${businessName} · business` : "Business";
      list.push({
        id: "business",
        name,
        phone: displayPhone(businessNumber),
        subtitle: "On file · business",
      });
    }
    return list;
  }, [ownerMobile, businessNumber, ownerLabel, businessName]);

  const defaultDisplay = preferred ? formatUSPhoneNumber(preferred) || displayPhone(preferred) : "";

  const avochatoSubdomain = String(import.meta.env.VITE_AVOCHATO_SUBDOMAIN ?? "").trim();

  if (loading && !applicationData) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        <span>Loading application…</span>
      </div>
    );
  }

  if (error && !applicationData) {
    return (
      <p className="py-8 text-center text-destructive" role="alert">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-border bg-muted/40 p-1 dark:border-white/10 dark:bg-white/[0.04]">
        <button
          type="button"
          onClick={() => setMode("sms")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-4 ${
            mode === "sms"
              ? "bg-[image:var(--brand-gradient)] text-white shadow-sm"
              : "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-white/[0.06]"
          }`}
        >
          <MessageSquare className="size-3.5 shrink-0 opacity-90" aria-hidden />
          SMS
        </button>
        <button
          type="button"
          onClick={() => setMode("calling")}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:px-4 ${
            mode === "calling"
              ? "bg-[image:var(--brand-gradient)] text-white shadow-sm"
              : "text-muted-foreground hover:bg-background hover:text-foreground dark:hover:bg-white/[0.06]"
          }`}
        >
          <Phone className="size-3.5 shrink-0 opacity-90" aria-hidden />
          Calling
        </button>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Communication
        </p>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Message people from this deal, see your inbox, or use Calling to place browser calls. Phone numbers
          on the application are listed under Chats when SMS inbox is not connected.
        </p>
      </div>

      {mode === "sms" && (
        <PaymentDealSmsWorkspace dealContacts={dealContacts} matchPhones={matchPhones} />
      )}

      {mode === "calling" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Calling
            </p>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Calling from this deal</h3>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Enter a number and place the call. The browser will ask to use your microphone. When this deal
              has a number on file, it is filled in for you.
            </p>
            {defaultDisplay ? (
              <p className="text-xs text-muted-foreground">
                Default: <span className="text-foreground/90">{defaultDisplay}</span>
              </p>
            ) : (
              <p className="text-xs text-amber-800 dark:text-amber-400/90">
                No phone on file for this deal — dial manually or paste a number.
              </p>
            )}
          </div>
          <AvochatoCallSurface
            defaultPhone={preferred}
            defaultSubdomain={avochatoSubdomain}
            isActive={mode === "calling"}
            embedded
          />
        </div>
      )}
    </div>
  );
}
