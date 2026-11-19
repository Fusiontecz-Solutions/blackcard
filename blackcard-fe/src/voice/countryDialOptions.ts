import { normalizeE164 } from "@/voice/useAvochatoVoice";

export type CountryDialOption = {
  dial: string;
  label: string;
  flag: string;
};

const RAW: readonly CountryDialOption[] = [
  { dial: "+971", label: "United Arab Emirates", flag: "🇦🇪" },
  { dial: "+966", label: "Saudi Arabia", flag: "🇸🇦" },
  { dial: "+972", label: "Israel", flag: "🇮🇱" },
  { dial: "+852", label: "Hong Kong", flag: "🇭🇰" },
  { dial: "+353", label: "Ireland", flag: "🇮🇪" },
  { dial: "+351", label: "Portugal", flag: "🇵🇹" },
  { dial: "+358", label: "Finland", flag: "🇫🇮" },
  { dial: "+86", label: "China", flag: "🇨🇳" },
  { dial: "+81", label: "Japan", flag: "🇯🇵" },
  { dial: "+82", label: "South Korea", flag: "🇰🇷" },
  { dial: "+91", label: "India", flag: "🇮🇳" },
  { dial: "+61", label: "Australia", flag: "🇦🇺" },
  { dial: "+64", label: "New Zealand", flag: "🇳🇿" },
  { dial: "+65", label: "Singapore", flag: "🇸🇬" },
  { dial: "+60", label: "Malaysia", flag: "🇲🇾" },
  { dial: "+66", label: "Thailand", flag: "🇹🇭" },
  { dial: "+62", label: "Indonesia", flag: "🇮🇩" },
  { dial: "+63", label: "Philippines", flag: "🇵🇭" },
  { dial: "+55", label: "Brazil", flag: "🇧🇷" },
  { dial: "+52", label: "Mexico", flag: "🇲🇽" },
  { dial: "+27", label: "South Africa", flag: "🇿🇦" },
  { dial: "+20", label: "Egypt", flag: "🇪🇬" },
  { dial: "+90", label: "Turkey", flag: "🇹🇷" },
  { dial: "+7", label: "Russia / Kazakhstan", flag: "🇷🇺" },
  { dial: "+49", label: "Germany", flag: "🇩🇪" },
  { dial: "+33", label: "France", flag: "🇫🇷" },
  { dial: "+39", label: "Italy", flag: "🇮🇹" },
  { dial: "+34", label: "Spain", flag: "🇪🇸" },
  { dial: "+31", label: "Netherlands", flag: "🇳🇱" },
  { dial: "+41", label: "Switzerland", flag: "🇨🇭" },
  { dial: "+43", label: "Austria", flag: "🇦🇹" },
  { dial: "+48", label: "Poland", flag: "🇵🇱" },
  { dial: "+46", label: "Sweden", flag: "🇸🇪" },
  { dial: "+47", label: "Norway", flag: "🇳🇴" },
  { dial: "+45", label: "Denmark", flag: "🇩🇰" },
  { dial: "+44", label: "United Kingdom", flag: "🇬🇧" },
  { dial: "+1", label: "US / Canada", flag: "🇺🇸" },
];

const UNIQUE = (() => {
  const seen = new Set<string>();
  return RAW.filter((o) => {
    if (seen.has(o.dial)) return false;
    seen.add(o.dial);
    return true;
  });
})();

/** Longest dial first — used when parsing a full E.164 string. */
const PARSE_ORDER = [...UNIQUE].sort((a, b) => b.dial.length - a.dial.length);

/** Alphabetical — used in the country dropdown. */
const SELECT_ORDER = [...UNIQUE].sort((a, b) => a.label.localeCompare(b.label));

/** Longer dial codes first so parsing matches +971 before +9. */
export function getSortedCountryDialOptions(): CountryDialOption[] {
  return PARSE_ORDER;
}

export function getCountryDialOptionsForSelect(): CountryDialOption[] {
  return SELECT_ORDER;
}

export function defaultCountryDial(): string {
  return "+1";
}

/** Keep only digits, star, hash for the national portion. */
export function sanitizeNationalInput(raw: string): string {
  return String(raw ?? "").replace(/[^\d*#]/g, "");
}

export function parseDefaultIntoDialAndNational(defaultPhone: string): { dial: string; national: string } {
  const trimmed = String(defaultPhone ?? "").trim();
  if (!trimmed) {
    return { dial: defaultCountryDial(), national: "" };
  }

  if (trimmed.startsWith("+")) {
    const e164 = normalizeE164(trimmed);
    if (e164) {
      for (const opt of PARSE_ORDER) {
        if (e164.startsWith(opt.dial)) {
          const rest = e164.slice(opt.dial.length).replace(/[^\d*#]/g, "");
          return { dial: opt.dial, national: rest };
        }
      }
      const digits = e164.replace(/^\+/, "").replace(/\D/g, "");
      if (digits.startsWith("1") && digits.length >= 11) {
        return { dial: "+1", national: digits.slice(1) };
      }
      return { dial: defaultCountryDial(), national: digits };
    }
    return { dial: defaultCountryDial(), national: sanitizeNationalInput(trimmed) };
  }

  return { dial: defaultCountryDial(), national: sanitizeNationalInput(trimmed) };
}

export function composeDialAndNational(dial: string, national: string): string {
  const d = String(dial ?? "").trim() || defaultCountryDial();
  const n = sanitizeNationalInput(national);
  return `${d}${n}`;
}
