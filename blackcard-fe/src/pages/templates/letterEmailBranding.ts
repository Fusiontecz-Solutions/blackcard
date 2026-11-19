import { APP_COMPANY_NAME, isPlatformBrandName } from "@/constants/appBranding";
import { findFunderProfileById } from "@/hooks/useFunderProfiles";
import type { FunderProfile } from "@/types/integrationSettingsTypes";
import {
  APPLICATION_APPROVAL_EMAIL_LOGO_SRC,
  APPLICATION_APPROVAL_EMAIL_WATERMARK_SRC,
} from "./applicationApprovalEmailShared";

export type LetterEmailBranding = {
  companyName: string;
  logoSrc: string;
  watermarkSrc: string;
  /** Lighter two-tone accent strip (Black Card default: mid navy). */
  accentStripLight: string;
  /** Darker two-tone accent strip (Black Card default: logo navy). */
  accentStripDark: string;
  /** Background for branded info-table icon column. */
  infoTableIconBg: string;
};

/** Black Card — default letter email branding. */
export const DEFAULT_LETTER_EMAIL_BRANDING: LetterEmailBranding = {
  companyName: APP_COMPANY_NAME,
  logoSrc: APPLICATION_APPROVAL_EMAIL_LOGO_SRC,
  watermarkSrc: APPLICATION_APPROVAL_EMAIL_WATERMARK_SRC,
  accentStripLight: "#3d6fa0",
  accentStripDark: "#002147",
  infoTableIconBg: "#002147",
};

/**
 * Paste Cloudinary / hosted logo URLs + colors for each funder below.
 * Matching uses funder name / displayName (not organization).
 * Prefer Letter Info fields on the funder profile when set.
 */
const FB_FUNDING_LETTER_EMAIL_BRANDING: LetterEmailBranding = {
  companyName: "FB FUNDING LLC",
  logoSrc: "https://res.cloudinary.com/dehrku8og/image/upload/v1784056760/ChatGPT_Image_Jul_15_2026_12_49_02_AM_ldveap.png",
  watermarkSrc: "",
  accentStripLight: "#64748b",
  accentStripDark: "#0f172a",
  infoTableIconBg: "#0f172a",
};

const HEWLETT_ADVANCE_LETTER_EMAIL_BRANDING: LetterEmailBranding = {
  companyName: "HEWLETT ADVANCE LLC",
  logoSrc:
    "https://res.cloudinary.com/dehrku8og/image/upload/v1784054493/ChatGPT_Image_Jul_15_2026_12_09_17_AM_wnjjkm.png",
  watermarkSrc: "",
  accentStripLight: "#031707",
  accentStripDark: "#A9CD86",
  infoTableIconBg: "#9BBF85",
};

const TILDE_ADVANCE_LETTER_EMAIL_BRANDING: LetterEmailBranding = {
  companyName: "TILDE ADVANCE",
  logoSrc: "https://res.cloudinary.com/dehrku8og/image/upload/v1784054593/ChatGPT_Image_Jul_15_2026_12_12_46_AM_bkrtfo.png",
  watermarkSrc:"",
  accentStripLight: "#a1a1aa",
  accentStripDark: "#27272a",
  infoTableIconBg: "#27272a",
};

const ATLAS_ADVANCE_LETTER_EMAIL_BRANDING: LetterEmailBranding = {
  companyName: "ATLAS ADVANCE LLC",
  logoSrc: "https://res.cloudinary.com/dehrku8og/image/upload/v1784141929/ChatGPT_Image_Jul_15_2026_07_03_58_PM_lvvg6y.png",
  watermarkSrc: "",
  accentStripLight: "#15599F",
  accentStripDark: "#6FB8F5",
  infoTableIconBg: "#15599F",
};

const EJM_VENTURES_LETTER_EMAIL_BRANDING: LetterEmailBranding = {
  companyName: "EJM VENTURES LLC",
  logoSrc: "https://res.cloudinary.com/dehrku8og/image/upload/v1784122585/ChatGPT_Image_Jul_15_2026_07_06_14_PM_oe4oo8.png",
  watermarkSrc: "",
  accentStripLight: "#3CAEE0",
  accentStripDark: "#FCAB12",
  infoTableIconBg: "#3CAEE0",
};

type FunderNameFields = Pick<FunderProfile, "name" | "displayName">;

type FunderLetterFields = Pick<
  FunderProfile,
  | "name"
  | "displayName"
  | "organization"
  | "legalName"
  | "mainContractLayoutKey"
  | "letterCompanyName"
  | "letterLogoUrl"
  | "letterWatermarkUrl"
  | "letterAccentStripLight"
  | "letterAccentStripDark"
  | "letterInfoTableIconBg"
>;

