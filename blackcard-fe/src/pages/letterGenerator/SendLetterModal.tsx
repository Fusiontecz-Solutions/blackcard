import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApplicationDetailLoader } from "@/hooks/useApplicationDetailLoader";
import Letters from "@/pages/payment/Letters";
import { prefetchPaymentTemplates } from "@/pages/payment/paymentTemplateApi";
import type { Application } from "@/types/applicationTypes";
import { useEffect } from "react";
import { getApplicationBusinessDisplayName } from "@/lib/applicationBusinessDisplayName";
import { letterApplicationIdFromApp } from "@/pages/templates/types";

type SendLetterModalProps = {
  open: boolean;
  application: Application | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Compose and send Payoff / Zero Balance letters without leaving the list.
 */
export default function SendLetterModal({
  open,
  application,
  onOpenChange,
}: SendLetterModalProps) {
  const applicationId = open ? application?._id?.trim() || undefined : undefined;
  const { loading, data, error } = useApplicationDetailLoader(applicationId);

  useEffect(() => {
    if (open) prefetchPaymentTemplates();
  }, [open]);

  const ready = open && !loading && !!data && !error;
  const titleId =
    letterApplicationIdFromApp(application) || "Application";
  const businessName = application
    ? getApplicationBusinessDisplayName(application)
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[92vh] w-[min(96vw,1500px)] max-w-[1500px] flex-col gap-0 overflow-hidden p-0 sm:rounded-xl"
        showCloseButton
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left sm:px-6">
          <DialogTitle className="text-lg font-semibold">
            Send Letter — {titleId}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {businessName
              ? `${businessName}. Choose Payoff or Zero Balance and send.`
              : "Choose Payoff or Zero Balance and send."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Loading application…</span>
            </div>
          ) : null}

          {error && !loading ? (
            <p className="py-12 text-center text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          {ready ? <Letters /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
