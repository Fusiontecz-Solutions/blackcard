import { useState } from "react";
import { Phone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAvochatoVoice } from "@/voice/useAvochatoVoice";
import { AvochatoCallSurface } from "@/components/voice/AvochatoCallSurface";

type AvochatoCallDialogProps = {
  /** Optional default phone (e.g. merchant phone from a row). */
  defaultPhone?: string;
  /** Avochato inbox subdomain when not using server default env. */
  defaultSubdomain?: string;
};

export function AvochatoCallDialog({ defaultPhone = "", defaultSubdomain = "" }: AvochatoCallDialogProps) {
  const [open, setOpen] = useState(false);
  const voice = useAvochatoVoice();
  const disabledTrigger = voice.configured === false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="group gap-2 shrink-0 border-[var(--brand)]/25 bg-gradient-to-b from-background to-muted/30 shadow-sm transition-all hover:border-[var(--brand)]/45 hover:shadow-[0_0_20px_-6px_rgba(39,109,156,0.4)] dark:border-[var(--brand)]/30 dark:from-white/[0.05] dark:to-transparent dark:hover:shadow-[0_0_24px_-4px_rgba(39,109,156,0.45)]"
          disabled={disabledTrigger}
          title={
            disabledTrigger
              ? "Set AVOCHATO_AUTH_ID and AVOCHATO_AUTH_SECRET on the API server"
              : "Call via Avochato"
          }
        >
          <Phone className="size-4 text-[var(--brand)] transition-transform group-hover:scale-110 dark:text-[#C07BE0]" aria-hidden />
          Avochato call
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-lg border-border/60 bg-card/95 shadow-2xl shadow-black/20 ring-1 ring-[var(--brand)]/10 backdrop-blur-xl dark:border-white/10 dark:bg-[#0a0f14]/95 dark:shadow-black/50 dark:ring-[var(--brand)]/20"
        aria-describedby="avochato-call-desc"
      >
        <DialogHeader className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--brand)] dark:text-[#C07BE0]">
            Voice link
          </p>
          <DialogTitle className="text-xl tracking-tight">Secure Avochato call</DialogTitle>
          <DialogDescription id="avochato-call-desc" className="text-sm leading-relaxed">
            Dial or paste a number, then place the call. The browser requests microphone access, then connects via
            Twilio with a token from Avochato. Use HTTPS in production (localhost is fine for development).
          </DialogDescription>
        </DialogHeader>
        <AvochatoCallSurface
          defaultPhone={defaultPhone}
          defaultSubdomain={defaultSubdomain}
          isActive={open}
          embedded
        />
      </DialogContent>
    </Dialog>
  );
}
