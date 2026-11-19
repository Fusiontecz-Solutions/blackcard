import { useEffect, useId, useMemo, useState } from "react";
import { Delete, Phone, PhoneOff, Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhoneDialPad } from "@/components/voice/PhoneDialPad";
import { useAvochatoVoice, normalizeE164 } from "@/voice/useAvochatoVoice";
import {
  composeDialAndNational,
  getCountryDialOptionsForSelect,
  parseDefaultIntoDialAndNational,
  sanitizeNationalInput,
} from "@/voice/countryDialOptions";
import { cn } from "@/lib/utils";

export type AvochatoCallSurfaceProps = {
  defaultPhone?: string;
  /** Optional inbox subdomain (e.g. from parent); not shown — server `AVOCHATO_SUBDOMAIN` is used when empty. */
  defaultSubdomain?: string;
  /** When false (e.g. dialog closed), hang up and destroy the Twilio device. */
  isActive?: boolean;
  /** Hide title/description — use when the parent section already has a heading. */
  embedded?: boolean;
};

export function AvochatoCallSurface({
  defaultPhone = "",
  defaultSubdomain = "",
  isActive = true,
  embedded = false,
}: AvochatoCallSurfaceProps) {
  const [countryDial, setCountryDial] = useState(() => parseDefaultIntoDialAndNational(defaultPhone).dial);
  const [national, setNational] = useState(() => parseDefaultIntoDialAndNational(defaultPhone).national);
  const voice = useAvochatoVoice();
  const phoneId = useId();
  const subdomainForCall = defaultSubdomain.trim() || undefined;
  const countryOptions = useMemo(() => getCountryDialOptionsForSelect(), []);

  useEffect(() => {
    if (isActive) {
      const parsed = parseDefaultIntoDialAndNational(defaultPhone);
      setCountryDial(parsed.dial);
      setNational(parsed.national);
      voice.setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when defaults / active gate change
  }, [isActive, defaultPhone, voice.setError]);

  useEffect(() => {
    if (!isActive) {
      const parsed = parseDefaultIntoDialAndNational(defaultPhone);
      setCountryDial(parsed.dial);
      setNational(parsed.national);
    }
  }, [defaultPhone, isActive]);

  useEffect(() => {
    if (!isActive) {
      voice.hangUp();
      voice.destroy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, voice.hangUp, voice.destroy]);

  useEffect(() => {
    return () => {
      voice.hangUp();
      voice.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.hangUp, voice.destroy]);

  const busy = voice.status === "registering";
  const inCall = voice.status === "in_call";
  const configured = voice.configured;
  const disabledPad = inCall || busy;

  const appendDigit = (d: string) => {
    if (disabledPad) return;
    setNational((p) => sanitizeNationalInput(p + d));
  };

  const backspace = () => {
    if (disabledPad) return;
    setNational((p) => p.slice(0, -1));
  };

  const onCall = () => {
    voice.setError(null);
    const raw = composeDialAndNational(countryDial, national);
    const to = normalizeE164(raw);
    if (!to) {
      voice.setError("Enter a valid phone number (E.164 or 10-digit US).");
      return;
    }
    if (!window.isSecureContext) {
      voice.setError(
        `Microphone needs a secure context. You are on ${window.location.origin}. Use https:// or open the app at http://localhost (not a raw LAN IP over http).`,
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      voice.setError("This browser does not support microphone access (mediaDevices.getUserMedia).");
      return;
    }
    const microphonePromise = navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    void voice.startCall(raw, {
      subdomain: subdomainForCall,
      microphonePromise,
    });
  };

  const hasNationalDigits = /\d/.test(sanitizeNationalInput(national));
  const disabledCall = configured === false || busy || !hasNationalDigits;

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border bg-card shadow-md",
        "border-border/60 dark:border-white/[0.08]",
        inCall &&
          "border-emerald-500/40 shadow-[0_0_32px_-10px_rgba(16,185,129,0.35)] dark:border-emerald-500/30",
      )}
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full bg-[var(--brand)]/15 blur-3xl dark:bg-[var(--brand)]/25"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-16 size-48 rounded-full bg-cyan-500/10 blur-3xl dark:bg-cyan-400/15"
        aria-hidden
      />

      <div className="relative flex flex-col gap-5 p-5 sm:gap-6 sm:p-6">
        {!embedded ? (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--brand)] dark:text-[#C07BE0]">
              Voice link
            </p>
            <h3 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Secure Avochato call</h3>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Dial or paste a number, then connect. Audio runs over Twilio with a short-lived token — use HTTPS in
              production (localhost allowed for development).
            </p>
          </div>
        ) : null}

        {configured === false ? (
          <p className="rounded-xl border border-amber-200/80 bg-[#fff7e6] px-4 py-3 text-sm leading-relaxed text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
            Voice calling is not set up for your organization yet. Ask your administrator to enable it if you
            need calls from the browser.
          </p>
        ) : null}

        <div className="mx-auto w-full max-w-[280px] space-y-2">
          <label
            htmlFor={phoneId}
            className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
          >
            Destination
          </label>
          <div className="flex items-stretch gap-2">
            <Select value={countryDial} onValueChange={setCountryDial} disabled={disabledPad}>
              <SelectTrigger
                size="default"
                aria-label="Country calling code"
                className={cn(
                  "!h-14 min-h-14 max-h-14 w-[5.25rem] shrink-0 self-stretch rounded-xl border-border/60 bg-muted/20 px-2 font-mono text-xs shadow-inner",
                  "flex items-center justify-center gap-1 py-0",
                  "focus-visible:border-[var(--brand)]/50 focus-visible:ring-[var(--brand)]/25",
                  "dark:border-white/[0.07] dark:bg-white/[0.04] dark:focus-visible:border-[#C07BE0]/40",
                  "[&_svg]:size-3.5",
                )}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64" position="popper" sideOffset={4}>
                {countryOptions.map((opt) => (
                  <SelectItem
                    key={opt.dial}
                    value={opt.dial}
                    title={`${opt.label} (${opt.dial})`}
                    className="cursor-pointer py-2 text-xs"
                  >
                    <span aria-hidden>{opt.flag}</span>
                    <span className="ml-1 font-mono">{opt.dial}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              id={phoneId}
              placeholder="415 555 2671"
              value={national}
              onChange={(e) => setNational(sanitizeNationalInput(e.target.value))}
              disabled={disabledPad}
              autoComplete="tel-national"
              inputMode="tel"
              className={cn(
                "!h-14 min-h-14 max-h-14 min-w-0 flex-1 self-stretch rounded-xl border-border/60 bg-muted/20 font-mono text-base tracking-wide shadow-inner",
                "placeholder:text-muted-foreground/50",
                "focus-visible:border-[var(--brand)]/50 focus-visible:ring-[var(--brand)]/25",
                "dark:border-white/[0.07] dark:bg-white/[0.04] dark:focus-visible:border-[#C07BE0]/40",
              )}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabledPad || national.length === 0}
              onClick={() => backspace()}
              className={cn(
                "h-14 min-h-14 w-12 shrink-0 self-stretch rounded-xl border-border/60 bg-muted/20 shadow-inner",
                "hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive",
                "disabled:pointer-events-none disabled:opacity-35",
                "dark:border-white/[0.07] dark:bg-white/[0.04]",
              )}
              aria-label="Clear last digit"
              title="Clear last digit"
            >
              <Delete className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="flex justify-center pt-1">
          <PhoneDialPad onDigit={appendDigit} disabled={disabledPad} />
        </div>

        {voice.error ? (
          <p
            className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-center text-sm text-destructive backdrop-blur-sm"
            role="alert"
          >
            {voice.error}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-border/40 pt-5 dark:border-white/[0.06]">
          {inCall ? (
            <div className="flex w-full flex-wrap justify-center gap-3">
              <Button
                type="button"
                variant="secondary"
                className={cn(
                  "min-h-12 min-w-[8.5rem] flex-1 rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm sm:flex-initial",
                  "hover:bg-muted/60 dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]",
                )}
                onClick={() => voice.toggleMute()}
                disabled={busy}
              >
                {voice.isMuted ? (
                  <>
                    <MicOff className="size-4" aria-hidden /> Unmute
                  </>
                ) : (
                  <>
                    <Mic className="size-4" aria-hidden /> Mute
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-12 min-w-[8.5rem] flex-1 rounded-xl shadow-lg shadow-destructive/20 sm:flex-initial"
                onClick={() => voice.hangUp()}
                disabled={busy}
              >
                <PhoneOff className="size-4" aria-hidden />
                End call
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="lg"
              className={cn(
                "relative h-14 w-full overflow-hidden rounded-xl border-0 font-semibold tracking-wide shadow-lg",
                "bg-gradient-to-r from-[#1a4d6e] via-[var(--brand)] to-[#2f7fb8] text-white",
                "shadow-[var(--brand)]/30 transition-all duration-300",
                "hover:from-[#215a84] hover:via-[#2d7ab8] hover:to-[#3d8ec9] hover:shadow-xl hover:shadow-[var(--brand)]/35",
                "disabled:from-muted disabled:via-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none",
                "mx-auto w-full max-w-[280px]",
                "before:pointer-events-none before:absolute before:inset-0 before:bg-gradient-to-t before:from-transparent before:to-white/15",
              )}
              onClick={onCall}
              disabled={disabledCall}
            >
              {busy ? (
                <>
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Connecting…
                </>
              ) : (
                <>
                  <Phone className="size-5" aria-hidden />
                  Place call
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