function normalizeFunderToken(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Prefer name / displayName only so organization≠Woodmere does not steal branding. */
function funderNameTokens(funder: FunderNameFields): string[] {
  return [funder.name, funder.displayName].map(normalizeFunderToken).filter(Boolean);
}

function nameMatches(funder: FunderNameFields, needles: string[]): boolean {
  const tokens = funderNameTokens(funder);
  return needles.some((needle) =>
    tokens.some((token) => token === needle || token.includes(needle)),
  );
}

function isPlatformLetterFunder(funder: FunderNameFields): boolean {
  return (
    nameMatches(funder, ["woodmere financial", "woodmere", "black card", "black card llc", "blackcard", "black rok", "black rok llc", "blackrock"]) ||
    isPlatformBrandName(funder.name) ||
    isPlatformBrandName(funder.displayName)
  );
}

function isFbFundingFunder(funder: FunderNameFields): boolean {
  return nameMatches(funder, ["fb funding llc", "fb funding"]);
}

function isHewlettAdvanceFunder(funder: FunderNameFields): boolean {
  return nameMatches(funder, ["hewlett advance llc", "hewlett advance"]);
}

function isTildeAdvanceFunder(funder: FunderNameFields): boolean {
  return nameMatches(funder, ["tilde advance"]);
}

function isAtlasAdvanceFunder(funder: FunderNameFields): boolean {
  return nameMatches(funder, ["atlas advance llc", "atlas advance"]);
}

function isEjmVenturesFunder(funder: FunderNameFields): boolean {
  return nameMatches(funder, ["ejm ventures llc", "ejm ventures"]);
}

function hasSavedLetterInfo(
  funder: Pick<
    FunderProfile,
    | "letterCompanyName"
    | "letterLogoUrl"
    | "letterWatermarkUrl"
    | "letterAccentStripLight"
    | "letterAccentStripDark"
    | "letterInfoTableIconBg"
  >,
): boolean {
  return Boolean(
    String(funder.letterCompanyName ?? "").trim() ||
      String(funder.letterLogoUrl ?? "").trim() ||
      String(funder.letterWatermarkUrl ?? "").trim() ||
      String(funder.letterAccentStripLight ?? "").trim() ||
      String(funder.letterAccentStripDark ?? "").trim() ||
      String(funder.letterInfoTableIconBg ?? "").trim(),
  );
}

function brandingFromSavedLetterInfo(
  funder: FunderLetterFields,
  fallback: LetterEmailBranding,
): LetterEmailBranding {
  return {
    companyName:
      String(funder.letterCompanyName ?? "").trim() ||
      fallback.companyName ||
      String(funder.displayName || funder.name || APP_COMPANY_NAME).trim() ||
      APP_COMPANY_NAME,
    logoSrc: String(funder.letterLogoUrl ?? "").trim() || fallback.logoSrc,
    watermarkSrc:
      String(funder.letterWatermarkUrl ?? "").trim() || fallback.watermarkSrc,
    accentStripLight:
      String(funder.letterAccentStripLight ?? "").trim() ||
      fallback.accentStripLight,
    accentStripDark:
      String(funder.letterAccentStripDark ?? "").trim() || fallback.accentStripDark,
    infoTableIconBg:
      String(funder.letterInfoTableIconBg ?? "").trim() ||
      fallback.infoTableIconBg,
  };
}

function resolveLegacyLetterEmailBranding(
  funder: FunderNameFields &
    Pick<FunderProfile, "organization" | "legalName" | "mainContractLayoutKey">,
): LetterEmailBranding {
  if (isFbFundingFunder(funder)) return FB_FUNDING_LETTER_EMAIL_BRANDING;
  if (isHewlettAdvanceFunder(funder)) return HEWLETT_ADVANCE_LETTER_EMAIL_BRANDING;
  if (isTildeAdvanceFunder(funder)) return TILDE_ADVANCE_LETTER_EMAIL_BRANDING;
  if (isAtlasAdvanceFunder(funder)) return ATLAS_ADVANCE_LETTER_EMAIL_BRANDING;
  if (isEjmVenturesFunder(funder)) return EJM_VENTURES_LETTER_EMAIL_BRANDING;
  if (isPlatformLetterFunder(funder)) return DEFAULT_LETTER_EMAIL_BRANDING;

  const companyName =
    String(funder.displayName || funder.name || APP_COMPANY_NAME).trim() ||
    APP_COMPANY_NAME;
  return {
    ...DEFAULT_LETTER_EMAIL_BRANDING,
    companyName,
  };
}

/** Resolve logo, watermark, and accent colors for payoff / zero-balance letter emails. */
export function resolveLetterEmailBranding(
  funder?: FunderLetterFields | null,
): LetterEmailBranding {
  if (!funder) return DEFAULT_LETTER_EMAIL_BRANDING;

  const legacy = resolveLegacyLetterEmailBranding(funder);
  if (hasSavedLetterInfo(funder)) {
    return brandingFromSavedLetterInfo(funder, legacy);
  }
  return legacy;
}

export function resolveLetterEmailBrandingByFunderId(
  funders: FunderProfile[],
  funderProfileId?: string | null,
): LetterEmailBranding {
  return resolveLetterEmailBranding(
    findFunderProfileById(funders, funderProfileId),
  );
}
